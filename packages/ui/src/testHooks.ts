/**
 * Deterministic-frame contract for end-to-end tests.
 *
 * Visual tests used to wait with `page.waitForTimeout(6500)` and hope the
 * city had settled. That is not a synchronisation primitive, it is a bet on
 * machine speed, and it is the reason the suite passed on a developer
 * laptop with a GPU and failed on a CI runner rendering WebGL in software:
 * nine of the twenty CI failures were 60-second timeouts, not defects.
 *
 * These hooks replace the bet with a contract. A test can wait for the city
 * to be genuinely ready, pin every source of motion, and ask for exactly
 * one frame. Nothing here changes what the product renders — only *when* it
 * stops moving.
 *
 * The hooks exist only when the page is loaded with `?e2e=1`. A normal
 * visitor never gets this object, and no product code reads it.
 */

export interface TestHooks {
  /** Resolves once the 3D city has mounted and drawn its first frame. */
  readonly cityReady: Promise<void>;
  /** Whether a 3D engine is currently mounted. */
  isCityMounted(): boolean;
  /**
   * Stops the animation loop and settles every interpolator, pinning the
   * scene to a pure function of (trace, tick, settings, animTime).
   */
  freeze(animTime?: number): void;
  /** Draws one frame. Only meaningful after freeze(). */
  renderFrame(): void;
  /** Dismisses any transient status message so it cannot land in a shot. */
  clearToast(): void;
  /** Stops any further transient message from appearing. */
  suppressToasts(): void;
  /** Pins the replay to a tick and stops playback. */
  setTick(tick: number): void;
}

interface EngineLike {
  freeze(animTime?: number): void;
  renderFrame(): void;
}

let engine: EngineLike | null = null;
let resolveCityReady: (() => void) | null = null;
let cityReady: Promise<void> | null = null;

/**
 * True when the page asked for the test contract, either through `?e2e=1`
 * or through a flag an automation harness set before the app booted. The
 * second form exists so a test can enable the contract without rewriting
 * every URL under test.
 */
export function testHooksEnabled(): boolean {
  try {
    if ((globalThis as Record<string, unknown>)['__QSIMCITY_E2E'] === true) return true;
    return new URLSearchParams(globalThis.location?.search ?? '').get('e2e') === '1';
  } catch {
    return false;
  }
}

function ensureReadyPromise(): Promise<void> {
  cityReady ??= new Promise<void>((resolve) => {
    resolveCityReady = resolve;
  });
  return cityReady;
}

/**
 * Called by CityView once the engine has mounted and rendered. Safe to call
 * when the contract is disabled — it simply does nothing.
 */
export function publishEngineForTests(instance: EngineLike | null): void {
  if (!testHooksEnabled()) return;
  engine = instance;
  if (instance) {
    ensureReadyPromise();
    resolveCityReady?.();
  } else {
    // A fresh promise for the next mount, so a later wait cannot resolve
    // against a city that has since been torn down.
    cityReady = null;
    resolveCityReady = null;
  }
}

/**
 * Installs the hooks on `window`. Called once from the app entry; a no-op
 * unless `?e2e=1` is present.
 */
export function installTestHooks(actions: {
  clearToast: () => void;
  suppressToasts: () => void;
  setTick: (tick: number) => void;
  pause: () => void;
}): void {
  if (!testHooksEnabled()) return;
  const hooks: TestHooks = {
    get cityReady() {
      return ensureReadyPromise();
    },
    isCityMounted: () => engine !== null,
    freeze: (animTime = 12) => engine?.freeze(animTime),
    renderFrame: () => engine?.renderFrame(),
    clearToast: () => actions.clearToast(),
    suppressToasts: () => actions.suppressToasts(),
    setTick: (tick: number) => {
      actions.pause();
      actions.setTick(tick);
    },
  };
  (globalThis as unknown as Record<string, unknown>)['__qsimcityTest'] = hooks;
}
