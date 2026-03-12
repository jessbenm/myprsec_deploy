import { Outlet } from 'react-router';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import { useTheme } from './theme-context';

export default function Root() {
  const { theme } = useTheme();
  
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
      <div className="relative z-10 ml-[72px] flex h-full flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}