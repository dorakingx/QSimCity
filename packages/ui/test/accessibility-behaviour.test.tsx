// @vitest-environment happy-dom
import { useRef, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useFocusTrap } from '../src/hooks/useFocusTrap.js';
import { CouplingMap } from '../src/components/CouplingMap.js';
import { TimelineBar } from '../src/components/TimelineBar.js';
import { Toast } from '../src/components/Toast.js';
import { DEFAULT_SETTINGS, prefersReducedMotion, useAppStore } from '../src/store/appStore.js';
import { runPipeline } from '../src/pipeline/runPipeline.js';
import { App } from '../src/App.js';
import { Accessible2DView } from '../src/views/Accessible2DView.js';

// Renders are not torn down between cases automatically in this setup, so
// queries would otherwise see every earlier test's DOM.
afterEach(cleanup);

/**
 * Behavioural cover for the accessibility fixes. These are the failures an
 * adversarial review found underneath a clean axe run and Lighthouse 100 —
 * automated auditors cannot see focus lifecycle, live-region behaviour, or
 * an OS media preference, so each one needs a test that exercises it.
 */

function Dialog({ open }: { open: boolean }): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, open);
  return (
    <div>
      <button type="button">opener</button>
      {open && (
        <div ref={ref} role="dialog" aria-modal="true">
          <button type="button">first</button>
          {/* A roving-tabindex member: focusable, but not a tab stop. */}
          <button type="button" tabIndex={-1}>
            roving
          </button>
          <button type="button">last</button>
        </div>
      )}
    </div>
  );
}

describe('focus trap', () => {
  it('returns focus to whatever opened the dialog when it closes', () => {
    const { rerender } = render(<Dialog open={false} />);
    const opener = screen.getByRole('button', { name: 'opener' });
    act(() => opener.focus());
    expect(document.activeElement).toBe(opener);

    rerender(<Dialog open />);
    act(() => screen.getByRole('button', { name: 'first' }).focus());
    expect(document.activeElement).not.toBe(opener);

    rerender(<Dialog open={false} />);
    // Without this, dismissing any dialog dropped a keyboard user at
    // document.body and forced a re-traversal of the whole header.
    expect(document.activeElement).toBe(opener);
  });

  it('does not reclaim focus when the close deliberately moved it elsewhere', () => {
    const { rerender } = render(<Dialog open={false} />);
    const opener = screen.getByRole('button', { name: 'opener' });
    act(() => opener.focus());
    rerender(<Dialog open />);

    const elsewhere = document.createElement('button');
    document.body.appendChild(elsewhere);
    act(() => elsewhere.focus());
    rerender(<Dialog open={false} />);
    expect(document.activeElement).toBe(elsewhere);
    elsewhere.remove();
  });

  it('wraps Tab past the last tab stop without landing on a roving member', () => {
    render(<Dialog open />);
    const last = screen.getByRole('button', { name: 'last' });
    const first = screen.getByRole('button', { name: 'first' });
    act(() => last.focus());
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    act(() => first.focus());
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    // tabindex="-1" is excluded, so the wrap lands on `last`, not `roving`.
    expect(document.activeElement).toBe(last);
  });

  it('ignores keys that are not Tab', () => {
    render(<Dialog open />);
    const first = screen.getByRole('button', { name: 'first' });
    act(() => first.focus());
    fireEvent.keyDown(document, { key: 'a' });
    expect(document.activeElement).toBe(first);
  });
});

describe('coupling map layout states', () => {
  it('omits logical qubits that have no physical home yet', () => {
    const { container } = render(
      <CouplingMap deviceId="linear-5" layout={[2, -1, 0]} layoutMoment="at tick 4" />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('logical 0 on physical 2');
    expect(text).toContain('logical 2 on physical 0');
    // -1 means "not assigned"; rendering it would claim physical qubit -1.
    expect(text).not.toContain('physical -1');
  });

  it('renders without a layout at all', () => {
    const { container } = render(<CouplingMap deviceId="linear-5" layout={null} />);
    expect(container.textContent ?? '').not.toContain('Layout');
  });

  it('states when no layout has been assigned yet', () => {
    const { container } = render(
      <CouplingMap deviceId="linear-5" layout={null} layoutMoment="not yet assigned at tick 0" />,
    );
    expect(container.textContent ?? '').toContain('not yet assigned at tick 0');
  });
});

describe('timeline boundary controls', () => {
  beforeEach(async () => {
    const { trace } = await runPipeline({
      qasm: 'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[2];\ncreg c[2];\nh q[0];\ncx q[0],q[1];\nmeasure q -> c;\n',
      shots: 16,
      seed: 'a11y',
      deviceId: 'linear-5',
      noise: null,
      layoutMethod: 'trivial',
      optimize: true,
    });
    useAppStore.setState({ trace, playbackTick: 0, settings: { ...DEFAULT_SETTINGS } });
  });

  it('keeps the step buttons focusable and inert at the boundaries', () => {
    const { container } = render(<TimelineBar />);
    const back = within(container).getByRole('button', { name: 'Step backward one tick' });
    // aria-disabled, not disabled: a disabled control is blurred by the
    // browser the moment it flips, dropping the user at document.body.
    expect(back.getAttribute('aria-disabled')).toBe('true');
    expect(back.hasAttribute('disabled')).toBe(false);
    act(() => back.focus());
    fireEvent.click(back);
    expect(useAppStore.getState().playbackTick).toBe(0);
    expect(document.activeElement).toBe(back);
  });
});

describe('status live region', () => {
  beforeEach(() => {
    useAppStore.setState({ toast: null });
  });

  it('stays mounted while idle so a later message is announced', () => {
    const { container } = render(<Toast />);
    const region = within(container).getByRole('status');
    expect(region.textContent).toBe('');
    act(() => useAppStore.getState().showToast('Run finished'));
    // Same element, new text — the pattern assistive technology can observe.
    expect(within(container).getByRole('status')).toBe(region);
    expect(region.textContent).toContain('Run finished');
  });

  it('can be dismissed', () => {
    const { container } = render(<Toast />);
    act(() => useAppStore.getState().showToast('Something happened'));
    fireEvent.click(within(container).getByRole('button', { name: 'Dismiss message' }));
    expect(useAppStore.getState().toast).toBeNull();
  });
});

describe('reduced motion preference', () => {
  const original = globalThis.matchMedia;
  afterEach(() => {
    globalThis.matchMedia = original;
  });

  it('reads the operating system preference', () => {
    globalThis.matchMedia = vi.fn().mockReturnValue({ matches: true }) as never;
    expect(prefersReducedMotion()).toBe(true);
    globalThis.matchMedia = vi.fn().mockReturnValue({ matches: false }) as never;
    expect(prefersReducedMotion()).toBe(false);
  });

  it('is false when the browser has no matchMedia at all', () => {
    (globalThis as { matchMedia?: unknown }).matchMedia = undefined;
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe('software rasterizer steering', () => {
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    useAppStore.setState({ toast: null });
  });

  function stubRenderer(name: string): void {
    HTMLCanvasElement.prototype.getContext = ((type: string) => {
      if (type !== 'webgl2') return null;
      return {
        RENDERER: 0x1f01,
        getExtension: () => null,
        getParameter: () => name,
      };
    }) as never;
  }

  it('tells the learner when 3D is being drawn in software', () => {
    // A blocklisted GPU, a VM, or a remote desktop hands the page a WebGL2
    // context that works and is about a hundred times too slow. Detection
    // used to stop at "does WebGL exist", so nobody was steered to 2D.
    stubRenderer('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))');
    render(<App />);
    expect(useAppStore.getState().toast ?? '').toContain('Accessible 2D');
  });

  it('says nothing on a real GPU', () => {
    stubRenderer('ANGLE Metal Renderer: Apple M2 Pro');
    render(<App />);
    expect(useAppStore.getState().toast ?? '').not.toContain('software');
  });
});

describe('2D coupling map before the layout stage', () => {
  it('says the layout is not assigned yet rather than inventing one', async () => {
    const { trace } = await runPipeline({
      qasm: 'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[3];\ncreg c[3];\nh q[0];\ncx q[0],q[2];\nmeasure q -> c;\n',
      shots: 16,
      seed: 'layout-moment',
      deviceId: 'ring-8',
      noise: null,
      layoutMethod: 'interaction',
      optimize: true,
    });
    const assignedAt =
      trace.events.find((e) => e.eventType === 'layout.assigned')?.logicalTick ?? 0;
    expect(assignedAt).toBeGreaterThan(0);

    useAppStore.setState({ trace, playbackTick: 0, settings: { ...DEFAULT_SETTINGS } });
    const before = render(<Accessible2DView />);
    expect(before.container.textContent ?? '').toContain('not yet assigned at tick 0');
    cleanup();

    useAppStore.setState({ playbackTick: assignedAt });
    const after = render(<Accessible2DView />);
    expect(after.container.textContent ?? '').toContain(`at tick ${assignedAt}`);
  });
});
