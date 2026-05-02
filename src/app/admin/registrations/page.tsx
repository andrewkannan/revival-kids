import prisma from '@/lib/prisma';
import RegistrationsTable from '@/components/admin/RegistrationsTable';

export const dynamic = 'force-dynamic';

export default async function RegistrationsPage() {
  const registrations = await prisma.registration.findMany({
    include: {
      attendee: true,
      tickets: true,
      kids: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  const registrationsData = registrations.map(r => ({
    ...r,
    totalAmount: r.totalAmount.toString()
  }));

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Registrations</h1>
        <p className="text-slate-400 mt-2">View and manage all attendees and their payment statuses.</p>
      </div>

      <RegistrationsTable initialData={registrationsData as any} />
    </div>
  );
}
