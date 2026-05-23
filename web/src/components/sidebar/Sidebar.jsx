// src/components/Sidebar.jsx — Navigation sidebar with update indicator
import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../store/auth';
import { useTheme } from '../../context/ThemeContext';
import {
  LayoutDashboard, FolderOpen, Database, Globe, Terminal,
  Settings, LogOut, Server, Activity, ArrowUpCircle, Files,
  Sun, Moon, ChevronDown, GitBranch
} from 'lucide-react';
import { updateApi } from '../../api/client';
import { Button } from '../ui';
import { Modal } from '../ui/Modal';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '../ui/DropdownMenu';

const NAV = [
  { label: 'Overview', icon: LayoutDashboard, to: '/' },
  { label: 'Projects', icon: FolderOpen, to: '/projects' },
  { label: 'File Manager', icon: Files, to: '/files' },
  { label: 'Databases', icon: Database, to: '/databases' },
  { label: 'Sources', icon: GitBranch, to: '/sources' },
  { label: 'Domains', icon: Globe, to: '/domains' },
  { label: 'Terminal', icon: Terminal, to: '/terminal' },
];

const SYSTEM = [
  { label: 'Services', icon: Server, to: '/services' },
  { label: 'Activity', icon: Activity, to: '/activity' },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [hasUpdate, setHasUpdate] = useState(false);
  const [latestVersion, setLatestVersion] = useState('');
  const [currentVersion, setCurrentVersion] = useState('');
  const [confirmSignout, setConfirmSignout] = useState(false);

  useEffect(() => {
    const checkUpdate = async () => {
      try {
        const res = await updateApi.check();
        if (res) {
          if (res.current_version) {
            setCurrentVersion(res.current_version);
          }
          if (res.has_update) {
            setHasUpdate(true);
            setLatestVersion(res.latest_version || '');
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
      <div
        className="sidebar-logo"
        onClick={() => navigate('/settings#updates')}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 6,
          padding: '1.25rem 1.25rem 1rem',
          borderBottom: '1px solid var(--border)',
          cursor: 'pointer'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img
            src="/logo.png"
            alt="NanoFly Logo"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              objectFit: 'contain',
              flexShrink: 0
            }}
          />
          <span className="sidebar-logo-text" style={{
            fontSize: '1.25rem',
            fontWeight: '800',
            letterSpacing: '-0.02em',
            background: 'linear-gradient(135deg, #ffffff 0%, #a5b4fc 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            margin: 0
          }}>NanoFly</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <span style={{ fontSize: '0.675rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
            {currentVersion || 'dev'}
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
          to={hasUpdate ? "/settings#updates" : "/settings"}
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
          onClick={() => navigate('/settings#updates')}
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

      {/* User / Profile Dropdown (Radix UI) */}
      <div className="sidebar-bottom">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div className="user-profile-trigger" role="button" tabIndex={0}>
              <div className="user-avatar">
                {(user?.name || user?.email || 'U')[0].toUpperCase()}
              </div>
              <div className="user-info">
                <div className="user-name">{user?.name || 'Admin'}</div>
                <div className="user-email">{user?.email}</div>
              </div>
              <span className="user-dropdown-chevron">
                <ChevronDown size={14} />
              </span>
            </div>
          </DropdownMenuTrigger>

          <DropdownMenuContent side="top" sideOffset={6} align="end" className="user-dropdown-radix">
            <DropdownMenuItem onClick={() => navigate('/settings')}>
              <Settings size={15} />
              <span>Settings</span>
            </DropdownMenuItem>

            <DropdownMenuItem onClick={toggleTheme}>
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
              <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem color="red" onClick={() => setConfirmSignout(true)}>
              <LogOut size={15} />
              <span>Sign Out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Bottom action bar */}
        <div className="sidebar-bottom-actions">
          <button
            className="sidebar-action-btn"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <button
            className="sidebar-action-btn sidebar-signout-btn"
            onClick={() => setConfirmSignout(true)}
            title="Sign Out"
          >
            <LogOut size={15} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      <Modal
        open={confirmSignout}
        onOpenChange={setConfirmSignout}
        title="Sign out?"
        description="Your current panel session will be closed on this device."
        maxWidth={380}
      >
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: '1.25rem' }}>
          <Button variant="soft" color="gray" onClick={() => setConfirmSignout(false)}>
            Cancel
          </Button>
          <Button variant="solid" color="red" onClick={handleLogout} icon={LogOut}>
            Sign Out
          </Button>
        </div>
      </Modal>
    </aside>
  );
}