/// <reference lib="webworker" />
import { parseQasm, QasmError } from '@qsimcity/domain';
import { runExperiment } from './experiment.js';
import { SimulationCancelledError } from './engine.js';
import type { WorkerRequest, WorkerResponse } from './worker-protocol.js';

/**
 * Simulator Web Worker entry point. All heavy computation happens here so
 * the main thread stays responsive (spec §12.1). The worker is stateless
 * between runs apart from the cancellation registry.
 */

const cancelled = new Set<number>();

const post = (message: WorkerResponse): void => {
  (self as unknown as Worker).postMessage(message);
};

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  if (msg.type === 'cancel') {
    cancelled.add(msg.requestId);
    return;
  }
  if (msg.type === 'run') {
    void handleRun(msg);
  }
};

async function handleRun(msg: Extract<WorkerRequest, { type: 'run' }>): Promise<void> {
  try {
    const circuit = parseQasm(msg.qasm);
    const { trace } = await runExperiment(circuit, {
      shots: msg.shots,
      seed: msg.seed,
      noise: msg.noise,
      programSource: msg.qasm,
      deviceId: msg.deviceId,
      onProgress: (fraction) => post({ type: 'progress', requestId: msg.requestId, fraction }),
      shouldCancel: () => cancelled.has(msg.requestId),
    });
    if (cancelled.has(msg.requestId)) {
      post({ type: 'cancelled', requestId: msg.requestId });
    } else {
      post({ type: 'result', requestId: msg.requestId, trace });
    }
  } catch (e) {
    if (e instanceof SimulationCancelledError) {
      post({ type: 'cancelled', requestId: msg.requestId });
    } else if (e instanceof QasmError) {
      post({
        type: 'error',
        requestId: msg.requestId,
        message: e.message,
        line: e.line,
        col: e.col,
      });
    } else {
      post({ type: 'error', requestId: msg.requestId, message: (e as Error).message });
    }
  } finally {
    cancelled.delete(msg.requestId);
  }
}
