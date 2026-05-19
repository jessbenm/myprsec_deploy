import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { useTheme } from '../theme-context';
import { useUser } from '../../user-context';
import { updateProfile, changePassword } from '../auth-api';
import { apiFetch } from '../lib/api';
import {
  User, Mail, Phone, MapPin, Calendar, Shield,
  Key, Bell, Globe, Edit2, Check, X, Loader,
  Lock, Eye, EyeOff, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

interface Stats { deployments: number; rollbacks: number; uptime: number; }
interface ActivityEntry { action: string; category: string; time: string; color: string; }

export default function Profile() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { user, setUser } = useUser();

  const [stats,    setStats]    = useState<Stats | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [apiToken, setApiToken] = useState('');
  const [loading,  setLoading]  = useState(true);

  // Editing state
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValues,   setEditValues]   = useState({ name: '', phone: '', location: '', timezone: '' });
  const [saving,       setSaving]       = useState(false);

  // Change password modal
  const [showPwModal,    setShowPwModal]    = useState(false);
  const [currentPw,      setCurrentPw]      = useState('');
  const [newPw,          setNewPw]          = useState('');
  const [confirmNewPw,   setConfirmNewPw]   = useState('');
  const [showCurrentPw,  setShowCurrentPw]  = useState(false);
  const [showNewPw,      setShowNewPw]      = useState(false);
  const [pwLoading,      setPwLoading]      = useState(false);
  const [pwError,        setPwError]        = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const [statsRes, actRes, settingsRes] = await Promise.all([
          apiFetch('/api/profile/stats'),
          apiFetch('/api/profile/activity'),
          apiFetch('/api/settings'),
        ]);
        if (statsRes.ok)    setStats(await statsRes.json());
        if (actRes.ok)      setActivity((await actRes.json()).entries || []);
        if (settingsRes.ok) {
          const s = await settingsRes.json();
          setApiToken(s.apiToken || '');
        }
      } catch (e) {
        console.error('Profile load error:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (user) {
      setEditValues({
        name:     user.name     || '',
        phone:    user.phone    || '',
        location: user.location || '',
        timezone: user.timezone || '',
      });
    }
  }, [user]);

  const startEdit = (field: string) => {
    setEditingField(field);
  };

  const cancelEdit = () => {
    if (user) {
      setEditValues({
        name:     user.name     || '',
        phone:    user.phone    || '',
        location: user.location || '',
        timezone: user.timezone || '',
      });
    }
    setEditingField(null);
  };

  const saveField = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const res = await updateProfile({
        name:     editValues.name     || user.name,
        phone:    editValues.phone,
        location: editValues.location,
        timezone: editValues.timezone,
      });
      if (res.success && res.data?.user) {
        setUser(res.data.user as any);
        toast.success('Profile updated');
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to update profile');
    } finally {
      setSaving(false);
      setEditingField(null);
    }
  };

  const handleChangePassword = async () => {
    setPwError('');
    if (!currentPw || !newPw || !confirmNewPw) { setPwError('All fields are required.'); return; }
    if (newPw.length < 8) { setPwError('New password must be at least 8 characters.'); return; }
    if (newPw !== confirmNewPw) { setPwError('Passwords do not match.'); return; }
    setPwLoading(true);
    try {
      await changePassword({ currentPassword: currentPw, newPassword: newPw });
      toast.success('Password changed successfully');
      setShowPwModal(false);
      setCurrentPw(''); setNewPw(''); setConfirmNewPw('');
    } catch (e: any) {
      setPwError(e.message || 'Failed to change password');
    } finally {
      setPwLoading(false);
    }
  };

  const card    = isDark ? 'bg-[#0f172a] border border-[#1e293b]' : 'bg-white border border-gray-200';
  const subCard = isDark ? 'bg-[#0a0f1e] border border-[#1e293b]' : 'bg-gray-50 border border-gray-100';
  const txt     = isDark ? 'text-white' : 'text-gray-900';
  const muted   = isDark ? 'text-[#64748b]' : 'text-gray-400';
  const inputCls = `rounded-lg border px-2 py-1 text-sm font-medium outline-none transition-all ${isDark ? 'bg-[#1e293b] border-[#334155] text-white focus:border-[#3b82f6]' : 'bg-gray-100 border-gray-200 text-gray-900 focus:border-blue-400'}`;

  const joinedDate = user ? new Date(user.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '...';
  const initials   = user ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'U';
  const maskedToken = apiToken ? `mp_${'•'.repeat(8)}${apiToken.slice(-4)}` : '...';

  if (loading && !user) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader size={32} className="animate-spin text-[#3b82f6]" />
      </div>
    );
  }

  const infoFields = [
    { icon: Mail,     label: 'Email',    field: 'email',    value: user?.email || '', editable: false },
    { icon: Phone,    label: 'Phone',    field: 'phone',    value: editValues.phone    || '—', editable: true },
    { icon: MapPin,   label: 'Location', field: 'location', value: editValues.location || '—', editable: true },
    { icon: Globe,    label: 'Timezone', field: 'timezone', value: editValues.timezone || '—', editable: true },
    { icon: Calendar, label: 'Joined',   field: 'joined',   value: joinedDate,             editable: false },
  ];

  return (
    <div className="flex flex-col gap-4 text-sm max-w-4xl mx-auto p-6">

      {/* ── Header card ──────────────────────────────────────────── */}
      <motion.div className={`rounded-xl p-6 ${card}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-5">
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-[#3b82f6] to-[#8b5cf6] flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-blue-500/25">
              {initials}
            </div>
            <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-[#10b981] border-2"
              style={{ borderColor: isDark ? '#0f172a' : 'white' }} />
          </div>

          {/* Name + role */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {editingField === 'name' ? (
                <div className="flex items-center gap-2">
                  <input className={inputCls} value={editValues.name}
                    onChange={e => setEditValues(v => ({ ...v, name: e.target.value }))} autoFocus />
                  <button onClick={saveField} disabled={saving}
                    className="rounded-lg bg-[#10b981]/15 p-1 text-[#10b981] disabled:opacity-50">
                    {saving ? <Loader size={14} className="animate-spin" /> : <Check size={14}/>}
                  </button>
                  <button onClick={cancelEdit} className="rounded-lg bg-red-500/15 p-1 text-red-400"><X size={14}/></button>
                </div>
              ) : (
                <>
                  <h1 className={`text-lg font-bold ${txt}`}>{user?.name || '...'}</h1>
                  <button onClick={() => startEdit('name')}
                    className={`rounded-lg p-1 transition-colors ${isDark ? 'hover:bg-[#1e293b] text-[#475569]' : 'hover:bg-gray-100 text-gray-400'}`}>
                    <Edit2 size={13}/>
                  </button>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="rounded-full bg-[#3b82f6]/15 px-2.5 py-0.5 text-[10px] font-semibold text-[#3b82f6]">Admin</span>
              <span className="rounded-full bg-[#10b981]/15 px-2.5 py-0.5 text-[10px] font-semibold text-[#10b981]">● Online</span>
              <span className={`text-[10px] ${muted}`}>Member since {joinedDate}</span>
            </div>
          </div>

          {/* Stats */}
          {[
            { label: 'Deployments', value: stats ? String(stats.deployments)        : '…' },
            { label: 'Rollbacks',   value: stats ? String(stats.rollbacks)          : '…' },
            { label: 'Uptime',      value: stats ? `${stats.uptime}%`               : '…' },
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

        {/* Personal Info */}
        <motion.div className={`rounded-xl p-5 ${card}`}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <User size={14} className="text-[#3b82f6]"/> Personal Info
          </h2>
          <div className="space-y-3">
            {infoFields.map(({ icon: Icon, label, field, value, editable }) => (
              <div key={label} className={`flex items-center justify-between rounded-lg px-3 py-2.5 ${subCard}`}>
                <div className="flex items-center gap-2">
                  <Icon size={13} className="text-[#3b82f6] flex-shrink-0"/>
                  <span className={`text-xs ${muted}`}>{label}</span>
                </div>
                {editable && editingField === field ? (
                  <div className="flex items-center gap-1">
                    <input
                      className={`${inputCls} text-xs w-36`}
                      value={editValues[field as keyof typeof editValues]}
                      onChange={e => setEditValues(v => ({ ...v, [field]: e.target.value }))}
                      autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') saveField(); if (e.key === 'Escape') cancelEdit(); }}
                    />
                    <button onClick={saveField} disabled={saving}
                      className="rounded bg-[#10b981]/15 p-1 text-[#10b981] disabled:opacity-50">
                      {saving ? <Loader size={12} className="animate-spin" /> : <Check size={12}/>}
                    </button>
                    <button onClick={cancelEdit} className="rounded bg-red-500/15 p-1 text-red-400"><X size={12}/></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${txt}`}>{value}</span>
                    {editable && (
                      <button onClick={() => startEdit(field)}
                        className={`rounded p-0.5 opacity-0 hover:opacity-100 transition-opacity ${isDark ? 'text-[#475569] hover:text-[#94a3b8]' : 'text-gray-300 hover:text-gray-500'}`}
                        style={{ opacity: 0.5 }}>
                        <Edit2 size={11}/>
                      </button>
                    )}
                  </div>
                )}
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
            {/* API Key */}
            <div className={`flex items-center justify-between rounded-lg px-3 py-2.5 ${subCard}`}>
              <div className="flex items-center gap-2">
                <Key size={13} className="text-[#f59e0b]"/>
                <span className={`text-xs ${muted}`}>API Key</span>
              </div>
              <span className={`text-xs font-mono ${txt}`}>{maskedToken}</span>
            </div>
            {/* Notifications */}
            <div className={`flex items-center justify-between rounded-lg px-3 py-2.5 ${subCard}`}>
              <div className="flex items-center gap-2">
                <Bell size={13} className="text-[#8b5cf6]"/>
                <span className={`text-xs ${muted}`}>Notifications</span>
              </div>
              <span className="rounded-full bg-[#8b5cf6]/15 px-2 py-0.5 text-[10px] font-semibold text-[#8b5cf6]">All alerts</span>
            </div>
            {/* Account created */}
            <div className={`flex items-center justify-between rounded-lg px-3 py-2.5 ${subCard}`}>
              <div className="flex items-center gap-2">
                <Calendar size={13} className="text-[#3b82f6]"/>
                <span className={`text-xs ${muted}`}>Account Created</span>
              </div>
              <span className={`text-xs font-medium ${txt}`}>{joinedDate}</span>
            </div>
            {/* Email verified */}
            <div className={`flex items-center justify-between rounded-lg px-3 py-2.5 ${subCard}`}>
              <div className="flex items-center gap-2">
                <Mail size={13} className="text-[#10b981]"/>
                <span className={`text-xs ${muted}`}>Email</span>
              </div>
              <span className="rounded-full bg-[#10b981]/15 px-2 py-0.5 text-[10px] font-semibold text-[#10b981]">Verified</span>
            </div>
            {/* Change password */}
            <button
              onClick={() => { setPwError(''); setShowPwModal(true); }}
              className="w-full rounded-lg py-2.5 text-xs font-semibold text-white transition-all hover:opacity-90 mt-2"
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
          <RefreshCw size={14} className="text-[#10b981]"/> Recent Activity
        </h2>
        {activity.length === 0 ? (
          <div className={`text-xs text-center py-6 ${muted}`}>No activity yet</div>
        ) : (
          <div className="relative">
            <div className="absolute left-[7px] top-0 bottom-0 w-px"
              style={{ background: isDark ? 'linear-gradient(to bottom, #3b82f640, #8b5cf620)' : 'linear-gradient(to bottom, #3b82f630, transparent)' }} />
            <div className="space-y-3">
              {activity.map((a, i) => (
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
        )}
      </motion.div>

      {/* ── Change Password Modal ─────────────────────────────────── */}
      {showPwModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setShowPwModal(false); }}>
          <motion.div
            className={`w-full max-w-sm rounded-2xl p-6 ${isDark ? 'bg-[#0f172a] border border-[#1e293b]' : 'bg-white border border-gray-200'}`}
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
            <div className="flex items-center justify-between mb-5">
              <h3 className={`font-bold flex items-center gap-2 ${txt}`}><Lock size={15}/> Change Password</h3>
              <button onClick={() => setShowPwModal(false)} className={`rounded-lg p-1 ${muted}`}><X size={16}/></button>
            </div>
            <div className="space-y-3">
              {/* Current password */}
              <div>
                <label className={`block text-xs font-medium mb-1 ${muted}`}>Current Password</label>
                <div className="relative">
                  <input
                    type={showCurrentPw ? 'text' : 'password'}
                    value={currentPw} onChange={e => setCurrentPw(e.target.value)}
                    className={`w-full rounded-xl px-3 py-2.5 pr-10 text-sm outline-none ${isDark ? 'bg-[#0a0f1e] border border-[#1e293b] text-white' : 'bg-gray-100 border border-gray-200 text-gray-900'}`}
                    placeholder="Current password"
                  />
                  <button type="button" onClick={() => setShowCurrentPw(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#475569]">
                    {showCurrentPw ? <EyeOff size={14}/> : <Eye size={14}/>}
                  </button>
                </div>
              </div>
              {/* New password */}
              <div>
                <label className={`block text-xs font-medium mb-1 ${muted}`}>New Password</label>
                <div className="relative">
                  <input
                    type={showNewPw ? 'text' : 'password'}
                    value={newPw} onChange={e => setNewPw(e.target.value)}
                    className={`w-full rounded-xl px-3 py-2.5 pr-10 text-sm outline-none ${isDark ? 'bg-[#0a0f1e] border border-[#1e293b] text-white' : 'bg-gray-100 border border-gray-200 text-gray-900'}`}
                    placeholder="Minimum 8 characters"
                  />
                  <button type="button" onClick={() => setShowNewPw(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#475569]">
                    {showNewPw ? <EyeOff size={14}/> : <Eye size={14}/>}
                  </button>
                </div>
              </div>
              {/* Confirm new password */}
              <div>
                <label className={`block text-xs font-medium mb-1 ${muted}`}>Confirm New Password</label>
                <input
                  type={showNewPw ? 'text' : 'password'}
                  value={confirmNewPw} onChange={e => setConfirmNewPw(e.target.value)}
                  className={`w-full rounded-xl px-3 py-2.5 text-sm outline-none ${isDark ? 'bg-[#0a0f1e] border border-[#1e293b] text-white' : 'bg-gray-100 border border-gray-200 text-gray-900'}`}
                  placeholder="Repeat new password"
                />
              </div>
              {pwError && (
                <div className="rounded-lg px-3 py-2 text-xs text-red-400" style={{ background: '#ef444415', border: '1px solid #ef444430' }}>
                  {pwError}
                </div>
              )}
              <button
                onClick={handleChangePassword} disabled={pwLoading}
                className="w-full rounded-xl py-2.5 text-xs font-bold text-white disabled:opacity-60 flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)' }}>
                {pwLoading ? <><Loader size={13} className="animate-spin"/> Saving...</> : 'Update Password'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
