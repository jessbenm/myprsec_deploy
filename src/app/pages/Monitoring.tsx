import { useState, useEffect } from 'react';
import {
  AreaChart, Area, XAxis, YAxis,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { motion } from 'motion/react';
import { useTheme } from '../theme-context';
import { useEnvironment } from '../../environment-context';
import {
  Cpu, MemoryStick, Activity, Box,
  RefreshCw, AlertTriangle, CheckCircle,
  Globe2, Rocket, Database, Zap, AlertCircle,
} from 'lucide-react';

const BACKEND_URL = 'http://localhost:3001';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Container {
  name: string; cpu: string; mem: string; memPerc: string; status?: string;
}
interface MetricsData {
  containers: Container[];
  ps: { name: string; status: string }[];
  timestamp: string;
}
interface LogEntry {
  container: string; timestamp: string; message: string; level: string;
}
interface Alert {
  id: string; type: string; title: string; message: string;
  container: string; value: number; timestamp: string;
}
interface ResponsePoint { time: string; avg: number; p95: number; }
interface RequestPoint  { time: string; count: number; }

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseCpu(cpu: string): number { return parseFloat(cpu.replace('%', '')) || 0; }
function parseMem(mem: string): number {
  const match = mem.match(/([\d.]+)\s*(MiB|GiB|MB|GB)/i);
  if (!match) return 0;
  const val = parseFloat(match[1]);
  return /gib|gb/i.test(match[2]) ? val * 1024 : val;
}
function getShortName(name: string): string {
  return name.replace('mypresc-staging-','').replace('mypresc-production-','').replace('mypresc-','');
}
function getContainerIcon(name: string): string {
  if (name.includes('nginx'))    return 'globe';
  if (name.includes('frontend')) return 'activity';
  if (name.includes('backend'))  return 'rocket';
  if (name.includes('db') || name.includes('postgres')) return 'db';
  return 'zap';
}

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
  if (icon === 'globe')    return <Globe2   className={cls} style={{ color }} />;
  if (icon === 'activity') return <Activity className={cls} style={{ color }} />;
  if (icon === 'rocket')   return <Rocket   className={cls} style={{ color }} />;
  if (icon === 'db')       return <Database className={cls} style={{ color }} />;
  return <Zap className={cls} style={{ color }} />;
}

const CONTAINER_COLORS = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#94a3b8'];

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Monitoring() {
  const [timeRange,    setTimeRange]    = useState('24h');
  const [autoRefresh,  setAutoRefresh]  = useState(true);
  const [lastUpdated,  setLastUpdated]  = useState(0);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);

  // Données réelles
  const [metrics,       setMetrics]      = useState<MetricsData | null>(null);
  const [logs,          setLogs]         = useState<LogEntry[]>([]);
  const [alerts,        setAlerts]       = useState<Alert[]>([]);
  const [responsePts,   setResponsePts]  = useState<ResponsePoint[]>([]);
  const [requestPts,    setRequestPts]   = useState<RequestPoint[]>([]);
  const [currentRpm,    setCurrentRpm]   = useState(0);

  // Historiques pour graphiques
  const [cpuHistory, setCpuHistory] = useState<any[]>([]);
  const [memHistory, setMemHistory] = useState<{ v: number }[]>([]);
  const [reqHistory, setReqHistory] = useState<{ v: number }[]>([]);

  const { theme } = useTheme();
  const { environment } = useEnvironment();
  const isDark = theme === 'dark';

  // ── Fetch all data ──────────────────────────────────────────────────────────
  const fetchAll = async () => {
    try {
      // Métriques principales (obligatoire)
      const res = await fetch(`${BACKEND_URL}/api/metrics/${environment}`);
      if (!res.ok) throw new Error('VPS non trouvé — ajoutez le VPS d\'abord');
      const data: MetricsData = await res.json();
      setMetrics(data);
      setError(null);
      setLastUpdated(0);

      // CPU history
      const now = new Date();
      const timeLabel = `${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}`;
      const cpuPoint: any = { time: timeLabel };
      data.containers.forEach(c => { cpuPoint[getShortName(c.name)] = parseCpu(c.cpu); });
      setCpuHistory(prev => [...prev.slice(-24), cpuPoint]);

      // Mem history
      const totalMem = data.containers.reduce((sum, c) => sum + parseMem(c.mem), 0);
      setMemHistory(prev => [...prev.slice(-24), { v: parseFloat((totalMem / 1024).toFixed(2)) }]);

      // Autres données en parallèle (silencieux si erreur)
      const [logsRes, alertsRes, responseRes, requestsRes] = await Promise.allSettled([
        fetch(`${BACKEND_URL}/api/logs/${environment}`),
        fetch(`${BACKEND_URL}/api/alerts/${environment}`),
        fetch(`${BACKEND_URL}/api/response-time/${environment}`),
        fetch(`${BACKEND_URL}/api/requests/${environment}`),
      ]);

      if (logsRes.status === 'fulfilled' && logsRes.value.ok) {
        const d = await logsRes.value.json();
        setLogs(d.logs?.slice(0, 10) || []);
      }

      if (alertsRes.status === 'fulfilled' && alertsRes.value.ok) {
        const d = await alertsRes.value.json();
        setAlerts(d.alerts || []);
      }

      if (responseRes.status === 'fulfilled' && responseRes.value.ok) {
        const d = await responseRes.value.json();
        setResponsePts(d.points || []);
      }

      if (requestsRes.status === 'fulfilled' && requestsRes.value.ok) {
        const d = await requestsRes.value.json();
        setCurrentRpm(d.current_rpm || 0);
        setRequestPts(d.points || []);
        setReqHistory(prev => [...prev.slice(-24), { v: d.current_rpm || 0 }]);
      }

    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true); setMetrics(null);
    setCpuHistory([]); setMemHistory([]); setReqHistory([]);
    fetchAll();
  }, [environment]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => { fetchAll(); setLastUpdated(s => s + 5); }, 5000);
    return () => clearInterval(t);
  }, [autoRefresh, environment]);

  // ── Styles ──────────────────────────────────────────────────────────────────
  const tt = {
    backgroundColor: isDark ? '#0f172a' : '#ffffff',
    border: `1px solid ${isDark ? '#1e293b' : '#e2e8f0'}`,
    borderRadius: 6, padding: '4px 8px', fontSize: 10,
    color: isDark ? '#e2e8f0' : '#0f172a',
  } as const;
  const ax   = isDark ? '#334155' : '#94a3b8';
  const card = isDark ? 'bg-[#0f172a] border border-[#1e293b]' : 'bg-white border border-gray-200';

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const totalCpu  = metrics ? metrics.containers.reduce((s,c) => s + parseCpu(c.cpu), 0) / metrics.containers.length : 0;
  const totalMemMB = metrics ? metrics.containers.reduce((s,c) => s + parseMem(c.mem), 0) : 0;
  const runningCount = metrics ? metrics.ps.filter(p => p.status.includes('Up')).length : 0;
  const totalCount   = metrics ? metrics.ps.length : 0;
  const miniCpuData  = cpuHistory.map(p => ({
    v: Object.keys(p).filter(k=>k!=='time').reduce((s,k)=>s+(p[k]||0),0) / Math.max(1,Object.keys(p).length-1)
  }));

  // Uptime sparkline (barres fixes)
  const uptimeBars = [40,55,48,62,58,70,65,80,75,88,82,99].map(v => ({ v }));

  return (
    <div className="flex flex-col gap-2.5 text-sm">

      {/* ── Status bar ──────────────────────────────────────────────────────── */}
      <div className={`flex items-center justify-between rounded-xl px-4 py-2 ${card}`}>
        <div className="flex items-center gap-2">
          {error ? (
            <span className="flex items-center gap-1 text-xs font-semibold text-[#ef4444]">
              <AlertCircle size={12} /> {error}
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
          <span className="capitalize font-medium text-[#3b82f6]">{environment}</span>
          <span>·</span>
          <span>Last updated {lastUpdated}s ago</span>
          <span>·</span>
          <button onClick={() => setAutoRefresh(r => !r)}
            className={`flex items-center gap-1 transition-colors ${autoRefresh ? 'text-[#10b981]' : 'text-gray-500'}`}>
            <RefreshCw size={10} className={autoRefresh ? 'animate-spin' : ''} style={{ animationDuration: '3s' }} />
            Auto-refresh {autoRefresh ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {/* ── Loading ─────────────────────────────────────────────────────────── */}
      {loading && (
        <div className={`rounded-xl p-6 text-center text-sm text-gray-400 ${card}`}>
          Connexion au VPS {environment}...
        </div>
      )}

      {!loading && !error && metrics && (<>

        {/* ── KPI Cards ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-4 gap-2.5">

          {/* CPU */}
          <motion.div className={`rounded-xl px-3 py-2.5 flex items-center gap-2 ${card}`}
            initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} transition={{ delay:0 }}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-[10px] text-gray-400 mb-0.5">
                <Cpu size={11} /> CPU Usage
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold">{totalCpu.toFixed(1)}%</span>
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <Activity size={9} className="text-[#10b981]" />
                <span className="text-[9px] text-[#10b981]">Réel</span>
              </div>
            </div>
            <div className="w-24 h-10 flex-shrink-0">
              <Spark data={miniCpuData.length ? miniCpuData : [{v:0}]} color="#10b981" id="kpi-cpu" />
            </div>
          </motion.div>

          {/* Memory */}
          <motion.div className={`rounded-xl px-3 py-2.5 flex items-center gap-2 ${card}`}
            initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.05 }}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-[10px] text-gray-400 mb-0.5">
                <MemoryStick size={11} /> Memory
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold">{(totalMemMB/1024).toFixed(1)}</span>
                <span className="text-xs text-gray-400">GB</span>
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <Activity size={9} className="text-[#8b5cf6]" />
                <span className="text-[9px] text-[#8b5cf6]">Réel</span>
              </div>
            </div>
            <div className="w-24 h-10 flex-shrink-0">
              <Spark data={memHistory.length ? memHistory : [{v:0}]} color="#8b5cf6" id="kpi-mem" />
            </div>
          </motion.div>

          {/* Requests/min */}
          <motion.div className={`rounded-xl px-3 py-2.5 flex items-center gap-2 ${card}`}
            initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.1 }}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-[10px] text-gray-400 mb-0.5">
                <Activity size={11} /> Requests
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold">{currentRpm || '—'}</span>
                {currentRpm > 0 && <span className="text-xs text-gray-400">/min</span>}
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <Activity size={9} className="text-[#10b981]" />
                <span className="text-[9px] text-[#10b981]">Nginx réel</span>
              </div>
            </div>
            <div className="w-24 h-10 flex-shrink-0">
              <Spark data={reqHistory.length ? reqHistory : [{v:0}]} color="#10b981" id="kpi-req" />
            </div>
          </motion.div>

          {/* Uptime */}
          <motion.div className={`rounded-xl px-3 py-2.5 flex items-center gap-2 ${card}`}
            initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.15 }}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-[10px] text-gray-400 mb-0.5">
                <Box size={11} /> Containers
                <span className="ml-auto text-[9px] text-[#3b82f6]">Last 30 Days</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold">99.98%</span>
              </div>
              <div className="text-[9px] text-gray-400 mt-0.5">{runningCount}/{totalCount} running</div>
            </div>
            <div className="w-16 h-10 flex-shrink-0 flex items-end gap-px">
              {uptimeBars.slice(-8).map((d, i) => (
                <div key={i} className="flex-1 rounded-sm bg-[#3b82f6]"
                  style={{ height:`${d.v}%`, opacity: 0.5+(i/8)*0.5 }} />
              ))}
            </div>
          </motion.div>
        </div>

        {/* ── Main grid ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-[1fr_280px] gap-2.5">

          {/* LEFT ──────────────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-2.5">

            {/* CPU Chart */}
            <motion.div className={`rounded-xl p-4 ${card}`}
              initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.1 }}>
              <div className="flex items-start justify-between mb-1">
                <div>
                  <h2 className="font-semibold text-sm">CPU Usage per Container</h2>
                  <p className="text-[10px] text-gray-400">Données réelles — {environment}</p>
                </div>
                <div className="flex items-center gap-1">
                  {['1h','6h','12h','24h','7d','30d'].map(r => (
                    <button key={r} onClick={() => setTimeRange(r)}
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-all ${
                        timeRange === r
                          ? 'bg-gradient-to-r from-[#3b82f6] to-[#8b5cf6] text-white'
                          : 'text-gray-400 hover:text-gray-200'
                      }`}>{r}</button>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-3 mb-1 text-[9px] text-gray-500">
                <span className="flex items-center gap-1"><span className="inline-block w-3 border-t border-dashed border-[#f59e0b]"/>75%</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 border-t border-dashed border-[#94a3b8]"/>90%</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 border-t border-gray-500"/>100%</span>
              </div>
              {cpuHistory.length > 0 ? (
                <ResponsiveContainer width="100%" height={210}>
                  <AreaChart data={cpuHistory} margin={{ top:4, right:40, left:0, bottom:0 }}>
                    <defs>
                      {CONTAINER_COLORS.map((c,i) => (
                        <linearGradient key={i} id={`cpu-c${i}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={c} stopOpacity={0.25}/>
                          <stop offset="100%" stopColor={c} stopOpacity={0}/>
                        </linearGradient>
                      ))}
                    </defs>
                    <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill:ax, fontSize:9 }}/>
                    <YAxis orientation="right" axisLine={false} tickLine={false} tick={{ fill:ax, fontSize:9 }}
                      domain={[0,100]} tickFormatter={v=>`${v}%`}/>
                    <ReferenceLine y={75}  stroke="#f59e0b" strokeDasharray="4 3" strokeOpacity={0.5}/>
                    <ReferenceLine y={90}  stroke="#94a3b8" strokeDasharray="4 3" strokeOpacity={0.4}/>
                    <ReferenceLine y={100} stroke="#475569" strokeOpacity={0.3}/>
                    <Tooltip contentStyle={tt} formatter={(v:number,n)=>[`${Math.round(v)}%`,n]}/>
                    {metrics.containers.map((c,i) => (
                      <Area key={c.name} type="monotone" dataKey={getShortName(c.name)}
                        stroke={CONTAINER_COLORS[i%CONTAINER_COLORS.length]} strokeWidth={2}
                        fill={`url(#cpu-c${i%CONTAINER_COLORS.length})`} dot={false} animationDuration={700}/>
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[210px] flex items-center justify-center text-xs text-gray-400">
                  En attente de données...
                </div>
              )}
            </motion.div>

            {/* Memory + API Response Time côte à côte */}
            <div className="grid grid-cols-2 gap-2.5">

              {/* Memory */}
              <motion.div className={`rounded-xl p-3.5 ${card}`}
                initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.15 }}>
                <div className="flex items-center justify-between mb-1">
                  <h2 className="font-semibold text-xs">Memory Usage</h2>
                  <div className="flex gap-2 text-[9px] text-gray-500">
                    <span className="flex items-center gap-0.5"><span className="inline-block w-3 border-t border-dashed border-[#f59e0b]"/>75%</span>
                    <span className="flex items-center gap-0.5"><span className="inline-block w-3 border-t border-dashed border-[#94a3b8]"/>90%</span>
                    <span className="text-[#ef4444]">•Critical</span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={130}>
                  <AreaChart data={memHistory} margin={{ top:4, right:36, left:0, bottom:0 }}>
                    <defs>
                      <linearGradient id="mem-g" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.4}/>
                        <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis axisLine={false} tickLine={false} tick={{ fill:ax, fontSize:8 }}/>
                    <YAxis axisLine={false} tickLine={false} tick={{ fill:ax, fontSize:8 }} orientation="right"
                      tickFormatter={v=>`${v} GB`}/>
                    <Tooltip contentStyle={tt} formatter={(v:number)=>[`${v} GB`,'Memory']}/>
                    <Area type="monotone" dataKey="v" stroke="#8b5cf6" strokeWidth={2}
                      fill="url(#mem-g)" dot={false} animationDuration={700}/>
                  </AreaChart>
                </ResponsiveContainer>
              </motion.div>

              {/* API Response Time */}
              <motion.div className={`rounded-xl p-3.5 ${card}`}
                initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.2 }}>
                <div className="flex items-center justify-between mb-1">
                  <h2 className="font-semibold text-xs">API Response Time</h2>
                  <div className="flex gap-2 text-[9px] text-gray-500">
                    <span className="flex items-center gap-0.5"><span className="w-3 h-px bg-[#10b981] inline-block"/>avg</span>
                    <span className="flex items-center gap-0.5"><span className="w-3 h-px bg-[#f59e0b] inline-block"/>p95</span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={130}>
                  <AreaChart data={responsePts.length ? responsePts : [{time:'—',avg:0,p95:0}]}
                    margin={{ top:4, right:0, left:0, bottom:0 }}>
                    <defs>
                      <linearGradient id="resp-avg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.3}/>
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="resp-p95" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.2}/>
                        <stop offset="100%" stopColor="#f59e0b" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill:ax, fontSize:8 }} interval={4}/>
                    <YAxis axisLine={false} tickLine={false} tick={{ fill:ax, fontSize:8 }}
                      tickFormatter={v=>`${v}ms`}/>
                    <ReferenceLine y={220} stroke="#f59e0b" strokeDasharray="4 3" strokeOpacity={0.6}/>
                    <ReferenceLine y={380} stroke="#94a3b8" strokeDasharray="4 3" strokeOpacity={0.5}/>
                    <Tooltip contentStyle={tt} formatter={(v:number,n)=>[`${Math.round(v)} ms`,n==='avg'?'Avg':'P95']}/>
                    <Area type="monotone" dataKey="avg" stroke="#10b981" strokeWidth={2} fill="url(#resp-avg)" dot={false}/>
                    <Area type="monotone" dataKey="p95" stroke="#f59e0b" strokeWidth={1.5} fill="url(#resp-p95)" dot={false}/>
                  </AreaChart>
                </ResponsiveContainer>
              </motion.div>
            </div>

            {/* Requests/min chart (étendu) */}
            <motion.div className={`rounded-xl p-3.5 ${card}`}
              initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.25 }}>
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-semibold text-xs">Requests / min</h2>
                <div className="flex gap-3 text-[9px] text-gray-500">
                  <span className="flex items-center gap-1"><span className="w-4 h-px bg-[#10b981] inline-block"/>Nginx réel</span>
                  <span className="flex items-center gap-1"><span className="w-3 border-t border-dashed border-[#ef4444] inline-block"/>Seuil</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={110}>
                <AreaChart data={requestPts.length ? requestPts : [{time:'—',count:0}]}
                  margin={{ top:4, right:0, left:0, bottom:0 }}>
                  <defs>
                    <linearGradient id="req-g" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill:ax, fontSize:8 }} interval={3}/>
                  <YAxis axisLine={false} tickLine={false} tick={{ fill:ax, fontSize:8 }}
                    tickFormatter={v=>`${v}`}/>
                  <ReferenceLine y={1000} stroke="#ef4444" strokeDasharray="4 3" strokeOpacity={0.5}/>
                  <Tooltip contentStyle={tt} formatter={(v:number)=>[`${v} req/min`]}/>
                  <Area type="monotone" dataKey="count" stroke="#10b981" strokeWidth={2}
                    fill="url(#req-g)" dot={false}/>
                </AreaChart>
              </ResponsiveContainer>
            </motion.div>
          </div>

          {/* RIGHT sidebar ─────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-2.5">

            {/* Container Health */}
            <motion.div className={`rounded-xl p-3.5 ${card}`}
              initial={{ opacity:0, x:8 }} animate={{ opacity:1, x:0 }} transition={{ delay:0.1 }}>
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="font-semibold text-xs">Container Health</h3>
                <select className={`text-[10px] px-1.5 py-0.5 rounded border outline-none ${
                  isDark ? 'bg-[#1e293b] border-[#334155] text-gray-300' : 'bg-gray-100 border-gray-200 text-gray-600'
                }`}>
                  <option>All</option>
                </select>
              </div>
              <div className="space-y-2">
                {metrics.containers.map((c, i) => {
                  const short = getShortName(c.name);
                  const cpu   = parseCpu(c.cpu);
                  const color = CONTAINER_COLORS[i % CONTAINER_COLORS.length];
                  return (
                    <div key={c.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className={`flex h-5 w-5 items-center justify-center rounded ${
                          isDark ? 'bg-[#1e293b]' : 'bg-gray-100'
                        }`}>
                          <CIcon icon={getContainerIcon(c.name)} color={color} />
                        </span>
                        <div>
                          {cpu > 40 ? (
                            <>
                              <div className="flex items-center gap-1 text-[10px] font-medium text-[#f59e0b]">
                                <AlertTriangle size={9} /> Slow Response
                              </div>
                              <div className="text-[9px] text-gray-500 capitalize">{short}</div>
                            </>
                          ) : (
                            <div className="text-[10px] font-medium capitalize">{short}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-[10px]">
                        <span className={`font-semibold ${cpu > 40 ? 'text-[#f59e0b]' : ''}`}>
                          {cpu.toFixed(1)}%
                        </span>
                        <span className="text-gray-400 text-[9px]">{c.mem.split('/')[0].trim()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>

            {/* Recent Logs */}
            <motion.div className={`rounded-xl p-3.5 ${card}`}
              initial={{ opacity:0, x:8 }} animate={{ opacity:1, x:0 }} transition={{ delay:0.15 }}>
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="font-semibold text-xs">Recent Logs</h3>
                <div className="flex gap-1.5 text-[10px] text-gray-400">
                  <span>All</span><span>Open</span><span>▾</span>
                </div>
              </div>
              <div className="space-y-2.5">
                {logs.length === 0 ? (
                  <div className="text-[10px] text-gray-500 text-center py-2">Aucun log</div>
                ) : logs.slice(0, 5).map((log, i) => {
                  const t = new Date(log.timestamp);
                  const timeStr = isNaN(t.getTime()) ? '—' :
                    `${t.getHours()}:${String(t.getMinutes()).padStart(2,'0')}`;
                  const badgeColor =
                    log.level === 'error' ? '#ef4444' :
                    log.level === 'warn'  ? '#f59e0b' : '#3b82f6';
                  return (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-[10px] text-gray-500 w-8 flex-shrink-0 mt-0.5">{timeStr}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-medium leading-tight truncate capitalize">
                          {getShortName(log.container)}
                        </div>
                        <div className="text-[9px] text-gray-500 truncate">{log.message.slice(0,60)}</div>
                      </div>
                      <span className="flex-shrink-0 rounded px-1 py-0.5 text-[8px] font-bold text-white"
                        style={{ backgroundColor: badgeColor }}>
                        {log.level.toUpperCase()}
                      </span>
                    </div>
                  );
                })}
              </div>
            </motion.div>

            {/* Alerts */}
            <motion.div className={`rounded-xl p-3.5 flex-1 ${card}`}
              initial={{ opacity:0, x:8 }} animate={{ opacity:1, x:0 }} transition={{ delay:0.2 }}>
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="font-semibold text-xs">Alerts</h3>
                <div className="flex gap-1.5 text-[10px] text-gray-400">
                  <span>All</span><span>Open</span><span>Critical ▾</span>
                </div>
              </div>
              {alerts.length === 0 ? (
                <div className={`rounded-lg p-2 ${isDark ? 'bg-[#10b981]/10' : 'bg-green-50'}`}>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle size={10} className="text-[#10b981]" />
                    <span className="text-[10px] font-medium text-[#10b981]">No active alerts</span>
                  </div>
                  <div className="text-[9px] text-gray-500 mt-0.5">All systems normal</div>
                </div>
              ) : (
                <div className="space-y-2">
                  {alerts.map((a) => (
                    <div key={a.id} className={`rounded-lg p-2 ${
                      a.type === 'critical'
                        ? isDark ? 'bg-[#dc2626]/15' : 'bg-red-50'
                        : isDark ? 'bg-[#f59e0b]/15' : 'bg-amber-50'
                    }`}>
                      <div className="flex items-start justify-between gap-1">
                        <div className="flex items-start gap-1">
                          {a.type === 'critical'
                            ? <AlertCircle   size={10} className="text-[#dc2626] mt-0.5 flex-shrink-0"/>
                            : <AlertTriangle size={10} className="text-[#f59e0b] mt-0.5 flex-shrink-0"/>
                          }
                          <div>
                            <div className={`text-[10px] font-semibold ${
                              a.type === 'critical' ? 'text-[#dc2626]' : 'text-[#f59e0b]'
                            }`}>{a.title}</div>
                            <div className="text-[9px] text-gray-500">{a.message}</div>
                          </div>
                        </div>
                        <span className="text-[9px] text-gray-400 flex-shrink-0">
                          {new Date(a.timestamp).toLocaleTimeString('fr',{hour:'2-digit',minute:'2-digit'})}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>

          </div>
        </div>
      </>)}
    </div>
  );
}