// src/store/auth.js — Global auth state (no external state lib needed)
import { createContext, useContext, useState, useEffect } from 'react';
import { authApi } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  // On mount: try to restore session from localStorage token
  useEffect(() => {
    const token = localStorage.getItem('nanofly_token');
    if (!token) { setLoading(false); return; }

    authApi.me()
      .then(setUser)
      .catch(() => {
        localStorage.removeItem('nanofly_token'); // token expired/invalid
      })
      .finally(() => setLoading(false));
  }, []);

  const login = (token, userData) => {
    localStorage.setItem('nanofly_token', token);
    setUser(userData);
  };

  const logout = () => {
    authApi.logout().catch(() => {});
    localStorage.removeItem('nanofly_token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
