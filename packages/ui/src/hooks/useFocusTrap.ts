import { useEffect, type RefObject } from 'react';

/**
 * Keep Tab and Shift+Tab cycling inside an aria-modal dialog (WCAG 2.4.3),
 * and return focus to whatever opened it when it closes (WCAG 2.4.3 focus
 * order). Without the trap a keyboard user can Tab out of the dialog into
 * visually obscured background controls and operate them blind; without
 * the restore, dismissing any dialog dropped focus to document.body and
 * forced a re-traversal of the whole header. Attach to the dialog's
 * outermost element; every `aria-modal` surface must use it.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active = true): void {
  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;
    const opener = document.activeElement;
    const restoreFocus = (): void => {
      if (!(opener instanceof HTMLElement) || !opener.isConnected) return;
      // Only reclaim focus if the dialog still held it; a close that
      // deliberately moved focus somewhere else must not be overridden.
      const active_ = document.activeElement;
      if (active_ !== null && active_ !== document.body && !container.contains(active_)) return;
      opener.focus();
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Tab') return;
      const focusable = [
        ...container.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
        // Hidden or collapsed elements must not become the trap's endpoints,
        // or focus can land somewhere invisible. Nor may roving-tabindex
        // members (an ARIA radiogroup's unselected radios are buttons with
        // tabindex="-1"): they are not tab stops, so wrapping onto one
        // breaks the single-tab-stop invariant the pattern promises.
      ].filter(
        (el) =>
          el.getAttribute('tabindex') !== '-1' &&
          (el.offsetParent !== null || el === document.activeElement),
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const current = document.activeElement;
      if (e.shiftKey) {
        if (current === first || !container.contains(current)) {
          e.preventDefault();
          last.focus();
        }
      } else if (current === last || !container.contains(current)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      restoreFocus();
    };
  }, [ref, active]);
}
