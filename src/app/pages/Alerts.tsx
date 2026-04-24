import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTheme } from '../theme-context';
import { useEnvironment } from '../../environment-context';
import {
  AlertTriangle, CheckCircle, Info, X, Bell,
  Filter, RefreshCw, Clock, Server, Zap, Loader2,
  Cpu, MemoryStick, WifiOff,
} from 'lucide-react';

import { apiFetch } from '../lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────
interface RawAlert {
  id: string;
  type: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  container: string;
  value: number;
  timestamp: string;
}

interface Alert {
  id: string;
  level: 'critical' | 'warning' | 'info';
  title: string;
  desc: string;
  service: string;
  time: string;
  read: boolean;
  value: number;
  raw: RawAlert;
}

interface AlertsStats {
  count: number;
  critical: number;
  warning: number;
  timestamp: string;
}

// ── Config ───────────────────────────────────────────────────────────────────
const levelConfig = {
  critical: {
    icon: AlertTriangle,
    color: '#ef4444',
    glow: 'rgba(239,68,68,0.2)',
    label: 'Critical',
    border: 'rgba(239,68,68,0.25)',
    bg: 'rgba(239,68,68,0.07)',
  },
  warning: {
    icon: AlertTriangle,
    color: '#f59e0b',
    glow: 'rgba(245,158,11,0.2)',
    label: 'Warning',
    border: 'rgba(245,158,11,0.25)',
    bg: 'rgba(245,158,11,0.07)',
  },
  info: {
    icon: Info,
    color: '#3b82f6',
    glow: 'rgba(59,130,246,0.2)',
    label: 'Info',
    border: 'rgba(59,130,246,0.25)',
    bg: 'rgba(59,130,246,0.07)',
  },
};

type Level = keyof typeof levelConfig;

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function alertIcon(alert: RawAlert) {
  if (alert.id.startsWith('cpu-'))  return Cpu;
  if (alert.id.startsWith('mem-'))  return MemoryStick;
  if (alert.id.startsWith('down-')) return WifiOff;
  return Zap;
}

function transformAlert(raw: RawAlert, readSet: Set<string>): Alert {
  return {
    id:      raw.id,
    level:   raw.type,
    title:   raw.title,
    desc:    raw.message,
    service: raw.container,
    time:    timeAgo(raw.timestamp),
    read:    readSet.has(raw.id),
    value:   raw.value,
    raw,
  };
}

// ── CSS ───────────────────────────────────────────────────────────────────────
const CSS = (isDark: boolean) => `
  @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&display=swap');

  .alr-root {
    font-family: 'Rajdhani', sans-serif;
    min-height: 100vh;
    color: ${isDark ? '#e2e8f0' : '#0f172a'};
    padding: 24px;
    position: relative;
  }

  /* ── Header card ── */
  .alr-header {
    border-radius: 18px;
    padding: 20px 24px;
    margin-bottom: 16px;
    position: relative;
    overflow: hidden;
    background: ${isDark
      ? 'linear-gradient(135deg, #050d1a 0%, #0a1628 50%, #050d1a 100%)'
      : 'white'};
    border: 1px solid ${isDark ? '#1e3a5f' : '#e2e8f0'};
    box-shadow: ${isDark ? '0 0 40px rgba(6,182,212,0.08)' : '0 4px 24px rgba(0,0,0,0.06)'};
  }
  .alr-header::before {
    content: '';
    position: absolute; top: 0; left: 0; right: 0; height: 1px;
    background: ${isDark
      ? 'linear-gradient(90deg, transparent, #06b6d4, #3b82f6, transparent)'
      : 'none'};
  }
  .alr-header-top {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 16px;
  }
  .alr-header-left { display: flex; align-items: center; gap: 14px; }
  .alr-bell-wrap {
    width: 44px; height: 44px; border-radius: 12px;
    background: linear-gradient(135deg, rgba(59,130,246,0.2), rgba(139,92,246,0.15));
    border: 1px solid rgba(59,130,246,0.35);
    display: flex; align-items: center; justify-content: center;
    position: relative;
  }
  .alr-bell-badge {
    position: absolute; top: -4px; right: -4px;
    width: 18px; height: 18px; border-radius: 50%;
    background: #ef4444;
    border: 2px solid ${isDark ? '#050d1a' : 'white'};
    display: flex; align-items: center; justify-content: center;
    font-size: 9px; font-weight: 700; color: white;
    box-shadow: 0 0 8px rgba(239,68,68,0.5);
  }
  .alr-title { font-size: 20px; font-weight: 700; letter-spacing: 0.02em; }
  .alr-subtitle { font-size: 13px; color: ${isDark ? '#64748b' : '#94a3b8'}; letter-spacing: 0.03em; }

  .alr-header-actions { display: flex; gap: 8px; }
  .alr-btn {
    display: flex; align-items: center; gap: 6px;
    padding: 8px 14px; border-radius: 10px; font-size: 13px; font-weight: 600;
    cursor: pointer; transition: all 0.2s; border: none;
    font-family: 'Rajdhani', sans-serif; letter-spacing: 0.04em;
  }
  .alr-btn-ghost {
    background: ${isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9'};
    border: 1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'};
    color: ${isDark ? '#94a3b8' : '#64748b'};
  }
  .alr-btn-ghost:hover {
    background: ${isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'};
    color: ${isDark ? '#e2e8f0' : '#0f172a'};
  }
  .alr-btn-primary {
    background: linear-gradient(135deg, #06b6d4, #3b82f6);
    color: white;
    box-shadow: 0 4px 14px rgba(6,182,212,0.3);
  }
  .alr-btn-primary:hover { box-shadow: 0 4px 20px rgba(6,182,212,0.5); transform: translateY(-1px); }

  /* ── Stat cards ── */
  .alr-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .alr-stat {
    padding: 14px 18px; border-radius: 14px;
    display: flex; align-items: center; gap: 12px;
    background: ${isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc'};
    border: 1px solid ${isDark ? '#1e293b' : '#e2e8f0'};
    transition: all 0.2s; cursor: default;
  }
  .alr-stat:hover { transform: translateY(-1px); }
  .alr-stat-icon {
    width: 40px; height: 40px; border-radius: 11px;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }
  .alr-stat-val {
    font-size: 28px; font-weight: 700; line-height: 1;
    font-family: 'Share Tech Mono', monospace;
  }
  .alr-stat-label { font-size: 12px; color: ${isDark ? '#64748b' : '#94a3b8'}; letter-spacing: 0.04em; margin-top: 2px; }

  /* ── Filter bar ── */
  .alr-filters {
    display: flex; align-items: center; gap: 8px;
    margin-bottom: 16px;
  }
  .alr-filter-pill {
    display: flex; align-items: center; gap: 5px;
    padding: 6px 14px; border-radius: 99px; font-size: 12px; font-weight: 600;
    cursor: pointer; transition: all 0.2s; border: none;
    font-family: 'Rajdhani', sans-serif; letter-spacing: 0.05em;
    background: ${isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9'};
    border: 1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0'};
    color: ${isDark ? '#64748b' : '#94a3b8'};
  }
  .alr-filter-pill.active {
    background: rgba(6,182,212,0.15);
    border-color: rgba(6,182,212,0.5);
    color: #06b6d4;
  }
  .alr-filter-pill:hover:not(.active) {
    border-color: rgba(6,182,212,0.3);
    color: ${isDark ? '#94a3b8' : '#64748b'};
  }

  /* ── Alert card ── */
  .alr-card {
    border-radius: 14px;
    margin-bottom: 10px;
    overflow: hidden;
    position: relative;
    transition: all 0.25s;
    border: 1px solid ${isDark ? '#1e293b' : '#e2e8f0'};
    background: ${isDark ? 'rgba(15,23,42,0.95)' : 'white'};
  }
  .alr-card:hover { transform: translateX(3px); }
  .alr-card.unread { border-left-width: 3px; }

  .alr-card-inner {
    display: flex; align-items: flex-start; gap: 14px;
    padding: 16px 18px;
  }
  .alr-card-icon {
    width: 38px; height: 38px; border-radius: 10px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    margin-top: 1px;
  }
  .alr-card-body { flex: 1; min-width: 0; }
  .alr-card-title-row {
    display: flex; align-items: center; gap: 8px; margin-bottom: 5px; flex-wrap: wrap;
  }
  .alr-card-title { font-size: 14px; font-weight: 700; letter-spacing: 0.02em; }
  .alr-badge {
    display: inline-flex; align-items: center; gap: 3px;
    padding: 2px 8px; border-radius: 99px; font-size: 10px; font-weight: 700;
    letter-spacing: 0.05em; text-transform: uppercase;
  }
  .alr-new-badge {
    background: rgba(59,130,246,0.15); color: #3b82f6;
    border: 1px solid rgba(59,130,246,0.3);
    padding: 2px 8px; border-radius: 99px; font-size: 10px; font-weight: 700;
    letter-spacing: 0.05em;
  }
  .alr-card-desc {
    font-size: 13px; color: ${isDark ? '#64748b' : '#94a3b8'};
    line-height: 1.5; margin-bottom: 8px;
    font-family: 'Rajdhani', sans-serif;
  }
  .alr-card-meta {
    display: flex; align-items: center; gap: 16px;
  }
  .alr-meta-item {
    display: flex; align-items: center; gap: 5px;
    font-size: 11px; color: ${isDark ? '#475569' : '#94a3b8'};
    font-weight: 600; letter-spacing: 0.03em;
  }

  /* Value bar */
  .alr-value-bar {
    margin-top: 10px; height: 3px; border-radius: 99px;
    background: ${isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9'};
    overflow: hidden;
  }
  .alr-value-fill {
    height: 100%; border-radius: 99px;
    transition: width 0.8s ease;
  }

  /* Dismiss btn */
  .alr-dismiss {
    flex-shrink: 0; width: 30px; height: 30px; border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; transition: all 0.2s;
    background: none; border: none;
    color: ${isDark ? '#334155' : '#cbd5e1'};
  }
  .alr-dismiss:hover {
    background: ${isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f9'};
    color: ${isDark ? '#94a3b8' : '#64748b'};
  }

  /* Empty state */
  .alr-empty {
    padding: 56px 24px; text-align: center;
    border-radius: 18px;
    background: ${isDark ? 'rgba(15,23,42,0.6)' : 'white'};
    border: 1px dashed ${isDark ? '#1e3a5f' : '#e2e8f0'};
  }
  .alr-empty-title { font-size: 16px; font-weight: 700; margin-top: 12px; letter-spacing: 0.02em; }
  .alr-empty-sub { font-size: 13px; color: ${isDark ? '#475569' : '#94a3b8'}; margin-top: 4px; }

  /* Loading */
  .alr-loading {
    padding: 48px; display: flex; flex-direction: column; align-items: center; gap: 14px;
    border-radius: 18px;
    background: ${isDark ? 'rgba(15,23,42,0.6)' : 'white'};
    border: 1px solid ${isDark ? '#1e3a5f' : '#e2e8f0'};
  }

  /* Error */
  .alr-error {
    padding: 18px 20px; border-radius: 14px;
    background: rgba(239,68,68,0.08);
    border: 1px solid rgba(239,68,68,0.25);
    display: flex; align-items: center; gap: 12px;
    font-size: 13px; color: #ef4444; margin-bottom: 16px;
    font-weight: 600;
  }

  /* Pulse animation for critical */
  @keyframes alr-pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
  .alr-pulse { animation: alr-pulse 2s ease-in-out infinite; }

  /* Auto-refresh indicator */
  .alr-refresh-indicator {
    display: flex; align-items: center; gap: 6px;
    font-size: 11px; color: ${isDark ? '#334155' : '#cbd5e1'};
    font-weight: 600; letter-spacing: 0.04em;
  }
  .alr-refresh-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: #10b981; box-shadow: 0 0 6px #10b981;
  }
`;

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Alerts() {
  const { theme }       = useTheme();
  const { environment } = useEnvironment();
  const isDark = theme === 'dark';

  const [alerts,    setAlerts]    = useState<Alert[]>([]);
  const [stats,     setStats]     = useState<AlertsStats | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [filter,    setFilter]    = useState<'all' | Level>('all');
  const [readSet,   setReadSet]   = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  // ── Fetch alerts ─────────────────────────────────────────────────────────
  const fetchAlerts = useCallback(async (silent = false) => {
    if (!environment) {
      setAlerts([]);
      setStats(null);
      setError('No VPS configured for this account yet');
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    try {
      const res  = await apiFetch(`/api/alerts/${environment}`);
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const data = await res.json();

      setStats({
        count:    data.count,
        critical: data.critical,
        warning:  data.warning,
        timestamp: data.timestamp,
      });

      const transformed = (data.alerts as RawAlert[]).map(raw =>
        transformAlert(raw, readSet)
      );
      setAlerts(transformed);
      setError(null);
      setLastFetch(new Date());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [environment, readSet]);

  useEffect(() => {
    setLoading(true);
    setAlerts([]);
    setError(null);
    fetchAlerts();
  }, [environment]);

  // Auto-refresh every 30s
  useEffect(() => {
    const t = setInterval(() => fetchAlerts(true), 30_000);
    return () => clearInterval(t);
  }, [fetchAlerts]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const markAllRead = () => {
    const allIds = new Set(alerts.map(a => a.id));
    setReadSet(allIds);
    setAlerts(prev => prev.map(a => ({ ...a, read: true })));
  };

  const dismiss = (id: string) => {
    setDismissed(prev => new Set([...prev, id]));
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  const markRead = (id: string) => {
    setReadSet(prev => new Set([...prev, id]));
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, read: true } : a));
  };

  // ── Derived ──────────────────────────────────────────────────────────────
  const visible  = alerts.filter(a => !dismissed.has(a.id));
  const filtered = filter === 'all' ? visible : visible.filter(a => a.level === filter);
  const unread   = visible.filter(a => !a.read).length;

  const counts = {
    critical: visible.filter(a => a.level === 'critical').length,
    warning:  visible.filter(a => a.level === 'warning').length,
    info:     visible.filter(a => a.level === 'info').length,
  };

  return (
    <div className="alr-root">
      <style>{CSS(isDark)}</style>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <motion.div className="alr-header"
        initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>

        <div className="alr-header-top">
          <div className="alr-header-left">
            <div className="alr-bell-wrap">
              <Bell size={20} color="#3b82f6" />
              {unread > 0 && (
                <div className="alr-bell-badge">{unread > 9 ? '9+' : unread}</div>
              )}
            </div>
            <div>
              <div className="alr-title">Alerts & Notifications</div>
              <div className="alr-subtitle">
                {loading
                  ? 'Fetching alerts...'
                  : error
                  ? 'Connection error'
                  : unread > 0
                  ? `${unread} unread • ${environment || 'No VPS'}`
                  : `All clear • ${environment || 'No VPS'}`
                }
              </div>
            </div>
          </div>

          <div className="alr-header-actions">
            {lastFetch && (
              <div className="alr-refresh-indicator">
                <div className="alr-refresh-dot" />
                {lastFetch.toLocaleTimeString('fr', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </div>
            )}
            <button className="alr-btn alr-btn-ghost" onClick={markAllRead}>
              <CheckCircle size={13} /> Mark all read
            </button>
            <button className="alr-btn alr-btn-primary" onClick={() => fetchAlerts()}>
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="alr-stats">
          {(['critical', 'warning', 'info'] as Level[]).map(level => {
            const cfg  = levelConfig[level];
            const Icon = cfg.icon;
            const count = level === 'info'
              ? (stats ? visible.length - counts.critical - counts.warning : counts.info)
              : counts[level];
            return (
              <motion.div key={level} className="alr-stat"
                style={{
                  borderColor: filter === level ? cfg.border : undefined,
                  background:  filter === level ? cfg.bg : undefined,
                }}
                whileHover={{ scale: 1.01 }}
                onClick={() => setFilter(f => f === level ? 'all' : level)}>
                <div className="alr-stat-icon"
                  style={{ background: `${cfg.color}18`, border: `1px solid ${cfg.color}30` }}>
                  <Icon size={18} style={{ color: cfg.color }} />
                </div>
                <div>
                  <div className="alr-stat-val" style={{ color: cfg.color }}>
                    {loading ? '—' : counts[level]}
                  </div>
                  <div className="alr-stat-label">{cfg.label}</div>
                </div>
                {level === 'critical' && counts.critical > 0 && !loading && (
                  <div style={{
                    marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%',
                    background: cfg.color, boxShadow: `0 0 8px ${cfg.color}`,
                  }} className="alr-pulse" />
                )}
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {/* ── Error ───────────────────────────────────────────────────── */}
      {error && (
        <div className="alr-error">
          <AlertTriangle size={16} />
          {error} — Vérifie que le VPS est configuré et accessible.
        </div>
      )}

      {/* ── Filters ─────────────────────────────────────────────────── */}
      <div className="alr-filters">
        <Filter size={12} style={{ color: isDark ? '#475569' : '#cbd5e1' }} />
        {(['all', 'critical', 'warning', 'info'] as const).map(f => {
          const count = f === 'all' ? visible.length : counts[f] ?? 0;
          return (
            <button key={f} className={`alr-filter-pill ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}>
              {f !== 'all' && (
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: levelConfig[f].color, display: 'inline-block' }} />
              )}
              {f === 'all' ? 'All' : levelConfig[f].label}
              <span style={{
                marginLeft: 2, fontSize: 10, fontWeight: 700,
                color: filter === f ? '#06b6d4' : isDark ? '#334155' : '#94a3b8',
              }}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Loading ─────────────────────────────────────────────────── */}
      {loading && (
        <div className="alr-loading">
          <Loader2 size={22} className="animate-spin" style={{ color: '#06b6d4' }} />
          <span style={{ fontSize: 13, color: isDark ? '#475569' : '#94a3b8', fontWeight: 600 }}>
            Fetching alerts from {environment}...
          </span>
        </div>
      )}

      {/* ── Alert List ──────────────────────────────────────────────── */}
      {!loading && (
        <AnimatePresence mode="popLayout">
          {filtered.length === 0 ? (
            <motion.div key="empty" className="alr-empty"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <CheckCircle size={36} style={{ color: '#10b981', margin: '0 auto' }} />
              <div className="alr-empty-title">
                {error ? 'Unable to load alerts' : 'No alerts'}
              </div>
              <div className="alr-empty-sub">
                {error ? error : filter === 'all'
                  ? 'All systems operational — no active alerts'
                  : `No ${filter} alerts right now`}
              </div>
            </motion.div>
          ) : (
            filtered.map((alert, i) => {
              const cfg     = levelConfig[alert.level];
              const LvlIcon = cfg.icon;
              const TypeIcon = alertIcon(alert.raw);

              return (
                <motion.div
                  key={alert.id}
                  layout
                  className={`alr-card ${!alert.read ? 'unread' : ''}`}
                  style={{
                    borderLeftColor: !alert.read ? cfg.color : undefined,
                    boxShadow: !alert.read ? `inset 3px 0 0 ${cfg.color}` : undefined,
                  }}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20, height: 0, marginBottom: 0, padding: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.2 }}
                  onClick={() => !alert.read && markRead(alert.id)}>

                  {/* Unread glow */}
                  {!alert.read && (
                    <div style={{
                      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                      background: `linear-gradient(90deg, ${cfg.bg} 0%, transparent 40%)`,
                      pointerEvents: 'none', borderRadius: 14,
                    }} />
                  )}

                  <div className="alr-card-inner">
                    {/* Icon */}
                    <div className="alr-card-icon"
                      style={{ background: `${cfg.color}15`, border: `1px solid ${cfg.color}25` }}>
                      <TypeIcon size={17} style={{ color: cfg.color }} />
                    </div>

                    {/* Body */}
                    <div className="alr-card-body">
                      <div className="alr-card-title-row">
                        <span className="alr-card-title">{alert.title}</span>
                        <span className="alr-badge"
                          style={{ background: `${cfg.color}15`, color: cfg.color, border: `1px solid ${cfg.color}25` }}>
                          <LvlIcon size={8} />
                          {cfg.label}
                        </span>
                        {!alert.read && <span className="alr-new-badge">NEW</span>}
                      </div>

                      <div className="alr-card-desc">{alert.desc}</div>

                      <div className="alr-card-meta">
                        <span className="alr-meta-item">
                          <Server size={10} style={{ color: cfg.color }} />
                          {alert.service}
                        </span>
                        <span className="alr-meta-item">
                          <Clock size={10} />
                          {alert.time}
                        </span>
                        {alert.value > 0 && (
                          <span className="alr-meta-item" style={{ color: cfg.color }}>
                            <Zap size={10} />
                            {alert.value.toFixed(1)}%
                          </span>
                        )}
                      </div>

                      {/* Progress bar for CPU/Memory alerts */}
                      {alert.value > 0 && (
                        <div className="alr-value-bar" style={{ marginTop: 10 }}>
                          <motion.div className="alr-value-fill"
                            style={{ background: `linear-gradient(90deg, ${cfg.color}80, ${cfg.color})` }}
                            initial={{ width: '0%' }}
                            animate={{ width: `${Math.min(100, alert.value)}%` }}
                            transition={{ duration: 0.8, delay: i * 0.05 }} />
                        </div>
                      )}
                    </div>

                    {/* Dismiss */}
                    <button className="alr-dismiss" onClick={e => { e.stopPropagation(); dismiss(alert.id); }}>
                      <X size={14} />
                    </button>
                  </div>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      )}

      {/* Footer count */}
      {!loading && filtered.length > 0 && (
        <div style={{
          textAlign: 'center', marginTop: 16, fontSize: 12,
          color: isDark ? '#334155' : '#cbd5e1', fontWeight: 600, letterSpacing: '0.05em',
        }}>
          {filtered.length} alert{filtered.length !== 1 ? 's' : ''} •{' '}
          auto-refresh every 30s
        </div>
      )}
    </div>
  );
}