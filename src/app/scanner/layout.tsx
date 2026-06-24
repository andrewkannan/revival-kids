import React from 'react';

export default function ScannerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-poster-bg text-white selection:bg-poster-accent/30 selection:text-white flex flex-col">
      <main className="flex-1 p-4 pt-12 sm:p-8">
        {children}
      </main>
    </div>
  );
}
