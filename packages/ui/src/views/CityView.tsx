import { useEffect, useRef, useState, type ReactElement } from 'react';
import { getDevice } from '@qsimcity/domain';
import { activityAtTick, INTERACTIVES, weatherAt } from '@qsimcity/world';
import { CityAudio, CityEngine, type CameraMode } from '@qsimcity/visual-engine';
import { useAppStore } from '../store/appStore.js';
import { CityLegend } from '../components/CityLegend.js';

/**
 * The 3D city canvas. Bridges the engine (imperative three.js) with the
 * store (declarative state). All scientific data flows one way: store ->
 * activity snapshot -> engine.
 */
export default function CityView(): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<CityEngine | null>(null);
  const audioRef = useRef<CityAudio | null>(null);
  const [cameraMode, setCameraMode] = useState<CameraMode>('orbit');
  const [nearbyPrompt, setNearbyPrompt] = useState<string | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const settings = useAppStore((s) => s.settings);
  const trace = useAppStore((s) => s.trace);
  const tick = useAppStore((s) => s.playbackTick);
  const config = useAppStore((s) => s.config);
  const selection = useAppStore((s) => s.selection);
  const mode = useAppStore((s) => s.mode);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new CityEngine({
      canvas,
      quality: useAppStore.getState().settings.quality,
      timeOfDay: useAppStore.getState().settings.timeOfDay,
      reducedMotion: useAppStore.getState().settings.reducedMotion,
      particles: useAppStore.getState().settings.particles,
      labels: useAppStore.getState().settings.labels,
      onPick: (target) => {
        const s = useAppStore.getState();
        if (target.kind === 'district' && target.districtId) {
          s.select({ kind: 'district', districtId: target.districtId });
        } else if (target.kind === 'building' && target.buildingId && target.districtId) {
          s.select({
            kind: 'building',
            buildingId: target.buildingId,
            districtId: target.districtId,
          });
        } else if (target.kind === 'qubit' && target.qubit !== undefined) {
          s.select({ kind: 'qubit', qubit: target.qubit });
        } else if (target.kind === 'interactive' && target.interactiveId) {
          s.select({ kind: 'interactive', interactiveId: target.interactiveId });
        }
      },
      onContextLost: () => {
        useAppStore.getState().setWebglAvailable(false);
        useAppStore
          .getState()
          .showToast('3D rendering was interrupted; switched to Accessible 2D Mode.');
      },
    });
    engineRef.current = engine;
    // Stable read-only diagnostics hook for performance measurement tools
    // (never mutates scientific state); the full engine is exposed only in
    // dev builds for debugging.
    (globalThis as Record<string, unknown>)['__qsimcityStats'] = () => engine.renderStats();
    // Camera-only teleport for evidence capture and E2E walk tests: places
    // the first-person walker without touching any scientific state.
    (globalThis as Record<string, unknown>)['__qsimcityWalkTo'] = (
      x: number,
      z: number,
      yaw: number,
    ) => {
      engine.walkTo(x, z, yaw);
      setCameraMode('first-person');
    };
    if (import.meta.env.DEV) {
      (globalThis as Record<string, unknown>)['__qsimcityEngine'] = engine;
    }

    // Procedural audio: created eagerly (silent), context only on gesture.
    const audio = new CityAudio();
    audioRef.current = audio;
    const onGesture = (): void => audio.userGesture();
    window.addEventListener('pointerdown', onGesture);
    window.addEventListener('keydown', onGesture);

    const resize = (): void => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (rect) engine.resize(rect.width, rect.height);
    };
    resize();
    const observer = new ResizeObserver(resize);
    if (canvas.parentElement) observer.observe(canvas.parentElement);

    const onKeyDown = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (e.code === 'Digit1') engineAndSet('orbit');
      else if (e.code === 'Digit2') engineAndSet('top');
      else if (e.code === 'Digit3') engineAndSet('fly');
      else if (e.code === 'Digit4') engineAndSet('first-person');
      else if (e.code === 'KeyE' && engine.nearbyInteractiveId) {
        const interactive = INTERACTIVES.find((i) => i.id === engine.nearbyInteractiveId);
        if (interactive) useAppStore.getState().applyInteractiveAction(interactive.action);
      } else {
        engine.onKeyDown(e.code);
      }
    };
    const onKeyUp = (e: KeyboardEvent): void => engine.onKeyUp(e.code);
    const engineAndSet = (m: CameraMode): void => {
      engine.setCameraMode(m);
      setCameraMode(m);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const promptTimer = setInterval(() => {
      const id = engine.nearbyInteractiveId;
      const interactive = id ? INTERACTIVES.find((i) => i.id === id) : null;
      setNearbyPrompt(
        interactive ? `${interactive.name}: press E to ${interactive.prompt.toLowerCase()}` : null,
      );
    }, 250);

    return () => {
      clearInterval(promptTimer);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
      observer.disconnect();
      audio.dispose();
      audioRef.current = null;
      engine.dispose();
      engineRef.current = null;
      // The hook closures share this effect's scope, which references the
      // engine and canvas — leaving them registered would retain both.
      delete (globalThis as Record<string, unknown>)['__qsimcityStats'];
      delete (globalThis as Record<string, unknown>)['__qsimcityWalkTo'];
      if (import.meta.env.DEV) {
        delete (globalThis as Record<string, unknown>)['__qsimcityEngine'];
      }
    };
  }, []);

  // Settings propagation.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setTimeOfDay(settings.timeOfDay);
    engine.setQuality(settings.quality);
    engine.setReducedMotion(settings.reducedMotion);
    engine.setParticles(settings.particles);
    engine.setLabels(settings.labels);
    const audio = audioRef.current;
    if (audio) {
      audio.setEnabled(settings.audioEnabled);
      audio.setVolume(settings.audioVolume);
      audio.setTimeOfDay(settings.timeOfDay);
    }
  }, [settings]);

  // Device topology for the QPU Grid.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const deviceId = trace?.deviceId ?? config.deviceId;
    try {
      const device = getDevice(deviceId);
      engine.setDevice({ positions: device.positions, edges: device.edges });
    } catch {
      engine.setDevice(null);
    }
  }, [trace, config.deviceId]);

  // Activity per tick.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const activity = trace ? activityAtTick(trace, tick) : null;
    engine.setPlayback(trace, tick, Boolean(trace?.noise));
    // Semantic audio cues follow the same events every surface renders.
    const audio = audioRef.current;
    if (audio) audio.setRain(weatherAt(trace, tick).rain);
    if (audio && activity) {
      if (activity.eventsAtTick.some((e) => e.eventType === 'measurement.sampled')) {
        audio.cue('measurement');
      } else if (activity.eventsAtTick.some((e) => e.eventType === 'gate.executed')) {
        audio.cue('gate');
      }
      if (activity.eventsAtTick.some((e) => e.eventType === 'classical.condition_evaluated')) {
        audio.cue('courier');
      }
    }
  }, [trace, tick]);

  // Camera follows district selection (tour + inspector focus).
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (selection?.kind === 'district') engine.flyToDistrict(selection.districtId);
  }, [selection]);

  return (
    <div className="city-view" data-tour-active={mode === 'tour'}>
      <canvas
        ref={canvasRef}
        className="city-canvas"
        role="img"
        aria-label="3D quantum city. Districts along the boulevard represent pipeline stages: Program Port, IR Foundry, Layout Exchange, Routing Transit, Translation Refinery, Optimization Works, Scheduling Tower, QPU Grid, Noise Atmosphere, Measurement Harbor, Classical Control Center, and the Observatory. All information shown here is also available in Accessible 2D Mode."
      />
      <div className="camera-controls" role="toolbar" aria-label="Camera mode">
        {(
          [
            ['orbit', 'Orbit'],
            ['top', 'Top-down'],
            ['fly', 'Fly'],
            ['first-person', 'Walk'],
          ] as const
        ).map(([m, label], i) => (
          <button
            key={m}
            type="button"
            className={cameraMode === m ? 'active' : ''}
            aria-pressed={cameraMode === m}
            onClick={() => {
              engineRef.current?.setCameraMode(m);
              setCameraMode(m);
            }}
          >
            {label} <kbd>{i + 1}</kbd>
          </button>
        ))}
      </div>
      <button
        type="button"
        className="legend-toggle"
        aria-haspopup="dialog"
        data-mission-target="city-legend"
        onClick={() => setLegendOpen(true)}
      >
        Legend
      </button>
      {legendOpen && <CityLegend onClose={() => setLegendOpen(false)} />}
      {nearbyPrompt && (
        <p className="interactive-prompt" role="status">
          {nearbyPrompt}
        </p>
      )}
      {(cameraMode === 'first-person' || cameraMode === 'fly') && (
        <TouchJoystick
          showLift={cameraMode === 'fly'}
          onMove={(forward, strafe) => engineRef.current?.setMoveAxis(forward, strafe)}
          onLift={(lift) => engineRef.current?.setMoveAxis(0, 0, lift)}
        />
      )}
    </div>
  );
}

const JOYSTICK_PAD_STYLE: React.CSSProperties = {
  width: 108,
  height: 108,
  borderRadius: '50%',
  background: 'rgba(16, 20, 30, 0.55)',
  border: '2px solid rgba(255, 255, 255, 0.35)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  touchAction: 'none',
};

const JOYSTICK_BUTTON_STYLE: React.CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: 12,
  background: 'rgba(16, 20, 30, 0.55)',
  border: '2px solid rgba(255, 255, 255, 0.35)',
  color: '#fff',
  fontSize: 18,
  touchAction: 'none',
};

/**
 * On-screen movement control for walk and fly modes so touch users can move,
 * not just look (W5.2). A drag inside the pad maps to forward/strafe in
 * [-1, 1]; fly mode adds rise and descend buttons. Styled inline: the
 * control is self-contained and mode-scoped.
 */
function TouchJoystick({
  showLift,
  onMove,
  onLift,
}: {
  showLift: boolean;
  onMove: (forward: number, strafe: number) => void;
  onLift: (lift: number) => void;
}): ReactElement {
  const padRef = useRef<HTMLDivElement>(null);
  const activePointer = useRef<number | null>(null);

  const applyFromEvent = (e: React.PointerEvent): void => {
    const pad = padRef.current;
    if (!pad) return;
    const rect = pad.getBoundingClientRect();
    const dx = (e.clientX - rect.left - rect.width / 2) / (rect.width / 2);
    const dy = (e.clientY - rect.top - rect.height / 2) / (rect.height / 2);
    const clamp = (v: number): number => Math.max(-1, Math.min(1, v));
    onMove(clamp(-dy), clamp(dx));
  };

  return (
    <div
      className="touch-joystick"
      style={{
        position: 'absolute',
        left: 18,
        bottom: 86,
        display: 'flex',
        alignItems: 'flex-end',
        gap: 10,
        zIndex: 5,
      }}
    >
      <div
        ref={padRef}
        style={JOYSTICK_PAD_STYLE}
        role="application"
        aria-label="Movement pad: drag to walk or fly"
        onPointerDown={(e) => {
          activePointer.current = e.pointerId;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          applyFromEvent(e);
        }}
        onPointerMove={(e) => {
          if (activePointer.current === e.pointerId) applyFromEvent(e);
        }}
        onPointerUp={(e) => {
          if (activePointer.current === e.pointerId) {
            activePointer.current = null;
            onMove(0, 0);
          }
        }}
        onPointerCancel={() => {
          activePointer.current = null;
          onMove(0, 0);
        }}
      >
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.55)',
            pointerEvents: 'none',
          }}
        />
      </div>
      {showLift && (
        <div
          role="group"
          aria-label="Altitude"
          style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          {(
            [
              ['Rise', 1, 'up'],
              ['Descend', -1, 'down'],
            ] as const
          ).map(([label, value, glyph]) => (
            <button
              key={label}
              type="button"
              aria-label={label}
              style={JOYSTICK_BUTTON_STYLE}
              onPointerDown={(e) => {
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
                onLift(value);
              }}
              onPointerUp={() => onLift(0)}
              onPointerCancel={() => onLift(0)}
            >
              {glyph === 'up' ? '+' : '-'}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
