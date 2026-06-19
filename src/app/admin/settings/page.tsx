'use client';

import { useState, useEffect } from 'react';
import { getAdminConfig, updateAdminConfig, getEmailSettings, updateEmailSettings, getEmailTemplate, updateEmailTemplate, wipeDatabase } from '@/actions/admin';
import { Save, Loader2, Info, Mail, Settings as SettingsIcon, LayoutTemplate, AlertTriangle } from 'lucide-react';
import { TemplateType } from '@prisma/client';

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [activeTab, setActiveTab] = useState<'general' | 'smtp' | 'templates'>('general');
  const [activeTemplate, setActiveTemplate] = useState<TemplateType>('INVOICE');
  const [testEmail, setTestEmail] = useState('');
  
  const [bulkTarget, setBulkTarget] = useState('ALL');
  const handleBulkSend = async () => {
    if (!window.confirm(`Are you sure you want to queue bulk emails for status: ${bulkTarget}?`)) return;
    setSaving(true);
    setMessage({ text: 'Queueing bulk emails...', type: 'info' });
    const { enqueueBulkReminder } = await import('@/actions/admin');
    const result = await enqueueBulkReminder(bulkTarget);
    if (result.success) {
      setMessage({ text: result.message, type: 'success' });
    } else {
      setMessage({ text: result.message || 'Failed to queue.', type: 'error' });
    }
    setSaving(false);
    setTimeout(() => setMessage({ text: '', type: '' }), 5000);
  };

  const [generalData, setGeneralData] = useState({
    kidsCapacity: 100,
    isEarlyBird: true,
    earlyBirdEndDate: '',
    kidsPriceEarlyBird: 25,
    kidsPriceRegular: 40,
    isEmailQueuePaused: false,
  });

  const [smtpData, setSmtpData] = useState({
    host: '',
    port: 465,
    username: '',
    password: '',
    fromName: '',
    fromEmail: '',
  });

  const [templates, setTemplates] = useState<Record<string, { subject: string; bodyHtml: string }>>({});

  useEffect(() => {
    Promise.all([
      getAdminConfig(),
      getEmailSettings(),
      getEmailTemplate('INVOICE'),
      getEmailTemplate('E_TICKET'),
      getEmailTemplate('REMINDER'),
      getEmailTemplate('FINAL_REMINDER')
    ]).then(([config, smtp, invoice, eTicket, reminder, finalReminder]) => {
      setGeneralData({
        kidsCapacity: config.kidsCapacity,
        isEarlyBird: config.isEarlyBird,
        earlyBirdEndDate: config.earlyBirdEndDate ? new Date(config.earlyBirdEndDate).toISOString().split('T')[0] : '',
        kidsPriceEarlyBird: Number(config.kidsPriceEarlyBird),
        kidsPriceRegular: Number(config.kidsPriceRegular),
        isEmailQueuePaused: (config as any).isEmailQueuePaused || false,
      });

      setSmtpData({
        host: smtp.host,
        port: smtp.port,
        username: smtp.username || '',
        password: smtp.password || '',
        fromName: smtp.fromName,
        fromEmail: smtp.fromEmail || '',
      });

      setTemplates({
        INVOICE: { subject: invoice.subject, bodyHtml: invoice.bodyHtml },
        E_TICKET: { subject: eTicket.subject, bodyHtml: eTicket.bodyHtml },
        REMINDER: { subject: reminder.subject, bodyHtml: reminder.bodyHtml },
        FINAL_REMINDER: { subject: finalReminder.subject, bodyHtml: finalReminder.bodyHtml },
      });

      setLoading(false);
    });
  }, []);

  // Handlers for General Settings
  const handleGeneralChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setGeneralData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : (type === 'date' ? value : Number(value))
    }));
  };

  const handleGeneralSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ text: '', type: '' });

    const payload = {
      ...generalData,
      earlyBirdEndDate: generalData.earlyBirdEndDate ? new Date(generalData.earlyBirdEndDate) : null,
    };

    const result = await updateAdminConfig(payload);
    
    if (result.success) {
      setMessage({ text: 'General configuration saved successfully.', type: 'success' });
    } else {
      setMessage({ text: result.message || 'Failed to save.', type: 'error' });
    }
    setSaving(false);
    setTimeout(() => setMessage({ text: '', type: '' }), 3000);
  };

  // Handlers for SMTP Settings
  const handleSmtpChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    setSmtpData((prev) => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value
    }));
  };

  const handleSmtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ text: '', type: '' });

    const result = await updateEmailSettings(smtpData);
    
    if (result.success) {
      setMessage({ text: 'SMTP settings saved successfully.', type: 'success' });
    } else {
      setMessage({ text: result.message || 'Failed to save SMTP settings.', type: 'error' });
    }
    setSaving(false);
    setTimeout(() => setMessage({ text: '', type: '' }), 3000);
  };

  // Handlers for Template Settings
  const handleTemplateChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setTemplates(prev => ({
      ...prev,
      [activeTemplate]: {
        ...prev[activeTemplate],
        [name]: value
      }
    }));
  };

  const handleTemplateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ text: '', type: '' });

    const tmpl = templates[activeTemplate];
    const result = await updateEmailTemplate(activeTemplate, tmpl.subject, tmpl.bodyHtml);
    
    if (result.success) {
      setMessage({ text: 'Email template saved successfully.', type: 'success' });
    } else {
      setMessage({ text: result.message || 'Failed to save template.', type: 'error' });
    }
    setSaving(false);
    setTimeout(() => setMessage({ text: '', type: '' }), 3000);
  };

  const handleWipeDatabase = async () => {
    const password = window.prompt("DANGER: This will permanently wipe all registrations, tickets, and emails, and reset the order number sequence back to 1. To proceed, type the exact password: WIPE_REVIVAL_2026");
    if (password === "WIPE_REVIVAL_2026") {
      setSaving(true);
      const res = await wipeDatabase(password);
      if (res.success) {
        setMessage({ text: res.message || 'Database wiped successfully.', type: 'success' });
      } else {
        setMessage({ text: res.message || 'Failed to wipe database.', type: 'error' });
      }
      setSaving(false);
    } else if (password !== null) {
      alert("Incorrect password. Aborting wipe.");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">System Settings</h1>
        <p className="text-slate-400 mt-2">Manage capacity, pricing, emails, and templates.</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10 gap-8">
        <button
          onClick={() => setActiveTab('general')}
          className={`pb-4 flex items-center gap-2 font-medium transition-colors border-b-2 ${activeTab === 'general' ? 'border-white text-white' : 'border-transparent text-slate-400 hover:text-white'}`}
        >
          <SettingsIcon className="w-4 h-4" /> General
        </button>
        <button
          onClick={() => setActiveTab('smtp')}
          className={`pb-4 flex items-center gap-2 font-medium transition-colors border-b-2 ${activeTab === 'smtp' ? 'border-white text-white' : 'border-transparent text-slate-400 hover:text-white'}`}
        >
          <Mail className="w-4 h-4" /> Email SMTP
        </button>
        <button
          onClick={() => setActiveTab('templates')}
          className={`pb-4 flex items-center gap-2 font-medium transition-colors border-b-2 ${activeTab === 'templates' ? 'border-white text-white' : 'border-transparent text-slate-400 hover:text-white'}`}
        >
          <LayoutTemplate className="w-4 h-4" /> Templates
        </button>
      </div>

      {message.text && (
        <div className={`p-4 rounded-xl flex items-center gap-3 ${message.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
          <Info className="w-5 h-5" />
          {message.text}
        </div>
      )}

      {/* General Settings Tab */}
      {activeTab === 'general' && (
        <form onSubmit={handleGeneralSubmit} className="space-y-8">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <h2 className="text-xl font-semibold mb-6">Capacity & Rules</h2>
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Kids Capacity</label>
                  <input type="number" name="kidsCapacity" value={generalData.kidsCapacity} onChange={handleGeneralChange} min="0" className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/30" />
                </div>
              </div>
              
              <div className="flex items-center gap-3 pt-4 border-t border-white/5">
                <input type="checkbox" id="isEarlyBird" name="isEarlyBird" checked={generalData.isEarlyBird} onChange={handleGeneralChange} className="w-5 h-5 rounded border-white/10 bg-black/50 text-white focus:ring-white/30 focus:ring-offset-black" />
                <label htmlFor="isEarlyBird" className="text-sm font-medium text-white cursor-pointer">Enable Early Bird Pricing</label>
              </div>
              
              {generalData.isEarlyBird && (
                <div className="pl-8 pt-2">
                  <label className="block text-sm font-medium text-slate-300 mb-2">Early Bird Expiration Date (Optional)</label>
                  <input type="date" name="earlyBirdEndDate" value={generalData.earlyBirdEndDate} onChange={handleGeneralChange} className="w-full max-w-xs bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/30" />
                </div>
              )}

              <div className="flex items-center gap-3 pt-4 border-t border-white/5">
                <input type="checkbox" id="isEmailQueuePaused" name="isEmailQueuePaused" checked={generalData.isEmailQueuePaused} onChange={handleGeneralChange} className="w-5 h-5 rounded border-white/10 bg-black/50 text-white focus:ring-white/30 focus:ring-offset-black" />
                <label htmlFor="isEmailQueuePaused" className="text-sm font-medium text-white cursor-pointer">Pause Email Queue Background Processor</label>
              </div>
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <h2 className="text-xl font-semibold mb-6">Pricing Tiers (RM)</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <h3 className="font-medium text-slate-400 border-b border-white/5 pb-2">Early Bird</h3>
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Kids Price</label>
                  <input type="number" name="kidsPriceEarlyBird" value={generalData.kidsPriceEarlyBird} onChange={handleGeneralChange} min="0" step="0.01" className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/30" />
                </div>
              </div>
              <div className="space-y-4">
                <h3 className="font-medium text-slate-400 border-b border-white/5 pb-2">Regular</h3>
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Kids Price</label>
                  <input type="number" name="kidsPriceRegular" value={generalData.kidsPriceRegular} onChange={handleGeneralChange} min="0" step="0.01" className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/30" />
                </div>
              </div>
            </div>
          </div>

          <button type="submit" disabled={saving} className="bg-white text-black font-medium px-8 py-3 rounded-xl hover:bg-slate-200 transition-all disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />} Save General Settings
          </button>
        </form>
      )}

      {/* SMTP Tab */}
      {activeTab === 'smtp' && (
        <form onSubmit={handleSmtpSubmit} className="space-y-8">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <h2 className="text-xl font-semibold mb-6">Google SMTP Setup</h2>
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Host</label>
                  <input type="text" name="host" value={smtpData.host} onChange={handleSmtpChange} placeholder="smtp.gmail.com" required className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/30" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Port</label>
                  <input type="number" name="port" value={smtpData.port} onChange={handleSmtpChange} required className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/30" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Username (Email)</label>
                  <input type="text" name="username" value={smtpData.username} onChange={handleSmtpChange} placeholder="your-email@gmail.com" className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/30" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Password / App Password</label>
                  <input type="password" name="password" value={smtpData.password} onChange={handleSmtpChange} placeholder="••••••••" className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/30" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Sender Name</label>
                  <input type="text" name="fromName" value={smtpData.fromName} onChange={handleSmtpChange} placeholder="REVIVAL Team" className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/30" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Sender Email (Optional)</label>
                  <input type="email" name="fromEmail" value={smtpData.fromEmail} onChange={handleSmtpChange} placeholder="noreply@revival.com" className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/30" />
                </div>
              </div>
            </div>
          </div>
          <button type="submit" disabled={saving} className="bg-white text-black font-medium px-8 py-3 rounded-xl hover:bg-slate-200 transition-all disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />} Save SMTP Settings
          </button>
        </form>
      )}

      {/* Templates Tab */}
      {activeTab === 'templates' && (
        <div className="space-y-6">
          <div className="flex bg-white/5 p-1 rounded-xl w-max">
            {['INVOICE', 'E_TICKET', 'REMINDER', 'FINAL_REMINDER'].map(t => (
              <button
                key={t}
                onClick={() => setActiveTemplate(t as TemplateType)}
                className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${activeTemplate === t ? 'bg-white text-black shadow-sm' : 'text-slate-400 hover:text-white'}`}
              >
                {t === 'REMINDER' ? 'BULK SEND' : t.replace('_', ' ')}
              </button>
            ))}
          </div>

          <form onSubmit={handleTemplateSubmit} className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">{activeTemplate === 'REMINDER' ? 'BULK SEND' : activeTemplate.replace('_', ' ')} Template</h2>
              <div className="text-xs text-slate-400 bg-black/50 px-3 py-1 rounded-full">
                Supported tags: {`{{name}}, {{orderNumber}}, {{totalAmount}}`}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Email Subject</label>
              <input
                type="text"
                name="subject"
                value={templates[activeTemplate]?.subject || ''}
                onChange={handleTemplateChange}
                required
                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/30"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">HTML Body</label>
              <textarea
                name="bodyHtml"
                value={templates[activeTemplate]?.bodyHtml || ''}
                onChange={handleTemplateChange}
                required
                rows={12}
                className="w-full font-mono text-sm bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-slate-300 focus:outline-none focus:border-white/30"
              />
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-4 pt-4 border-t border-white/10">
              <button type="submit" disabled={saving} className="bg-white text-black font-medium px-8 py-3 rounded-xl hover:bg-slate-200 transition-all disabled:opacity-50 flex items-center gap-2 w-full sm:w-auto">
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />} Save Template
              </button>
              
              <div className="flex-1 flex items-center gap-2 w-full sm:w-auto">
                <input 
                  type="email" 
                  placeholder="Test email address..." 
                  value={testEmail}
                  onChange={e => setTestEmail(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/30"
                />
                <button 
                  type="button"
                  onClick={async () => {
                    if (!testEmail) {
                      setMessage({ text: 'Please enter a test email address.', type: 'error' });
                      return;
                    }
                    setSaving(true);
                    const { sendTestEmail } = await import('@/actions/admin');
                    const res = await sendTestEmail(activeTemplate, testEmail);
                    setMessage({ text: res.message || '', type: res.success ? 'success' : 'error' });
                    setSaving(false);
                    setTimeout(() => setMessage({ text: '', type: '' }), 5000);
                  }}
                  disabled={saving}
                  className="bg-slate-800 text-white font-medium px-6 py-3 rounded-xl hover:bg-slate-700 transition-all disabled:opacity-50 whitespace-nowrap"
                >
                  Send Test
                </button>
              </div>
            </div>
          </form>

          {activeTemplate === 'REMINDER' && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
              <h3 className="text-lg font-semibold">Bulk Send Actions</h3>
              <p className="text-slate-400 text-sm">Send this template to multiple attendees. Emails will be queued and sent gradually in the background to respect SMTP limits.</p>
              
              <div className="flex items-end gap-4 mt-4">
                <div className="flex-1 max-w-xs">
                  <label className="block text-sm font-medium text-slate-300 mb-2">Target Registration Status</label>
                  <select 
                    value={bulkTarget} 
                    onChange={e => setBulkTarget(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/30"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="SEAT_SECURED">Seat Secured (Paid)</option>
                    <option value="PENDING_FOR_PAYMENT">Pending for Payment</option>
                    <option value="PENDING_FOR_REVIEW">Pending for Review</option>
                    <option value="PAYMENT_REJECTED">Payment Rejected</option>
                    <option value="CONTACT_ADMIN">Contact Admin</option>
                  </select>
                </div>
                <button 
                  onClick={handleBulkSend} 
                  disabled={saving} 
                  className="bg-white text-black font-medium px-8 py-3 rounded-xl hover:bg-slate-200 transition-all disabled:opacity-50"
                >
                  Bulk Send to Queue
                </button>
              </div>
            </div>
          )}

          {activeTemplate === 'FINAL_REMINDER' && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
              <h3 className="text-lg font-semibold text-emerald-400">Queue Final Reminders</h3>
              <p className="text-slate-400 text-sm">Send this template to ALL "Seat Secured" registrations. This will automatically attach their admission tickets (QR Codes).</p>
              
              <div className="mt-4">
                <button 
                  onClick={async () => {
                    if (!window.confirm("Are you sure you want to queue the Final Reminder to all paid registrations?")) return;
                    setSaving(true);
                    const { enqueueFinalReminder } = await import('@/actions/admin');
                    const res = await enqueueFinalReminder();
                    setMessage({ text: res.message || '', type: res.success ? 'success' : 'error' });
                    setSaving(false);
                    setTimeout(() => setMessage({ text: '', type: '' }), 5000);
                  }}
                  disabled={saving} 
                  className="bg-emerald-500 text-white font-medium px-8 py-3 rounded-xl hover:bg-emerald-600 transition-all disabled:opacity-50"
                >
                  Queue Final Reminder to All Paid
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Danger Zone */}
      <div className="mt-12 bg-red-950/20 border border-red-500/20 rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <div className="bg-red-500/10 p-3 rounded-xl border border-red-500/20">
            <AlertTriangle className="w-6 h-6 text-red-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-red-400">Danger Zone</h2>
            <p className="text-slate-400 mt-1 mb-4 text-sm max-w-xl">
              Permanently delete all test registrations, tickets, attendees, and email logs. 
              This will also reset the Order Number sequence back to <strong>R00001</strong>. This action cannot be undone.
            </p>
            <button 
              onClick={handleWipeDatabase}
              disabled={saving}
              className="bg-red-500/10 text-red-400 font-medium px-6 py-2 rounded-lg hover:bg-red-500/20 hover:text-red-300 transition-all border border-red-500/20 disabled:opacity-50"
            >
              Wipe Database & Reset Sequence
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
