'use client';

import { useState } from 'react';
import { enqueueBulkReminder } from '@/actions/admin';
import { Send, Loader2, CheckCircle2 } from 'lucide-react';

export default function ReminderButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleSend = async () => {
    if (!confirm('Are you sure you want to send reminder emails to all attendees with secured seats?')) {
      return;
    }
    
    setLoading(true);
    setResult(null);
    
    const res = await enqueueBulkReminder('SEAT_SECURED');
    setResult(res);
    setLoading(false);

    if (res.success) {
      setTimeout(() => setResult(null), 5000);
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={handleSend}
        disabled={loading}
        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        Send Reminders
      </button>
      
      {result && (
        <div className={`flex items-center gap-2 text-sm ${result.success ? 'text-emerald-400' : 'text-red-400'}`}>
          {result.success && <CheckCircle2 className="w-4 h-4" />}
          {result.message}
        </div>
      )}
    </div>
  );
}
