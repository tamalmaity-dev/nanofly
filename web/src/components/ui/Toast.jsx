import React, { createContext, useContext, useState, useCallback } from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { X, CheckCircle2, AlertCircle, Info, Loader2 } from 'lucide-react';

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
    const duration = type === 'loading' ? 30000 : 5000;
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const promise = useCallback((promiseOrFn, messages) => {
    const loadingId = Math.random().toString(36).substring(2, 9);
    const loadingTitle = typeof messages.loading === 'string' ? messages.loading : 'Working...';
    setToasts(prev => [...prev, { id: loadingId, title: loadingTitle, description: '', type: 'loading' }]);

    const p = typeof promiseOrFn === 'function' ? promiseOrFn() : promiseOrFn;

    return Promise.resolve(p)
      .then((result) => {
        dismiss(loadingId);
        const successMsg = typeof messages.success === 'function' ? messages.success(result) : messages.success;
        toast(successMsg, '', 'success');
        return result;
      })
      .catch((err) => {
        dismiss(loadingId);
        const errorMsg = typeof messages.error === 'function' ? messages.error(err) : (messages.error || err?.message || 'Something went wrong');
        toast(errorMsg, '', 'error');
        throw err;
      });
  }, [toast, dismiss]);

  const toastObj = {
    success: (title, desc) => toast(title, desc, 'success'),
    error: (title, desc) => toast(title, desc, 'error'),
    info: (title, desc) => toast(title, desc, 'info'),
    promise,
  };

  return (
    <ToastContext.Provider value={toastObj}>
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
                {t.type === 'loading' && <Loader2 size={16} color="var(--accent)" className="spin" />}
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
