import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "REVIVAL KIDS Conference 2026",
  description: "Secure your place at the most anticipated conference of the year.",
  openGraph: {
    title: "REVIVAL KIDS Conference 2026",
    description: "Secure your place at the most anticipated conference of the year.",
    siteName: "REVIVAL KIDS",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "REVIVAL KIDS Conference 2026",
    description: "Secure your place at the most anticipated conference of the year.",
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col relative bg-poster-bg text-slate-200">
        {/* Cinematic Film Grain Overlay */}
        <div 
          className="pointer-events-none fixed inset-0 z-[999] h-full w-full opacity-[0.15] mix-blend-overlay" 
          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}
        />
        {children}
      </body>
    </html>
  );
}
