import React from 'react';

export default function ScannerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-black text-white selection:bg-poster-accent/30 selection:text-white flex flex-col">
      <header className="p-4 border-b border-white/10 flex items-center justify-between">
        <div className="text-xl font-bold tracking-widest text-white">
          REVIVAL KIDS<span className="text-poster-accent text-xs ml-2">SCANNER</span>
        </div>
      </header>
      <main className="flex-1 p-4 sm:p-8">
        {children}
      </main>
    </div>
  );
}
