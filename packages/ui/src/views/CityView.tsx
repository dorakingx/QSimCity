import { useEffect, useRef, useState, type ReactElement } from 'react';
import { getDevice } from '@qsimcity/domain';
import { activityAtTick, INTERACTIVES } from '@qsimcity/world';
import { CityEngine, type CameraMode } from '@qsimcity/visual-engine';
import { useAppStore } from '../store/appStore.js';

/**
 * The 3D city canvas. Bridges the engine (imperative three.js) with the
 * store (declarative state). All scientific data flows one way: store ->
 * activity snapshot -> engine.
 */
export default function CityView(): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<CityEngine | null>(null);
  const [cameraMode, setCameraMode] = useState<CameraMode>('orbit');
  const [nearbyPrompt, setNearbyPrompt] = useState<string | null>(null);
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
      night: useAppStore.getState().settings.dayNight === 'night',
      reducedMotion: useAppStore.getState().settings.reducedMotion,
      particles: useAppStore.getState().settings.particles,
      labels: useAppStore.getState().settings.labels,
      onPick: (target) => {
        const s = useAppStore.getState();
        if (target.kind === 'district' && target.districtId) {
          s.select({ kind: 'district', districtId: target.districtId });
        } else if (target.kind === 'building' && target.buildingId && target.districtId) {
          s.select({ kind: 'building', buildingId: target.buildingId, districtId: target.districtId });
        } else if (target.kind === 'qubit' && target.qubit !== undefined) {
          s.select({ kind: 'qubit', qubit: target.qubit });
        } else if (target.kind === 'interactive' && target.interactiveId) {
          s.select({ kind: 'interactive', interactiveId: target.interactiveId });
        }
      },
      onContextLost: () => {
        useAppStore.getState().setWebglAvailable(false);
        useAppStore.getState().showToast('3D rendering was interrupted; switched to Accessible 2D Mode.');
      },
    });
    engineRef.current = engine;

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
      setNearbyPrompt(interactive ? `${interactive.name}: press E to ${interactive.prompt.toLowerCase()}` : null);
    }, 250);

    return () => {
      clearInterval(promptTimer);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      observer.disconnect();
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Settings propagation.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setNight(settings.dayNight === 'night');
    engine.setQuality(settings.quality);
    engine.setReducedMotion(settings.reducedMotion);
    engine.setParticles(settings.particles);
    engine.setLabels(settings.labels);
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
    engine.setActivity(trace ? activityAtTick(trace, tick) : null, Boolean(trace?.noise));
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
      {nearbyPrompt && (
        <p className="interactive-prompt" role="status">
          {nearbyPrompt}
        </p>
      )}
    </div>
  );
}
