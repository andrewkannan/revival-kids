'use server';

import prisma from '@/lib/prisma';
import { acquireTicketLock, releaseTicketLock, getActiveLocksCount } from '@/lib/ticket-lock';
import { OutreachLocation, RegistrationStatus } from '@prisma/client';
import { getEmailTemplate } from './admin';
import { sendEmail, parseTemplate } from '@/lib/email';

export async function checkCapacity(requestedKids: number) {
  try {
    const totalRequested = requestedKids;
    
    // 1. Get Admin Config for capacities
    const adminConfig = await prisma.adminConfig.findUnique({ where: { id: 1 } });
    const kidsCapacity = adminConfig?.kidsCapacity || 100; // default 100

    // 2. Get tickets already stored in Postgres (SEAT_SECURED or PENDING)

    const dbKidsTicketsCount = await prisma.ticket.count({
      where: {
        ticketType: 'KIDS',
        registration: {
          status: {
            in: ['SEAT_SECURED', 'PENDING_FOR_PAYMENT', 'PENDING_FOR_REVIEW']
          }
        }
      }
    });

    // 3. Get currently active Redis locks
    const locks = await getActiveLocksCount();

    const availableKids = kidsCapacity - dbKidsTicketsCount - locks.activeKids;

    return {
      success: availableKids >= requestedKids,
      available: availableKids,
    };
  } catch (error) {
    console.error('Error checking capacity:', error);
    return { success: false, available: 0, error: 'Failed to check capacity' };
  }
}

export async function lockTicketsAction(sessionId: string, kids: number) {
  try {
    // Check capacity one more time just before locking
    const capCheck = await checkCapacity(kids);
    if (!capCheck.success) {
      return { success: false, message: 'Not enough tickets available.' };
    }
    
    const locked = await acquireTicketLock(sessionId, kids);
    if (locked) {
      return { success: true };
    } else {
      return { success: false, message: 'Failed to acquire lock. Session already locked?' };
    }
  } catch (error) {
    console.error('Error locking tickets:', error);
    return { success: false, message: 'System error' };
  }
}

export async function releaseLockAction(sessionId: string) {
  try {
    await releaseTicketLock(sessionId);
    return { success: true };
  } catch (error) {
    return { success: false };
  }
}

export async function getPricing() {
  const adminConfig = await prisma.adminConfig.findUnique({ where: { id: 1 } });
  
  // Check if early bird is active and not expired
  let isEarlyBird = adminConfig?.isEarlyBird ?? true;
  
  if (isEarlyBird && adminConfig?.earlyBirdEndDate) {
    const now = new Date();
    if (now > adminConfig.earlyBirdEndDate) {
      isEarlyBird = false; // Expired!
    }
  }
  
  return {
    isEarlyBird,
    kidsPrice: isEarlyBird 
      ? Number(adminConfig?.kidsPriceEarlyBird || 25) 
      : Number(adminConfig?.kidsPriceRegular || 35),
    kidsPriceOriginal: Number(adminConfig?.kidsPriceRegular || 35),
  };
}

interface RegistrationData {
  name: string;
  email: string;
  phone: string;
  outreach: OutreachLocation;
  kidsTickets: number;
  kidsData: { name: string; age: number }[];
}

export async function finalizeRegistration(data: RegistrationData, sessionId: string) {
  try {
    // Start transaction
    const pricing = await getPricing();
    const actualKidsCount = data.kidsData.length;
    const totalAmount = (actualKidsCount * pricing.kidsPrice);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Find or create Attendee
      let attendee = await tx.attendee.findUnique({
        where: { email: data.email }
      });
      
      if (!attendee) {
        attendee = await tx.attendee.create({
          data: {
            name: data.name,
            email: data.email,
            phone: data.phone,
            outreach: data.outreach,
          }
        });
      } else {
        // update phone or name just in case
        attendee = await tx.attendee.update({
          where: { email: data.email },
          data: { name: data.name, phone: data.phone, outreach: data.outreach }
        });
      }

      // 2. Create Registration and Kids
      const registration = await tx.registration.create({
        data: {
          attendeeId: attendee.id,
          kidsTickets: actualKidsCount,
          totalAmount: totalAmount,
          status: 'PENDING_FOR_PAYMENT',
          payLater: true,
          kids: {
            create: data.kidsData.map(kid => ({
              name: kid.name,
              age: kid.age
            }))
          }
        }
      });

      // 3. Create Tickets
      const ticketsData = [];
      for(let i=0; i<actualKidsCount; i++) {
        ticketsData.push({ registrationId: registration.id, ticketType: 'KIDS' as const });
      }

      if (ticketsData.length > 0) {
        await tx.ticket.createMany({ data: ticketsData });
      }

      return registration;
    });

    // Release Redis lock
    await releaseTicketLock(sessionId);

    // No longer sending invoice here. Wait for receipt upload.

    return { success: true, registrationId: result.id };
  } catch (error) {
    console.error('Error finalizing registration:', error);
    // release lock if failed? It will auto-expire anyway, but we can do it explicitly
    await releaseTicketLock(sessionId);
    return { success: false, message: 'Database transaction failed.' };
  }
}

export async function uploadReceipt(registrationId: string, formData: FormData) {
  try {
    const base64String = formData.get('receiptBase64') as string | null;
    if (!base64String) {
      return { success: false, message: 'No receipt uploaded.' };
    }

    const registration = await prisma.registration.update({
      where: { id: registrationId },
      data: {
        receiptUrl: base64String,
        status: 'PENDING_FOR_REVIEW',
      },
      include: { attendee: true }
    });

    // Send Invoice/Receipt Email after they upload proof
    try {
      const template = await getEmailTemplate('INVOICE');
      const formattedOrderNumber = 'R' + String(registration.orderNumber).padStart(5, '0');
      const parsedHtml = parseTemplate(template.bodyHtml, {
        name: registration.attendee.name,
        orderNumber: formattedOrderNumber,
        totalAmount: registration.totalAmount.toString()
      });
      
      await prisma.emailQueue.create({
        data: {
          to: registration.attendee.email,
          subject: template.subject,
          bodyHtml: parsedHtml,
          registrationId: registration.id,
          status: 'PENDING'
        }
      });
    } catch (emailError) {
      console.error('Error with invoice email logic:', emailError);
    }

    return { success: true };
  } catch (error) {
    console.error('Error uploading receipt:', error);
    return { success: false, message: 'Failed to upload receipt. Please try again.' };
  }
}
