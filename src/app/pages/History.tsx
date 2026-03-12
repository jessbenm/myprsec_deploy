import { useState } from 'react';
import { useTheme } from '../theme-context';
import DiffViewer from '../components/DiffViewer';
import RollbackModal from '../components/RollbackModal';

const deployments = [
  {
    id: 1,
    version: 'v1.2.4',
    date: 'Today 14:32',
    deployer: 'Yasmine',
    commit: 'a7f9c21',
    branch: 'main',
    description: 'Fix authentication bug',
    subDescription: 'Add rate limiting',
    tests: { passed: 67, total: 69 },
    duration: '4m 32s',
    status: 'success',
    pipeline: ['Push', 'Build', 'Tests', 'Deploy'],
    changes: [
      { file: 'src/api/server.js', additions: 12, deletions: 0 },
      { file: 'docker-compose.yml', additions: 0, deletions: 4 },
    ],
    containers: [],
  },
  {
    id: 2,
    version: 'v1.2.3',
    date: 'Yesterday 10:15',
    deployer: 'Mohammed',
    commit: 'of746a1',
    branch: 'main',
    description: 'Refactor login endpoint',
    subDescription: '',
    tests: { passed: 69, total: 69 },
    duration: '3m 58s',
    status: 'success',
    pipeline: ['Push', 'Build', 'Tests', 'Deploy'],
    changes: [
      { file: 'src/api/server.js', additions: 12, deletions: 4 },
      { file: 'docker-compose.yml', additions: 0, deletions: 0 },
    ],
    containers: ['api', 'worker', 'nginx'],
  },
  {
    id: 3,
    version: 'v1.2.2',
    date: '3 days ago',
    deployer: 'Auto-rollback',
    commit: 'b3e1f00',
    branch: 'main',
    description: 'Build error: Missing dependency',
    subDescription: '@types/react',
    tests: { passed: 0, total: 69 },
    duration: '1m 12s',
    status: 'failed',
    pipeline: ['Push', 'Build'],
    changes: [],
    containers: [],
  },
  {
    id: 4,
    version: 'v1.2.1',
    date: '5 days ago',
    deployer: 'Yasmine',
    commit: 'c9d2a44',
    branch: 'main',
    description: 'Add product API endpoints',
    subDescription: '',
    tests: { passed: 69, total: 69 },
    duration: '4m 05s',
    status: 'success',
    pipeline: ['Push', 'Build', 'Tests', 'Deploy'],
    changes: [
      { file: 'src/api/products.ts', additions: 30, deletions: 15 },
    ],
    containers: [],
  },
];

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

  .hist-root {
    font-family: 'Inter', sans-serif;
    min-height: 100vh;
    background: var(--hist-bg);
    color: var(--hist-text);
    position: relative;
    overflow: hidden;
    padding: 20px 24px;
  }

  /* ── Search bar ── */
  .hist-search-wrap {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 20px;
    position: relative;
    z-index: 1;
  }
  .hist-search {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--hist-card-bg);
    border: 1px solid var(--hist-border);
    border-radius: 10px;
    padding: 10px 16px;
  }
  .hist-search input {
    background: transparent;
    border: none;
    outline: none;
    font-size: 14px;
    color: var(--hist-text);
    font-family: 'Inter', sans-serif;
    width: 100%;
    letter-spacing: -0.01em;
  }
  .hist-search input::placeholder { color: var(--hist-muted); }
  .hist-filter-btn {
    width: 40px; height: 40px;
    border-radius: 10px;
    background: var(--hist-card-bg);
    border: 1px solid var(--hist-border);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
    color: var(--hist-muted);
    transition: all 0.2s;
    flex-shrink: 0;
  }
  .hist-filter-btn:hover { border-color: #06b6d4; color: #06b6d4; }

  /* ── Stats bar ── */
  .hist-stats {
    display: flex;
    align-items: center;
    background: var(--hist-card-bg);
    border: 1px solid var(--hist-border);
    border-radius: 14px;
    padding: 10px 20px;
    margin-bottom: 20px;
    gap: 0;
    position: relative;
    z-index: 1;
    overflow: hidden;
  }
  .hist-stats::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 14px;
    padding: 1px;
    background: linear-gradient(135deg, rgba(6,182,212,0.3), rgba(139,92,246,0.2), transparent 60%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    pointer-events: none;
  }
  .hist-stat-section {
    display: flex;
    align-items: center;
    gap: 14px;
    flex: 1;
    padding: 0 20px;
    border-right: 1px solid var(--hist-border);
  }
  .hist-stat-section:first-child { padding-left: 0; }
  .hist-stat-section:last-child { border-right: none; padding-right: 0; }
  .hist-stat-icon {
    width: 36px; height: 36px;
    border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    font-size: 14px;
    flex-shrink: 0;
  }
  .hist-stat-label {
    font-size: 11px;
    color: #06b6d4;
    font-weight: 600;
    letter-spacing: -0.01em;
    margin-bottom: 2px;
  }
  .hist-stat-sub {
    font-size: 10px;
    color: var(--hist-muted);
    letter-spacing: -0.01em;
  }
  .hist-stat-value {
    font-size: 26px;
    font-weight: 700;
    color: var(--hist-text);
    line-height: 1;
    font-family: 'Inter', monospace;
  }
  .hist-stat-value sup {
    font-size: 14px;
    vertical-align: super;
  }
  .hist-stat-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 99px;
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  .hist-stat-badge.failed {
    background: rgba(220,38,38,0.2);
    border: 1px solid rgba(220,38,38,0.4);
    color: #f87171;
  }
  .hist-mini-chart {
    flex: 1;
    height: 40px;
    opacity: 0.5;
  }

  /* ── Section title ── */
  .hist-section-title {
    font-size: 18px;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--hist-text);
    margin-bottom: 16px;
    position: relative;
    z-index: 1;
  }

  /* ── Deploy card ── */
  .hist-card {
    background: var(--hist-card-bg);
    border: 1px solid var(--hist-border);
    border-radius: 14px;
    margin-bottom: 16px;
    overflow: hidden;
    position: relative;
    z-index: 1;
    transition: border-color 0.2s;
  }
  .hist-card:hover { border-color: rgba(6,182,212,0.4); }
  .hist-card.failed { border-color: rgba(220,38,38,0.3); }
  .hist-card.failed:hover { border-color: rgba(220,38,38,0.6); }
  .hist-card::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 14px;
    padding: 1px;
    background: linear-gradient(135deg, rgba(6,182,212,0.25), rgba(139,92,246,0.15), transparent 50%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    pointer-events: none;
  }

  /* sparkline top-right */
  .hist-card-sparkline {
    position: absolute;
    top: 12px; right: 140px;
    width: 120px; height: 30px;
    opacity: 0.3;
    pointer-events: none;
  }

  .hist-card-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 16px 18px 12px;
    gap: 16px;
  }
  .hist-card-left { flex: 1; }

  .hist-version-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 4px;
  }
  .hist-status-dot {
    width: 24px; height: 24px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .hist-status-dot.success { background: #16a34a; box-shadow: 0 0 10px rgba(22,163,74,0.5); }
  .hist-status-dot.failed { background: #dc2626; box-shadow: 0 0 10px rgba(220,38,38,0.5); }

  .hist-version {
    font-size: 18px;
    font-weight: 700;
    color: var(--hist-text);
    font-family: 'Inter', monospace;
  }
  .hist-date {
    font-size: 13px;
    color: #06b6d4;
    font-weight: 500;
    letter-spacing: -0.01em;
  }
  .hist-deployer {
    font-size: 13px;
    color: var(--hist-muted);
    margin-bottom: 10px;
    letter-spacing: -0.01em;
  }
  .hist-deployer strong { color: var(--hist-text); font-weight: 700; }

  .hist-desc-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 4px;
  }
  .hist-desc-icon { font-size: 13px; margin-top: 1px; color: var(--hist-muted); }
  .hist-desc {
    font-size: 13px;
    color: var(--hist-text);
    font-weight: 500;
    letter-spacing: -0.01em;
  }
  .hist-desc-sub {
    font-size: 12px;
    color: #22c55e;
    font-weight: 600;
    letter-spacing: -0.01em;
    margin-left: 21px;
  }

  /* meta row */
  .hist-meta-row {
    display: flex;
    align-items: center;
    gap: 24px;
    padding: 0 18px 14px;
  }
  .hist-meta-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .hist-meta-label {
    font-size: 11px;
    color: var(--hist-muted);
    letter-spacing: -0.01em;
  }
  .hist-meta-val {
    font-size: 22px;
    font-weight: 700;
    color: var(--hist-text);
    font-family: 'Inter', monospace;
    line-height: 1.1;
  }
  .hist-meta-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    font-weight: 700;
    color: #06b6d4;
    font-family: 'Inter', monospace;
    letter-spacing: -0.01em;
  }

  .hist-divider-v {
    width: 1px;
    height: 36px;
    background: var(--hist-border);
    flex-shrink: 0;
  }

  /* avatars */
  .hist-avatars {
    display: flex;
    align-items: center;
    gap: -4px;
  }
  .hist-avatar {
    width: 22px; height: 22px;
    border-radius: 50%;
    border: 2px solid var(--hist-card-bg);
    margin-left: -6px;
    display: flex; align-items: center; justify-content: center;
    font-size: 10px; font-weight: 700; color: #fff;
  }
  .hist-avatar:first-child { margin-left: 0; }
  .hist-avatar.a1 { background: #2563eb; }
  .hist-avatar.a2 { background: #06b6d4; }
  .hist-avatar.a3 { background: #8b5cf6; }

  /* rollback btn */
  .hist-rollback-btn {
    padding: 8px 20px;
    background: linear-gradient(135deg, #ea580c, #dc2626);
    border: none;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 700;
    color: #fff;
    cursor: pointer;
    font-family: 'Inter', sans-serif;
    letter-spacing: -0.01em;
    transition: all 0.2s;
    box-shadow: 0 4px 14px rgba(234,88,12,0.35);
    flex-shrink: 0;
    align-self: flex-start;
    margin-top: 2px;
  }
  .hist-rollback-btn:hover {
    box-shadow: 0 4px 20px rgba(234,88,12,0.55);
    transform: translateY(-1px);
  }

  /* pipeline row */
  .hist-pipeline {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 18px;
    background: var(--hist-pipeline-bg);
    border-top: 1px solid var(--hist-border);
    border-bottom: 1px solid var(--hist-border);
  }
  .hist-pipe-step {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--hist-muted);
  }
  .hist-pipe-step.done { color: #22c55e; }
  .hist-pipe-step.fail { color: #dc2626; }
  .hist-pipe-icon { font-size: 11px; }
  .hist-pipe-bar {
    flex: 1;
    height: 3px;
    background: linear-gradient(90deg, #22c55e, #06b6d4, #8b5cf6, #22c55e);
    background-size: 200% 100%;
    border-radius: 99px;
    margin: 0 8px;
    animation: hist-pipe-flow 3s linear infinite;
    opacity: 0.6;
  }
  @keyframes hist-pipe-flow {
    0% { background-position: 0% 0%; }
    100% { background-position: 200% 0%; }
  }

  /* changes row */
  .hist-changes {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 18px;
    font-size: 12px;
    flex-wrap: wrap;
  }
  .hist-changes-label {
    font-weight: 700;
    color: var(--hist-text);
    letter-spacing: -0.01em;
    margin-right: 2px;
  }
  .hist-file-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: var(--hist-file-bg);
    border: 1px solid var(--hist-border);
    border-radius: 6px;
    padding: 2px 8px;
    font-family: 'Inter', monospace;
    font-size: 11px;
    color: var(--hist-text);
    cursor: pointer;
    transition: border-color 0.2s;
  }
  .hist-file-tag:hover { border-color: #06b6d4; }
  .hist-add-badge {
    color: #22c55e; font-weight: 700; font-size: 12px;
  }
  .hist-del-badge {
    color: #dc2626; font-weight: 700; font-size: 12px;
  }
  .hist-changes-arrow {
    margin-left: auto;
    color: var(--hist-muted);
    cursor: pointer;
    display: flex; align-items: center;
    transition: color 0.2s;
  }
  .hist-changes-arrow:hover { color: #06b6d4; }

  .hist-containers-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 18px;
    background: var(--hist-pipeline-bg);
    border-top: 1px solid var(--hist-border);
    font-size: 12px;
    color: var(--hist-muted);
    letter-spacing: -0.01em;
  }
  .hist-containers-label { font-weight: 700; color: var(--hist-text); }
  .hist-container-name {
    color: #06b6d4;
    font-family: 'Inter', monospace;
    font-weight: 600;
    font-size: 12px;
  }

  /* circuit bg */
  .hist-circuit {
    position: absolute; inset: 0;
    pointer-events: none; z-index: 0; overflow: hidden;
  }
  .hist-circuit svg { width: 100%; height: 100%; }
`;

// Simple sparkline SVG
function Sparkline({ color = '#06b6d4', points = '0,25 20,18 40,22 60,10 80,15 100,8 120,12' }) {
  return (
    <svg viewBox="0 0 120 30" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      {points.split(' ').map((p, i) => {
        const [x, y] = p.split(',');
        return <circle key={i} cx={x} cy={y} r="2" fill={color} />;
      })}
    </svg>
  );
}

const PIPE_ICONS: Record<string, string> = {
  Push: '⬆',
  Build: '⊕',
  Tests: '✓',
  Deploy: '⚑',
};

export default function History() {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedDeploy, setSelectedDeploy] = useState<number | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [rollbackTarget, setRollbackTarget] = useState<typeof deployments[0] | null>(null);
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const filtered = deployments.filter(d => {
    const matchFilter = filter === 'all' || d.status === filter;
    const matchSearch = d.version.toLowerCase().includes(search.toLowerCase()) ||
      d.deployer.toLowerCase().includes(search.toLowerCase()) ||
      d.description.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const successCount = deployments.filter(d => d.status === 'success').length;
  const successRate = Math.round((successCount / deployments.length) * 100);

  const vars = isDark
    ? `--hist-bg:#050d1a;--hist-text:#e2e8f0;--hist-muted:#64748b;--hist-card-bg:rgba(15,23,42,0.95);--hist-border:rgba(6,182,212,0.15);--hist-pipeline-bg:rgba(6,182,212,0.04);--hist-file-bg:rgba(255,255,255,0.04);`
    : `--hist-bg:transparent;--hist-text:#0f172a;--hist-muted:#64748b;--hist-card-bg:rgba(255,255,255,0.9);--hist-border:rgba(6,182,212,0.25);--hist-pipeline-bg:rgba(6,182,212,0.04);--hist-file-bg:rgba(6,182,212,0.06);`;

  return (
    <div className="hist-root" style={{ ['--hist-bg' as any]: '', cssText: vars } as any}>
      <style>{CSS}</style>
      <style>{`:root { ${vars} }`}</style>

      {/* Circuit bg — dark only */}
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
            placeholder="Search deloys..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button className="hist-filter-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Stats bar */}
      <div className="hist-stats">
        {/* Deploys Today */}
        <div className="hist-stat-section" style={{ flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="hist-stat-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2"><path d="M4.5 16.5c-1.5 1-1.5 2.5-1 3.5 1 0 2.5 0 3.5-1l7-7-3-3-6.5 7.5z"/><path d="M19 3a2 2 0 0 1 2 2c0 3-3 6-8 8l-3-3c2-5 5-8 8-8z"/><circle cx="17" cy="7" r="1" fill="#06b6d4"/></svg>
              </div>
            <div>
              <div className="hist-stat-label">Deploys Today</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                <span style={{ fontSize: 12, color: '#06b6d4', fontWeight: 600 }}>Build</span>
                <span className="hist-stat-badge failed">Failed</span>
              </div>
            </div>
          </div>
        </div>

        {/* Success Rate */}
        <div className="hist-stat-section" style={{ gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            <div>
              <div className="hist-stat-value">{successRate}<sup>%</sup></div>
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
              <div className="hist-stat-value" style={{ fontSize: 20 }}>3m 45s</div>
              <div className="hist-stat-sub">Avg Deploy Time</div>
            </div>
          </div>
          <svg className="hist-mini-chart" viewBox="0 0 80 30" preserveAspectRatio="none">
            <polyline points="0,20 15,15 30,22 45,12 60,18 75,10" fill="none" stroke="#06b6d4" strokeWidth="1.5"/>
          </svg>
        </div>

        {/* Rollbacks */}
        <div className="hist-stat-section" style={{ gap: 10, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>
            <div>
              <div className="hist-stat-label">Rollbacks</div>
              <div className="hist-stat-value" style={{ fontSize: 20 }}>1</div>
            </div>
          </div>
          <svg className="hist-mini-chart" viewBox="0 0 80 30" preserveAspectRatio="none">
            <polyline points="0,22 20,20 40,15 55,18 70,10 80,14" fill="none" stroke="#8b5cf6" strokeWidth="1.5"/>
          </svg>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--hist-muted)', flexShrink: 0 }}>
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </div>
      </div>

      {/* Section title */}
      <div className="hist-section-title">Deployment Timeline</div>

      {/* Deploy cards */}
      {filtered.map((deploy) => (
        <div key={deploy.id} className={`hist-card ${deploy.status === 'failed' ? 'failed' : ''}`}>

          {/* Sparkline top-right */}
          <div className="hist-card-sparkline">
            <Sparkline
              color={deploy.status === 'failed' ? '#dc2626' : '#06b6d4'}
              points={deploy.status === 'failed'
                ? '0,8 20,12 40,10 60,20 80,25 100,28 120,26'
                : '0,25 20,18 40,22 60,10 80,15 100,8 120,12'}
            />
          </div>

          {/* Top section */}
          <div className="hist-card-top">
            <div className="hist-card-left">
              <div className="hist-version-row">
                <div className={`hist-status-dot ${deploy.status}`}>
                  {deploy.status === 'success'
                    ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                    : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  }
                </div>
                <span className="hist-version">{deploy.version}</span>
                <span className="hist-date">{deploy.date}</span>
              </div>

              <div className="hist-deployer">
                Deployed by: <strong>{deploy.deployer}</strong>
              </div>

              <div className="hist-desc-row">
                <span className="hist-desc-icon">📄</span>
                <span className="hist-desc">{deploy.description}</span>
              </div>
              {deploy.subDescription && (
                <div className="hist-desc-sub">{deploy.subDescription}</div>
              )}
            </div>

            {deploy.status === 'success' && (
              <button className="hist-rollback-btn" onClick={() => setRollbackTarget(deploy)}>
                Rollback
              </button>
            )}
          </div>

          {/* Meta row: duration, commit, branch, avatars */}
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
            <div className="hist-meta-item" style={{ marginLeft: 4 }}>
              <div className="hist-avatars">
                <div className="hist-avatar a1">Y</div>
                <div className="hist-avatar a2">M</div>
                <div className="hist-avatar a3">+</div>
              </div>
            </div>
            <div className="hist-divider-v" />
            <div className="hist-meta-item">
              <div className="hist-meta-val">{deploy.duration}</div>
            </div>
          </div>

          {/* Pipeline bar */}
          <div className="hist-pipeline">
            {deploy.pipeline.map((step, i) => (
              <span key={step} className={`hist-pipe-step ${deploy.status === 'failed' && i === deploy.pipeline.length - 1 ? 'fail' : 'done'}`}>
                <span className="hist-pipe-icon">{PIPE_ICONS[step] || '●'}</span>
                {step}
              </span>
            ))}
            <div className="hist-pipe-bar" />
          </div>

          {/* Changes row */}
          {deploy.changes.length > 0 && (
            <div className="hist-changes">
              <span className="hist-changes-label">Changes:</span>
              {deploy.changes.map((c, i) => (
                <span key={i} className="hist-file-tag">
                  📄 {c.file}
                </span>
              ))}
              {deploy.changes.some(c => c.additions > 0) && (
                <span className="hist-add-badge">
                  + {deploy.changes.reduce((s, c) => s + c.additions, 0)}
                </span>
              )}
              {deploy.changes.some(c => c.deletions > 0) && (
                <span className="hist-del-badge">
                  - {deploy.changes.reduce((s, c) => s + c.deletions, 0)}
                </span>
              )}
              <span
                className="hist-changes-arrow"
                onClick={() => { setSelectedDeploy(deploy.id); setShowDiff(true); }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </span>
            </div>
          )}

          {/* Containers row */}
          {deploy.containers.length > 0 && (
            <div className="hist-containers-row">
              <span className="hist-changes-label">Changes:</span>
              <span style={{ color: 'var(--hist-muted)' }}>Updated {deploy.containers.length} containers:</span>
              {deploy.containers.map((c, i) => (
                <span key={i} className="hist-container-name">{c}{i < deploy.containers.length - 1 ? ',' : ''}</span>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Modals */}
      {showDiff && selectedDeploy && (
        <DiffViewer
          deployment={deployments.find(d => d.id === selectedDeploy)!}
          onClose={() => { setShowDiff(false); setSelectedDeploy(null); }}
        />
      )}
      {rollbackTarget && (
        <RollbackModal
          deployment={rollbackTarget}
          onClose={() => setRollbackTarget(null)}
          onConfirm={() => setRollbackTarget(null)}
        />
      )}
    </div>
  );
}