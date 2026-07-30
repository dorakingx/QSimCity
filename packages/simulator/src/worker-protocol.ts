import type { Trace } from 'qsimcity-trace';
import type { NoiseModel } from './noise.js';

/** Messages the main thread sends to the simulator worker. */
export type WorkerRequest =
  | {
      readonly type: 'run';
      readonly requestId: number;
      readonly qasm: string;
      readonly shots: number;
      readonly seed: string;
      readonly noise: NoiseModel | null;
      readonly deviceId: string | null;
    }
  | { readonly type: 'cancel'; readonly requestId: number };

/** Messages the simulator worker sends back. */
export type WorkerResponse =
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
