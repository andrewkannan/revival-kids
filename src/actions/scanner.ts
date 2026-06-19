'use server';

import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export async function searchRegistration(query: string) {
  try {
    const trimmed = query.trim();
    if (!trimmed) return { success: false, message: 'Empty query' };

    let whereClause: any = {
      OR: [
        { id: trimmed },
        {
          attendee: {
            OR: [
              { name: { contains: trimmed, mode: 'insensitive' } },
              { email: { contains: trimmed, mode: 'insensitive' } },
            ]
          }
        }
      ]
    };

    // If query starts with 'R' and followed by numbers, parse it as orderNumber
    if (/^r\d+$/i.test(trimmed)) {
      const num = parseInt(trimmed.substring(1), 10);
      if (!isNaN(num)) {
        whereClause.OR.push({ orderNumber: num });
      }
    } else if (/^\d+$/.test(trimmed)) {
      const num = parseInt(trimmed, 10);
      whereClause.OR.push({ orderNumber: num });
    }

    const registration = await prisma.registration.findFirst({
      where: whereClause,
      include: {
        attendee: true,
        kids: true,
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    if (!registration) {
      return { success: false, message: 'No registration found' };
    }

    return { success: true, data: registration };
  } catch (error: any) {
    console.error('Error searching registration:', error);
    return { success: false, message: error.message };
  }
}

export async function toggleWristbands(id: string, value: boolean) {
  try {
    const reg = await prisma.registration.update({
      where: { id },
      data: { wristbandsCollected: value }
    });
    revalidatePath('/admin/scanner');
    revalidatePath('/admin/registrations');
    return { success: true, data: reg };
  } catch (error: any) {
    console.error('Error toggling wristbands:', error);
    return { success: false, message: error.message };
  }
}

export async function toggleStarterPacks(id: string, value: boolean) {
  try {
    const reg = await prisma.registration.update({
      where: { id },
      data: { starterPacksCollected: value }
    });
    revalidatePath('/admin/scanner');
    revalidatePath('/admin/registrations');
    return { success: true, data: reg };
  } catch (error: any) {
    console.error('Error toggling starter packs:', error);
    return { success: false, message: error.message };
  }
}

export async function toggleAllCollections(id: string, value: boolean) {
  try {
    const reg = await prisma.registration.update({
      where: { id },
      data: { 
        wristbandsCollected: value,
        starterPacksCollected: value,
        collectedAt: value ? new Date() : null
      }
    });
    revalidatePath('/admin/scanner');
    revalidatePath('/admin/registrations');
    return { success: true, data: reg };
  } catch (error: any) {
    console.error('Error toggling all collections:', error);
    return { success: false, message: error.message };
  }
}
