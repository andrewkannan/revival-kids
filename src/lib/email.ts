import nodemailer from 'nodemailer';
import prisma from '@/lib/prisma';
import dns from 'dns';
import { promisify } from 'util';

const lookup = promisify(dns.lookup);

// Force Node.js to resolve IPv4 addresses first globally.
// This prevents ENETUNREACH errors on Railway when trying to route Google SMTP via IPv6.
dns.setDefaultResultOrder('ipv4first');

export async function getTransporter(overridePort?: number) {
  const settings = await prisma.emailSettings.findFirst();
  
  const host = settings?.host || process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = overridePort || settings?.port || parseInt(process.env.SMTP_PORT || '465');
  const user = settings?.username || process.env.SMTP_USER;
  const pass = settings?.password || process.env.SMTP_PASS;

  let finalHost = host;
  let dnsLog = "Skipped DNS lookup";
  try {
    const { address } = await lookup(host, { family: 4 });
    finalHost = address;
    dnsLog = `Resolved ${host} to IPv4: ${address}`;
  } catch (e: any) {
    dnsLog = `DNS lookup failed for ${host}: ${e.message}`;
    console.error(dnsLog);
  }

  // If we are using 587, secure is false (uses STARTTLS instead of implicit TLS)
  const isSecure = port === 465;

  return {
    transporter: nodemailer.createTransport({
      host: finalHost,
      port,
      secure: isSecure,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 15000,
      auth: { user, pass },
      tls: { servername: host } // Required so TLS verifies the domain, not the IP
    } as any),
    debugInfo: `Port: ${port}, Secure: ${isSecure}, ${dnsLog}`
  };
}

export async function sendEmail(to: string, subject: string, html: string, attachments?: any[]) {
  const settings = await prisma.emailSettings.findFirst();
  const user = settings?.username || process.env.SMTP_USER;
  const fromName = settings?.fromName || "REVIVAL Team";
  const fromEmail = settings?.fromEmail || user;

  if (!user) {
    console.warn("SMTP credentials not configured. Email not sent.");
    return false;
  }

  const { transporter, debugInfo } = await getTransporter();

  try {
    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject,
      html,
      attachments,
    });
    
    // Log success
    try {
      await prisma.emailLog.create({
        data: {
          to,
          subject,
          status: 'SENT',
          error: `[Success] ${debugInfo}`
        }
      });
    } catch (dbError) {}
    
    return true;
  } catch (error: any) {
    console.error("Failed to send email on first try:", error);
    
    // Fallback: If it was a network error (timeout/unreachable) on port 465, try port 587
    if (error?.message?.includes('timeout') || error?.message?.includes('ENETUNREACH')) {
      try {
        const { transporter: fallbackTransporter, debugInfo: fbDebugInfo } = await getTransporter(587);
        await fallbackTransporter.sendMail({
          from: `"${fromName}" <${fromEmail}>`,
          to,
          subject,
          html,
          attachments,
        });

        await prisma.emailLog.create({
          data: {
            to,
            subject,
            status: 'SENT',
            error: `[Success via Fallback 587] ${fbDebugInfo}`
          }
        });
        return true;
      } catch (fbError: any) {
        // Both failed
        await prisma.emailLog.create({
          data: {
            to,
            subject,
            status: 'FAILED',
            error: `[Primary: ${error.message}] [Fallback 587: ${fbError.message}] [Debug: ${debugInfo}]`
          }
        });
        return false;
      }
    }

    // Standard failure logging
    try {
      await prisma.emailLog.create({
        data: {
          to,
          subject,
          status: 'FAILED',
          error: `[Error: ${error?.message || 'Unknown error'}] [Debug: ${debugInfo}]`
        }
      });
    } catch (dbError) {}
    
    return false;
  }
}

export async function sendPaymentRejectedEmail(to: string, name: string) {
  const html = `
    <div style="font-family: sans-serif; max-w: 600px; margin: 0 auto;">
      <h2 style="color: #ef4444;">Payment Verification Failed</h2>
      <p>Hi ${name},</p>
      <p>We received your ticket registration for the REVIVAL conference, but unfortunately, we were unable to verify the payment receipt you uploaded.</p>
      <p>Please double-check your bank transfer and <strong>reply to this email</strong> with a clear screenshot of the successful transaction.</p>
      <p>If you have not made the payment yet, please transfer the required amount to our account and send us the receipt.</p>
      <br />
      <p>Thank you,<br />The REVIVAL Team</p>
    </div>
  `;

  await prisma.emailQueue.create({
    data: {
      to,
      subject: 'REVIVAL Registration - Action Required',
      bodyHtml: html,
      status: 'PENDING'
    }
  });
  return true;
}

export function parseTemplate(template: string, data: Record<string, string>) {
  let parsed = template;
  for (const [key, value] of Object.entries(data)) {
    parsed = parsed.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }
  return parsed;
}
