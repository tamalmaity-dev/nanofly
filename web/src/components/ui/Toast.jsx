import React, { createContext, useContext, useState, useCallback } from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react';

const ToastContext = createContext(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((title, description = '', type = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, title, description, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      <ToastPrimitive.Provider swipeDirection="right">
        {children}
        {toasts.map(t => (
          <ToastPrimitive.Root
            key={t.id}
            className={`toast-root toast-${t.type}`}
            onOpenChange={open => {
              if (!open) {
                setToasts(prev => prev.filter(x => x.id !== t.id));
              }
            }}
          >
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span className="toast-icon" style={{ marginTop: 2, display: 'inline-flex' }}>
                {t.type === 'success' && <CheckCircle2 size={16} color="var(--green)" />}
                {t.type === 'error' && <AlertCircle size={16} color="var(--red)" />}
                {t.type === 'info' && <Info size={16} color="var(--accent)" />}
              </span>
              <div style={{ flex: 1 }}>
                <ToastPrimitive.Title className="toast-title">
                  {t.title}
                </ToastPrimitive.Title>
                {t.description && (
                  <ToastPrimitive.Description className="toast-desc">
                    {t.description}
                  </ToastPrimitive.Description>
                )}
              </div>
            </div>
            <ToastPrimitive.Close asChild>
              <button className="toast-close" aria-label="Close">
                <X size={14} />
              </button>
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="toast-viewport" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}
