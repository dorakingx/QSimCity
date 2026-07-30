import { registerSW } from 'virtual:pwa-register';
import { useAppStore } from '@qsimcity/ui';

/**
 * Service-worker registration with safe update flow (spec §17): a new
 * version never hijacks the session; the user is told and can refresh.
 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  const updateSW = registerSW({
    onNeedRefresh() {
      const s = useAppStore.getState();
      s.showToast('A new version of QSimCity is ready. Reload to update.');
      // The toast informs; applying happens on the user's next reload.
      void updateSW;
    },
    onOfflineReady() {
      useAppStore.getState().showToast('QSimCity is ready to work offline.');
    },
  });
}
