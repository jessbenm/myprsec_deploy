import { useState } from 'react';
import { Settings } from 'lucide-react';
import { useTheme } from '../theme-context';
import Terminal from '../components/Terminal';
import CostEstimator from '../components/CostEstimator';

const servers = [
  {
    id: 1,
    name: 'VPS Staging',
    ip: '173.212.248.243',
    ram: { used: 85, total: 100 },
    cpu: 35,
    containers: { running: 6, total: 6 },
    status: 'healthy',
  },
  {
    id: 2,
    name: 'VPS Production',
    ip: '185.199.108.153',
    ram: { used: 55, total: 100 },
    cpu: 40,
    containers: { running: 6, total: 6 },
    status: 'healthy',
  },
];

export default function Servers() {
  const [selectedServer, setSelectedServer] = useState<typeof servers[0] | null>(null);
  const [showTerminal, setShowTerminal] = useState(false);
  const [showCostEstimator, setShowCostEstimator] = useState(false);
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const getRamColor = (pct: number) => (pct > 80 ? '#f59e0b' : '#22c55e');

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&display=swap');

    .srv-root {
      font-family: 'Rajdhani', sans-serif;
      min-height: 100vh;
      color: ${isDark ? '#e2e8f0' : '#0f172a'};
      background: ${isDark ? '#050d1a' : 'transparent'};
      position: relative;
      overflow: hidden;
      padding: 28px;
    }

    /* ambient glow */
    .srv-root::before {
      content: '';
      position: absolute;
      inset: 0;
      background: ${isDark
        ? `radial-gradient(ellipse 80% 50% at 20% 20%, rgba(6,182,212,0.07) 0%, transparent 60%),
           radial-gradient(ellipse 60% 60% at 80% 80%, rgba(139,92,246,0.07) 0%, transparent 60%),
           repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(6,182,212,0.015) 2px, rgba(6,182,212,0.015) 4px),
           repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(6,182,212,0.015) 2px, rgba(6,182,212,0.015) 4px)`
        : 'none'
      };
      pointer-events: none;
      z-index: 0;
    }

    .srv-circuit {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 0;
      overflow: hidden;
    }
    .srv-circuit svg { width: 100%; height: 100%; }

    /* header */
    .srv-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 28px;
      position: relative;
      z-index: 1;
    }
    .srv-title {
      font-size: 26px;
      font-weight: 700;
      letter-spacing: 0.03em;
      background: ${isDark
        ? 'linear-gradient(90deg, #e2e8f0, #94a3b8)'
        : 'linear-gradient(90deg, #0f172a, #1e40af)'};
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .srv-cost-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      background: ${isDark ? 'rgba(37,99,235,0.15)' : 'rgba(37,99,235,0.1)'};
      border: 1px solid ${isDark ? 'rgba(37,99,235,0.4)' : 'rgba(37,99,235,0.5)'};
      border-radius: 10px;
      padding: 8px 18px;
      font-size: 14px;
      font-weight: 600;
      color: ${isDark ? '#93c5fd' : '#1d4ed8'};
      cursor: pointer;
      transition: all 0.2s;
      font-family: 'Rajdhani', sans-serif;
      letter-spacing: 0.04em;
    }
    .srv-cost-btn:hover {
      background: rgba(37,99,235,0.25);
      border-color: rgba(37,99,235,0.8);
      box-shadow: 0 0 16px rgba(37,99,235,0.25);
      color: ${isDark ? '#fff' : '#1e3a8a'};
    }

    /* grid */
    .srv-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
      position: relative;
      z-index: 1;
    }

    /* server card */
    .srv-card {
      background: ${isDark
        ? 'linear-gradient(145deg, rgba(15,23,42,0.95), rgba(10,18,35,0.98))'
        : 'linear-gradient(145deg, rgba(255,255,255,0.85), rgba(224,236,255,0.9))'};
      border: 1px solid ${isDark ? 'rgba(6,182,212,0.2)' : 'rgba(6,182,212,0.35)'};
      border-radius: 16px;
      padding: 22px;
      position: relative;
      overflow: hidden;
      transition: all 0.3s;
      backdrop-filter: blur(8px);
      box-shadow: ${isDark ? 'none' : '0 4px 24px rgba(6,182,212,0.08), 0 1px 4px rgba(0,0,0,0.06)'};
    }
    .srv-card::before {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: 16px;
      padding: 1px;
      background: ${isDark
        ? 'linear-gradient(135deg, rgba(6,182,212,0.4), rgba(139,92,246,0.2), transparent 60%)'
        : 'linear-gradient(135deg, rgba(6,182,212,0.5), rgba(139,92,246,0.3), transparent 60%)'};
      -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
      -webkit-mask-composite: xor;
      mask-composite: exclude;
      pointer-events: none;
    }
    .srv-card::after {
      content: '';
      position: absolute;
      bottom: -40px; right: -40px;
      width: 120px; height: 120px;
      background: ${isDark
        ? 'radial-gradient(circle, rgba(6,182,212,0.08), transparent 70%)'
        : 'radial-gradient(circle, rgba(6,182,212,0.12), transparent 70%)'};
      pointer-events: none;
    }
    .srv-card:hover {
      border-color: rgba(6,182,212,0.6);
      box-shadow: ${isDark
        ? '0 0 30px rgba(6,182,212,0.15), 0 8px 32px rgba(0,0,0,0.4)'
        : '0 0 30px rgba(6,182,212,0.2), 0 8px 32px rgba(6,182,212,0.1)'};
      transform: translateY(-2px);
    }

    .srv-card-icon {
      width: 46px; height: 46px;
      border-radius: 12px;
      background: ${isDark
        ? 'linear-gradient(135deg, rgba(6,182,212,0.2), rgba(37,99,235,0.2))'
        : 'linear-gradient(135deg, rgba(6,182,212,0.2), rgba(37,99,235,0.15))'};
      border: 1px solid rgba(6,182,212,0.4);
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
      color: #06b6d4;
    }
    .srv-card-head {
      display: flex; align-items: center; gap: 12px; margin-bottom: 18px;
    }
    .srv-card-name {
      font-size: 16px; font-weight: 700; letter-spacing: 0.02em;
      color: ${isDark ? '#e2e8f0' : '#0f172a'};
    }
    .srv-card-ip {
      font-size: 12px;
      color: ${isDark ? '#475569' : '#64748b'};
      font-family: 'Share Tech Mono', monospace;
      margin-top: 2px;
    }

    .srv-metric { margin-bottom: 12px; }
    .srv-metric-labels {
      display: flex; justify-content: space-between;
      font-size: 13px;
      color: ${isDark ? '#64748b' : '#475569'};
      margin-bottom: 6px; font-weight: 500; letter-spacing: 0.04em;
    }
    .srv-metric-labels span:last-child {
      color: ${isDark ? '#94a3b8' : '#334155'};
      font-family: 'Share Tech Mono', monospace;
    }
    .srv-bar-track {
      height: 5px;
      background: ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(6,182,212,0.12)'};
      border-radius: 99px; overflow: hidden;
    }
    .srv-bar-fill {
      height: 100%; border-radius: 99px; position: relative; transition: width 0.6s ease;
    }
    .srv-bar-fill::after {
      content: ''; position: absolute; right: 0; top: 0; bottom: 0;
      width: 8px; background: rgba(255,255,255,0.5);
      border-radius: 99px; filter: blur(2px);
    }

    .srv-containers {
      display: flex; justify-content: space-between; align-items: center;
      font-size: 13px;
      color: ${isDark ? '#64748b' : '#475569'};
      margin-top: 16px; margin-bottom: 18px; padding-top: 10px;
      border-top: 1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(6,182,212,0.15)'};
      font-weight: 500; letter-spacing: 0.04em;
    }
    .srv-containers-val {
      display: flex; align-items: center; gap: 6px;
      color: ${isDark ? '#e2e8f0' : '#0f172a'}; font-weight: 700;
    }
    .srv-dot {
      width: 8px; height: 8px; background: #22c55e;
      border-radius: 50%; box-shadow: 0 0 8px #22c55e;
    }

    .srv-actions { display: flex; gap: 10px; }
    .srv-btn-manage {
      flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
      padding: 9px;
      background: ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(6,182,212,0.08)'};
      border: 1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(6,182,212,0.3)'};
      border-radius: 8px; font-size: 13px; font-weight: 600;
      color: ${isDark ? '#94a3b8' : '#0e7490'};
      cursor: pointer; transition: all 0.2s;
      font-family: 'Rajdhani', sans-serif; letter-spacing: 0.05em;
    }
    .srv-btn-manage:hover {
      background: ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(6,182,212,0.16)'};
      color: ${isDark ? '#e2e8f0' : '#0f172a'};
    }
    .srv-btn-ssh {
      flex: 1; padding: 9px;
      background: linear-gradient(135deg, #06b6d4, #2563eb);
      border: none; border-radius: 8px; font-size: 13px; font-weight: 700;
      color: #fff; cursor: pointer; transition: all 0.2s;
      font-family: 'Rajdhani', sans-serif; letter-spacing: 0.1em;
      box-shadow: 0 4px 16px rgba(6,182,212,0.3);
    }
    .srv-btn-ssh:hover {
      box-shadow: 0 4px 24px rgba(6,182,212,0.5);
      transform: translateY(-1px);
    }

    /* Add VPS card */
    .srv-add-card {
      background: ${isDark
        ? 'linear-gradient(145deg, rgba(15,23,42,0.6), rgba(10,18,35,0.8))'
        : 'linear-gradient(145deg, rgba(255,255,255,0.6), rgba(224,236,255,0.7))'};
      border: 1.5px dashed ${isDark ? 'rgba(6,182,212,0.25)' : 'rgba(6,182,212,0.4)'};
      border-radius: 16px;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      padding: 22px; cursor: pointer; transition: all 0.3s;
      position: relative; overflow: hidden; min-height: 280px;
      backdrop-filter: blur(8px);
    }
    .srv-add-card:hover {
      border-color: rgba(6,182,212,0.7);
      box-shadow: ${isDark
        ? '0 0 40px rgba(6,182,212,0.12)'
        : '0 0 40px rgba(6,182,212,0.18), 0 8px 32px rgba(6,182,212,0.1)'};
    }
    .srv-add-card::before {
      content: ''; position: absolute; inset: 0;
      background:
        radial-gradient(circle at 30% 70%, rgba(6,182,212,0.07) 0%, transparent 50%),
        radial-gradient(circle at 70% 30%, rgba(139,92,246,0.07) 0%, transparent 50%);
      pointer-events: none;
    }

    /* hologram */
    .srv-holo {
      position: relative; width: 110px; height: 110px;
      display: flex; align-items: center; justify-content: center; margin-bottom: 20px;
    }
    .srv-holo-ring {
      position: absolute; border-radius: 50%;
      border: 1px solid rgba(6,182,212,0.4);
      animation: srv-ring-pulse 3s ease-in-out infinite;
    }
    .srv-holo-ring:nth-child(1) { width: 110px; height: 110px; animation-delay: 0s; }
    .srv-holo-ring:nth-child(2) { width: 85px; height: 85px; animation-delay: 0.6s; border-color: rgba(139,92,246,0.4); }
    .srv-holo-ring:nth-child(3) { width: 62px; height: 62px; animation-delay: 1.2s; }
    @keyframes srv-ring-pulse {
      0%,100% { opacity: 0.3; transform: scale(1); }
      50% { opacity: 0.8; transform: scale(1.04); }
    }
    .srv-holo-ellipse {
      position: absolute; bottom: -10px; width: 80px; height: 18px;
      background: radial-gradient(ellipse, rgba(6,182,212,0.5), rgba(139,92,246,0.3), transparent 70%);
      filter: blur(6px);
      animation: srv-holo-glow 2.5s ease-in-out infinite;
    }
    @keyframes srv-holo-glow {
      0%,100% { opacity: 0.5; }
      50% { opacity: 1; }
    }
    .srv-add-icon {
      width: 54px; height: 54px; border-radius: 14px;
      background: linear-gradient(135deg, rgba(139,92,246,0.35), rgba(6,182,212,0.35));
      border: 1px solid rgba(139,92,246,0.5);
      display: flex; align-items: center; justify-content: center;
      font-size: 26px; box-shadow: 0 0 20px rgba(139,92,246,0.35);
      position: relative; z-index: 1; color: #c4b5fd;
      transition: all 0.3s; line-height: 1;
    }
    .srv-add-card:hover .srv-add-icon {
      box-shadow: 0 0 30px rgba(139,92,246,0.6); transform: scale(1.06);
    }
    .srv-add-title {
      font-size: 17px; font-weight: 700; letter-spacing: 0.03em;
      color: ${isDark ? '#e2e8f0' : '#0f172a'}; margin-bottom: 4px;
    }
    .srv-add-sub {
      font-size: 12px;
      color: ${isDark ? '#475569' : '#64748b'};
      letter-spacing: 0.04em;
    }
  `;

  const circuitColor = isDark ? '#06b6d4' : '#0891b2';
  const circuitOpacity = isDark ? '0.12' : '0';

  return (
    <div className="srv-root">
      <style>{css}</style>

      {/* Circuit background */}
      <div className="srv-circuit" aria-hidden="true">
        <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
          <g stroke={circuitColor} strokeWidth="1" fill="none" opacity={circuitOpacity}>
            <path d="M0 200 H400 V100 H800 V300 H1200 V150 H1440"/>
            <path d="M0 500 H200 V400 H600 V600 H1000 V450 H1440"/>
            <path d="M200 900 V700 H500 V800 H900 V600 H1100 V750 H1440"/>
            <path d="M100 0 V200 H300 V350 H150 V500"/>
            <path d="M700 0 V150 H950 V300 H800 V500 H1050"/>
            <circle cx="400" cy="100" r="4" fill={circuitColor}/>
            <circle cx="800" cy="300" r="4" fill={circuitColor}/>
            <circle cx="600" cy="600" r="4" fill={circuitColor}/>
            <circle cx="200" cy="400" r="3" fill={circuitColor}/>
            <circle cx="950" cy="150" r="3" fill="#8b5cf6"/>
            <circle cx="1200" cy="150" r="4" fill="#8b5cf6"/>
          </g>
        </svg>
      </div>

      {/* Page header */}
      <div className="srv-header">
        <h1 className="srv-title">Server Management</h1>
        <button className="srv-cost-btn" onClick={() => setShowCostEstimator(true)}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="3" width="20" height="14" rx="2"/>
            <path d="M8 21h8M12 17v4"/>
          </svg>
          Cost Estimator
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </button>
      </div>

      {/* Grid */}
      <div className="srv-grid">
        {servers.map((server) => {
          const ramColor = getRamColor(server.ram.used);
          return (
            <div key={server.id} className="srv-card">
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
                  <div className="srv-card-name">{server.name}</div>
                  <div className="srv-card-ip">{server.ip}</div>
                </div>
              </div>

              <div className="srv-metric">
                <div className="srv-metric-labels">
                  <span>RAM</span><span>{server.ram.used}%</span>
                </div>
                <div className="srv-bar-track">
                  <div className="srv-bar-fill" style={{ width: `${server.ram.used}%`, background: `linear-gradient(90deg, ${ramColor}88, ${ramColor})` }} />
                </div>
              </div>

              <div className="srv-metric">
                <div className="srv-metric-labels">
                  <span>CPU</span><span>{server.cpu}%</span>
                </div>
                <div className="srv-bar-track">
                  <div className="srv-bar-fill" style={{ width: `${server.cpu}%`, background: 'linear-gradient(90deg, #2563eb88, #06b6d4)' }} />
                </div>
              </div>

              <div className="srv-containers">
                <span>Containers</span>
                <span className="srv-containers-val">
                  <span className="srv-dot" />
                  {server.containers.running}/{server.containers.total}
                </span>
              </div>

              <div className="srv-actions">
                <button className="srv-btn-manage">
                  <Settings size={13} />
                  Manage
                </button>
                <button className="srv-btn-ssh" onClick={() => { setSelectedServer(server); setShowTerminal(true); }}>
                  SSH
                </button>
              </div>
            </div>
          );
        })}

        {/* Add VPS */}
        <div className="srv-add-card">
          <div className="srv-holo">
            <div className="srv-holo-ring" />
            <div className="srv-holo-ring" />
            <div className="srv-holo-ring" />
            <div className="srv-add-icon">+</div>
            <div className="srv-holo-ellipse" />
          </div>
          <div className="srv-add-title">Add New VPS</div>
          <div className="srv-add-sub">Click to add new server</div>
        </div>
      </div>

      {showTerminal && selectedServer && (
        <Terminal server={selectedServer} onClose={() => { setShowTerminal(false); setSelectedServer(null); }} />
      )}
      {showCostEstimator && (
        <CostEstimator onClose={() => setShowCostEstimator(false)} />
      )}
    </div>
  );
}