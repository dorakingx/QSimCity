import { QasmError } from '@qsimcity/domain';
import type { Trace } from 'qsimcity-trace';
import type { RunConfig, PipelineRunner, RunError } from '../store/appStore.js';
import { runPipeline } from './runPipeline.js';
import type { PipelineWorkerRequest, PipelineWorkerResponse } from './pipeline.worker.js';

function toPipelineConfig(config: RunConfig) {
  return {
    qasm: config.qasm,
    shots: config.shots,
    seed: config.seed,
    deviceId: config.deviceId,
    noise: config.noiseEnabled ? config.noise : null,
    layoutMethod: config.layoutMethod,
    optimize: config.optimize,
  };
}

class PipelineError extends Error implements RunError {
  line?: number;
  col?: number;

  constructor(message: string, line?: number, col?: number) {
    super(message);
    if (line !== undefined) this.line = line;
    if (col !== undefined) this.col = col;
  }
}

/** Production runner: computation happens in a dedicated Web Worker. */
export function createWorkerRunner(): PipelineRunner {
  const worker = new Worker(new URL('./pipeline.worker.ts', import.meta.url), {
    type: 'module',
  });
  let requestCounter = 0;
  let activeRequestId: number | null = null;

  return {
    run: (config, onProgress) =>
      new Promise<Trace>((resolve, reject) => {
        const requestId = ++requestCounter;
        activeRequestId = requestId;
        const onMessage = (event: MessageEvent<PipelineWorkerResponse>): void => {
          const msg = event.data;
          if (msg.requestId !== requestId) return;
          if (msg.type === 'progress') {
            onProgress(msg.fraction);
            return;
          }
          worker.removeEventListener('message', onMessage);
          activeRequestId = null;
          if (msg.type === 'result') resolve(msg.trace);
          else if (msg.type === 'cancelled') reject(new PipelineError('cancelled'));
          else reject(new PipelineError(msg.message, msg.line, msg.col));
        };
        worker.addEventListener('message', onMessage);
        const request: PipelineWorkerRequest = {
          type: 'run',
          requestId,
          config: toPipelineConfig(config),
        };
        worker.postMessage(request);
      }),
    cancel: () => {
      if (activeRequestId !== null) {
        const request: PipelineWorkerRequest = { type: 'cancel', requestId: activeRequestId };
        worker.postMessage(request);
      }
    },
  };
}

/**
 * Fallback runner for environments without Worker support (and for tests):
 * runs the same pipeline on the calling thread.
 */
export function createDirectRunner(): PipelineRunner {
  let cancelled = false;
  return {
    run: async (config, onProgress) => {
      cancelled = false;
      try {
        const { trace } = await runPipeline({
          ...toPipelineConfig(config),
          onProgress,
          shouldCancel: () => cancelled,
        });
        return trace;
      } catch (e) {
        if (e instanceof QasmError) {
          throw new PipelineError(e.message, e.line, e.col);
        }
        throw e;
      }
    },
    cancel: () => {
      cancelled = true;
    },
  };
}

export function createRunner(): PipelineRunner {
  if (typeof Worker !== 'undefined') return createWorkerRunner();
  return createDirectRunner();
}
