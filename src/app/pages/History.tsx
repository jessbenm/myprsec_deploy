import { useState, useEffect } from 'react';
import { useTheme } from '../theme-context';
import { useEnvironment } from '../../environment-context';
import DiffViewer from '../components/DiffViewer';
import RollbackModal from '../components/RollbackModal';
import { Loader2, RefreshCw, AlertCircle } from 'lucide-react';

import { apiFetch } from '../lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Deployment {
  id: number;
  version: string;
  date: string;
  deployer: string;
  commit: string;
  branch: string;
  description: string;
  subDescription: string;
  tests: { passed: number; total: number };
  duration: string;
  durationSec: number;
  status: 'success' | 'failed' | 'running' | 'cancelled';
  pipeline: string[];
  changes: { file: string; additions: number; deletions: number }[];
  containers: string[];
  url: string;
  createdAt: string;
}

interface Stats {
  totalRuns: number;
  successRuns: number;
  successRate: number;
  avgDurationSec: number;
  rollbacks: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDuration(sec: number): string {
  if (!sec) return '—';
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)   return 'just now';
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'Yesterday';
  return `${d} days ago`;
}

function mapConclusion(status: string, conclusion: string | null): Deployment['status'] {
  if (status === 'in_progress' || status === 'queued') return 'running';
  if (conclusion === 'success')   return 'success';
  if (conclusion === 'failure')   return 'failed';
  if (conclusion === 'cancelled') return 'cancelled';
  return 'failed';
}

// ── Sparkline ─────────────────────────────────────────────────────────────────
function Sparkline({ color = '#06b6d4', points = '0,25 20,18 40,22 60,10 80,15 100,8 120,12' }) {
  return (
    <svg viewBox="0 0 120 30" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

const PIPE_ICONS: Record<string, string> = {
  Push: '⬆', Build: '⊕', Tests: '✓', Deploy: '⚑', Running: '◌',
};

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

  .hist-root {
    font-family: 'Inter', sans-serif;
    background: var(--hist-bg);
    color: var(--hist-text);
    position: relative;
    overflow: hidden;
    padding: 24px;
  }

  .hist-search-wrap {
    display: flex; align-items: center; gap: 10px;
    margin-bottom: 20px; position: relative; z-index: 1;
  }
  .hist-search {
    flex: 1; display: flex; align-items: center; gap: 10px;
    background: var(--hist-card-bg);
    border: 1px solid var(--hist-border);
    border-radius: 10px; padding: 10px 16px;
  }
  .hist-search input {
    background: transparent; border: none; outline: none;
    font-size: 14px; color: var(--hist-text);
    font-family: 'Inter', sans-serif; width: 100%;
  }
  .hist-search input::placeholder { color: var(--hist-muted); }
  .hist-filter-btn {
    width: 40px; height: 40px; border-radius: 10px;
    background: var(--hist-card-bg); border: 1px solid var(--hist-border);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; color: var(--hist-muted); transition: all 0.2s;
  }
  .hist-filter-btn:hover { border-color: #06b6d4; color: #06b6d4; }

  .hist-stats {
    display: flex; align-items: center;
    background: var(--hist-card-bg); border: 1px solid var(--hist-border);
    border-radius: 14px; padding: 10px 20px;
    margin-bottom: 20px; position: relative; z-index: 1; overflow: hidden;
  }
  .hist-stats::before {
    content: ''; position: absolute; inset: 0; border-radius: 14px; padding: 1px;
    background: linear-gradient(135deg, rgba(6,182,212,0.3), rgba(139,92,246,0.2), transparent 60%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor; mask-composite: exclude; pointer-events: none;
  }
  .hist-stat-section {
    display: flex; align-items: center; gap: 14px;
    flex: 1; padding: 0 20px;
    border-right: 1px solid var(--hist-border);
  }
  .hist-stat-section:first-child { padding-left: 0; }
  .hist-stat-section:last-child { border-right: none; padding-right: 0; }
  .hist-stat-label { font-size: 11px; color: #06b6d4; font-weight: 600; margin-bottom: 2px; }
  .hist-stat-sub { font-size: 10px; color: var(--hist-muted); }
  .hist-stat-value { font-size: 26px; font-weight: 700; color: var(--hist-text); line-height: 1; }
  .hist-stat-value sup { font-size: 14px; vertical-align: super; }
  .hist-stat-badge {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 11px; padding: 2px 8px; border-radius: 99px; font-weight: 600;
  }
  .hist-stat-badge.failed { background: rgba(220,38,38,0.2); border: 1px solid rgba(220,38,38,0.4); color: #f87171; }
  .hist-stat-badge.ok { background: rgba(34,197,94,0.2); border: 1px solid rgba(34,197,94,0.4); color: #22c55e; }
  .hist-mini-chart { flex: 1; height: 40px; opacity: 0.5; }

  .hist-section-title {
    font-size: 18px; font-weight: 700; color: var(--hist-text);
    margin-bottom: 16px; position: relative; z-index: 1;
    display: flex; align-items: center; justify-content: space-between;
  }
  .hist-refresh-btn {
    display: flex; align-items: center; gap: 6px; font-size: 12px;
    color: var(--hist-muted); background: none; border: none; cursor: pointer;
    font-family: 'Inter', sans-serif; transition: color 0.2s;
  }
  .hist-refresh-btn:hover { color: #06b6d4; }

  .hist-card {
    background: var(--hist-card-bg); border: 1px solid var(--hist-border);
    border-radius: 14px; margin-bottom: 16px; overflow: hidden;
    position: relative; z-index: 1; transition: border-color 0.2s;
  }
  .hist-card:hover { border-color: rgba(6,182,212,0.4); }
  .hist-card.failed { border-color: rgba(220,38,38,0.3); }
  .hist-card.failed:hover { border-color: rgba(220,38,38,0.6); }
  .hist-card.running { border-color: rgba(59,130,246,0.4); }
  .hist-card::before {
    content: ''; position: absolute; inset: 0; border-radius: 14px; padding: 1px;
    background: linear-gradient(135deg, rgba(6,182,212,0.25), rgba(139,92,246,0.15), transparent 50%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor; mask-composite: exclude; pointer-events: none;
  }

  .hist-card-sparkline {
    position: absolute; top: 12px; right: 140px;
    width: 120px; height: 30px; opacity: 0.3; pointer-events: none;
  }

  .hist-card-top {
    display: flex; align-items: flex-start; justify-content: space-between;
    padding: 16px 18px 12px; gap: 16px;
  }
  .hist-card-left { flex: 1; }

  .hist-version-row { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
  .hist-status-dot {
    width: 24px; height: 24px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }
  .hist-status-dot.success { background: #16a34a; box-shadow: 0 0 10px rgba(22,163,74,0.5); }
  .hist-status-dot.failed  { background: #dc2626; box-shadow: 0 0 10px rgba(220,38,38,0.5); }
  .hist-status-dot.running { background: #3b82f6; box-shadow: 0 0 10px rgba(59,130,246,0.5); animation: pulse-blue 1.5s infinite; }
  .hist-status-dot.cancelled { background: #94a3b8; }
  @keyframes pulse-blue { 0%,100%{opacity:1;} 50%{opacity:0.5;} }

  .hist-version { font-size: 18px; font-weight: 700; color: var(--hist-text); font-family: 'Inter', monospace; }
  .hist-date { font-size: 13px; color: #06b6d4; font-weight: 500; }
  .hist-deployer { font-size: 13px; color: var(--hist-muted); margin-bottom: 10px; }
  .hist-deployer strong { color: var(--hist-text); font-weight: 700; }

  .hist-desc-row { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 4px; }
  .hist-desc { font-size: 13px; color: var(--hist-text); font-weight: 500; }
  .hist-desc-sub { font-size: 12px; color: #22c55e; font-weight: 600; margin-left: 21px; }

  .hist-meta-row {
    display: flex; align-items: center; gap: 24px;
    padding: 0 18px 14px;
  }
  .hist-meta-item { display: flex; flex-direction: column; gap: 2px; }
  .hist-meta-label { font-size: 11px; color: var(--hist-muted); }
  .hist-meta-val { font-size: 22px; font-weight: 700; color: var(--hist-text); font-family: 'Inter', monospace; line-height: 1.1; }
  .hist-meta-tag {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 12px; font-weight: 700; color: #06b6d4;
    font-family: 'Inter', monospace;
  }
  .hist-divider-v { width: 1px; height: 36px; background: var(--hist-border); flex-shrink: 0; }

  .hist-rollback-btn {
    padding: 8px 20px;
    background: linear-gradient(135deg, #ea580c, #dc2626);
    border: none; border-radius: 8px;
    font-size: 13px; font-weight: 700; color: #fff;
    cursor: pointer; font-family: 'Inter', sans-serif;
    transition: all 0.2s; box-shadow: 0 4px 14px rgba(234,88,12,0.35);
    flex-shrink: 0; align-self: flex-start; margin-top: 2px;
  }
  .hist-rollback-btn:hover { box-shadow: 0 4px 20px rgba(234,88,12,0.55); transform: translateY(-1px); }

  .hist-gh-btn {
    padding: 8px 14px;
    background: var(--hist-card-bg);
    border: 1px solid var(--hist-border); border-radius: 8px;
    font-size: 12px; font-weight: 600; color: var(--hist-muted);
    cursor: pointer; font-family: 'Inter', sans-serif;
    transition: all 0.2s; flex-shrink: 0; align-self: flex-start; margin-top: 2px;
    display: flex; align-items: center; gap: 5px; text-decoration: none;
  }
  .hist-gh-btn:hover { border-color: #06b6d4; color: #06b6d4; }

  .hist-pipeline {
    display: flex; align-items: center; gap: 6px;
    padding: 8px 18px;
    background: var(--hist-pipeline-bg);
    border-top: 1px solid var(--hist-border);
    border-bottom: 1px solid var(--hist-border);
  }
  .hist-pipe-step {
    display: flex; align-items: center; gap: 5px;
    font-size: 12px; font-weight: 600; color: var(--hist-muted);
  }
  .hist-pipe-step.done { color: #22c55e; }
  .hist-pipe-step.fail { color: #dc2626; }
  .hist-pipe-step.active { color: #3b82f6; }
  .hist-pipe-bar {
    flex: 1; height: 3px;
    background: linear-gradient(90deg, #22c55e, #06b6d4, #8b5cf6, #22c55e);
    background-size: 200% 100%; border-radius: 99px; margin: 0 8px;
    animation: hist-pipe-flow 3s linear infinite; opacity: 0.6;
  }
  @keyframes hist-pipe-flow { 0%{background-position:0% 0%;} 100%{background-position:200% 0%;} }

  .hist-changes {
    display: flex; align-items: center; gap: 8px;
    padding: 9px 18px; font-size: 12px; flex-wrap: wrap;
  }
  .hist-changes-label { font-weight: 700; color: var(--hist-text); margin-right: 2px; }
  .hist-file-tag {
    display: inline-flex; align-items: center; gap: 4px;
    background: var(--hist-file-bg); border: 1px solid var(--hist-border);
    border-radius: 6px; padding: 2px 8px;
    font-family: 'Inter', monospace; font-size: 11px; color: var(--hist-text);
  }
  .hist-add-badge { color: #22c55e; font-weight: 700; font-size: 12px; }
  .hist-del-badge { color: #dc2626; font-weight: 700; font-size: 12px; }

  .hist-loading {
    display: flex; align-items: center; justify-content: center; gap: 10px;
    padding: 60px; color: var(--hist-muted); font-size: 14px;
    position: relative; z-index: 1;
  }
  .hist-error {
    display: flex; align-items: center; gap: 10px;
    padding: 16px 20px; border-radius: 12px; margin-bottom: 16px;
    background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3);
    color: #ef4444; font-size: 13px; position: relative; z-index: 1;
  }

  .hist-circuit { position: absolute; inset: 0; pointer-events: none; z-index: 0; overflow: hidden; }
  .hist-circuit svg { width: 100%; height: 100%; }

  .hist-empty {
    text-align: center; padding: 60px 20px;
    color: var(--hist-muted); font-size: 14px;
    position: relative; z-index: 1;
  }
`;

export default function History() {
  const [search,         setSearch]         = useState('');
  const [filter,         setFilter]         = useState('all');
  const [deployments,    setDeployments]    = useState<Deployment[]>([]);
  const [stats,          setStats]          = useState<Stats | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState<string | null>(null);
  const [showDiff,       setShowDiff]       = useState(false);
  const [selectedDeploy, setSelectedDeploy] = useState<Deployment | null>(null);
  const [rollbackTarget, setRollbackTarget] = useState<Deployment | null>(null);

  const { theme }       = useTheme();
  const { environment } = useEnvironment();
  const isDark = theme === 'dark';

  // ── Fetch depuis GitHub Actions ───────────────────────────────────────────
  const fetchHistory = async () => {
    if (!environment) {
      setDeployments([]);
      setStats(null);
      setError('No VPS configured for this account yet');
      setLoading(false);
      return;
    }
    setLoading(true); setError(null);
    try {
      const res = await apiFetch(`/api/pipeline/${environment}`);
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error);
      }
      const data = await res.json();

      // Mapper les runs GitHub → Deployment
      const mapped: Deployment[] = (data.runs || []).map((r: any, i: number) => {
        const s = mapConclusion(r.status, r.conclusion);
        // Pipeline steps selon le statut
        let pipeline: string[];
        if (s === 'running')   pipeline = ['Push', 'Build', 'Running'];
        else if (s === 'failed') pipeline = ['Push', 'Build'];
        else pipeline = ['Push', 'Build', 'Tests', 'Deploy'];

        return {
          id:             r.id,
          version:        `#${data.runs.length - i}`,
          date:           timeAgo(r.createdAt),
          deployer:       r.actor || 'GitHub Actions',
          commit:         r.commit || '—',
          branch:         r.branch || 'main',
          description:    r.commitMsg || r.name || 'No description',
          subDescription: '',
          tests:          { passed: s === 'success' ? 100 : 0, total: 100 },
          duration:       formatDuration(r.duration),
          durationSec:    r.duration,
          status:         s,
          pipeline,
          changes:        [],
          containers:     [],
          url:            r.url,
          createdAt:      r.createdAt,
        };
      });

      setDeployments(mapped);
      setStats({
        totalRuns:      data.stats.totalRuns,
        successRuns:    data.stats.successRuns,
        successRate:    data.stats.successRate,
        avgDurationSec: data.stats.avgDurationSec,
        rollbacks:      0,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchHistory(); }, [environment]);

  // ── Filtrage ──────────────────────────────────────────────────────────────
  const filtered = deployments.filter(d => {
    const matchFilter = filter === 'all' || d.status === filter;
    const matchSearch = d.version.toLowerCase().includes(search.toLowerCase()) ||
      d.deployer.toLowerCase().includes(search.toLowerCase()) ||
      d.description.toLowerCase().includes(search.toLowerCase()) ||
      d.commit.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const successRate    = stats?.successRate || 0;
  const avgDuration    = formatDuration(stats?.avgDurationSec || 0);
  const lastRunStatus  = deployments[0]?.status;

  const vars = isDark
    ? `--hist-bg:#050d1a;--hist-text:#e2e8f0;--hist-muted:#64748b;--hist-card-bg:rgba(15,23,42,0.95);--hist-border:rgba(6,182,212,0.15);--hist-pipeline-bg:rgba(6,182,212,0.04);--hist-file-bg:rgba(255,255,255,0.04);`
    : `--hist-bg:transparent;--hist-text:#0f172a;--hist-muted:#64748b;--hist-card-bg:rgba(255,255,255,0.9);--hist-border:rgba(6,182,212,0.25);--hist-pipeline-bg:rgba(6,182,212,0.04);--hist-file-bg:rgba(6,182,212,0.06);`;

  return (
    <div className="hist-root">
      <style>{CSS}</style>
      <style>{`:root { ${vars} }`}</style>

      {isDark && (
        <div className="hist-circuit" aria-hidden="true">
          <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
            <g stroke="#06b6d4" strokeWidth="1" fill="none" opacity="0.07">
              <path d="M0 200 H400 V100 H800 V300 H1200 V150 H1440"/>
              <path d="M0 500 H200 V400 H600 V600 H1000 V450 H1440"/>
              <circle cx="400" cy="100" r="3" fill="#06b6d4"/>
              <circle cx="800" cy="300" r="3" fill="#06b6d4"/>
              <circle cx="600" cy="600" r="3" fill="#8b5cf6"/>
            </g>
          </svg>
        </div>
      )}

      {/* Search bar */}
      <div className="hist-search-wrap">
        <div className="hist-search">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--hist-muted)', flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            placeholder="Search by commit, branch, deployer..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {/* Filter buttons */}
        {['all', 'success', 'failed', 'running'].map(f => (
          <button key={f} className="hist-filter-btn"
            style={{ width: 'auto', padding: '0 12px', fontSize: 12, fontWeight: 600,
              color: filter === f ? '#06b6d4' : 'var(--hist-muted)',
              borderColor: filter === f ? '#06b6d4' : 'var(--hist-border)',
            }}
            onClick={() => setFilter(f)}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Stats bar */}
      {!error && (
        <div className="hist-stats">
          {/* Last Deploy */}
          <div className="hist-stat-section" style={{ flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2"><path d="M4.5 16.5c-1.5 1-1.5 2.5-1 3.5 1 0 2.5 0 3.5-1l7-7-3-3-6.5 7.5z"/><path d="M19 3a2 2 0 0 1 2 2c0 3-3 6-8 8l-3-3c2-5 5-8 8-8z"/></svg>
              </div>
              <div>
                <div className="hist-stat-label">Last Deploy</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                  {loading ? <span style={{ fontSize: 11, color: 'var(--hist-muted)' }}>Loading...</span> : (
                    <span className={`hist-stat-badge ${lastRunStatus === 'success' ? 'ok' : lastRunStatus === 'failed' ? 'failed' : 'ok'}`}>
                      {lastRunStatus || '—'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Success Rate */}
          <div className="hist-stat-section" style={{ gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              <div>
                <div className="hist-stat-value">{loading ? '—' : successRate}<sup>%</sup></div>
                <div className="hist-stat-sub">Success Rate</div>
              </div>
            </div>
            <svg className="hist-mini-chart" viewBox="0 0 80 30" preserveAspectRatio="none">
              <polyline points="0,25 15,18 30,20 45,10 60,14 75,6" fill="none" stroke="#22c55e" strokeWidth="1.5"/>
            </svg>
          </div>

          {/* Avg Deploy Time */}
          <div className="hist-stat-section" style={{ gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <div>
                <div className="hist-stat-value" style={{ fontSize: 20 }}>{loading ? '—' : avgDuration}</div>
                <div className="hist-stat-sub">Avg Deploy Time</div>
              </div>
            </div>
            <svg className="hist-mini-chart" viewBox="0 0 80 30" preserveAspectRatio="none">
              <polyline points="0,20 15,15 30,22 45,12 60,18 75,10" fill="none" stroke="#06b6d4" strokeWidth="1.5"/>
            </svg>
          </div>

          {/* Total Runs */}
          <div className="hist-stat-section" style={{ gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>
              <div>
                <div className="hist-stat-label">Total Runs</div>
                <div className="hist-stat-value" style={{ fontSize: 20 }}>{loading ? '—' : stats?.totalRuns || 0}</div>
              </div>
            </div>
            <svg className="hist-mini-chart" viewBox="0 0 80 30" preserveAspectRatio="none">
              <polyline points="0,22 20,20 40,15 55,18 70,10 80,14" fill="none" stroke="#8b5cf6" strokeWidth="1.5"/>
            </svg>
          </div>
        </div>
      )}

      {/* Section title */}
      <div className="hist-section-title">
        Deployment Timeline
        <button className="hist-refresh-btn" onClick={fetchHistory}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="hist-error">
          <AlertCircle size={16} style={{ flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 700 }}>
              {error?.includes('401') || error?.includes('credentials') ? 'Token GitHub expiré' : 'Pipeline non configuré'}
            </div>
            <div style={{ opacity: 0.8, marginTop: 2 }}>{error}</div>
            <div style={{ opacity: 0.6, marginTop: 4, fontSize: 11 }}>
              {error?.includes('401') || error?.includes('credentials')
                ? 'Token expiré/révoqué — générez un nouveau token sur github.com/settings/tokens (scopes : repo + workflow) et mettez-le à jour via Manage VPS.'
                : 'Configurez GitHub repo + token via le bouton Manage de votre VPS.'
              }
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && !error && (
        <div className="hist-loading">
          <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', color: '#06b6d4' }} />
          Chargement depuis GitHub Actions...
        </div>
      )}

      {/* Empty */}
      {!loading && !error && filtered.length === 0 && (
        <div className="hist-empty">
          {search || filter !== 'all' ? 'No results matching your search.' : 'No deployments found.'}
        </div>
      )}

      {/* Deploy cards */}
      {!loading && !error && filtered.map((deploy) => (
        <div key={deploy.id} className={`hist-card ${deploy.status}`}>

          <div className="hist-card-sparkline">
            <Sparkline
              color={deploy.status === 'failed' ? '#dc2626' : deploy.status === 'running' ? '#3b82f6' : '#06b6d4'}
              points={deploy.status === 'failed'
                ? '0,8 20,12 40,10 60,20 80,25 100,28 120,26'
                : '0,25 20,18 40,22 60,10 80,15 100,8 120,12'}
            />
          </div>

          {/* Top */}
          <div className="hist-card-top">
            <div className="hist-card-left">
              <div className="hist-version-row">
                <div className={`hist-status-dot ${deploy.status}`}>
                  {deploy.status === 'success' && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                  {deploy.status === 'failed'  && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>}
                  {deploy.status === 'running' && <Loader2 size={12} color="white" style={{ animation: 'spin 1s linear infinite' }} />}
                  {deploy.status === 'cancelled' && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>}
                </div>
                <span className="hist-version">{deploy.version}</span>
                <span className="hist-date">{deploy.date}</span>
              </div>

              <div className="hist-deployer">
                Deployed by: <strong>{deploy.deployer}</strong>
              </div>

              <div className="hist-desc-row">
                <span style={{ fontSize: 13, color: 'var(--hist-muted)', marginTop: 1 }}>📄</span>
                <span className="hist-desc">{deploy.description}</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
              {deploy.status === 'success' && (
                <button className="hist-rollback-btn" onClick={() => setRollbackTarget(deploy)}>
                  Rollback
                </button>
              )}
              <a href={deploy.url} target="_blank" rel="noreferrer" className="hist-gh-btn">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
                View on GitHub
              </a>
            </div>
          </div>

          {/* Meta */}
          <div className="hist-meta-row">
            <div className="hist-meta-item">
              <span className="hist-meta-label">Commit:</span>
              <span className="hist-meta-tag">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><line x1="12" y1="3" x2="12" y2="9"/><line x1="12" y1="15" x2="12" y2="21"/></svg>
                {deploy.commit}
              </span>
            </div>
            <div className="hist-meta-item">
              <span className="hist-meta-label">Branch:</span>
              <span className="hist-meta-tag" style={{ color: '#22c55e' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>
                {deploy.branch}
              </span>
            </div>
            <div className="hist-divider-v" />
            <div className="hist-meta-item">
              <span className="hist-meta-label">Duration:</span>
              <div className="hist-meta-val">{deploy.duration}</div>
            </div>
          </div>

          {/* Pipeline */}
          <div className="hist-pipeline">
            {deploy.pipeline.map((step, i) => (
              <span key={step} className={`hist-pipe-step ${
                deploy.status === 'running' && i === deploy.pipeline.length - 1 ? 'active' :
                deploy.status === 'failed'  && i === deploy.pipeline.length - 1 ? 'fail' : 'done'
              }`}>
                <span style={{ fontSize: 11 }}>{PIPE_ICONS[step] || '●'}</span>
                {step}
              </span>
            ))}
            <div className="hist-pipe-bar" />
          </div>
        </div>
      ))}

      {/* Modals */}
      {showDiff && selectedDeploy && (
        <DiffViewer
          deployment={selectedDeploy as any}
          onClose={() => { setShowDiff(false); setSelectedDeploy(null); }}
        />
      )}
      {rollbackTarget && (
        <RollbackModal
          deployment={rollbackTarget as any}
          onClose={() => setRollbackTarget(null)}
          onConfirm={() => setRollbackTarget(null)}
        />
      )}
    </div>
  );
}