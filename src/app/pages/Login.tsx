import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Eye, EyeOff, Github, Chrome, Loader2 } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router';
import { getCurrentUser, loginUser } from '../auth-api';
import { resolveAuthUrl } from '../lib/runtime';

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

const OAUTH_ERRORS: Record<string, string> = {
  github_not_configured: 'GitHub OAuth n\'est pas configuré. Ajoutez GITHUB_CLIENT_ID et GITHUB_CLIENT_SECRET dans le fichier .env du backend.',
  github_oauth_failed: 'L\'authentification GitHub a échoué. Veuillez réessayer.',
};

export default function Login() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [checking, setChecking] = useState(true);
  const navigate      = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    // Check OAuth error from URL
    const oauthErr = searchParams.get('error');
    if (oauthErr) setError(OAUTH_ERRORS[oauthErr] || 'Authentication failed. Please try again.');

    let active = true;
    getCurrentUser()
      .then(() => { if (active) navigate('/', { replace: true }); })
      .catch(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [navigate, searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail || !password) {
      setError('Veuillez remplir tous les champs.');
      return;
    }
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      setError('Adresse email invalide. Utilisez un format valide comme nom@exemple.com');
      return;
    }

    setLoading(true);
    try {
      await loginUser({ email: trimmedEmail, password });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connexion impossible. Vérifiez vos identifiants.');
      setLoading(false);
    }
  };

  const handleGithub = () => {
    window.location.href = resolveAuthUrl('/api/auth/github');
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
          <p className="mt-1 text-sm text-[#64748b]">Sign in to your dashboard</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl p-6"
          style={{
            background: 'rgba(15, 23, 42, 0.8)',
            border: '1px solid #1e293b',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 25px 50px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
          }}>

          {/* Social login */}
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
          <div className="relative mb-6 flex items-center gap-3">
            <div className="flex-1 h-px bg-[#1e293b]" />
            <span className="text-[11px] text-[#334155] font-medium">or continue with email</span>
            <div className="flex-1 h-px bg-[#1e293b]" />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#94a3b8]">Email</label>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="vous@exemple.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-[#334155] outline-none transition-all focus:ring-2 focus:ring-[#3b82f6]/40"
                style={{ background: '#0a0f1e', border: '1px solid #1e293b' }}
                onFocus={e  => (e.target.style.borderColor = '#3b82f660')}
                onBlur={e   => (e.target.style.borderColor = '#1e293b')}
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-medium text-[#94a3b8]">Password</label>
                <button type="button" onClick={() => navigate('/signup')}
                  className="text-[11px] text-[#3b82f6] hover:underline">
                  Create account
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full rounded-xl px-4 py-3 pr-10 text-sm text-white placeholder-[#334155] outline-none transition-all focus:ring-2 focus:ring-[#3b82f6]/40"
                  style={{ background: '#0a0f1e', border: '1px solid #1e293b' }}
                  onFocus={e => (e.target.style.borderColor = '#3b82f660')}
                  onBlur={e  => (e.target.style.borderColor = '#1e293b')}
                />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#334155] hover:text-[#64748b] transition-colors">
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {error && (
              <motion.div
                className="rounded-xl px-4 py-2.5 text-xs text-red-400"
                style={{ background: '#ef444415', border: '1px solid #ef444430' }}
                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
                {error}
              </motion.div>
            )}

            <motion.button
              type="submit"
              disabled={loading}
              className="relative w-full overflow-hidden rounded-xl py-3 text-sm font-bold uppercase tracking-widest text-white transition-all disabled:opacity-70"
              style={{ background: '#3b82f6', boxShadow: '0 0 24px #3b82f640' }}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}>
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 size={15} className="animate-spin" /> Signing in...
                </span>
              ) : 'Sign In'}
            </motion.button>
          </form>
        </div>

        <p className="mt-6 text-center text-[11px] text-[#334155]">
          Don't have an account?{' '}
          <button onClick={() => navigate('/signup')} className="text-[#3b82f6] hover:underline font-medium">Create one</button>
        </p>
        <p className="mt-3 text-center text-[10px] text-[#1e293b]">MyPresc Deploy v1.2.4</p>
      </motion.div>
    </div>
  );
}
