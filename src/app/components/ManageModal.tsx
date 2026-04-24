import { useState } from 'react';
import { X, Server, Trash2, RefreshCw, Terminal, Activity, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { apiFetch } from '../lib/api';

interface ManageModalProps {
  server: {
    id: string;
    name: string;
    host: string;
    cpu?: number;
    ram?: { used: number; total: number };
    containers?: { running: number; total: number };
    status?: string;
    sshConfigured?: boolean;
  };
  onClose: () => void;
  onDisconnect: (id: string) => void;
  onOpenTerminal: () => void;
}

export default function ManageModal({ server, onClose, onDisconnect, onOpenTerminal }: ManageModalProps) {
  const [disconnecting, setDisconnecting] = useState(false);
  const [showConfirm,   setShowConfirm]   = useState(false);
  const [testing,       setTesting]       = useState(false);
  const [testResult,    setTestResult]    = useState<{ ok: boolean; message: string } | null>(null);

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await apiFetch(`/api/vps/${server.id}`, { method: 'DELETE' });
      onDisconnect(server.id);
      onClose();
    } catch {
      setDisconnecting(false);
    }
  };

  const handleTest = async () => {
    if (!server.sshConfigured) {
      setTestResult({ ok: false, message: 'SSH is not configured for this VPS yet' });
      return;
    }
    setTesting(true); setTestResult(null);
    try {
      const res  = await apiFetch(`/api/vps/${server.id}/test`, { method: 'POST' });
      const data = await res.json();
      setTestResult({ ok: data.ok, message: data.ok ? `Connected ✓ — ${data.output?.split('\n')[0] || ''}` : data.error });
    } catch (err: any) {
      setTestResult({ ok: false, message: err.message });
    } finally {
      setTesting(false);
    }
  };

  const statusColor = server.status === 'healthy' ? '#22c55e' : server.status === 'warning' ? '#f59e0b' : '#ef4444';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl shadow-2xl"
        style={{ background: 'linear-gradient(145deg, #0f172a, #0a1223)', border: '1px solid rgba(6,182,212,0.3)' }}>

        {/* Header */}
        <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid #1e293b' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.2), rgba(37,99,235,0.2))', border: '1px solid rgba(6,182,212,0.4)' }}>
              <Server size={18} style={{ color: '#06b6d4' }} />
            </div>
            <div>
              <h2 className="font-bold text-white text-base">{server.name || server.id}</h2>
              <p className="text-xs font-mono" style={{ color: '#475569' }}>{server.host}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
            style={{ background: '#1e293b', color: '#64748b' }}>
            <X size={15} />
          </button>
        </div>

        {/* Stats */}
        <div className="p-5 grid grid-cols-3 gap-3">
          {[
            { label: 'CPU', value: `${server.cpu || 0}%`, color: '#10b981' },
            { label: 'RAM', value: `${server.ram?.used || 0} GB`, color: '#8b5cf6' },
            { label: 'Containers', value: `${server.containers?.running || 0}/${server.containers?.total || 0}`, color: '#06b6d4' },
          ].map(stat => (
            <div key={stat.label} className="rounded-xl p-3 text-center" style={{ background: '#1e293b', border: '1px solid #334155' }}>
              <div className="text-lg font-bold" style={{ color: stat.color }}>{stat.value}</div>
              <div className="text-[10px] text-[#475569] mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Status */}
        <div className="px-5 pb-3">
          <div className="flex items-center gap-2 rounded-xl p-3" style={{ background: '#1e293b', border: '1px solid #334155' }}>
            <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: statusColor, boxShadow: `0 0 6px ${statusColor}` }} />
            <span className="text-xs font-medium capitalize" style={{ color: statusColor }}>{server.status || 'unknown'}</span>
            <span className="text-[10px] text-[#475569] ml-auto font-mono">{server.host}</span>
          </div>
        </div>

        {/* Test result */}
        {testResult && (
          <div className="px-5 pb-3">
            <div className="flex items-center gap-2 rounded-xl p-3 text-xs"
              style={{
                background: testResult.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                border: `1px solid ${testResult.ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                color: testResult.ok ? '#22c55e' : '#ef4444',
              }}>
              {testResult.ok ? <CheckCircle size={13} /> : <AlertTriangle size={13} />}
              <span className="truncate">{testResult.message}</span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="px-5 pb-4 flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={handleTest} disabled={testing || !server.sshConfigured}
              className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition-all"
              style={{ background: '#1e293b', border: '1px solid #334155', color: '#94a3b8' }}>
              {testing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              {testing ? 'Testing...' : (server.sshConfigured ? 'Test Connection' : 'SSH not configured')}
            </button>
            <button onClick={() => { if (!server.sshConfigured) return; onClose(); onOpenTerminal(); }}
              disabled={!server.sshConfigured}
              className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition-all"
              style={{ background: 'linear-gradient(135deg, #06b6d4, #2563eb)', color: '#fff', boxShadow: '0 4px 14px rgba(6,182,212,0.3)' }}>
              <Terminal size={13} />
              {server.sshConfigured ? 'Open SSH' : 'SSH not configured'}
            </button>
          </div>

          {/* Disconnect */}
          {!showConfirm ? (
            <button onClick={() => setShowConfirm(true)}
              className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition-all w-full"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}>
              <Trash2 size={13} />
              Disconnect VPS
            </button>
          ) : (
            <div className="rounded-xl p-3" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)' }}>
              <p className="text-xs text-[#ef4444] font-medium text-center mb-2.5">
                ⚠️ Supprimer <strong>{server.name}</strong> ? Cette action est irréversible.
              </p>
              <div className="flex gap-2">
                <button onClick={() => setShowConfirm(false)}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold"
                  style={{ background: '#1e293b', color: '#94a3b8' }}>
                  Annuler
                </button>
                <button onClick={handleDisconnect} disabled={disconnecting}
                  className="flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5"
                  style={{ background: 'linear-gradient(135deg, #dc2626, #991b1b)', color: '#fff' }}>
                  {disconnecting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  {disconnecting ? 'Suppression...' : 'Confirmer'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}