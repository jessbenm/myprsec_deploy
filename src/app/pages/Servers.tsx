import { useState, useEffect } from 'react';
import { Settings, X, Server, Loader2, CheckCircle, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useTheme } from '../theme-context';
import Terminal from '../components/Terminal';
import CostEstimator from '../components/CostEstimator';
import ManageModal from '../components/ManageModal.tsx';

const BACKEND_URL = 'http://localhost:3001';

interface VPS {
  id: string;
  name: string;
  host: string;
  username?: string;
  containers?: { running: number; total: number };
  cpu?: number;
  ram?: { used: number; total: number };
  status?: 'healthy' | 'warning' | 'error' | 'loading';
}

export default function Servers() {
  const [vpsList,           setVpsList]           = useState<VPS[]>([]);
  const [selectedServer,    setSelectedServer]    = useState<any | null>(null);
  const [showTerminal,      setShowTerminal]      = useState(false);
  const [showCostEstimator, setShowCostEstimator] = useState(false);
  const [showAddModal,      setShowAddModal]      = useState(false);
  const [showManage,        setShowManage]        = useState(false);
  const [manageServer,      setManageServer]      = useState<VPS | null>(null);
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // ── Form state ──────────────────────────────────────────────────────────────
  const [form,         setForm]         = useState({ id: '', name: '', host: '', username: '', password: '', port: '22' });
  const [showPassword, setShowPassword] = useState(false);
  const [formLoading,  setFormLoading]  = useState(false);
  const [formError,    setFormError]    = useState<string | null>(null);
  const [formSuccess,  setFormSuccess]  = useState(false);
  const [testLoading,  setTestLoading]  = useState(false);
  const [testResult,   setTestResult]   = useState<{ ok: boolean; message: string } | null>(null);

  // ── Charger les VPS ─────────────────────────────────────────────────────────
  const loadVps = async () => {
    try {
      const res  = await fetch(`${BACKEND_URL}/api/vps`);
      const data = await res.json();
      const list: VPS[] = Array.isArray(data) ? data : Object.values(data as Record<string, any>);
      setVpsList(list.map(v => ({ ...v, status: 'loading' })));
      list.forEach(v => loadMetrics(v.id));
    } catch {
      setVpsList([]);
    }
  };

  // ── Charger les métriques d'un VPS ──────────────────────────────────────────
  const loadMetrics = async (id: string) => {
    try {
      const res  = await fetch(`${BACKEND_URL}/api/metrics/${id}`);
      if (!res.ok) { updateVpsStatus(id, 'error'); return; }
      const data = await res.json();

      const totalCpu = data.containers?.reduce((s: number, c: any) =>
        s + parseFloat(c.cpu?.replace('%', '') || 0), 0) / Math.max(1, data.containers?.length || 1);

      const totalMemMB = data.containers?.reduce((s: number, c: any) => {
        const m = c.mem?.match(/([\d.]+)\s*(MiB|GiB|MB|GB)/i);
        if (!m) return s;
        return s + (parseFloat(m[1]) * (/gib|gb/i.test(m[2]) ? 1024 : 1));
      }, 0) || 0;

      const running = data.ps?.filter((p: any) => p.status?.includes('Up')).length || 0;
      const total   = data.ps?.length || 0;

      setVpsList(prev => prev.map(v => v.id === id ? {
        ...v,
        cpu:        Math.round(totalCpu),
        ram:        { used: Math.round((totalMemMB / 1024) * 100) / 100, total: 8 },
        containers: { running, total },
        status:     totalCpu > 80 ? 'warning' : 'healthy',
      } : v));
    } catch {
      updateVpsStatus(id, 'error');
    }
  };

  const updateVpsStatus = (id: string, status: VPS['status']) => {
    setVpsList(prev => prev.map(v => v.id === id ? { ...v, status } : v));
  };

  useEffect(() => { loadVps(); }, []);

  // ── Ajouter un VPS ──────────────────────────────────────────────────────────
  const handleAddVps = async () => {
    if (!form.id || !form.host || !form.username || !form.password) {
      setFormError('Tous les champs sont requis'); return;
    }
    setFormLoading(true); setFormError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/vps`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...form, port: parseInt(form.port) || 22 }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setFormSuccess(true);
      setTimeout(() => {
        setShowAddModal(false);
        setFormSuccess(false);
        setForm({ id: '', name: '', host: '', username: '', password: '', port: '22' });
        loadVps();
      }, 1200);
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setFormLoading(false);
    }
  };

  // ── Tester la connexion SSH ─────────────────────────────────────────────────
  const handleTest = async () => {
    if (!form.id || !form.host || !form.username || !form.password) {
      setFormError('Remplissez tous les champs avant de tester'); return;
    }
    setTestLoading(true); setTestResult(null); setFormError(null);
    try {
      await fetch(`${BACKEND_URL}/api/vps`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...form, port: parseInt(form.port) || 22 }),
      });
      const res  = await fetch(`${BACKEND_URL}/api/vps/${form.id}/test`, { method: 'POST' });
      const data = await res.json();
      setTestResult({ ok: data.ok, message: data.ok ? 'Connexion SSH réussie ✓' : data.error });
    } catch (err: any) {
      setTestResult({ ok: false, message: err.message });
    } finally {
      setTestLoading(false);
    }
  };

  const getRamPct   = (v: VPS) => Math.min(100, ((v.ram?.used || 0) / (v.ram?.total || 8)) * 100);
  const getRamColor = (pct: number) => pct > 80 ? '#f59e0b' : '#22c55e';

  // ── CSS ─────────────────────────────────────────────────────────────────────
  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&display=swap');

    .srv-root {
      font-family: 'Rajdhani', sans-serif;
      min-height: 100vh;
      color: ${isDark ? '#e2e8f0' : '#0f172a'};
      background: ${isDark ? '#050d1a' : 'transparent'};
      position: relative; overflow: hidden; padding: 28px;
    }
    .srv-root::before {
      content: ''; position: absolute; inset: 0;
      background: ${isDark
        ? `radial-gradient(ellipse 80% 50% at 20% 20%, rgba(6,182,212,0.07) 0%, transparent 60%),
           radial-gradient(ellipse 60% 60% at 80% 80%, rgba(139,92,246,0.07) 0%, transparent 60%),
           repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(6,182,212,0.015) 2px, rgba(6,182,212,0.015) 4px),
           repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(6,182,212,0.015) 2px, rgba(6,182,212,0.015) 4px)`
        : 'none'};
      pointer-events: none; z-index: 0;
    }
    .srv-circuit { position: absolute; inset: 0; pointer-events: none; z-index: 0; overflow: hidden; }
    .srv-circuit svg { width: 100%; height: 100%; }

    .srv-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 28px; position: relative; z-index: 1; }
    .srv-title {
      font-size: 26px; font-weight: 700; letter-spacing: 0.03em;
      background: ${isDark ? 'linear-gradient(90deg, #e2e8f0, #94a3b8)' : 'linear-gradient(90deg, #0f172a, #1e40af)'};
      -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
    }
    .srv-cost-btn {
      display: flex; align-items: center; gap: 8px;
      background: ${isDark ? 'rgba(37,99,235,0.15)' : 'rgba(37,99,235,0.1)'};
      border: 1px solid ${isDark ? 'rgba(37,99,235,0.4)' : 'rgba(37,99,235,0.5)'};
      border-radius: 10px; padding: 8px 18px; font-size: 14px; font-weight: 600;
      color: ${isDark ? '#93c5fd' : '#1d4ed8'}; cursor: pointer; transition: all 0.2s;
      font-family: 'Rajdhani', sans-serif; letter-spacing: 0.04em;
    }
    .srv-cost-btn:hover { background: rgba(37,99,235,0.25); border-color: rgba(37,99,235,0.8); box-shadow: 0 0 16px rgba(37,99,235,0.25); }

    .srv-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; position: relative; z-index: 1; }

    .srv-card {
      background: ${isDark ? 'linear-gradient(145deg, rgba(15,23,42,0.95), rgba(10,18,35,0.98))' : 'linear-gradient(145deg, rgba(255,255,255,0.85), rgba(224,236,255,0.9))'};
      border: 1px solid ${isDark ? 'rgba(6,182,212,0.2)' : 'rgba(6,182,212,0.35)'};
      border-radius: 16px; padding: 22px; position: relative; overflow: hidden;
      transition: all 0.3s; backdrop-filter: blur(8px);
      box-shadow: ${isDark ? 'none' : '0 4px 24px rgba(6,182,212,0.08)'};
    }
    .srv-card::before {
      content: ''; position: absolute; inset: 0; border-radius: 16px; padding: 1px;
      background: ${isDark
        ? 'linear-gradient(135deg, rgba(6,182,212,0.4), rgba(139,92,246,0.2), transparent 60%)'
        : 'linear-gradient(135deg, rgba(6,182,212,0.5), rgba(139,92,246,0.3), transparent 60%)'};
      -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
      -webkit-mask-composite: xor; mask-composite: exclude; pointer-events: none;
    }
    .srv-card:hover {
      border-color: rgba(6,182,212,0.6);
      box-shadow: ${isDark ? '0 0 30px rgba(6,182,212,0.15), 0 8px 32px rgba(0,0,0,0.4)' : '0 0 30px rgba(6,182,212,0.2)'};
      transform: translateY(-2px);
    }

    .srv-card-icon {
      width: 46px; height: 46px; border-radius: 12px;
      background: linear-gradient(135deg, rgba(6,182,212,0.2), rgba(37,99,235,0.2));
      border: 1px solid rgba(6,182,212,0.4);
      display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: #06b6d4;
    }
    .srv-card-head { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
    .srv-card-name { font-size: 16px; font-weight: 700; letter-spacing: 0.02em; color: ${isDark ? '#e2e8f0' : '#0f172a'}; }
    .srv-card-ip { font-size: 12px; color: ${isDark ? '#475569' : '#64748b'}; font-family: 'Share Tech Mono', monospace; margin-top: 2px; }

    .srv-status-badge { position: absolute; top: 16px; right: 16px; width: 8px; height: 8px; border-radius: 50%; }
    .srv-status-badge.healthy { background: #22c55e; box-shadow: 0 0 8px #22c55e; animation: pulse-green 2s infinite; }
    .srv-status-badge.warning { background: #f59e0b; box-shadow: 0 0 8px #f59e0b; }
    .srv-status-badge.error   { background: #ef4444; box-shadow: 0 0 8px #ef4444; }
    .srv-status-badge.loading { background: #94a3b8; animation: pulse-gray 1.5s infinite; }
    @keyframes pulse-green { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
    @keyframes pulse-gray  { 0%,100% { opacity:0.4; } 50% { opacity:1; } }

    .srv-metric { margin-bottom: 12px; }
    .srv-metric-labels { display: flex; justify-content: space-between; font-size: 13px; color: ${isDark ? '#64748b' : '#475569'}; margin-bottom: 6px; font-weight: 500; letter-spacing: 0.04em; }
    .srv-metric-labels span:last-child { color: ${isDark ? '#94a3b8' : '#334155'}; font-family: 'Share Tech Mono', monospace; }
    .srv-bar-track { height: 5px; background: ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(6,182,212,0.12)'}; border-radius: 99px; overflow: hidden; }
    .srv-bar-fill { height: 100%; border-radius: 99px; transition: width 0.6s ease; }

    .srv-containers {
      display: flex; justify-content: space-between; align-items: center;
      font-size: 13px; color: ${isDark ? '#64748b' : '#475569'};
      margin-top: 16px; margin-bottom: 18px; padding-top: 10px;
      border-top: 1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(6,182,212,0.15)'};
      font-weight: 500; letter-spacing: 0.04em;
    }
    .srv-containers-val { display: flex; align-items: center; gap: 6px; color: ${isDark ? '#e2e8f0' : '#0f172a'}; font-weight: 700; }
    .srv-dot { width: 8px; height: 8px; background: #22c55e; border-radius: 50%; box-shadow: 0 0 8px #22c55e; }

    .srv-actions { display: flex; gap: 10px; }
    .srv-btn-manage {
      flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 9px;
      background: ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(6,182,212,0.08)'};
      border: 1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(6,182,212,0.3)'};
      border-radius: 8px; font-size: 13px; font-weight: 600;
      color: ${isDark ? '#94a3b8' : '#0e7490'}; cursor: pointer; transition: all 0.2s;
      font-family: 'Rajdhani', sans-serif; letter-spacing: 0.05em;
    }
    .srv-btn-manage:hover { background: ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(6,182,212,0.16)'}; color: ${isDark ? '#e2e8f0' : '#0f172a'}; }
    .srv-btn-ssh {
      flex: 1; padding: 9px;
      background: linear-gradient(135deg, #06b6d4, #2563eb);
      border: none; border-radius: 8px; font-size: 13px; font-weight: 700;
      color: #fff; cursor: pointer; transition: all 0.2s;
      font-family: 'Rajdhani', sans-serif; letter-spacing: 0.1em;
      box-shadow: 0 4px 16px rgba(6,182,212,0.3);
    }
    .srv-btn-ssh:hover { box-shadow: 0 4px 24px rgba(6,182,212,0.5); transform: translateY(-1px); }

    .srv-add-card {
      background: ${isDark ? 'linear-gradient(145deg, rgba(15,23,42,0.6), rgba(10,18,35,0.8))' : 'linear-gradient(145deg, rgba(255,255,255,0.6), rgba(224,236,255,0.7))'};
      border: 1.5px dashed ${isDark ? 'rgba(6,182,212,0.25)' : 'rgba(6,182,212,0.4)'};
      border-radius: 16px; display: flex; flex-direction: column; align-items: center; justify-content: center;
      padding: 22px; cursor: pointer; transition: all 0.3s; position: relative; overflow: hidden; min-height: 280px;
      backdrop-filter: blur(8px);
    }
    .srv-add-card:hover { border-color: rgba(6,182,212,0.7); box-shadow: 0 0 40px rgba(6,182,212,0.15); }
    .srv-add-card::before {
      content: ''; position: absolute; inset: 0;
      background: radial-gradient(circle at 30% 70%, rgba(6,182,212,0.07) 0%, transparent 50%),
                  radial-gradient(circle at 70% 30%, rgba(139,92,246,0.07) 0%, transparent 50%);
      pointer-events: none;
    }
    .srv-holo { position: relative; width: 110px; height: 110px; display: flex; align-items: center; justify-content: center; margin-bottom: 20px; }
    .srv-holo-ring { position: absolute; border-radius: 50%; border: 1px solid rgba(6,182,212,0.4); animation: srv-ring-pulse 3s ease-in-out infinite; }
    .srv-holo-ring:nth-child(1) { width: 110px; height: 110px; animation-delay: 0s; }
    .srv-holo-ring:nth-child(2) { width: 85px; height: 85px; animation-delay: 0.6s; border-color: rgba(139,92,246,0.4); }
    .srv-holo-ring:nth-child(3) { width: 62px; height: 62px; animation-delay: 1.2s; }
    @keyframes srv-ring-pulse { 0%,100% { opacity:0.3; transform:scale(1); } 50% { opacity:0.8; transform:scale(1.04); } }
    .srv-holo-ellipse { position: absolute; bottom: -10px; width: 80px; height: 18px; background: radial-gradient(ellipse, rgba(6,182,212,0.5), rgba(139,92,246,0.3), transparent 70%); filter: blur(6px); animation: srv-holo-glow 2.5s ease-in-out infinite; }
    @keyframes srv-holo-glow { 0%,100% { opacity:0.5; } 50% { opacity:1; } }
    .srv-add-icon {
      width: 54px; height: 54px; border-radius: 14px;
      background: linear-gradient(135deg, rgba(139,92,246,0.35), rgba(6,182,212,0.35));
      border: 1px solid rgba(139,92,246,0.5);
      display: flex; align-items: center; justify-content: center;
      font-size: 26px; box-shadow: 0 0 20px rgba(139,92,246,0.35);
      position: relative; z-index: 1; color: #c4b5fd; transition: all 0.3s; line-height: 1;
    }
    .srv-add-card:hover .srv-add-icon { box-shadow: 0 0 30px rgba(139,92,246,0.6); transform: scale(1.06); }
    .srv-add-title { font-size: 17px; font-weight: 700; letter-spacing: 0.03em; color: ${isDark ? '#e2e8f0' : '#0f172a'}; margin-bottom: 4px; }
    .srv-add-sub { font-size: 12px; color: ${isDark ? '#475569' : '#64748b'}; letter-spacing: 0.04em; }

    .srv-modal-overlay {
      position: fixed; inset: 0; z-index: 50;
      background: rgba(0,0,0,0.7); backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center; padding: 24px;
    }
    .srv-modal {
      width: 100%; max-width: 480px;
      background: ${isDark ? 'linear-gradient(145deg, #0f172a, #0a1223)' : '#ffffff'};
      border: 1px solid ${isDark ? 'rgba(6,182,212,0.3)' : 'rgba(6,182,212,0.4)'};
      border-radius: 20px; padding: 28px; position: relative;
      box-shadow: ${isDark ? '0 0 60px rgba(6,182,212,0.1), 0 24px 48px rgba(0,0,0,0.5)' : '0 24px 48px rgba(0,0,0,0.15)'};
    }
    .srv-modal::before {
      content: ''; position: absolute; inset: 0; border-radius: 20px; padding: 1px;
      background: linear-gradient(135deg, rgba(6,182,212,0.5), rgba(139,92,246,0.3), transparent 60%);
      -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
      -webkit-mask-composite: xor; mask-composite: exclude; pointer-events: none;
    }
    .srv-modal-title { font-size: 20px; font-weight: 700; letter-spacing: 0.03em; color: ${isDark ? '#e2e8f0' : '#0f172a'}; margin-bottom: 4px; }
    .srv-modal-sub { font-size: 13px; color: ${isDark ? '#475569' : '#64748b'}; margin-bottom: 24px; }
    .srv-modal-close {
      position: absolute; top: 16px; right: 16px; width: 32px; height: 32px;
      display: flex; align-items: center; justify-content: center; border-radius: 8px;
      background: ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'};
      border: 1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'};
      cursor: pointer; color: ${isDark ? '#64748b' : '#94a3b8'}; transition: all 0.2s;
    }
    .srv-modal-close:hover { color: ${isDark ? '#e2e8f0' : '#0f172a'}; }

    .srv-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
    .srv-form-full { grid-column: 1 / -1; }
    .srv-label { font-size: 12px; font-weight: 600; color: ${isDark ? '#64748b' : '#475569'}; letter-spacing: 0.06em; margin-bottom: 6px; display: block; }
    .srv-input-wrap { position: relative; }
    .srv-input {
      width: 100%; padding: 10px 14px; border-radius: 10px; font-size: 14px;
      background: ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(6,182,212,0.04)'};
      border: 1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(6,182,212,0.25)'};
      color: ${isDark ? '#e2e8f0' : '#0f172a'}; outline: none; transition: all 0.2s;
      font-family: 'Rajdhani', sans-serif; box-sizing: border-box;
    }
    .srv-input:focus { border-color: rgba(6,182,212,0.6); box-shadow: 0 0 0 3px rgba(6,182,212,0.1); }
    .srv-input::placeholder { color: ${isDark ? '#334155' : '#94a3b8'}; }
    .srv-input-icon { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); cursor: pointer; color: ${isDark ? '#475569' : '#94a3b8'}; background: none; border: none; padding: 4px; }

    .srv-error { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #ef4444; margin-bottom: 14px; }
    .srv-test-result { display: flex; align-items: center; gap: 6px; font-size: 12px; margin-bottom: 14px; padding: 8px 12px; border-radius: 8px; }
    .srv-test-result.ok   { background: rgba(34,197,94,0.1);  color: #22c55e; border: 1px solid rgba(34,197,94,0.2);  }
    .srv-test-result.fail { background: rgba(239,68,68,0.1);  color: #ef4444; border: 1px solid rgba(239,68,68,0.2);  }

    .srv-modal-actions { display: flex; gap: 10px; margin-top: 20px; }
    .srv-btn-test {
      flex: 1; padding: 11px; border-radius: 10px; font-size: 14px; font-weight: 600;
      background: ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(6,182,212,0.08)'};
      border: 1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(6,182,212,0.3)'};
      color: ${isDark ? '#94a3b8' : '#0e7490'}; cursor: pointer; transition: all 0.2s;
      font-family: 'Rajdhani', sans-serif; letter-spacing: 0.05em;
      display: flex; align-items: center; justify-content: center; gap: 6px;
    }
    .srv-btn-test:hover { background: ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(6,182,212,0.15)'}; }
    .srv-btn-add {
      flex: 1.5; padding: 11px; border-radius: 10px; font-size: 14px; font-weight: 700;
      background: linear-gradient(135deg, #06b6d4, #2563eb);
      border: none; color: #fff; cursor: pointer; transition: all 0.2s;
      font-family: 'Rajdhani', sans-serif; letter-spacing: 0.08em;
      box-shadow: 0 4px 16px rgba(6,182,212,0.3);
      display: flex; align-items: center; justify-content: center; gap: 6px;
    }
    .srv-btn-add:hover { box-shadow: 0 4px 24px rgba(6,182,212,0.5); }
    .srv-btn-add:disabled { opacity: 0.6; cursor: not-allowed; }
    .srv-btn-add.success { background: linear-gradient(135deg, #22c55e, #16a34a); box-shadow: 0 4px 16px rgba(34,197,94,0.3); }
  `;

  const circuitColor   = isDark ? '#06b6d4' : '#0891b2';
  const circuitOpacity = isDark ? '0.12' : '0';

  return (
    <div className="srv-root">
      <style>{css}</style>

      {/* Circuit bg */}
      <div className="srv-circuit" aria-hidden="true">
        <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
          <g stroke={circuitColor} strokeWidth="1" fill="none" opacity={circuitOpacity}>
            <path d="M0 200 H400 V100 H800 V300 H1200 V150 H1440"/>
            <path d="M0 500 H200 V400 H600 V600 H1000 V450 H1440"/>
            <path d="M200 900 V700 H500 V800 H900 V600 H1100 V750 H1440"/>
            <circle cx="400" cy="100" r="4" fill={circuitColor}/>
            <circle cx="800" cy="300" r="4" fill={circuitColor}/>
            <circle cx="600" cy="600" r="4" fill={circuitColor}/>
            <circle cx="950" cy="150" r="3" fill="#8b5cf6"/>
            <circle cx="1200" cy="150" r="4" fill="#8b5cf6"/>
          </g>
        </svg>
      </div>

      {/* Header */}
      <div className="srv-header">
        <h1 className="srv-title">Server Management</h1>
        <button className="srv-cost-btn" onClick={() => setShowCostEstimator(true)}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
          </svg>
          Cost Estimator
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </button>
      </div>

      {/* Grid */}
      <div className="srv-grid">
        {vpsList.map((server) => {
          const ramPct   = getRamPct(server);
          const ramColor = getRamColor(ramPct);
          return (
            <div key={server.id} className="srv-card">
              <div className={`srv-status-badge ${server.status || 'loading'}`} />
              <div className="srv-card-head">
                <div className="srv-card-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="2" width="20" height="8" rx="2"/>
                    <rect x="2" y="14" width="20" height="8" rx="2"/>
                    <line x1="6" y1="6" x2="6.01" y2="6"/>
                    <line x1="6" y1="18" x2="6.01" y2="18"/>
                  </svg>
                </div>
                <div>
                  <div className="srv-card-name">{server.name || server.id}</div>
                  <div className="srv-card-ip">{server.host}</div>
                </div>
              </div>

              <div className="srv-metric">
                <div className="srv-metric-labels">
                  <span>RAM</span>
                  <span>{server.status === 'loading' ? '...' : `${server.ram?.used || 0} GB`}</span>
                </div>
                <div className="srv-bar-track">
                  <div className="srv-bar-fill" style={{ width: `${ramPct}%`, background: `linear-gradient(90deg, ${ramColor}88, ${ramColor})` }} />
                </div>
              </div>

              <div className="srv-metric">
                <div className="srv-metric-labels">
                  <span>CPU</span>
                  <span>{server.status === 'loading' ? '...' : `${server.cpu || 0}%`}</span>
                </div>
                <div className="srv-bar-track">
                  <div className="srv-bar-fill" style={{ width: `${server.cpu || 0}%`, background: 'linear-gradient(90deg, #2563eb88, #06b6d4)' }} />
                </div>
              </div>

              <div className="srv-containers">
                <span>Containers</span>
                <span className="srv-containers-val">
                  <span className="srv-dot" />
                  {server.status === 'loading' ? '...' : `${server.containers?.running || 0}/${server.containers?.total || 0}`}
                </span>
              </div>

              <div className="srv-actions">
                <button className="srv-btn-manage" onClick={() => { setManageServer(server); setShowManage(true); }}>
                  <Settings size={13} /> Manage
                </button>
                <button className="srv-btn-ssh" onClick={() => { setSelectedServer(server); setShowTerminal(true); }}>
                  SSH
                </button>
              </div>
            </div>
          );
        })}

        {/* Add VPS card */}
        <div className="srv-add-card" onClick={() => { setShowAddModal(true); setFormError(null); setTestResult(null); }}>
          <div className="srv-holo">
            <div className="srv-holo-ring" /><div className="srv-holo-ring" /><div className="srv-holo-ring" />
            <div className="srv-add-icon">+</div>
            <div className="srv-holo-ellipse" />
          </div>
          <div className="srv-add-title">Add New VPS</div>
          <div className="srv-add-sub">Click to add new server</div>
        </div>
      </div>

      {/* ── Modal Add VPS ──────────────────────────────────────────────────── */}
      {showAddModal && (
        <div className="srv-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowAddModal(false); }}>
          <div className="srv-modal">
            <button className="srv-modal-close" onClick={() => setShowAddModal(false)}>
              <X size={16} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, rgba(6,182,212,0.2), rgba(37,99,235,0.2))', border: '1px solid rgba(6,182,212,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#06b6d4' }}>
                <Server size={18} />
              </div>
              <div className="srv-modal-title">Add New VPS</div>
            </div>
            <div className="srv-modal-sub">Configure SSH connection to your server</div>

            <div className="srv-form-grid">
              <div>
                <label className="srv-label">ENVIRONMENT ID</label>
                <input className="srv-input" placeholder="staging" value={form.id}
                  onChange={e => setForm(f => ({ ...f, id: e.target.value }))} />
              </div>
              <div>
                <label className="srv-label">SERVER NAME</label>
                <input className="srv-input" placeholder="VPS Staging" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="srv-form-full">
                <label className="srv-label">IP ADDRESS / HOST</label>
                <input className="srv-input" placeholder="173.212.248.243" value={form.host}
                  onChange={e => setForm(f => ({ ...f, host: e.target.value }))} />
              </div>
              <div>
                <label className="srv-label">SSH USERNAME</label>
                <input className="srv-input" placeholder="mypresc" value={form.username}
                  onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
              </div>
              <div>
                <label className="srv-label">SSH PORT</label>
                <input className="srv-input" placeholder="22" value={form.port}
                  onChange={e => setForm(f => ({ ...f, port: e.target.value }))} />
              </div>
              <div className="srv-form-full">
                <label className="srv-label">SSH PASSWORD</label>
                <div className="srv-input-wrap">
                  <input className="srv-input" type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••••••" value={form.password}
                    style={{ paddingRight: 40 }}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
                  <button className="srv-input-icon" onClick={() => setShowPassword(s => !s)}>
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
            </div>

            {formError && (
              <div className="srv-error"><AlertCircle size={13} /> {formError}</div>
            )}
            {testResult && (
              <div className={`srv-test-result ${testResult.ok ? 'ok' : 'fail'}`}>
                {testResult.ok ? <CheckCircle size={13} /> : <AlertCircle size={13} />}
                {testResult.message}
              </div>
            )}

            <div className="srv-modal-actions">
              <button className="srv-btn-test" onClick={handleTest} disabled={testLoading}>
                {testLoading ? <Loader2 size={14} className="animate-spin" /> : null}
                {testLoading ? 'Testing...' : 'Test SSH'}
              </button>
              <button className={`srv-btn-add${formSuccess ? ' success' : ''}`}
                onClick={handleAddVps} disabled={formLoading || formSuccess}>
                {formLoading ? <Loader2 size={14} className="animate-spin" /> : formSuccess ? <CheckCircle size={14} /> : <Server size={14} />}
                {formLoading ? 'Adding...' : formSuccess ? 'Added!' : 'Add VPS'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {showTerminal && selectedServer && (
        <Terminal
          server={{ id: selectedServer.id, name: selectedServer.name || selectedServer.id, ip: selectedServer.host }}
          onClose={() => { setShowTerminal(false); setSelectedServer(null); }}
        />
      )}

      {showManage && manageServer && (
        <ManageModal
          server={manageServer}
          onClose={() => { setShowManage(false); setManageServer(null); }}
          onDisconnect={(id: string) => { setVpsList(prev => prev.filter(v => v.id !== id)); }}
          onOpenTerminal={() => { setSelectedServer(manageServer); setShowTerminal(true); }}
        />
      )}

      {showCostEstimator && (
        <CostEstimator
          onClose={() => setShowCostEstimator(false)}
          vpsId={vpsList[0]?.id}
        />
      )}
    </div>
  );
}