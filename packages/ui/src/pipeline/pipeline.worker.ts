/// <reference lib="webworker" />
import { QasmError } from '@qsimcity/domain';
import { SimulationCancelledError } from '@qsimcity/simulator';
import { runPipeline, type PipelineConfig } from './runPipeline.js';
import type { Trace } from 'qsimcity-trace';

/** Web Worker wrapper around the lab pipeline (spec §12.1, §13). */

export type PipelineWorkerRequest =
  | {
      readonly type: 'run';
      readonly requestId: number;
      readonly config: Omit<PipelineConfig, 'onProgress' | 'shouldCancel'>;
    }
  | { readonly type: 'cancel'; readonly requestId: number };

export type PipelineWorkerResponse =
  | { readonly type: 'progress'; readonly requestId: number; readonly fraction: number }
  | { readonly type: 'result'; readonly requestId: number; readonly trace: Trace }
  | {
      readonly type: 'error';
      readonly requestId: number;
      readonly message: string;
      readonly line?: number;
      readonly col?: number;
    }
  | { readonly type: 'cancelled'; readonly requestId: number };

const cancelledIds = new Set<number>();

const post = (message: PipelineWorkerResponse): void => {
  (self as unknown as Worker).postMessage(message);
};

self.onmessage = (event: MessageEvent<PipelineWorkerRequest>) => {
  const msg = event.data;
  if (msg.type === 'cancel') {
    cancelledIds.add(msg.requestId);
    return;
  }
  void handle(msg);
};

async function handle(msg: Extract<PipelineWorkerRequest, { type: 'run' }>): Promise<void> {
  try {
    const { trace } = await runPipeline({
      ...msg.config,
      onProgress: (fraction) => post({ type: 'progress', requestId: msg.requestId, fraction }),
      shouldCancel: () => cancelledIds.has(msg.requestId),
    });
    if (cancelledIds.has(msg.requestId)) {
      post({ type: 'cancelled', requestId: msg.requestId });
    } else {
      post({ type: 'result', requestId: msg.requestId, trace });
    }
  } catch (e) {
    if (e instanceof SimulationCancelledError) {
      post({ type: 'cancelled', requestId: msg.requestId });
    } else if (e instanceof QasmError) {
      post({ type: 'error', requestId: msg.requestId, message: e.message, line: e.line, col: e.col });
    } else {
      post({ type: 'error', requestId: msg.requestId, message: (e as Error).message });
    }
  } finally {
    cancelledIds.delete(msg.requestId);
  }
}
