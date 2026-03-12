import { useState, useEffect, useRef } from 'react';
import { X, Terminal as TerminalIcon } from 'lucide-react';

interface TerminalProps {
  server: {
    name: string;
    ip: string;
  };
  onClose: () => void;
}

const mockCommands = [
  { cmd: 'ls -la', output: 'total 48\ndrwxr-xr-x  6 root root 4096 Mar  8 14:32 .\ndrwxr-xr-x 18 root root 4096 Mar  7 10:15 ..\ndrwxr-xr-x  3 root root 4096 Mar  8 14:32 app\n-rw-r--r--  1 root root  220 Mar  1 09:00 .bashrc\ndrwxr-xr-x  2 root root 4096 Mar  8 14:32 config' },
  { cmd: 'docker ps', output: 'CONTAINER ID   IMAGE              STATUS          PORTS\na7f3c4d2e1b0   nginx:latest       Up 9 days       80->80/tcp\nb2e5f8a1c9d3   frontend:latest    Up 9 days       3000->3000/tcp\nc9d4e2f5a7b1   backend:latest     Up 9 days       5000->5000/tcp' },
  { cmd: 'df -h', output: 'Filesystem      Size  Used Avail Use% Mounted on\n/dev/vda1        80G   45G   32G  59% /\ntmpfs           3.9G  1.2M  3.9G   1% /dev/shm' },
  { cmd: 'free -h', output: '              total        used        free      shared  buff/cache   available\nMem:          7.7Gi       4.8Gi       1.2Gi       120Mi       1.7Gi       2.6Gi\nSwap:         2.0Gi       256Mi       1.7Gi' },
];

export default function Terminal({ server, onClose }: TerminalProps) {
  const [history, setHistory] = useState<Array<{ type: 'input' | 'output'; content: string }>>([
    { type: 'output', content: `Connected to ${server.name} (${server.ip})` },
    { type: 'output', content: 'Welcome to Ubuntu 22.04 LTS' },
    { type: 'output', content: '' },
  ]);
  const [input, setInput] = useState('');
  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [history]);

  const handleCommand = (cmd: string) => {
    setHistory(prev => [...prev, { type: 'input', content: `root@${server.name}:~$ ${cmd}` }]);

    if (cmd.trim() === '') return;

    if (cmd === 'clear') {
      setHistory([]);
      return;
    }

    if (cmd === 'exit') {
      onClose();
      return;
    }

    // Find matching command or show not found
    const matchedCmd = mockCommands.find(mc => cmd.startsWith(mc.cmd));
    const output = matchedCmd 
      ? matchedCmd.output 
      : `bash: ${cmd}: command not found`;

    setTimeout(() => {
      setHistory(prev => [...prev, { type: 'output', content: output }]);
    }, 100);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      handleCommand(input);
      setInput('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="glass-panel max-w-4xl w-full h-[600px] rounded-xl border border-[#1f2937] bg-[#020617]/80 flex flex-col shadow-2xl shadow-black/50">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1f2937] p-4">
          <div className="flex items-center gap-3">
            <TerminalIcon className="text-[#16a34a]" size={20} />
            <div>
              <h3 className="font-semibold font-mono">{server.name}</h3>
              <p className="text-xs text-[#94a3b8] font-mono">{server.ip}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-[#2d3748] hover:bg-[#374151] flex items-center justify-center transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* Terminal Content */}
        <div
          ref={terminalRef}
          className="scanlines flex-1 overflow-auto p-4 font-mono text-sm"
          onClick={() => inputRef.current?.focus()}
        >
          {history.map((line, i) => (
            <div
              key={i}
              className={`${
                line.type === 'input' ? 'text-[#10b981]' : 'text-[#e5e7eb]'
              } ${i >= history.length - 3 ? 'typewriter' : ''}`}
            >
              {line.content}
            </div>
          ))}
          
          {/* Input Line */}
          <form onSubmit={handleSubmit} className="flex items-center text-[#16a34a]">
            <span>root@{server.name}:~$&nbsp;</span>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="flex-1 bg-transparent outline-none text-[#f1f5f9]"
              autoFocus
            />
          </form>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[#2d3748] text-xs text-[#94a3b8] font-mono">
          <div className="flex gap-4">
            <span>Try: ls -la | docker ps | df -h | free -h | clear | exit</span>
          </div>
        </div>
      </div>
    </div>
  );
}
