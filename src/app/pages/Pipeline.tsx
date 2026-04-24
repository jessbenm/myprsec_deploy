import { useState, useEffect } from 'react';
import { CheckCircle, AlertTriangle, RotateCcw, RefreshCw, Square, Loader2, Play, ExternalLink, GitBranch, Clock, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { useTheme } from '../theme-context';
import { useEnvironment } from '../../environment-context';

import { apiFetch } from '../lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Run {
  id: number; name: string; status: string; conclusion: string | null;
  branch: string; commit: string; commitMsg: string; actor: string;
  createdAt: string; updatedAt: string; duration: number; url: string;
}
interface Job {
  id: number; name: string; status: string; conclusion: string | null;
  duration: number;
  steps: { name: string; status: string; conclusion: string | null; number: number; duration: number }[];
}
interface Stats { totalRuns: number; successRuns: number; successRate: number; avgDurationSec: number; }

// ── Helpers ───────────────────────────────────────────────────────────────────
function statusColor(status: string, conclusion: string | null) {
  if (status === 'in_progress' || status === 'queued') return '#3b82f6';
  if (conclusion === 'success')  return '#10b981';
  if (conclusion === 'failure')  return '#ef4444';
  if (conclusion === 'cancelled') return '#94a3b8';
  return '#f59e0b';
}
function statusLabel(status: string, conclusion: string | null) {
  if (status === 'in_progress') return 'Running';
  if (status === 'queued')      return 'Queued';
  if (conclusion === 'success')  return 'Success';
  if (conclusion === 'failure')  return 'Failed';
  if (conclusion === 'cancelled') return 'Cancelled';
  return conclusion || status;
}
function formatDuration(sec: number) {
  if (!sec) return '—';
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
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

function Spinner({ color = '#3b82f6' }: { color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 22 22" className="animate-spin" style={{ animationDuration: '1s' }}>
      <circle cx="11" cy="11" r="8" fill="none" stroke={`${color}30`} strokeWidth="2.5" />
      <circle cx="11" cy="11" r="8" fill="none" stroke={color} strokeWidth="2.5"
        strokeDasharray="20 30" strokeLinecap="round" />
    </svg>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Pipeline() {
  const [showModal,    setShowModal]    = useState(false);
  const [pipelineData, setPipelineData] = useState<{ runs: Run[]; jobs: Job[]; stats: Stats; repo: string } | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [triggering,   setTriggering]   = useState(false);
  const [rerunning,    setRerunning]    = useState<number | null>(null);
  const [selectedRun,  setSelectedRun]  = useState<Run | null>(null);

  const { theme }       = useTheme();
  const { environment } = useEnvironment();
  const isDark = theme === 'dark';

  // ── Fetch pipeline ──────────────────────────────────────────────────────────
  const fetchPipeline = async () => {
    if (!environment) {
      setPipelineData(null);
      setError('No VPS configured for this account yet');
      setLoading(false);
      return;
    }
    try {
      const res = await apiFetch(`/api/pipeline/${environment}`);
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error);
      }
      const data = await res.json();
      setPipelineData(data);
      setError(null);
      if (data.runs.length > 0) setSelectedRun(data.runs[0]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true); setPipelineData(null); setError(null);
    fetchPipeline();
  }, [environment]);

  // Auto-refresh toutes les 15s si un run est en cours
  useEffect(() => {
    const hasRunning = pipelineData?.runs.some(r => r.status === 'in_progress' || r.status === 'queued');
    if (!hasRunning) return;
    const t = setInterval(fetchPipeline, 15000);
    return () => clearInterval(t);
  }, [pipelineData, environment]);

  // ── Trigger workflow ────────────────────────────────────────────────────────
  const handleTrigger = async (branch = 'main') => {
    setTriggering(true);
    try {
      const res  = await apiFetch(`/api/pipeline/${environment}/trigger`, {
        method: 'POST',
        body: JSON.stringify({ workflow: 'deploy.yml', branch }),
      });
      const data = await res.json();
      if (data.ok) {
        setShowModal(false);
        setTimeout(fetchPipeline, 2000);
      } else {
        alert(data.error);
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setTriggering(false);
    }
  };

  // ── Rerun ───────────────────────────────────────────────────────────────────
  const handleRerun = async (runId: number) => {
    setRerunning(runId);
    try {
      await apiFetch(`/api/pipeline/${environment}/rerun/${runId}`, { method: 'POST' });
      setTimeout(fetchPipeline, 2000);
    } catch {}
    finally { setRerunning(null); }
  };

  const latestRun = pipelineData?.runs[0];
  const jobs      = pipelineData?.jobs || [];
  const stats     = pipelineData?.stats;

  // Construire les stages depuis les jobs du dernier run
  const stages = jobs.length > 0 ? jobs : [
    { id: 0, name: 'Build',  status: 'waiting', conclusion: null, duration: 0, steps: [] },
    { id: 1, name: 'Test',   status: 'waiting', conclusion: null, duration: 0, steps: [] },
    { id: 2, name: 'Deploy', status: 'waiting', conclusion: null, duration: 0, steps: [] },
  ];

  const circumference = 2 * Math.PI * 36;
  const score = stats?.successRate || 0;

  return (
    <div className="flex flex-col gap-3 text-sm">

      {/* Status bar */}
      <div className="flex items-center justify-between rounded-xl px-4 py-2.5"
        style={{
          background: isDark ? 'linear-gradient(90deg, #0f172a, #0d1a2e, #0f172a)' : '#f8fafc',
          border: `1px solid ${isDark ? '#1e3a5f' : '#e2e8f0'}`,
          boxShadow: isDark ? '0 0 20px #06b6d420' : 'none',
        }}>
        <div className="flex items-center gap-3">
          <span className="h-2 w-2 rounded-full bg-[#10b981]" style={{ boxShadow: '0 0 6px #10b981' }} />
          <span className="text-xs text-gray-400">Pipeline:</span>
          <span className="text-xs font-semibold text-[#06b6d4] capitalize">{environment || 'No VPS'}</span>
          {pipelineData?.repo && (
            <>
              <span className="text-gray-600">·</span>
              <a href={`https://github.com/${pipelineData.repo}`} target="_blank" rel="noreferrer"
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 transition-colors">
                <GitBranch size={11} /> {pipelineData.repo}
                <ExternalLink size={9} />
              </a>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchPipeline}
            className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-gray-200 transition-colors">
            <RefreshCw size={11} /> Refresh
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-xl p-4 flex items-center gap-3"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
          <AlertCircle size={16} className="text-[#ef4444] flex-shrink-0" />
          <div>
            <div className="text-sm font-semibold text-[#ef4444]">Pipeline non configuré</div>
            <div className="text-xs text-gray-400 mt-0.5">{error}</div>
            <div className="text-xs text-gray-500 mt-1">
              Ajoutez GitHub repo et token dans le formulaire Add VPS pour activer le pipeline.
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && !error && (
        <div className="rounded-xl p-8 flex items-center justify-center gap-3"
          style={{ background: isDark ? '#0f172a' : 'white', border: `1px solid ${isDark ? '#1e293b' : '#e2e8f0'}` }}>
          <Loader2 size={18} className="animate-spin text-[#06b6d4]" />
          <span className="text-sm text-gray-400">Connexion à GitHub Actions...</span>
        </div>
      )}

      {!loading && !error && pipelineData && (<>

        {/* ── CI/CD Pipeline stages ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">CI/CD Pipeline</h2>
            {latestRun && (
              <div className="flex items-center gap-2 text-[10px] text-gray-500">
                <GitBranch size={10} />
                <span>{latestRun.branch}</span>
                <span>·</span>
                <span className="font-mono">{latestRun.commit}</span>
                <span>·</span>
                <span>{timeAgo(latestRun.createdAt)}</span>
              </div>
            )}
          </div>

          <div className="relative rounded-2xl overflow-hidden p-5"
            style={{
              background: isDark
                ? 'linear-gradient(135deg, #050d1a 0%, #0a1628 40%, #071220 70%, #050d1a 100%)'
                : '#f1f5f9',
              border: `1px solid ${isDark ? '#1e3a5f' : '#cbd5e1'}`,
              boxShadow: isDark ? '0 0 40px #06b6d415' : 'none',
            }}>

            {isDark && (
              <div className="absolute top-0 left-0 right-0 h-px"
                style={{ background: 'linear-gradient(90deg, transparent, #06b6d4, #3b82f6, #06b6d4, transparent)' }} />
            )}

            <div className="relative flex items-stretch gap-0 z-10">
              {stages.map((stage, i) => {
                const color = statusColor(stage.status, stage.conclusion);
                const isRunning = stage.status === 'in_progress' || stage.status === 'queued';
                return (
                  <div key={stage.id} className="flex items-center flex-1">
                    <motion.div className="flex-1 rounded-xl p-4 flex flex-col justify-between"
                      style={{
                        background: isDark ? 'rgba(5,13,26,0.8)' : 'white',
                        border: `1px solid ${color}40`,
                        backdropFilter: 'blur(8px)', minHeight: 90,
                      }}
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.1 }}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-sm" style={{ color: isDark ? '#fff' : '#0f172a' }}>
                          {stage.name}
                        </span>
                        {isRunning ? <Spinner color={color} /> :
                         stage.conclusion === 'success' ? <CheckCircle size={16} style={{ color, filter: `drop-shadow(0 0 4px ${color})` }} /> :
                         stage.conclusion === 'failure' ? <AlertTriangle size={16} style={{ color }} /> :
                         <div style={{ width: 16, height: 16, borderRadius: '50%', background: `${color}30`, border: `1px solid ${color}60` }} />
                        }
                      </div>
                      <div className="text-xs text-gray-500">{formatDuration(stage.duration)}</div>
                      <div className="mt-3 h-0.5 rounded-full overflow-hidden"
                        style={{ background: isDark ? '#0f2040' : '#e2e8f0' }}>
                        <motion.div className="h-full rounded-full"
                          style={{ background: `linear-gradient(90deg, ${color}, ${color}aa)`, boxShadow: `0 0 6px ${color}60` }}
                          initial={{ width: '0%' }}
                          animate={{ width: stage.conclusion === 'success' ? '100%' : isRunning ? '60%' : '0%' }}
                          transition={{ duration: 1, delay: i * 0.2, ease: 'easeOut' }} />
                      </div>
                    </motion.div>

                    {i < stages.length - 1 && (
                      <div className="flex items-center px-1.5 flex-shrink-0">
                        <div className="h-px w-4" style={{ background: isDark ? '#3b82f680' : '#cbd5e1' }} />
                        <div className="w-0 h-0" style={{
                          borderTop: '4px solid transparent', borderBottom: '4px solid transparent',
                          borderLeft: `5px solid ${isDark ? '#06b6d4' : '#94a3b8'}`,
                        }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bottom grid */}
        <div className="grid grid-cols-2 gap-3">

          {/* Recent Runs */}
          <div className="relative rounded-2xl overflow-hidden p-5"
            style={{
              background: isDark ? 'linear-gradient(135deg, #050d1a 0%, #0a1628 50%, #050d1a 100%)' : 'white',
              border: `1px solid ${isDark ? '#1e3a5f' : '#e2e8f0'}`,
            }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-base">Recent Runs</h2>
              <div className="flex items-center gap-2">
                {stats && (
                  <span className="text-[10px] text-gray-500">
                    {stats.successRate}% success · avg {formatDuration(stats.avgDurationSec)}
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-2">
              {pipelineData.runs.slice(0, 6).map((run) => {
                const color = statusColor(run.status, run.conclusion);
                const isRunning = run.status === 'in_progress';
                return (
                  <div key={run.id}
                    className="flex items-center gap-3 rounded-lg p-2.5 cursor-pointer transition-all"
                    style={{
                      background: selectedRun?.id === run.id
                        ? (isDark ? 'rgba(6,182,212,0.1)' : 'rgba(6,182,212,0.05)')
                        : (isDark ? '#ffffff06' : '#f8fafc'),
                      border: `1px solid ${selectedRun?.id === run.id ? color + '60' : (isDark ? '#1e3a5f' : '#e2e8f0')}`,
                    }}
                    onClick={() => setSelectedRun(run)}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}`, flexShrink: 0 }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold truncate">{run.commitMsg || run.name}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-gray-500 mt-0.5">
                        <GitBranch size={9} />{run.branch}
                        <span className="font-mono">{run.commit}</span>
                        <span>·</span>{run.actor}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 text-[10px] text-gray-400">
                      {isRunning && <Spinner color={color} />}
                      <span className="font-semibold" style={{ color }}>{statusLabel(run.status, run.conclusion)}</span>
                      <span><Clock size={9} className="inline mr-0.5" />{formatDuration(run.duration)}</span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={e => { e.stopPropagation(); handleRerun(run.id); }}
                        className="p-1 rounded hover:opacity-80 transition-opacity"
                        style={{ color: '#94a3b8' }}>
                        {rerunning === run.id ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                      </button>
                      <a href={run.url} target="_blank" rel="noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="p-1 rounded hover:opacity-80 transition-opacity"
                        style={{ color: '#94a3b8' }}>
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Deploy Controls */}
          <div className="relative rounded-2xl overflow-hidden p-5"
            style={{
              background: isDark ? 'linear-gradient(135deg, #050d1a 0%, #0a1628 50%, #050d1a 100%)' : 'white',
              border: `1px solid ${isDark ? '#1e3a5f' : '#e2e8f0'}`,
            }}>
            {isDark && (
              <div className="absolute bottom-0 right-0 w-40 h-40 rounded-full pointer-events-none"
                style={{ background: '#1d4ed812', filter: 'blur(40px)' }} />
            )}

            <h2 className="font-bold text-base mb-3 relative z-10">Deploy Controls</h2>

            <div className="relative z-10 space-y-2.5">
              {/* Stats */}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl p-3"
                  style={{ background: isDark ? '#ffffff06' : '#f8fafc', border: `1px solid ${isDark ? '#1e3a5f' : '#e2e8f0'}` }}>
                  <div className="text-[10px] text-gray-500 mb-1">Latest Run</div>
                  <div className="flex items-center gap-1.5">
                    {latestRun && (
                      <span className="h-2 w-2 rounded-full flex-shrink-0"
                        style={{ background: statusColor(latestRun.status, latestRun.conclusion) }} />
                    )}
                    <span className="text-sm font-bold">
                      {latestRun ? statusLabel(latestRun.status, latestRun.conclusion) : '—'}
                    </span>
                  </div>
                </div>
                <div className="rounded-xl p-3"
                  style={{ background: isDark ? '#ffffff06' : '#f8fafc', border: `1px solid ${isDark ? '#1e3a5f' : '#e2e8f0'}` }}>
                  <div className="text-[10px] text-gray-500 mb-1">Success Rate</div>
                  <div className="text-sm font-bold text-[#10b981]">{stats?.successRate || 0}%</div>
                </div>
              </div>

              {/* Score ring */}
              <div className="flex items-center gap-4 rounded-xl p-3"
                style={{ background: isDark ? '#ffffff06' : '#f8fafc', border: `1px solid ${isDark ? '#1e3a5f' : '#e2e8f0'}` }}>
                <div className="relative w-14 h-14 flex-shrink-0">
                  <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
                    <circle cx="40" cy="40" r="36" fill="none" stroke={isDark ? '#0f2040' : '#e2e8f0'} strokeWidth="5" />
                    <motion.circle cx="40" cy="40" r="36" fill="none" stroke="#10b981" strokeWidth="5"
                      strokeLinecap="round" strokeDasharray={circumference}
                      initial={{ strokeDashoffset: circumference }}
                      animate={{ strokeDashoffset: circumference * (1 - score / 100) }}
                      transition={{ duration: 1.2, ease: 'easeOut' }}
                      style={{ filter: 'drop-shadow(0 0 4px #10b981)' }} />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-sm font-bold">{score}</span>
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-[#10b981]">Safe to Deploy</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">
                    {stats?.successRuns || 0}/{stats?.totalRuns || 0} successful runs
                  </div>
                  <div className="text-[10px] text-gray-500">
                    Avg: {formatDuration(stats?.avgDurationSec || 0)}
                  </div>
                </div>
              </div>

              {/* Deploy button */}
              <motion.button
                onClick={() => setShowModal(true)}
                className="relative w-full rounded-xl py-3 text-xs font-bold uppercase tracking-widest text-white overflow-hidden"
                style={{ background: 'linear-gradient(90deg, #06b6d4, #3b82f6, #10b981)', boxShadow: '0 0 20px #06b6d430' }}
                whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>
                <span className="flex items-center justify-center gap-2">
                  <Play size={13} /> Deploy to {environment}
                </span>
              </motion.button>

              {/* Actions */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Rollback', icon: RotateCcw, color: '#06b6d4', action: () => latestRun && handleRerun(latestRun.id) },
                  { label: 'Restart',  icon: RefreshCw, color: '#3b82f6', action: fetchPipeline },
                  { label: 'GitHub',   icon: ExternalLink, color: '#94a3b8',
                    action: () => pipelineData.repo && window.open(`https://github.com/${pipelineData.repo}/actions`, '_blank') },
                ].map((btn, i) => (
                  <button key={i} onClick={btn.action}
                    className="flex items-center justify-center gap-1.5 rounded-xl py-2 text-[10px] font-semibold transition-all hover:opacity-80"
                    style={{ background: isDark ? '#ffffff06' : '#f8fafc', border: `1px solid ${btn.color}40`, color: btn.color }}>
                    <btn.icon size={11} /> {btn.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </>)}

      {/* Deploy Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xl">
          <motion.div className="mx-4 w-full max-w-md rounded-2xl p-6"
            style={{
              background: isDark ? 'linear-gradient(135deg, #050d1a, #0a1628)' : 'white',
              border: `1px solid ${isDark ? '#1e3a5f' : '#e2e8f0'}`,
              boxShadow: isDark ? '0 0 60px #06b6d430' : '0 20px 60px rgba(0,0,0,0.2)',
            }}
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.2 }}>
            <h3 className="text-xl font-bold mb-4">Confirm Deployment</h3>
            <div className="space-y-3 mb-6 text-sm">
              {[
                { label: 'Environment', value: environment, color: '#06b6d4' },
                { label: 'Repo',        value: pipelineData?.repo || '—' },
                { label: 'Success Rate', value: `${stats?.successRate || 0}%`, color: '#10b981' },
                { label: 'Latest Run',  value: latestRun ? statusLabel(latestRun.status, latestRun.conclusion) : '—' },
              ].map(r => (
                <div key={r.label} className="flex justify-between">
                  <span className="text-gray-400">{r.label}:</span>
                  <span className="font-semibold" style={{ color: r.color }}>{r.value}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowModal(false)}
                className="flex-1 rounded-xl py-2.5 text-sm font-semibold"
                style={{ background: isDark ? '#ffffff10' : '#f1f5f9', border: `1px solid ${isDark ? '#1e3a5f' : '#e2e8f0'}` }}>
                Cancel
              </button>
              <button onClick={() => handleTrigger(latestRun?.branch || 'main')}
                disabled={triggering}
                className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(90deg, #06b6d4, #10b981)', boxShadow: '0 0 16px #06b6d430' }}>
                {triggering ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                {triggering ? 'Triggering...' : 'Deploy'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
