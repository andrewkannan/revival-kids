'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, Settings, LogOut, ChevronLeft, ChevronRight, Mail, ScanLine } from 'lucide-react';
import { logoutAdmin } from '@/actions/admin';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const navigation = [
  { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { name: 'Scanner', href: '/admin/scanner', icon: ScanLine },
  { name: 'Registrations', href: '/admin/registrations', icon: Users },
  { name: 'Email Logs', href: '/admin/emails', icon: Mail },
  { name: 'Settings', href: '/admin/settings', icon: Settings },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Do not show sidebar on the login page
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  const handleLogout = async () => {
    await logoutAdmin();
    window.location.href = '/admin/login';
  };

  return (
    <div className="min-h-screen bg-black text-white flex">
      {/* Sidebar */}
      <div className={`${isCollapsed ? 'w-20' : 'w-64'} border-r border-white/10 bg-black flex flex-col fixed inset-y-0 z-50 transition-all duration-300`}>
        <div className="p-6 border-b border-white/10 flex items-center justify-between h-[73px]">
          {!isCollapsed && (
            <Link href="/admin" className="text-xl font-bold tracking-widest text-white whitespace-nowrap overflow-hidden">
              REVIVAL KIDS<span className="text-slate-500 text-xs ml-2">ADMIN</span>
            </Link>
          )}
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)} 
            className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-white/10 transition-colors mx-auto"
          >
            {isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </button>
        </div>
        
        <nav className="flex-1 p-4 space-y-2 overflow-hidden">
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={twMerge(
                  clsx(
                    'flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all duration-200',
                    isActive 
                      ? 'bg-white text-black' 
                      : 'text-slate-400 hover:text-white hover:bg-white/5',
                    isCollapsed && 'justify-center px-0'
                  )
                )}
                title={isCollapsed ? item.name : undefined}
              >
                <item.icon className={clsx("w-5 h-5 shrink-0", isActive ? "text-black" : "")} />
                {!isCollapsed && <span className="truncate">{item.name}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10">
          <button
            onClick={handleLogout}
            className={twMerge(
              clsx(
                "flex items-center gap-3 px-4 py-3 w-full rounded-lg font-medium text-slate-400 hover:text-red-400 hover:bg-white/5 transition-all duration-200",
                isCollapsed && "justify-center px-0"
              )
            )}
            title={isCollapsed ? "Logout" : undefined}
          >
            <LogOut className="w-5 h-5 shrink-0" />
            {!isCollapsed && <span>Logout</span>}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className={`flex-1 ${isCollapsed ? 'ml-20' : 'ml-64'} bg-black transition-all duration-300`}>
        <main className="p-8 max-w-6xl mx-auto min-h-screen">
          {children}
        </main>
      </div>
    </div>
  );
}
