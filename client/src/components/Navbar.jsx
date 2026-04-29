import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import {
  LayoutDashboard, Utensils, CalendarDays, Bell, User, Stethoscope,
  MessageCircle, LogOut, Moon, Sun, Menu, X,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import api from '../utils/api.js';

const navItems = [
  { to: '/',          label: 'Dashboard',   icon: LayoutDashboard, roles: ['PATIENT'] },
  { to: '/food-log',  label: 'Food Log',    icon: Utensils,        roles: ['PATIENT'] },
  { to: '/meal-plan', label: 'Meal Plan',   icon: CalendarDays,    roles: ['PATIENT'] },
  { to: '/alerts',    label: 'Alerts',      icon: Bell,            roles: ['PATIENT'] },
  { to: '/doctor',    label: 'Portal',      icon: Stethoscope,     roles: ['DOCTOR', 'DIETITIAN'] },
  { to: '/profile',   label: 'Profile',     icon: User,            roles: ['PATIENT', 'DOCTOR', 'DIETITIAN'] },
];

export default function Navbar({ onOpenChat }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    if (user?.role === 'PATIENT') {
      api.get('/alerts').then((r) => {
        setUnread(r.data.alerts.filter((a) => !a.isRead).length);
      }).catch(() => {});
    }
  }, [user]);

  const handleLogout = () => { logout(); navigate('/login'); };

  const visible = navItems.filter((i) => i.roles.includes(user?.role));

  return (
    <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 font-bold text-xl text-brand-600">
            <span className="text-2xl">🩺</span>
            <span>GlucoAI</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            {visible.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors relative
                   ${isActive
                     ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300'
                     : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`
                }
              >
                <Icon className="w-4 h-4" />
                {label}
                {label === 'Alerts' && unread > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </NavLink>
            ))}
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            {user?.role === 'PATIENT' && (
              <button
                onClick={onOpenChat}
                aria-label="Open AI Coach"
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-brand-600 transition-colors"
              >
                <MessageCircle className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={() => setDark(!dark)}
              aria-label="Toggle dark mode"
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              {dark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <button
              onClick={handleLogout}
              aria-label="Log out"
              className="hidden md:flex p-2 rounded-lg text-gray-500 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
            <button
              className="md:hidden p-2 rounded-lg text-gray-500"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Menu"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden pb-3 space-y-1">
            {visible.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium
                   ${isActive ? 'bg-brand-50 text-brand-700' : 'text-gray-600 hover:bg-gray-100'}`
                }
              >
                <Icon className="w-4 h-4" />{label}
              </NavLink>
            ))}
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50"
            >
              <LogOut className="w-4 h-4" /> Log out
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
