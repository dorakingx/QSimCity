import { TRACE_SCHEMA_VERSION } from './types.js';

export class TraceMigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TraceMigrationError';
  }
}

type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

/**
 * Ordered migrations from historical schema versions to their successors.
 * "0.9.0" was the pre-release format used during development: it lacked
 * `finalLayout` and named the seed field `randomSeed`.
 */
const MIGRATIONS: Record<string, { to: string; migrate: Migration }> = {
  '0.9.0': {
    to: '1.0.0',
    migrate: (data) => {
      const out: Record<string, unknown> = { ...data, schemaVersion: '1.0.0' };
      if (!('finalLayout' in out)) out['finalLayout'] = null;
      if ('randomSeed' in out && !('seed' in out)) {
        out['seed'] = String(out['randomSeed']);
        delete out['randomSeed'];
      }
      return out;
    },
  },
};

/**
 * Brings raw trace data to the current schema version. Same-major newer
 * minor/patch versions are accepted as-is (forward-compatible fields are
 * rejected later by strict schema parsing if unknown).
 */
export function migrateTraceData(data: unknown): unknown {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return data;
  let record = data as Record<string, unknown>;
  const initialVersion = record['schemaVersion'];
  if (typeof initialVersion !== 'string') return data;
  let version: string = initialVersion;
  let guard = 0;
  while (version !== TRACE_SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) {
      const [major] = version.split('.');
      const [currentMajor] = TRACE_SCHEMA_VERSION.split('.');
      if (major === currentMajor) return record; // same-major: let schema decide
      throw new TraceMigrationError(
        `Unsupported trace schema version ${version}; this build supports ${TRACE_SCHEMA_VERSION}`,
      );
    }
    record = step.migrate(record);
    version = step.to;
    if (++guard > 10) {
      throw new TraceMigrationError('Migration chain exceeded 10 steps; aborting');
    }
  }
  return record;
}
