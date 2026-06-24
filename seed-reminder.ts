import prisma from './src/lib/prisma';

async function main() {
  await prisma.emailTemplate.delete({
    where: { type: 'REMINDER' }
  }).catch(() => console.log('No existing REMINDER template.'));
  console.log('REMINDER template deleted. Fallback will now be used.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
