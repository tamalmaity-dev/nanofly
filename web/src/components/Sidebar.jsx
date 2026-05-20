// src/components/Sidebar.jsx — Navigation sidebar with update indicator
import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';
import {
  LayoutDashboard, FolderOpen, Database, Globe, Terminal,
  Settings, LogOut, Server, Activity, ArrowUpCircle, Files
} from 'lucide-react';
import { updateApi } from '../api/client';

const NAV = [
  { label: 'Overview',    icon: LayoutDashboard, to: '/'           },
  { label: 'Projects',    icon: FolderOpen,       to: '/projects'   },
  { label: 'File Manager',icon: Files,            to: '/files'      },
  { label: 'Databases',   icon: Database,          to: '/databases'  },
  { label: 'Domains',     icon: Globe,             to: '/domains'    },
  { label: 'Terminal',    icon: Terminal,           to: '/terminal'   },
];

const SYSTEM = [
  { label: 'Services',    icon: Server,   to: '/services'  },
  { label: 'Activity',    icon: Activity, to: '/activity'  },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [hasUpdate, setHasUpdate] = useState(false);
  const [latestVersion, setLatestVersion] = useState('');
  const [currentVersion, setCurrentVersion] = useState('');

  useEffect(() => {
    const checkUpdate = async () => {
      try {
        const res = await updateApi.check();
        if (res?.data) {
          if (res.data.current_version) {
            setCurrentVersion(res.data.current_version);
          }
          if (res.data.has_update) {
            setHasUpdate(true);
            setLatestVersion(res.data.latest_version || '');
          } else {
            setHasUpdate(false);
          }
        }
      } catch { /* ignore */ }
    };
    checkUpdate();
    const interval = setInterval(checkUpdate, 5 * 60 * 1000); // every 5 min
    return () => clearInterval(interval);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="sidebar-logo-icon">🚀</div>
          <span className="sidebar-logo-text">NanoFly</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 2, marginTop: 4 }}>
          <span style={{ fontSize: '0.675rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
            {currentVersion || 'v0.2.9-beta'}
          </span>
          <span style={{
            fontSize: '0.6rem',
            fontWeight: 700,
            background: 'rgba(234, 179, 8, 0.1)',
            color: '#eab308',
            padding: '1px 5px',
            borderRadius: '4px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
          }}>
            Beta
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        <span className="nav-section-title">Panel</span>
        {NAV.map(({ label, icon: Icon, to }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <Icon className="nav-icon" size={18} />
            {label}
          </NavLink>
        ))}

        <span className="nav-section-title" style={{ marginTop: '0.5rem' }}>System</span>
        {SYSTEM.map(({ label, icon: Icon, to }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <Icon className="nav-icon" size={18} />
            {label}
          </NavLink>
        ))}

        {/* Settings with update badge */}
        <NavLink
          to="/settings"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        >
          <Settings className="nav-icon" size={18} />
          Settings
          {hasUpdate && (
            <span style={{
              marginLeft: 'auto',
              background: 'var(--primary)',
              color: '#fff',
              fontSize: '0.6rem',
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: '10px',
              lineHeight: 1.2,
              animation: 'pulse 2s ease-in-out infinite',
            }}>
              UPDATE
            </span>
          )}
        </NavLink>
      </nav>

      {/* Update toast */}
      {hasUpdate && (
        <div
          onClick={() => navigate('/settings')}
          style={{
            margin: '0 0.75rem 0.5rem',
            padding: '0.625rem 0.875rem',
            background: 'rgba(79,110,247,0.08)',
            border: '1px solid rgba(79,110,247,0.2)',
            borderRadius: 'var(--radius)',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ArrowUpCircle size={16} color="var(--primary)" />
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--primary)' }}>
                Update Available
              </div>
              <div style={{ fontSize: '0.675rem', color: 'var(--text-muted)' }}>
                {latestVersion}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* User / Logout */}
      <div className="sidebar-bottom">
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '0.625rem 0.875rem',
          background: 'var(--bg-elevated)',
          borderRadius: 'var(--radius)',
          marginBottom: '0.5rem',
        }}>
          <div style={{
            width: 32, height: 32,
            background: 'var(--accent)',
            borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.875rem', fontWeight: 600, flexShrink: 0,
          }}>
            {(user?.name || user?.email || 'U')[0].toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.8125rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.name || 'Admin'}
            </div>
            <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.email}
            </div>
          </div>
          <span className="badge badge-green" style={{ fontSize: '0.625rem' }}>
            {user?.role}
          </span>
        </div>

        <button className="nav-item" style={{ color: 'var(--red)', width: '100%' }} onClick={handleLogout}>
          <LogOut size={16} />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
