'use server';

import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export async function toggleKidAttendance(id: string, day: 1 | 2 | 3, value: boolean) {
  try {
    const updateData: any = {};
    if (day === 1) updateData.attendanceDay1 = value;
    else if (day === 2) updateData.attendanceDay2 = value;
    else if (day === 3) updateData.attendanceDay3 = value;

    const kid = await prisma.kid.update({
      where: { id },
      data: updateData
    });
    
    revalidatePath('/admin/kids');
    return { success: true, data: kid };
  } catch (error: any) {
    console.error("Failed to toggle kid attendance", error);
    return { success: false, message: error.message };
  }
}
