import { useEffect, type ReactElement } from 'react';
import { useAppStore } from '../store/appStore.js';

/** Transient status message; polite live region, auto-dismisses. */
export function Toast(): ReactElement | null {
  const toast = useAppStore((s) => s.toast);
  const { clearToast } = useAppStore.getState();

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(clearToast, 5000);
    return () => clearTimeout(timer);
  }, [toast, clearToast]);

  if (!toast) return null;
  return (
    <div className="toast" role="status" aria-live="polite">
      {toast}
      <button type="button" aria-label="Dismiss message" onClick={clearToast}>
        ×
      </button>
    </div>
  );
}
