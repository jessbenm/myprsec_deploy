import { useState } from 'react';
import { Bell } from 'lucide-react';
import { useLocation } from 'react-router';
import { useTheme } from '../theme-context';

const pageTitles: Record<string, string> = {
  '/': 'Dashboard Overview',
  '/pipeline': 'CI/CD Pipeline',
  '/monitoring': 'Monitoring',
  '/history': 'Deploy History',
  '/servers': 'Multi VPS',
  '/settings': 'Settings',
};

export default function Header() {
  const [environment, setEnvironment] = useState<'staging' | 'production'>('staging');
  const location = useLocation();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const pageTitle = pageTitles[location.pathname] || 'Dashboard';

  return (
    <header className="app-header flex h-14 items-center justify-between border-b px-6 backdrop-blur-xl transition-colors duration-300"
      style={{
        background: isDark ? 'rgba(5,13,26,0.95)' : 'rgba(255,255,255,0.95)',
        borderColor: isDark ? 'rgba(6,182,212,0.1)' : 'rgba(0,0,0,0.08)',
      }}
    >
      {/* Left: title */}
      <div className="flex flex-col">
        <h1 className="text-base font-semibold tracking-tight" style={{ color: isDark ? '#f1f5f9' : '#0f172a' }}>
          MyPresc Deploy
        </h1>
        <span className="text-[10px] font-medium uppercase tracking-widest" style={{ color: isDark ? '#475569' : '#94a3b8' }}>
          {pageTitle}
        </span>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">

        {/* Env toggle */}
        <div className="flex items-center gap-1 rounded-full p-1"
          style={{
            background: isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9',
            border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0'}`,
          }}>
          <button
            onClick={() => setEnvironment('staging')}
            className="rounded-full px-4 py-1 text-xs font-semibold uppercase tracking-wider transition-all duration-200"
            style={environment === 'staging' ? {
              background: 'linear-gradient(135deg, #06b6d4, #2563eb)',
              color: '#fff',
              boxShadow: '0 2px 10px rgba(6,182,212,0.35)',
            } : {
              background: 'transparent',
              color: isDark ? '#64748b' : '#94a3b8',
            }}
          >
            Staging
          </button>
          <button
            onClick={() => setEnvironment('production')}
            className="rounded-full px-4 py-1 text-xs font-semibold uppercase tracking-wider transition-all duration-200"
            style={environment === 'production' ? {
              background: 'linear-gradient(135deg, #10b981, #2563eb)',
              color: '#fff',
              boxShadow: '0 2px 10px rgba(16,185,129,0.35)',
            } : {
              background: 'transparent',
              color: isDark ? '#64748b' : '#94a3b8',
            }}
          >
            Production
          </button>
        </div>

        {/* Status */}
        <div className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium"
          style={{
            background: isDark ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.08)',
            border: '1px solid rgba(16,185,129,0.2)',
            color: '#10b981',
          }}>
          <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]"
            style={{ boxShadow: '0 0 6px #10b981', animation: 'pulse 2s infinite' }} />
          All Systems Operational
        </div>

        {/* Bell */}
        <button className="relative flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-200"
          style={{
            background: isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9',
            border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0'}`,
            color: isDark ? '#64748b' : '#94a3b8',
          }}>
          <Bell size={15} />
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#06b6d4]"
            style={{ boxShadow: '0 0 6px #06b6d4' }} />
        </button>

        {/* Avatar */}
        <div className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{
            background: 'linear-gradient(135deg, #06b6d4, #2563eb)',
            boxShadow: '0 2px 8px rgba(6,182,212,0.3)',
          }}>
          YA
        </div>
      </div>
    </header>
  );
}