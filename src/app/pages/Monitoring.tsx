import { useState, useEffect } from 'react';
import {
  AreaChart, Area, XAxis, YAxis,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { motion } from 'motion/react';
import { useTheme } from '../theme-context';
import {
  Cpu, MemoryStick, Activity, Box,
  RefreshCw, AlertTriangle, CheckCircle,
  Globe2, Rocket, Database, Zap, AlertCircle,
} from 'lucide-react';

// ── Data ──────────────────────────────────────────────────────────────────────
const cpuData = Array.from({ length: 25 }, (_, i) => ({
  time: `${i}:00`,
  nginx:    8  + Math.random() * 12,
  frontend: 18 + Math.random() * 16,
  backend:  35 + Math.random() * 20,
  postgres: 20 + Math.random() * 14,
  redis:    6  + Math.random() * 8,
}));

const memoryData = Array.from({ length: 25 }, (_, i) => ({
  time: `${String(i).padStart(2,'0')}:00`,
  value: 4.5 + Math.random() * 2.5,
}));

const responseData = Array.from({ length: 25 }, (_, i) => ({
  time: `${String(i + 7).padStart(2, '0')}:00`,
  p50: 90  + Math.random() * 60,
  p95: 200 + Math.random() * 80,
}));

const miniCpu   = Array.from({ length: 20 }, () => ({ v: 20 + Math.random() * 40 }));
const miniMem   = Array.from({ length: 20 }, () => ({ v: 2  + Math.random() * 1.5 }));
const miniReq   = Array.from({ length: 20 }, () => ({ v: 700 + Math.random() * 300 }));
const miniConts = [40,55,48,62,58,70,65,80,75,88,82,99].map(v => ({ v }));

const containerHealth = [
  { name: 'Nginx',    icon: 'globe',    cpu: 10, ram: '344 MB', status: 'ok',   color: '#3b82f6' },
  { name: 'Frontend', icon: 'activity', cpu: 26, ram: '560 MB', status: 'ok',   color: '#8b5cf6' },
  { name: 'Backend',  icon: 'rocket',   cpu: 43, ram: '1.1 GB', status: 'warn', color: '#10b981', warning: 'Slow Response' },
  { name: 'Postgres', icon: 'db',       cpu: 16, ram: '380 MB', status: 'ok',   color: '#f59e0b' },
  { name: 'Redis',    icon: 'zap',      cpu: 5,  ram: '248 MB', status: 'ok',   color: '#ef4444' },
];

const recentLogs = [
  { time: '14:92', text: 'Backend starts',                sub: 'Redis connection restored',  badge: '#3b82f6' },
  { time: '14:30', text: 'Redis container memory >150wS', sub: 'Betance tricies',             badge: '#f59e0b' },
  { time: '14:24', text: 'API Tinesuts',                  sub: 'Postgres Query Errors',       badge: '#10b981' },
];

const alertsData = [
  { level: 'error',   title: 'Backend CPU Critical', sub: 'Backend container CPU — 30%',  time: '14:23' },
  { level: 'warning', title: 'Redis Memory Warning', sub: 'Redis container memory...',     time: '14:18' },
  { level: 'info',    title: 'Database Errors',      sub: 'Redis containers Postgres...',  time: '14:25' },
];

// ── Sparkline ─────────────────────────────────────────────────────────────────
function Spark({ data, color, id }: { data: { v: number }[]; color: string; id: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.45} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5}
          fill={`url(#${id})`} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── Container icon ────────────────────────────────────────────────────────────
function CIcon({ icon, color }: { icon: string; color: string }) {
  const cls = 'w-3.5 h-3.5';
  if (icon === 'globe')    return <Globe2    className={cls} style={{ color }} />;
  if (icon === 'activity') return <Activity  className={cls} style={{ color }} />;
  if (icon === 'rocket')   return <Rocket    className={cls} style={{ color }} />;
  if (icon === 'db')       return <Database  className={cls} style={{ color }} />;
  return <Zap className={cls} style={{ color }} />;
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Monitoring() {
  const [timeRange, setTimeRange] = useState('24h');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(5);
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => setLastUpdated(s => s + 5), 5000);
    return () => clearInterval(t);
  }, [autoRefresh]);

  const tt = {
    backgroundColor: isDark ? '#0f172a' : '#ffffff',
    border: `1px solid ${isDark ? '#1e293b' : '#e2e8f0'}`,
    borderRadius: 6,
    padding: '4px 8px',
    fontSize: 10,
    color: isDark ? '#e2e8f0' : '#0f172a',
  } as const;

  const ax   = isDark ? '#334155' : '#94a3b8';
  const card = isDark
    ? 'bg-[#0f172a] border border-[#1e293b]'
    : 'bg-white border border-gray-200';

  return (
    <div className="flex flex-col gap-2.5 text-sm">

      {/* ── Status bar ─────────────────────────────────────────────────── */}
      <div className={`flex items-center justify-between rounded-xl px-4 py-2 ${card}`}>
        <div className="flex items-center gap-2">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#10b981]/20">
            <CheckCircle size={10} className="text-[#10b981]" />
          </span>
          <span className="text-xs font-semibold text-[#10b981]">All Systems Operational</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-gray-400">
          <span className="cursor-pointer hover:text-gray-200 transition-colors">Filter by service</span>
          <span>·</span>
          <span>Last updated {lastUpdated}s ago</span>
          <span>·</span>
          <button
            onClick={() => setAutoRefresh(r => !r)}
            className={`flex items-center gap-1 transition-colors ${autoRefresh ? 'text-[#10b981]' : 'text-gray-500'}`}
          >
            <RefreshCw size={10} className={autoRefresh ? 'animate-spin' : ''} style={{ animationDuration: '3s' }} />
            Auto-refresh {autoRefresh ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-2.5">
        {/* CPU */}
        <motion.div className={`rounded-xl px-3 py-2.5 flex items-center gap-2 ${card}`}
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-[10px] text-gray-400 mb-0.5">
              <Cpu size={11} /> CPU Usage
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-bold">37%</span>
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <Activity size={9} className="text-[#10b981]" />
              <span className="text-[9px] text-[#10b981]">▲ 2.4%</span>
            </div>
          </div>
          <div className="w-24 h-10 flex-shrink-0">
            <Spark data={miniCpu} color="#10b981" id="kpi-cpu" />
          </div>
        </motion.div>

        {/* Memory */}
        <motion.div className={`rounded-xl px-3 py-2.5 flex items-center gap-2 ${card}`}
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-[10px] text-gray-400 mb-0.5">
              <MemoryStick size={11} /> Memory
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-bold">2.6</span>
              <span className="text-xs text-gray-400">GB</span>
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <Activity size={9} className="text-[#8b5cf6]" />
              <span className="text-[9px] text-[#8b5cf6]">▲ 0.3 GB</span>
            </div>
          </div>
          <div className="w-24 h-10 flex-shrink-0">
            <Spark data={miniMem} color="#8b5cf6" id="kpi-mem" />
          </div>
        </motion.div>

        {/* Requests */}
        <motion.div className={`rounded-xl px-3 py-2.5 flex items-center gap-2 ${card}`}
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-[10px] text-gray-400 mb-0.5">
              <Activity size={11} /> Requests
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-bold">850</span>
              <span className="text-xs text-gray-400">/min</span>
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <Activity size={9} className="text-[#10b981]" />
              <span className="text-[9px] text-[#10b981]">▲ 12%</span>
            </div>
          </div>
          <div className="w-24 h-10 flex-shrink-0">
            <Spark data={miniReq} color="#10b981" id="kpi-req" />
          </div>
        </motion.div>

        {/* Containers */}
        <motion.div className={`rounded-xl px-3 py-2.5 flex items-center gap-2 ${card}`}
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-[10px] text-gray-400 mb-0.5">
              <Box size={11} /> Containers
              <span className="ml-auto text-[9px] text-[#3b82f6]">Last 30 Days</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-bold">99.98%</span>
            </div>
            <div className="text-[9px] text-gray-400 mt-0.5">Last updated</div>
          </div>
          <div className="w-16 h-10 flex-shrink-0 flex items-end gap-px">
            {miniConts.slice(-8).map((d, i) => (
              <div key={i} className="flex-1 rounded-sm bg-[#3b82f6]"
                style={{ height: `${(d.v / 100) * 100}%`, opacity: 0.5 + (i / 8) * 0.5 }} />
            ))}
          </div>
        </motion.div>
      </div>

      {/* ── Main grid ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-[1fr_280px] gap-2.5">

        {/* LEFT */}
        <div className="flex flex-col gap-2.5">

          {/* CPU Chart */}
          <motion.div className={`rounded-xl p-4 ${card}`}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <div className="flex items-start justify-between mb-1">
              <div>
                <h2 className="font-semibold text-sm">CPU Usage per Container</h2>
                <p className="text-[10px] text-gray-400">Last 24 hours</p>
              </div>
              <div className="flex items-center gap-1">
                {['1h','6h','12h','24h','7d','30d'].map(r => (
                  <button key={r} onClick={() => setTimeRange(r)}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-all ${
                      timeRange === r
                        ? 'bg-gradient-to-r from-[#3b82f6] to-[#8b5cf6] text-white'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-3 mb-1 text-[9px] text-gray-500">
              <span className="flex items-center gap-1"><span className="inline-block w-3 border-t border-dashed border-[#f59e0b]"/>75%</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 border-t border-dashed border-[#94a3b8]"/>90%</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 border-t border-gray-500"/>100%</span>
            </div>
            <ResponsiveContainer width="100%" height={210}>
              <AreaChart data={cpuData} margin={{ top: 4, right: 40, left: 0, bottom: 0 }}>
                <defs>
                  {[['nginx','#3b82f6'],['frontend','#8b5cf6'],['backend','#10b981'],['postgres','#f59e0b'],['redis','#ef4444']].map(([k,c]) => (
                    <linearGradient key={k} id={`cpu-${k}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={c} stopOpacity={0.25}/>
                      <stop offset="100%" stopColor={c} stopOpacity={0}/>
                    </linearGradient>
                  ))}
                </defs>
                <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: ax, fontSize: 9 }} interval={3}/>
                <YAxis orientation="right" axisLine={false} tickLine={false} tick={{ fill: ax, fontSize: 9 }}
                  domain={[0,100]} tickFormatter={v=>`${v}%`}/>
                <ReferenceLine y={75} stroke="#f59e0b" strokeDasharray="4 3" strokeOpacity={0.5}/>
                <ReferenceLine y={90} stroke="#94a3b8" strokeDasharray="4 3" strokeOpacity={0.4}/>
                <ReferenceLine y={100} stroke="#475569" strokeOpacity={0.3}/>
                <Tooltip contentStyle={tt} formatter={(v:number,n)=>[`${Math.round(v)}%`,n]}/>
                {[['nginx','#3b82f6'],['frontend','#8b5cf6'],['backend','#10b981'],['postgres','#f59e0b'],['redis','#ef4444']].map(([k,c])=>(
                  <Area key={k} type="monotone" dataKey={k} stroke={c} strokeWidth={2}
                    fill={`url(#cpu-${k})`} dot={false} animationDuration={700}/>
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </motion.div>

          {/* Memory + API Response side by side */}
          <div className="grid grid-cols-2 gap-2.5">
            <motion.div className={`rounded-xl p-3.5 ${card}`}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-semibold text-xs">Memory Usage</h2>
                <div className="flex gap-2 text-[9px] text-gray-500">
                  <span className="flex items-center gap-0.5"><span className="inline-block w-3 border-t border-dashed border-[#f59e0b]"/>75%</span>
                  <span className="flex items-center gap-0.5"><span className="inline-block w-3 border-t border-dashed border-[#94a3b8]"/>90%</span>
                  <span className="text-[#ef4444]">•Critical</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={130}>
                <AreaChart data={memoryData} margin={{ top: 4, right: 36, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="mem-g" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.4}/>
                      <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: ax, fontSize: 8 }} interval={6}/>
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: ax, fontSize: 8 }} orientation="right"
                    tickFormatter={v=>`${v.toFixed(0)} GB`}/>
                  <ReferenceLine y={6} stroke="#f59e0b" strokeDasharray="4 3" strokeOpacity={0.6}/>
                  <ReferenceLine y={7} stroke="#ef4444" strokeDasharray="4 3" strokeOpacity={0.6}/>
                  <Tooltip contentStyle={tt} formatter={(v:number)=>[`${v.toFixed(2)} GB`,'Memory']}/>
                  <Area type="monotone" dataKey="value" stroke="#8b5cf6" strokeWidth={2}
                    fill="url(#mem-g)" dot={false} animationDuration={700}/>
                </AreaChart>
              </ResponsiveContainer>
            </motion.div>

            <motion.div className={`rounded-xl p-3.5 ${card}`}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-semibold text-xs">API Response Time</h2>
                <div className="flex gap-2 text-[9px] text-gray-500">
                  <span className="flex items-center gap-0.5"><span className="w-3 h-px bg-[#f59e0b] inline-block"/>220 ms</span>
                  <span className="flex items-center gap-0.5"><span className="w-3 h-px bg-[#94a3b8] inline-block"/>380 ms</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={130}>
                <AreaChart data={responseData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="resp-p50" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="resp-p95" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.2}/>
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: ax, fontSize: 8 }} interval={4}/>
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: ax, fontSize: 8 }}
                    tickFormatter={v=>`${v} ms`}/>
                  <ReferenceLine y={220} stroke="#f59e0b" strokeDasharray="4 3" strokeOpacity={0.6}/>
                  <ReferenceLine y={380} stroke="#94a3b8" strokeDasharray="4 3" strokeOpacity={0.5}/>
                  <Tooltip contentStyle={tt} formatter={(v:number,n)=>[`${Math.round(v)} ms`,n==='p50'?'P50':'P95']}/>
                  <Area type="monotone" dataKey="p50" stroke="#10b981" strokeWidth={2} fill="url(#resp-p50)" dot={false} animationDuration={700}/>
                  <Area type="monotone" dataKey="p95" stroke="#f59e0b" strokeWidth={1.5} fill="url(#resp-p95)" dot={false} animationDuration={700}/>
                </AreaChart>
              </ResponsiveContainer>
            </motion.div>
          </div>

          {/* Extended API Response */}
          <motion.div className={`rounded-xl p-3.5 ${card}`}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-semibold text-xs">API Response Time</h2>
              <div className="flex gap-3 text-[9px] text-gray-500">
                <span className="flex items-center gap-1"><span className="w-4 h-px bg-[#10b981] inline-block"/>128 ms</span>
                <span className="flex items-center gap-1"><span className="w-4 h-px bg-[#f59e0b] inline-block"/>250 ms</span>
                <span className="flex items-center gap-1"><span className="w-3 border-t border-dashed border-[#ef4444] inline-block"/>30s Response</span>
                <span className="flex items-center gap-1"><span className="w-3 border-t border-dashed border-[#94a3b8] inline-block"/>3e 1s</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={110}>
              <AreaChart data={responseData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="ext-p50" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.2}/>
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="ext-p95" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.15}/>
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: ax, fontSize: 8 }} interval={3}/>
                <YAxis axisLine={false} tickLine={false} tick={{ fill: ax, fontSize: 8 }}
                  tickFormatter={v=>`${v} ms`}/>
                <ReferenceLine y={300} stroke="#ef4444" strokeDasharray="4 3" strokeOpacity={0.5}/>
                <Tooltip contentStyle={tt} formatter={(v:number)=>[`${Math.round(v)} ms`]}/>
                <Area type="monotone" dataKey="p50" stroke="#10b981" strokeWidth={2} fill="url(#ext-p50)" dot={false}/>
                <Area type="monotone" dataKey="p95" stroke="#f59e0b" strokeWidth={2} fill="url(#ext-p95)" dot={false}/>
              </AreaChart>
            </ResponsiveContainer>
          </motion.div>
        </div>

        {/* RIGHT sidebar */}
        <div className="flex flex-col gap-2.5">

          {/* Container Health */}
          <motion.div className={`rounded-xl p-3.5 ${card}`}
            initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="font-semibold text-xs">Container Health</h3>
              <select className={`text-[10px] px-1.5 py-0.5 rounded border outline-none ${
                isDark ? 'bg-[#1e293b] border-[#334155] text-gray-300' : 'bg-gray-100 border-gray-200 text-gray-600'
              }`}>
                <option>All</option><option>--</option>
              </select>
            </div>
            <div className="space-y-2">
              {containerHealth.map((c) => (
                <div key={c.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className={`flex h-5 w-5 items-center justify-center rounded ${
                      isDark ? 'bg-[#1e293b]' : 'bg-gray-100'
                    }`}>
                      <CIcon icon={c.icon} color={c.color} />
                    </span>
                    <div>
                      {c.warning ? (
                        <>
                          <div className="flex items-center gap-1 text-[10px] font-medium text-[#f59e0b]">
                            <AlertTriangle size={9} />{c.warning}
                          </div>
                          <div className="text-[9px] text-gray-500">{c.name}</div>
                        </>
                      ) : (
                        <div className="text-[10px] font-medium">{c.name}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className={`font-semibold ${c.cpu > 40 ? 'text-[#f59e0b]' : ''}`}>{c.cpu}%</span>
                    <span className="text-gray-400 text-[9px]">{c.ram}</span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Recent Logs */}
          <motion.div className={`rounded-xl p-3.5 ${card}`}
            initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }}>
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="font-semibold text-xs">Recent Logs</h3>
              <div className="flex gap-1.5 text-[10px] text-gray-400">
                <span>All</span><span>Open</span><span>▾</span>
              </div>
            </div>
            <div className="space-y-2.5">
              {recentLogs.map((log, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-[10px] text-gray-500 w-8 flex-shrink-0 mt-0.5">{log.time}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-medium leading-tight truncate">{log.text}</div>
                    <div className="text-[9px] text-gray-500 truncate">{log.sub}</div>
                  </div>
                  <span className="flex-shrink-0 rounded px-1 py-0.5 text-[8px] font-bold text-white"
                    style={{ backgroundColor: log.badge }}>
                    {log.time.replace(':', '')}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Alerts */}
          <motion.div className={`rounded-xl p-3.5 flex-1 ${card}`}
            initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="font-semibold text-xs">Alerts</h3>
              <div className="flex gap-1.5 text-[10px] text-gray-400">
                <span>All</span><span>Open</span><span>Critical ▾</span>
              </div>
            </div>
            <div className="space-y-2">
              {alertsData.map((a, i) => (
                <div key={i} className={`rounded-lg p-2 ${
                  a.level === 'error'
                    ? isDark ? 'bg-[#dc2626]/15' : 'bg-red-50'
                    : a.level === 'warning'
                    ? isDark ? 'bg-[#f59e0b]/15' : 'bg-amber-50'
                    : isDark ? 'bg-[#3b82f6]/10' : 'bg-blue-50'
                }`}>
                  <div className="flex items-start justify-between gap-1">
                    <div className="flex items-start gap-1">
                      {a.level === 'error'   && <AlertCircle   size={10} className="text-[#dc2626] mt-0.5 flex-shrink-0"/>}
                      {a.level === 'warning' && <AlertTriangle size={10} className="text-[#f59e0b] mt-0.5 flex-shrink-0"/>}
                      {a.level === 'info'    && <Activity      size={10} className="text-[#3b82f6] mt-0.5 flex-shrink-0"/>}
                      <div>
                        <div className={`text-[10px] font-semibold ${
                          a.level==='error' ? 'text-[#dc2626]' :
                          a.level==='warning' ? 'text-[#f59e0b]' : 'text-[#3b82f6]'
                        }`}>{a.title}</div>
                        <div className="text-[9px] text-gray-500">{a.sub}</div>
                      </div>
                    </div>
                    <span className="text-[9px] text-gray-400 flex-shrink-0">{a.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

        </div>
      </div>
    </div>
  );
}