'use server';

import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export async function toggleKidAttendance(id: string, value: boolean) {
  try {
    const kid = await prisma.kid.update({
      where: { id },
      data: { attendance: value }
    });
    
    revalidatePath('/admin/kids');
    return { success: true, data: kid };
  } catch (error: any) {
    console.error("Failed to toggle kid attendance", error);
    return { success: false, message: error.message };
  }
}
