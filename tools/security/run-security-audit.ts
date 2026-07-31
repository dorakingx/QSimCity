/**
 * Security evidence generator.
 *
 * Runs the three checks SECURITY.md claims are run at release time and records
 * the result as a commit-bound evidence envelope:
 *
 *   1. `pnpm audit --json` over the whole workspace (JavaScript advisories).
 *   2. `uv run pip-audit` over the locked Python bridge environment.
 *   3. A repository-wide scan for committed credentials.
 *
 * A tool that cannot run is a failure, not a pass: if `pnpm audit` cannot
 * reach the registry or `uv` is not installed, this exits non-zero and the
 * envelope records `passed: false`, so `goal:check` refuses the evidence.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeEvidence, hashString } from '../evidence.js';
import { listTextFiles } from '../scan-files.js';

const ROOT = new URL('../..', import.meta.url).pathname;

const THRESHOLDS = {
  jsHighOrCritical: 0,
  pythonHighOrCritical: 0,
  secretsFound: 0,
} as const;

interface Advisory {
  readonly source: 'javascript' | 'python';
  readonly id: string;
  readonly package: string;
  readonly severity: string;
  readonly title: string;
}

interface SecretHit {
  readonly file: string;
  readonly line: number;
  readonly rule: string;
}

// ------------------------------------------------------------ JavaScript

interface PnpmAuditOutput {
  readonly advisories?: Record<string, PnpmAdvisory>;
  readonly metadata?: { readonly vulnerabilities?: Record<string, number> };
}

interface PnpmAdvisory {
  readonly id?: number | string;
  readonly github_advisory_id?: string;
  readonly module_name?: string;
  readonly severity?: string;
  readonly title?: string;
}

function auditJavaScript(): { advisories: Advisory[]; command: string } {
  const command = 'pnpm audit --json --audit-level low';
  const result = spawnSync('pnpm', ['audit', '--json', '--audit-level', 'low'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error !== undefined) {
    throw new Error(`could not run \`${command}\`: ${result.error.message}`);
  }
  const stdout = result.stdout ?? '';
  // `pnpm audit` exits non-zero when advisories exist, which is a normal
  // outcome, but it also exits non-zero when the registry is unreachable. The
  // difference is whether it produced parseable JSON.
  let parsed: PnpmAuditOutput;
  try {
    parsed = JSON.parse(stdout) as PnpmAuditOutput;
  } catch {
    throw new Error(
      `\`${command}\` produced no parseable JSON (exit ${result.status}). ` +
        `stderr: ${(result.stderr ?? '').trim().slice(0, 400)}`,
    );
  }
  const advisories: Advisory[] = [];
  for (const advisory of Object.values(parsed.advisories ?? {})) {
    advisories.push({
      source: 'javascript',
      id: String(advisory.github_advisory_id ?? advisory.id ?? 'unknown'),
      package: advisory.module_name ?? 'unknown',
      severity: (advisory.severity ?? 'unknown').toLowerCase(),
      title: advisory.title ?? '',
    });
  }
  return { advisories, command };
}

// ---------------------------------------------------------------- Python

interface PipAuditOutput {
  readonly dependencies?: readonly {
    readonly name?: string;
    readonly version?: string;
    readonly skip_reason?: string;
    readonly vulns?: readonly {
      readonly id?: string;
      readonly description?: string;
      readonly aliases?: readonly string[];
    }[];
  }[];
}

/**
 * The bridge package itself is local and has no PyPI record, so pip-audit
 * cannot resolve it. That one skip is expected; any other skip means a
 * dependency went unaudited and the run must not be reported as clean.
 */
const EXPECTED_AUDIT_SKIPS = new Set(['qsimcity-qiskit']);

/**
 * pip-audit reports advisory ids without a severity field, so every finding is
 * treated as high. That is the conservative direction: it can only make the
 * gate stricter, never falsely clean.
 */
function auditPython(): {
  advisories: Advisory[];
  command: string;
  audited: number;
} {
  const command = 'uv run --with pip-audit pip-audit --format json';
  const bridge = join(ROOT, 'python', 'qsimcity_qiskit');
  const probe = spawnSync('uv', ['--version'], {
    cwd: bridge,
    encoding: 'utf8',
  });
  if (probe.error !== undefined || probe.status !== 0) {
    throw new Error(
      'uv is not available, so the Python bridge cannot be audited. Install uv ' +
        '(https://docs.astral.sh/uv/) and rerun; the bridge is optional to use ' +
        'but not optional to audit.',
    );
  }
  const result = spawnSync('uv', ['run', '--with', 'pip-audit', 'pip-audit', '--format', 'json'], {
    cwd: bridge,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const stdout = result.stdout ?? '';
  let parsed: PipAuditOutput;
  try {
    parsed = JSON.parse(stdout) as PipAuditOutput;
  } catch {
    throw new Error(
      `\`${command}\` produced no parseable JSON (exit ${result.status}). ` +
        `stderr: ${(result.stderr ?? '').trim().slice(0, 400)}`,
    );
  }
  const dependencies = parsed.dependencies ?? [];
  if (dependencies.length === 0) {
    throw new Error(`\`${command}\` audited no dependencies at all`);
  }
  const unexpectedSkips = dependencies.filter(
    (d) => d.skip_reason !== undefined && !EXPECTED_AUDIT_SKIPS.has(d.name ?? ''),
  );
  if (unexpectedSkips.length > 0) {
    throw new Error(
      `pip-audit could not audit: ${unexpectedSkips
        .map((d) => `${d.name ?? '?'} (${d.skip_reason ?? ''})`)
        .join('; ')}`,
    );
  }
  const advisories: Advisory[] = [];
  for (const dependency of dependencies) {
    for (const vuln of dependency.vulns ?? []) {
      advisories.push({
        source: 'python',
        id: vuln.id ?? 'unknown',
        package: `${dependency.name ?? 'unknown'}@${dependency.version ?? '?'}`,
        severity: 'high',
        title: (vuln.description ?? '').split('\n')[0]?.slice(0, 160) ?? '',
      });
    }
  }
  return {
    advisories,
    command,
    audited: dependencies.filter((d) => d.skip_reason === undefined).length,
  };
}

// --------------------------------------------------------------- secrets

interface SecretRule {
  readonly name: string;
  readonly pattern: RegExp;
}

const SECRET_RULES: readonly SecretRule[] = [
  { name: 'aws-access-key-id', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'github-token', pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: 'slack-token', pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'google-api-key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'stripe-key', pattern: /\bsk_(?:live|test)_[0-9A-Za-z]{16,}\b/ },
  {
    name: 'private-key-block',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/,
  },
  {
    name: 'jwt',
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  },
  { name: 'npm-token', pattern: /\bnpm_[A-Za-z0-9]{36}\b/ },
  { name: 'vercel-token', pattern: /\bvercel_[A-Za-z0-9]{24,}\b/ },
  {
    name: 'assigned-credential',
    // `password = "…"`, `apiKey: '…'`, `secret_token="…"` with a real value.
    pattern:
      /\b(?:password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret)\b\s*[:=]\s*["'][^"'\s${}]{12,}["']/i,
  },
];

/** This file necessarily contains the detector patterns themselves. */
const SELF = 'tools/security/run-security-audit.ts';

function scanForSecrets(): SecretHit[] {
  const hits: SecretHit[] = [];
  const files = listTextFiles(ROOT).map((f) => ({
    rel: f.relPath,
    content: f.content,
  }));

  // `listTextFiles` walks by extension, so environment files (which have none)
  // would slip past the scan entirely. Any tracked `.env*` file is itself the
  // finding — this project calls no services and needs no credentials.
  const tracked = execFileSync('git', ['ls-files', '-z'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .split('\0')
    .filter((p) => p.length > 0);
  for (const rel of tracked) {
    const base = rel.split('/').pop() ?? rel;
    if (/^\.env(\..+)?$/.test(base) && base !== '.env.example') {
      hits.push({ file: rel, line: 1, rule: 'committed-env-file' });
    }
  }

  for (const file of files) {
    if (file.rel === SELF) continue;
    const lines = file.content.split('\n');
    lines.forEach((line, index) => {
      if (line.length > 4000) return;
      for (const rule of SECRET_RULES) {
        if (rule.pattern.test(line)) {
          hits.push({ file: file.rel, line: index + 1, rule: rule.name });
        }
      }
    });
  }
  return hits;
}

// ------------------------------------------------------------------ main

function toolVersion(): string {
  const pnpm = execFileSync('pnpm', ['--version'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim();
  let uv = 'unavailable';
  const probe = spawnSync('uv', ['--version'], { encoding: 'utf8' });
  if (probe.status === 0) uv = (probe.stdout ?? '').trim();
  return `pnpm ${pnpm}; ${uv}`;
}

function main(): void {
  process.stdout.write('Security audit\n');

  const js = auditJavaScript();
  const jsHighOrCritical = js.advisories.filter(
    (a) => a.severity === 'high' || a.severity === 'critical',
  );
  process.stdout.write(
    `  JavaScript: ${js.advisories.length} advisories, ` +
      `${jsHighOrCritical.length} high or critical\n`,
  );

  const python = auditPython();
  const pythonHighOrCritical = python.advisories.filter(
    (a) => a.severity === 'high' || a.severity === 'critical',
  );
  process.stdout.write(
    `  Python: ${python.audited} packages audited, ${python.advisories.length} advisories, ` +
      `${pythonHighOrCritical.length} high or critical\n`,
  );

  const secrets = scanForSecrets();
  process.stdout.write(`  Secret scan: ${secrets.length} hit(s)\n`);

  const passed =
    jsHighOrCritical.length <= THRESHOLDS.jsHighOrCritical &&
    pythonHighOrCritical.length <= THRESHOLDS.pythonHighOrCritical &&
    secrets.length <= THRESHOLDS.secretsFound;

  writeEvidence('release-evidence/security/security-report.json', {
    tool: 'qsimcity-security-audit',
    toolVersion: toolVersion(),
    command: `${js.command} && ${python.command} && repository secret scan`,
    exitStatus: passed ? 0 : 1,
    inputHash: hashString(
      readFileSync(join(ROOT, 'pnpm-lock.yaml'), 'utf8') +
        readFileSync(join(ROOT, 'python', 'qsimcity_qiskit', 'uv.lock'), 'utf8'),
    ),
    thresholds: THRESHOLDS,
    measurements: {
      jsAdvisories: js.advisories.length,
      jsHighOrCritical: jsHighOrCritical.length,
      pythonPackagesAudited: python.audited,
      pythonAdvisories: python.advisories.length,
      pythonHighOrCritical: pythonHighOrCritical.length,
      secretsFound: secrets.length,
      secretRules: SECRET_RULES.length,
    },
    passed,
    detail: {
      javascriptAdvisories: js.advisories,
      pythonAdvisories: python.advisories,
      secretHits: secrets,
    },
  });

  if (!passed) {
    for (const advisory of [...jsHighOrCritical, ...pythonHighOrCritical]) {
      process.stderr.write(
        `  ${advisory.source} ${advisory.severity} ${advisory.id} ${advisory.package}\n`,
      );
    }
    for (const hit of secrets) {
      process.stderr.write(`  secret ${hit.rule} at ${hit.file}:${hit.line}\n`);
    }
    process.stderr.write('Security audit FAILED\n');
    process.exitCode = 1;
    return;
  }
  process.stdout.write('Security audit PASSED\n');
}

main();
