import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Eye, EyeOff, Loader2, UserRound, Mail, Lock, Github, Chrome } from 'lucide-react';
import { useNavigate } from 'react-router';
import { getCurrentUser, signupUser } from '../auth-api';

// Same regex as backend
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com','tempmail.com','guerrillamail.com','throwaway.email','sharklasers.com',
  'yopmail.com','trashmail.com','trashmail.me','dispostable.com','maildrop.cc',
  'fakeinbox.com','mailnesia.com','throwam.com','tempr.email','discard.email',
]);

function validateEmail(email: string): string | null {
  const e = email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(e)) return 'Adresse email invalide. Utilisez un format comme nom@exemple.com';
  const domain = e.split('@')[1];
  if (DISPOSABLE_DOMAINS.has(domain)) return 'Les adresses email temporaires/jetables ne sont pas autorisées.';
  return null;
}

export default function Signup() {
  const [name,            setName]            = useState('');
  const [email,           setEmail]           = useState('');
  const [password,        setPassword]        = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass,        setShowPass]        = useState(false);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState('');
  const [checking,        setChecking]        = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    getCurrentUser()
      .then(() => { if (active) navigate('/', { replace: true }); })
      .catch(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedName  = name.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedName || !trimmedEmail || !password || !confirmPassword) {
      setError('Veuillez remplir tous les champs.'); return;
    }
    if (trimmedName.length < 2) {
      setError('Le nom doit contenir au moins 2 caractères.'); return;
    }

    const emailErr = validateEmail(trimmedEmail);
    if (emailErr) { setError(emailErr); return; }

    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.'); return;
    }
    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas.'); return;
    }

    setLoading(true);
    try {
      await signupUser({ name: trimmedName, email: trimmedEmail, password, confirmPassword });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de créer le compte.');
      setLoading(false);
    }
  };

  const handleGithub = () => {
    window.location.href = '/api/auth/github';
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
      {/* Background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-[-10%] left-[-10%] h-[500px] w-[500px] rounded-full"
          style={{ background: 'radial-gradient(circle, #3b82f618 0%, transparent 70%)' }} />
        <div className="absolute bottom-[-10%] right-[-10%] h-[500px] w-[500px] rounded-full"
          style={{ background: 'radial-gradient(circle, #8b5cf618 0%, transparent 70%)' }} />
        <div className="absolute top-[40%] left-[50%] h-[300px] w-[300px] -translate-x-1/2 rounded-full"
          style={{ background: 'radial-gradient(circle, #10b98110 0%, transparent 70%)' }} />
      </div>

      <motion.div
        className="relative z-10 w-full max-w-md px-6"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#3b82f6] to-[#8b5cf6] text-lg font-bold text-white shadow-2xl shadow-blue-500/30">
            MP
          </div>
          <h1 className="text-2xl font-bold text-white">MyPresc Deploy</h1>
          <p className="mt-1 text-sm text-[#64748b]">Créer votre compte</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl p-6"
          style={{
            background: 'rgba(15, 23, 42, 0.8)',
            border: '1px solid #1e293b',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 25px 50px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
          }}>

          {/* Social signup */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <button
              onClick={handleGithub}
              className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold text-gray-300 transition-all hover:text-white"
              style={{ background: '#ffffff08', border: '1px solid #1e293b' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#ffffff18')}
              onMouseLeave={e => (e.currentTarget.style.background = '#ffffff08')}
            >
              <Github size={15} /> GitHub
            </button>
            <button
              disabled
              title="Google OAuth — coming soon"
              className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold text-gray-600 cursor-not-allowed"
              style={{ background: '#ffffff04', border: '1px solid #1e293b' }}
            >
              <Chrome size={15} /> Google
            </button>
          </div>

          {/* Divider */}
          <div className="relative mb-5 flex items-center gap-3">
            <div className="flex-1 h-px bg-[#1e293b]" />
            <span className="text-[11px] text-[#334155] font-medium">or sign up with email</span>
            <div className="flex-1 h-px bg-[#1e293b]" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#94a3b8]">Full Name</label>
              <div className="relative">
                <UserRound size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#64748b]" />
                <input value={name} onChange={e => setName(e.target.value)} type="text"
                  placeholder="Votre nom complet"
                  className="w-full rounded-xl px-10 py-3 text-sm text-white placeholder-[#334155] outline-none transition-all focus:ring-2 focus:ring-[#3b82f6]/40"
                  style={{ background: '#0a0f1e', border: '1px solid #1e293b' }} />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#94a3b8]">Email</label>
              <div className="relative">
                <Mail size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#64748b]" />
                <input value={email} onChange={e => setEmail(e.target.value)} type="email"
                  inputMode="email" autoComplete="email" placeholder="vous@exemple.com"
                  className="w-full rounded-xl px-10 py-3 text-sm text-white placeholder-[#334155] outline-none transition-all focus:ring-2 focus:ring-[#3b82f6]/40"
                  style={{ background: '#0a0f1e', border: '1px solid #1e293b' }} />
              </div>
              <p className="mt-1 text-[11px] text-[#64748b]">Adresse email valide requise (pas d'email temporaire)</p>
            </div>

            {/* Password */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#94a3b8]">Password</label>
              <div className="relative">
                <Lock size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#64748b]" />
                <input value={password} onChange={e => setPassword(e.target.value)}
                  type={showPass ? 'text' : 'password'} minLength={8}
                  placeholder="Minimum 8 caractères"
                  className="w-full rounded-xl px-10 py-3 pr-10 text-sm text-white placeholder-[#334155] outline-none transition-all focus:ring-2 focus:ring-[#3b82f6]/40"
                  style={{ background: '#0a0f1e', border: '1px solid #1e293b' }} />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#334155] hover:text-[#64748b] transition-colors">
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {/* Password strength indicator */}
              {password.length > 0 && (
                <div className="mt-1.5 flex gap-1">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="h-1 flex-1 rounded-full transition-all"
                      style={{
                        background: i <= (password.length < 8 ? 1 : password.length < 10 ? 2 : password.length < 14 ? 3 : 4)
                          ? (password.length < 8 ? '#ef4444' : password.length < 10 ? '#f59e0b' : password.length < 14 ? '#10b981' : '#3b82f6')
                          : '#1e293b'
                      }} />
                  ))}
                </div>
              )}
            </div>

            {/* Confirm */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#94a3b8]">Confirm Password</label>
              <input value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                type={showPass ? 'text' : 'password'} placeholder="Répétez le mot de passe"
                className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-[#334155] outline-none transition-all focus:ring-2 focus:ring-[#3b82f6]/40"
                style={{ background: '#0a0f1e', border: '1px solid #1e293b' }} />
              {confirmPassword && password !== confirmPassword && (
                <p className="mt-1 text-[11px] text-red-400">Les mots de passe ne correspondent pas</p>
              )}
            </div>

            {error && (
              <motion.div className="rounded-xl px-4 py-2.5 text-xs text-red-400"
                style={{ background: '#ef444415', border: '1px solid #ef444430' }}
                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
                {error}
              </motion.div>
            )}

            <motion.button type="submit" disabled={loading}
              className="relative w-full overflow-hidden rounded-xl py-3 text-sm font-bold uppercase tracking-widest text-white transition-all disabled:opacity-70"
              style={{ background: '#3b82f6', boxShadow: '0 0 24px #3b82f640' }}
              whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>
              {loading
                ? <span className="flex items-center justify-center gap-2"><Loader2 size={15} className="animate-spin" /> Creating account...</span>
                : 'Sign Up'}
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
