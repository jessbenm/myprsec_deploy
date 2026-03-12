import { useState } from 'react';
import { toast } from 'sonner';
import { useTheme } from '../theme-context';

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

  .set-root {
    font-family: 'Inter', sans-serif;
    min-height: 100vh;
    background: var(--set-bg);
    color: var(--set-text);
    position: relative;
    overflow: hidden;
    padding: 24px;
  }

  /* circuit bg dark only */
  .set-circuit {
    position: absolute; inset: 0;
    pointer-events: none; z-index: 0; overflow: hidden;
  }

  /* ── Top quick-stats row ── */
  .set-quickrow {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin-bottom: 24px;
    position: relative; z-index: 1;
  }
  .set-qcard {
    background: var(--set-card);
    border: 1px solid var(--set-border);
    border-radius: 12px;
    padding: 16px 18px;
    display: flex;
    align-items: center;
    gap: 14px;
    position: relative;
    overflow: hidden;
    transition: border-color 0.2s;
  }
  .set-qcard::before {
    content: '';
    position: absolute; inset: 0;
    border-radius: 12px; padding: 1px;
    background: linear-gradient(135deg, rgba(6,182,212,0.3), rgba(139,92,246,0.2), transparent 60%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor; mask-composite: exclude;
    pointer-events: none;
  }
  .set-qcard:hover { border-color: rgba(6,182,212,0.5); }
  .set-qicon {
    width: 40px; height: 40px; border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; font-size: 20px;
  }
  .set-qicon.discord { background: rgba(88,101,242,0.2); border: 1px solid rgba(88,101,242,0.4); }
  .set-qicon.slack   { background: rgba(74,21,75,0.3);   border: 1px solid rgba(229,29,133,0.3); }
  .set-qicon.health  { background: rgba(6,182,212,0.15); border: 1px solid rgba(6,182,212,0.4); }
  .set-qicon.deploy  { background: rgba(34,197,94,0.15); border: 1px solid rgba(34,197,94,0.4); }
  .set-qlabel {
    font-size: 15px; font-weight: 700; color: var(--set-text);
  }
  .set-qsub {
    font-size: 12px; color: var(--set-muted); margin-top: 2px;
  }

  /* ── Main grid ── */
  .set-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    position: relative; z-index: 1;
  }

  /* ── Section card ── */
  .set-card {
    background: var(--set-card);
    border: 1px solid var(--set-border);
    border-radius: 14px;
    padding: 20px;
    position: relative; overflow: hidden;
    transition: border-color 0.2s;
  }
  .set-card::before {
    content: '';
    position: absolute; inset: 0;
    border-radius: 14px; padding: 1px;
    background: linear-gradient(135deg, rgba(6,182,212,0.25), rgba(139,92,246,0.15), transparent 55%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor; mask-composite: exclude;
    pointer-events: none;
  }
  .set-card-title {
    font-size: 16px; font-weight: 700; color: var(--set-text);
    margin-bottom: 16px; letter-spacing: -0.01em;
  }

  /* integration item */
  .set-integration {
    background: var(--set-inner);
    border: 1px solid var(--set-border);
    border-radius: 10px;
    padding: 14px 16px;
    margin-bottom: 10px;
  }
  .set-int-head {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 4px;
  }
  .set-int-name {
    display: flex; align-items: center; gap: 10px;
    font-size: 15px; font-weight: 700; color: var(--set-text);
  }
  .set-int-name span { font-weight: 400; color: var(--set-muted); font-size: 13px; }
  .set-connected-badge {
    font-size: 11px; font-weight: 600; color: #22c55e;
    background: rgba(34,197,94,0.12);
    border: 1px solid rgba(34,197,94,0.3);
    border-radius: 99px; padding: 2px 10px;
  }
  .set-int-status {
    font-size: 12px; color: var(--set-muted); margin-bottom: 10px;
  }
  .set-int-row {
    display: flex; gap: 8px; align-items: center;
  }
  .set-int-input {
    flex: 1;
    background: var(--set-input);
    border: 1px solid var(--set-border);
    border-radius: 8px;
    padding: 7px 12px;
    font-size: 12px;
    color: var(--set-muted);
    font-family: 'Inter', monospace;
    outline: none;
    transition: border-color 0.2s;
  }
  .set-int-input:focus { border-color: #06b6d4; color: var(--set-text); }
  .set-test-btn {
    padding: 7px 18px;
    border-radius: 8px;
    font-size: 13px; font-weight: 600;
    border: none; cursor: pointer;
    font-family: 'Inter', sans-serif;
    transition: all 0.2s;
    color: #fff;
  }
  .set-test-btn.discord { background: linear-gradient(135deg, #5865F2, #4752C4); box-shadow: 0 4px 12px rgba(88,101,242,0.3); }
  .set-test-btn.discord:hover { box-shadow: 0 4px 18px rgba(88,101,242,0.5); }
  .set-test-btn.slack { background: linear-gradient(135deg, #E01E5A, #4A154B); box-shadow: 0 4px 12px rgba(74,21,75,0.3); }
  .set-test-btn.slack:hover { box-shadow: 0 4px 18px rgba(74,21,75,0.5); }

  /* notifications toggles */
  .set-notif-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 0;
    border-bottom: 1px solid var(--set-border);
  }
  .set-notif-row:last-child { border-bottom: none; padding-bottom: 0; }
  .set-notif-label {
    display: flex; align-items: center; gap: 10px;
    font-size: 14px; font-weight: 500; color: var(--set-text);
  }
  .set-on-badge {
    font-size: 11px; font-weight: 700;
    color: #06b6d4;
    background: rgba(6,182,212,0.1);
    border: 1px solid rgba(6,182,212,0.25);
    border-radius: 6px; padding: 2px 8px;
    letter-spacing: 0.04em;
  }

  /* toggle switch */
  .set-toggle {
    position: relative; width: 40px; height: 22px; flex-shrink: 0;
  }
  .set-toggle input { opacity: 0; width: 0; height: 0; }
  .set-toggle-track {
    position: absolute; inset: 0;
    border-radius: 99px;
    background: rgba(255,255,255,0.1);
    border: 1px solid var(--set-border);
    cursor: pointer; transition: all 0.25s;
  }
  .set-toggle input:checked + .set-toggle-track {
    background: linear-gradient(135deg, #06b6d4, #2563eb);
    border-color: #06b6d4;
    box-shadow: 0 0 10px rgba(6,182,212,0.4);
  }
  .set-toggle-track::after {
    content: '';
    position: absolute; top: 2px; left: 2px;
    width: 16px; height: 16px; border-radius: 50%;
    background: #fff;
    transition: transform 0.25s;
    box-shadow: 0 1px 4px rgba(0,0,0,0.3);
  }
  .set-toggle input:checked + .set-toggle-track::after {
    transform: translateX(18px);
  }

  /* deploy config */
  .set-config-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 0;
    border-bottom: 1px solid var(--set-border);
  }
  .set-config-row:last-child { border-bottom: none; padding-bottom: 0; }
  .set-config-label {
    display: flex; align-items: center; gap: 10px;
    font-size: 14px; font-weight: 500; color: var(--set-text);
  }
  .set-config-badge {
    font-size: 12px; font-weight: 600; cursor: pointer;
    border-radius: 8px; padding: 4px 14px;
    border: none; font-family: 'Inter', sans-serif;
    transition: all 0.2s;
  }
  .set-config-badge.regen {
    background: var(--set-inner);
    border: 1px solid var(--set-border);
    color: var(--set-text);
  }
  .set-config-badge.regen:hover { border-color: #06b6d4; color: #06b6d4; }
  .set-config-badge.enabled {
    background: rgba(34,197,94,0.12);
    border: 1px solid rgba(34,197,94,0.3);
    color: #22c55e;
  }

  /* history */
  .set-history-head {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 14px;
  }
  .set-reset-btn {
    padding: 6px 14px;
    background: var(--set-inner);
    border: 1px solid var(--set-border);
    border-radius: 8px;
    font-size: 12px; font-weight: 600;
    color: var(--set-text);
    cursor: pointer; font-family: 'Inter', sans-serif;
    transition: all 0.2s;
  }
  .set-reset-btn:hover { border-color: #dc2626; color: #dc2626; }
  .set-history-sub {
    font-size: 12px; color: var(--set-muted); margin-bottom: 6px;
  }

  /* security activity */
  .set-activity-row {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 0;
    border-bottom: 1px solid var(--set-border);
  }
  .set-activity-row:last-child { border-bottom: none; padding-bottom: 0; }
  .set-avatar {
    width: 36px; height: 36px; border-radius: 50%;
    object-fit: cover; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 14px; font-weight: 700; color: #fff;
    position: relative;
  }
  .set-avatar-inner { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; color: #fff; }
  .set-avatar-badge {
    position: absolute; bottom: -2px; right: -2px;
    width: 14px; height: 14px; border-radius: 50%;
    background: #22c55e;
    border: 2px solid var(--set-card);
    display: flex; align-items: center; justify-content: center;
  }
  .set-activity-name { font-size: 14px; font-weight: 700; color: var(--set-text); }
  .set-activity-action { font-size: 13px; color: var(--set-muted); }
  .set-activity-time { font-size: 12px; color: var(--set-muted); margin-left: auto; white-space: nowrap; }

  /* save btn */
  .set-save-btn {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    width: 100%;
    padding: 13px;
    background: linear-gradient(135deg, #2563eb, #1d4ed8);
    border: none; border-radius: 12px;
    font-size: 15px; font-weight: 700; color: #fff;
    cursor: pointer; font-family: 'Inter', sans-serif;
    transition: all 0.2s;
    box-shadow: 0 4px 20px rgba(37,99,235,0.35);
    margin-top: 16px;
    position: relative; z-index: 1;
  }
  .set-save-btn:hover {
    box-shadow: 0 4px 28px rgba(37,99,235,0.55);
    transform: translateY(-1px);
  }
`;

const DiscordIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="#5865F2">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.001.022.015.04.037.05a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
  </svg>
);

const SlackIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52z" fill="#E01E5A"/>
    <path d="M6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" fill="#E01E5A"/>
    <path d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834z" fill="#36C5F0"/>
    <path d="M8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z" fill="#36C5F0"/>
    <path d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834z" fill="#2EB67D"/>
    <path d="M17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312z" fill="#2EB67D"/>
    <path d="M15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52z" fill="#ECB22E"/>
    <path d="M15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" fill="#ECB22E"/>
  </svg>
);

export default function Settings() {
  const [discordWebhook, setDiscordWebhook] = useState('https://discord.com/api/webhooks/...');
  const [slackWebhook, setSlackWebhook]     = useState('https://hooks.slack.com/services/...');
  const [notifyDeploy, setNotifyDeploy]     = useState(true);
  const [notifyFailure, setNotifyFailure]   = useState(true);
  const [notifyRollback, setNotifyRollback] = useState(true);

  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const vars = isDark
    ? `--set-bg:#050d1a;--set-text:#e2e8f0;--set-muted:#64748b;--set-card:rgba(15,23,42,0.95);--set-inner:rgba(255,255,255,0.04);--set-border:rgba(6,182,212,0.15);--set-input:rgba(255,255,255,0.05);`
    : `--set-bg:transparent;--set-text:#0f172a;--set-muted:#64748b;--set-card:rgba(255,255,255,0.9);--set-inner:rgba(6,182,212,0.04);--set-border:rgba(6,182,212,0.2);--set-input:rgba(6,182,212,0.05);`;

  const handleSave = () => toast.success('Settings saved successfully!');
  const testWebhook = (type: string) => toast.success(`Test notification sent to ${type}!`);

  return (
    <div className="set-root">
      <style>{CSS}</style>
      <style>{`:root { ${vars} }`}</style>

      {/* Circuit bg */}
      {isDark && (
        <div className="set-circuit" aria-hidden="true">
          <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" style={{ width: '100%', height: '100%' }}>
            <g stroke="#06b6d4" strokeWidth="1" fill="none" opacity="0.07">
              <path d="M0 200 H400 V100 H800 V300 H1200 V150 H1440"/>
              <path d="M0 600 H300 V500 H700 V700 H1100 V550 H1440"/>
              <circle cx="400" cy="100" r="3" fill="#06b6d4"/>
              <circle cx="800" cy="300" r="3" fill="#8b5cf6"/>
            </g>
          </svg>
        </div>
      )}

      {/* ── Quick stats row ── */}
      <div className="set-quickrow">
        <div className="set-qcard">
          <div className="set-qicon discord"><DiscordIcon /></div>
          <div>
            <div className="set-qlabel">Discord</div>
            <div className="set-qsub">Connected</div>
          </div>
        </div>
        <div className="set-qcard">
          <div className="set-qicon slack"><SlackIcon /></div>
          <div>
            <div className="set-qlabel">Slack</div>
            <div className="set-qsub">Connected</div>
          </div>
        </div>
        <div className="set-qcard">
          <div className="set-qicon health">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
          </div>
          <div>
            <div className="set-qlabel">Health Checks</div>
            <div className="set-qsub">Every 30s</div>
          </div>
        </div>
        <div className="set-qcard">
          <div className="set-qicon deploy">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
              <polyline points="9 11 12 14 22 4"/>
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
          </div>
          <div>
            <div className="set-qlabel">Deploy Approval</div>
            <div className="set-qsub">Manual</div>
          </div>
        </div>
      </div>

      {/* ── Main grid ── */}
      <div className="set-grid">

        {/* LEFT COL */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Integrations */}
          <div className="set-card">
            <div className="set-card-title">Integrations</div>

            {/* Discord */}
            <div className="set-integration">
              <div className="set-int-head">
                <div className="set-int-name">
                  <DiscordIcon />
                  Discord <span>Integration</span>
                </div>
                <span className="set-connected-badge">Connected</span>
              </div>
              <div className="set-int-status">Status: Connected</div>
              <div className="set-int-row">
                <input
                  className="set-int-input"
                  value={discordWebhook}
                  onChange={e => setDiscordWebhook(e.target.value)}
                />
                <button className="set-test-btn discord" onClick={() => testWebhook('Discord')}>Test</button>
              </div>
            </div>

            {/* Slack */}
            <div className="set-integration">
              <div className="set-int-head">
                <div className="set-int-name">
                  <SlackIcon />
                  Slack <span>Integration</span>
                </div>
                <span className="set-connected-badge">Connected</span>
              </div>
              <div className="set-int-status">Status: Connected</div>
              <div className="set-int-row">
                <input
                  className="set-int-input"
                  value={slackWebhook}
                  onChange={e => setSlackWebhook(e.target.value)}
                />
                <button className="set-test-btn slack" onClick={() => testWebhook('Slack')}>Test</button>
              </div>
            </div>
          </div>

          {/* Security */}
          <div className="set-card">
            <div className="set-card-title">Security</div>
            {[
              { initials: 'YA', color: '#7c3aed', name: 'Yasmin', action: 'changed Slack integration', time: '12 mins ago' },
              { initials: 'MO', color: '#0891b2', name: 'Mohammed', action: 'updated deploy approval', time: '2 days ago' },
            ].map((item, i) => (
              <div key={i} className="set-activity-row">
                <div className="set-avatar" style={{ position: 'relative' }}>
                  <div className="set-avatar-inner" style={{ background: item.color }}>{item.initials}</div>
                  <div className="set-avatar-badge">
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                </div>
                <div>
                  <span className="set-activity-name">{item.name} </span>
                  <span className="set-activity-action">{item.action}</span>
                </div>
                <span className="set-activity-time">{item.time}</span>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT COL */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Notifications */}
          <div className="set-card">
            <div className="set-card-title">Notifications</div>
            {[
              { label: 'Notify on successful deploy', val: notifyDeploy, set: setNotifyDeploy },
              { label: 'Notify on deployment failure', val: notifyFailure, set: setNotifyFailure },
              { label: 'Notify on rollback', val: notifyRollback, set: setNotifyRollback },
            ].map((item, i) => (
              <div key={i} className="set-notif-row">
                <div className="set-notif-label">
                  <label className="set-toggle">
                    <input type="checkbox" checked={item.val} onChange={e => item.set(e.target.checked)} />
                    <div className="set-toggle-track" />
                  </label>
                  {item.label}
                </div>
                {item.val && <span className="set-on-badge">ON</span>}
              </div>
            ))}
          </div>

          {/* Deploy Configuration */}
          <div className="set-card">
            <div className="set-card-title">Deploy Configuration</div>
            <div className="set-config-row">
              <div className="set-config-label">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                API Token
              </div>
              <button className="set-config-badge regen">Regenerate</button>
            </div>
            <div className="set-config-row">
              <div className="set-config-label">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                  <polyline points="9 11 12 14 22 4"/>
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                </svg>
                SSH Access
              </div>
              <span className="set-config-badge enabled">Enabled</span>
            </div>
          </div>

          {/* Settings History */}
          <div className="set-card">
            <div className="set-history-head">
              <div className="set-card-title" style={{ marginBottom: 0 }}>Settings History</div>
              <button className="set-reset-btn">Reset Settings</button>
            </div>
            <div className="set-history-sub">Restore default configuration</div>
            <div style={{ fontSize: 12, color: 'var(--set-muted)' }}>Restore default configuration</div>
          </div>
        </div>
      </div>

      {/* Save button */}
      <button className="set-save-btn" onClick={handleSave}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
          <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
        </svg>
        Save Changes
      </button>
    </div>
  );
}