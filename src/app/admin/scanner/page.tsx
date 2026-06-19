'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Search, CheckCircle2, Circle, Ticket as TicketIcon } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { searchRegistration, toggleAllCollections } from '@/actions/scanner';

export default function ScannerPage() {
  const [scanResult, setScanResult] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    // Initialize Scanner on mount
    const html5QrCode = new Html5Qrcode("reader");
    scannerRef.current = html5QrCode;

    startScanner();

    return () => {
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(console.error);
      }
    };
  }, []);

  const startScanner = async () => {
    setError('');
    if (!scannerRef.current) return;
    try {
      if (scannerRef.current.isScanning) {
        await scannerRef.current.stop();
      }
      await scannerRef.current.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          handleSearch(decodedText);
        },
        (errorMessage) => {
          // ignore scan errors
        }
      );
    } catch (err) {
      console.error(err);
      setError('Could not start camera. Please allow camera permissions.');
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      await scannerRef.current.stop().catch(console.error);
    }
  };

  const handleSearch = async (query: string) => {
    setLoading(true);
    setError('');
    const res = await searchRegistration(query);
    setLoading(false);
    
    if (res.success && res.data) {
      setScanResult(res.data);
      stopScanner();
    } else {
      setError(res.message || 'Attendee not found');
    }
  };

  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery) {
      handleSearch(searchQuery);
    }
  };

  const resetScanner = () => {
    setScanResult(null);
    setSearchQuery('');
    startScanner();
  };

  const handleToggleAllCollections = async () => {
    if (!scanResult) return;
    const isCurrentlyCollected = scanResult.wristbandsCollected && scanResult.starterPacksCollected;
    const newValue = !isCurrentlyCollected;
    
    setScanResult({ 
      ...scanResult, 
      wristbandsCollected: newValue,
      starterPacksCollected: newValue
    });
    
    const res = await toggleAllCollections(scanResult.id, newValue);
    if (!res.success) {
      setScanResult({ 
        ...scanResult, 
        wristbandsCollected: !newValue,
        starterPacksCollected: !newValue 
      }); // revert
      alert(res.message);
    }
  };

  const formatQueue = (num: number) => 'R' + String(num).padStart(5, '0');

  return (
    <div className="max-w-md mx-auto min-h-[80vh] flex flex-col space-y-4 animate-in fade-in pb-12">
      
      {/* Scanner Box */}
      <div 
        className={`bg-black/50 border border-white/10 rounded-2xl overflow-hidden relative ${scanResult ? 'hidden' : 'block'}`}
      >
        <div id="reader" className="w-full bg-black aspect-square"></div>
      </div>

      {/* Manual Search */}
      <form onSubmit={handleManualSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Name, Email, or Reg No (e.g. R00015)"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white focus:outline-none focus:border-white/30"
          />
        </div>
        <button 
          type="submit" 
          disabled={loading || !searchQuery}
          className="bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-xl font-medium transition-colors disabled:opacity-50 text-sm"
        >
          {loading ? '...' : 'Find'}
        </button>
      </form>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm text-center">
          {error}
        </div>
      )}

      {/* Result Card */}
      {scanResult && (
        <div className="space-y-4 animate-in slide-in-from-bottom-4">
          <div className="bg-[#94b8b8] rounded-2xl p-6 flex justify-between items-start text-slate-900 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
              <TicketIcon className="w-32 h-32 text-slate-900" />
            </div>
            <div className="relative z-10">
              <h2 className="text-2xl font-bold">{scanResult.attendee.name}</h2>
              <p className="font-mono text-sm opacity-70 mt-1 font-bold tracking-widest">{formatQueue(scanResult.orderNumber)}</p>
            </div>
            <div className="relative z-10 bg-black text-white rounded-xl px-4 py-3 text-center min-w-[80px]">
              <span className="block text-2xl font-bold">{scanResult.kidsTickets}</span>
              <span className="block text-[10px] tracking-wider uppercase opacity-70 mt-0.5">Tickets</span>
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-4">
            <h3 className="text-xs font-bold tracking-widest text-slate-500 uppercase">Collection Tracking</h3>
            
            <button 
              onClick={handleToggleAllCollections}
              className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${
                (scanResult.wristbandsCollected && scanResult.starterPacksCollected)
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                  : 'bg-black/50 border-white/10 text-slate-300 hover:bg-white/5'
              }`}
            >
              <div className="flex items-center gap-3">
                {(scanResult.wristbandsCollected && scanResult.starterPacksCollected) ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                <span className="font-medium text-lg">Starter Pack Collected</span>
              </div>
              <span className="text-xs opacity-50">{(scanResult.wristbandsCollected && scanResult.starterPacksCollected) ? 'Collected' : 'Tap to toggle'}</span>
            </button>
          </div>

          <button 
            onClick={resetScanner}
            className="w-full bg-white text-black font-bold py-4 rounded-xl hover:bg-slate-200 transition-colors mt-4"
          >
            Scan Next Attendee
          </button>
        </div>
      )}

    </div>
  );
}
