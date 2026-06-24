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

  const pauseScanner = () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        scannerRef.current.pause(true);
      } catch (e) {
        console.error('Pause not supported, stopping instead', e);
        scannerRef.current.stop().catch(console.error);
      }
    }
  };

  const handleSearch = async (query: string) => {
    setLoading(true);
    setError('');
    const res = await searchRegistration(query);
    setLoading(false);
    
    if (res.success && res.data) {
      setScanResult(res.data);
      pauseScanner();
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
    if (scannerRef.current && scannerRef.current.getState() === 3 /* PAUSED */) {
      try {
        scannerRef.current.resume();
      } catch (e) {
        startScanner();
      }
    } else {
      startScanner();
    }
  };

  const handleToggleAllCollections = async () => {
    if (!scanResult) return;
    const isCurrentlyCollected = scanResult.wristbandsCollected && scanResult.starterPacksCollected;
    const newValue = !isCurrentlyCollected;
    
    setScanResult({ 
      ...scanResult, 
      wristbandsCollected: newValue,
      starterPacksCollected: newValue,
      collectedAt: newValue ? new Date().toISOString() : null
    });
    
    const res = await toggleAllCollections(scanResult.id, newValue);
    if (!res.success) {
      setScanResult({ 
        ...scanResult, 
        wristbandsCollected: !newValue,
        starterPacksCollected: !newValue,
        collectedAt: scanResult.collectedAt // restore original
      }); // revert
      alert(res.message);
    }
  };

  const formatQueue = (num: number) => 'R' + String(num).padStart(5, '0');

  return (
    <div className="max-w-md mx-auto min-h-[80vh] flex flex-col space-y-4 animate-in fade-in pb-12">
      
      {/* Scanner Box */}
      <div className="bg-[#111] border border-poster-accent/30 rounded-2xl overflow-hidden relative">
        <div id="reader" className="w-full aspect-square bg-[#0a0a0a]"></div>
      </div>

      {/* Manual Search */}
      <form onSubmit={handleManualSearch} className="flex gap-3 bg-[#111] p-3 rounded-2xl border border-poster-accent/30">
        <div className="relative flex-1 bg-[#0a0a0a] rounded-xl border border-poster-accent/20 overflow-hidden">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-poster-accent/70" />
          <input
            type="text"
            placeholder="Name, Email, or Reg No (e.g. R00015)"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-transparent pl-11 pr-4 py-3.5 text-sm text-red-100 focus:outline-none placeholder:text-poster-accent/50"
          />
        </div>
        <button 
          type="submit" 
          disabled={loading || !searchQuery}
          className="bg-poster-accent hover:bg-poster-accent-bright text-white px-6 py-3.5 rounded-xl font-bold transition-colors disabled:opacity-50 text-sm whitespace-nowrap"
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
          <div className="rounded-2xl overflow-hidden border border-poster-accent/30 bg-[#0a0a0a] shadow-[0_10px_25px_rgba(0,0,0,0.5)]">
            {/* Top Red Half */}
            <div className="bg-[#111] p-6 flex justify-between items-start text-white shadow-xl relative border-b border-poster-accent/30">
              <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                <TicketIcon className="w-32 h-32 text-white" />
              </div>
              <div className="relative z-10">
                <h2 className="text-2xl font-bold">{scanResult.attendee.name}</h2>
                <p className="font-mono text-sm opacity-80 mt-1 font-bold tracking-widest text-red-200">{formatQueue(scanResult.orderNumber)}</p>
              </div>
              <div className="relative z-10 bg-[#0a0a0a] text-poster-accent rounded-2xl px-4 py-3 text-center min-w-[80px] shadow-lg border border-poster-accent/30">
                <span className="block text-3xl font-black text-white leading-none mb-1">{scanResult.kidsTickets}</span>
                <span className="block text-[9px] tracking-widest font-bold uppercase opacity-80 text-red-200">Tickets</span>
              </div>
            </div>

            {/* Bottom Dark Half */}
            <div className="p-6 space-y-6">
              
              {/* Kids Details */}
              {scanResult.kids && scanResult.kids.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-[10px] font-bold tracking-widest text-red-200 uppercase">Registered Kids</h3>
                  <div className="grid gap-2">
                    {scanResult.kids.map((kid: any) => (
                      <div key={kid.id} className="bg-[#111] border border-poster-accent/30 rounded-xl p-3 flex justify-between items-center">
                        <span className="text-sm font-medium text-white">{kid.name}</span>
                        <span className="text-xs font-bold text-white bg-poster-accent px-2 py-1 rounded-md">Age {kid.age}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <h3 className="text-[10px] font-bold tracking-widest text-red-200 uppercase">Collection Tracking</h3>
              
              <button 
                onClick={handleToggleAllCollections}
                className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${
                  (scanResult.wristbandsCollected && scanResult.starterPacksCollected)
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' 
                    : 'bg-[#111] border-poster-accent/30 text-poster-accent/70 hover:bg-poster-accent/10'
                }`}
              >
                <div className="flex items-center gap-3">
                  {(scanResult.wristbandsCollected && scanResult.starterPacksCollected) ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                  <span className="font-medium text-sm">Collection (Wristband & Starter Pack)</span>
                </div>
                <span className={`text-[10px] font-medium tracking-wide ${(scanResult.wristbandsCollected && scanResult.starterPacksCollected) ? 'opacity-80' : 'opacity-50'}`}>
                  {(scanResult.wristbandsCollected && scanResult.starterPacksCollected) ? 'Collected' : 'Tap to toggle'}
                </span>
              </button>
              {scanResult.collectedAt && (
                <p className="text-xs text-slate-500 text-center mt-2">
                  Collected: {new Date(scanResult.collectedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </p>
              )}
              </div>
            </div>
          </div>

          <button 
            onClick={resetScanner}
            className="w-full bg-poster-accent text-white font-bold py-4 rounded-xl hover:bg-poster-accent-bright transition-colors mt-4 shadow-lg"
          >
            Scan Next Attendee
          </button>
        </div>
      )}

    </div>
  );
}
