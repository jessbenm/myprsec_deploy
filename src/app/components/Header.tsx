import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bell, ChevronDown, User, LogOut, Settings,
  CheckCheck, AlertTriangle, Info, Zap, X,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';
import { useTheme } from '../theme-context';
import { useEnvironment } from '../../environment-context';
import { useUser } from '../../user-context';
import { apiFetch } from '../lib/api';
import { logoutUser } from '../auth-api';
import { useNotifications, timeAgo, type AppNotification } from '../hooks/useNotifications';

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

interface VPS { id: string; name: string; host: string; }

// ── Notification severity config ─────────────────────────────────────────────
const NOTIF_CONFIG = {
  critical: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.25)', Icon: AlertTriangle },
  warning:  { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.25)', Icon: Zap },
  info:     { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.25)',  Icon: Info },
} as const;

// ── Profile popover ───────────────────────────────────────────────────────────
function ProfilePopover({
  user, isDark, onClose, onNavigate, onLogout,
}: {
  user: { name: string; email: string } | null;
  isDark: boolean;
  onClose: () => void;
  onNavigate: (path: string) => void;
  onLogout: () => void;
}) {
  const initials = user
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '??';

  const base: React.CSSProperties = {
    background:    isDark ? '#0c1526' : '#fff',
    border:        `1px solid ${isDark ? '#1e293b' : '#e2e8f0'}`,
    boxShadow:     '0 20px 60px rgba(0,0,0,0.45)',
    backdropFilter:'blur(24px)',
  };

  return (
    <div
      className="absolute right-0 top-11 z-50 w-60 rounded-2xl overflow-hidden"
      style={base}
    >
      {/* User info */}
      <div className="px-4 py-4 flex items-center gap-3"
        style={{ borderBottom: `1px solid ${isDark ? '#1e293b' : '#f1f5f9'}` }}>
        <div className="flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold text-white"
          style={{ background: 'linear-gradient(135deg, #06b6d4, #2563eb)', boxShadow: '0 2px 8px rgba(6,182,212,0.3)' }}>
          {initials}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate"
            style={{ color: isDark ? '#f1f5f9' : '#0f172a' }}>
            {user?.name || 'Unknown'}
          </p>
          <p className="text-[11px] truncate"
            style={{ color: isDark ? '#64748b' : '#94a3b8' }}>
            {user?.email || ''}
          </p>
          <span className="inline-block mt-0.5 text-[9px] font-semibold uppercase tracking-widest px-1.5 py-0.5 rounded"
            style={{ background: 'rgba(6,182,212,0.1)', color: '#06b6d4', border: '1px solid rgba(6,182,212,0.2)' }}>
            Member
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="py-1.5">
        <button
          onClick={() => { onNavigate('/profile'); onClose(); }}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors"
          style={{ color: isDark ? '#94a3b8' : '#475569' }}
          onMouseEnter={e => (e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.05)' : '#f8fafc')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <Settings size={14} style={{ color: isDark ? '#475569' : '#94a3b8' }} />
          Profile settings
        </button>
      </div>

      <div style={{ height: 1, background: isDark ? '#1e293b' : '#f1f5f9', margin: '0 16px' }} />

      <div className="py-1.5">
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors"
          style={{ color: '#ef4444' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.06)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <LogOut size={14} />
          Sign out
        </button>
      </div>
    </div>
  );
}

// ── Notification row ──────────────────────────────────────────────────────────
function NotifRow({ n, isDark, onClick }: { n: AppNotification; isDark: boolean; onClick: () => void }) {
  const cfg = NOTIF_CONFIG[n.type];
  const { Icon } = cfg;

  return (
    <button
      onClick={onClick}
      className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors relative"
      style={{
        background:  n.read ? 'transparent' : (isDark ? `${cfg.bg}` : `${cfg.bg}`),
        borderBottom: `1px solid ${isDark ? '#1e293b' : '#f1f5f9'}`,
      }}
      onMouseEnter={e => (e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc')}
      onMouseLeave={e => (e.currentTarget.style.background = n.read ? 'transparent' : cfg.bg)}
    >
      {/* Unread indicator */}
      {!n.read && (
        <span className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full"
          style={{ background: cfg.color }} />
      )}

      {/* Icon */}
      <div className="flex-shrink-0 mt-0.5 h-7 w-7 rounded-lg flex items-center justify-center"
        style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
        <Icon size={13} style={{ color: cfg.color }} />
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className="text-xs font-semibold truncate"
            style={{ color: isDark ? '#e2e8f0' : '#0f172a' }}>
            {n.title}
          </span>
          <span className="flex-shrink-0 text-[10px]"
            style={{ color: isDark ? '#475569' : '#94a3b8' }}>
            {timeAgo(n.timestamp)}
          </span>
        </div>
        <p className="text-[11px] leading-relaxed line-clamp-2"
          style={{ color: isDark ? '#64748b' : '#94a3b8' }}>
          {n.message}
        </p>
      </div>
    </button>
  );
}

// ── Notification panel ────────────────────────────────────────────────────────
function NotificationsPanel({
  notifications, unreadCount, isDark, onMarkAll, onMarkOne, onClose,
}: {
  notifications: AppNotification[];
  unreadCount: number;
  isDark: boolean;
  onMarkAll: () => void;
  onMarkOne: (id: string) => void;
  onClose: () => void;
}) {
  const base: React.CSSProperties = {
    background:    isDark ? '#0c1526' : '#fff',
    border:        `1px solid ${isDark ? '#1e293b' : '#e2e8f0'}`,
    boxShadow:     '0 20px 60px rgba(0,0,0,0.45)',
    backdropFilter:'blur(24px)',
  };

  return (
    <div
      className="absolute right-0 top-11 z-50 w-80 rounded-2xl overflow-hidden"
      style={base}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: `1px solid ${isDark ? '#1e293b' : '#f1f5f9'}` }}>
        <div className="flex items-center gap-2">
          <Bell size={13} style={{ color: isDark ? '#64748b' : '#94a3b8' }} />
          <span className="text-sm font-semibold"
            style={{ color: isDark ? '#f1f5f9' : '#0f172a' }}>
            Notifications
          </span>
          {unreadCount > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: '#ef4444', color: '#fff' }}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button
              onClick={onMarkAll}
              className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg transition-colors"
              style={{ color: '#06b6d4' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(6,182,212,0.08)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              title="Mark all as read"
            >
              <CheckCheck size={12} />
              All read
            </button>
          )}
          <button
            onClick={onClose}
            className="flex items-center justify-center h-6 w-6 rounded-lg transition-colors"
            style={{ color: isDark ? '#475569' : '#94a3b8' }}
            onMouseEnter={e => (e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* List */}
      <div style={{ maxHeight: 360, overflowY: 'auto' }}>
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 px-4 text-center">
            <Bell size={28} style={{ color: isDark ? '#334155' : '#cbd5e1' }} />
            <p className="text-sm font-medium"
              style={{ color: isDark ? '#475569' : '#94a3b8' }}>
              No notifications
            </p>
            <p className="text-[11px]"
              style={{ color: isDark ? '#334155' : '#cbd5e1' }}>
              You're all caught up
            </p>
          </div>
        ) : (
          notifications.map(n => (
            <NotifRow
              key={n.id}
              n={n}
              isDark={isDark}
              onClick={() => onMarkOne(n.id)}
            />
          ))
        )}
      </div>

      {/* Footer */}
      {notifications.length > 0 && (
        <div className="px-4 py-2.5 flex items-center justify-center"
          style={{ borderTop: `1px solid ${isDark ? '#1e293b' : '#f1f5f9'}` }}>
          <span className="text-[11px]" style={{ color: isDark ? '#334155' : '#cbd5e1' }}>
            {notifications.length} notification{notifications.length !== 1 ? 's' : ''} · refreshes every 30s
          </span>
        </div>
      )}
    </div>
  );
}

// ── Main Header ───────────────────────────────────────────────────────────────
export default function Header() {
  const { environment, setEnvironment } = useEnvironment();
  const { user } = useUser();
  const location  = useLocation();
  const navigate  = useNavigate();
  const { theme } = useTheme();
  const isDark    = theme === 'dark';
  const pageTitle = pageTitles[location.pathname] || 'Dashboard';

  const avatarInitials = user
    ? user.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : 'YA';

  // ── VPS list ────────────────────────────────────────────────────────────────
  const [vpsList,      setVpsList]      = useState<VPS[]>([]);
  const [showVpsMenu,  setShowVpsMenu]  = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res  = await apiFetch('/api/vps');
        const data = await res.json();
        const list: VPS[] = Array.isArray(data) ? data : Object.values(data);
        setVpsList(list);
        if (list.length > 0 && !list.find(v => v.id === environment)) {
          setEnvironment(list[0].id);
        } else if (list.length === 0 && environment) {
          setEnvironment('');
        }
      } catch {
        setVpsList([]);
        if (environment) setEnvironment('');
      }
    };
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [environment, setEnvironment]);

  const currentVps = vpsList.find(v => v.id === environment);

  // ── Popover state + click-away ───────────────────────────────────────────────
  const [showProfile, setShowProfile] = useState(false);
  const [showNotifs,  setShowNotifs]  = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const bellRef    = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (showProfile && profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setShowProfile(false);
      }
      if (showNotifs && bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setShowNotifs(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showProfile, showNotifs]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setShowProfile(false); setShowNotifs(false); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // ── Notifications ────────────────────────────────────────────────────────────
  const { notifications, unreadCount, markAllRead, markOneRead } = useNotifications(environment);

  // Auto-mark all as read 1s after opening the panel (gives user time to see the badge)
  useEffect(() => {
    if (!showNotifs || unreadCount === 0) return;
    const t = setTimeout(markAllRead, 1000);
    return () => clearTimeout(t);
  }, [showNotifs, unreadCount, markAllRead]);

  // ── Logout ───────────────────────────────────────────────────────────────────
  const handleLogout = useCallback(async () => {
    setShowProfile(false);
    try { await logoutUser(); } catch { /* ignore */ }
    navigate('/login', { replace: true });
  }, [navigate]);

  return (
    <header
      className="app-header flex h-14 items-center justify-between border-b px-6 backdrop-blur-xl transition-colors duration-300"
      style={{
        background:  isDark ? 'rgba(5,13,26,0.95)' : 'rgba(255,255,255,0.95)',
        borderColor: isDark ? 'rgba(6,182,212,0.1)' : 'rgba(0,0,0,0.08)',
        position:    'relative',
        zIndex:      50,
      }}
    >
      {/* ── Left: title ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col">
        <div className="text-lg font-black tracking-tight text-white">
          Yam<span className="text-blue-300">Ops</span>
        </div>
        <span className="text-[10px] font-medium uppercase tracking-widest"
          style={{ color: isDark ? '#475569' : '#94a3b8' }}>
          {pageTitle}
        </span>
      </div>

      {/* ── Right ─────────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">

        {/* VPS switcher */}
        {vpsList.length <= 3 ? (
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
          <div className="relative">
            <button
              onClick={() => setShowVpsMenu(d => !d)}
              className="flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-200"
              style={{
                background: 'linear-gradient(135deg, #06b6d4, #2563eb)',
                color: '#fff',
                boxShadow: '0 2px 10px rgba(6,182,212,0.35)',
              }}
            >
              {currentVps?.name || environment || 'No VPS'}
              <ChevronDown size={11} />
            </button>
            {showVpsMenu && (
              <div className="absolute right-0 top-10 w-48 rounded-xl overflow-hidden shadow-2xl z-50"
                style={{
                  background: isDark ? '#0f172a' : '#fff',
                  border: `1px solid ${isDark ? '#1e293b' : '#e2e8f0'}`,
                }}>
                {vpsList.map(vps => (
                  <button key={vps.id}
                    onClick={() => { setEnvironment(vps.id); setShowVpsMenu(false); }}
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

        {/* Status pill */}
        <div className="hidden sm:flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium"
          style={{
            background: 'rgba(16,185,129,0.08)',
            border: '1px solid rgba(16,185,129,0.2)',
            color: '#10b981',
          }}>
          <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]"
            style={{ boxShadow: '0 0 6px #10b981', animation: 'pulse 2s infinite' }} />
          All Systems Operational
        </div>

        {/* ── Bell ──────────────────────────────────────────────────────────── */}
        <div ref={bellRef} className="relative">
          <button
            aria-label="Notifications"
            onClick={() => { setShowNotifs(v => !v); setShowProfile(false); }}
            className="relative flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-200"
            style={{
              background: showNotifs
                ? (isDark ? 'rgba(6,182,212,0.1)' : 'rgba(6,182,212,0.08)')
                : (isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9'),
              border: `1px solid ${showNotifs ? 'rgba(6,182,212,0.4)' : (isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0')}`,
              color: showNotifs ? '#06b6d4' : (isDark ? '#64748b' : '#94a3b8'),
            }}
          >
            <Bell size={15} />
            {unreadCount > 0 && (
              <span
                className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white"
                style={{ background: '#ef4444', boxShadow: '0 0 8px rgba(239,68,68,0.6)' }}
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {showNotifs && (
            <NotificationsPanel
              notifications={notifications}
              unreadCount={unreadCount}
              isDark={isDark}
              onMarkAll={markAllRead}
              onMarkOne={markOneRead}
              onClose={() => setShowNotifs(false)}
            />
          )}
        </div>

        {/* ── Avatar / profile button ───────────────────────────────────────── */}
        <div ref={profileRef} className="relative">
          <button
            aria-label="User menu"
            onClick={() => { setShowProfile(v => !v); setShowNotifs(false); }}
            className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white transition-all duration-200"
            style={{
              background: 'linear-gradient(135deg, #06b6d4, #2563eb)',
              boxShadow: showProfile
                ? '0 0 0 2px rgba(6,182,212,0.5), 0 2px 8px rgba(6,182,212,0.3)'
                : '0 2px 8px rgba(6,182,212,0.3)',
            }}
          >
            {avatarInitials}
          </button>

          {showProfile && (
            <ProfilePopover
              user={user}
              isDark={isDark}
              onClose={() => setShowProfile(false)}
              onNavigate={navigate}
              onLogout={handleLogout}
            />
          )}
        </div>
      </div>

      {/* VPS dropdown click-away overlay */}
      {showVpsMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setShowVpsMenu(false)} />
      )}
    </header>
  );
}
