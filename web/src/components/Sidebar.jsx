// src/components/Sidebar.jsx — Navigation sidebar
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';
import {
  LayoutDashboard, FolderOpen, Database, Globe, Terminal,
  Settings, LogOut, Server, Activity, ChevronRight
} from 'lucide-react';

const NAV = [
  { label: 'Overview',    icon: LayoutDashboard, to: '/'           },
  { label: 'Projects',    icon: FolderOpen,       to: '/projects'   },
  { label: 'Databases',   icon: Database,          to: '/databases'  },
  { label: 'Domains',     icon: Globe,             to: '/domains'    },
  { label: 'Terminal',    icon: Terminal,           to: '/terminal'   },
];

const SYSTEM = [
  { label: 'Services',    icon: Server,   to: '/services'  },
  { label: 'Activity',    icon: Activity, to: '/activity'  },
  { label: 'Settings',    icon: Settings, to: '/settings'  },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">🚀</div>
        <span className="sidebar-logo-text">NanoFly</span>
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
      </nav>

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
