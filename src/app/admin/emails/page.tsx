import { getEmailLogs, getEmailQueue } from '@/actions/admin';
import EmailLogsClient from '@/components/admin/EmailLogsClient';

export const dynamic = 'force-dynamic';

export default async function EmailLogsPage() {
  const { success: logsSuccess, logs } = await getEmailLogs();
  const { success: queueSuccess, queue } = await getEmailQueue();

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Email System</h1>
        <p className="text-slate-400 mt-2">Track delivery history and view the active email queue.</p>
      </div>

      <EmailLogsClient 
        initialLogs={logsSuccess && logs ? logs : []} 
        initialQueue={queueSuccess && queue ? queue : []} 
      />
    </div>
  );
}
