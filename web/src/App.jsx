// src/App.jsx — Root component with routing and auth guards
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './store/auth';
import { setupApi } from './api/client';

import Sidebar      from './components/Sidebar';
import Login        from './pages/Login';
import Setup        from './pages/Setup';
import Dashboard    from './pages/Dashboard';
import Projects     from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import Databases    from './pages/Databases';
import Domains      from './pages/Domains';
import Terminal     from './pages/Terminal';
import Services     from './pages/Services';
import ActivityLog  from './pages/Activity';
import Settings     from './pages/Settings';
import FileManager   from './pages/FileManager';

// ── Shell layout ──────────────────────────────────────────────────────────────
function Shell() {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}

// ── Auth guard ────────────────────────────────────────────────────────────────
function RequireAuth() {
  const { user, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (!user)   return <Navigate to="/login" replace />;
  return <Shell />;
}

// ── Setup guard ───────────────────────────────────────────────────────────────
function SetupGuard({ children }) {
  const [checked, setChecked] = useState(false);
  const [needSetup, setNeed]  = useState(false);
  const { loading }           = useAuth();
  const location              = useLocation();

  useEffect(() => {
    setupApi.status()
      .then(res  => { setNeed(!res.setup_complete); setChecked(true); })
      .catch(()  => setChecked(true));
  }, []);

  if (!checked || loading) return <FullPageSpinner />;
  if (needSetup && location.pathname !== '/setup') return <Navigate to="/setup" replace />;
  if (!needSetup && location.pathname === '/setup') return <Navigate to="/" replace />;
  return children;
}

// ── Spinner ───────────────────────────────────────────────────────────────────
function FullPageSpinner() {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'var(--bg-base)', gap:12 }}>
      <div className="spinner" style={{ borderTopColor:'var(--accent)', width:24, height:24, borderWidth:3 }} />
      <span style={{ color:'var(--text-muted)', fontSize:'0.9rem' }}>Loading NanoFly…</span>
    </div>
  );
}

// ── Routes ────────────────────────────────────────────────────────────────────
function AppRoutes() {
  return (
    <BrowserRouter>
      <SetupGuard>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/setup" element={<Setup />} />

          <Route element={<RequireAuth />}>
            <Route path="/"              element={<Dashboard />} />
            <Route path="/projects"      element={<Projects />} />
            <Route path="/projects/:id"  element={<ProjectDetail />} />
            <Route path="/databases"     element={<Databases />} />
            <Route path="/domains"       element={<Domains />} />
            <Route path="/terminal"      element={<Terminal />} />
            <Route path="/files"         element={<FileManager />} />
            <Route path="/services"      element={<Services />} />
            <Route path="/activity"      element={<ActivityLog />} />
            <Route path="/settings"      element={<Settings />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SetupGuard>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
