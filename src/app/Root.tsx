import { useEffect, useState } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import { useTheme } from './theme-context';
import { getCurrentUser } from './auth-api';
import { useUser } from '../user-context';

export default function Root() {
  const { theme } = useTheme();
  const { setUser } = useUser();
  const location = useLocation();
  const isFullscreen = location.pathname === '/assistant';
  const [isAuth, setIsAuth] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    getCurrentUser()
      .then(res => {
        if (!active) return;

        const currentUser = res.success ? res.data?.user : null;
        if (currentUser) {
          setUser(currentUser as any);
          setIsAuth(true);
          return;
        }

        setUser(null);
        setIsAuth(false);
      })
      .catch(() => {
        if (!active) return;
        setUser(null);
        setIsAuth(false);
      });

    return () => { active = false; };
  }, []);

  if (isAuth === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#06080f] text-sm text-slate-300">
        Checking session...
      </div>
    );
  }

  if (!isAuth) return <Navigate to="/login" replace />;
  
  return (
    <div className="app-shell relative h-screen transition-colors duration-300">
      {theme === 'dark' && (
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              'linear-gradient(rgba(59,130,246,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.03) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
      )}

      {theme === 'dark' && <div className="noise-overlay" />}

      <Sidebar />
      <div className="relative z-10 ml-[60px] flex h-full flex-col overflow-hidden">
        <Header />
        <main className={`flex-1 ${isFullscreen ? 'overflow-hidden' : 'overflow-auto'}`}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}