import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The workflow files have to be well-formed YAML, checked here rather than
 * by GitHub.
 *
 * A duplicated `retention-days:` key was committed into the `goal` job. YAML
 * duplicate keys are an error, so GitHub rejected the whole file: the run
 * appeared with no jobs at all and a bare "failure", the workflow name shown
 * as the file path. Nothing ran, and none of the usual output existed to say
 * why. Every check on that commit was neither green nor red — it was absent.
 *
 * No YAML parser is a dependency of this repository and adding one to catch
 * this would be a poor trade, so this checks the two structural properties
 * that actually broke: duplicate sibling keys within a block, and tabs.
 * It is a narrow net, and deliberately so — it targets a failure that has
 * happened rather than every way YAML can be wrong.
 */

const WORKFLOWS = resolve(process.cwd(), '.github', 'workflows');
const workflowDir = (): string => {
  try {
    readdirSync(WORKFLOWS);
    return WORKFLOWS;
  } catch {
    return resolve(process.cwd(), '..', '..', '.github', 'workflows');
  }
};

interface Line {
  readonly number: number;
  readonly indent: number;
  /** Empty for a line that only opens a list element. */
  readonly key: string;
  readonly startsListItem: boolean;
}

/**
 * Mapping keys with their indentation, plus the list-element boundaries.
 *
 * The boundaries are the whole difficulty. Two consecutive steps each write
 * `with:` at the same indentation, and those are siblings of nothing — they
 * belong to different elements of the `steps` sequence. Without tracking
 * where each element begins, every multi-step job looks like a duplicate.
 */
function mappingKeys(text: string): Line[] {
  const out: Line[] = [];
  text.split('\n').forEach((raw, i) => {
    if (raw.trim().length === 0 || raw.trim().startsWith('#')) return;
    const dash = /^(\s*)-\s+(.*)$/.exec(raw);
    if (dash) {
      const indent = dash[1]!.length;
      out.push({ number: i + 1, indent, key: '', startsListItem: true });
      // `- uses: x` also declares a key, one level in from the dash.
      const inline = /^([A-Za-z_][\w-]*):(\s|$)/.exec(dash[2]!);
      if (inline) {
        out.push({ number: i + 1, indent: indent + 2, key: inline[1]!, startsListItem: false });
      }
      return;
    }
    const match = /^(\s*)([A-Za-z_][\w-]*):(\s|$)/.exec(raw);
    if (!match) return;
    out.push({
      number: i + 1,
      indent: match[1]!.length,
      key: match[2]!,
      startsListItem: false,
    });
  });
  return out;
}

describe('GitHub workflow files are well-formed', () => {
  const dir = workflowDir();
  const files = readdirSync(dir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));

  it('finds the workflows', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    describe(file, () => {
      const text = readFileSync(join(dir, file), 'utf8');

      it('uses no tabs for indentation', () => {
        const tabs = text
          .split('\n')
          .map((line, i) => ({ line, number: i + 1 }))
          .filter(({ line }) => /^\s*\t/.test(line))
          .map(({ number }) => number);
        expect(tabs, `tab-indented lines: ${tabs.join(', ')}`).toEqual([]);
      });

      it('declares no duplicate sibling keys', () => {
        const keys = mappingKeys(text);
        const duplicates: string[] = [];
        for (const [index, current] of keys.entries()) {
          if (current.startsListItem) continue;
          for (let back = index - 1; back >= 0; back -= 1) {
            const earlier = keys[back]!;
            // A dash at or outside this key's indentation opened the element
            // this key lives in. Anything before it is a different element.
            if (earlier.startsListItem && earlier.indent < current.indent) break;
            // Left the block: anything shallower ends this mapping.
            if (earlier.indent < current.indent) break;
            if (earlier.indent > current.indent) continue;
            if (earlier.key === current.key) {
              duplicates.push(`${current.key} at lines ${earlier.number} and ${current.number}`);
              break;
            }
          }
        }
        expect(duplicates, `duplicate keys:\n${duplicates.join('\n')}`).toEqual([]);
      });
    });
  }
});
