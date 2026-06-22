'use client';

import React, { useTransition } from 'react';
import { RegistrationStatus } from '@prisma/client';
import { updateRegistrationStatus } from '@/actions/admin';

export default function StatusSelect({
  registrationId,
  currentStatus,
}: {
  registrationId: string;
  currentStatus: RegistrationStatus;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <select
      defaultValue={currentStatus}
      disabled={isPending}
      onChange={(e) => {
        startTransition(async () => {
          await updateRegistrationStatus(registrationId, e.target.value as RegistrationStatus);
        });
      }}
      className="bg-black/50 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-white/30 disabled:opacity-50"
    >
      <option value="PENDING_FOR_PAYMENT">Pending Payment</option>
      <option value="PENDING_FOR_REVIEW">Pending Review</option>
      <option value="PAYMENT_REJECTED">Payment Rejected</option>
      <option value="SEAT_SECURED">Seat Secured</option>
      <option value="CONTACT_ADMIN">Contact Admin</option>
      <option value="TICKET_CANCELLED">Ticket Cancelled</option>
    </select>
  );
}
