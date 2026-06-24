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

const SCANNER_COOKIE_NAME = 'revival_scanner_session';

export async function loginScanner(password: string) {
  const secret = process.env.SCANNER_PASSWORD || 'scanner';
  
  if (password === secret) {
    await (await cookies()).set(SCANNER_COOKIE_NAME, 'authenticated', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: COOKIE_MAX_AGE,
      path: '/',
    });
    return { success: true };
  }

  return { success: false, message: 'Invalid scanner password.' };
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
          ? `<div style="margin-bottom: 15px; display: flex; flex-direction: column; gap: 8px;">` + 
            registration.kids.map(kid => `<span style="font-size: 26px; font-weight: bold; color: white; text-transform: uppercase; letter-spacing: 1px; text-align: center;">${kid.name}</span>`).join('') +
            `</div>`
          : '';

        const passHtml = `
          <div style="max-width: 400px; margin: 20px auto; background-color: #11181a; border: 2px solid #8caeb0; border-radius: 20px; overflow: hidden; font-family: 'Helvetica Neue', Arial, sans-serif; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
            <!-- Header Section -->
            <div style="background-color: #1c272a; border-bottom: 1px solid rgba(140, 174, 176, 0.3); padding: 25px 20px; text-align: center;">
              <p style="margin: 0 0 8px 0; font-size: 12px; font-weight: bold; letter-spacing: 4px; color: #a4c5c6; text-transform: uppercase;">Acts 2:17-18</p>
              <h2 style="margin: 0; font-size: 32px; font-weight: 900; line-height: 1.1; letter-spacing: 2px; color: white;">REVIVAL KIDS</h2>
              <h3 style="margin: 5px 0 0; font-size: 16px; font-weight: 400; letter-spacing: 6px; color: #8caeb0;">CONFERENCE</h3>
              <div style="margin-top: 15px; display: inline-block; background-color: rgba(140, 174, 176, 0.1); border: 1px solid #8caeb0; color: #a4c5c6; padding: 4px 16px; border-radius: 20px; font-weight: bold; font-size: 14px; letter-spacing: 1px;">
                2026
              </div>
            </div>

            <!-- QR Code Section -->
            <div style="background-color: white; padding: 25px 20px; text-align: center; margin: 20px; border-radius: 12px; box-shadow: inset 0 2px 10px rgba(0,0,0,0.1);">
              <img src="cid:ticket_master" alt="QR Code" style="width: 200px; height: 200px; margin: 0 auto; display: block;" />
            </div>

            <!-- Ticket Details -->
            <div style="padding: 10px 20px 25px; text-align: center; position: relative;">
              <!-- Dashed Divider -->
              <div style="border-top: 2px dashed #8caeb0; margin-bottom: 25px; opacity: 0.5;"></div>

              <!-- Centered Name -->
              ${kidsListHtml}

              <!-- Ticket Count Badge -->
              <div style="margin-bottom: 15px;">
                <span style="display: inline-block; background-color: #8caeb0; color: #11181a; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">
                  ${totalTickets} ${totalTickets === 1 ? 'Ticket' : 'Tickets'}
                </span>
              </div>
              
              <!-- Order Number -->
              <div style="background-color: rgba(140, 174, 176, 0.1); padding: 10px 20px; border-radius: 8px; margin: 0 auto 20px; display: inline-block; border: 1px solid rgba(140, 174, 176, 0.3);">
                <p style="margin: 0; font-size: 11px; font-weight: bold; color: #8caeb0; letter-spacing: 1px;">ORDER NUMBER</p>
                <p style="margin: 5px 0 0; font-size: 20px; font-weight: bold; color: #a4c5c6; letter-spacing: 2px;">${formattedOrderNumber}</p>
              </div>

              <!-- Instructions Box -->
              <div style="background-color: #1c272a; border-left: 4px solid #a4c5c6; padding: 12px 15px; border-radius: 4px; text-align: left; margin-top: 10px;">
                <p style="margin: 0 0 5px; font-size: 13px; font-weight: bold; color: #a4c5c6;">🎟️ ADMISSION INFO</p>
                <p style="margin: 0; font-size: 13px; color: #d1d5db; line-height: 1.4;">
                  Please collect your starter pack on admission day (<strong>26 June</strong>) between <strong>6:00 PM - 7:30 PM</strong>.
                </p>
              </div>
            </div>
          </div>
        `;
        finalHtml += `<br/>${passHtml}`;
      }

      // Fire and forget: send email asynchronously
      await prisma.emailQueue.create({
        data: {
          to: registration.attendee.email,
          subject: template.subject,
          bodyHtml: finalHtml,
          registrationId: registration.id,
          status: 'PENDING'
        }
      });
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
    kids?: { id: string; name: string; age: number }[];
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

    if (data.kids && data.kids.length > 0) {
      for (const kid of data.kids) {
        await prisma.kid.update({
          where: { id: kid.id },
          data: { name: kid.name, age: kid.age }
        });
      }
    }

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
<div style="max-width: 500px; margin: 20px auto; border: 2px solid #333; border-radius: 16px; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; box-shadow: 0 6px 12px rgba(0,0,0,0.5); background-color: #0a0a0a;">
  <div style="background: linear-gradient(135deg, #2b0308, #111); color: white; padding: 24px; text-align: center;">
    <h2 style="margin: 0; font-size: 26px; letter-spacing: 3px;">REVIVAL CONFERENCE 2026</h2>
    <p style="margin: 6px 0 0; color: #fecaca; font-size: 13px; letter-spacing: 1px;">Ticket Confirmation</p>
  </div>
  <div style="padding: 30px 24px; background-color: #111;">
    <p style="font-size: 18px; color: white; font-weight: 600; margin-bottom: 10px;">Dear {{name}},</p>
    <p style="color: #cbd5e1; line-height: 1.7; font-size: 15px; margin-bottom: 20px;">Your payment has been successfully verified, and your kids' places at <strong>REVIVAL KIDS 2026</strong> are now confirmed. Above this email are the unique QR code e-tickets for their admission.</p>
    <div style="margin: 25px 0; padding: 16px; background-color: #0a0a0a; border-radius: 10px; border-left: 4px solid #f81838;">
      <p style="margin: 0 0 6px; color: #94a3b8; font-size: 12px; text-transform: uppercase; font-weight: 600; letter-spacing: 1px;">Order Reference</p>
      <p style="margin: 0; font-size: 22px; font-weight: 700; color: white; font-family: monospace;">#{{orderNumber}}</p>
    </div>
    <div style="margin-top: 20px; padding: 16px; background-color: #2b0308; border: 1px solid #f81838; border-radius: 10px;">
      <p style="margin: 0; color: #fecaca; font-size: 14px; line-height: 1.6;">
        <strong>Entry & Collection:</strong> Please bring this email along with the ticket QR code on the day of the conference. Proceed to the <strong>Registration Counter</strong> to collect the kids' starter packs before entry.
      </p>
    </div>
    <p style="margin-top: 28px; color: #cbd5e1; font-size: 14px; line-height: 1.6;">We look forward to welcoming your kids into a powerful time of encounter.</p>
  </div>
  <div style="background-color: #0a0a0a; border-top: 2px dashed #333; padding: 20px; text-align: center;">
    <p style="margin: 0; color: #94a3b8; font-size: 13px;">With expectation,<br/><strong style="color: white;">The REVIVAL Team</strong></p>
  </div>
</div>`;
    } else if (type === 'FINAL_REMINDER') {
      subject = 'REVIVAL KIDS: Admission Ticket & Starter Pack Details';
      bodyHtml = `
<div style="max-width: 400px; margin: 20px auto; border-radius: 20px; overflow: hidden; font-family: sans-serif; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); background: white;">
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
      include: { attendee: true, kids: true }
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
      
      let finalHtml = parsedHtml;
      
      // Build dynamic ticket HTML if applicable
      const kidsListHtml = reg.kids && reg.kids.length > 0
        ? `<div style="margin-bottom: 15px;">` + 
          reg.kids.map(kid => `<div style="font-size: 26px; font-weight: bold; color: white; text-transform: uppercase; letter-spacing: 1px; text-align: center; margin-bottom: 8px;">${kid.name}</div>`).join('') +
          `</div>`
        : '';

      const totalTickets = reg.kidsTickets;

      const ticketHtml = `
        <div style="max-width: 500px; margin: 0 auto; background-color: #1a1a1a; border: 2px solid #f81838; border-radius: 20px; overflow: hidden; font-family: 'Helvetica Neue', Arial, sans-serif; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
          <!-- Header Section -->
          <div style="background-color: #111; border-bottom: 1px solid rgba(248, 24, 56, 0.3); padding: 25px 20px; text-align: center;">
            <p style="margin: 0 0 8px 0; font-size: 12px; font-weight: bold; letter-spacing: 4px; color: #ff4a64; text-transform: uppercase;">Acts 2:17-18</p>
            <h2 style="margin: 0; font-size: 32px; font-weight: 900; line-height: 1.1; letter-spacing: 2px; color: white;">REVIVAL KIDS</h2>
            <h3 style="margin: 5px 0 0; font-size: 16px; font-weight: 400; letter-spacing: 6px; color: #f81838;">CONFERENCE</h3>
            <div style="margin-top: 15px; display: inline-block; background-color: rgba(248, 24, 56, 0.1); border: 1px solid #f81838; color: #ff4a64; padding: 4px 16px; border-radius: 20px; font-weight: bold; font-size: 14px; letter-spacing: 1px;">
              2026
            </div>
          </div>

          <!-- Instruction Panel (TOP) -->
          <div style="background-color: #2b0308; padding: 15px 20px; text-align: center; border-bottom: 1px solid rgba(248, 24, 56, 0.2);">
            <p style="margin: 0 0 5px; font-size: 14px; font-weight: bold; color: #ff4a64; text-transform: uppercase; letter-spacing: 1px;">🎫 Admission Info</p>
            <p style="margin: 0; font-size: 13px; color: #fecaca; line-height: 1.4;">
              Registration opens at <strong>6:00 PM - 7:30 PM</strong>.<br/>Please register and collect the kids' starter packs upon entry.
            </p>
          </div>

          <!-- QR Code Section -->
          <div style="background-color: white; padding: 25px 20px; text-align: center; margin: 20px; border-radius: 12px; box-shadow: inset 0 2px 10px rgba(0,0,0,0.1);">
            <img src="cid:ticket_master" alt="QR Code" style="width: 200px; height: 200px; margin: 0 auto; display: block;" />
          </div>

          <!-- Ticket Details -->
          <div style="padding: 10px 20px 25px; text-align: center; position: relative;">
            <!-- Dashed Divider -->
            <div style="border-top: 2px dashed #f81838; margin-bottom: 25px; opacity: 0.5;"></div>

            <!-- Centered Name -->
            ${kidsListHtml}

            <!-- Ticket Count Badge -->
            <div style="margin-bottom: 15px;">
              <span style="display: inline-block; background-color: #f81838; color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">
                ${totalTickets} ${totalTickets === 1 ? 'Ticket' : 'Tickets'}
              </span>
            </div>
            
            <!-- Order Number -->
            <div style="background-color: rgba(248, 24, 56, 0.1); padding: 10px 20px; border-radius: 8px; margin: 0 auto 5px; display: inline-block; border: 1px solid rgba(248, 24, 56, 0.3);">
              <p style="margin: 0; font-size: 11px; font-weight: bold; color: #ff4a64; letter-spacing: 1px;">ORDER NUMBER</p>
              <p style="margin: 5px 0 0; font-size: 20px; font-weight: bold; color: #fecaca; letter-spacing: 2px;">${formattedOrderNumber}</p>
            </div>
          </div>
        </div>
      `;

      if (reg.status === 'SEAT_SECURED') {
         finalHtml = ticketHtml + '<br/>' + parsedHtml;
      }
      
      await prisma.emailQueue.create({
        data: {
          to: reg.attendee.email,
          subject: template.subject,
          bodyHtml: finalHtml,
          status: 'PENDING',
          registrationId: reg.status === 'SEAT_SECURED' ? reg.id : undefined // Link registration for dynamic ticket fetching via cron
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

export async function sendTestEmail(templateType: string, testEmail: string) {
  try {
    let template = await prisma.emailTemplate.findUnique({
      where: { type: templateType as TemplateType }
    });
    if (!template) return { success: false, message: "Template not found." };

    // Find any seat secured registration to use as dummy data
    const dummyReg = await prisma.registration.findFirst({
      where: { status: 'SEAT_SECURED' },
      include: { attendee: true, kids: true }
    });

    let parsedHtml = parseTemplate(template.bodyHtml, {
      name: dummyReg ? dummyReg.attendee.name : "Test Attendee",
      orderNumber: dummyReg ? 'R' + String(dummyReg.orderNumber).padStart(5, '0') : "R00000",
      totalAmount: dummyReg ? dummyReg.totalAmount.toString() : "0.00"
    });

    if (templateType === 'REMINDER' && dummyReg) {
      const formattedOrderNumber = 'R' + String(dummyReg.orderNumber).padStart(5, '0');
      const kidsListHtml = dummyReg.kids && dummyReg.kids.length > 0
        ? `<div style="margin-bottom: 15px;">` + 
          dummyReg.kids.map(kid => `<div style="font-size: 26px; font-weight: bold; color: white; text-transform: uppercase; letter-spacing: 1px; text-align: center; margin-bottom: 8px;">${kid.name}</div>`).join('') +
          `</div>`
        : '';
      const totalTickets = dummyReg.kidsTickets;

      const ticketHtml = `
        <div style="max-width: 500px; margin: 0 auto; background-color: #1a1a1a; border: 2px solid #f81838; border-radius: 20px; overflow: hidden; font-family: 'Helvetica Neue', Arial, sans-serif; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
          <!-- Header Section -->
          <div style="background-color: #111; border-bottom: 1px solid rgba(248, 24, 56, 0.3); padding: 25px 20px; text-align: center;">
            <p style="margin: 0 0 8px 0; font-size: 12px; font-weight: bold; letter-spacing: 4px; color: #ff4a64; text-transform: uppercase;">Acts 2:17-18</p>
            <h2 style="margin: 0; font-size: 32px; font-weight: 900; line-height: 1.1; letter-spacing: 2px; color: white;">REVIVAL KIDS</h2>
            <h3 style="margin: 5px 0 0; font-size: 16px; font-weight: 400; letter-spacing: 6px; color: #f81838;">CONFERENCE</h3>
            <div style="margin-top: 15px; display: inline-block; background-color: rgba(248, 24, 56, 0.1); border: 1px solid #f81838; color: #ff4a64; padding: 4px 16px; border-radius: 20px; font-weight: bold; font-size: 14px; letter-spacing: 1px;">
              2026
            </div>
          </div>

          <!-- Instruction Panel (TOP) -->
          <div style="background-color: #2b0308; padding: 15px 20px; text-align: center; border-bottom: 1px solid rgba(248, 24, 56, 0.2);">
            <p style="margin: 0 0 5px; font-size: 14px; font-weight: bold; color: #ff4a64; text-transform: uppercase; letter-spacing: 1px;">🎫 Admission Info</p>
            <p style="margin: 0; font-size: 13px; color: #fecaca; line-height: 1.4;">
              Registration opens at <strong>6:00 PM - 7:30 PM</strong>.<br/>Please register and collect the kids' starter packs upon entry.
            </p>
          </div>

          <!-- QR Code Section -->
          <div style="background-color: white; padding: 25px 20px; text-align: center; margin: 20px; border-radius: 12px; box-shadow: inset 0 2px 10px rgba(0,0,0,0.1);">
            <img src="cid:ticket_master" alt="QR Code" style="width: 200px; height: 200px; margin: 0 auto; display: block;" />
          </div>

          <!-- Ticket Details -->
          <div style="padding: 10px 20px 25px; text-align: center; position: relative;">
            <!-- Dashed Divider -->
            <div style="border-top: 2px dashed #f81838; margin-bottom: 25px; opacity: 0.5;"></div>

            <!-- Centered Name -->
            ${kidsListHtml}

            <!-- Ticket Count Badge -->
            <div style="margin-bottom: 15px;">
              <span style="display: inline-block; background-color: #f81838; color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">
                ${totalTickets} ${totalTickets === 1 ? 'Ticket' : 'Tickets'}
              </span>
            </div>
            
            <!-- Order Number -->
            <div style="background-color: rgba(248, 24, 56, 0.1); padding: 10px 20px; border-radius: 8px; margin: 0 auto 5px; display: inline-block; border: 1px solid rgba(248, 24, 56, 0.3);">
              <p style="margin: 0; font-size: 11px; font-weight: bold; color: #ff4a64; letter-spacing: 1px;">ORDER NUMBER</p>
              <p style="margin: 5px 0 0; font-size: 20px; font-weight: bold; color: #fecaca; letter-spacing: 2px;">${formattedOrderNumber}</p>
            </div>
          </div>
        </div>
      `;
      parsedHtml = ticketHtml + '<br/>' + parsedHtml;
    }

    await prisma.emailQueue.create({
      data: {
        to: testEmail,
        subject: `[TEST] ${template.subject}`,
        bodyHtml: parsedHtml,
        status: 'PENDING',
        registrationId: dummyReg ? dummyReg.id : undefined
      }
    });

    return { success: true, message: "Test email queued. It will be sent on the next cron run." };
  } catch (e) {
    console.error("Failed to queue test email", e);
    return { success: false, message: "Failed to queue test email." };
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

export async function getEmailQueue() {
  try {
    const queue = await prisma.emailQueue.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    });
    return { success: true, queue };
  } catch (e) {
    console.error("Failed to fetch email queue", e);
    return { success: false, queue: [] };
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
      await prisma.emailQueue.create({
        data: {
          to: log.to,
          subject: template.subject,
          bodyHtml: parsedHtml,
          registrationId: registration.id,
          status: 'PENDING'
        }
      });
      const success = true; // Queued successfully
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
          ? `<div style="margin-bottom: 15px; display: flex; flex-direction: column; gap: 8px;">` + 
            registration.kids.map(kid => `<span style="font-size: 26px; font-weight: bold; color: white; text-transform: uppercase; letter-spacing: 1px; text-align: center;">${kid.name}</span>`).join('') +
            `</div>`
          : '';

        const passHtml = `
          <div style="max-width: 400px; margin: 20px auto; background-color: #11181a; border: 2px solid #8caeb0; border-radius: 20px; overflow: hidden; font-family: 'Helvetica Neue', Arial, sans-serif; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
            <!-- Header Section -->
            <div style="background-color: #1c272a; border-bottom: 1px solid rgba(140, 174, 176, 0.3); padding: 25px 20px; text-align: center;">
              <p style="margin: 0 0 8px 0; font-size: 12px; font-weight: bold; letter-spacing: 4px; color: #a4c5c6; text-transform: uppercase;">Acts 2:17-18</p>
              <h2 style="margin: 0; font-size: 32px; font-weight: 900; line-height: 1.1; letter-spacing: 2px; color: white;">REVIVAL KIDS</h2>
              <h3 style="margin: 5px 0 0; font-size: 16px; font-weight: 400; letter-spacing: 6px; color: #8caeb0;">CONFERENCE</h3>
              <div style="margin-top: 15px; display: inline-block; background-color: rgba(140, 174, 176, 0.1); border: 1px solid #8caeb0; color: #a4c5c6; padding: 4px 16px; border-radius: 20px; font-weight: bold; font-size: 14px; letter-spacing: 1px;">
                2026
              </div>
            </div>

            <!-- QR Code Section -->
            <div style="background-color: white; padding: 25px 20px; text-align: center; margin: 20px; border-radius: 12px; box-shadow: inset 0 2px 10px rgba(0,0,0,0.1);">
              <img src="cid:ticket_master" alt="QR Code" style="width: 200px; height: 200px; margin: 0 auto; display: block;" />
            </div>

            <!-- Ticket Details -->
            <div style="padding: 10px 20px 25px; text-align: center; position: relative;">
              <!-- Dashed Divider -->
              <div style="border-top: 2px dashed #8caeb0; margin-bottom: 25px; opacity: 0.5;"></div>

              <!-- Centered Name -->
              ${kidsListHtml}

              <!-- Ticket Count Badge -->
              <div style="margin-bottom: 15px;">
                <span style="display: inline-block; background-color: #8caeb0; color: #11181a; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">
                  ${totalTickets} ${totalTickets === 1 ? 'Ticket' : 'Tickets'}
                </span>
              </div>
              
              <!-- Order Number -->
              <div style="background-color: rgba(140, 174, 176, 0.1); padding: 10px 20px; border-radius: 8px; margin: 0 auto 20px; display: inline-block; border: 1px solid rgba(140, 174, 176, 0.3);">
                <p style="margin: 0; font-size: 11px; font-weight: bold; color: #8caeb0; letter-spacing: 1px;">ORDER NUMBER</p>
                <p style="margin: 5px 0 0; font-size: 20px; font-weight: bold; color: #a4c5c6; letter-spacing: 2px;">${formattedOrderNumber}</p>
              </div>

              <!-- Instructions Box -->
              <div style="background-color: #1c272a; border-left: 4px solid #a4c5c6; padding: 12px 15px; border-radius: 4px; text-align: left; margin-top: 10px;">
                <p style="margin: 0 0 5px; font-size: 13px; font-weight: bold; color: #a4c5c6;">🎟️ ADMISSION INFO</p>
                <p style="margin: 0; font-size: 13px; color: #d1d5db; line-height: 1.4;">
                  Please collect your starter pack on admission day (<strong>26 June</strong>) between <strong>6:00 PM - 7:30 PM</strong>.
                </p>
              </div>
            </div>
          </div>
        `;
        finalHtml += `<br/>${passHtml}`;
      }

      await prisma.emailQueue.create({
        data: {
          to: log.to,
          subject: template.subject,
          bodyHtml: finalHtml,
          registrationId: registration.id,
          status: 'PENDING'
        }
      });
      const success = true; // Queued successfully
      if (success) {
        await prisma.emailLog.update({ where: { id: logId }, data: { status: 'SENT', error: null } });
      }
      revalidatePath('/admin/emails');
      return { success, message: success ? 'Retried successfully' : 'Retry failed' };
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

export async function resendTicketEmailByRegistration(registrationId: string) {
  try {
    const registration = await prisma.registration.findUnique({
      where: { id: registrationId },
      include: { attendee: true, tickets: true, kids: true }
    });

    if (!registration) return { success: false, message: 'Registration not found' };

    const template = await getEmailTemplate('E_TICKET');
    const formattedOrderNumber = 'R' + String(registration.orderNumber).padStart(5, '0');
    const parsedHtml = parseTemplate(template.bodyHtml, {
      name: registration.attendee.name,
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
        ? `<div style="margin-bottom: 15px; display: flex; flex-direction: column; gap: 8px;">` + 
          registration.kids.map(kid => `<span style="font-size: 26px; font-weight: bold; color: white; text-transform: uppercase; letter-spacing: 1px; text-align: center;">${kid.name}</span>`).join('') +
          `</div>`
        : '';

      const passHtml = `
        <div style="max-width: 400px; margin: 20px auto; background-color: #11181a; border: 2px solid #8caeb0; border-radius: 20px; overflow: hidden; font-family: 'Helvetica Neue', Arial, sans-serif; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
          <!-- Header Section -->
          <div style="background-color: #1c272a; border-bottom: 1px solid rgba(140, 174, 176, 0.3); padding: 25px 20px; text-align: center;">
            <p style="margin: 0 0 8px 0; font-size: 12px; font-weight: bold; letter-spacing: 4px; color: #a4c5c6; text-transform: uppercase;">Acts 2:17-18</p>
            <h2 style="margin: 0; font-size: 32px; font-weight: 900; line-height: 1.1; letter-spacing: 2px; color: white;">REVIVAL KIDS</h2>
            <h3 style="margin: 5px 0 0; font-size: 16px; font-weight: 400; letter-spacing: 6px; color: #8caeb0;">CONFERENCE</h3>
            <div style="margin-top: 15px; display: inline-block; background-color: rgba(140, 174, 176, 0.1); border: 1px solid #8caeb0; color: #a4c5c6; padding: 4px 16px; border-radius: 20px; font-weight: bold; font-size: 14px; letter-spacing: 1px;">
              2026
            </div>
          </div>

          <!-- QR Code Section -->
          <div style="background-color: white; padding: 25px 20px; text-align: center; margin: 20px; border-radius: 12px; box-shadow: inset 0 2px 10px rgba(0,0,0,0.1);">
            <img src="cid:ticket_master" alt="QR Code" style="width: 200px; height: 200px; margin: 0 auto; display: block;" />
          </div>

          <!-- Ticket Details -->
          <div style="padding: 10px 20px 25px; text-align: center; position: relative;">
            <!-- Dashed Divider -->
            <div style="border-top: 2px dashed #8caeb0; margin-bottom: 25px; opacity: 0.5;"></div>

            <!-- Centered Name -->
            ${kidsListHtml}

            <!-- Ticket Count Badge -->
            <div style="margin-bottom: 15px;">
              <span style="display: inline-block; background-color: #8caeb0; color: #11181a; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">
                ${totalTickets} ${totalTickets === 1 ? 'Ticket' : 'Tickets'}
              </span>
            </div>
            
            <!-- Order Number -->
            <div style="background-color: rgba(140, 174, 176, 0.1); padding: 10px 20px; border-radius: 8px; margin: 0 auto 20px; display: inline-block; border: 1px solid rgba(140, 174, 176, 0.3);">
              <p style="margin: 0; font-size: 11px; font-weight: bold; color: #8caeb0; letter-spacing: 1px;">ORDER NUMBER</p>
              <p style="margin: 5px 0 0; font-size: 20px; font-weight: bold; color: #a4c5c6; letter-spacing: 2px;">${formattedOrderNumber}</p>
            </div>

            <!-- Instructions Box -->
            <div style="background-color: #1c272a; border-left: 4px solid #a4c5c6; padding: 12px 15px; border-radius: 4px; text-align: left; margin-top: 10px;">
              <p style="margin: 0 0 5px; font-size: 13px; font-weight: bold; color: #a4c5c6;">🎟️ ADMISSION INFO</p>
              <p style="margin: 0; font-size: 13px; color: #d1d5db; line-height: 1.4;">
                Please collect your starter pack on admission day (<strong>26 June</strong>) between <strong>6:00 PM - 7:30 PM</strong>.
              </p>
            </div>
          </div>
        </div>
      `;
      finalHtml += `<br/>${passHtml}`;
    }

    await prisma.emailQueue.create({
      data: {
        to: registration.attendee.email,
        subject: template.subject,
        bodyHtml: finalHtml,
        registrationId: registration.id,
        status: 'PENDING'
      }
    });

    return { success: true, message: 'E-Ticket queued for sending' };
  } catch (e: any) {
    console.error("Resend ticket error:", e);
    return { success: false, message: e.message || 'Server error' };
  }
}
