'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { loginScanner } from '@/actions/admin';
import { Lock, ScanLine, Loader2, ArrowRight } from 'lucide-react';

export default function ScannerLogin() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await loginScanner(password);

    if (res.success) {
      router.push('/scanner');
    } else {
      setError(res.message || 'Invalid password');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-poster-bg flex flex-col justify-center items-center p-4 relative overflow-hidden">
      {/* Background ambient light */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-poster-accent/10 blur-[120px] rounded-full pointer-events-none" />

      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-poster-accent/10 mb-4 border border-poster-accent/20">
            <ScanLine className="w-8 h-8 text-poster-accent" />
          </div>
          <h1 className="text-3xl font-black tracking-widest text-white uppercase mb-2">Scanner Login</h1>
          <p className="text-red-200">Registration Team Access</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4 bg-poster-bg-light border border-poster-accent/30 p-8 rounded-3xl backdrop-blur-md">
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-xl text-red-400 text-sm text-center font-medium animate-in slide-in-from-top-2">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-red-200 ml-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-poster-accent/70" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-poster-bg border border-poster-accent/30 rounded-2xl pl-12 pr-4 py-4 text-white focus:outline-none focus:border-poster-accent transition-colors placeholder:text-poster-accent/40"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-poster-accent text-white hover:bg-poster-accent-bright font-bold py-4 rounded-2xl transition-all disabled:opacity-70 flex items-center justify-center gap-2 group mt-6 shadow-lg"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <span>Access Scanner</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>
        
        <div className="mt-8 text-center text-xs font-medium text-slate-600 uppercase tracking-widest">
          Revival Kids Conference 2026
        </div>
      </div>
    </div>
  );
}
