'use client';

import React, { useState } from 'react';
import { Search, CheckCircle2, Circle } from 'lucide-react';
import { toggleKidAttendance } from '@/actions/kids';

export default function KidsListClient({ initialKids }: { initialKids: any[] }) {
  const [kids, setKids] = useState(initialKids);
  const [searchQuery, setSearchQuery] = useState('');

  const handleToggleAttendance = async (id: string, day: 1 | 2 | 3, currentValue: boolean) => {
    const dayField = day === 1 ? 'attendanceDay1' : day === 2 ? 'attendanceDay2' : 'attendanceDay3';
    
    // Optimistic update
    setKids(kids.map(kid => kid.id === id ? { ...kid, [dayField]: !currentValue } : kid));
    
    const res = await toggleKidAttendance(id, day, !currentValue);
    if (!res.success) {
      // Revert on failure
      setKids(kids.map(kid => kid.id === id ? { ...kid, [dayField]: currentValue } : kid));
      alert(res.message);
    }
  };

  const filteredKids = kids.filter(kid => 
    kid.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    ('r' + String(kid.registration.orderNumber).padStart(5, '0')).includes(searchQuery.toLowerCase()) ||
    kid.registration.attendee.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatQueue = (num: number) => 'R' + String(num).padStart(5, '0');

  return (
    <div>
      <div className="p-4 border-b border-white/10 flex gap-4 bg-black/30">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by Kid's Name, Parent's Name, or Queue No..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs uppercase bg-black/50 text-slate-400">
            <tr>
              <th className="px-6 py-4 font-medium tracking-wider">Queue No.</th>
              <th className="px-6 py-4 font-medium tracking-wider">Kid's Name</th>
              <th className="px-6 py-4 font-medium tracking-wider">Age</th>
              <th className="px-6 py-4 font-medium tracking-wider">Parent</th>
              <th className="px-6 py-4 font-medium tracking-wider text-center">26 Jun</th>
              <th className="px-6 py-4 font-medium tracking-wider text-center">27 Jun</th>
              <th className="px-6 py-4 font-medium tracking-wider text-center">28 Jun</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filteredKids.map((kid) => (
              <tr key={kid.id} className="hover:bg-white/5 transition-colors group">
                <td className="px-6 py-4 font-mono font-medium text-slate-300">
                  {formatQueue(kid.registration.orderNumber)}
                </td>
                <td className="px-6 py-4 font-bold text-white">
                  {kid.name}
                </td>
                <td className="px-6 py-4 text-slate-400">
                  {kid.age}
                </td>
                <td className="px-6 py-4 text-slate-400">
                  {kid.registration.attendee.name}
                </td>
                <td className="px-6 py-4 text-center">
                  <button 
                    onClick={() => handleToggleAttendance(kid.id, 1, kid.attendanceDay1)}
                    className={`inline-flex items-center justify-center p-2 rounded-lg transition-colors ${
                      kid.attendanceDay1 
                        ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20' 
                        : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {kid.attendanceDay1 ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                  </button>
                </td>
                <td className="px-6 py-4 text-center">
                  <button 
                    onClick={() => handleToggleAttendance(kid.id, 2, kid.attendanceDay2)}
                    className={`inline-flex items-center justify-center p-2 rounded-lg transition-colors ${
                      kid.attendanceDay2 
                        ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20' 
                        : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {kid.attendanceDay2 ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                  </button>
                </td>
                <td className="px-6 py-4 text-center">
                  <button 
                    onClick={() => handleToggleAttendance(kid.id, 3, kid.attendanceDay3)}
                    className={`inline-flex items-center justify-center p-2 rounded-lg transition-colors ${
                      kid.attendanceDay3 
                        ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20' 
                        : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {kid.attendanceDay3 ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                  </button>
                </td>
              </tr>
            ))}
            {filteredKids.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                  No kids found matching your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
