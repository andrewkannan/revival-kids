'use client';

import React, { useState, useMemo } from 'react';
import { RegistrationStatus, Registration, Attendee, OutreachLocation, Ticket } from '@prisma/client';
import { BadgeCheck, Clock, XCircle, AlertCircle, Search, X, Edit2, Download, FileArchive, QrCode, Trash2, Ticket as TicketIcon, CheckCircle2, Circle } from 'lucide-react';
import JSZip from 'jszip';
import { deleteRegistration } from '@/actions/admin';
import { toggleAllCollections } from '@/actions/scanner';
import StatusSelect from '@/components/admin/StatusSelect';
import EditRegistrationModal, { EditData } from '@/components/admin/EditRegistrationModal';
import { motion, AnimatePresence } from 'framer-motion';

type RegistrationWithAttendee = Omit<Registration, 'totalAmount'> & { 
  totalAmount: string;
  orderNumber: number;
  attendee: Attendee; 
  tickets: Ticket[];
  kids: { name: string; age: number }[];
};

interface Props {
  initialData: RegistrationWithAttendee[];
}

export default function RegistrationsTable({ initialData }: Props) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<RegistrationStatus | 'ALL'>('ALL');
  const [outreachFilter, setOutreachFilter] = useState<OutreachLocation | 'ALL'>('ALL');
  const [receiptModal, setReceiptModal] = useState<{ url: string; queueNum: string } | null>(null);
  const [ticketsModal, setTicketsModal] = useState<{ reg: RegistrationWithAttendee } | null>(null);
  const [editingData, setEditingData] = useState<EditData | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to permanently delete this registration?')) {
      setIsDeleting(id);
      await deleteRegistration(id);
      setIsDeleting(null);
    }
  };

  const exportCSV = () => {
    const headers = ['Queue No', 'Name', 'Email', 'Phone', 'Location', 'Kids Tickets', 'Kids Details', 'Total Amount', 'Status', 'Date'];
    const rows = filteredAndSorted.map(reg => [
      formatQueue(reg.orderNumber),
      `"${reg.attendee.name.replace(/"/g, '""')}"`,
      reg.attendee.email,
      reg.attendee.phone,
      reg.attendee.outreach,
      reg.kidsTickets,
      `"${reg.kids.map(k => `${k.name} (${k.age})`).join(', ')}"`,
      reg.totalAmount,
      reg.status,
      new Date(reg.createdAt).toLocaleDateString()
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Registrations_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportReceiptsZip = async () => {
    setIsExporting(true);
    try {
      const zip = new JSZip();
      let hasFiles = false;
      
      filteredAndSorted.forEach(reg => {
        if (reg.receiptUrl) {
          hasFiles = true;
          const base64Data = reg.receiptUrl.split(',')[1] || reg.receiptUrl;
          zip.file(`${formatQueue(reg.orderNumber)}_${reg.attendee.name.replace(/[^a-zA-Z0-9]/g, '_')}_Receipt.jpg`, base64Data, { base64: true });
        }
      });

      if (!hasFiles) {
        alert("No receipts found in the current filtered list.");
        setIsExporting(false);
        return;
      }

      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `Receipts_${new Date().toISOString().split('T')[0]}.zip`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error("Error generating zip:", e);
      alert("Failed to generate zip file.");
    } finally {
      setIsExporting(false);
    }
  };

  const formatQueue = (num: number) => 'R' + String(num).padStart(5, '0');

  const formatPhoneForWhatsapp = (phone: string) => {
    let cleaned = phone.replace(/[^0-9]/g, '');
    // If it starts with 0 (e.g., 0123456789), replace with 60 (Malaysia code)
    if (cleaned.startsWith('0')) {
      cleaned = '6' + cleaned;
    }
    return cleaned;
  };

  const getStatusIcon = (status: RegistrationStatus) => {
    switch (status) {
      case 'SEAT_SECURED': return <BadgeCheck className="w-4 h-4 text-emerald-400" />;
      case 'PENDING_FOR_PAYMENT': return <Clock className="w-4 h-4 text-amber-400" />;
      case 'PENDING_FOR_REVIEW': return <AlertCircle className="w-4 h-4 text-blue-400" />;
      case 'PAYMENT_REJECTED': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'CONTACT_ADMIN': return <XCircle className="w-4 h-4 text-red-400" />;
      case 'TICKET_CANCELLED': return <XCircle className="w-4 h-4 text-slate-500" />;
    }
  };

  const filteredAndSorted = useMemo(() => {
    let result = initialData.filter(reg => {
      // Status filter
      if (statusFilter !== 'ALL' && reg.status !== statusFilter) return false;
      
      // Outreach filter
      if (outreachFilter !== 'ALL' && reg.attendee.outreach !== outreachFilter) return false;
      
      // Search filter
      if (search) {
        const query = search.toLowerCase();
        if (
          !reg.attendee.name.toLowerCase().includes(query) &&
          !reg.attendee.email.toLowerCase().includes(query) &&
          !reg.kids.some(kid => kid.name.toLowerCase().includes(query))
        ) {
          return false;
        }
      }
      return true;
    });

    // Sort: PENDING_FOR_REVIEW first, then by createdAt desc
    result.sort((a, b) => {
      if (a.status === 'PENDING_FOR_REVIEW' && b.status !== 'PENDING_FOR_REVIEW') return -1;
      if (a.status !== 'PENDING_FOR_REVIEW' && b.status === 'PENDING_FOR_REVIEW') return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return result;
  }, [initialData, search, statusFilter, outreachFilter]);

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 bg-white/5 p-4 rounded-2xl border border-white/10">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search attendee or kid's name, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-black/50 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-white/30"
          />
        </div>
        
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="bg-black/50 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-white/30"
        >
          <option value="ALL">All Statuses</option>
          <option value="PENDING_FOR_PAYMENT">Pending Payment</option>
          <option value="PENDING_FOR_REVIEW">Pending Review</option>
          <option value="PAYMENT_REJECTED">Payment Rejected</option>
          <option value="SEAT_SECURED">Seat Secured</option>
          <option value="CONTACT_ADMIN">Contact Admin</option>
          <option value="TICKET_CANCELLED">Ticket Cancelled</option>
        </select>

        <select
          value={outreachFilter}
          onChange={(e) => setOutreachFilter(e.target.value as any)}
          className="bg-black/50 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-white/30"
        >
          <option value="ALL">All Locations</option>
          <option value="JOHOR_BAHRU">Johor Bahru</option>
          <option value="ISKANDAR_PUTERI">Iskandar Puteri</option>
          <option value="TAMAN_DAYA">Taman Daya</option>
          <option value="PELANGI_INDAH">Pelangi Indah</option>
          <option value="MELAKA">Melaka</option>
          <option value="SIMPANG_RENGGAM">Simpang Renggam</option>
          <option value="OTHERS">Others</option>
        </select>
      </div>

      {/* Export Actions */}
      <div className="flex flex-col sm:flex-row justify-end gap-3">
        <button 
          onClick={exportCSV} 
          className="flex items-center justify-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm text-slate-300 hover:text-white transition-colors"
        >
          <Download className="w-4 h-4" /> Export CSV (Excel)
        </button>
        <button 
          onClick={exportReceiptsZip} 
          disabled={isExporting}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-poster-accent/20 hover:bg-poster-accent/30 text-poster-accent border border-poster-accent/30 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
        >
          <FileArchive className="w-4 h-4" /> {isExporting ? 'Zipping...' : 'Download Receipts (ZIP)'}
        </button>
      </div>

      {/* Table & Mobile Cards */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden shadow-xl">
        {/* Desktop Table */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="text-xs uppercase bg-white/5 text-slate-400 border-b border-white/10">
              <tr>
                <th className="px-4 py-4 font-medium">Queue No.</th>
                <th className="px-4 py-4 font-medium">Attendee</th>
                <th className="px-4 py-4 font-medium">Order Details</th>
                <th className="px-4 py-4 font-medium text-center">Receipt</th>
                <th className="px-4 py-4 font-medium text-right">Status & Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSorted.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center">
                      <Search className="w-8 h-8 mb-2 opacity-50" />
                      <p>No registrations match your filters.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredAndSorted.map((reg) => (
                  <tr 
                    key={reg.id} 
                    className={`border-b border-white/5 transition-all duration-300 ${
                      reg.status === 'SEAT_SECURED' ? 'bg-black/80 opacity-50 grayscale hover:grayscale-0 hover:opacity-100' : 'hover:bg-white/[0.04]'
                    } ${reg.status === 'PENDING_FOR_REVIEW' ? 'bg-poster-accent/10 border-l-4 border-l-poster-accent' : 
                        reg.status === 'PAYMENT_REJECTED' ? 'bg-red-500/10 border-l-4 border-l-red-500' : 'border-l-4 border-l-transparent'}`}
                  >
                    <td className="px-4 py-4 font-mono font-bold text-poster-accent whitespace-nowrap">
                      {formatQueue(reg.orderNumber)}
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-medium text-white">{reg.attendee.name}</div>
                      <div className="text-slate-400 text-xs mt-0.5">{reg.attendee.email}</div>
                      <div className="text-slate-400 text-xs mt-0.5 flex items-center gap-2">
                        {reg.attendee.phone}
                        <a 
                          href={`https://wa.me/${formatPhoneForWhatsapp(reg.attendee.phone)}?text=Hi ${encodeURIComponent(reg.attendee.name)}, regarding your REVIVAL KIDS registration...`} 
                          target="_blank" 
                          rel="noreferrer"
                          className="text-emerald-400 hover:text-emerald-300 transition-colors"
                          title="Message on WhatsApp"
                        >
                          <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
                          </svg>
                        </a>
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="font-medium text-white mb-0.5">RM {reg.totalAmount}</div>
                      <div className="text-slate-400 text-xs">
                        {reg.kidsTickets} Tickets
                      </div>
                      <div className="text-slate-400 text-xs mt-0.5">
                        {reg.attendee.outreach.replace('_', ' ')}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {reg.kids.map((kid, idx) => (
                          <span key={idx} className="bg-white/10 text-[10px] px-1.5 py-0.5 rounded text-slate-300">
                            {kid.name} ({kid.age})
                          </span>
                        ))}
                      </div>
                      {reg.status === 'SEAT_SECURED' && (
                        <div className="mt-3">
                          <button 
                            onClick={() => {
                              const isCollected = (reg as any).wristbandsCollected && (reg as any).starterPacksCollected;
                              toggleAllCollections(reg.id, !isCollected);
                            }}
                            className={`w-full flex justify-center items-center gap-2 px-3 py-2 text-xs uppercase font-bold rounded-lg transition-colors border ${
                              ((reg as any).wristbandsCollected && (reg as any).starterPacksCollected) 
                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30' 
                                : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10 hover:text-white'
                            }`}
                          >
                            {((reg as any).wristbandsCollected && (reg as any).starterPacksCollected) ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                            {((reg as any).wristbandsCollected && (reg as any).starterPacksCollected) ? 'Starter Pack Collected' : 'Mark Starter Pack Collected'}
                          </button>
                          {(reg as any).collectedAt && (
                            <p className="text-[10px] text-slate-500 mt-1 text-center">
                              Collected: {new Date((reg as any).collectedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                            </p>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 text-center">
                      {reg.receiptUrl ? (
                        <button 
                          onClick={() => setReceiptModal({ url: reg.receiptUrl!, queueNum: formatQueue(reg.orderNumber) })}
                          className="text-poster-accent hover:text-poster-accent-bright underline text-xs font-medium cursor-pointer transition-colors whitespace-nowrap"
                        >
                          View Proof
                        </button>
                      ) : (
                        <span className="text-slate-500 text-xs whitespace-nowrap">No Receipt</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-col items-end gap-2">
                        {reg.status === 'SEAT_SECURED' && (
                          <button
                            onClick={() => setTicketsModal({ reg })}
                            className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 rounded transition-colors border border-emerald-500/20 whitespace-nowrap mt-2 sm:mt-0"
                          >
                            <QrCode className="w-3.5 h-3.5" /> View Ticket
                          </button>
                        )}
                        <StatusSelect registrationId={reg.id} currentStatus={reg.status} />
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => setEditingData({
                              id: reg.id,
                              attendeeId: reg.attendee.id,
                              name: reg.attendee.name,
                              email: reg.attendee.email,
                              phone: reg.attendee.phone,
                              outreach: reg.attendee.outreach,
                              totalAmount: reg.totalAmount,
                              status: reg.status,
                              receiptUrl: reg.receiptUrl,
                              orderNumber: reg.orderNumber
                            })}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 rounded transition-colors border border-white/10"
                          >
                            <Edit2 className="w-3.5 h-3.5" /> Edit
                          </button>
                          <button 
                            onClick={() => handleDelete(reg.id)}
                            disabled={isDeleting === reg.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-400 hover:text-white bg-red-500/10 hover:bg-red-500/80 rounded transition-colors border border-red-500/20 disabled:opacity-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> {isDeleting === reg.id ? '...' : 'Del'}
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile/Tablet Cards */}
        <div className="lg:hidden flex flex-col divide-y divide-white/5">
          {filteredAndSorted.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              <Search className="w-8 h-8 mb-2 opacity-50 mx-auto" />
              <p>No registrations match your filters.</p>
            </div>
          ) : (
            filteredAndSorted.map((reg) => (
              <div 
                key={reg.id} 
                className={`p-4 space-y-4 ${
                  reg.status === 'SEAT_SECURED' ? 'bg-black/40 grayscale opacity-75' : ''
                } ${reg.status === 'PENDING_FOR_REVIEW' ? 'bg-poster-accent/5' : 
                    reg.status === 'PAYMENT_REJECTED' ? 'bg-red-500/5' : ''}`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-mono font-bold text-poster-accent text-lg mb-1">{formatQueue(reg.orderNumber)}</div>
                    <div className="font-medium text-white text-base">{reg.attendee.name}</div>
                    <div className="text-slate-400 text-sm mt-0.5">{reg.attendee.email}</div>
                    <div className="text-slate-400 text-sm mt-1 flex items-center gap-2">
                      {reg.attendee.phone}
                      <a 
                        href={`https://wa.me/${formatPhoneForWhatsapp(reg.attendee.phone)}?text=Hi ${encodeURIComponent(reg.attendee.name)}, regarding your REVIVAL KIDS registration...`} 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-emerald-400 hover:text-emerald-300 transition-colors"
                        title="Message on WhatsApp"
                      >
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
                        </svg>
                      </a>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {reg.receiptUrl ? (
                      <button 
                        onClick={() => setReceiptModal({ url: reg.receiptUrl!, queueNum: formatQueue(reg.orderNumber) })}
                        className="px-3 py-1.5 bg-poster-accent/20 text-poster-accent text-xs font-medium rounded hover:bg-poster-accent/30 transition-colors"
                      >
                        View Proof
                      </button>
                    ) : (
                      <span className="text-slate-500 text-xs px-3 py-1.5">No Receipt</span>
                    )}
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setEditingData({
                          id: reg.id,
                          attendeeId: reg.attendee.id,
                          name: reg.attendee.name,
                          email: reg.attendee.email,
                          phone: reg.attendee.phone,
                          outreach: reg.attendee.outreach,
                          totalAmount: reg.totalAmount,
                          status: reg.status,
                          receiptUrl: reg.receiptUrl,
                          orderNumber: reg.orderNumber
                        })}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 rounded transition-colors border border-white/10"
                      >
                        <Edit2 className="w-3.5 h-3.5" /> Edit
                      </button>
                      <button 
                        onClick={() => handleDelete(reg.id)}
                        disabled={isDeleting === reg.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-400 hover:text-white bg-red-500/10 hover:bg-red-500/80 rounded transition-colors border border-red-500/20 disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> {isDeleting === reg.id ? '...' : 'Del'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-end bg-black/30 p-3 rounded-lg border border-white/5">
                  <div>
                    <div className="font-medium text-white mb-0.5">RM {reg.totalAmount}</div>
                    <div className="text-slate-400 text-xs">
                      {reg.kidsTickets} Tickets
                    </div>
                    <div className="text-slate-400 text-xs mt-0.5">
                      {reg.attendee.outreach.replace('_', ' ')}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {reg.kids.map((kid, idx) => (
                        <span key={idx} className="bg-white/10 text-[10px] px-1.5 py-0.5 rounded text-slate-300">
                          {kid.name} ({kid.age})
                        </span>
                      ))}
                    </div>
                    {reg.status === 'SEAT_SECURED' && (
                      <div className="mt-4">
                        <button 
                          onClick={() => {
                            const isCollected = (reg as any).wristbandsCollected && (reg as any).starterPacksCollected;
                            toggleAllCollections(reg.id, !isCollected);
                          }}
                          className={`w-full flex justify-center items-center gap-2 px-3 py-2 text-xs uppercase font-bold rounded-lg transition-colors border ${
                            ((reg as any).wristbandsCollected && (reg as any).starterPacksCollected) 
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30' 
                              : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          {((reg as any).wristbandsCollected && (reg as any).starterPacksCollected) ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                          {((reg as any).wristbandsCollected && (reg as any).starterPacksCollected) ? 'Starter Pack Collected' : 'Mark Starter Pack Collected'}
                        </button>
                        {(reg as any).collectedAt && (
                          <p className="text-[10px] text-slate-500 mt-1.5 text-center">
                            Collected: {new Date((reg as any).collectedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {reg.status === 'SEAT_SECURED' && (
                      <button
                        onClick={() => setTicketsModal({ reg })}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 rounded transition-colors border border-emerald-500/20"
                      >
                        <QrCode className="w-3.5 h-3.5" /> View Ticket
                      </button>
                    )}
                    <StatusSelect registrationId={reg.id} currentStatus={reg.status} />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {receiptModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
            onClick={() => setReceiptModal(null)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative max-w-4xl w-full max-h-[90vh] flex flex-col bg-[#1c272a] border border-white/20 rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)]"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center p-4 border-b border-white/10 bg-white/5">
                <h3 className="font-semibold text-white">Payment Receipt - {receiptModal.queueNum}</h3>
                <div className="flex items-center gap-2">
                  <a
                    href={receiptModal.url}
                    download={`${receiptModal.queueNum}_Receipt.jpg`}
                    className="px-4 py-2 bg-poster-accent text-poster-bg text-sm font-medium rounded-lg hover:bg-poster-accent-bright transition-colors"
                  >
                    Download Receipt
                  </a>
                  <button onClick={() => setReceiptModal(null)} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors text-slate-400 hover:text-white ml-2">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="overflow-auto p-4 flex justify-center items-center bg-black/50 min-h-[50vh]">
                <img src={receiptModal.url} alt="Payment Receipt" className="max-w-full h-auto rounded-xl shadow-2xl" />
              </div>
            </motion.div>
          </motion.div>
        )}

        {ticketsModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
            onClick={() => setTicketsModal(null)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative max-w-2xl w-full max-h-[90vh] flex flex-col bg-[#1c272a] border border-white/20 rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)]"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center p-4 border-b border-white/10 bg-white/5">
                <h3 className="font-semibold text-white">E-Ticket - {formatQueue(ticketsModal.reg.orderNumber)}</h3>
                <button onClick={() => setTicketsModal(null)} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="overflow-auto p-6 bg-black/50 flex justify-center">
                <div className="bg-white max-w-sm w-full rounded-2xl overflow-hidden shadow-2xl relative border-2 border-white/10">
                  <div className="bg-[#ff203a] p-6 text-center text-white relative overflow-hidden rounded-t-2xl">
                    {/* Abstract colored blobs from poster */}
                    <div className="absolute -top-8 -left-8 w-32 h-32 bg-[#5ced73] rounded-full opacity-90 blur-[2px] pointer-events-none"></div>
                    <div className="absolute -bottom-12 -right-8 w-40 h-40 bg-[#ffcb05] rounded-full opacity-90 blur-[2px] pointer-events-none"></div>
                    <div className="absolute top-1/2 -left-10 w-28 h-28 bg-[#0f75ff] rounded-full opacity-90 blur-[2px] pointer-events-none"></div>
                    
                    <div className="relative z-10 font-sans" style={{ textShadow: '2px 2px 0px rgba(0,0,0,0.15)' }}>
                      <p className="m-0 mb-1 text-white font-bold text-xs tracking-widest uppercase opacity-90 drop-shadow-sm">ACTS 2:17-18</p>
                      <h2 className="m-0 text-4xl font-black tracking-wider text-white uppercase" style={{ fontFamily: '"Arial Black", Impact, sans-serif' }}>REVIVAL KIDS</h2>
                      <h3 className="m-0 text-2xl font-black tracking-widest text-white mt-1 uppercase" style={{ fontFamily: '"Arial Black", Impact, sans-serif' }}>CONFERENCE</h3>
                      <div className="inline-block bg-white text-[#ff203a] font-black text-sm px-4 py-1 rounded-xl mt-3 shadow-md" style={{ textShadow: 'none' }}>
                        2026
                      </div>
                    </div>
                  </div>
                  <div className="p-8 bg-white flex justify-center relative">
                    {/* Decorative cutouts */}
                    <div className="absolute top-1/2 -left-4 w-8 h-8 bg-slate-900 rounded-full -translate-y-1/2 shadow-inner"></div>
                    <div className="absolute top-1/2 -right-4 w-8 h-8 bg-slate-900 rounded-full -translate-y-1/2 shadow-inner"></div>
                    
                    {(ticketsModal.reg as any).qrCodeUrl ? (
                      <div className="p-2 border-4 border-[#ff203a]/20 rounded-3xl bg-white shadow-sm">
                        <img src={(ticketsModal.reg as any).qrCodeUrl} alt="QR Code" className="w-48 h-48 object-contain rounded-xl" />
                      </div>
                    ) : (
                      <div className="w-48 h-48 flex items-center justify-center border-4 border-dashed border-slate-200 rounded-2xl text-slate-400 text-sm text-center p-4 bg-slate-50">
                        QR code missing or not yet generated
                      </div>
                    )}
                  </div>
                  <div className="bg-[#f8fafc] border-t-4 border-dashed border-[#ff203a]/30 p-6 text-center rounded-b-2xl">
                    {ticketsModal.reg.kids && ticketsModal.reg.kids.length > 0 && (
                      <div className="flex flex-col items-center justify-center gap-1 mb-4">
                        {ticketsModal.reg.kids.map((kid: any, idx: number) => (
                          <span key={idx} className="text-2xl font-black text-[#ff203a] leading-tight uppercase" style={{ fontFamily: '"Arial Black", Impact, sans-serif', letterSpacing: '1px' }}>
                            {kid.name}
                          </span>
                        ))}
                      </div>
                    )}
                    
                    <div className="inline-block bg-black text-white px-4 py-1 mb-3 rounded shadow-sm">
                      <p className="m-0 font-bold uppercase tracking-widest text-xs">
                        {ticketsModal.reg.kidsTickets} {ticketsModal.reg.kidsTickets === 1 ? 'Ticket' : 'Tickets'}
                      </p>
                    </div>
                    <p className="m-0 font-black text-lg tracking-widest text-slate-800 uppercase" style={{ fontFamily: '"Arial Black", Impact, sans-serif' }}>
                      {formatQueue(ticketsModal.reg.orderNumber)}
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {editingData && (
          <EditRegistrationModal 
            data={editingData} 
            onClose={() => setEditingData(null)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}
