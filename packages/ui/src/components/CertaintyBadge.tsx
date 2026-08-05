import type { ReactElement } from 'react';
import type { CertaintyLabel, SourceClassification } from 'qsimcity-trace';
import { useAppStore } from '../store/appStore.js';
import { CERTAINTY_GLOSSARY, SOURCE_GLOSSARY } from '../content/explanations.js';

/**
 * User-facing certainty label chip (spec §10). The badge text never changes
 * with the explanation level — labels are scientific commitments — but the
 * tooltip explains them in level-appropriate words (spec section 7.4).
 */

export const CERTAINTY_DESCRIPTIONS: Readonly<Record<CertaintyLabel, string>> = Object.fromEntries(
  Object.entries(CERTAINTY_GLOSSARY).map(([label, text]) => [label, text.beginner]),
) as Record<CertaintyLabel, string>;

export const SOURCE_DESCRIPTIONS: Readonly<Record<SourceClassification, string>> =
  Object.fromEntries(
    Object.entries(SOURCE_GLOSSARY).map(([source, text]) => [source, text.beginner]),
  ) as Record<SourceClassification, string>;

export function CertaintyBadge({ certainty }: { certainty: CertaintyLabel }): ReactElement {
  const level = useAppStore((s) => s.settings.explanationLevel);
  return (
    <span
      className={`certainty-badge certainty-${certainty.toLowerCase()}`}
      title={CERTAINTY_GLOSSARY[certainty][level]}
    >
      {certainty}
    </span>
  );
}
