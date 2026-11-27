import React, { useMemo } from 'react';
import {
  POD_0_POST_OP_HEADING,
  convertProtocolItemToClinicalOrder,
  isRedundantPodHeadingForDay,
  normalizeStageHeadingForDailyProgress,
} from '../utils/surgicalProtocols';

export interface ProtocolGroupEntry {
  kind: 'kv' | 'item';
  label?: string;
  text: string;
}

export type ClinicalNoteBlock =
  | {
      type: 'protocol-group';
      tag: string;
      entries: ProtocolGroupEntry[];
    }
  | {
      type: 'section-heading';
      heading: string;
    }
  | {
      type: 'kv';
      heading: string;
      value: string;
    }
  | {
      type: 'bullet';
      text: string;
    };

/**
 * Splits text by top-level semicolons (ignoring semicolons inside parentheses).
 */
function splitOutsideParenthesesBySemicolon(input: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '(' || ch === '[') {
      depth++;
      current += ch;
    } else if (ch === ')' || ch === ']') {
      depth = Math.max(0, depth - 1);
      current += ch;
    } else if (ch === ';' && depth === 0) {
      const trimmed = current.trim();
      if (trimmed) parts.push(trimmed);
      current = '';
    } else {
      current += ch;
    }
  }
  const tail = current.trim();
  if (tail) parts.push(tail);
  return parts;
}

function normalizeTagKey(tag: string): string {
  return tag
    .replace(/[·•|—–-]+/g, '·')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeEntryDedupeSig(entry: ProtocolGroupEntry): string {
  const cleanLabel = (entry.label || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const cleanText = (entry.text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return `${entry.kind}|${cleanLabel}|${cleanText}`;
}

function isRedundantProtocolFillerLine(line: string): boolean {
  return (
    /^[A-Za-z0-9/+\-\s]{2,28}\s+Post[-\s]?Op\s+Protocol\s+Progress$/i.test(line) ||
    /^OT\s+Procedure\s+Recorded$/i.test(line)
  );
}

function parseProtocolBodyEntry(rawBody: string): ProtocolGroupEntry | null {
  const cleaned = rawBody
    .replace(/^:\s*/, '')
    .replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '')
    .trim();
  if (!cleaned || isRedundantProtocolFillerLine(cleaned)) return null;

  const kvMatch = cleaned.match(/^([^:]{2,48}):\s+(.+)$/);
  if (kvMatch && !/^(?:http|https)$/i.test(kvMatch[1].trim())) {
    return {
      kind: 'kv',
      label: kvMatch[1].trim(),
      text: kvMatch[2].trim(),
    };
  }

  return {
    kind: 'item',
    text: convertProtocolItemToClinicalOrder(cleaned) || cleaned,
  };
}

/**
 * Parses clinical progress notes AND discharge summary text, clubbing ALL entries
 * that share the same protocol/stage or POD heading (e.g. "POD 0 - POST OP", "POD 1",
 * "Discharge", "POD 1 (25/11/2026)", or any custom protocol stage) under ONE unified
 * deduplicated heading block.
 */
export function parseAndGroupClinicalNoteBlocks(text: string): ClinicalNoteBlock[] {
  const rawLines = (text || '').split(/\r?\n/);
  const blocks: ClinicalNoteBlock[] = [];
  const groupByKey = new Map<
    string,
    Extract<ClinicalNoteBlock, { type: 'protocol-group' }>
  >();
  const seenStandaloneSigs = new Set<string>();

  const getOrCreateGroup = (tag: string) => {
    const cleanTag = normalizeStageHeadingForDailyProgress(tag) || tag.replace(/:$/, '').trim();
    const key = normalizeTagKey(cleanTag);
    let group = groupByKey.get(key);
    if (!group) {
      group = {
        type: 'protocol-group',
        tag: cleanTag,
        entries: [],
      };
      groupByKey.set(key, group);
      blocks.push(group);
    }
    return group;
  };

  const pushEntryToGroup = (
    group: Extract<ClinicalNoteBlock, { type: 'protocol-group' }>,
    rawBody: string
  ) => {
    const entry = parseProtocolBodyEntry(rawBody);
    if (!entry) return;
    const entrySig = normalizeEntryDedupeSig(entry);
    const alreadyExists = group.entries.some(
      (e) => normalizeEntryDedupeSig(e) === entrySig
    );
    if (!alreadyExists) {
      group.entries.push(entry);
    }
  };

  let activeHeadingGroup: Extract<ClinicalNoteBlock, { type: 'protocol-group' }> | null = null;

  for (const raw of rawLines) {
    const trimmed = raw.trim();
    if (!trimmed) {
      activeHeadingGroup = null;
      continue;
    }
    if (isRedundantProtocolFillerLine(trimmed)) {
      continue;
    }

    // 1. Legacy inline discharge course line: "25/11/2026 · POD 1: Text | [URSL · POD 1] Item"
    // Split pipe-delimited legacy summaries and club under clean POD / Protocol headings!
    const legacyDayMatch = trimmed.match(
      /^(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}(?:\s*[·•-]\s*POD\s*\d+)?|POD\s*\d+(?:\s*(?:[-–]\s*POST\s*OP|\([^)]+\)))?)\s*:\s+(.+)$/i
    );
    if (legacyDayMatch) {
      const dayHeading = legacyDayMatch[1].trim();
      const rest = legacyDayMatch[2].trim();
      const pipeSegments = rest
        .split(/\s+\|\s+/)
        .map((s) => s.trim())
        .filter(Boolean);

      for (const seg of pipeSegments) {
        const inlineProto = seg.match(/^\[([^\]]+)\]\s*:?\s*(.+)$/);
        if (inlineProto) {
          const g = getOrCreateGroup(inlineProto[1]);
          pushEntryToGroup(g, inlineProto[2]);
        } else {
          const dayGroup = getOrCreateGroup(dayHeading);
          pushEntryToGroup(dayGroup, seg);
        }
      }
      activeHeadingGroup = null;
      continue;
    }

    // 2. Protocol-tagged line: "[POD 0 - POST OP] Item text" or "[URSL · POD 1] Item text"
    // Keep the entire protocol item intact (never split on internal semicolons!) and
    // club all items sharing the same normalized heading under ONE group.
    const protoMatch = trimmed.match(/^\[([^\]]+)\]\s*:?\s*(.+)$/);
    if (protoMatch) {
      const group = getOrCreateGroup(protoMatch[1]);
      pushEntryToGroup(group, protoMatch[2]);
      activeHeadingGroup = null;
      continue;
    }

    // 3. Standalone section/POD/protocol heading line ending with ":" (e.g. "POD 0 - POST OP:",
    // "URSL · POD 1:", "Post-Op Instructions:") or short ALL-CAPS heading
    if (
      (/^[^:]{2,64}:$/.test(trimmed) && !/^\d{1,2}:\d{2}/.test(trimmed)) ||
      (/^[A-Z][A-Z0-9\s/&·\-]{3,36}$/.test(trimmed) && !/\d{2,}/.test(trimmed))
    ) {
      activeHeadingGroup = getOrCreateGroup(trimmed);
      continue;
    }

    // 4. If we are currently inside a standalone heading group (e.g. "POD 0 - POST OP:" or
    // "Post-Op Instructions:") and this line is a bulleted/indented/child item, club it under that heading!
    if (activeHeadingGroup) {
      pushEntryToGroup(activeHeadingGroup, trimmed);
      continue;
    }

    // 5. Non-protocol lines: handle legacy inline "Heading: Val · Heading2: Val" or top-level semicolon lists
    const expandedSubLines: string[] = [];
    if (trimmed.includes(' · ') && /[^:]{2,40}:\s+/.test(trimmed)) {
      const dotParts = trimmed
        .split(/\s+·\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (dotParts.length >= 2 && dotParts.filter((p) => /^[^:]{2,40}:\s+/.test(p)).length >= 2) {
        expandedSubLines.push(...dotParts);
      } else {
        expandedSubLines.push(trimmed);
      }
    } else if (trimmed.includes(';')) {
      const semiParts = splitOutsideParenthesesBySemicolon(trimmed);
      if (semiParts.length >= 2) {
        expandedSubLines.push(...semiParts);
      } else {
        expandedSubLines.push(trimmed);
      }
    } else {
      expandedSubLines.push(trimmed);
    }

    for (const line of expandedSubLines) {
      if (isRedundantProtocolFillerLine(line)) continue;

      // Standalone section heading inside expanded line
      if (
        (/^[^:]{2,48}:$/.test(line) && !/^\d{1,2}:\d{2}/.test(line)) ||
        (/^[A-Z][A-Z0-9\s/&\-]{3,36}$/.test(line) && !/\d{2,}/.test(line))
      ) {
        activeHeadingGroup = getOrCreateGroup(line);
        continue;
      }

      // Key-value clinical heading line (e.g. "OT Procedure: Bipolar TURP")
      const kvMatch = line.match(/^([A-Za-z][A-Za-z0-9\s/&()\-]{1,42}):\s*(.+)$/);
      if (kvMatch && !/^(?:http|https)$/i.test(kvMatch[1].trim())) {
        const heading = kvMatch[1].trim();
        const value = kvMatch[2].trim();
        const sig = `kv|${heading.toLowerCase()}|${value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`;
        if (!seenStandaloneSigs.has(sig)) {
          seenStandaloneSigs.add(sig);
          blocks.push({
            type: 'kv',
            heading,
            value,
          });
        }
        continue;
      }

      // Numbered / bulleted or plain instruction line
      const cleanBullet = line.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '').trim();
      if (cleanBullet && !isRedundantProtocolFillerLine(cleanBullet)) {
        const sig = `bullet|${cleanBullet.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`;
        if (!seenStandaloneSigs.has(sig)) {
          seenStandaloneSigs.add(sig);
          blocks.push({
            type: 'bullet',
            text: cleanBullet,
          });
        }
      }
    }
  }

  // Sort POD 0 - POST OP first among protocol groups if multiple groups appear in the same block
  // and convert any empty group to a section-heading block (or drop empty orphan headings if another group exists)
  const nonEmptyBlocks = blocks.filter(
    (b) => !(b.type === 'protocol-group' && b.entries.length === 0)
  );
  const pod0Groups = nonEmptyBlocks.filter(
    (b) => b.type === 'protocol-group' && b.tag === POD_0_POST_OP_HEADING
  );
  const otherBlocks = nonEmptyBlocks.filter(
    (b) => !(b.type === 'protocol-group' && b.tag === POD_0_POST_OP_HEADING)
  );

  return [...pod0Groups, ...otherBlocks];
}

/**
 * Formats clinical progress note or discharge text into clean plain text with clubbed headings
 * for PDF exports and discharge summary compilation.
 * Pass `omitRedundantHeading` (e.g. the card's POD label) to skip repeating the day's own POD heading.
 */
export function formatGroupedClinicalNotePlainText(
  text: string,
  omitRedundantHeading?: string
): string {
  const blocks = parseAndGroupClinicalNoteBlocks(text);
  const out: string[] = [];

  for (const block of blocks) {
    if (block.type === 'protocol-group') {
      const skipTag = Boolean(
        omitRedundantHeading && isRedundantPodHeadingForDay(block.tag, omitRedundantHeading)
      );
      if (!skipTag) {
        if (out.length > 0) out.push('');
        out.push(`${block.tag}:`);
      }
      for (const entry of block.entries) {
        if (entry.kind === 'kv' && entry.label) {
          out.push(`• ${entry.label}: ${entry.text}`);
        } else {
          out.push(`• ${entry.text}`);
        }
      }
    } else if (block.type === 'section-heading') {
      const skipHeading = Boolean(
        omitRedundantHeading && isRedundantPodHeadingForDay(block.heading, omitRedundantHeading)
      );
      if (!skipHeading) {
        if (out.length > 0) out.push('');
        out.push(`${block.heading}:`);
      }
    } else if (block.type === 'kv') {
      out.push(`${block.heading}: ${block.value}`);
    } else {
      out.push(`• ${block.text}`);
    }
  }

  return out.join('\n');
}

/**
 * Renders clinical progress note & discharge summary text cleanly so ward rounds,
 * OT post-op orders, surgical protocol entries, and discharge summaries scan effortlessly.
 * Pass `omitRedundantHeading` (e.g. the card's POD label) to omit repeated POD sub-headings.
 */
export const FormattedClinicalNote: React.FC<{
  text: string;
  compact?: boolean;
  accent?: 'teal' | 'sky' | 'indigo';
  variant?: 'note' | 'discharge';
  omitRedundantHeading?: string;
}> = ({
  text,
  compact = false,
  accent = 'teal',
  variant = 'note',
  omitRedundantHeading,
}) => {
  const blocks = useMemo(() => parseAndGroupClinicalNoteBlocks(text), [text]);

  if (blocks.length === 0) return null;

  const isDischarge = variant === 'discharge';

  const accentClasses =
    accent === 'sky'
      ? {
          heading: 'text-sky-900',
          badge: 'bg-sky-50 border-sky-200 text-sky-950',
          border: 'border-sky-300/90',
          dot: 'bg-sky-600/80',
        }
      : accent === 'indigo'
      ? {
          heading: 'text-indigo-900',
          badge: 'bg-indigo-50 border-indigo-200 text-indigo-950',
          border: 'border-indigo-300/90',
          dot: 'bg-indigo-600/80',
        }
      : {
          heading: 'text-teal-900',
          badge: 'bg-teal-50 border-teal-200 text-teal-950',
          border: 'border-teal-300/90',
          dot: 'bg-teal-700/80',
        };

  return (
    <div
      className={`${
        compact
          ? 'space-y-1.5 text-[11.5px]'
          : isDischarge
          ? 'space-y-2.5 text-[12px]'
          : 'space-y-2 text-[12.5px]'
      } leading-relaxed text-slate-800`}
    >
      {blocks.map((block, idx) => {
        if (block.type === 'section-heading') {
          if (
            !isDischarge &&
            omitRedundantHeading &&
            isRedundantPodHeadingForDay(block.heading, omitRedundantHeading)
          ) {
            return null;
          }
          return isDischarge ? (
            <div key={idx} className="pt-1.5 first:pt-0">
              <div
                className={`inline-block px-2.5 py-0.5 rounded border text-[11.5px] font-extrabold tracking-wide ${accentClasses.badge}`}
              >
                {block.heading}
              </div>
            </div>
          ) : (
            <div
              key={idx}
              className="pt-1.5 first:pt-0 text-[11px] font-bold uppercase tracking-wide text-slate-500"
            >
              {block.heading}
            </div>
          );
        }

        if (block.type === 'protocol-group') {
          const hideGroupHeading = Boolean(
            !isDischarge &&
              omitRedundantHeading &&
              isRedundantPodHeadingForDay(block.tag, omitRedundantHeading)
          );

          if (isDischarge) {
            return (
              <div key={idx} className="pt-1.5 first:pt-0">
                <div className="mb-1.5">
                  <span
                    className={`inline-block px-2.5 py-0.5 rounded border text-[11.5px] font-extrabold tracking-wide ${accentClasses.badge}`}
                  >
                    {block.tag}
                  </span>
                </div>
                <div className={`pl-3 border-l-2 ${accentClasses.border} space-y-1`}>
                  {block.entries.map((entry, eIdx) => (
                    <div key={eIdx} className="flex items-start gap-2">
                      <span
                        className={`mt-[7px] w-1.5 h-1.5 rounded-full ${accentClasses.dot} shrink-0`}
                        aria-hidden="true"
                      />
                      {entry.kind === 'kv' && entry.label ? (
                        <div className="text-slate-800">
                          <span className="font-bold text-slate-900">{entry.label}: </span>
                          <span>{entry.text}</span>
                        </div>
                      ) : (
                        <span className="text-slate-800">{entry.text}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          }

          return (
            <div key={idx} className={hideGroupHeading ? '' : 'pt-1.5 first:pt-0'}>
              {!hideGroupHeading && (
                <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                  {block.tag}
                </div>
              )}
              <div className="space-y-1">
                {block.entries.map((entry, eIdx) => (
                  <div key={eIdx} className="flex items-start gap-2">
                    <span
                      className="mt-[7px] w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0"
                      aria-hidden="true"
                    />
                    {entry.kind === 'kv' && entry.label ? (
                      <div className="text-slate-800">
                        <span className="font-semibold text-slate-900">{entry.label}: </span>
                        <span>{entry.text}</span>
                      </div>
                    ) : (
                      <span className="text-slate-800">{entry.text}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        }

        if (block.type === 'kv') {
          const putOnNextLine = isDischarge || block.value.length > 75;
          return (
            <div key={idx} className={putOnNextLine ? 'pt-1 first:pt-0' : ''}>
              {isDischarge ? (
                <div className="mb-0.5">
                  <span className="inline-block px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-[11px] font-extrabold text-slate-900">
                    {block.heading}
                  </span>
                </div>
              ) : (
                <span className="font-bold text-slate-900">{block.heading}:</span>
              )}
              {putOnNextLine ? (
                <div
                  className={`mt-0.5 pl-2.5 border-l-2 ${
                    isDischarge ? accentClasses.border : 'border-slate-200'
                  } text-slate-800`}
                >
                  {block.value}
                </div>
              ) : (
                <span className="ml-1.5 text-slate-800">{block.value}</span>
              )}
            </div>
          );
        }

        return (
          <div key={idx} className="flex items-start gap-2">
            <span
              className="mt-[7px] w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0"
              aria-hidden="true"
            />
            <span className="text-slate-800">{block.text}</span>
          </div>
        );
      })}
    </div>
  );
};
