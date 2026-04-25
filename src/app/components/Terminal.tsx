import { useEffect, useRef, useState } from 'react';
import { X, Terminal as TerminalIcon, Loader2, Wifi, WifiOff } from 'lucide-react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { resolveWsUrl } from '../lib/runtime';

interface TerminalProps {
  server: {
    id?: string;
    name: string;
    ip?: string;
    host?: string;
  };
  onClose: () => void;
}

export default function Terminal({ server, onClose }: TerminalProps) {
  const ip   = server.ip || server.host || '';
  const id   = server.id || '';
  const name = server.name || id;

  const terminalDivRef = useRef<HTMLDivElement>(null);
  const xtermRef       = useRef<XTerm | null>(null);
  const fitAddonRef    = useRef<FitAddon | null>(null);
  const wsRef          = useRef<WebSocket | null>(null);

  const [connected,    setConnected]    = useState(false);
  const [connecting,   setConnecting]   = useState(true);
  const [error,        setError]        = useState<string | null>(null);

  useEffect(() => {
    if (!terminalDivRef.current) return;

    // ── Init xterm ──────────────────────────────────────────────────────────
    const xterm = new XTerm({
      cursorBlink:    true,
      fontSize:       13,
      fontFamily:     'JetBrains Mono, Consolas, monospace',
      theme: {
        background:   '#020617',
        foreground:   '#e5e7eb',
        cursor:       '#10b981',
        selectionBackground: 'rgba(16,185,129,0.3)',
        black:        '#1e293b',
        red:          '#ef4444',
        green:        '#10b981',
        yellow:       '#f59e0b',
        blue:         '#3b82f6',
        magenta:      '#8b5cf6',
        cyan:         '#06b6d4',
        white:        '#f1f5f9',
        brightBlack:  '#475569',
        brightRed:    '#f87171',
        brightGreen:  '#34d399',
        brightYellow: '#fbbf24',
        brightBlue:   '#60a5fa',
        brightMagenta:'#a78bfa',
        brightCyan:   '#22d3ee',
        brightWhite:  '#ffffff',
      },
      scrollback:     1000,
      allowProposedApi: true,
    });

    const fitAddon      = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    xterm.loadAddon(fitAddon);
    xterm.loadAddon(webLinksAddon);
    xterm.open(terminalDivRef.current);
    fitAddon.fit();

    xtermRef.current    = xterm;
    fitAddonRef.current = fitAddon;

    // ── Connexion WebSocket ─────────────────────────────────────────────────
    xterm.writeln(`\x1b[36mConnecting to ${name} (${ip})...\x1b[0m`);

    const ws = new WebSocket(resolveWsUrl(`/terminal/${id}`));
    wsRef.current = ws;

    ws.onopen = () => {
      setConnecting(false);
      setConnected(true);
      setError(null);
      xterm.writeln(`\x1b[32m✓ Connected to ${name}\x1b[0m`);
      xterm.writeln('');
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'data') {
          xterm.write(msg.data);
        } else if (msg.type === 'error') {
          xterm.writeln(`\x1b[31m${msg.data}\x1b[0m`);
        }
      } catch {
        xterm.write(event.data);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      setConnecting(false);
      xterm.writeln('\r\n\x1b[33mConnection closed.\x1b[0m');
    };

    ws.onerror = () => {
      setConnected(false);
      setConnecting(false);
      setError('WebSocket connection failed');
      xterm.writeln('\r\n\x1b[31m✗ Connection failed. Is the backend running?\x1b[0m');
    };

    // ── Envoyer les touches au backend ──────────────────────────────────────
    xterm.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }));
      }
    });

    // ── Resize ──────────────────────────────────────────────────────────────
    const handleResize = () => {
      fitAddon.fit();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'resize',
          cols: xterm.cols,
          rows: xterm.rows,
        }));
      }
    };
    window.addEventListener('resize', handleResize);

    // Focus
    xterm.focus();

    return () => {
      window.removeEventListener('resize', handleResize);
      ws.close();
      xterm.dispose();
    };
  }, [id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        className="max-w-5xl w-full rounded-xl flex flex-col shadow-2xl"
        style={{
          background: '#020617',
          border: '1px solid #1f2937',
          height: '600px',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ borderBottom: '1px solid #1f2937' }}>
          <div className="flex items-center gap-3">
            {/* macOS dots */}
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-[#ef4444] cursor-pointer" onClick={onClose} />
              <div className="w-3 h-3 rounded-full bg-[#f59e0b]" />
              <div className="w-3 h-3 rounded-full bg-[#22c55e]" />
            </div>
            <TerminalIcon size={14} className="text-[#16a34a]" />
            <span className="font-mono text-sm text-white">{name}</span>
            <span className="font-mono text-xs text-[#475569]">{ip}</span>
          </div>

          <div className="flex items-center gap-3">
            {/* Status */}
            {connecting && (
              <span className="flex items-center gap-1.5 text-[11px] text-[#f59e0b] font-mono">
                <Loader2 size={11} className="animate-spin" /> connecting...
              </span>
            )}
            {connected && (
              <span className="flex items-center gap-1.5 text-[11px] text-[#10b981] font-mono">
                <Wifi size={11} /> connected
              </span>
            )}
            {error && (
              <span className="flex items-center gap-1.5 text-[11px] text-[#ef4444] font-mono">
                <WifiOff size={11} /> {error}
              </span>
            )}
            <button onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[#94a3b8] hover:text-white transition-colors"
              style={{ background: '#1f2937' }}>
              <X size={14} />
            </button>
          </div>
        </div>

        {/* xterm container */}
        <div
          ref={terminalDivRef}
          className="flex-1 overflow-hidden"
          style={{ padding: '8px' }}
        />

        {/* Footer */}
        <div className="px-4 py-1.5 flex-shrink-0 font-mono text-[10px] text-[#334155]"
          style={{ borderTop: '1px solid #1f2937' }}>
          SSH shell — {name} · ctrl+c pour interrompre · exit pour fermer
        </div>
      </div>
    </div>
  );
}