import { Consultation } from '../types/opd';
import {
  areClinicalCoresDuplicate,
  deduplicateClinicalText,
  expandClinicalShorthands,
  normalizeClinicalClauseCore,
} from './investigationUtils';

export type PrintLayoutMode = 'column' | 'split' | 'flat';

function cleanVal(val?: string | number | null): string {
  if (val === undefined || val === null) return '';
  let s = expandClinicalShorthands(String(val).trim());
  if (!s) return '';

  const placeholderVerbs =
    '(?:stated|noted|mentioned|recorded|documented|specified|written|provided|given|indicated|seen|found|filled|clear|legible|available|reported|performed|done|applicable|listed)';

  s = s
    .replace(/\(\s*(?:f\s*\/\s*u|r\s*\/\s*[wv])\s*\)/gi, '')
    .replace(/\bf\s*\/\s*u\b/gi, 'Follow-up')
    .replace(/\b(to)\s+r\s*\/\s*[wv]\b/gi, '$1 review')
    .replace(/\br\s*\/\s*[wv]\b/gi, 'Review')
    .replace(/(?:^|(?<=[\s,;•(\-]))o\s*\/\s*c\s*\/\s*o\b/gi, 'Operated case of')
    .replace(/(?:^|(?<=[\s,;•(\-]))\/\s*c\s*\/\s*o\b/gi, 'Operated case of')
    .replace(/\bs\s*\/\s*p\b/gi, 'Status post')
    .replace(/\bi\s*\/\s*v\s*\/\s*o\b/gi, 'in view of')
    .replace(
      new RegExp(
        `\\b([A-Za-z0-9/&\\s]+:\\s*)?(?:not|none)\\s+(?:(?:explicitly|clearly|specifically)\\s+)?${placeholderVerbs}(?:\\s+on\\s+(?:the\\s+)?(?:sheet|page|record|form|image|chart))?\\.?`,
        'gi'
      ),
      ''
    )
    .replace(
      new RegExp(
        `\\(\\s*(?:not|none)\\s+(?:(?:explicitly|clearly|specifically)\\s+)?${placeholderVerbs}[^)]*\\)`,
        'gi'
      ),
      ''
    )
    .replace(/\s{2,}/g, ' ')
    .replace(/^[;\s,\-|•:]+|[;\s,\-|•:]+$/g, '')
    .trim();

  if (!s) return '';
  const lower = s.toLowerCase().replace(/\.$/, '').trim();
  if (
    [
      '-',
      '--',
      '—',
      'none',
      'nil',
      'n/a',
      'na',
      'null',
      'undefined',
      'unspecified',
      'unknown',
      'nil / not reported',
      'clinical evaluation',
      'no previous investigations',
      'no previous investigation',
      'no investigations',
      'no investigation',
    ].includes(lower) ||
    new RegExp(
      `^(?:not|none|no)\\s+(?:(?:explicitly|clearly|specifically|previous)\\s+)?${placeholderVerbs}.*$`,
      'i'
    ).test(lower)
  ) {
    return '';
  }
  return s;
}

function splitClinicalItems(text?: string): string[] {
  const deduped = deduplicateClinicalText(text, '; ');
  const cleaned = cleanVal(deduped);
  if (!cleaned) return [];
  const rawParts = cleaned
    .split(/\r?\n|;|\||•|\u2022/)
    .map((s) => cleanVal(s.replace(/^[\-•*°\s]+/, '')))
    .filter((s) => Boolean(s));

  const seenCores: string[] = [];
  const uniqueItems: string[] = [];
  for (const item of rawParts) {
    const core = normalizeClinicalClauseCore(item);
    if (!core) continue;
    const dupIdx = seenCores.findIndex((existing) => areClinicalCoresDuplicate(existing, core));
    if (dupIdx === -1) {
      seenCores.push(core);
      uniqueItems.push(item);
    } else if (item.length > uniqueItems[dupIdx].length) {
      seenCores[dupIdx] = core;
      uniqueItems[dupIdx] = item;
    }
  }
  return uniqueItems;
}

function stripHydrationAdvice(val?: string): string {
  if (!val) return '';
  const cleaned = String(val)
    .split(/([;,\n|•]+)/)
    .map((part) => (/\bhydration\b/i.test(part) ? '' : part))
    .join('')
    .replace(/(?:^|\s+)(?:and|&)\s*(?=$|[;,\n|•])/gi, '')
    .replace(/^[;,\s\-|•:]+|[;,\s\-|•:]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return /\bhydration\b/i.test(cleaned) ? '' : cleaned;
}

export interface FormattedRxRow {
  medicineLine: string;
  dosagePattern: string;
  timingFreqDuration: string;
  notesLine: string;
}

export function formatRxTableRow(rx: any): FormattedRxRow {
  const med = cleanVal(rx?.medicine || rx?.drugName);
  const strength = cleanVal(rx?.dosage || rx?.dosageStrength);
  const medicineLine = [med, strength].filter(Boolean).join('  ');

  const rawFreq = cleanVal(rx?.frequency);
  const rawWhen = cleanVal(rx?.when || rx?.timing);
  const rawDuration = cleanVal(rx?.duration);
  const notesLine = cleanVal(rx?.notes || rx?.instructions);

  let dosagePattern = '';
  let freqWord = '';

  if (rawFreq) {
    const dashMatch = rawFreq.match(
      /^(\d+(?:\/\d+|\.\d+)?)\s*[-–—]\s*(\d+(?:\/\d+|\.\d+)?)\s*[-–—]\s*(\d+(?:\/\d+|\.\d+)?)(?:\s*\(([^)]+)\))?/i
    );
    if (dashMatch) {
      dosagePattern = `${dashMatch[1]} — ${dashMatch[2]} — ${dashMatch[3]}`;
      const paren = (dashMatch[4] || '').trim();
      if (paren && !/^(od|bd|tds|qid|hs)$/i.test(paren)) {
        freqWord = paren;
      } else {
        freqWord = 'Daily';
      }
    } else {
      dosagePattern = rawFreq;
      if (/\b(?:once\s+a\s+day|od|bd|twice\s+daily|tds|thrice\s+daily|daily)\b/i.test(rawFreq)) {
        freqWord = 'Daily';
      }
    }
  }

  const summaryParts: string[] = [];
  if (rawWhen) summaryParts.push(rawWhen);
  if (freqWord && freqWord.toLowerCase() !== dosagePattern.toLowerCase()) {
    summaryParts.push(freqWord);
  }
  if (rawDuration) summaryParts.push(rawDuration);

  return {
    medicineLine,
    dosagePattern,
    timingFreqDuration: summaryParts.join(' - '),
    notesLine,
  };
}

export interface LabeledAdviceRow {
  label: string;
  text: string;
}

export function buildLabeledAdviceRows(c: Consultation): LabeledAdviceRow[] {
  const seenCores: string[] = [];
  const filterUnique = (items: string[]): string[] => {
    const kept: string[] = [];
    for (const item of items) {
      if (/^referred\s+to\b/i.test(item.trim()) || /\bhydration\b/i.test(item)) continue;
      const core = normalizeClinicalClauseCore(item);
      if (!core) continue;
      const isDup = seenCores.some(
        (existing) =>
          existing === core ||
          (existing.length >= 6 && core.includes(existing)) ||
          (core.length >= 6 && existing.includes(core))
      );
      if (!isDup) {
        seenCores.push(core);
        kept.push(item);
      }
    }
    return kept;
  };

  const rows: LabeledAdviceRow[] = [];

  const assessmentRaw: string[] = [];
  if (c.admissionAdvice === 'Yes') assessmentRaw.push('Admit in Ward');
  const assessmentClean = stripHydrationAdvice(c.assessmentPlan);
  if (cleanVal(assessmentClean)) {
    assessmentRaw.push(...splitClinicalItems(assessmentClean));
  }
  const assessmentKept = filterUnique(assessmentRaw);
  if (assessmentKept.length > 0) {
    rows.push({ label: 'Assessment', text: assessmentKept.join('; ') });
  }

  const rawAdviceSource = cleanVal(c.advice) ? c.advice : c.adviceAndDiet;
  const adviceClean = stripHydrationAdvice(rawAdviceSource);
  if (cleanVal(adviceClean)) {
    const adviceKept = filterUnique(splitClinicalItems(adviceClean));
    if (adviceKept.length > 0) {
      rows.push({ label: 'Advice', text: adviceKept.join('; ') });
    }
  }

  const dietClean = stripHydrationAdvice(c.dietAndExercise);
  if (cleanVal(dietClean)) {
    const dietKept = filterUnique(splitClinicalItems(dietClean));
    if (dietKept.length > 0) {
      rows.push({ label: 'Diet and Exercise', text: dietKept.join('; ') });
    }
  }

  const nextVisitClean = cleanVal(c.nextVisit || c.followUpDate);
  if (nextVisitClean) {
    const followUpKept = filterUnique([nextVisitClean]);
    if (followUpKept.length > 0) {
      rows.push({ label: 'Follow-up', text: followUpKept.join('; ') });
    }
  }

  return rows;
}
