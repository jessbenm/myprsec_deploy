import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Eye, EyeOff, Loader2, UserRound, Mail, Lock } from 'lucide-react';
import { useNavigate } from 'react-router';
import { getCurrentUser, signupUser } from '../auth-api';

export default function Signup() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    getCurrentUser()
      .then(() => {
        if (active) navigate('/', { replace: true });
      })
      .catch(() => {
        if (active) setChecking(false);
      });

    return () => { active = false; };
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name || !email || !password || !confirmPassword) {
      setError('Please fill in all fields.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await signupUser({ name, email, password, confirmPassword });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create account');
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#06080f] text-white">
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm text-slate-300">
          <Loader2 size={16} className="animate-spin text-sky-400" /> Checking session...
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#06080f]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-[-10%] left-[-10%] h-[500px] w-[500px] rounded-full" style={{ background: 'radial-gradient(circle, #3b82f618 0%, transparent 70%)' }} />
        <div className="absolute bottom-[-10%] right-[-10%] h-[500px] w-[500px] rounded-full" style={{ background: 'radial-gradient(circle, #8b5cf618 0%, transparent 70%)' }} />
        <div className="absolute top-[40%] left-[50%] h-[300px] w-[300px] -translate-x-1/2 rounded-full" style={{ background: 'radial-gradient(circle, #10b98110 0%, transparent 70%)' }} />
      </div>

      <motion.div
        className="relative z-10 w-full max-w-md px-6"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#3b82f6] to-[#8b5cf6] text-lg font-bold text-white shadow-2xl shadow-blue-500/30">
            MP
          </div>
          <h1 className="text-2xl font-bold text-white">MyPresc Deploy</h1>
          <p className="mt-1 text-sm text-[#64748b]">Create your account</p>
        </div>

        <div className="rounded-2xl p-6" style={{ background: 'rgba(15, 23, 42, 0.8)', border: '1px solid #1e293b', backdropFilter: 'blur(20px)', boxShadow: '0 25px 50px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#94a3b8]">Name</label>
              <div className="relative">
                <UserRound size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#64748b]" />
                <input value={name} onChange={e => setName(e.target.value)} type="text" placeholder="Your name" className="w-full rounded-xl px-10 py-3 text-sm text-white placeholder-[#334155] outline-none transition-all focus:ring-2 focus:ring-[#3b82f6]/40" style={{ background: '#0a0f1e', border: '1px solid #1e293b' }} />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#94a3b8]">Email</label>
              <div className="relative">
                <Mail size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#64748b]" />
                <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="you@example.com" className="w-full rounded-xl px-10 py-3 text-sm text-white placeholder-[#334155] outline-none transition-all focus:ring-2 focus:ring-[#3b82f6]/40" style={{ background: '#0a0f1e', border: '1px solid #1e293b' }} />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#94a3b8]">Password</label>
              <div className="relative">
                <Lock size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#64748b]" />
                <input value={password} onChange={e => setPassword(e.target.value)} type={showPass ? 'text' : 'password'} placeholder="Minimum 10 characters" className="w-full rounded-xl px-10 py-3 pr-10 text-sm text-white placeholder-[#334155] outline-none transition-all focus:ring-2 focus:ring-[#3b82f6]/40" style={{ background: '#0a0f1e', border: '1px solid #1e293b' }} />
                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#334155] hover:text-[#64748b] transition-colors">
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#94a3b8]">Confirm password</label>
              <input value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} type={showPass ? 'text' : 'password'} placeholder="Repeat password" className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-[#334155] outline-none transition-all focus:ring-2 focus:ring-[#3b82f6]/40" style={{ background: '#0a0f1e', border: '1px solid #1e293b' }} />
            </div>

            {error && <motion.div className="rounded-xl px-4 py-2.5 text-xs text-red-400" style={{ background: '#ef444415', border: '1px solid #ef444430' }} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>{error}</motion.div>}

            <motion.button type="submit" disabled={loading} className="relative w-full overflow-hidden rounded-xl py-3 text-sm font-bold uppercase tracking-widest text-white transition-all disabled:opacity-70" style={{ background: '#3b82f6', boxShadow: '0 0 24px #3b82f640' }} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>
              {loading ? <span className="flex items-center justify-center gap-2"><Loader2 size={15} className="animate-spin" /> Creating account...</span> : 'Sign Up'}
            </motion.button>
          </form>
        </div>

        <p className="mt-6 text-center text-[11px] text-[#334155]">
          Already have an account?{' '}
          <button onClick={() => navigate('/login')} className="text-[#3b82f6] hover:underline font-medium">Sign in</button>
        </p>
      </motion.div>
    </div>
  );
}