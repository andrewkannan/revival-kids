'use client';

import { useState } from 'react';
import { Mail, CheckCircle2, XCircle, AlertCircle, Search, Clock, Send, Calendar } from 'lucide-react';
import RetryEmailButton from './RetryEmailButton';
import { formatSGTime } from '@/lib/format';

type Log = any;
type QueueItem = any;

export default function EmailLogsClient({ initialLogs, initialQueue }: { initialLogs: Log[], initialQueue: QueueItem[] }) {
  const [activeTab, setActiveTab] = useState<'logs' | 'queue'>('logs');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredLogs = initialLogs.filter((log) => {
    const q = searchQuery.toLowerCase();
    return log.to.toLowerCase().includes(q) || 
           log.subject.toLowerCase().includes(q) || 
           (log.error && log.error.toLowerCase().includes(q));
  });

  const filteredQueue = initialQueue.filter((item) => {
    const q = searchQuery.toLowerCase();
    return item.to.toLowerCase().includes(q) || 
           item.subject.toLowerCase().includes(q) ||
           item.status.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-white/5 p-2 rounded-2xl border border-white/10">
        <div className="flex w-full sm:w-auto p-1 bg-black/20 rounded-xl">
          <button
            onClick={() => setActiveTab('logs')}
            className={`flex-1 sm:flex-none px-6 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
              activeTab === 'logs' 
                ? 'bg-poster-accent text-white shadow-lg' 
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>Sent Logs</span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('queue')}
            className={`flex-1 sm:flex-none px-6 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
              activeTab === 'queue' 
                ? 'bg-poster-accent text-white shadow-lg' 
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Clock className="w-4 h-4" />
              <span>Email Queue</span>
              {initialQueue.length > 0 && (
                <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs">{initialQueue.length}</span>
              )}
            </div>
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search emails..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-black/20 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-poster-accent focus:ring-1 focus:ring-poster-accent transition-all text-sm"
          />
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          {activeTab === 'logs' ? (
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="text-xs uppercase bg-white/5 text-slate-400 border-b border-white/10">
                <tr>
                  <th className="px-4 py-4 font-medium">Status</th>
                  <th className="px-4 py-4 font-medium">Recipient</th>
                  <th className="px-4 py-4 font-medium">Subject</th>
                  <th className="px-4 py-4 font-medium">Sent At (SG Time)</th>
                  <th className="px-4 py-4 font-medium">Error Info</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center">
                        <Mail className="w-8 h-8 mb-2 opacity-50" />
                        <p>No logs found.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr 
                      key={log.id} 
                      className={`border-b border-white/5 transition-colors hover:bg-white/[0.04] ${
                        log.status === 'FAILED' ? 'bg-red-500/5 border-l-4 border-l-red-500' : 'border-l-4 border-l-transparent'
                      }`}
                    >
                      <td className="px-4 py-4 whitespace-nowrap">
                        {log.status === 'SENT' ? (
                          <div className="flex items-center gap-1.5 text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full w-fit">
                            <CheckCircle2 className="w-4 h-4" /> <span className="font-medium text-xs">SENT</span>
                          </div>
                        ) : (
                          <div className="flex items-center">
                            <div className="flex items-center gap-1.5 text-red-400 bg-red-500/10 px-2.5 py-1 rounded-full w-fit">
                              <XCircle className="w-4 h-4" /> <span className="font-medium text-xs">FAILED</span>
                            </div>
                            <RetryEmailButton logId={log.id} />
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 font-medium text-white">{log.to}</td>
                      <td className="px-4 py-4 text-slate-300">{log.subject}</td>
                      <td className="px-4 py-4 whitespace-nowrap text-slate-400 text-xs">
                        {formatSGTime(log.createdAt)}
                      </td>
                      <td className="px-4 py-4 text-xs text-slate-400 break-words whitespace-pre-wrap">
                        {log.error ? (
                          log.error.startsWith('[Success]') ? (
                            <span className="text-emerald-400/80" title={log.error}>
                              {log.error}
                            </span>
                          ) : (
                            <span className="text-red-400/80 cursor-help" title={log.error}>
                              <AlertCircle className="w-3.5 h-3.5 inline mr-1" />
                              {log.error}
                            </span>
                          )
                        ) : (
                          <span className="opacity-50">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="text-xs uppercase bg-white/5 text-slate-400 border-b border-white/10">
                <tr>
                  <th className="px-4 py-4 font-medium">Queue #</th>
                  <th className="px-4 py-4 font-medium">Status</th>
                  <th className="px-4 py-4 font-medium">Recipient</th>
                  <th className="px-4 py-4 font-medium">Subject</th>
                  <th className="px-4 py-4 font-medium">Attempts</th>
                  <th className="px-4 py-4 font-medium">Queued At (SG Time)</th>
                </tr>
              </thead>
              <tbody>
                {filteredQueue.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center">
                        <Send className="w-8 h-8 mb-2 opacity-50" />
                        <p>No emails in queue.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredQueue.map((item, idx) => (
                    <tr 
                      key={item.id} 
                      className={`border-b border-white/5 transition-colors hover:bg-white/[0.04] ${
                        item.status === 'FAILED' ? 'bg-red-500/5 border-l-4 border-l-red-500' : 'border-l-4 border-l-transparent'
                      }`}
                    >
                      <td className="px-4 py-4 whitespace-nowrap font-mono text-slate-400">
                        #{idx + 1}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                          item.status === 'PENDING' ? 'bg-blue-500/10 text-blue-400' :
                          item.status === 'PROCESSING' ? 'bg-amber-500/10 text-amber-400' :
                          item.status === 'SENT' ? 'bg-emerald-500/10 text-emerald-400' :
                          'bg-red-500/10 text-red-400'
                        }`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="px-4 py-4 font-medium text-white">{item.to}</td>
                      <td className="px-4 py-4 text-slate-300">{item.subject}</td>
                      <td className="px-4 py-4 text-slate-400 text-center">{item.attempts}</td>
                      <td className="px-4 py-4 whitespace-nowrap text-slate-400 text-xs">
                        {formatSGTime(item.createdAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
