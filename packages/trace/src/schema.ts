import { z } from 'zod';
import {
  CERTAINTY_LABELS,
  EVENT_TYPES,
  SOURCE_CLASSIFICATIONS,
  STAGES,
  TRACE_LIMITS,
} from './types.js';

const qubitIndex = z
  .number()
  .int()
  .min(0)
  .max(TRACE_LIMITS.maxQubits - 1);

const provenanceSchema = z
  .object({
    generator: z.string().min(1).max(200),
    generatorVersion: z.string().min(1).max(100),
    details: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  })
  .strict();

const conditionSchema = z
  .object({
    creg: z.string().min(1).max(100),
    value: z.number().int().min(0),
  })
  .strict()
  .nullable();

const instructionSchema = z
  .object({
    id: z.string().min(1).max(64),
    kind: z.enum(['gate', 'measure', 'reset', 'barrier']),
    name: z.string().min(1).max(64),
    qubits: z.array(qubitIndex).max(TRACE_LIMITS.maxQubits),
    params: z.array(z.number().finite()).max(16),
    clbits: z.array(z.number().int().min(0).max(4095)).max(TRACE_LIMITS.maxQubits),
    condition: conditionSchema,
  })
  .strict();

const circuitSchema = z
  .object({
    name: z.string().max(200),
    numQubits: z.number().int().min(1).max(TRACE_LIMITS.maxQubits),
    numClbits: z.number().int().min(0).max(4096),
    cregs: z
      .array(
        z
          .object({ name: z.string().min(1).max(100), size: z.number().int().min(1).max(4096) })
          .strict(),
      )
      .max(64),
    instructions: z.array(instructionSchema).max(TRACE_LIMITS.maxEvents),
  })
  .strict();

const eventSchema = z
  .object({
    eventId: z.string().min(1).max(64),
    logicalTick: z.number().int().min(0),
    eventType: z.enum(EVENT_TYPES),
    stage: z.enum(STAGES),
    logicalQubits: z.array(qubitIndex).max(TRACE_LIMITS.maxQubits),
    physicalQubits: z.array(qubitIndex).max(TRACE_LIMITS.maxQubits),
    instructionId: z.string().min(1).max(64).nullable(),
    source: z.enum(SOURCE_CLASSIFICATIONS),
    certainty: z.enum(CERTAINTY_LABELS),
    payload: z.record(z.string(), z.unknown()),
    provenance: provenanceSchema,
    sourceDurationNs: z.number().finite().min(0).optional(),
  })
  .strict();

const countsSchema = z
  .object({
    counts: z.record(z.string().regex(/^[01]{1,64}$/), z.number().int().min(0)),
    shots: z.number().int().min(0).max(TRACE_LIMITS.maxShots),
    source: z.enum(SOURCE_CLASSIFICATIONS),
    certainty: z.enum(CERTAINTY_LABELS),
  })
  .strict();

const metricsSchema = z
  .object({
    stage: z.enum(['input', 'compiled']),
    gateCount: z.number().int().min(0),
    twoQubitGateCount: z.number().int().min(0),
    swapCount: z.number().int().min(0),
    depth: z.number().int().min(0),
  })
  .strict();

const noiseSchema = z
  .object({
    readoutError: z.number().min(0).max(1),
    depolarizing1q: z.number().min(0).max(1),
    depolarizing2q: z.number().min(0).max(1),
    amplitudeDamping: z.number().min(0).max(1),
    phaseDamping: z.number().min(0).max(1),
  })
  .strict()
  .nullable();

const layoutSchema = z.array(qubitIndex).max(TRACE_LIMITS.maxQubits).nullable();

export const traceSchema = z
  .object({
    schemaVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    traceId: z.string().min(1).max(128),
    createdAt: z.string().datetime({ offset: true }),
    generator: provenanceSchema,
    seed: z.string().min(1).max(200),
    packageVersions: z.record(z.string(), z.string().max(100)),
    inputHash: z.string().regex(/^[0-9a-f]{16}$/),
    deviceId: z.string().max(100).nullable(),
    shots: z.number().int().min(0).max(TRACE_LIMITS.maxShots),
    noise: noiseSchema,
    inputCircuit: circuitSchema,
    compiledCircuit: circuitSchema.nullable(),
    initialLayout: layoutSchema,
    finalLayout: layoutSchema,
    metrics: z.array(metricsSchema).max(8),
    results: z
      .object({
        idealProbabilities: z
          .record(z.string().regex(/^[01]{1,64}$/), z.number().min(0).max(1))
          .optional(),
        idealCounts: countsSchema.optional(),
        noisyCounts: countsSchema.optional(),
        execution: z
          .object({
            logicalReference: countsSchema,
            physicalIdeal: countsSchema.optional(),
            physicalNoisy: countsSchema.optional(),
          })
          .strict()
          .optional(),
      })
      .strict(),
    events: z.array(eventSchema).max(TRACE_LIMITS.maxEvents),
    telemetry: z
      .object({
        executedPasses: z.array(z.string().max(120)).max(2000).optional(),
        executedPassCount: z.number().int().min(0).optional(),
        notes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type TraceSchemaInput = z.input<typeof traceSchema>;
