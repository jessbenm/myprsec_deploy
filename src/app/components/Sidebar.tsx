import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Home, GitBranch, BarChart3, History, Server, Settings, User, Moon, Sun, Bell, LogOut, Bot } from 'lucide-react';
import { useTheme } from '../theme-context';
import { logoutUser } from '../auth-api';

const navItems = [
  { icon: Home,      path: '/',           label: 'Dashboard'  },
  { icon: GitBranch, path: '/pipeline',   label: 'Pipeline'   },
  { icon: BarChart3, path: '/monitoring', label: 'Monitoring' },
  { icon: History,   path: '/history',    label: 'History'    },
  { icon: Server,    path: '/servers',    label: 'Servers'    },
  { icon: Bot,       path: '/assistant',  label: 'Assistant DevOps' },
  { icon: Settings,  path: '/settings',   label: 'Settings'   },
];

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [loggingOut, setLoggingOut] = useState(false);
  const isDark = theme === 'dark';

  const bg      = isDark ? 'bg-[#0a0d14] border-[#1a2035]' : 'bg-[#f8fafc] border-gray-200';
  const mutedTx = isDark ? 'text-[#64748b]' : 'text-gray-400';
  const hoverBg = isDark ? 'hover:bg-[#111827] hover:text-[#94a3b8]' : 'hover:bg-gray-100 hover:text-gray-700';

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logoutUser();
    } finally {
      navigate('/login', { replace: true });
      setLoggingOut(false);
    }
  };

  return (
    <div className={`group/sb fixed left-0 top-0 z-40 flex h-screen flex-col border-r overflow-hidden w-[60px] hover:w-[200px] transition-[width] duration-200 ease-in-out ${bg}`}>

      {/* Brand */}
      <div className={`flex items-center gap-3 px-[14px] py-4 border-b flex-shrink-0 ${isDark ? 'border-[#1a2035]' : 'border-gray-200'}`}>
       <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[#0b1220] border border-blue-500/30 shadow-lg">
       <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <circle cx="6" cy="12" r="2" fill="#3b82f6"/>
          <circle cx="18" cy="6" r="2" fill="#3b82f6"/>
          <circle cx="18" cy="18" r="2" fill="#3b82f6"/>
          <path d="M8 12L16 6M8 12L16 18" stroke="#3b82f6" strokeWidth="1.5"/>
       </svg>
       </div>
        <div className="opacity-0 group-hover/sb:opacity-100 transition-opacity duration-150 whitespace-nowrap">
         <div className="text-lg font-extrabold tracking-tight text-white leading-none">
         Yam<span className="text-blue-300">Ops</span>
         
         </div>
         <div className="text-[10px] font-medium uppercase tracking-wider text-blue-300/70
           tracking-wider">
          DevOps Platform
         </div>
        </div>
      </div>

      {/* Section label */}
      <div className="px-[18px] pt-5 pb-1 flex-shrink-0">
        <span className={`text-[9px] font-semibold uppercase tracking-widest whitespace-nowrap opacity-0 group-hover/sb:opacity-100 transition-opacity duration-150 ${mutedTx}`}>
          Main Menu
        </span>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 px-2 flex-1 overflow-hidden">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              title={item.label}
              className={`relative flex items-center gap-3 rounded-lg px-[10px] py-2.5 text-xs font-medium whitespace-nowrap transition-all duration-150 ${
                isActive
                  ? isDark ? 'bg-[#1a2540] text-[#3b82f6]' : 'bg-blue-50 text-[#2563eb]'
                  : `${isDark ? 'text-[#64748b]' : 'text-gray-500'} ${hoverBg}`
              }`}
            >
              {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-[#3b82f6]" />}
              <Icon size={16} strokeWidth={isActive ? 2.2 : 1.8} className="flex-shrink-0" />
              <span className="opacity-0 group-hover/sb:opacity-100 transition-opacity duration-150">{item.label}</span>
              {isActive && (
                <div className="ml-auto h-1.5 w-1.5 rounded-full bg-[#3b82f6] flex-shrink-0 opacity-0 group-hover/sb:opacity-100 transition-opacity duration-150" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Divider */}
      <div className={`mx-3 my-2 h-px flex-shrink-0 ${isDark ? 'bg-[#1a2035]' : 'bg-gray-200'}`} />

      {/* Account label */}
      <div className="px-[18px] pb-1 flex-shrink-0">
        <span className={`text-[9px] font-semibold uppercase tracking-widest whitespace-nowrap opacity-0 group-hover/sb:opacity-100 transition-opacity duration-150 ${mutedTx}`}>
          Account
        </span>
      </div>

      {/* Bottom actions */}
      <div className="flex flex-col gap-0.5 px-2 pb-4 flex-shrink-0">

        <Link to="/profile" className={`flex items-center gap-3 rounded-lg px-[10px] py-2.5 text-xs font-medium whitespace-nowrap transition-all duration-150 ${location.pathname === '/profile' ? (isDark ? 'bg-[#1a2540] text-[#3b82f6]' : 'bg-blue-50 text-[#2563eb]') : `${isDark ? 'text-[#64748b]' : 'text-gray-500'} ${hoverBg}`}`}>
          <User size={16} strokeWidth={1.8} className="flex-shrink-0" />
          <span className="opacity-0 group-hover/sb:opacity-100 transition-opacity duration-150">Profile</span>
        </Link>

        <Link to="/alerts" className={`flex items-center gap-3 rounded-lg px-[10px] py-2.5 text-xs font-medium whitespace-nowrap transition-all duration-150 ${
          location.pathname === '/alerts'
            ? isDark ? 'bg-[#1a2540] text-[#3b82f6]' : 'bg-blue-50 text-[#2563eb]'
            : `${isDark ? 'text-[#64748b]' : 'text-gray-500'} ${hoverBg}`
        }`}>
          <div className="relative flex-shrink-0">
            <Bell size={16} strokeWidth={1.8} />
            <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-[#3b82f6]" style={{ border: `2px solid ${isDark ? '#0a0d14' : '#f8fafc'}` }} />
          </div>
          <span className="opacity-0 group-hover/sb:opacity-100 transition-opacity duration-150 flex-1 text-left">Alerts</span>
          <span className="opacity-0 group-hover/sb:opacity-100 transition-opacity duration-150 rounded-full bg-[#3b82f6]/15 px-1.5 py-0.5 text-[9px] font-semibold text-[#3b82f6]">3</span>
        </Link>

        <button
          onClick={toggleTheme}
          className={`flex items-center gap-3 rounded-lg px-[10px] py-2.5 text-xs font-medium whitespace-nowrap transition-all duration-150 ${isDark ? 'text-[#64748b]' : 'text-gray-500'} ${hoverBg}`}
        >
          {isDark ? <Sun size={16} strokeWidth={1.8} className="flex-shrink-0" /> : <Moon size={16} strokeWidth={1.8} className="flex-shrink-0" />}
          <span className="opacity-0 group-hover/sb:opacity-100 transition-opacity duration-150">{isDark ? 'Light Mode' : 'Dark Mode'}</span>
        </button>

        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className={`flex items-center gap-3 rounded-lg px-[10px] py-2.5 text-xs font-medium whitespace-nowrap transition-all duration-150 ${isDark ? 'text-[#64748b]' : 'text-gray-500'} ${hoverBg} disabled:opacity-60`}
        >
          <LogOut size={16} strokeWidth={1.8} className="flex-shrink-0" />
          <span className="opacity-0 group-hover/sb:opacity-100 transition-opacity duration-150">{loggingOut ? 'Signing out...' : 'Logout'}</span>
        </button>

        {/* Version badge */}
        <div className={`mt-2 mx-1 rounded-lg px-3 py-2 opacity-0 group-hover/sb:opacity-100 transition-opacity duration-200 ${isDark ? 'bg-[#111827]' : 'bg-gray-100'}`}>
          <div className={`text-[9px] font-medium ${mutedTx}`}>Version</div>
          <div className={`text-[10px] font-semibold ${isDark ? 'text-[#475569]' : 'text-gray-500'}`}>v1.2.4</div>
        </div>
      </div>
    </div>
  );
}