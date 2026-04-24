import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { useTheme } from '../theme-context';
import { Loader2, CheckCircle, Copy, Eye, EyeOff, AlertTriangle, RefreshCw } from 'lucide-react';

import { apiFetch } from '../lib/api';

// ── Couleurs par catégorie d'action ──────────────────────────────────────────
const CATEGORY_META: Record<string, { color: string; icon: string; initials: string }> = {
  settings:    { color: '#2563eb', icon: '⚙️',  initials: 'ST' },
  security:    { color: '#7c3aed', icon: '🔒',  initials: 'SC' },
  integration: { color: '#0891b2', icon: '🔗',  initials: 'IN' },
  ssh:         { color: '#059669', icon: '🖥️',  initials: 'SH' },
  vps:         { color: '#d97706', icon: '🗄️',  initials: 'VP' },
};

function categoryMeta(cat: string) {
  return CATEGORY_META[cat] ?? { color: '#64748b', icon: '📋', initials: '??' };
}

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
  .set-circuit { position: absolute; inset: 0; pointer-events: none; z-index: 0; overflow: hidden; }

  .set-quickrow {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;
    margin-bottom: 24px; position: relative; z-index: 1;
  }
  .set-qcard {
    background: var(--set-card); border: 1px solid var(--set-border);
    border-radius: 12px; padding: 16px 18px;
    display: flex; align-items: center; gap: 14px;
    position: relative; overflow: hidden; transition: border-color 0.2s;
  }
  .set-qcard::before {
    content: ''; position: absolute; inset: 0; border-radius: 12px; padding: 1px;
    background: linear-gradient(135deg, rgba(6,182,212,0.3), rgba(139,92,246,0.2), transparent 60%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor; mask-composite: exclude; pointer-events: none;
  }
  .set-qcard:hover { border-color: rgba(6,182,212,0.5); }
  .set-qicon {
    width: 40px; height: 40px; border-radius: 10px;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 20px;
  }
  .set-qicon.discord { background: rgba(88,101,242,0.2); border: 1px solid rgba(88,101,242,0.4); }
  .set-qicon.slack   { background: rgba(74,21,75,0.3);   border: 1px solid rgba(229,29,133,0.3); }
  .set-qicon.health  { background: rgba(6,182,212,0.15); border: 1px solid rgba(6,182,212,0.4); }
  .set-qicon.deploy  { background: rgba(34,197,94,0.15); border: 1px solid rgba(34,197,94,0.4); }
  .set-qlabel { font-size: 15px; font-weight: 700; color: var(--set-text); }
  .set-qsub   { font-size: 12px; color: var(--set-muted); margin-top: 2px; }

  .set-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; position: relative; z-index: 1; }

  .set-card {
    background: var(--set-card); border: 1px solid var(--set-border);
    border-radius: 14px; padding: 20px; position: relative; overflow: hidden; transition: border-color 0.2s;
  }
  .set-card::before {
    content: ''; position: absolute; inset: 0; border-radius: 14px; padding: 1px;
    background: linear-gradient(135deg, rgba(6,182,212,0.25), rgba(139,92,246,0.15), transparent 55%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor; mask-composite: exclude; pointer-events: none;
  }
  .set-card-title { font-size: 16px; font-weight: 700; color: var(--set-text); margin-bottom: 16px; letter-spacing: -0.01em; }

  .set-integration { background: var(--set-inner); border: 1px solid var(--set-border); border-radius: 10px; padding: 14px 16px; margin-bottom: 10px; }
  .set-int-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
  .set-int-name { display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 700; color: var(--set-text); }
  .set-int-name span { font-weight: 400; color: var(--set-muted); font-size: 13px; }
  .set-connected-badge { font-size: 11px; font-weight: 600; color: #22c55e; background: rgba(34,197,94,0.12); border: 1px solid rgba(34,197,94,0.3); border-radius: 99px; padding: 2px 10px; }
  .set-empty-badge { font-size: 11px; font-weight: 600; color: #94a3b8; background: rgba(148,163,184,0.1); border: 1px solid rgba(148,163,184,0.2); border-radius: 99px; padding: 2px 10px; }
  .set-int-status { font-size: 12px; color: var(--set-muted); margin-bottom: 10px; }
  .set-int-row { display: flex; gap: 8px; align-items: center; }
  .set-int-input {
    flex: 1; background: var(--set-input); border: 1px solid var(--set-border); border-radius: 8px;
    padding: 7px 12px; font-size: 12px; color: var(--set-text);
    font-family: 'Inter', monospace; outline: none; transition: border-color 0.2s;
  }
  .set-int-input::placeholder { color: var(--set-muted); }
  .set-int-input:focus { border-color: #06b6d4; }
  .set-test-btn {
    padding: 7px 18px; border-radius: 8px; font-size: 13px; font-weight: 600;
    border: none; cursor: pointer; font-family: 'Inter', sans-serif; transition: all 0.2s; color: #fff;
    display: flex; align-items: center; gap: 6px; white-space: nowrap;
  }
  .set-test-btn.discord { background: linear-gradient(135deg, #5865F2, #4752C4); box-shadow: 0 4px 12px rgba(88,101,242,0.3); }
  .set-test-btn.discord:hover { box-shadow: 0 4px 18px rgba(88,101,242,0.5); }
  .set-test-btn.slack { background: linear-gradient(135deg, #E01E5A, #4A154B); box-shadow: 0 4px 12px rgba(74,21,75,0.3); }
  .set-test-btn.slack:hover { box-shadow: 0 4px 18px rgba(74,21,75,0.5); }
  .set-test-btn:disabled { opacity: 0.6; cursor: not-allowed; }

  .set-notif-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--set-border); }
  .set-notif-row:last-child { border-bottom: none; padding-bottom: 0; }
  .set-notif-label { display: flex; align-items: center; gap: 10px; font-size: 14px; font-weight: 500; color: var(--set-text); }
  .set-on-badge { font-size: 11px; font-weight: 700; color: #06b6d4; background: rgba(6,182,212,0.1); border: 1px solid rgba(6,182,212,0.25); border-radius: 6px; padding: 2px 8px; letter-spacing: 0.04em; }

  .set-toggle { position: relative; width: 40px; height: 22px; flex-shrink: 0; }
  .set-toggle input { opacity: 0; width: 0; height: 0; }
  .set-toggle-track { position: absolute; inset: 0; border-radius: 99px; background: rgba(255,255,255,0.1); border: 1px solid var(--set-border); cursor: pointer; transition: all 0.25s; }
  .set-toggle input:checked + .set-toggle-track { background: linear-gradient(135deg, #06b6d4, #2563eb); border-color: #06b6d4; box-shadow: 0 0 10px rgba(6,182,212,0.4); }
  .set-toggle-track::after { content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: transform 0.25s; box-shadow: 0 1px 4px rgba(0,0,0,0.3); }
  .set-toggle input:checked + .set-toggle-track::after { transform: translateX(18px); }

  .set-config-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid var(--set-border); }
  .set-config-row:last-child { border-bottom: none; padding-bottom: 0; }
  .set-config-label { display: flex; align-items: center; gap: 10px; font-size: 14px; font-weight: 500; color: var(--set-text); }
  .set-config-badge { font-size: 12px; font-weight: 600; cursor: pointer; border-radius: 8px; padding: 4px 14px; border: none; font-family: 'Inter', sans-serif; transition: all 0.2s; display: flex; align-items: center; gap: 6px; }
  .set-config-badge.regen { background: var(--set-inner); border: 1px solid var(--set-border); color: var(--set-text); }
  .set-config-badge.regen:hover { border-color: #06b6d4; color: #06b6d4; }
  .set-config-badge.enabled { background: rgba(34,197,94,0.12); border: 1px solid rgba(34,197,94,0.3); color: #22c55e; }
  .set-config-badge.disabled-ssh { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); color: #ef4444; }
  .set-config-badge:disabled { opacity: 0.6; cursor: not-allowed; }

  .set-token-box { background: var(--set-inner); border: 1px solid var(--set-border); border-radius: 8px; padding: 8px 12px; font-size: 11px; font-family: monospace; color: var(--set-muted); word-break: break-all; margin-top: 8px; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .set-icon-btn { background: none; border: none; cursor: pointer; color: var(--set-muted); padding: 2px; display: flex; align-items: center; transition: color 0.2s; }
  .set-icon-btn:hover { color: #06b6d4; }

  /* ── Security / Audit log ── */
  .set-security-head {
    display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;
  }
  .set-security-title { font-size: 16px; font-weight: 700; color: var(--set-text); letter-spacing: -0.01em; }
  .set-refresh-btn {
    display: flex; align-items: center; gap: 5px; background: none; border: 1px solid var(--set-border);
    border-radius: 7px; padding: 4px 10px; font-size: 12px; font-weight: 600; color: var(--set-muted);
    cursor: pointer; font-family: 'Inter', sans-serif; transition: all 0.2s;
  }
  .set-refresh-btn:hover { border-color: #06b6d4; color: #06b6d4; }
  .set-refresh-btn.spinning svg { animation: spin 0.7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .set-audit-row {
    display: flex; align-items: flex-start; gap: 12px; padding: 10px 0;
    border-bottom: 1px solid var(--set-border); animation: fadeIn 0.3s ease;
  }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
  .set-audit-row:last-child { border-bottom: none; padding-bottom: 0; }
  .set-audit-avatar {
    width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center;
    justify-content: center; font-size: 11px; font-weight: 700; color: #fff; flex-shrink: 0;
    position: relative;
  }
  .set-audit-dot {
    position: absolute; bottom: -2px; right: -2px; width: 14px; height: 14px; border-radius: 50%;
    border: 2px solid var(--set-card); display: flex; align-items: center; justify-content: center;
    font-size: 8px; line-height: 1;
  }
  .set-audit-dot.ok  { background: #22c55e; }
  .set-audit-dot.err { background: #ef4444; }
  .set-audit-body { flex: 1; min-width: 0; }
  .set-audit-action { font-size: 14px; font-weight: 600; color: var(--set-text); }
  .set-audit-details { font-size: 12px; color: var(--set-muted); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .set-audit-meta { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
  .set-audit-cat {
    font-size: 10px; font-weight: 700; border-radius: 5px; padding: 1px 7px;
    background: rgba(6,182,212,0.1); color: #06b6d4; border: 1px solid rgba(6,182,212,0.2);
    text-transform: uppercase; letter-spacing: 0.04em;
  }
  .set-audit-ip { font-size: 11px; color: var(--set-muted); font-family: monospace; }
  .set-audit-time { font-size: 12px; color: var(--set-muted); margin-left: auto; white-space: nowrap; flex-shrink: 0; }

  .set-audit-empty {
    text-align: center; padding: 28px 0; font-size: 13px; color: var(--set-muted);
  }

  /* ── Skeleton loader ── */
  .set-skel { border-radius: 8px; height: 44px; margin-bottom: 8px;
    background: linear-gradient(90deg, var(--set-inner) 25%, rgba(255,255,255,0.07) 50%, var(--set-inner) 75%);
    background-size: 200% 100%; animation: shimmer 1.4s infinite;
  }
  @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

  /* ── History / Reset ── */
  .set-history-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
  .set-reset-btn { padding: 6px 14px; background: var(--set-inner); border: 1px solid var(--set-border); border-radius: 8px; font-size: 12px; font-weight: 600; color: var(--set-text); cursor: pointer; font-family: 'Inter', sans-serif; transition: all 0.2s; }
  .set-reset-btn:hover { border-color: #dc2626; color: #dc2626; }

  /* ── Reset confirm modal ── */
  .set-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); z-index: 1000; display: flex; align-items: center; justify-content: center; }
  .set-modal { background: var(--set-card); border: 1px solid var(--set-border); border-radius: 16px; padding: 28px; max-width: 380px; width: 90%; position: relative; }
  .set-modal-title { font-size: 17px; font-weight: 700; color: var(--set-text); margin-bottom: 10px; display: flex; align-items: center; gap: 10px; }
  .set-modal-desc { font-size: 13px; color: var(--set-muted); margin-bottom: 22px; line-height: 1.6; }
  .set-modal-actions { display: flex; gap: 10px; justify-content: flex-end; }
  .set-modal-cancel { padding: 8px 20px; background: var(--set-inner); border: 1px solid var(--set-border); border-radius: 8px; font-size: 13px; font-weight: 600; color: var(--set-text); cursor: pointer; font-family: 'Inter', sans-serif; }
  .set-modal-cancel:hover { border-color: var(--set-muted); }
  .set-modal-confirm { padding: 8px 20px; background: #dc2626; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; color: #fff; cursor: pointer; font-family: 'Inter', sans-serif; display: flex; align-items: center; gap: 6px; }
  .set-modal-confirm:hover { background: #b91c1c; }
  .set-modal-confirm:disabled { opacity: 0.6; cursor: not-allowed; }

  /* ── Error banner ── */
  .set-error-banner { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 10px; padding: 12px 16px; font-size: 13px; color: #ef4444; display: flex; align-items: center; gap: 8px; margin-bottom: 16px; position: relative; z-index: 1; }

  .set-save-btn {
    display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%;
    padding: 13px; background: linear-gradient(135deg, #2563eb, #1d4ed8);
    border: none; border-radius: 12px; font-size: 15px; font-weight: 700; color: #fff;
    cursor: pointer; font-family: 'Inter', sans-serif; transition: all 0.2s;
    box-shadow: 0 4px 20px rgba(37,99,235,0.35); margin-top: 16px; position: relative; z-index: 1;
  }
  .set-save-btn:hover { box-shadow: 0 4px 28px rgba(37,99,235,0.55); transform: translateY(-1px); }
  .set-save-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
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

// ── Reset Confirm Modal ──────────────────────────────────────────────────────
function ResetModal({ onCancel, onConfirm, loading }: { onCancel: () => void; onConfirm: () => void; loading: boolean }) {
  return (
    <div className="set-modal-overlay" onClick={onCancel}>
      <div className="set-modal" onClick={e => e.stopPropagation()}>
        <div className="set-modal-title">
          <AlertTriangle size={18} color="#ef4444" />
          Reset all settings?
        </div>
        <div className="set-modal-desc">
          This will restore all settings to their default values. Webhooks (Discord & Slack) will be permanently deleted and a new API token will be generated.
        </div>
        <div className="set-modal-actions">
          <button className="set-modal-cancel" onClick={onCancel}>Cancel</button>
          <button className="set-modal-confirm" onClick={onConfirm} disabled={loading}>
            {loading && <Loader2 size={13} className="animate-spin" />}
            Reset Settings
          </button>
        </div>
      </div>
    </div>
  );
}

// ── AuditEntry type ──────────────────────────────────────────────────────────
interface AuditEntry {
  id: number;
  timestamp: number;
  action: string;
  category: string;
  details: string;
  ip: string;
  success: number;
  timeAgo: string;
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
export default function Settings() {
  // ── Settings state ───────────────────────────────────────────────────────
  const [discordWebhook,  setDiscordWebhook]  = useState('');
  const [slackWebhook,    setSlackWebhook]    = useState('');
  const [discordSaved,    setDiscordSaved]    = useState(false);
  const [slackSaved,      setSlackSaved]      = useState(false);
  const [notifyDeploy,    setNotifyDeploy]    = useState(true);
  const [notifyFailure,   setNotifyFailure]   = useState(true);
  const [notifyRollback,  setNotifyRollback]  = useState(true);
  const [sshAccess,       setSshAccess]       = useState(true);
  const [apiToken,        setApiToken]        = useState('');
  const [showToken,       setShowToken]       = useState(false);

  const [loaded,          setLoaded]          = useState(false);
  const [loadError,       setLoadError]       = useState(false);
  const [saving,          setSaving]          = useState(false);
  const [testingDiscord,  setTestingDiscord]  = useState(false);
  const [testingSlack,    setTestingSlack]    = useState(false);
  const [regenLoading,    setRegenLoading]    = useState(false);
  const [showResetModal,  setShowResetModal]  = useState(false);
  const [resetLoading,    setResetLoading]    = useState(false);

  // ── Audit log state ───────────────────────────────────────────────────────
  const [auditEntries,    setAuditEntries]    = useState<AuditEntry[]>([]);
  const [auditLoading,    setAuditLoading]    = useState(true);
  const [auditRefreshing, setAuditRefreshing] = useState(false);
  const auditIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // ── Load settings ─────────────────────────────────────────────────────────
  const loadSettings = useCallback(() => {
    setLoadError(false);
    apiFetch(`/api/settings`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => {
        setNotifyDeploy(data.notifyDeploy ?? true);
        setNotifyFailure(data.notifyFailure ?? true);
        setNotifyRollback(data.notifyRollback ?? true);
        setSshAccess(data.sshAccess ?? true);
        setApiToken(data.apiToken || '');
        setDiscordSaved(!!data.discordWebhook && data.discordWebhook !== '');
        setSlackSaved(!!data.slackWebhook   && data.slackWebhook   !== '');
        setDiscordWebhook('');
        setSlackWebhook('');
        setLoaded(true);
      })
      .catch(() => { setLoadError(true); setLoaded(true); });
  }, []);

  // ── Load audit log ────────────────────────────────────────────────────────
  const loadAuditLog = useCallback(async (showSpinner = false) => {
    if (showSpinner) setAuditRefreshing(true);
    try {
      const r = await apiFetch(`/api/settings/audit-log?limit=10`);
      if (!r.ok) throw new Error();
      const data = await r.json();
      setAuditEntries(data.entries ?? []);
    } catch {
      // silencieux — on garde les données précédentes
    } finally {
      setAuditLoading(false);
      setAuditRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
    loadAuditLog();
    // Auto-refresh audit log toutes les 15s
    auditIntervalRef.current = setInterval(() => loadAuditLog(), 15_000);
    return () => {
      if (auditIntervalRef.current) clearInterval(auditIntervalRef.current);
    };
  }, [loadSettings, loadAuditLog]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await apiFetch(`/api/settings`, {
        method: 'POST',
        body: JSON.stringify({
          discordWebhook: discordWebhook || undefined,
          slackWebhook:   slackWebhook   || undefined,
          notifyDeploy, notifyFailure, notifyRollback, sshAccess,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (discordWebhook) { setDiscordSaved(true); setDiscordWebhook(''); }
      if (slackWebhook)   { setSlackSaved(true);   setSlackWebhook('');   }
      toast.success('Settings saved successfully!');
      // Refresh audit log après sauvegarde
      setTimeout(() => loadAuditLog(), 300);
    } catch {
      toast.error('Failed to save — backend unreachable');
    } finally {
      setSaving(false);
    }
  };

  // ── Test Discord ──────────────────────────────────────────────────────────
  const testDiscord = async () => {
    if (!discordWebhook && !discordSaved) { toast.error('Enter a Discord webhook first'); return; }
    setTestingDiscord(true);
    try {
      const body: Record<string, string> = {};
      if (discordWebhook) body.webhook = discordWebhook;
      const res  = await apiFetch(`/api/settings/test-discord`, {
        method: 'POST', body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) { toast.success('Message sent on Discord! ✅'); setTimeout(() => loadAuditLog(), 300); }
      else toast.error(data.error || 'Discord error');
    } catch { toast.error('Backend unreachable'); }
    finally { setTestingDiscord(false); }
  };

  // ── Test Slack ────────────────────────────────────────────────────────────
  const testSlack = async () => {
    if (!slackWebhook && !slackSaved) { toast.error('Enter a Slack webhook first'); return; }
    setTestingSlack(true);
    try {
      const body: Record<string, string> = {};
      if (slackWebhook) body.webhook = slackWebhook;
      const res  = await apiFetch(`/api/settings/test-slack`, {
        method: 'POST', body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) { toast.success('Message sent on Slack! ✅'); setTimeout(() => loadAuditLog(), 300); }
      else toast.error(data.error || 'Slack error');
    } catch { toast.error('Backend unreachable'); }
    finally { setTestingSlack(false); }
  };

  // ── Regen token ───────────────────────────────────────────────────────────
  const regenToken = async () => {
    setRegenLoading(true);
    try {
      const res  = await apiFetch(`/api/settings/regenerate-token`, { method: 'POST' });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setApiToken(data.token);
      toast.success('Token regenerated!');
      setTimeout(() => loadAuditLog(), 300);
    } catch { toast.error('Failed to regenerate token'); }
    finally { setRegenLoading(false); }
  };

  // ── Reset ─────────────────────────────────────────────────────────────────
  const handleReset = async () => {
    setResetLoading(true);
    try {
      const res = await apiFetch(`/api/settings/reset`, { method: 'POST' });
      if (!res.ok) throw new Error();
      toast.success('Settings reset to defaults');
      setShowResetModal(false);
      loadSettings();
      setTimeout(() => loadAuditLog(), 300);
    } catch { toast.error('Reset failed'); }
    finally { setResetLoading(false); }
  };

  const copyToken = () => { navigator.clipboard.writeText(apiToken); toast.success('Token copied!'); };

  const discordConnected = discordSaved || !!discordWebhook;
  const slackConnected   = slackSaved   || !!slackWebhook;

  const vars = isDark
    ? `--set-bg:#050d1a;--set-text:#e2e8f0;--set-muted:#64748b;--set-card:rgba(15,23,42,0.95);--set-inner:rgba(255,255,255,0.04);--set-border:rgba(6,182,212,0.15);--set-input:rgba(255,255,255,0.05);`
    : `--set-bg:transparent;--set-text:#0f172a;--set-muted:#64748b;--set-card:rgba(255,255,255,0.9);--set-inner:rgba(6,182,212,0.04);--set-border:rgba(6,182,212,0.2);--set-input:rgba(6,182,212,0.05);`;

  return (
    <div className="set-root">
      <style>{CSS}</style>
      <style>{`:root { ${vars} }`}</style>

      {showResetModal && (
        <ResetModal onCancel={() => setShowResetModal(false)} onConfirm={handleReset} loading={resetLoading} />
      )}

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

      {loadError && (
        <div className="set-error-banner">
          <AlertTriangle size={15} />
          Backend unreachable — showing default values.&nbsp;
          <button onClick={loadSettings} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', textDecoration: 'underline', fontWeight: 600, padding: 0, fontFamily: 'inherit' }}>
            Retry
          </button>
        </div>
      )}

      {/* Quick stats */}
      <div className="set-quickrow">
        <div className="set-qcard">
          <div className="set-qicon discord"><DiscordIcon /></div>
          <div>
            <div className="set-qlabel">Discord</div>
            <div className="set-qsub">{discordConnected ? 'Connected' : 'Not configured'}</div>
          </div>
        </div>
        <div className="set-qcard">
          <div className="set-qicon slack"><SlackIcon /></div>
          <div>
            <div className="set-qlabel">Slack</div>
            <div className="set-qsub">{slackConnected ? 'Connected' : 'Not configured'}</div>
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

      <div className="set-grid">
        {/* ── LEFT ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Integrations */}
          <div className="set-card">
            <div className="set-card-title">Integrations</div>

            {/* Discord */}
            <div className="set-integration">
              <div className="set-int-head">
                <div className="set-int-name"><DiscordIcon /> Discord <span>Integration</span></div>
                {discordConnected
                  ? <span className="set-connected-badge">Connected</span>
                  : <span className="set-empty-badge">Not configured</span>}
              </div>
              <div className="set-int-status">
                {discordSaved && !discordWebhook
                  ? 'Status: Webhook configured — enter a new URL to replace it'
                  : discordWebhook ? 'Status: Ready to save' : 'Status: Enter your Discord webhook URL'}
              </div>
              <div className="set-int-row">
                <input
                  className="set-int-input"
                  placeholder={discordSaved ? '•••••••••••••••••• (configured)' : 'https://discord.com/api/webhooks/...'}
                  value={discordWebhook}
                  onChange={e => setDiscordWebhook(e.target.value)}
                />
                <button className="set-test-btn discord" onClick={testDiscord} disabled={testingDiscord || (!discordWebhook && !discordSaved)}>
                  {testingDiscord ? <Loader2 size={13} className="animate-spin" /> : null}
                  {testingDiscord ? 'Sending...' : 'Test'}
                </button>
              </div>
            </div>

            {/* Slack */}
            <div className="set-integration">
              <div className="set-int-head">
                <div className="set-int-name"><SlackIcon /> Slack <span>Integration</span></div>
                {slackConnected
                  ? <span className="set-connected-badge">Connected</span>
                  : <span className="set-empty-badge">Not configured</span>}
              </div>
              <div className="set-int-status">
                {slackSaved && !slackWebhook
                  ? 'Status: Webhook configured — enter a new URL to replace it'
                  : slackWebhook ? 'Status: Ready to save' : 'Status: Enter your Slack webhook URL'}
              </div>
              <div className="set-int-row">
                <input
                  className="set-int-input"
                  placeholder={slackSaved ? '•••••••••••••••••• (configured)' : 'https://hooks.slack.com/services/...'}
                  value={slackWebhook}
                  onChange={e => setSlackWebhook(e.target.value)}
                />
                <button className="set-test-btn slack" onClick={testSlack} disabled={testingSlack || (!slackWebhook && !slackSaved)}>
                  {testingSlack ? <Loader2 size={13} className="animate-spin" /> : null}
                  {testingSlack ? 'Sending...' : 'Test'}
                </button>
              </div>
            </div>
          </div>

          {/* Security — Audit Log (REAL DATA) */}
          <div className="set-card">
            <div className="set-security-head">
              <div className="set-security-title">Security</div>
              <button
                className={`set-refresh-btn${auditRefreshing ? ' spinning' : ''}`}
                onClick={() => loadAuditLog(true)}
                disabled={auditRefreshing}
              >
                <RefreshCw size={12} />
                Refresh
              </button>
            </div>

            {auditLoading ? (
              <>
                <div className="set-skel" />
                <div className="set-skel" style={{ opacity: 0.7 }} />
                <div className="set-skel" style={{ opacity: 0.4 }} />
              </>
            ) : auditEntries.length === 0 ? (
              <div className="set-audit-empty">
                <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
                No activity recorded yet.<br />
                <span style={{ fontSize: 12 }}>Actions will appear here after saving settings.</span>
              </div>
            ) : (
              auditEntries.map(entry => {
                const meta = categoryMeta(entry.category);
                return (
                  <div key={entry.id} className="set-audit-row">
                    <div className="set-audit-avatar" style={{ background: meta.color }}>
                      {meta.initials}
                      <div className={`set-audit-dot ${entry.success ? 'ok' : 'err'}`}>
                        {entry.success ? '✓' : '✕'}
                      </div>
                    </div>
                    <div className="set-audit-body">
                      <div className="set-audit-action">{entry.action}</div>
                      {entry.details && (
                        <div className="set-audit-details" title={entry.details}>{entry.details}</div>
                      )}
                      <div className="set-audit-meta">
                        <span className="set-audit-cat">{entry.category}</span>
                        {entry.ip && entry.ip !== 'unknown' && (
                          <span className="set-audit-ip">{entry.ip}</span>
                        )}
                      </div>
                    </div>
                    <span className="set-audit-time">{entry.timeAgo}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── RIGHT ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Notifications */}
          <div className="set-card">
            <div className="set-card-title">Notifications</div>
            {[
              { label: 'Notify on successful deploy',  val: notifyDeploy,    set: setNotifyDeploy },
              { label: 'Notify on deployment failure', val: notifyFailure,   set: setNotifyFailure },
              { label: 'Notify on rollback',            val: notifyRollback,  set: setNotifyRollback },
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
              <button className="set-config-badge regen" onClick={regenToken} disabled={regenLoading}>
                {regenLoading ? <Loader2 size={12} className="animate-spin" /> : null}
                Regenerate
              </button>
            </div>

            {apiToken && (
              <div className="set-token-box">
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {showToken ? apiToken : '••••••••••••••••••••••••••••••••'}
                </span>
                <button className="set-icon-btn" onClick={() => setShowToken(s => !s)} title={showToken ? 'Hide token' : 'Show token'}>
                  {showToken ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
                <button className="set-icon-btn" onClick={copyToken} title="Copy token">
                  <Copy size={13} />
                </button>
              </div>
            )}

            <div className="set-config-row" style={{ marginTop: apiToken ? 8 : 0 }}>
              <div className="set-config-label">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                  <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                </svg>
                SSH Access
              </div>
              <button
                className={`set-config-badge ${sshAccess ? 'enabled' : 'disabled-ssh'}`}
                onClick={() => setSshAccess(s => !s)}
              >
                {sshAccess ? <CheckCircle size={12} /> : null}
                {sshAccess ? 'Enabled' : 'Disabled'}
              </button>
            </div>
          </div>

          {/* Settings History */}
          <div className="set-card">
            <div className="set-history-head">
              <div className="set-card-title" style={{ marginBottom: 0 }}>Settings History</div>
              <button className="set-reset-btn" onClick={() => setShowResetModal(true)}>Reset Settings</button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--set-muted)', marginTop: 8, lineHeight: 1.6 }}>
              Resets all settings to their default values. Webhooks will be deleted and a new API token will be generated.
            </div>
          </div>
        </div>
      </div>

      {/* Save button */}
      <button className="set-save-btn" onClick={handleSave} disabled={saving || !loaded}>
        {saving ? <Loader2 size={16} className="animate-spin" /> : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
          </svg>
        )}
        {saving ? 'Saving...' : 'Save Changes'}
      </button>
    </div>
  );
}