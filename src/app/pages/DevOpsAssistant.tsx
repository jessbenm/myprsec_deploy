import { useState, useRef, useEffect } from 'react';
import { Bot, Send, Copy, Check, RefreshCw, ChevronDown, Zap, AlertTriangle } from 'lucide-react';
import { apiFetch, askRAG, getDetectedTools } from '../lib/api';
import { useTheme } from '../theme-context';

interface VpsItem {
  id: string;
  name: string;
  host: string;
  status: string;
}

interface DetectedTool {
  tool_name: string;
  tool_version: string | null;
  is_active: number;
}

interface Command {
  cmd: string;
  description: string;
  dangerous: boolean;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  commands?: Command[];
  steps?: string[];
  warnings?: string[];
  sources?: string[];
  suggested_projects?: string[];
  off_topic?: boolean;
  error?: boolean;
  loading?: boolean;
}

const QUICK_QUESTIONS = [
  'Analyse mon VPS sélectionné',
  'Quels projets tournent sur mon VPS ?',
  'Mon container redémarre en boucle, comment diagnostiquer ?',
  'Vérifie la santé de mes services',
  'Optimise les performances de mon serveur',
];

function CodeBlock({ cmd, description, dangerous }: Command) {
  const [copied, setCopied] = useState(false);
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const handleCopy = () => {
    navigator.clipboard.writeText(cmd).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className={`rounded-lg overflow-hidden my-2 ${isDark ? 'bg-[#0d1117]' : 'bg-gray-900'}`}>
      {(description || dangerous) && (
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-700">
          <span className="text-xs text-gray-400 flex-1">{description}</span>
          {dangerous && (
            <span className="flex items-center gap-1 text-xs text-orange-400 ml-2">
              <AlertTriangle size={11} />
              Danger
            </span>
          )}
        </div>
      )}
      <div className="flex items-center">
        <code className="flex-1 px-3 py-2 text-xs text-green-400 font-mono whitespace-pre-wrap break-all">
          {cmd}
        </code>
        <button
          onClick={handleCopy}
          className="px-3 py-2 text-gray-400 hover:text-white transition-colors"
          title="Copier"
        >
          {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
        </button>
      </div>
    </div>
  );
}

function AssistantMessage({ msg }: { msg: Message }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  if (msg.loading) {
    return (
      <div className={`flex gap-3 mb-4`}>
        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${isDark ? 'bg-blue-500/20' : 'bg-blue-100'}`}>
          <Bot size={16} className="text-blue-400" />
        </div>
        <div className={`rounded-2xl rounded-tl-sm px-4 py-3 max-w-[80%] ${isDark ? 'bg-[#1a2035]' : 'bg-gray-100'}`}>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 mb-4">
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${isDark ? 'bg-blue-500/20' : 'bg-blue-100'}`}>
        <Bot size={16} className="text-blue-400" />
      </div>
      <div className={`rounded-2xl rounded-tl-sm px-4 py-3 max-w-[85%] ${isDark ? 'bg-[#1a2035] text-[#e2e8f0]' : 'bg-gray-100 text-gray-800'}`}>
        {msg.off_topic ? (
          <p className="text-sm italic text-gray-400">{msg.content}</p>
        ) : (
          <>
            {msg.content && <p className="text-sm leading-relaxed whitespace-pre-wrap mb-2">{msg.content}</p>}

            {msg.warnings && msg.warnings.length > 0 && (
              <div className={`rounded-lg p-2 mb-2 ${isDark ? 'bg-orange-500/10 border border-orange-500/20' : 'bg-orange-50 border border-orange-200'}`}>
                {msg.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-orange-400 flex items-start gap-1">
                    <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" />
                    {w}
                  </p>
                ))}
              </div>
            )}

            {msg.steps && msg.steps.length > 0 && (
              <ol className="text-sm list-decimal list-inside space-y-1 mb-2">
                {msg.steps.map((s, i) => (
                  <li key={i} className="text-gray-300">{s}</li>
                ))}
              </ol>
            )}

            {msg.commands && msg.commands.length > 0 && (
              <div className="mt-2">
                {msg.commands.map((c, i) => (
                  <CodeBlock key={i} {...c} />
                ))}
              </div>
            )}

            {msg.suggested_projects && msg.suggested_projects.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-gray-400 mb-1">Projets détectés :</p>
                <div className="flex flex-wrap gap-1.5">
                  {msg.suggested_projects.map((p, i) => (
                    <span key={i} className={`text-xs px-2 py-0.5 rounded-full cursor-default ${isDark ? 'bg-blue-500/15 text-blue-300 border border-blue-500/20' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {msg.sources && msg.sources.length > 0 && (
              <div className="mt-3 pt-2 border-t border-gray-700/50">
                <p className="text-xs text-gray-500">
                  Sources : {msg.sources.join(', ')}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function DevOpsAssistant() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = localStorage.getItem('devops-chat-messages');
      if (!saved) return [];
      const parsed: Message[] = JSON.parse(saved);
      // On ne restaure pas les messages en état loading
      return parsed.filter(m => !m.loading);
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [vpsList, setVpsList] = useState<VpsItem[]>([]);
  const [selectedVps, setSelectedVps] = useState<VpsItem | null>(null);
  const [detectedTools, setDetectedTools] = useState<DetectedTool[]>([]);
  const [showVpsDrop, setShowVpsDrop] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const border  = isDark ? 'border-[#1a2035]' : 'border-gray-200';
  const mutedTx = isDark ? 'text-[#64748b]' : 'text-gray-400';

  // Persiste les messages à chaque changement (hors messages loading)
  useEffect(() => {
    try {
      const toSave = messages.filter(m => !m.loading);
      localStorage.setItem('devops-chat-messages', JSON.stringify(toSave));
    } catch {}
  }, [messages]);

  useEffect(() => {
    apiFetch('/api/vps')
      .then(r => r.json())
      .then((data: VpsItem[]) => setVpsList(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSelectVps = async (vps: VpsItem | null) => {
    setSelectedVps(vps);
    setShowVpsDrop(false);
    setDetectedTools([]);
    if (!vps) return;
    try {
      const data = await getDetectedTools(vps.id);
      setDetectedTools((data.tools || []).filter((t: DetectedTool) => t.is_active));
    } catch {}
  };

  const sendMessage = async (question: string) => {
    if (!question.trim() || loading) return;
    setInput('');
    setLoading(true);

    const userMsg: Message = { role: 'user', content: question };
    const loadingMsg: Message = { role: 'assistant', content: '', loading: true };
    setMessages(prev => [...prev, userMsg, loadingMsg]);

    try {
      const data = await askRAG(question, selectedVps?.id ? parseInt(selectedVps.id) : undefined);

      const assistantMsg: Message = {
        role: 'assistant',
        content: data.off_topic ? data.message : (data.answer || ''),
        commands: data.commands || [],
        steps: data.steps || [],
        warnings: data.warnings || [],
        sources: data.sources || [],
        suggested_projects: data.suggested_projects || [],
        off_topic: !!data.off_topic,
        error: !!data.error,
      };

      setMessages(prev => [...prev.slice(0, -1), assistantMsg]);
    } catch {
      setMessages(prev => [...prev.slice(0, -1), {
        role: 'assistant',
        content: "Impossible de contacter l'assistant. Vérifie que le service RAG est démarré.",
        error: true,
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const resetChat = () => {
    setMessages([]);
    setInput('');
    localStorage.removeItem('devops-chat-messages');
  };

  return (
    <div className="flex flex-col h-full">

      {/* ── Header compact ── */}
      <div className={`flex-shrink-0 flex items-center justify-between px-5 py-2 border-b ${border}`}>
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${isDark ? 'bg-blue-500/15' : 'bg-blue-50'}`}>
            <Bot size={14} className="text-blue-400" />
          </div>
          <span className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Assistant DevOps</span>
          <span className={`text-xs hidden sm:inline ${mutedTx}`}>· Groq / Llama 3.3</span>
        </div>

        <div className="flex items-center gap-2">
          {/* VPS */}
          <div className="relative">
            <button
              onClick={() => setShowVpsDrop(v => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                selectedVps
                  ? isDark ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-green-50 border-green-200 text-green-700'
                  : isDark ? 'bg-[#1a2035] border-[#2d3748] text-gray-400' : 'bg-white border-gray-200 text-gray-600'
              }`}
            >
              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${selectedVps ? 'bg-green-400' : 'bg-gray-500'}`} />
              {selectedVps ? selectedVps.name : 'VPS'}
              <ChevronDown size={11} />
            </button>

            {showVpsDrop && (
              <div className={`absolute top-full mt-1 right-0 z-50 min-w-[180px] rounded-xl border shadow-xl overflow-hidden ${isDark ? 'bg-[#1a2035] border-[#2d3748]' : 'bg-white border-gray-200'}`}>
                <button onClick={() => handleSelectVps(null)} className={`w-full text-left px-3 py-2 text-xs transition-colors ${isDark ? 'text-gray-400 hover:bg-[#111827]' : 'text-gray-500 hover:bg-gray-50'}`}>
                  Aucun VPS
                </button>
                {vpsList.map(v => (
                  <button key={v.id} onClick={() => handleSelectVps(v)} className={`w-full text-left px-3 py-2 text-xs transition-colors ${isDark ? 'text-white hover:bg-[#111827]' : 'text-gray-800 hover:bg-gray-50'}`}>
                    <div className="font-medium">{v.name}</div>
                    <div className={mutedTx}>{v.host}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Tool badges */}
          {detectedTools.length > 0 && (
            <div className="hidden md:flex items-center gap-1">
              {detectedTools.slice(0, 3).map(t => (
                <span key={t.tool_name} className={`text-xs px-2 py-0.5 rounded-full border ${isDark ? 'bg-blue-500/10 text-blue-300 border-blue-500/20' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
                  {t.tool_name}
                </span>
              ))}
              {detectedTools.length > 3 && <span className={`text-xs ${mutedTx}`}>+{detectedTools.length - 3}</span>}
            </div>
          )}

          <button
            onClick={resetChat}
            title="Nouvelle conversation"
            className={`p-1.5 rounded-lg transition-colors ${isDark ? 'text-gray-500 hover:text-white hover:bg-[#1a2035]' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto px-5 py-6">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-5 max-w-2xl mx-auto text-center">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isDark ? 'bg-blue-500/10 border border-blue-500/20' : 'bg-blue-50 border border-blue-100'}`}>
              <Bot size={22} className="text-blue-400" />
            </div>
            <div>
              <h2 className={`text-base font-semibold mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>Comment puis-je vous aider ?</h2>
              <p className={`text-sm ${mutedTx}`}>Infrastructure, conteneurs, CI/CD — posez votre question.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
              {QUICK_QUESTIONS.map(q => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className={`flex items-start gap-2 px-4 py-3 rounded-xl text-xs text-left border transition-all ${isDark ? 'border-[#1a2035] text-gray-300 hover:border-blue-500/40 hover:text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300 hover:shadow-sm'}`}
                >
                  <Zap size={11} className="text-blue-400 flex-shrink-0 mt-0.5" />
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto">
            {messages.map((msg, i) =>
              msg.role === 'user' ? (
                <div key={i} className="flex justify-end mb-4">
                  <div className={`rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[75%] text-sm ${isDark ? 'bg-blue-600 text-white' : 'bg-blue-500 text-white'}`}>
                    {msg.content}
                  </div>
                </div>
              ) : (
                <AssistantMessage key={i} msg={msg} />
              )
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* ── Input ── */}
      <div className="flex-shrink-0 px-5 pb-4 pt-2">
        <div className="max-w-2xl mx-auto">

          {/* Suggestions — ligne unique, pas de wrap */}
          {messages.length > 0 && (
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto mb-2">
              {QUICK_QUESTIONS.map(q => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className={`flex-shrink-0 text-xs px-3 py-1 rounded-full border whitespace-nowrap transition-colors ${isDark ? 'border-[#2d3748] text-gray-400 hover:text-white hover:border-blue-500/40' : 'border-gray-200 text-gray-500 hover:text-gray-800 hover:border-blue-300'}`}
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Zone de saisie — style Claude/ChatGPT */}
          <form
            onSubmit={handleSubmit}
            className={`flex items-end gap-2 rounded-2xl border px-4 py-2.5 transition-shadow focus-within:ring-1 ${isDark ? 'bg-[#1a2035] border-[#2d3748] focus-within:ring-blue-500/30' : 'bg-white border-gray-300 focus-within:ring-blue-400/30'}`}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={selectedVps ? `Question sur ${selectedVps.name}…` : 'Pose une question DevOps…'}
              rows={1}
              className={`flex-1 resize-none bg-transparent text-sm outline-none leading-relaxed ${isDark ? 'text-white placeholder-gray-500' : 'text-gray-900 placeholder-gray-400'}`}
              style={{ minHeight: '24px', maxHeight: '120px' }}
              onInput={e => {
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = Math.min(el.scrollHeight, 120) + 'px';
              }}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="flex-shrink-0 w-8 h-8 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors mb-0.5"
            >
              <Send size={13} className="text-white" />
            </button>
          </form>

          <p className={`text-[10px] mt-1.5 text-center ${mutedTx}`}>
            Entrée pour envoyer · Maj+Entrée pour nouvelle ligne
          </p>
        </div>
      </div>

    </div>
  );
}
