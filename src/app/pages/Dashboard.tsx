import { useState, useEffect } from 'react';
import {
  AreaChart, Area, XAxis, YAxis,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { motion } from 'motion/react';
import { useTheme } from '../theme-context';
import { useEnvironment } from '../../environment-context';
import {
  Globe2, Activity, Rocket, Database, Zap, Lock,
  ChevronDown, GitBranch, User, ArrowRight, AlertTriangle,
  ExternalLink, CheckCircle, AlertCircle, RefreshCw,
  Cpu, MemoryStick, Radio, Timer,
} from 'lucide-react';

import { apiFetch } from '../lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Container {
  name: string; cpu: string; mem: string; memPerc: string; status?: string;
}
interface LogEntry {
  container: string; timestamp: string; message: string; level: string;
}
interface Alert {
  id: string; type: string; title: string; message: string;
  container: string; value: number; timestamp: string;
}
interface LatencyData {
  avg: number;
  p95: number;
  uptime: number;
}
interface CpuHistoryData {
  [containerName: string]: number[]; // 24 valeurs (CPU %)
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getShortName(name: string) {
  return name.replace(/mypresc-(staging|production|dev)-/, '');
}
function getContainerIcon(name: string) {
  if (name.includes('nginx'))    return 'globe';
  if (name.includes('frontend')) return 'activity';
  if (name.includes('backend'))  return 'rocket';
  if (name.includes('db') || name.includes('postgres')) return 'db';
  if (name.includes('redis'))    return 'zap';
  if (name.includes('certbot'))  return 'lock';
  return 'zap';
}
function getContainerColor(name: string) {
  if (name.includes('nginx'))    return '#3b82f6';
  if (name.includes('frontend')) return '#8b5cf6';
  if (name.includes('backend'))  return '#10b981';
  if (name.includes('db') || name.includes('postgres')) return '#f59e0b';
  if (name.includes('redis'))    return '#ef4444';
  if (name.includes('certbot'))  return '#6366f1';
  return '#94a3b8';
}
function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)   return 'just now';
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function parseCpu(s: string) { return parseFloat(s?.replace('%', '') || '0'); }
function parseMem(s: string) { const v = parseFloat(s); return isNaN(v) ? 0 : v; }

// ── Sub-components ────────────────────────────────────────────────────────────
function SvcIcon({ icon, color, size = 14 }: { icon: string; color: string; size?: number }) {
  if (icon === 'activity') return <Activity size={size} className="flex-shrink-0" style={{ color }} />;
  if (icon === 'rocket')   return <Rocket   size={size} className="flex-shrink-0" style={{ color }} />;
  if (icon === 'db')       return <Database size={size} className="flex-shrink-0" style={{ color }} />;
  if (icon === 'zap')      return <Zap      size={size} className="flex-shrink-0" style={{ color }} />;
  if (icon === 'lock')     return <Lock     size={size} className="flex-shrink-0" style={{ color }} />;
  return <Globe2 size={size} className="flex-shrink-0" style={{ color }} />;
}

function PipelineNode({ label, icon, color, active = false, healthy = true, dark = true }:
  { label: string; icon: string; color: string; active?: boolean; healthy?: boolean; dark?: boolean }) {
  const c = healthy ? color : '#ef4444';
  return (
    <div className="relative flex-shrink-0" style={{
      borderRadius: 8, border: `1.5px solid ${c}`,
      boxShadow: `0 0 12px ${c}50, inset 0 0 20px ${c}08`,
      background: active ? `${c}15` : (dark ? '#0d1424' : '#f1f5f9'),
      padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 7,
    }}>
      <span className="absolute" style={{ top: -3, left: -3, width: 6, height: 6, borderRadius: '50%', backgroundColor: c, boxShadow: `0 0 6px ${c}` }} />
      <span className="absolute" style={{ top: -3, right: -3, width: 6, height: 6, borderRadius: '50%', backgroundColor: c, boxShadow: `0 0 6px ${c}` }} />
      <span className="absolute" style={{ bottom: -3, left: -3, width: 6, height: 6, borderRadius: '50%', backgroundColor: c, boxShadow: `0 0 6px ${c}` }} />
      <span className="absolute" style={{ bottom: -3, right: -3, width: 6, height: 6, borderRadius: '50%', backgroundColor: c, boxShadow: `0 0 6px ${c}` }} />
      <SvcIcon icon={icon} color={c} size={14} />
      <span className="text-xs font-semibold" style={{ color: dark ? '#fff' : '#0f172a' }}>{label}</span>
    </div>
  );
}

function HLine({ color, width = 24 }: { color: string; width?: number }) {
  return (
    <div className="flex items-center flex-shrink-0" style={{ width }}>
      <div style={{ flex: 1, height: 1.5, background: color, boxShadow: `0 0 4px ${color}` }} />
      <div style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: color, boxShadow: `0 0 5px ${color}`, flexShrink: 0 }} />
    </div>
  );
}

// ── Composant Heatmap avec données réelles ─────────────────────────────────────
function ActivityHeatmap({ containers, cpuHistory }: { containers: Container[]; cpuHistory: CpuHistoryData }) {
  const grid = containers.map(c => {
    const fullName = c.name;
    const short = getShortName(fullName);
    const icon = getContainerIcon(fullName);
    const history = cpuHistory[fullName] || cpuHistory[short] || [];
    const row = history.length === 24 ? history : Array(24).fill(0);
    return { name: short, icon, row };
  });

  const cellColor = (v: number) => {
    if (v < 5)  return '#0f172a';
    if (v < 20) return '#1e3a2f';
    if (v < 50) return '#10b981';
    if (v < 80) return '#f59e0b';
    return '#ef4444';
  };

  const hours = Array.from({ length: 24 }, (_, i) => {
    const h = new Date(); h.setHours(h.getHours() - 23 + i);
    return i % 6 === 0 ? `${h.getHours()}h` : '';
  });

  return (
    <div className="overflow-x-auto">
      <div className="flex flex-col gap-1.5 min-w-max">
        {grid.map(({ name, icon, row }) => (
          <div key={name} className="flex items-center gap-3">
            <div className="w-14 flex items-center gap-1.5">
              <SvcIcon icon={icon} color="#3b82f6" size={10} />
              <span className="text-[9px] text-gray-400 font-mono capitalize truncate">{name}</span>
            </div>
            <div className="flex gap-0.5">
              {row.map((v, i) => (
                <div key={i} title={`${name} — ${v.toFixed(1)}% CPU`}
                  className="rounded-sm transition-all duration-300"
                  style={{ width: 12, height: 12, backgroundColor: cellColor(v), boxShadow: v > 50 ? `0 0 4px ${cellColor(v)}80` : 'none' }}/>
              ))}
            </div>
          </div>
        ))}
        <div className="flex items-center gap-3 mt-1">
          <div className="w-14" />
          <div className="flex gap-0.5">
            {hours.map((h, i) => (
              <div key={i} className="text-[8px] text-gray-600 font-mono" style={{ width: 12, textAlign: 'center' }}>{h}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Memory Distribution – barres empilées + légende
function MemoryDistribution({ containers }: { containers: Container[] }) {
  const COLORS = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#6366f1'];
  const items = containers.map((c, i) => ({
    name:  getShortName(c.name),
    mem:   parseMem(c.mem?.split('/')[0]) || 0,
    color: COLORS[i % COLORS.length],
    icon:  getContainerIcon(c.name),
  }));
  const total = items.reduce((s, i) => s + i.mem, 0) || 1;

  return (
    <div className="space-y-3">
      <div className="flex h-6 rounded-full overflow-hidden gap-px">
        {items.map((it, i) => (
          <div key={i} title={`${it.name}: ${it.mem.toFixed(0)} MiB`}
            className="transition-all duration-700"
            style={{
              width: `${(it.mem / total) * 100}%`,
              background: it.color,
              boxShadow: `inset 0 1px 2px rgba(255,255,255,0.2)`,
              minWidth: it.mem > 0 ? 2 : 0,
            }}/>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: it.color, boxShadow: `0 0 4px ${it.color}` }}/>
            <SvcIcon icon={it.icon} color={it.color} size={9} />
            <span className="text-[9px] text-gray-400 capitalize truncate">{it.name}</span>
            <span className="text-[9px] font-mono text-gray-500 ml-auto">{it.mem.toFixed(0)}M</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// HTTP Latency – anneau + valeurs
function HttpLatency({ avg, p95, uptime }: { avg: number; p95: number; uptime: number }) {
  const color = avg < 200 ? '#10b981' : avg < 500 ? '#f59e0b' : '#ef4444';
  const r = 32, circ = 2 * Math.PI * r;
  const dash = circ * (uptime / 100);

  return (
    <div className="flex items-center gap-5">
      <div className="relative flex items-center justify-center" style={{ width: 80, height: 80 }}>
        <svg className="-rotate-90" width={80} height={80}>
          <circle cx={40} cy={40} r={r} fill="none" stroke="#1e293b" strokeWidth={5}/>
          <circle cx={40} cy={40} r={r} fill="none" stroke={color} strokeWidth={5}
            strokeDasharray={`${dash} ${circ-dash}`} strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 5px ${color})`, transition: 'all 1s ease' }}/>
        </svg>
        <div className="absolute text-center">
          <div className="text-[13px] font-black font-mono" style={{ color }}>{uptime.toFixed(1)}%</div>
          <div className="text-[7px] text-gray-600 uppercase tracking-wide">uptime</div>
        </div>
      </div>
      <div className="space-y-2">
        <div>
          <div className="text-[9px] text-gray-600 uppercase tracking-wide">Avg Latency</div>
          <div className="text-base font-black font-mono" style={{ color, textShadow: `0 0 8px ${color}60` }}>{avg}<span className="text-[10px] text-gray-500 ml-0.5">ms</span></div>
        </div>
        <div>
          <div className="text-[9px] text-gray-600 uppercase tracking-wide">P95</div>
          <div className="text-sm font-black font-mono text-gray-300">{p95}<span className="text-[10px] text-gray-500 ml-0.5">ms</span></div>
        </div>
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { theme } = useTheme();
  const { environment } = useEnvironment();
  const isDark = theme === 'dark';

  const [containers,   setContainers]   = useState<Container[]>([]);
  const [logs,         setLogs]         = useState<LogEntry[]>([]);
  const [alerts,       setAlerts]       = useState<Alert[]>([]);
  const [latency,      setLatency]      = useState<LatencyData>({ avg: 0, p95: 0, uptime: 100 });
  const [cpuHistory,   setCpuHistory]   = useState<CpuHistoryData>({});
  const [loading,      setLoading]      = useState(true);
  const [lastUpdated,  setLastUpdated]  = useState(0);

  const fetchAll = async () => {
    if (!environment) {
      setContainers([]);
      setLogs([]);
      setAlerts([]);
      setLatency({ avg: 0, p95: 0, uptime: 100 });
      setCpuHistory({});
      setLoading(false);
      setLastUpdated(0);
      return;
    }
    try {
      const [metricsRes, logsRes, alertsRes, latencyRes, cpuHistoryRes] = await Promise.allSettled([
        apiFetch(`/api/metrics/${environment}`),
        apiFetch(`/api/logs/${environment}?lines=30`),
        apiFetch(`/api/alerts/${environment}`),
        apiFetch(`/api/history/${environment}/latency?range=1h`),
        apiFetch(`/api/history/${environment}/cpu?range=24h`),
      ]);

      if (metricsRes.status === 'fulfilled' && metricsRes.value.ok) {
        const d = await metricsRes.value.json();
        setContainers(d.containers || []);
      }
      if (logsRes.status === 'fulfilled' && logsRes.value.ok) {
        const d = await logsRes.value.json();
        setLogs(d.logs?.slice(0, 8) || []);
      }
      if (alertsRes.status === 'fulfilled' && alertsRes.value.ok) {
        const d = await alertsRes.value.json();
        setAlerts(d.alerts || []);
      }
      if (latencyRes.status === 'fulfilled' && latencyRes.value.ok) {
        const d = await latencyRes.value.json();
        setLatency({ avg: d.avg || 0, p95: d.p95 || 0, uptime: d.uptime ?? 100 });
      }
      if (cpuHistoryRes.status === 'fulfilled' && cpuHistoryRes.value.ok) {
        const d = await cpuHistoryRes.value.json();
        setCpuHistory(d.history || {});
      }
      setLastUpdated(0);
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => {
    setLoading(true);
    setContainers([]); setLogs([]); setAlerts([]); setCpuHistory({});
    fetchAll();
  }, [environment]);

  useEffect(() => {
    const t = setInterval(() => { fetchAll(); setLastUpdated(s => s + 30); }, 30000);
    return () => clearInterval(t);
  }, [environment]);

  const row1 = containers.slice(0, 3);
  const row2 = containers.slice(3, 6);

  const activityFeed = logs.map(log => ({
    service:  getShortName(log.container),
    icon:     getContainerIcon(log.container),
    color:    getContainerColor(log.container),
    time:     timeAgo(log.timestamp),
    title:    log.message.slice(0, 60),
    sub:      log.level.toUpperCase(),
    level:    log.level,
  }));

  const dockerActions = logs
    .filter(l => l.level === 'error' || l.level === 'warn' || l.message.toLowerCase().includes('start') || l.message.toLowerCase().includes('restart'))
    .slice(0, 4)
    .map(log => ({
      service: getShortName(log.container),
      icon:    getContainerIcon(log.container),
      color:   getContainerColor(log.container),
      action:  log.message.slice(0, 50),
      detail:  log.level,
      time:    timeAgo(log.timestamp),
    }));

  const incidents = alerts.filter(a => a.type === 'critical');

  const card    = isDark ? 'bg-[#0f172a] border border-[#1e293b]' : 'bg-white border border-gray-200';
  const subCard = isDark ? 'bg-[#0a0f1e] border border-[#1e293b]' : 'bg-gray-50 border border-gray-100';
  const tt = {
    backgroundColor: isDark ? '#0f172a' : '#fff',
    border: `1px solid ${isDark ? '#1e293b' : '#e2e8f0'}`,
    borderRadius: 6, padding: '4px 8px', fontSize: 10,
    color: isDark ? '#e2e8f0' : '#0f172a',
  } as const;
  const ax = isDark ? '#334155' : '#94a3b8';

  const releaseHistory = containers.length > 0
    ? containers.map((c, i) => ({
        time: getShortName(c.name),
        v: parseCpu(c.cpu),
      }))
    : [{ time: '-', v: 0 }];

  return (
    <div className="flex flex-col gap-3 text-sm">

      {/* Status bar */}
      <div className={`flex items-center justify-between rounded-xl px-4 py-2 ${card}`}>
        <div className="flex items-center gap-2">
          {alerts.filter(a => a.type === 'critical').length > 0 ? (
            <span className="flex items-center gap-1 text-xs font-semibold text-[#ef4444]">
              <AlertCircle size={12} /> {alerts.filter(a => a.type === 'critical').length} Critical Alert(s)
            </span>
          ) : (
            <>
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#10b981]/20">
                <CheckCircle size={10} className="text-[#10b981]" />
              </span>
              <span className="text-xs font-semibold text-[#10b981]">All Systems Operational</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-gray-400">
          <span className="capitalize font-medium text-[#3b82f6]">{environment || 'No VPS'}</span>
          <span>·</span>
          <span>{containers.length} containers</span>
          <span>·</span>
          <button onClick={fetchAll} className="flex items-center gap-1 hover:text-gray-200 transition-colors">
            <RefreshCw size={10} /> Updated {lastUpdated}s ago
          </button>
        </div>
      </div>

      {/* Grille principale */}
      <div className="grid grid-cols-[1fr_220px_260px] gap-3 items-stretch">

        {/* LEFT */}
        <div className="flex flex-col gap-3 h-full">

          {/* Container Architecture */}
          <motion.div className={`rounded-xl p-4 ${card}`}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <h2 className="font-semibold text-sm">Container Architecture</h2>
                <button className="flex items-center gap-1 rounded-full bg-[#10b981]/15 px-2 py-0.5 text-[10px] text-[#10b981]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />Overview
                </button>
              </div>
              <span className="text-[10px] text-gray-500 capitalize">{environment}</span>
            </div>

            <div className={`rounded-lg p-3 ${subCard}`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-gray-300">Container Pipeline Status</h3>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="flex items-center gap-1 text-[#10b981]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]"/>
                    {containers.filter(c => c.status?.includes('Up')).length}/{containers.length} Running
                  </span>
                </div>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-8 text-xs text-gray-500">
                  <RefreshCw size={12} className="animate-spin mr-2" /> Chargement...
                </div>
              ) : containers.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-xs text-gray-500">
                  Aucun VPS connecté
                </div>
              ) : (
                <div className="relative rounded-lg p-4" style={{
                  background: isDark
                    ? 'radial-gradient(ellipse at 30% 50%, #1a1060 0%, #0a0f1e 50%, #0d1020 100%)'
                    : 'radial-gradient(ellipse at 30% 50%, #ede9fe 0%, #f1f5f9 60%, #e8f0fe 100%)',
                  border: isDark ? '1px solid #1e2a4a' : '1px solid #c7d2fe',
                  minHeight: 140,
                }}>
                  <div className="absolute top-2 left-16 w-20 h-20 rounded-full pointer-events-none" style={{ background: '#3b82f620', filter: 'blur(20px)' }} />
                  <div className="absolute bottom-2 right-16 w-16 h-16 rounded-full pointer-events-none" style={{ background: '#8b5cf620', filter: 'blur(16px)' }} />

                  <div className="flex items-center gap-0 mb-6 relative z-10 flex-wrap">
                    {row1.map((c, i) => {
                      const short   = getShortName(c.name);
                      const color   = getContainerColor(c.name);
                      const icon    = getContainerIcon(c.name);
                      const healthy = c.status?.includes('Up') ?? true;
                      return (
                        <div key={c.name} className="flex items-center">
                          <PipelineNode label={short} icon={icon} color={color}
                            active={healthy} healthy={healthy} dark={isDark} />
                          {i < row1.length - 1 && <HLine color={color} width={28} />}
                        </div>
                      );
                    })}
                  </div>

                  {row1[0] && row2[0] && (
                    <>
                      <div className="absolute z-10" style={{ left: 53, top: 36, width: 1.5, height: 44, background: 'linear-gradient(to bottom, #3b82f6, #6366f1)', boxShadow: '0 0 5px #3b82f680' }} />
                      <div className="absolute z-10" style={{ left: 46, top: 76, width: 7, height: 7, borderRadius: '50%', background: '#6366f1', boxShadow: '0 0 6px #6366f1' }} />
                    </>
                  )}

                  <div className="flex items-center gap-0 relative z-10 flex-wrap">
                    {row2.map((c, i) => {
                      const short   = getShortName(c.name);
                      const color   = getContainerColor(c.name);
                      const icon    = getContainerIcon(c.name);
                      const healthy = c.status?.includes('Up') ?? true;
                      return (
                        <div key={c.name} className="flex items-center">
                          <PipelineNode label={short} icon={icon} color={color}
                            active={healthy} healthy={healthy} dark={isDark} />
                          {i < row2.length - 1 && <HLine color={color} width={28} />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </motion.div>

          {/* Recent Deployments - sans texte supplémentaire */}
          <motion.div className={`rounded-xl p-4 flex-1 ${card}`}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-sm">Recent Deployments</h2>
            </div>
            <table className="w-full">
              <thead>
                <tr className="text-[10px] text-gray-500 border-b border-[#1e293b]">
                  <th className="text-left pb-2 font-medium">Service</th>
                  <th className="text-left pb-2 font-medium">Status</th>
                  <th className="text-left pb-2 font-medium">Container</th>
                  <th className="text-left pb-2 font-medium">CPU</th>
                  <th className="text-left pb-2 font-medium">Memory</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-xs text-gray-500">Chargement...</td>
                  </tr>
                )}
                {!loading && containers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-xs text-gray-500">Aucun container</td>
                  </tr>
                )}
                {!loading && containers.length > 0 && containers.map((c, i) => {
                  const short = getShortName(c.name);
                  const healthy = c.status?.includes('Up') ?? false;
                  return (
                    <tr key={c.name} className={`text-[11px] border-b border-[#0f172a] transition-colors hover:bg-[#1e293b]/40 ${i === 0 ? (isDark ? 'bg-[#1e293b]/60' : 'bg-blue-50') : ''}`}>
                      <td className="py-2 font-semibold capitalize">{short}</td>
                      <td className="py-2">
                        <span className={`flex items-center gap-1 ${healthy ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${healthy ? 'bg-[#10b981]' : 'bg-[#ef4444]'}`}/>
                          {healthy ? 'Running' : 'Down'}
                        </span>
                      </td>
                      <td className="py-2 text-gray-400 text-[10px] font-mono truncate max-w-[120px]">{c.name}</td>
                      <td className="py-2 text-gray-400">{c.cpu}</td>
                      <td className="py-2 text-gray-400 text-[10px]">{c.mem?.split('/')[0].trim()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </motion.div>
        </div>

        {/* MIDDLE — Activity Feed */}
        <motion.div className={`rounded-xl p-4 flex flex-col ${card}`}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
          <h2 className="font-semibold text-sm mb-4">Activity Feed</h2>
          <div className="relative flex flex-col flex-1">
            <div className="absolute left-[13px] top-0 bottom-0 w-px bg-gradient-to-b from-[#3b82f6]/40 via-[#8b5cf6]/30 to-transparent" />
            {loading ? (
              <div className="text-xs text-gray-500 pl-8">Chargement...</div>
            ) : activityFeed.length === 0 ? (
              <div className="text-xs text-gray-500 pl-8">Aucun log disponible</div>
            ) : (
              activityFeed.map((item, i) => (
                <motion.div key={i} className="relative flex gap-3 mb-3 last:mb-0"
                  initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.05 }}>
                  <div className="relative flex-shrink-0 z-10">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full"
                      style={{ backgroundColor: `${item.color}18`, boxShadow: `0 0 8px ${item.color}30`, border: `1.5px solid ${item.color}50` }}>
                      <SvcIcon icon={item.icon} color={item.color} size={12} />
                    </div>
                  </div>
                  <div className={`flex-1 min-w-0 rounded-lg p-2 ${subCard}`}>
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className="text-[11px] font-semibold capitalize">{item.service}</span>
                      <span className="text-[9px] text-gray-500 flex-shrink-0">{item.time}</span>
                    </div>
                    <div className="text-[10px] text-gray-300 leading-tight truncate">{item.title}</div>
                    <div className={`text-[9px] mt-0.5 ${item.level === 'error' ? 'text-[#ef4444]' : item.level === 'warn' ? 'text-[#f59e0b]' : 'text-gray-500'}`}>
                      {item.sub}
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </motion.div>

        {/* RIGHT */}
        <div className="flex flex-col gap-3 h-full">

          {/* CPU per Container */}
          <motion.div className={`rounded-xl p-4 ${card}`}
            initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.08 }}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold text-sm">
                CPU per Container
                <span className="ml-1 text-[10px] text-gray-500 font-normal">(live)</span>
              </h2>
            </div>
            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={releaseHistory} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="rh-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35}/>
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: ax, fontSize: 8 }}/>
                <YAxis axisLine={false} tickLine={false} tick={{ fill: ax, fontSize: 8 }} domain={[0, 100]}/>
                <Tooltip contentStyle={tt} formatter={(v: number) => [`${v}%`, 'CPU']}/>
                <Area type="monotone" dataKey="v" stroke="#3b82f6" strokeWidth={2} fill="url(#rh-grad)" dot={false} animationDuration={700}/>
              </AreaChart>
            </ResponsiveContainer>
          </motion.div>

          {/* Docker Actions */}
          <motion.div className={`rounded-xl p-4 flex-1 ${card}`}
            initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.12 }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-sm">Docker Actions</h2>
              <button className="flex items-center gap-1 text-[10px] text-gray-400">
                View All <ExternalLink size={9}/>
              </button>
            </div>
            <div className="space-y-2">
              {loading ? (
                <div className="text-xs text-gray-500">Chargement...</div>
              ) : dockerActions.length === 0 ? (
                containers.slice(0, 4).map((c, i) => (
                  <div key={i} className={`rounded-lg p-2.5 ${subCard}`}>
                    <div className="flex items-start gap-2">
                      <div className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full ${isDark ? 'bg-[#1e293b]' : 'bg-gray-200'}`}>
                        <SvcIcon icon={getContainerIcon(c.name)} color={getContainerColor(c.name)} size={11}/>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold capitalize">{getShortName(c.name)}</span>
                          <span className="text-[9px] text-[#10b981]">Running</span>
                        </div>
                        <div className="text-[9px] text-gray-400">{c.cpu} CPU · {c.mem?.split('/')[0].trim()}</div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                dockerActions.map((a, i) => (
                  <div key={i} className={`rounded-lg p-2.5 ${subCard}`}>
                    <div className="flex items-start gap-2">
                      <div className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full ${isDark ? 'bg-[#1e293b]' : 'bg-gray-200'}`}>
                        <SvcIcon icon={a.icon} color={a.color} size={11}/>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold capitalize">{a.service}</span>
                          <span className="text-[9px] text-gray-500">{a.time}</span>
                        </div>
                        <div className="text-[9px] text-gray-400 leading-tight truncate">{a.action}</div>
                        <div className={`text-[9px] ${a.detail === 'error' ? 'text-[#ef4444]' : a.detail === 'warn' ? 'text-[#f59e0b]' : 'text-gray-600'}`}>{a.detail}</div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>

          {/* Incidents */}
          <motion.div className={`rounded-xl p-4 ${card}`}
            initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.16 }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-sm">Incidents — Last 24h</h2>
              <button className="flex items-center gap-1 text-[10px] text-[#3b82f6] hover:underline">
                View History <ArrowRight size={9}/>
              </button>
            </div>
            {loading ? (
              <div className="text-xs text-gray-500">Chargement...</div>
            ) : incidents.length === 0 ? (
              <div className={`rounded-lg p-2.5 ${isDark ? 'bg-[#10b981]/10 border border-[#10b981]/20' : 'bg-green-50 border border-green-200'}`}>
                <div className="flex items-center gap-2">
                  <CheckCircle size={12} className="text-[#10b981]" />
                  <span className="text-[10px] font-semibold text-[#10b981]">No active incidents</span>
                </div>
                <div className="text-[9px] text-gray-500 mt-0.5 ml-5">All systems normal</div>
              </div>
            ) : (
              <div className="space-y-2">
                {incidents.map((inc, i) => (
                  <div key={i} className={`rounded-lg p-2.5 ${isDark ? 'bg-[#dc2626]/10 border border-[#dc2626]/20' : 'bg-red-50 border border-red-200'}`}>
                    <div className="flex items-start gap-2">
                      <AlertTriangle size={12} className="text-[#f59e0b] flex-shrink-0 mt-0.5"/>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold text-[#ef4444]">{inc.title}</span>
                          <span className="text-[9px] text-gray-500">{timeAgo(inc.timestamp)}</span>
                        </div>
                        <div className="text-[9px] text-gray-400">{inc.message}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </div>
      </div>

      {/* Nouvelle rangée : Heatmap + Memory Distribution + HTTP Latency */}
      <div className="grid grid-cols-[1fr_1fr_1fr] gap-3">
        {/* CPU Heatmap (avec données réelles) */}
        <motion.div className={`rounded-xl p-4 ${card}`}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Cpu size={14} className="text-[#3b82f6]" />
              <h2 className="font-semibold text-sm">CPU Heatmap — 24h</h2>
            </div>
            <div className="flex items-center gap-2 text-[8px] text-gray-600">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block bg-[#0f172a] border border-[#1e293b]"/>idle</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block bg-[#10b981]"/>normal</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block bg-[#ef4444]"/>high</span>
            </div>
          </div>
          {loading ? (
            <div className="text-xs text-gray-500 text-center py-8">Chargement...</div>
          ) : containers.length === 0 ? (
            <div className="text-xs text-gray-500 text-center py-8">Aucun container</div>
          ) : (
            <ActivityHeatmap containers={containers} cpuHistory={cpuHistory} />
          )}
        </motion.div>

        {/* Memory Distribution */}
        <motion.div className={`rounded-xl p-4 ${card}`}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }}>
          <div className="flex items-center gap-2 mb-3">
            <MemoryStick size={14} className="text-[#8b5cf6]" />
            <h2 className="font-semibold text-sm">Memory Distribution</h2>
          </div>
          {loading ? (
            <div className="text-xs text-gray-500 text-center py-8">Chargement...</div>
          ) : containers.length === 0 ? (
            <div className="text-xs text-gray-500 text-center py-8">Aucun container</div>
          ) : (
            <MemoryDistribution containers={containers} />
          )}
        </motion.div>

        {/* HTTP Latency */}
        <motion.div className={`rounded-xl p-4 ${card}`}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }}>
          <div className="flex items-center gap-2 mb-3">
            <Timer size={14} className="text-[#f59e0b]" />
            <h2 className="font-semibold text-sm">HTTP Latency</h2>
          </div>
          {loading ? (
            <div className="text-xs text-gray-500 text-center py-8">Chargement...</div>
          ) : (
            <HttpLatency avg={latency.avg} p95={latency.p95} uptime={latency.uptime} />
          )}
        </motion.div>
      </div>
    </div>
  );
}