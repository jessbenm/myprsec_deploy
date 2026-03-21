import { useState, useEffect } from 'react';
import { Bell, ChevronDown } from 'lucide-react';
import { useLocation } from 'react-router';
import { useTheme } from '../theme-context';
import { useEnvironment } from '../../environment-context';

const BACKEND_URL = 'http://localhost:3001';

const pageTitles: Record<string, string> = {
  '/':           'Dashboard Overview',
  '/pipeline':   'CI/CD Pipeline',
  '/monitoring': 'Monitoring',
  '/history':    'Deploy History',
  '/servers':    'Multi VPS',
  '/settings':   'Settings',
  '/profile':    'Profile',
  '/alerts':     'Alerts',
};

interface VPS {
  id: string;
  name: string;
  host: string;
}

export default function Header() {
  const { environment, setEnvironment } = useEnvironment();
  const location = useLocation();
  const { theme } = useTheme();
  const isDark    = theme === 'dark';
  const pageTitle = pageTitles[location.pathname] || 'Dashboard';

  const [vpsList,      setVpsList]      = useState<VPS[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  // ── Charger les VPS depuis le backend ──────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const res  = await fetch(`${BACKEND_URL}/api/vps`);
        const data = await res.json();
        const list: VPS[] = Array.isArray(data) ? data : Object.values(data);
        setVpsList(list);
        // Si l'environnement actuel n'existe plus, switcher sur le premier
        if (list.length > 0 && !list.find(v => v.id === environment)) {
          setEnvironment(list[0].id);
        }
      } catch {
        setVpsList([]);
      }
    };
    load();
    // Recharger toutes les 10s pour détecter les nouveaux VPS
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);

  const currentVps = vpsList.find(v => v.id === environment);

  return (
    <header className="app-header flex h-14 items-center justify-between border-b px-6 backdrop-blur-xl transition-colors duration-300"
      style={{
        background:   isDark ? 'rgba(5,13,26,0.95)' : 'rgba(255,255,255,0.95)',
        borderColor:  isDark ? 'rgba(6,182,212,0.1)' : 'rgba(0,0,0,0.08)',
        position:     'relative',
        zIndex:       50,
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

        {/* ── Env switcher dynamique ── */}
        {vpsList.length <= 3 ? (
          // Mode boutons si peu de VPS
          <div className="flex items-center gap-1 rounded-full p-1"
            style={{
              background: isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9',
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0'}`,
            }}>
            {vpsList.map(vps => (
              <button key={vps.id}
                onClick={() => setEnvironment(vps.id)}
                className="rounded-full px-4 py-1 text-xs font-semibold uppercase tracking-wider transition-all duration-200"
                style={environment === vps.id ? {
                  background: vps.id === 'production'
                    ? 'linear-gradient(135deg, #10b981, #2563eb)'
                    : 'linear-gradient(135deg, #06b6d4, #2563eb)',
                  color: '#fff',
                  boxShadow: vps.id === 'production'
                    ? '0 2px 10px rgba(16,185,129,0.35)'
                    : '0 2px 10px rgba(6,182,212,0.35)',
                } : {
                  background: 'transparent',
                  color: isDark ? '#64748b' : '#94a3b8',
                }}
              >
                {vps.name || vps.id}
              </button>
            ))}
            {vpsList.length === 0 && (
              <span className="px-3 py-1 text-xs text-gray-500">No VPS</span>
            )}
          </div>
        ) : (
          // Mode dropdown si beaucoup de VPS
          <div className="relative">
            <button
              onClick={() => setShowDropdown(d => !d)}
              className="flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-200"
              style={{
                background: 'linear-gradient(135deg, #06b6d4, #2563eb)',
                color: '#fff',
                boxShadow: '0 2px 10px rgba(6,182,212,0.35)',
              }}
            >
              {currentVps?.name || environment}
              <ChevronDown size={11} />
            </button>
            {showDropdown && (
              <div className="absolute right-0 top-10 w-48 rounded-xl overflow-hidden shadow-2xl z-50"
                style={{
                  background: isDark ? '#0f172a' : '#fff',
                  border: `1px solid ${isDark ? '#1e293b' : '#e2e8f0'}`,
                }}>
                {vpsList.map(vps => (
                  <button key={vps.id}
                    onClick={() => { setEnvironment(vps.id); setShowDropdown(false); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-medium text-left transition-colors"
                    style={{
                      color: environment === vps.id ? '#06b6d4' : (isDark ? '#94a3b8' : '#475569'),
                      background: environment === vps.id
                        ? (isDark ? 'rgba(6,182,212,0.1)' : 'rgba(6,182,212,0.05)')
                        : 'transparent',
                    }}
                    onMouseEnter={e => { if (environment !== vps.id) e.currentTarget.style.background = isDark ? '#1e293b' : '#f8fafc'; }}
                    onMouseLeave={e => { if (environment !== vps.id) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${environment === vps.id ? 'bg-[#06b6d4]' : 'bg-gray-500'}`} />
                    <div>
                      <div>{vps.name || vps.id}</div>
                      <div className="text-[9px] text-gray-500 font-mono">{vps.host}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Status */}
        <div className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium"
          style={{
            background: 'rgba(16,185,129,0.08)',
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

      {/* Fermer dropdown en cliquant ailleurs */}
      {showDropdown && (
        <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
      )}
    </header>
  );
}