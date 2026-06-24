const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const html = `
<div style="max-width: 500px; margin: 20px auto; border: 2px solid #333; border-radius: 16px; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; box-shadow: 0 6px 12px rgba(0,0,0,0.5); background-color: #0a0a0a;">
  <div style="background: linear-gradient(135deg, #2b0308, #111); color: white; padding: 24px; text-align: center;">
    <h2 style="margin: 0; font-size: 26px; letter-spacing: 3px;">REVIVAL CONFERENCE 2026</h2>
    <p style="margin: 6px 0 0; color: #fecaca; font-size: 13px; letter-spacing: 1px;">Ticket Confirmation</p>
  </div>
  <div style="padding: 30px 24px; background-color: #111;">
    <p style="font-size: 18px; color: white; font-weight: 600; margin-bottom: 10px;">Dear {{name}},</p>
    <p style="color: #cbd5e1; line-height: 1.7; font-size: 15px; margin-bottom: 20px;">Your payment has been successfully verified, and your place at <strong>REVIVAL 2026</strong> is now confirmed. Above this email are your unique QR code e-tickets for your reference.</p>
    <div style="margin: 25px 0; padding: 16px; background-color: #0a0a0a; border-radius: 10px; border-left: 4px solid #f81838;">
      <p style="margin: 0 0 6px; color: #94a3b8; font-size: 12px; text-transform: uppercase; font-weight: 600; letter-spacing: 1px;">Order Reference</p>
      <p style="margin: 0; font-size: 22px; font-weight: 700; color: white; font-family: monospace;">#{{orderNumber}}</p>
    </div>
    <div style="margin-top: 20px; padding: 16px; background-color: #2b0308; border: 1px solid #f81838; border-radius: 10px;">
      <p style="margin: 0; color: #fecaca; font-size: 14px; line-height: 1.6;">
        <strong>Entry & Collection:</strong> Please bring this email along with your ticket QR code on the day of the conference. Proceed to the <strong>Ticket Collection Counter</strong> for verification and ticket collection before entry.
      </p>
    </div>
    <p style="margin-top: 28px; color: #cbd5e1; font-size: 14px; line-height: 1.6;">We look forward to welcoming you into a powerful time of encounter.</p>
  </div>
  <div style="background-color: #0a0a0a; border-top: 2px dashed #333; padding: 20px; text-align: center;">
    <p style="margin: 0; color: #94a3b8; font-size: 13px;">With expectation,<br/><strong style="color: white;">The REVIVAL Team</strong></p>
  </div>
</div>
  `;

  await prisma.emailTemplate.upsert({
    where: { type: 'REMINDER' },
    update: {
      subject: 'REVIVAL KIDS: Admission Ticket & Conference Details',
      bodyHtml: html
    },
    create: {
      type: 'REMINDER',
      subject: 'REVIVAL KIDS: Admission Ticket & Conference Details',
      bodyHtml: html
    }
  });
  console.log('Template seeded.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
