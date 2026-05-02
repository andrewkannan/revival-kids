'use client';

import React, { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import { checkCapacity, lockTicketsAction, releaseLockAction, finalizeRegistration, getPricing, uploadReceipt } from '@/actions/registration';

const OutreachLocationEnum = z.enum([
  'JOHOR_BAHRU', 'ISKANDAR_PUTERI', 'TAMAN_DAYA', 
  'PELANGI_INDAH', 'MELAKA', 'SIMPANG_RENGGAM', 'OTHERS'
]);

const step1Schema = z.object({
  name: z.string().min(2, 'Name is required'),
  email: z.string().email('Invalid email address'),
  phone: z.string().min(8, 'Phone number is required'),
  outreach: OutreachLocationEnum,
});

const step2Schema = z.object({
  kidsData: z.array(z.object({
    name: z.string().min(2, 'Name is required'),
    age: z.number().min(4, 'Age must be at least 4').max(18, 'Age must be 18 or under')
  })).min(1, 'You must add at least one kid')
});

type FormData = z.infer<typeof step1Schema> & z.infer<typeof step2Schema> & { kidsTickets: number };

export default function RegistrationWizard() {
  const [step, setStep] = useState(1);
  const [sessionId, setSessionId] = useState('');
  const [isLocking, setIsLocking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registrationId, setRegistrationId] = useState<string | null>(null);
  const [pricing, setPricing] = useState({ kidsPrice: 25, kidsPriceOriginal: 35, isEarlyBird: true });
  
  const { register, control, handleSubmit, formState: { errors }, watch, trigger, getValues, setValue } = useForm<FormData>({
    resolver: zodResolver(step === 1 ? step1Schema : step2Schema) as any,
    defaultValues: {
      name: '', email: '', phone: '', outreach: 'JOHOR_BAHRU',
      kidsData: [],
      kidsTickets: 0
    },
    mode: 'onChange'
  });

  const { fields, append, remove, update } = useFieldArray({
    control,
    name: "kidsData"
  });

  const formData = watch();

  useEffect(() => {
    // Generate a simple session ID for the Redis lock
    setSessionId(Math.random().toString(36).substring(2, 15));
    // Fetch dynamic pricing from backend
    getPricing().then(p => setPricing(p));
  }, []);

  const totalAmount = (fields.length * pricing.kidsPrice);

  const nextStep = async () => {
    const isStepValid = await trigger();
    if (!isStepValid) return;

    if (step === 2) {
      // Trying to move to Step 3 (Lock & Summary)
      setIsLocking(true);
      setError(null);
      try {
        const res = await lockTicketsAction(sessionId, fields.length);
        if (res.success) {
          setValue('kidsTickets', fields.length);
          setStep(3);
        } else {
          setError(res.message || 'Failed to secure tickets. They may be sold out.');
        }
      } catch (err) {
        setError('A network error occurred.');
      } finally {
        setIsLocking(false);
      }
    } else {
      setStep(prev => prev + 1);
    }
  };

  const prevStep = () => {
    setStep(prev => prev - 1);
    setError(null);
  };

  const cancelLock = async () => {
    setIsLocking(true);
    await releaseLockAction(sessionId);
    setStep(2);
    setIsLocking(false);
  };

  const onSubmitFinal = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await finalizeRegistration(getValues(), sessionId);
      if (result.success && result.registrationId) {
        setRegistrationId(result.registrationId);
        setStep(4); // Payment Upload step
      } else {
        setError(result.message || 'Failed to complete registration.');
      }
    } catch (err) {
      setError('A network error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 800;
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
          
          // Compress to JPEG with 0.7 quality
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          resolve(dataUrl);
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  const onUploadReceipt = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!registrationId) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const form = e.currentTarget;
      const fileInput = form.elements.namedItem('receipt') as HTMLInputElement;
      const file = fileInput.files?.[0];
      
      if (!file) {
        setError("Please select a file.");
        setIsSubmitting(false);
        return;
      }

      // Compress image to Base64 to ensure instant upload
      const compressedBase64 = await compressImage(file);
      
      const formData = new FormData();
      formData.append('receiptBase64', compressedBase64);

      const res = await uploadReceipt(registrationId, formData);
      if (res.success) {
        setStep(5); // Success step
      } else {
        setError(res.message || 'Failed to upload receipt.');
      }
    } catch (err) {
      console.error(err);
      setError('An error occurred while uploading. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white/5 border border-white/10 rounded-[2rem] p-6 md:p-8 backdrop-blur-md relative overflow-hidden min-h-[450px] shadow-2xl">
      
      {/* Step Indicator */}
      {step < 5 && (
        <div className="flex space-x-2 mb-8">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className={`h-2 flex-1 rounded-full transition-all duration-500 ${step >= i ? 'bg-poster-accent shadow-[0_0_10px_rgba(248,24,56,0.5)]' : 'bg-white/10'}`} />
          ))}
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-200 text-sm flex items-center gap-3">
          <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          {error}
        </div>
      )}

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div 
            key="step1"
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            className="space-y-4"
          >
            <h3 className="text-2xl font-black mb-6 tracking-tight">Your Details</h3>
            
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Parents Name - Father/ Mother</label>
              <input {...register('name')} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3.5 text-white focus:outline-none focus:border-poster-accent/50 focus:ring-1 focus:ring-poster-accent/50 transition-all" placeholder="John & Jane Doe" />
              {errors.name && <span className="text-red-400 text-xs mt-1.5 block font-medium">{errors.name.message}</span>}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Email Address</label>
              <input type="email" {...register('email')} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3.5 text-white focus:outline-none focus:border-poster-accent/50 focus:ring-1 focus:ring-poster-accent/50 transition-all" placeholder="parents@example.com" />
              {errors.email && <span className="text-red-400 text-xs mt-1.5 block font-medium">{errors.email.message}</span>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Phone Number</label>
              <input type="tel" {...register('phone')} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3.5 text-white focus:outline-none focus:border-poster-accent/50 focus:ring-1 focus:ring-poster-accent/50 transition-all" placeholder="+60 12-345 6789" />
              {errors.phone && <span className="text-red-400 text-xs mt-1.5 block font-medium">{errors.phone.message}</span>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Outreach Location</label>
              <select {...register('outreach')} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3.5 text-white focus:outline-none focus:border-poster-accent/50 focus:ring-1 focus:ring-poster-accent/50 transition-all appearance-none">
                <option value="JOHOR_BAHRU">Johor Bahru</option>
                <option value="ISKANDAR_PUTERI">Iskandar Puteri</option>
                <option value="TAMAN_DAYA">Taman Daya</option>
                <option value="PELANGI_INDAH">Pelangi Indah</option>
                <option value="MELAKA">Melaka</option>
                <option value="SIMPANG_RENGGAM">Simpang Renggam</option>
                <option value="OTHERS">Others</option>
              </select>
            </div>

            <button type="button" onClick={nextStep} className="w-full bg-poster-accent text-white font-bold py-4 rounded-xl hover:bg-poster-accent-bright transition-all shadow-lg shadow-poster-accent/20 mt-8 active:scale-[0.98]">
              Continue to Kids Details
            </button>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div 
            key="step2"
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <h3 className="text-2xl font-black mb-2 tracking-tight">Kids Details</h3>
            <p className="text-slate-300 text-sm">Please add the details of the kids attending. The ticket cost will automatically update.</p>
            {pricing.isEarlyBird && <p className="text-sm text-green-400 mb-6 font-medium bg-green-400/10 p-2.5 rounded-lg border border-green-400/20 inline-block">✨ Early Bird Pricing Active (RM {pricing.kidsPrice.toFixed(2)} / kid)</p>}

            <div className="space-y-4 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
              {fields.map((field, index) => (
                <div key={field.id} className="p-4 bg-white/5 border border-white/10 rounded-2xl relative shadow-sm">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="font-bold text-poster-accent">Kid #{index + 1}</h4>
                    <button type="button" onClick={() => remove(index)} className="text-red-400 hover:text-red-300 text-xs font-medium px-2 py-1 bg-red-400/10 rounded-lg transition-colors">Remove</button>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Name</label>
                      <input {...register(`kidsData.${index}.name` as const)} className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:border-poster-accent/50 transition-colors" placeholder="e.g. Sarah" />
                      {errors.kidsData?.[index]?.name && <span className="text-red-400 text-xs mt-1 block">{errors.kidsData[index]?.name?.message}</span>}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Starting Age</label>
                      <div className="flex items-center space-x-3 bg-black/40 border border-white/10 rounded-xl p-1.5 w-max">
                        <button type="button" onClick={() => { const current = getValues(`kidsData.${index}.age`); if(current > 4) update(index, { ...getValues(`kidsData.${index}`), age: current - 1}) }} className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors font-bold text-lg active:scale-95">-</button>
                        <span className="w-6 text-center font-bold text-lg">{watch(`kidsData.${index}.age`)}</span>
                        <button type="button" onClick={() => { const current = getValues(`kidsData.${index}.age`); if(current < 18) update(index, { ...getValues(`kidsData.${index}`), age: current + 1}) }} className="w-9 h-9 rounded-lg bg-poster-accent text-white flex items-center justify-center hover:bg-poster-accent-bright transition-colors font-bold text-lg active:scale-95">+</button>
                      </div>
                      {errors.kidsData?.[index]?.age && <span className="text-red-400 text-xs mt-1 block">{errors.kidsData[index]?.age?.message}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button type="button" onClick={() => append({ name: '', age: 4 })} className="w-full py-4 border-2 border-dashed border-white/20 rounded-2xl text-slate-300 hover:bg-white/5 hover:text-white hover:border-white/40 transition-all flex items-center justify-center gap-2 font-semibold">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Add Another Kid
            </button>

            {errors.kidsData?.root && <span className="text-red-400 text-xs block font-medium text-center">{errors.kidsData.root.message}</span>}
            {errors.kidsData?.message && <span className="text-red-400 text-sm block font-medium text-center bg-red-500/10 p-2 rounded-lg">{errors.kidsData.message}</span>}

            <div className="flex justify-between items-center p-4 bg-black/30 rounded-xl border border-white/5 mt-6">
              <span className="text-slate-300 font-medium">Subtotal</span>
              <span className="font-black text-2xl text-white">RM {totalAmount.toFixed(2)}</span>
            </div>

            <div className="flex space-x-3 mt-8">
              <button type="button" onClick={prevStep} className="px-6 py-4 rounded-xl border border-white/20 hover:bg-white/10 transition-colors font-medium">
                Back
              </button>
              <button type="button" onClick={nextStep} disabled={isLocking || fields.length === 0} className="flex-1 bg-poster-accent text-white font-bold py-4 rounded-xl hover:bg-poster-accent-bright transition-all disabled:opacity-50 disabled:grayscale flex items-center justify-center shadow-lg shadow-poster-accent/20 active:scale-[0.98]">
                {isLocking ? 'Securing Tickets...' : 'Review & Lock Seats'}
              </button>
            </div>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div 
            key="step3"
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="flex items-center space-x-3 text-green-400 mb-6 bg-green-400/10 p-4 rounded-xl border border-green-400/20">
              <svg className="w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              <span className="text-sm font-medium">Your seats are locked for 10 minutes.</span>
            </div>

            <h3 className="text-2xl font-black mb-2 tracking-tight">Order Summary</h3>
            
            <div className="space-y-4 bg-black/40 p-6 rounded-2xl border border-white/5 shadow-inner">
              <div className="space-y-1">
                <div className="font-bold text-white text-xl">{formData.name}</div>
                <div className="text-slate-400 text-sm font-medium">{formData.email}</div>
              </div>
              <hr className="border-white/10" />
              {fields.length > 0 && (
                <div className="space-y-2">
                  <div className="flex justify-between text-slate-300 font-medium mb-1">
                    <span>{fields.length}x Kids Ticket</span>
                    <span>RM {totalAmount.toFixed(2)}</span>
                  </div>
                  <div className="pl-3 border-l-2 border-white/10 space-y-1">
                    {formData.kidsData?.map((kid, i) => (
                      <div key={i} className="text-xs text-slate-400 font-medium">
                        • {kid.name || `Kid #${i + 1}`} (Age {kid.age})
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <hr className="border-white/10" />
              <div className="flex justify-between font-black text-2xl pt-2">
                <span>Total</span>
                <span className="text-poster-accent-bright">RM {totalAmount.toFixed(2)}</span>
              </div>
            </div>

            <div className="flex space-x-3 mt-8">
              <button type="button" onClick={cancelLock} disabled={isSubmitting} className="px-6 py-4 rounded-xl border border-white/20 hover:bg-white/10 transition-colors font-medium">
                Back
              </button>
              <button type="button" onClick={onSubmitFinal} disabled={isSubmitting} className="flex-1 bg-white text-poster-bg font-bold py-4 rounded-xl hover:bg-slate-200 transition-all disabled:opacity-70 shadow-xl active:scale-[0.98]">
                {isSubmitting ? 'Processing...' : 'Proceed to Payment'}
              </button>
            </div>
          </motion.div>
        )}

        {step === 4 && (
          <motion.div 
            key="step4"
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <h3 className="text-2xl font-black mb-2 tracking-tight">Payment Details</h3>
            <p className="text-slate-300 text-sm mb-4 leading-relaxed">Please transfer the total amount of <strong className="text-white text-lg font-mono bg-white/10 px-2 py-0.5 rounded">RM {totalAmount.toFixed(2)}</strong> to the bank account below and upload your receipt.</p>
            
            <div className="bg-black/40 p-5 rounded-2xl border border-white/10 mb-6 font-mono text-sm space-y-3 shadow-inner">
              <div className="flex justify-between items-center border-b border-white/5 pb-2">
                <span className="text-slate-400">Bank Name</span>
                <span className="font-bold text-base">Maybank</span>
              </div>
              <div className="flex justify-between items-center border-b border-white/5 pb-2">
                <span className="text-slate-400">Account Name</span>
                <span className="font-bold text-base">CALVARY COMMUNITY TT</span>
              </div>
              <div className="flex justify-between items-center border-b border-white/5 pb-2">
                <span className="text-slate-400">Account Number</span>
                <span className="font-black tracking-widest text-lg text-poster-accent-bright">551016737305</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Reference</span>
                <span className="font-black tracking-widest text-lg text-poster-accent-bright">BIL CONF</span>
              </div>
            </div>

            <form onSubmit={onUploadReceipt} className="space-y-6">
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-sm text-blue-200 text-center leading-relaxed font-medium">
                Provide a screenshot or PDF receipt showing the amount, date, and reference for payment verification.
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-300 mb-2">Upload Payment Receipt</label>
                <input 
                  type="file" 
                  name="receipt" 
                  accept="image/*" 
                  required
                  className="w-full text-sm text-slate-300 file:mr-4 file:py-3 file:px-6 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-poster-accent file:text-white hover:file:bg-poster-accent-bright border border-white/10 rounded-xl bg-black/40 file:cursor-pointer transition-all"
                />
              </div>

              <button type="submit" disabled={isSubmitting} className="w-full bg-white text-poster-bg font-bold py-4 rounded-xl hover:bg-slate-200 transition-all disabled:opacity-70 shadow-xl active:scale-[0.98]">
                {isSubmitting ? 'Uploading...' : 'Submit Proof'}
              </button>
            </form>
          </motion.div>
        )}

        {step === 5 && (
          <motion.div 
            key="step5"
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="text-center py-12"
          >
            <div className="w-24 h-24 bg-gradient-to-tr from-poster-accent to-poster-accent-bright rounded-full mx-auto flex items-center justify-center mb-8 shadow-[0_0_40px_rgba(248,24,56,0.4)]">
              <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
            </div>
            <h3 className="text-4xl font-black mb-4 tracking-tight">You're In!</h3>
            <p className="text-slate-300 mb-10 max-w-sm mx-auto leading-relaxed text-sm font-medium">
              Your registration and payment receipt have been submitted. Our team will review the transaction and send your ticket confirmation to your email shortly.
            </p>
            <button type="button" onClick={() => window.location.reload()} className="bg-white/10 border border-white/20 text-white font-bold px-8 py-4 rounded-xl hover:bg-white/20 transition-all active:scale-[0.98]">
              Register Another Family
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
