import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendEmail } from '@/lib/email';
import { getEmailTemplate } from '@/actions/admin';
import { parseTemplate } from '@/lib/email';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    // 1. Global Pause Check
    const config = await prisma.adminConfig.findUnique({ where: { id: 1 } });
    if (config?.isEmailQueuePaused) {
      return NextResponse.json({ status: 'paused', message: 'Email queue is globally paused.' });
    }

    // 2. Batching: Fetch exactly 1 email
    const nextEmail = await prisma.emailQueue.findFirst({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    });

    if (!nextEmail) {
      return NextResponse.json({ status: 'empty', message: 'No pending emails in queue.' });
    }

    // Mark as PROCESSING
    await prisma.emailQueue.update({
      where: { id: nextEmail.id },
      data: { status: 'PROCESSING', attempts: { increment: 1 } },
    });

    // 3. Jitter: Delay between 0 and 45 seconds to bypass strict spam filters
    const jitterMs = Math.floor(Math.random() * 45000);
    await new Promise(resolve => setTimeout(resolve, jitterMs));

    // Prepare attachments if registrationId exists (for FINAL_REMINDER)
    let attachments: any[] = [];
    if (nextEmail.registrationId) {
      const registration = await prisma.registration.findUnique({
        where: { id: nextEmail.registrationId }
      });
      
      if (registration?.qrCodeUrl) {
        const formattedOrderNumber = 'R' + String(registration.orderNumber).padStart(5, '0');
        attachments = [{
          filename: `revival-ticket-${formattedOrderNumber}.png`,
          content: registration.qrCodeUrl.split("base64,")[1],
          encoding: 'base64',
          cid: `ticket_master`
        }];
      }
    }

    // 4. Send Email
    const success = await sendEmail(nextEmail.to, nextEmail.subject, nextEmail.bodyHtml, attachments);

    // 5. Completion Handling
    await prisma.emailQueue.update({
      where: { id: nextEmail.id },
      data: { 
        status: success ? 'SENT' : 'FAILED',
        error: success ? null : 'Failed to send email via SMTP',
        sentAt: success ? new Date() : null
      },
    });

    return NextResponse.json({ 
      status: success ? 'success' : 'failed', 
      emailId: nextEmail.id,
      jitterAppliedMs: jitterMs
    });

  } catch (error: any) {
    console.error('Error processing cron email:', error);
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}
