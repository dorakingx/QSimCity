import { useEffect, type ReactElement } from 'react';
import { useAppStore } from '../store/appStore.js';

/**
 * Transient status message; polite live region, auto-dismisses.
 *
 * The live region is mounted for the whole session and only its text
 * changes. Mounting a `role="status"` element that already contains its
 * message is the unreliable pattern: assistive technology has to observe
 * the region before the change to announce it, so an earlier version that
 * returned `null` when idle announced nothing at all in several readers.
 */
export function Toast(): ReactElement {
  const toast = useAppStore((s) => s.toast);
  const { clearToast } = useAppStore.getState();

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(clearToast, 5000);
    return () => clearTimeout(timer);
  }, [toast, clearToast]);

  return (
    <div
      className={toast ? 'toast' : 'toast toast-idle'}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {toast}
      {toast && (
        <button type="button" aria-label="Dismiss message" onClick={clearToast}>
          ×
        </button>
      )}
    </div>
  );
}
