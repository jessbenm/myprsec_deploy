import { useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { motion } from 'motion/react';
import { useTheme } from '../theme-context';
import {
  Globe2, Activity, Rocket, Database, Zap, Lock,
  ChevronDown, GitBranch, User, ArrowRight, AlertTriangle, ExternalLink,
} from 'lucide-react';

const releaseHistory = [
  { time: '20 hr', v: 61 }, { time: '160s', v: 80 }, { time: '10d', v: 95 },
  { time: '160c', v: 110 }, { time: '165s', v: 130 }, { time: '155s', v: 115 },
  { time: '15s',  v: 200 }, { time: '2.5h', v: 260 }, { time: '2.5h', v: 315 },
];

const recentDeployments = [
  { time: '2 h',    service: 'Frontend', status: 'Successful', commit: '#71928', user: 'develop', duration: '22 min' },
  { time: '6 h',    service: 'Nginx',    status: 'Successful', commit: '#71928', user: 'develop', duration: '7 min'  },
  { time: '6 h',    service: 'Backend',  status: 'Successful', commit: '#71928', user: 'develop', duration: '6 min'  },
  { time: '6 h',    service: 'Postgres', status: 'Successful', commit: '#71928', user: 'develop', duration: '5 min'  },
  { time: '3 days', service: 'Certbot',  status: 'Successful', commit: '#71928', user: 'develop', duration: '32 min' },
];

const activityFeed = [
  { service: 'Frontend', icon: 'activity', color: '#8b5cf6', time: '3 hours ago', title: 'Frontend container', sub: 'Navigate /ncors/denchok' },
  { service: 'Redis',    icon: 'zap',      color: '#ef4444', time: '2h ago',       title: 'Container restarted', sub: 'by contens' },
  { service: 'Certbot',  icon: 'lock',     color: '#3b82f6', time: '3 days ago',   title: 'Certbot issued a new SSL certificate', sub: 'for domain.com' },
  { service: 'Backend',  icon: 'rocket',   color: '#10b981', time: '4 days ago',   title: 'Backend container', sub: 'updated @username' },
  { service: 'Postgres', icon: 'db',       color: '#f59e0b', time: '5 days ago',   title: 'Database backup', sub: 'completed' },
];

const dockerActions = [
  { service: 'Frontend', icon: 'activity', color: '#8b5cf6', action: 'deployed',                                          detail: '⚡ from #develop branch', time: '2h ago' },
  { service: 'Redis',    icon: 'zap',      color: '#ef4444', action: 'Redis container restarCD',                           detail: '·· 0min',                 time: '2h ago' },
  { service: 'Certbot',  icon: 'lock',     color: '#3b82f6', action: 'issued a new SSL certificate for domain.com',        detail: '1 min',                   time: '2 days ago' },
  { service: 'Backend',  icon: 'rocket',   color: '#10b981', action: 'Backend container updated @username',                detail: '32 min',                  time: '4 days ago' },
];

const incidents = [
  { level: 'critical', title: 'Backend CPU Critical', sub: 'Backend container CPU s 80% detected', time: '4 h ago' },
];

function SvcIcon({ icon, color, size = 14 }: { icon: string; color: string; size?: number }) {
  if (icon === 'activity') return <Activity size={size} className="flex-shrink-0" style={{ color }} />;
  if (icon === 'rocket')   return <Rocket   size={size} className="flex-shrink-0" style={{ color }} />;
  if (icon === 'db')       return <Database size={size} className="flex-shrink-0" style={{ color }} />;
  if (icon === 'zap')      return <Zap      size={size} className="flex-shrink-0" style={{ color }} />;
  if (icon === 'lock')     return <Lock     size={size} className="flex-shrink-0" style={{ color }} />;
  return <Globe2 size={size} className="flex-shrink-0" style={{ color }} />;
}

function PipelineNode({ label, icon, color, active = false, dark = true }: { label: string; icon: string; color: string; active?: boolean; dark?: boolean }) {
  return (
    <div className="relative flex-shrink-0" style={{
      borderRadius: 8, border: `1.5px solid ${color}`,
      boxShadow: `0 0 12px ${color}50, inset 0 0 20px ${color}08`,
      background: active ? `${color}15` : (dark ? '#0d1424' : '#f1f5f9'),
      padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 7,
    }}>
      <span className="absolute" style={{ top: -3, left: -3, width: 6, height: 6, borderRadius: '50%', backgroundColor: color, boxShadow: `0 0 6px ${color}` }} />
      <span className="absolute" style={{ top: -3, right: -3, width: 6, height: 6, borderRadius: '50%', backgroundColor: color, boxShadow: `0 0 6px ${color}` }} />
      <span className="absolute" style={{ bottom: -3, left: -3, width: 6, height: 6, borderRadius: '50%', backgroundColor: color, boxShadow: `0 0 6px ${color}` }} />
      <span className="absolute" style={{ bottom: -3, right: -3, width: 6, height: 6, borderRadius: '50%', backgroundColor: color, boxShadow: `0 0 6px ${color}` }} />
      <SvcIcon icon={icon} color={color} size={14} />
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

export default function Dashboard() {
  const [releaseRange, setReleaseRange] = useState('14 days');
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const card = isDark ? 'bg-[#0f172a] border border-[#1e293b]' : 'bg-white border border-gray-200';
  const subCard = isDark ? 'bg-[#0a0f1e] border border-[#1e293b]' : 'bg-gray-50 border border-gray-100';
  const tt = {
    backgroundColor: isDark ? '#0f172a' : '#fff',
    border: `1px solid ${isDark ? '#1e293b' : '#e2e8f0'}`,
    borderRadius: 6, padding: '4px 8px', fontSize: 10,
    color: isDark ? '#e2e8f0' : '#0f172a',
  } as const;
  const ax = isDark ? '#334155' : '#94a3b8';

  return (
    <div className="flex flex-col gap-3 text-sm">
      {/* ── Main grid ── */}
      <div className="grid grid-cols-[1fr_220px_260px] gap-3 items-stretch">

        {/* LEFT */}
        <div className="flex flex-col gap-3 h-full">
          <motion.div className={`rounded-xl p-4 ${card}`}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <h2 className="font-semibold text-sm">Container Architecture</h2>
                <button className="flex items-center gap-1 rounded-full bg-[#10b981]/15 px-2 py-0.5 text-[10px] text-[#10b981]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />Overview
                </button>
                <button className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-200">
                  Cluster View <ChevronDown size={10} />
                </button>
              </div>
            </div>

            <div className={`rounded-lg p-3 ${subCard}`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-gray-300">Deployment Pipeline Status</h3>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="flex items-center gap-1 text-[#10b981]"><span className="h-1.5 w-1.5 rounded-full bg-[#10b981]"/>Overlew</span>
                  <span className="flex items-center gap-1 text-[#8b5cf6]"><span className="h-1.5 w-1.5 rounded-full bg-[#8b5cf6]"/>Staging<ChevronDown size={9}/></span>
                </div>
              </div>
              <div className="flex items-center gap-2 mb-5 flex-wrap">
                <div className="rounded border border-[#334155] bg-[#1e293b] px-2.5 py-1 text-[10px] text-gray-300">22 Mar</div>
                <HLine color="#4ade80" width={20} />
                <span className="text-[10px] text-gray-400">Code Review</span>
                <HLine color="#3b82f6" width={14} />
                <span className="text-[10px] text-[#3b82f6] font-semibold">Build</span>
                <HLine color="#8b5cf6" width={20} />
                <span className="text-[10px] text-gray-400">Test</span>
                <HLine color="#f59e0b" width={20} />
                <span className="text-[10px] text-gray-400">Release</span>
                <HLine color="#f59e0b" width={14} />
                <div className="flex items-center gap-1 rounded border border-[#8b5cf6]/60 px-2 py-0.5 text-[10px] text-[#8b5cf6]" style={{ boxShadow: '0 0 8px #8b5cf640', background: '#8b5cf615' }}>
                  <GitBranch size={9}/> Staging <ChevronDown size={9}/>
                </div>
              </div>
              <div className="relative rounded-lg p-4" style={{
                background: isDark ? 'radial-gradient(ellipse at 30% 50%, #1a1060 0%, #0a0f1e 50%, #0d1020 100%)' : 'radial-gradient(ellipse at 30% 50%, #ede9fe 0%, #f1f5f9 60%, #e8f0fe 100%)',
                border: isDark ? '1px solid #1e2a4a' : '1px solid #c7d2fe', minHeight: 140,
              }}>
                <div className="absolute top-2 left-16 w-20 h-20 rounded-full pointer-events-none" style={{ background: '#3b82f620', filter: 'blur(20px)' }} />
                <div className="absolute bottom-2 right-16 w-16 h-16 rounded-full pointer-events-none" style={{ background: '#8b5cf620', filter: 'blur(16px)' }} />
                <div className="flex items-center gap-0 mb-6 relative z-10">
                  <PipelineNode label="Nginx"    icon="globe"    color="#3b82f6" dark={isDark} />
                  <HLine color="#3b82f6" width={28} />
                  <PipelineNode label="Frontend" icon="activity" color="#8b5cf6" active dark={isDark} />
                  <HLine color="#f59e0b" width={28} />
                  <PipelineNode label="Backend"  icon="rocket"   color="#10b981" dark={isDark} />
                </div>
                <div className="absolute z-10" style={{ left: 53, top: 36, width: 1.5, height: 44, background: 'linear-gradient(to bottom, #3b82f6, #6366f1)', boxShadow: '0 0 5px #3b82f680' }} />
                <div className="absolute z-10" style={{ left: 172, top: 36, width: 1.5, height: 44, background: 'linear-gradient(to bottom, #8b5cf6, #10b981)', boxShadow: '0 0 5px #8b5cf680' }} />
                <div className="absolute z-10" style={{ left: 46, top: 76, width: 7, height: 7, borderRadius: '50%', background: '#6366f1', boxShadow: '0 0 6px #6366f1' }} />
                <div className="absolute z-10" style={{ left: 165, top: 76, width: 7, height: 7, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
                <div className="flex items-center gap-0 relative z-10">
                  <PipelineNode label="Certbot"  icon="lock"     color="#6366f1" dark={isDark} />
                  <HLine color="#6366f1" width={28} />
                  <PipelineNode label="Backend"  icon="rocket"   color="#10b981" active dark={isDark} />
                  <HLine color="#ef4444" width={28} />
                  <PipelineNode label="Redis"    icon="zap"      color="#ef4444" dark={isDark} />
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div className={`rounded-xl p-4 flex-1 ${card}`}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-sm">Recent Deployments</h2>
              <button className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-200">View All <ChevronDown size={10}/></button>
            </div>
            <table className="w-full">
              <thead>
                <tr className="text-[10px] text-gray-500 border-b border-[#1e293b]">
                  <th className="text-left pb-2 font-medium">Time</th>
                  <th className="text-left pb-2 font-medium">Service</th>
                  <th className="text-left pb-2 font-medium">Status</th>
                  <th className="text-left pb-2 font-medium"><span className="flex items-center gap-1">Commit <ArrowRight size={8}/></span></th>
                  <th className="text-left pb-2 font-medium"><span className="flex items-center gap-1">User <ArrowRight size={8}/></span></th>
                  <th className="text-left pb-2 font-medium">Duration</th>
                </tr>
              </thead>
              <tbody>
                {recentDeployments.map((d, i) => (
                  <tr key={i} className={`text-[11px] border-b border-[#0f172a] transition-colors hover:bg-[#1e293b]/40 ${i === 0 ? (isDark ? 'bg-[#1e293b]/60' : 'bg-blue-50') : ''}`}>
                    <td className="py-2 text-gray-400">{d.time}</td>
                    <td className="py-2 font-semibold">{d.service}</td>
                    <td className="py-2"><span className="flex items-center gap-1 text-[#10b981]"><span className="h-1.5 w-1.5 rounded-full bg-[#10b981]"/>{d.status}</span></td>
                    <td className="py-2 text-gray-400"><span className="flex items-center gap-1"><GitBranch size={9}/> #{d.commit}</span></td>
                    <td className="py-2 text-gray-400"><span className="flex items-center gap-1"><User size={9}/> {d.user}</span></td>
                    <td className="py-2 text-gray-400">{d.duration}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        </div>

        {/* MIDDLE */}
        <motion.div className={`rounded-xl p-4 flex flex-col ${card}`}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
          <h2 className="font-semibold text-sm mb-4">Activity Feed</h2>
          <div className="relative flex flex-col flex-1">
            <div className="absolute left-[13px] top-0 bottom-0 w-px bg-gradient-to-b from-[#3b82f6]/40 via-[#8b5cf6]/30 to-transparent" />
            {activityFeed.map((item, i) => (
              <motion.div key={i} className="relative flex gap-3 mb-4 last:mb-0"
                initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.07 }}>
                <div className="relative flex-shrink-0 z-10">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full"
                    style={{ backgroundColor: `${item.color}18`, boxShadow: `0 0 8px ${item.color}30`, border: `1.5px solid ${item.color}50` }}>
                    <SvcIcon icon={item.icon} color={item.color} size={12} />
                  </div>
                </div>
                <div className={`flex-1 min-w-0 rounded-lg p-2.5 ${subCard}`}>
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span className="text-[11px] font-semibold">{item.service}</span>
                    <span className="text-[9px] text-gray-500 flex-shrink-0">{item.time}</span>
                  </div>
                  <div className="text-[10px] text-gray-300 leading-tight">{item.title}</div>
                  <div className="text-[9px] text-gray-500 mt-0.5">{item.sub}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* RIGHT */}
        <div className="flex flex-col gap-3 h-full">
          <motion.div className={`rounded-xl p-4 ${card}`}
            initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.08 }}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold text-sm">Release History <span className="ml-1 text-[10px] text-gray-500 font-normal">(Last 14 Days)</span></h2>
              <button className="flex items-center gap-1 text-[10px] text-gray-400"><span className="text-[#3b82f6]">↑↓</span> 14 days <ChevronDown size={9}/></button>
            </div>
            <div className="flex gap-2 mb-2 text-[10px]">
              {['14 days','30 days','90 days'].map(r => (
                <button key={r} onClick={() => setReleaseRange(r)}
                  className={`transition-colors ${releaseRange === r ? 'text-white font-semibold' : 'text-gray-500 hover:text-gray-300'}`}>{r}</button>
              ))}
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
                <YAxis axisLine={false} tickLine={false} tick={{ fill: ax, fontSize: 8 }}/>
                <Tooltip contentStyle={tt} formatter={(v:number)=>[`${v}s`,'Releases']}/>
                <Area type="monotone" dataKey="v" stroke="#3b82f6" strokeWidth={2} fill="url(#rh-grad)" dot={false} animationDuration={700}/>
              </AreaChart>
            </ResponsiveContainer>
          </motion.div>

          <motion.div className={`rounded-xl p-4 flex-1 ${card}`}
            initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.12 }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-sm">Docker Actions</h2>
              <button className="flex items-center gap-1 text-[10px] text-gray-400">View All <ExternalLink size={9}/></button>
            </div>
            <div className="space-y-2.5">
              {dockerActions.map((a, i) => (
                <div key={i} className={`rounded-lg p-2.5 ${subCard}`}>
                  <div className="flex items-start gap-2">
                    <div className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full ${isDark ? 'bg-[#1e293b]' : 'bg-gray-200'}`}>
                      <SvcIcon icon={a.icon} color={a.color} size={11}/>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold">{a.service}</span>
                        <span className="text-[9px] text-gray-500">{a.time}</span>
                      </div>
                      <div className="text-[9px] text-gray-400 leading-tight truncate">{a.action}</div>
                      <div className="text-[9px] text-gray-600">{a.detail}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div className={`rounded-xl p-4 ${card}`}
            initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.16 }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-sm">Incidents in the Last 24 Hours</h2>
              <button className="flex items-center gap-1 text-[10px] text-[#3b82f6] hover:underline">View History <ArrowRight size={9}/></button>
            </div>
            <div className="space-y-2">
              {incidents.map((inc, i) => (
                <div key={i} className={`rounded-lg p-2.5 ${isDark ? 'bg-[#dc2626]/10 border border-[#dc2626]/20' : 'bg-red-50 border border-red-200'}`}>
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={12} className="text-[#f59e0b] flex-shrink-0 mt-0.5"/>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold text-[#ef4444]">{inc.title}</span>
                        <span className="text-[9px] text-gray-500">{inc.time}</span>
                      </div>
                      <div className="text-[9px] text-gray-400">{inc.sub}</div>
                    </div>
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