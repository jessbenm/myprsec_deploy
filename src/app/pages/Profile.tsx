import { useState } from 'react';
import { motion } from 'motion/react';
import { useTheme } from '../theme-context';
import {
  User, Mail, Phone, MapPin, Calendar, Shield,
  Key, Bell, Globe, Edit2, Check, X,
} from 'lucide-react';

const activityLog = [
  { action: 'Deployed Frontend v1.2.4',  time: '2 hours ago',  color: '#10b981' },
  { action: 'Rolled back Nginx v1.1.0',  time: '1 day ago',    color: '#f59e0b' },
  { action: 'Restarted Backend service', time: '2 days ago',   color: '#3b82f6' },
  { action: 'Updated SSL certificate',   time: '3 days ago',   color: '#8b5cf6' },
  { action: 'Deployed Postgres v14.2',   time: '5 days ago',   color: '#10b981' },
];

export default function Profile() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState('Yasmine A.');
  const [tmpName, setTmpName] = useState(name);

  const card    = isDark ? 'bg-[#0f172a] border border-[#1e293b]' : 'bg-white border border-gray-200';
  const subCard = isDark ? 'bg-[#0a0f1e] border border-[#1e293b]' : 'bg-gray-50 border border-gray-100';
  const txt     = isDark ? 'text-white' : 'text-gray-900';
  const muted   = isDark ? 'text-[#64748b]' : 'text-gray-400';
  const input   = isDark ? 'bg-[#1e293b] border-[#334155] text-white' : 'bg-gray-100 border-gray-200 text-gray-900';

  return (
    <div className="flex flex-col gap-4 text-sm max-w-4xl mx-auto">

      {/* ── Header card ──────────────────────────────────────────── */}
      <motion.div className={`rounded-xl p-6 ${card}`}
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-5">
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-[#3b82f6] to-[#8b5cf6] flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-blue-500/25">
              YA
            </div>
            <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-[#10b981] border-2"
              style={{ borderColor: isDark ? '#0f172a' : 'white' }} />
          </div>

          {/* Name + role */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {editingName ? (
                <div className="flex items-center gap-2">
                  <input
                    className={`rounded-lg border px-2 py-1 text-sm font-bold ${input}`}
                    value={tmpName}
                    onChange={e => setTmpName(e.target.value)}
                    autoFocus
                  />
                  <button onClick={() => { setName(tmpName); setEditingName(false); }}
                    className="rounded-lg bg-[#10b981]/15 p-1 text-[#10b981]"><Check size={14}/></button>
                  <button onClick={() => setEditingName(false)}
                    className="rounded-lg bg-red-500/15 p-1 text-red-400"><X size={14}/></button>
                </div>
              ) : (
                <>
                  <h1 className={`text-lg font-bold ${txt}`}>{name}</h1>
                  <button onClick={() => { setTmpName(name); setEditingName(true); }}
                    className={`rounded-lg p-1 transition-colors ${isDark ? 'hover:bg-[#1e293b] text-[#475569]' : 'hover:bg-gray-100 text-gray-400'}`}>
                    <Edit2 size={13}/>
                  </button>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="rounded-full bg-[#3b82f6]/15 px-2.5 py-0.5 text-[10px] font-semibold text-[#3b82f6]">
                Admin
              </span>
              <span className="rounded-full bg-[#10b981]/15 px-2.5 py-0.5 text-[10px] font-semibold text-[#10b981]">
                ● Online
              </span>
              <span className={`text-[10px] ${muted}`}>Member since Jan 2024</span>
            </div>
          </div>

          {/* Stats */}
          {[
            { label: 'Deployments', value: '47' },
            { label: 'Rollbacks',   value: '3'  },
            { label: 'Uptime',      value: '99.8%' },
          ].map(s => (
            <div key={s.label} className={`rounded-xl px-4 py-3 text-center flex-shrink-0 ${subCard}`}>
              <div className={`text-lg font-bold ${txt}`}>{s.value}</div>
              <div className={`text-[10px] ${muted}`}>{s.label}</div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* ── 2-col grid ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">

        {/* Info */}
        <motion.div className={`rounded-xl p-5 ${card}`}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <User size={14} className="text-[#3b82f6]"/> Personal Info
          </h2>
          <div className="space-y-3">
            {[
              { icon: Mail,     label: 'Email',    value: 'yasmine@mypresc.dev'  },
              { icon: Phone,    label: 'Phone',    value: '+213 555 123 456'     },
              { icon: MapPin,   label: 'Location', value: 'Oran, Algeria'        },
              { icon: Globe,    label: 'Timezone', value: 'UTC+1 (CET)'         },
              { icon: Calendar, label: 'Joined',   value: 'January 15, 2024'    },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className={`flex items-center justify-between rounded-lg px-3 py-2.5 ${subCard}`}>
                <div className="flex items-center gap-2">
                  <Icon size={13} className="text-[#3b82f6] flex-shrink-0"/>
                  <span className={`text-xs ${muted}`}>{label}</span>
                </div>
                <span className={`text-xs font-medium ${txt}`}>{value}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Security */}
        <motion.div className={`rounded-xl p-5 ${card}`}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <Shield size={14} className="text-[#8b5cf6]"/> Security
          </h2>
          <div className="space-y-3">
            {/* 2FA */}
            <div className={`flex items-center justify-between rounded-lg px-3 py-2.5 ${subCard}`}>
              <div className="flex items-center gap-2">
                <Shield size={13} className="text-[#10b981]"/>
                <span className={`text-xs ${muted}`}>Two-Factor Auth</span>
              </div>
              <span className="rounded-full bg-[#10b981]/15 px-2 py-0.5 text-[10px] font-semibold text-[#10b981]">Enabled</span>
            </div>
            {/* API Key */}
            <div className={`flex items-center justify-between rounded-lg px-3 py-2.5 ${subCard}`}>
              <div className="flex items-center gap-2">
                <Key size={13} className="text-[#f59e0b]"/>
                <span className={`text-xs ${muted}`}>API Key</span>
              </div>
              <span className={`text-xs font-mono ${txt}`}>mp_••••••••4f2a</span>
            </div>
            {/* Last login */}
            <div className={`flex items-center justify-between rounded-lg px-3 py-2.5 ${subCard}`}>
              <div className="flex items-center gap-2">
                <Calendar size={13} className="text-[#3b82f6]"/>
                <span className={`text-xs ${muted}`}>Last Login</span>
              </div>
              <span className={`text-xs font-medium ${txt}`}>Today, 09:14</span>
            </div>
            {/* Notifications */}
            <div className={`flex items-center justify-between rounded-lg px-3 py-2.5 ${subCard}`}>
              <div className="flex items-center gap-2">
                <Bell size={13} className="text-[#8b5cf6]"/>
                <span className={`text-xs ${muted}`}>Notifications</span>
              </div>
              <span className="rounded-full bg-[#8b5cf6]/15 px-2 py-0.5 text-[10px] font-semibold text-[#8b5cf6]">All alerts</span>
            </div>
            {/* Change password button */}
            <button className="w-full rounded-lg py-2.5 text-xs font-semibold text-white transition-all hover:opacity-90 mt-2"
              style={{ background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)' }}>
              Change Password
            </button>
          </div>
        </motion.div>
      </div>

      {/* ── Recent Activity ───────────────────────────────────────── */}
      <motion.div className={`rounded-xl p-5 ${card}`}
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
        <h2 className="font-semibold mb-4 flex items-center gap-2">
          <Calendar size={14} className="text-[#10b981]"/> Recent Activity
        </h2>
        <div className="relative">
          <div className="absolute left-[7px] top-0 bottom-0 w-px"
            style={{ background: isDark ? 'linear-gradient(to bottom, #3b82f640, #8b5cf620)' : 'linear-gradient(to bottom, #3b82f630, transparent)' }} />
          <div className="space-y-3">
            {activityLog.map((a, i) => (
              <div key={i} className="flex items-center gap-3 pl-6 relative">
                <div className="absolute left-0 top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full flex items-center justify-center"
                  style={{ background: `${a.color}20`, border: `1.5px solid ${a.color}` }}>
                  <div className="h-1.5 w-1.5 rounded-full" style={{ background: a.color }} />
                </div>
                <div className={`flex-1 rounded-lg px-3 py-2 flex items-center justify-between ${subCard}`}>
                  <span className={`text-xs font-medium ${txt}`}>{a.action}</span>
                  <span className={`text-[10px] flex-shrink-0 ml-4 ${muted}`}>{a.time}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

    </div>
  );
}