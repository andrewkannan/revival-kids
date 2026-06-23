import prisma from './prisma';
import { sendEmail } from './email';

export function startEmailCron() {
  if ((globalThis as any).emailCronStarted) return;
  (globalThis as any).emailCronStarted = true;
  
  console.log('[CRON] Starting internal email queue processor...');

  // Run every 4 minutes (240,000 ms)
  setInterval(async () => {
    try {
      // 1. Global Pause Check
      const config = await prisma.adminConfig.findUnique({ where: { id: 1 } });
      if (config?.isEmailQueuePaused) {
        console.log('[CRON] Email queue is globally paused. Skipping run.');
        return;
      }

      // 2. Batching: Fetch exactly 1 email
      const nextEmail = await prisma.emailQueue.findFirst({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
      });

      if (!nextEmail) {
        // No emails to process
        return;
      }

      console.log(`[CRON] Processing email ${nextEmail.id} to ${nextEmail.to}`);

      // Mark as PROCESSING
      await prisma.emailQueue.update({
        where: { id: nextEmail.id },
        data: { status: 'PROCESSING', attempts: { increment: 1 } },
      });

      // 3. Jitter: Delay between 0 and 45 seconds to bypass strict spam filters
      const jitterMs = Math.floor(Math.random() * 45000);
      console.log(`[CRON] Applying jitter delay of ${jitterMs}ms before sending...`);
      await new Promise(resolve => setTimeout(resolve, jitterMs));

      // Prepare attachments if registrationId exists
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

      console.log(`[CRON] Email ${nextEmail.id} ${success ? 'SENT successfully' : 'FAILED to send'}.`);

    } catch (error: any) {
      console.error('[CRON] Error processing email queue:', error);
    }
  }, 4 * 60 * 1000); // 4 minutes
}
