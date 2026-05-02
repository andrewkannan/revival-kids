import prisma from '@/lib/prisma';
import { sendEmail } from '@/lib/email';

// Global flag to prevent multiple background processors from running simultaneously
let isProcessingQueue = false;

/**
 * Background processor that sends emails one by one to respect rate limits.
 * Default delay is 5000ms (5 seconds) between emails.
 */
export async function processQueueInBackground() {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  try {
    while (true) {
      // Find the next pending email
      const nextEmail = await prisma.emailQueue.findFirst({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
      });

      if (!nextEmail) {
        // Queue is empty, exit loop
        break;
      }

      // Mark as PROCESSING to prevent duplicates if another instance somehow starts
      await prisma.emailQueue.update({
        where: { id: nextEmail.id },
        data: { status: 'PROCESSING' },
      });

      // Try sending the email
      const success = await sendEmail(nextEmail.to, nextEmail.subject, nextEmail.bodyHtml);

      // Update status
      await prisma.emailQueue.update({
        where: { id: nextEmail.id },
        data: { 
          status: success ? 'SENT' : 'FAILED',
          error: success ? null : 'Failed to send email'
        },
      });

      // Wait 5 seconds before the next email to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  } catch (error) {
    console.error('Error processing email queue:', error);
  } finally {
    isProcessingQueue = false;
  }
}
