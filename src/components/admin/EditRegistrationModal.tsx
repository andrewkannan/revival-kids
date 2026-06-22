'use client';

import React, { useState, useRef } from 'react';
import { RegistrationStatus, OutreachLocation } from '@prisma/client';
import { motion } from 'framer-motion';
import { X, Upload, Loader2, Save } from 'lucide-react';
import { updateRegistrationDetails } from '@/actions/admin';

export type EditData = {
  id: string;
  attendeeId: string;
  orderNumber: number;
  name: string;
  email: string;
  phone: string;
  outreach: OutreachLocation;
  totalAmount: string;
  status: RegistrationStatus;
  receiptUrl: string | null;
};

interface Props {
  data: EditData;
  onClose: () => void;
}

export default function EditRegistrationModal({ data, onClose }: Props) {
  const [formData, setFormData] = useState({
    name: data.name,
    email: data.email,
    phone: data.phone,
    outreach: data.outreach,
    totalAmount: data.totalAmount,
    status: data.status,
  });

  const [receiptBase64, setReceiptBase64] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1000;
          const MAX_HEIGHT = 1000;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.onerror = (error) => reject(error);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file.');
      return;
    }
    
    if (file.size > 10 * 1024 * 1024) {
      setError('File is too large. Please upload an image under 10MB.');
      return;
    }

    try {
      const base64 = await compressImage(file);
      setReceiptBase64(base64);
      setError(null);
    } catch (err) {
      setError('Failed to process image.');
      console.error(err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const amount = parseFloat(formData.totalAmount);
    if (isNaN(amount) || amount < 0) {
      setError('Invalid total amount.');
      setIsSubmitting(false);
      return;
    }

    const result = await updateRegistrationDetails(data.id, data.attendeeId, {
      ...formData,
      totalAmount: amount,
      receiptBase64
    });

    if (result.success) {
      onClose();
    } else {
      setError(result.message || 'An error occurred.');
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div 
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        className="relative max-w-2xl w-full max-h-[90vh] flex flex-col bg-[#1c272a] border border-white/20 rounded-2xl overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-6 border-b border-white/10 bg-white/5">
          <h2 className="text-xl font-bold text-white">Edit Registration (R{String(data.orderNumber).padStart(5, '0')})</h2>
          <button onClick={onClose} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-xl text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Full Name</label>
              <input 
                required 
                value={formData.name} 
                onChange={e => setFormData({...formData, name: e.target.value})} 
                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-poster-accent transition-colors" 
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Email Address</label>
              <input 
                type="email" 
                required 
                value={formData.email} 
                onChange={e => setFormData({...formData, email: e.target.value})} 
                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-poster-accent transition-colors" 
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Phone Number</label>
              <input 
                required 
                value={formData.phone} 
                onChange={e => setFormData({...formData, phone: e.target.value})} 
                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-poster-accent transition-colors" 
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Outreach Location</label>
              <select 
                value={formData.outreach} 
                onChange={e => setFormData({...formData, outreach: e.target.value as OutreachLocation})} 
                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-poster-accent transition-colors"
              >
                <option value="JOHOR_BAHRU">Johor Bahru</option>
                <option value="ISKANDAR_PUTERI">Iskandar Puteri</option>
                <option value="TAMAN_DAYA">Taman Daya</option>
                <option value="PELANGI_INDAH">Pelangi Indah</option>
                <option value="MELAKA">Melaka</option>
                <option value="SIMPANG_RENGGAM">Simpang Renggam</option>
                <option value="OTHERS">Others</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Total Amount (RM)</label>
              <input 
                type="number" 
                step="0.01" 
                required 
                value={formData.totalAmount} 
                onChange={e => setFormData({...formData, totalAmount: e.target.value})} 
                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-poster-accent transition-colors font-mono" 
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Status</label>
              <select 
                value={formData.status} 
                onChange={e => setFormData({...formData, status: e.target.value as RegistrationStatus})} 
                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-poster-accent transition-colors"
              >
                <option value="PENDING_FOR_PAYMENT">Pending Payment</option>
                <option value="PENDING_FOR_REVIEW">Pending Review</option>
                <option value="PAYMENT_REJECTED">Payment Rejected</option>
                <option value="SEAT_SECURED">Seat Secured</option>
                <option value="CONTACT_ADMIN">Contact Admin</option>
                <option value="TICKET_CANCELLED">Ticket Cancelled</option>
              </select>
            </div>
          </div>

          <div className="space-y-2 pt-4 border-t border-white/10">
            <label className="text-sm font-medium text-slate-300">Replace Payment Receipt (Optional)</label>
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-white/20 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer hover:border-poster-accent hover:bg-white/5 transition-all group"
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept="image/*" 
                className="hidden" 
              />
              {receiptBase64 ? (
                <div className="relative group/img">
                  <img src={receiptBase64} alt="New Receipt" className="h-32 object-contain rounded-lg" />
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity rounded-lg">
                    <span className="text-sm font-medium text-white">Change Image</span>
                  </div>
                </div>
              ) : data.receiptUrl ? (
                <div className="relative group/img">
                  <img src={data.receiptUrl} alt="Existing Receipt" className="h-32 object-contain rounded-lg opacity-50" />
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity rounded-lg">
                    <span className="text-sm font-medium text-white">Upload New</span>
                  </div>
                </div>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3 group-hover:bg-poster-accent/20 transition-colors">
                    <Upload className="w-6 h-6 text-slate-400 group-hover:text-poster-accent transition-colors" />
                  </div>
                  <p className="text-sm text-slate-300 font-medium">Click to upload image</p>
                  <p className="text-xs text-slate-500 mt-1">PNG, JPG up to 10MB</p>
                </>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-6 border-t border-white/10">
            <button type="button" onClick={onClose} disabled={isSubmitting} className="px-6 py-3 rounded-xl border border-white/10 hover:bg-white/5 transition-colors text-sm font-medium">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} className="flex items-center gap-2 px-6 py-3 rounded-xl bg-poster-accent text-poster-bg font-medium hover:bg-poster-accent-bright transition-colors disabled:opacity-70 text-sm">
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Changes
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
