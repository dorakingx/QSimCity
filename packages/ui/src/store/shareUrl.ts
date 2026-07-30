import { SAMPLE_CIRCUITS, DEVICES, getSampleCircuit } from '@qsimcity/domain';
import { DEFAULT_CONFIG, DEFAULT_NOISE, type RunConfig } from './appStore.js';

/**
 * Shareable sample URLs (spec §7.3, §15). Only bundled sample ids and plain
 * numeric/enum parameters ride in the URL — never user program text, so no
 * personal data enters query strings (spec §17).
 */

export function encodeShareUrl(config: RunConfig, base?: string): string {
  const url = new URL(base ?? globalThis.location?.href ?? 'https://qsimcity.example/');
  url.search = '';
  url.hash = '';
  if (config.sampleId) url.searchParams.set('sample', config.sampleId);
  url.searchParams.set('shots', String(config.shots));
  url.searchParams.set('seed', config.seed);
  url.searchParams.set('device', config.deviceId);
  if (config.noiseEnabled) {
    url.searchParams.set(
      'noise',
      [
        config.noise.readoutError,
        config.noise.depolarizing1q,
        config.noise.depolarizing2q,
        config.noise.amplitudeDamping,
        config.noise.phaseDamping,
      ].join(','),
    );
  }
  if (!config.optimize) url.searchParams.set('optimize', '0');
  if (config.layoutMethod === 'trivial') url.searchParams.set('layout', 'trivial');
  return url.toString();
}

export function decodeShareUrl(search: string): Partial<RunConfig> | null {
  const params = new URLSearchParams(search);
  const sampleId = params.get('sample');
  if (!sampleId) return null;
  if (!SAMPLE_CIRCUITS.some((s) => s.id === sampleId)) return null;
  const out: Partial<RunConfig> = {
    sampleId,
    qasm: getSampleCircuit(sampleId).qasm,
  };
  const shots = Number(params.get('shots'));
  if (Number.isInteger(shots) && shots >= 1 && shots <= 100_000) out.shots = shots;
  const seed = params.get('seed');
  if (seed && seed.length <= 100) out.seed = seed;
  const device = params.get('device');
  if (device && DEVICES.some((d) => d.id === device)) out.deviceId = device;
  const noise = params.get('noise');
  if (noise) {
    const parts = noise.split(',').map(Number);
    if (parts.length === 5 && parts.every((p) => Number.isFinite(p) && p >= 0 && p <= 1)) {
      out.noiseEnabled = true;
      out.noise = {
        readoutError: parts[0]!,
        depolarizing1q: parts[1]!,
        depolarizing2q: parts[2]!,
        amplitudeDamping: parts[3]!,
        phaseDamping: parts[4]!,
      };
    }
  } else {
    out.noiseEnabled = DEFAULT_CONFIG.noiseEnabled;
    out.noise = { ...DEFAULT_NOISE };
  }
  if (params.get('optimize') === '0') out.optimize = false;
  if (params.get('layout') === 'trivial') out.layoutMethod = 'trivial';
  return out;
}
