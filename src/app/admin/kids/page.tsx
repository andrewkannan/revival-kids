import React from 'react';
import prisma from '@/lib/prisma';
import KidsListClient from './KidsListClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function KidsPage() {
  const kids = await prisma.kid.findMany({
    where: {
      registration: {
        status: 'SEAT_SECURED'
      }
    },
    include: {
      registration: {
        include: {
          attendee: true
        }
      }
    },
    orderBy: {
      registration: {
        orderNumber: 'asc'
      }
    }
  });

  return (
    <div className="space-y-6 animate-in fade-in pb-12">
      <div className="flex justify-between items-center bg-black/50 p-6 rounded-2xl border border-white/10">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Kids List</h1>
          <p className="text-slate-400">Total Kids Registered: <span className="text-white font-bold">{kids.length}</span></p>
        </div>
      </div>

      <div className="bg-[#0f172a] rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
        <KidsListClient initialKids={kids} />
      </div>
    </div>
  );
}
