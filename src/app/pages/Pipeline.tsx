import { useState } from 'react';
import { CheckCircle, AlertTriangle, RotateCcw, RefreshCw, Square } from 'lucide-react';
import { motion } from 'motion/react';
import { useTheme } from '../theme-context';

const stages = [
  { name: 'Push',   duration: '2s',      status: 'success' },
  { name: 'Tests',  duration: '1m 45s',  status: 'success' },
  { name: 'Build',  duration: '2m 12s',  status: 'running' },
  { name: 'Deploy', duration: '38s',     status: 'running' },
];

const testResults = [
  { name: 'Unit Tests',    passed: 47, total: 47, status: 'success' },
  { name: 'Integration',   passed: 12, total: 12, status: 'success' },
  { name: 'E2E Tests',     passed: 8,  total: 10, status: 'warning' },
  { name: 'Security Scan', passed: 1,  total: 1,  status: 'success' },
  { name: 'Docker Build',  passed: 1,  total: 1,  status: 'success' },
];

const totalTests  = testResults.reduce((a, t) => a + t.total, 0);
const passedTests = testResults.reduce((a, t) => a + t.passed, 0);
const score       = Math.round((passedTests / totalTests) * 100);
const circumference = 2 * Math.PI * 36;

function Spinner({ color = '#3b82f6' }: { color?: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" className="animate-spin" style={{ animationDuration: '1s' }}>
      <circle cx="11" cy="11" r="8" fill="none" stroke={`${color}30`} strokeWidth="2.5" />
      <circle cx="11" cy="11" r="8" fill="none" stroke={color} strokeWidth="2.5"
        strokeDasharray="20 30" strokeLinecap="round" />
    </svg>
  );
}

export default function Pipeline() {
  const [showModal, setShowModal] = useState(false);
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <div className="flex flex-col gap-3 text-sm">

      {/* Environment bar */}
      <div className="flex items-center gap-2 rounded-xl px-4 py-2.5"
        style={{
          background: isDark ? 'linear-gradient(90deg, #0f172a, #0d1a2e, #0f172a)' : '#f8fafc',
          border: `1px solid ${isDark ? '#1e3a5f' : '#e2e8f0'}`,
          boxShadow: isDark ? '0 0 20px #06b6d420' : 'none',
        }}>
        <span className="h-2 w-2 rounded-full bg-[#10b981]" style={{ boxShadow: '0 0 6px #10b981' }} />
        <span className="text-xs text-gray-400">Environment:</span>
        <div className="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold text-[#06b6d4]"
          style={{ background: '#06b6d420', border: '1px solid #06b6d450' }}>
          <span className="h-1.5 w-1.5 rounded-full bg-[#06b6d4]" style={{ boxShadow: '0 0 4px #06b6d4' }} />
          Staging
          <span className="text-[#0891b2]">▶</span>
        </div>
      </div>

      {/* CI/CD Pipeline */}
      <div>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-400">CI/CD Pipeline</h2>
        <div className="relative rounded-2xl overflow-hidden p-5"
          style={{
            background: isDark
              ? 'linear-gradient(135deg, #050d1a 0%, #0a1628 40%, #071220 70%, #050d1a 100%)'
              : '#f1f5f9',
            border: `1px solid ${isDark ? '#1e3a5f' : '#cbd5e1'}`,
            boxShadow: isDark ? '0 0 40px #06b6d415, inset 0 1px 0 #ffffff08' : 'none',
          }}>

          {isDark && (
            <div className="absolute top-0 left-0 right-0 h-px"
              style={{ background: 'linear-gradient(90deg, transparent, #06b6d4, #3b82f6, #06b6d4, transparent)' }} />
          )}
          {isDark && <>
            <div className="absolute top-0 left-1/4 w-40 h-40 rounded-full pointer-events-none"
              style={{ background: '#06b6d412', filter: 'blur(40px)' }} />
            <div className="absolute bottom-0 right-1/4 w-32 h-32 rounded-full pointer-events-none"
              style={{ background: '#1d4ed812', filter: 'blur(35px)' }} />
          </>}

          <div className="relative flex items-stretch gap-0 z-10">
            {stages.map((stage, i) => (
              <div key={stage.name} className="flex items-center flex-1">
                <motion.div
                  className="flex-1 rounded-xl p-4 flex flex-col justify-between"
                  style={{
                    background: isDark ? 'rgba(5,13,26,0.8)' : 'white',
                    border: `1px solid ${isDark ? '#1e3a5f' : '#e2e8f0'}`,
                    backdropFilter: 'blur(8px)',
                    minHeight: 90,
                    boxShadow: isDark ? 'none' : '0 1px 4px rgba(0,0,0,0.06)',
                  }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={`font-semibold text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>{stage.name}</span>
                    {stage.status === 'success' ? (
                      <CheckCircle size={18} className="text-[#10b981]"
                        style={{ filter: 'drop-shadow(0 0 4px #10b981)' }} />
                    ) : (
                      <Spinner color="#3b82f6" />
                    )}
                  </div>
                  <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{stage.duration}</div>
                  <div className="mt-3 h-0.5 rounded-full overflow-hidden"
                    style={{ background: isDark ? '#0f2040' : '#e2e8f0' }}>
                    <motion.div
                      className="h-full rounded-full"
                      style={{
                        background: stage.status === 'success'
                          ? 'linear-gradient(90deg, #06b6d4, #3b82f6)'
                          : 'linear-gradient(90deg, #3b82f6, #06b6d4)',
                        boxShadow: '0 0 6px #06b6d460',
                      }}
                      initial={{ width: '0%' }}
                      animate={{ width: stage.status === 'success' ? '100%' : '60%' }}
                      transition={{ duration: 1, delay: i * 0.2, ease: 'easeOut' }}
                    />
                  </div>
                </motion.div>

                {i < stages.length - 1 && (
                  <div className="flex items-center px-1.5 flex-shrink-0">
                    <div className="flex items-center">
                      <div className="h-px w-4"
                        style={{ background: isDark ? 'linear-gradient(90deg, #3b82f680, #06b6d480)' : '#cbd5e1' }} />
                      <div className="w-0 h-0" style={{
                        borderTop: '4px solid transparent',
                        borderBottom: '4px solid transparent',
                        borderLeft: `5px solid ${isDark ? '#06b6d4' : '#94a3b8'}`,
                        filter: isDark ? 'drop-shadow(0 0 3px #06b6d4)' : 'none',
                      }} />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom grid */}
      <div className="grid grid-cols-2 gap-3">

        {/* Pipeline Test Results */}
        <div className="relative rounded-2xl overflow-hidden p-5"
          style={{
            background: isDark
              ? 'linear-gradient(135deg, #050d1a 0%, #0a1628 50%, #050d1a 100%)'
              : 'white',
            border: `1px solid ${isDark ? '#1e3a5f' : '#e2e8f0'}`,
          }}>
          {isDark && (
            <div className="absolute bottom-0 left-0 right-0 h-24 pointer-events-none"
              style={{ background: 'linear-gradient(to top, #06b6d420, transparent)' }} />
          )}
          {isDark && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-48 h-16 rounded-full pointer-events-none"
              style={{ background: '#0891b218', filter: 'blur(20px)' }} />
          )}

          <div className="relative z-10 flex items-start justify-between mb-4">
            <h2 className="font-bold text-base">Pipeline Test Results</h2>
            <div className="flex flex-col items-center">
              <div className="relative w-16 h-16">
                <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
                  <circle cx="40" cy="40" r="36" fill="none"
                    stroke={isDark ? '#0f2040' : '#e2e8f0'} strokeWidth="5" />
                  <motion.circle cx="40" cy="40" r="36" fill="none"
                    stroke="#10b981" strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    initial={{ strokeDashoffset: circumference }}
                    animate={{ strokeDashoffset: circumference * (1 - score / 100) }}
                    transition={{ duration: 1.2, ease: 'easeOut' }}
                    style={{ filter: 'drop-shadow(0 0 6px #10b981)' }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-lg font-bold leading-none">{score}</span>
                </div>
              </div>
              <div className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-[#10b981]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
                Safe to Deploy
              </div>
            </div>
          </div>

          <div className="relative z-10 space-y-2.5">
            {testResults.map((t) => (
              <div key={t.name} className="flex items-center justify-between">
                <span className="text-xs text-gray-400">{t.name}</span>
                <div className="flex items-center gap-1.5 text-xs font-semibold">
                  <span>{t.passed}/{t.total}</span>
                  {t.status === 'success' ? (
                    <CheckCircle size={14} className="text-[#10b981]"
                      style={{ filter: 'drop-shadow(0 0 3px #10b981)' }} />
                  ) : (
                    <AlertTriangle size={14} className="text-[#f59e0b]" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Deploy Controls */}
        <div className="relative rounded-2xl overflow-hidden p-5"
          style={{
            background: isDark
              ? 'linear-gradient(135deg, #050d1a 0%, #0a1628 50%, #050d1a 100%)'
              : 'white',
            border: `1px solid ${isDark ? '#1e3a5f' : '#e2e8f0'}`,
          }}>
          {isDark && (
            <div className="absolute bottom-0 right-0 w-40 h-40 rounded-full pointer-events-none"
              style={{ background: '#1d4ed812', filter: 'blur(40px)' }} />
          )}

          <h2 className="font-bold text-base mb-3 relative z-10">Deploy Controls</h2>

          <div className="relative z-10 space-y-2.5">
            <div className="rounded-xl p-3"
              style={{ background: isDark ? '#ffffff06' : '#f8fafc', border: `1px solid ${isDark ? '#1e3a5f' : '#e2e8f0'}` }}>
              <div className="text-[10px] text-gray-500 mb-1">Version</div>
              <div className="text-lg font-bold">v1.2.4</div>
            </div>

            <div className="rounded-xl p-3"
              style={{ background: isDark ? '#ffffff06' : '#f8fafc', border: `1px solid ${isDark ? '#1e3a5f' : '#e2e8f0'}` }}>
              <div className="text-[10px] text-gray-500 mb-1">Test Status</div>
              <div className="flex items-center gap-2 text-base font-bold">
                {passedTests}/{totalTests} passed
                <AlertTriangle size={14} className="text-[#f59e0b]" />
              </div>
            </div>

            <motion.button
              onClick={() => setShowModal(true)}
              className="relative w-full rounded-xl py-3 text-xs font-bold uppercase tracking-widest text-white overflow-hidden"
              style={{
                background: 'linear-gradient(90deg, #06b6d4, #3b82f6, #10b981)',
                boxShadow: '0 0 20px #06b6d430',
              }}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
            >
              <span className="flex items-center justify-center gap-2">
                <Spinner color="#ffffff" />
                Deploy to Production
              </span>
            </motion.button>

            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Rollback', icon: RotateCcw, color: '#06b6d4' },
                { label: 'Restart',  icon: RefreshCw, color: '#3b82f6' },
                { label: 'Stop',     icon: Square,    color: '#ef4444' },
              ].map((btn, i) => (
                <button key={i}
                  className="flex items-center justify-center gap-1.5 rounded-xl py-2 text-[10px] font-semibold transition-all hover:opacity-80"
                  style={{
                    background: isDark ? '#ffffff06' : '#f8fafc',
                    border: `1px solid ${btn.color}40`,
                    color: btn.color,
                    boxShadow: `0 0 8px ${btn.color}20`,
                  }}>
                  <btn.icon size={11} />
                  {btn.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Deploy Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xl">
          <motion.div
            className="mx-4 w-full max-w-md rounded-2xl p-6"
            style={{
              background: isDark ? 'linear-gradient(135deg, #050d1a, #0a1628)' : 'white',
              border: `1px solid ${isDark ? '#1e3a5f' : '#e2e8f0'}`,
              boxShadow: isDark ? '0 0 60px #06b6d430' : '0 20px 60px rgba(0,0,0,0.2)',
            }}
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <h3 className="text-xl font-bold mb-4">Confirm Deployment</h3>
            <div className="space-y-3 mb-6 text-sm">
              {[
                { label: 'Version',          value: 'v1.2.4' },
                { label: 'Environment',      value: 'Production' },
                { label: 'Confidence Score', value: `${score}/100`, color: '#10b981' },
              ].map(r => (
                <div key={r.label} className="flex justify-between">
                  <span className="text-gray-400">{r.label}:</span>
                  <span className="font-semibold" style={{ color: r.color }}>{r.value}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowModal(false)}
                className="flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all hover:opacity-80"
                style={{ background: isDark ? '#ffffff10' : '#f1f5f9', border: `1px solid ${isDark ? '#1e3a5f' : '#e2e8f0'}` }}>
                Cancel
              </button>
              <button onClick={() => setShowModal(false)}
                className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white transition-all hover:opacity-90"
                style={{ background: 'linear-gradient(90deg, #06b6d4, #10b981)', boxShadow: '0 0 16px #06b6d430' }}>
                Deploy
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}