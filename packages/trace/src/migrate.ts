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
 * Brings raw trace data to a schema version this build can read. Same-major
 * versions are accepted as-is, which is what keeps 1.0.0 documents byte-stable:
 * 1.1.0 only *adds* optional fields, so an older 1.x trace is already valid,
 * and rewriting its version string would change the content hash of every
 * committed artifact the moment it was loaded. Only structural changes get a
 * migration step.
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
