'use server';

import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { RegistrationStatus, OutreachLocation, TemplateType } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { sendPaymentRejectedEmail, sendEmail, parseTemplate } from '@/lib/email';
import { processQueueInBackground } from '@/lib/email-queue';
import QRCode from 'qrcode';

const ADMIN_COOKIE_NAME = 'revival_admin_session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 1 week

export async function loginAdmin(password: string) {
  const secret = process.env.ADMIN_SECRET;
  
  if (!secret) {
    console.warn("ADMIN_SECRET is not set in environment variables.");
    if (password === 'admin') {
      await (await cookies()).set(ADMIN_COOKIE_NAME, 'authenticated', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: COOKIE_MAX_AGE,
        path: '/',
      });
      return { success: true };
    }
    return { success: false, message: 'Invalid password.' };
  }

  if (password === secret) {
    await (await cookies()).set(ADMIN_COOKIE_NAME, 'authenticated', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: COOKIE_MAX_AGE,
      path: '/',
    });
    return { success: true };
  }

  return { success: false, message: 'Invalid password.' };
}

export async function logoutAdmin() {
  await (await cookies()).delete(ADMIN_COOKIE_NAME);
  return { success: true };
}

export async function getAdminConfig() {
  let config = await prisma.adminConfig.findUnique({
    where: { id: 1 }
  });

  if (!config) {
    // Create default config if it doesn't exist
    config = await prisma.adminConfig.create({
      data: {
        id: 1,
        kidsCapacity: 100,
        isEarlyBird: true,
        kidsPriceEarlyBird: 25,
        kidsPriceRegular: 40,
      }
    });
  }

  return config;
}

export async function updateAdminConfig(data: {
  kidsCapacity: number;
  isEarlyBird: boolean;
  kidsPriceEarlyBird: number;
  kidsPriceRegular: number;
  earlyBirdEndDate?: Date | null;
  isEmailQueuePaused?: boolean;
}) {
  try {
    await prisma.adminConfig.upsert({
      where: { id: 1 },
      update: data,
      create: {
        id: 1,
        ...data
      }
    });
    
    revalidatePath('/admin/settings');
    revalidatePath('/'); // revalidate the home page to update prices/availability
    
    return { success: true };
  } catch (e) {
    console.error("Failed to update admin config", e);
    return { success: false, message: "Failed to save configuration." };
  }
}

export async function updateRegistrationStatus(id: string, status: RegistrationStatus) {
  try {
    const registration = await prisma.registration.update({
      where: { id },
      data: { status },
      include: { attendee: true, tickets: true, kids: true }
    });
    
    if (status === 'PAYMENT_REJECTED') {
      // Fire and forget email
      sendPaymentRejectedEmail(registration.attendee.email, registration.attendee.name).catch(e => console.error("Async email error:", e));
    } else if (status === 'SEAT_SECURED') {
      // Generate Master QR code for the registration
      let qrCodeUrl = registration.qrCodeUrl;
      if (!qrCodeUrl) {
        qrCodeUrl = await QRCode.toDataURL(registration.id);
        await prisma.registration.update({
          where: { id: registration.id },
          data: { qrCodeUrl }
        });
      }

      // Send E-Ticket email
      const template = await getEmailTemplate('E_TICKET');
      const formattedOrderNumber = 'R' + String(registration.orderNumber).padStart(5, '0');
      const parsedHtml = parseTemplate(template.bodyHtml, {
        name: registration.attendee.name,
        orderNumber: formattedOrderNumber
      });

      const attachments = [{
        filename: `revival-ticket-${formattedOrderNumber}.png`,
        content: qrCodeUrl.split("base64,")[1],
        encoding: 'base64',
        cid: `ticket_master`
      }];

      const totalTickets = registration.kidsTickets;

      // Boarding Pass Style HTML
      let finalHtml = parsedHtml;
      if (!finalHtml.includes('ticket_master')) {
        const kidsListHtml = registration.kids && registration.kids.length > 0
          ? `<div style="margin-bottom: 12px; display: flex; flex-direction: column; gap: 4px;">` + 
            registration.kids.map(kid => `<span style="font-family: 'Arial Black', Impact, sans-serif; font-size: 24px; color: #ff203a; text-transform: uppercase; letter-spacing: 1px; font-weight: 900;">${kid.name}</span>`).join('') +
            `</div>`
          : '';

        const passHtml = `
          <div style="max-width: 400px; margin: 20px auto; border-radius: 20px; overflow: hidden; font-family: sans-serif; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05); background: white;">
            
            <!-- Header Section -->
            <div style="background-color: #ff203a; position: relative; padding: 25px 20px; text-align: center; color: white; overflow: hidden;">
              <!-- Simulated Blobs -->
              <div style="position: absolute; top: -20px; left: -20px; width: 100px; height: 100px; background-color: #5ced73; border-radius: 50%; opacity: 0.9;"></div>
              <div style="position: absolute; bottom: -30px; right: -20px; width: 120px; height: 120px; background-color: #ffcb05; border-radius: 50%; opacity: 0.9;"></div>
              <div style="position: absolute; top: 50%; left: -30px; width: 80px; height: 80px; background-color: #0f75ff; border-radius: 50%; opacity: 0.9; transform: translateY(-50%);"></div>
              
              <div style="position: relative; z-index: 10; text-shadow: 2px 2px 0px rgba(0,0,0,0.15);">
                <p style="margin: 0 0 4px; font-weight: bold; font-size: 12px; letter-spacing: 2px; text-transform: uppercase;">ACTS 2:17-18</p>
                <h2 style="margin: 0; font-family: 'Arial Black', Impact, sans-serif; font-size: 36px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase;">REVIVAL KIDS</h2>
                <h3 style="margin: 0; font-family: 'Arial Black', Impact, sans-serif; font-size: 20px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase;">CONFERENCE</h3>
                <div style="display: inline-block; background: white; color: #ff203a; font-weight: 900; font-size: 14px; padding: 4px 16px; border-radius: 12px; margin-top: 12px; text-shadow: none;">
                  2026
                </div>
              </div>
            </div>

            <!-- QR Code Section -->
            <div style="padding: 30px 20px; background-color: white; text-align: center; border-bottom: 3px dashed rgba(255, 32, 58, 0.3);">
              <div style="display: inline-block; padding: 10px; border: 4px solid rgba(255, 32, 58, 0.2); border-radius: 20px; background: white;">
                <img src="cid:ticket_master" alt="QR Code" style="width: 200px; height: 200px; display: block; border-radius: 12px;" />
              </div>
            </div>

            <!-- Footer Section -->
            <div style="background-color: #f8fafc; padding: 25px 20px; text-align: center;">
              ${kidsListHtml}
              <div style="display: inline-block; background: black; color: white; padding: 4px 16px; border-radius: 4px; margin-bottom: 12px;">
                <p style="margin: 0; font-weight: bold; text-transform: uppercase; letter-spacing: 2px; font-size: 12px;">${totalTickets} ${totalTickets === 1 ? 'Ticket' : 'Tickets'}</p>
              </div>
              <p style="margin: 0; font-family: 'Arial Black', Impact, sans-serif; font-weight: 900; font-size: 18px; letter-spacing: 2px; color: #1e293b;">${formattedOrderNumber}</p>
            </div>

          </div>
        `;
        finalHtml += `<br/>${passHtml}`;
      }

      // Fire and forget: send email asynchronously
      sendEmail(registration.attendee.email, template.subject, finalHtml, attachments).catch(e => console.error("Async email error:", e));
    }
    
    revalidatePath('/admin/registrations');
    
    return { success: true };
  } catch (e) {
    console.error("Failed to update registration status", e);
    return { success: false, message: "Failed to update status." };
  }
}

export async function updateRegistrationDetails(
  id: string,
  attendeeId: string,
  data: {
    name: string;
    email: string;
    phone: string;
    outreach: OutreachLocation;
    totalAmount: number;
    status: RegistrationStatus;
    receiptBase64?: string | null;
  }
) {
  try {
    const oldReg = await prisma.registration.findUnique({ where: { id } });
    
    const updateData: any = {
      status: data.status,
      totalAmount: data.totalAmount,
    };
    if (data.receiptBase64) {
      updateData.receiptUrl = data.receiptBase64;
    }

    await prisma.registration.update({
      where: { id },
      data: updateData
    });

    await prisma.attendee.update({
      where: { id: attendeeId },
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        outreach: data.outreach,
      }
    });

    if (data.status === 'PAYMENT_REJECTED' && oldReg?.status !== 'PAYMENT_REJECTED') {
      // Fire and forget email
      sendPaymentRejectedEmail(data.email, data.name).catch(e => console.error("Async email error:", e));
    } else if (data.status === 'SEAT_SECURED' && oldReg?.status !== 'SEAT_SECURED') {
       // Also trigger E-ticket generation here
       await updateRegistrationStatus(id, 'SEAT_SECURED');
    }
    
    revalidatePath('/admin/registrations');
    return { success: true };
  } catch (e) {
    console.error("Failed to update registration details", e);
    return { success: false, message: "Failed to update details." };
  }
}

export async function deleteRegistration(id: string) {
  try {
    // Delete tickets first due to foreign key constraints, though Cascade should handle it
    await prisma.ticket.deleteMany({ where: { registrationId: id } });
    await prisma.registration.delete({ where: { id } });
    
    revalidatePath('/admin/registrations');
    return { success: true };
  } catch (e) {
    console.error("Failed to delete registration", e);
    return { success: false, message: "Failed to delete registration." };
  }
}

export async function getDashboardStats() {
  const config = await getAdminConfig();
  
  const securedStats = await prisma.ticket.groupBy({
    by: ['ticketType'],
    where: {
      registration: {
        status: 'SEAT_SECURED'
      }
    },
    _count: true
  });

  const pendingStats = await prisma.ticket.groupBy({
    by: ['ticketType'],
    where: {
      registration: {
        status: {
          in: ['PENDING_FOR_PAYMENT', 'PENDING_FOR_REVIEW']
        }
      }
    },
    _count: true
  });

  const totalRegistrations = await prisma.registration.count();

  const paidAmountAgg = await prisma.registration.aggregate({
    _sum: { totalAmount: true },
    where: { status: 'SEAT_SECURED' }
  });

  const pendingAmountAgg = await prisma.registration.aggregate({
    _sum: { totalAmount: true },
    where: { status: { in: ['PENDING_FOR_PAYMENT', 'PENDING_FOR_REVIEW'] } }
  });

  const getCount = (stats: any[], type: 'KIDS') => 
    stats.find(s => s.ticketType === type)?._count || 0;

  const allRegistrations = await prisma.registration.findMany({
    select: {
      status: true,
      kidsTickets: true,
      attendee: {
        select: { outreach: true }
      }
    }
  });

  const outreachStats = Object.values(OutreachLocation).map(location => {
    const locRegs = allRegistrations.filter(r => r.attendee.outreach === location);
    const secured = locRegs.filter(r => r.status === 'SEAT_SECURED').reduce((acc, r) => acc + r.kidsTickets, 0);
    const pending = locRegs.filter(r => ['PENDING_FOR_PAYMENT', 'PENDING_FOR_REVIEW'].includes(r.status)).reduce((acc, r) => acc + r.kidsTickets, 0);
    return {
      location: location.replace('_', ' '),
      total: secured + pending,
      secured,
      pending
    };
  }).sort((a, b) => b.total - a.total); // Sort by highest tickets first

  return {
    kidsCapacity: config.kidsCapacity,
    securedKids: getCount(securedStats, 'KIDS'),
    pendingKids: getCount(pendingStats, 'KIDS'),
    totalRegistrations,
    totalPaidAmount: Number(paidAmountAgg._sum.totalAmount || 0),
    totalPendingAmount: Number(pendingAmountAgg._sum.totalAmount || 0),
    outreachStats
  };
}

export async function getEmailSettings() {
  let settings = await prisma.emailSettings.findUnique({
    where: { id: 1 }
  });

  if (!settings) {
    settings = await prisma.emailSettings.create({
      data: {
        id: 1,
        host: "smtp.gmail.com",
        port: 465,
        fromName: "Revival Team",
      }
    });
  }

  return settings;
}

export async function updateEmailSettings(data: {
  host: string;
  port: number;
  username: string;
  password?: string;
  fromName: string;
  fromEmail: string;
}) {
  try {
    await prisma.emailSettings.upsert({
      where: { id: 1 },
      update: data,
      create: {
        id: 1,
        ...data
      }
    });
    return { success: true };
  } catch (e) {
    console.error("Failed to update email settings", e);
    return { success: false, message: "Failed to save email settings." };
  }
}

export async function getEmailTemplate(type: TemplateType) {
  let template = await prisma.emailTemplate.findUnique({
    where: { type }
  });

  if (!template) {
    let subject = '';
    let bodyHtml = '';
    
    if (type === 'INVOICE') {
      subject = 'REVIVAL KIDS Conference - Registration Invoice';
      bodyHtml = `
<div style="max-width: 500px; margin: 20px auto; border: 2px solid #e5e7eb; border-radius: 16px; overflow: hidden; font-family: sans-serif; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
  <div style="background-color: #0f172a; color: white; padding: 20px; text-align: center;">
    <h2 style="margin: 0; font-size: 24px; letter-spacing: 2px;">REVIVAL KIDS 2026</h2>
    <p style="margin: 5px 0 0; color: #94a3b8; font-size: 14px;">Registration Invoice</p>
  </div>
  <div style="padding: 30px 20px; background-color: white;">
    <p style="font-size: 18px; color: #0f172a; font-weight: bold;">Hi {{name}},</p>
    <p style="color: #475569; line-height: 1.6;">Thank you for registering for the REVIVAL KIDS conference! Your registration has been received and is currently pending payment.</p>
    <div style="margin: 25px 0; padding: 15px; background-color: #f8fafc; border-radius: 8px; border-left: 4px solid #3b82f6;">
      <p style="margin: 0 0 5px; color: #64748b; font-size: 14px; text-transform: uppercase; font-weight: bold;">Order Number</p>
      <p style="margin: 0; font-size: 24px; font-weight: bold; color: #0f172a; font-family: monospace;">{{orderNumber}}</p>
    </div>
    <div style="margin: 25px 0; padding: 15px; background-color: #f8fafc; border-radius: 8px; border-left: 4px solid #10b981;">
      <p style="margin: 0 0 5px; color: #64748b; font-size: 14px; text-transform: uppercase; font-weight: bold;">Total Amount Due</p>
      <p style="margin: 0; font-size: 24px; font-weight: bold; color: #0f172a;">RM {{totalAmount}}</p>
    </div>
    <p style="color: #475569; line-height: 1.6; font-size: 14px; padding: 15px; background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 8px;">
      <strong>Action Required:</strong> If you selected 'Pay Later' or have not uploaded your payment receipt, please upload your proof of payment via the registration portal or reply to this email with your receipt attached.
    </p>
  </div>
  <div style="background-color: #f8fafc; border-top: 2px dashed #cbd5e1; padding: 20px; text-align: center;">
    <p style="margin: 0; color: #64748b; font-size: 14px;">Blessings,<br/>The Revival Team</p>
  </div>
</div>`;
    } else if (type === 'E_TICKET') {
      subject = 'REVIVAL KIDS Conference - Your E-Tickets';
      bodyHtml = `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
  <h2>Your Tickets are Confirmed!</h2>
  <p>Hi {{name}},</p>
  <p>Your payment has been verified. Attached are your unique QR code e-tickets for order <strong>{{orderNumber}}</strong>.</p>
  <p>Please present these QR codes at the entrance for scanning.</p>
  <br/>
  <p>See you there,<br/>The Revival Team</p>
</div>`;
    } else if (type === 'REMINDER') {
      subject = 'REVIVAL KIDS Conference - Reminder';
      bodyHtml = `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
  <h2>REVIVAL KIDS Conference is Approaching!</h2>
  <p>Hi {{name}},</p>
  <p>This is a friendly reminder for the upcoming REVIVAL KIDS conference. We are so excited to see you!</p>
  <p>Don't forget to have your QR code e-tickets ready for scanning at the entrance.</p>
  <br/>
  <p>Blessings,<br/>The Revival Team</p>
</div>`;
    }

    template = await prisma.emailTemplate.create({
      data: {
        type,
        subject,
        bodyHtml
      }
    });
  }

  return template;
}

export async function updateEmailTemplate(type: TemplateType, subject: string, bodyHtml: string) {
  try {
    await prisma.emailTemplate.upsert({
      where: { type },
      update: { subject, bodyHtml },
      create: { type, subject, bodyHtml }
    });
    return { success: true };
  } catch (e) {
    console.error("Failed to update email template", e);
    return { success: false, message: "Failed to save email template." };
  }
}

export async function enqueueBulkReminder(statusTarget: string) {
  try {
    const whereClause = statusTarget === 'ALL' ? {} : { status: statusTarget as RegistrationStatus };
    const registrations = await prisma.registration.findMany({
      where: whereClause,
      include: { attendee: true }
    });

    if (registrations.length === 0) {
      return { success: false, message: "No registrations found for this status." };
    }

    const template = await getEmailTemplate('REMINDER');

    let queuedCount = 0;
    for (const reg of registrations) {
      const formattedOrderNumber = 'R' + String(reg.orderNumber).padStart(5, '0');
      const parsedHtml = parseTemplate(template.bodyHtml, {
        name: reg.attendee.name,
        orderNumber: formattedOrderNumber,
        totalAmount: reg.totalAmount.toString()
      });
      
      await prisma.emailQueue.create({
        data: {
          to: reg.attendee.email,
          subject: template.subject,
          bodyHtml: parsedHtml,
          status: 'PENDING'
        }
      });
      queuedCount++;
    }

    // Start background processor asynchronously (fire and forget)
    processQueueInBackground().catch(e => console.error("Background queue error:", e));

    return { success: true, message: `Queued ${queuedCount} bulk emails. They are now sending in the background.` };
  } catch (e) {
    console.error("Failed to queue bulk emails", e);
    return { success: false, message: "Failed to queue emails." };
  }
}

export async function enqueueFinalReminder() {
  try {
    const registrations = await prisma.registration.findMany({
      where: { status: 'SEAT_SECURED' },
      include: { attendee: true }
    });

    if (registrations.length === 0) {
      return { success: false, message: "No paid registrations found." };
    }

    let template = await prisma.emailTemplate.findUnique({
      where: { type: 'FINAL_REMINDER' }
    });

    if (!template) {
      // Create default fallback template if it doesn't exist
      template = await prisma.emailTemplate.create({
        data: {
          type: 'FINAL_REMINDER',
          subject: 'REVIVAL KIDS: Admission Ticket & Starter Pack Details',
          bodyHtml: `<div style="max-width: 400px; margin: 20px auto; border-radius: 20px; overflow: hidden; font-family: sans-serif; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); background: white;">
            <!-- Header Section -->
            <div style="background-color: #ff203a; position: relative; padding: 25px 20px; text-align: center; color: white; overflow: hidden;">
              <div style="position: absolute; top: -20px; left: -20px; width: 100px; height: 100px; background-color: #5ced73; border-radius: 50%; opacity: 0.9;"></div>
              <div style="position: absolute; bottom: -30px; right: -20px; width: 120px; height: 120px; background-color: #ffcb05; border-radius: 50%; opacity: 0.9;"></div>
              <div style="position: absolute; top: 50%; left: -30px; width: 80px; height: 80px; background-color: #0f75ff; border-radius: 50%; opacity: 0.9; transform: translateY(-50%);"></div>
              
              <div style="position: relative; z-index: 10; text-shadow: 2px 2px 0px rgba(0,0,0,0.15);">
                <h2 style="margin: 0; font-family: 'Arial Black', Impact, sans-serif; font-size: 32px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase;">FINAL REMINDER</h2>
                <h3 style="margin: 0; font-family: 'Arial Black', Impact, sans-serif; font-size: 18px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase;">REVIVAL KIDS CONFERENCE</h3>
              </div>
            </div>

            <!-- Content Section -->
            <div style="padding: 30px 20px; background-color: white; color: #333;">
              <p>Hi {{name}},</p>
              <p>We are so excited to see you! Attached to this email is your <strong>Admission Ticket (QR Code)</strong>.</p>
              
              <div style="background-color: #f8fafc; padding: 15px; border-radius: 12px; margin: 20px 0; border: 2px solid #e2e8f0;">
                <h4 style="margin-top: 0; color: #ff203a; text-transform: uppercase; font-weight: bold;">Starter Pack Collection</h4>
                <p style="margin: 0;">Please collect your kids' starter packs on <strong>26 Jun</strong>.</p>
              </div>
              
              <p>Please present the attached QR code at the registration counter for a smooth check-in process.</p>
              <p>Order Number: <strong>{{orderNumber}}</strong></p>
            </div>
          </div>`
        }
      });
    }

    let queuedCount = 0;
    for (const reg of registrations) {
      const formattedOrderNumber = 'R' + String(reg.orderNumber).padStart(5, '0');
      const parsedHtml = parseTemplate(template.bodyHtml, {
        name: reg.attendee.name,
        orderNumber: formattedOrderNumber,
        totalAmount: reg.totalAmount.toString()
      });
      
      await prisma.emailQueue.create({
        data: {
          to: reg.attendee.email,
          subject: template.subject,
          bodyHtml: parsedHtml,
          status: 'PENDING',
          registrationId: reg.id // Link registration for dynamic ticket fetching
        }
      });
      queuedCount++;
    }

    return { success: true, message: `Queued ${queuedCount} Final Reminder emails. They will be sent by the cron processor.` };
  } catch (e) {
    console.error("Failed to queue final reminder emails", e);
    return { success: false, message: "Failed to queue emails." };
  }
}

export async function getEmailLogs() {
  try {
    const logs = await prisma.emailLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100 // Limit to recent 100 for dashboard performance
    });
    return { success: true, logs };
  } catch (e) {
    console.error("Failed to fetch email logs", e);
    return { success: false, logs: [] };
  }
}

export async function retryEmail(logId: string) {
  try {
    const log = await prisma.emailLog.findUnique({ where: { id: logId } });
    if (!log) return { success: false, message: 'Log not found' };

    const attendee = await prisma.attendee.findUnique({
      where: { email: log.to },
      include: {
        registrations: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { tickets: true, kids: true }
        }
      }
    });

    if (!attendee || attendee.registrations.length === 0) {
      return { success: false, message: 'Attendee or Registration not found' };
    }

    const registration = attendee.registrations[0];

    if (log.subject.includes('Registration Invoice')) {
      const template = await getEmailTemplate('INVOICE');
      const formattedOrderNumber = 'R' + String(registration.orderNumber).padStart(5, '0');
      const parsedHtml = parseTemplate(template.bodyHtml, {
        name: attendee.name,
        orderNumber: formattedOrderNumber,
        totalAmount: registration.totalAmount.toString()
      });
      const success = await sendEmail(log.to, template.subject, parsedHtml);
      if (success) {
        await prisma.emailLog.update({ where: { id: logId }, data: { status: 'SENT', error: null } });
      }
      revalidatePath('/admin/emails');
      return { success, message: success ? 'Retried successfully' : 'Retry failed again' };
    } else if (log.subject.includes('E-Tickets')) {
      const template = await getEmailTemplate('E_TICKET');
      const formattedOrderNumber = 'R' + String(registration.orderNumber).padStart(5, '0');
      const parsedHtml = parseTemplate(template.bodyHtml, {
        name: attendee.name,
        orderNumber: formattedOrderNumber
      });

      const attachments = registration.qrCodeUrl ? [{
        filename: `revival-ticket-${formattedOrderNumber}.png`,
        content: registration.qrCodeUrl.split("base64,")[1],
        encoding: 'base64',
        cid: `ticket_master`
      }] : [];

      const totalTickets = registration.kidsTickets;

      let finalHtml = parsedHtml;
      if (!finalHtml.includes('ticket_master') && attachments.length > 0) {
        const kidsListHtml = registration.kids && registration.kids.length > 0
          ? `<div style="margin-bottom: 12px; display: flex; flex-direction: column; gap: 4px;">` + 
            registration.kids.map(kid => `<span style="font-family: 'Arial Black', Impact, sans-serif; font-size: 24px; color: #ff203a; text-transform: uppercase; letter-spacing: 1px; font-weight: 900;">${kid.name}</span>`).join('') +
            `</div>`
          : '';

        const passHtml = `
          <div style="max-width: 400px; margin: 20px auto; border-radius: 20px; overflow: hidden; font-family: sans-serif; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05); background: white;">
            
            <!-- Header Section -->
            <div style="background-color: #ff203a; position: relative; padding: 25px 20px; text-align: center; color: white; overflow: hidden;">
              <!-- Simulated Blobs -->
              <div style="position: absolute; top: -20px; left: -20px; width: 100px; height: 100px; background-color: #5ced73; border-radius: 50%; opacity: 0.9;"></div>
              <div style="position: absolute; bottom: -30px; right: -20px; width: 120px; height: 120px; background-color: #ffcb05; border-radius: 50%; opacity: 0.9;"></div>
              <div style="position: absolute; top: 50%; left: -30px; width: 80px; height: 80px; background-color: #0f75ff; border-radius: 50%; opacity: 0.9; transform: translateY(-50%);"></div>
              
              <div style="position: relative; z-index: 10; text-shadow: 2px 2px 0px rgba(0,0,0,0.15);">
                <p style="margin: 0 0 4px; font-weight: bold; font-size: 12px; letter-spacing: 2px; text-transform: uppercase;">ACTS 2:17-18</p>
                <h2 style="margin: 0; font-family: 'Arial Black', Impact, sans-serif; font-size: 36px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase;">REVIVAL KIDS</h2>
                <h3 style="margin: 0; font-family: 'Arial Black', Impact, sans-serif; font-size: 20px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase;">CONFERENCE</h3>
                <div style="display: inline-block; background: white; color: #ff203a; font-weight: 900; font-size: 14px; padding: 4px 16px; border-radius: 12px; margin-top: 12px; text-shadow: none;">
                  2026
                </div>
              </div>
            </div>

            <!-- QR Code Section -->
            <div style="padding: 30px 20px; background-color: white; text-align: center; border-bottom: 3px dashed rgba(255, 32, 58, 0.3);">
              <div style="display: inline-block; padding: 10px; border: 4px solid rgba(255, 32, 58, 0.2); border-radius: 20px; background: white;">
                <img src="cid:ticket_master" alt="QR Code" style="width: 200px; height: 200px; display: block; border-radius: 12px;" />
              </div>
            </div>

            <!-- Footer Section -->
            <div style="background-color: #f8fafc; padding: 25px 20px; text-align: center;">
              ${kidsListHtml}
              <div style="display: inline-block; background: black; color: white; padding: 4px 16px; border-radius: 4px; margin-bottom: 12px;">
                <p style="margin: 0; font-weight: bold; text-transform: uppercase; letter-spacing: 2px; font-size: 12px;">${totalTickets} ${totalTickets === 1 ? 'Ticket' : 'Tickets'}</p>
              </div>
              <p style="margin: 0; font-family: 'Arial Black', Impact, sans-serif; font-weight: 900; font-size: 18px; letter-spacing: 2px; color: #1e293b;">${formattedOrderNumber}</p>
            </div>

          </div>
        `;
        finalHtml += `<br/>${passHtml}`;
      }

      const success = await sendEmail(log.to, template.subject, finalHtml, attachments);
      if (success) {
        await prisma.emailLog.update({ where: { id: logId }, data: { status: 'SENT', error: null } });
      }
      revalidatePath('/admin/emails');
      return { success, message: success ? 'Retried successfully' : 'Retry failed again' };
    } else if (log.subject.includes('Action Required')) {
      const success = await sendPaymentRejectedEmail(log.to, attendee.name);
      if (success) {
        await prisma.emailLog.update({ where: { id: logId }, data: { status: 'SENT', error: null } });
      }
      revalidatePath('/admin/emails');
      return { success, message: success ? 'Retried successfully' : 'Retry failed again' };
    } else {
      return { success: false, message: 'Unknown email type for retry' };
    }
  } catch (e: any) {
    console.error("Retry failed:", e);
    return { success: false, message: e.message || 'Server error' };
  }
}

export async function wipeDatabase(password: string) {
  if (password !== 'WIPE_REVIVAL_2026') {
    return { success: false, message: 'Invalid password' };
  }

  try {
    // Delete all transactional data
    await prisma.ticket.deleteMany({});
    await prisma.registration.deleteMany({});
    await prisma.attendee.deleteMany({});
    await prisma.emailLog.deleteMany({});

    // Reset the sequence for orderNumber back to 1
    // We use a raw query because Prisma does not have a native way to reset sequences.
    await prisma.$executeRawUnsafe('ALTER SEQUENCE "Registration_orderNumber_seq" RESTART WITH 1');

    return { success: true, message: 'Database wiped and order numbers reset successfully!' };
  } catch (error) {
    console.error("Failed to wipe database", error);
    return { success: false, message: 'Failed to wipe database' };
  }
}
