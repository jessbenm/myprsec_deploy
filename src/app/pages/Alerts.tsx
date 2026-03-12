import { useState } from 'react';
import { motion } from 'motion/react';
import { useTheme } from '../theme-context';
import {
  AlertTriangle, CheckCircle, Info, X, Bell,
  Filter, RefreshCw, Clock, Server, Zap,
} from 'lucide-react';

const allAlerts = [
  {
    id: 1, level: 'critical', title: 'Backend CPU Critical',
    desc: 'Backend container CPU usage exceeded 80% for 5 minutes.',
    service: 'Backend', time: '4 hours ago', read: false,
  },
  {
    id: 2, level: 'warning', title: 'E2E Tests Incomplete',
    desc: '2 end-to-end tests failed in the latest pipeline run.',
    service: 'Pipeline', time: '6 hours ago', read: false,
  },
  {
    id: 3, level: 'info', title: 'SSL Certificate Renewed',
    desc: 'Certbot successfully renewed the SSL certificate for domain.com.',
    service: 'Certbot', time: '3 days ago', read: true,
  },
  {
    id: 4, level: 'critical', title: 'Redis Memory High',
    desc: 'Redis container memory usage at 92%. Consider scaling.',
    service: 'Redis', time: '1 day ago', read: false,
  },
  {
    id: 5, level: 'warning', title: 'Slow API Response',
    desc: 'API response time exceeded 800ms threshold on /api/users.',
    service: 'Backend', time: '2 days ago', read: true,
  },
  {
    id: 6, level: 'info', title: 'Deployment Successful',
    desc: 'Frontend v1.2.4 deployed successfully to Staging.',
    service: 'Frontend', time: '2 hours ago', read: true,
  },
  {
    id: 7, level: 'warning', title: 'Postgres Disk Usage',
    desc: 'Postgres volume at 74% capacity. Backup recommended.',
    service: 'Postgres', time: '5 days ago', read: true,
  },
];

const levelConfig = {
  critical: { icon: AlertTriangle, color: '#ef4444', bg: 'bg-red-500/10',    border: 'border-red-500/20',    label: 'Critical' },
  warning:  { icon: AlertTriangle, color: '#f59e0b', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', label: 'Warning'  },
  info:     { icon: Info,          color: '#3b82f6', bg: 'bg-blue-500/10',   border: 'border-blue-500/20',   label: 'Info'     },
};

type Level = keyof typeof levelConfig;

export default function Alerts() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [filter, setFilter] = useState<'all' | Level>('all');
  const [alerts, setAlerts] = useState(allAlerts);

  const card    = isDark ? 'bg-[#0f172a] border border-[#1e293b]' : 'bg-white border border-gray-200';
  const subCard = isDark ? 'bg-[#0a0f1e] border border-[#1e293b]' : 'bg-gray-50 border border-gray-100';
  const txt     = isDark ? 'text-white' : 'text-gray-900';
  const muted   = isDark ? 'text-[#64748b]' : 'text-gray-400';

  const filtered = filter === 'all' ? alerts : alerts.filter(a => a.level === filter);
  const unread   = alerts.filter(a => !a.read).length;

  const markAllRead = () => setAlerts(prev => prev.map(a => ({ ...a, read: true })));
  const dismiss     = (id: number) => setAlerts(prev => prev.filter(a => a.id !== id));

  const counts = {
    critical: alerts.filter(a => a.level === 'critical').length,
    warning:  alerts.filter(a => a.level === 'warning').length,
    info:     alerts.filter(a => a.level === 'info').length,
  };

  return (
    <div className="flex flex-col gap-4 text-sm max-w-4xl mx-auto">

      {/* ── Header ───────────────────────────────────────────────── */}
      <motion.div className={`rounded-xl p-5 ${card}`}
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#3b82f6]/15">
              <Bell size={18} className="text-[#3b82f6]" />
            </div>
            <div>
              <h1 className={`font-bold text-base ${txt}`}>Alerts & Notifications</h1>
              <p className={`text-xs ${muted}`}>
                {unread > 0 ? `${unread} unread alert${unread > 1 ? 's' : ''}` : 'All caught up!'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={markAllRead}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                isDark ? 'bg-[#1e293b] text-gray-300 hover:bg-[#334155]' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              <CheckCircle size={12} /> Mark all read
            </button>
            <button className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              isDark ? 'bg-[#1e293b] text-gray-300 hover:bg-[#334155]' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
              <RefreshCw size={12} /> Refresh
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          {(['critical', 'warning', 'info'] as Level[]).map(level => {
            const cfg = levelConfig[level];
            const Icon = cfg.icon;
            return (
              <div key={level} className={`rounded-xl p-3 flex items-center gap-3 ${subCard}`}>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg"
                  style={{ background: `${cfg.color}15` }}>
                  <Icon size={14} style={{ color: cfg.color }} />
                </div>
                <div>
                  <div className={`text-lg font-bold ${txt}`}>{counts[level]}</div>
                  <div className={`text-[10px] ${muted}`}>{cfg.label}</div>
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* ── Filter tabs ───────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <Filter size={12} className={muted} />
        {(['all', 'critical', 'warning', 'info'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-all capitalize ${
              filter === f
                ? 'bg-[#3b82f6] text-white'
                : isDark ? 'bg-[#1e293b] text-gray-400 hover:text-gray-200' : 'bg-gray-100 text-gray-500 hover:text-gray-700'
            }`}>
            {f === 'all' ? `All (${alerts.length})` : `${levelConfig[f].label} (${counts[f]})`}
          </button>
        ))}
      </div>

      {/* ── Alert list ───────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        {filtered.length === 0 && (
          <div className={`rounded-xl p-8 text-center ${card}`}>
            <CheckCircle size={32} className="mx-auto mb-2 text-[#10b981]" />
            <div className={`font-semibold ${txt}`}>No alerts</div>
            <div className={`text-xs mt-1 ${muted}`}>All systems operational</div>
          </div>
        )}
        {filtered.map((alert, i) => {
          const cfg = levelConfig[alert.level as Level];
          const Icon = cfg.icon;
          return (
            <motion.div key={alert.id}
              className={`relative rounded-xl p-4 border transition-all ${
                !alert.read
                  ? `${cfg.bg} ${cfg.border}`
                  : card
              }`}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              {/* Unread dot */}
              {!alert.read && (
                <div className="absolute top-4 right-10 h-2 w-2 rounded-full"
                  style={{ background: cfg.color, boxShadow: `0 0 6px ${cfg.color}` }} />
              )}

              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg mt-0.5"
                  style={{ background: `${cfg.color}15` }}>
                  <Icon size={14} style={{ color: cfg.color }} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`font-semibold text-xs ${txt}`}>{alert.title}</span>
                    <span className="rounded-full px-2 py-0.5 text-[9px] font-bold"
                      style={{ background: `${cfg.color}15`, color: cfg.color }}>
                      {cfg.label}
                    </span>
                    {!alert.read && (
                      <span className="rounded-full bg-[#3b82f6]/15 px-2 py-0.5 text-[9px] font-bold text-[#3b82f6]">
                        New
                      </span>
                    )}
                  </div>
                  <p className={`text-[11px] leading-relaxed mb-2 ${muted}`}>{alert.desc}</p>
                  <div className="flex items-center gap-3">
                    <span className={`flex items-center gap-1 text-[10px] ${muted}`}>
                      <Server size={9} /> {alert.service}
                    </span>
                    <span className={`flex items-center gap-1 text-[10px] ${muted}`}>
                      <Clock size={9} /> {alert.time}
                    </span>
                  </div>
                </div>

                {/* Dismiss */}
                <button onClick={() => dismiss(alert.id)}
                  className={`flex-shrink-0 rounded-lg p-1.5 transition-all ${
                    isDark ? 'hover:bg-[#1e293b] text-[#475569] hover:text-gray-300' : 'hover:bg-gray-100 text-gray-300 hover:text-gray-500'
                  }`}>
                  <X size={13} />
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

    </div>
  );
}