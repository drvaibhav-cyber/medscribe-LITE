import { Consultation, InvestigationItem, OtNotes, PatientVitals, PrescriptionItem } from '../types/opd';
import {
  IpdDailyNote,
  IpdMedicationOrder,
  IpdPatientRecord,
  IpdSurgicalProtocolProgress,
} from '../types/ipd';
import {
  getConsultationOtProcedures,
  hasOpdClinicalData,
  hasOtNotesData,
  mergeOtNotes,
  normalizeOtNotes,
} from './otNotesUtils';
import {
  POD_0_POST_OP_HEADING,
  convertProtocolItemToClinicalOrder,
  formatDailyProgressPodLabel,
  formatPodLabel,
  getSurgicalProtocolById,
  normalizeStageHeadingForDailyProgress,
  parseProtocolStageDayOffset,
  resolveProtocolStageTargetDate,
} from './surgicalProtocols';
import { findMasterMedicationByName } from './medicineMaster';
import {
  hasIpssData,
  normalizeIpssFieldValue,
  sanitizeVitalsObject,
} from './investigationUtils';
import { formatDisplayDate } from './excelExporter';

function getTodayIso(): string {
  return new Date().toISOString().split('T')[0];
}

function getCurrentTimeHHMM(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

export function normalizeClinicalPatientName(raw?: string): string {
  if (!raw) return '';
  return raw
    .trim()
    .replace(/^(mr\.?|mrs\.?|ms\.?|miss|dr\.?|master|baby|shri|smt\.?)\s+/i, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeRegId(raw?: string): string {
  if (!raw) return '';
  return raw.trim().replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

/**
 * Matches an OPD consultation against IPD patients (all or admitted-only)
 * using deterministic ot-ipd ID prefix, linkedOpdConsultationId, UHID/IPD No, or normalized name.
 */
export function findMatchingIpdPatientsForOpdConsultation(
  consultation: Consultation,
  ipdPatients: IpdPatientRecord[],
  admittedOnly = false
): IpdPatientRecord[] {
  const pool = admittedOnly ? ipdPatients.filter((p) => p.status === 'admitted') : ipdPatients;
  if (pool.length === 0) return [];

  const matched = new Map<string, IpdPatientRecord>();

  // 0. Direct IPD-originated OT consultation ID match (`ot-ipd-<safePatientSlug>-...`)
  if (consultation.id && consultation.id.startsWith('ot-ipd-')) {
    for (const p of pool) {
      const prefix = getIpdPatientOtPrefix(p.id);
      if (consultation.id.startsWith(prefix)) {
        matched.set(p.id, p);
      }
    }
  }

  // 1. Direct consultation link
  if (consultation.id) {
    for (const p of pool) {
      if (p.linkedOpdConsultationId && p.linkedOpdConsultationId === consultation.id) {
        matched.set(p.id, p);
      }
    }
  }

  // 2. UHID / OPD number match (when non-empty and >= 3 chars)
  const opdId = normalizeRegId(consultation.opdNo);
  if (opdId.length >= 3) {
    for (const p of pool) {
      const uhid = normalizeRegId(p.uhid);
      const ipd = normalizeRegId(p.ipdNo);
      if ((uhid && uhid === opdId) || (ipd && ipd === opdId)) {
        matched.set(p.id, p);
      }
    }
  }

  // 3. Normalized patient name match
  const targetName = normalizeClinicalPatientName(consultation.patientName);
  if (targetName.length >= 3) {
    const nameMatches = pool.filter(
      (p) => normalizeClinicalPatientName(p.patientName) === targetName
    );
    if (nameMatches.length === 1) {
      matched.set(nameMatches[0].id, nameMatches[0]);
    } else if (nameMatches.length > 1) {
      const exact = nameMatches.filter(
        (p) =>
          (consultation.age && p.age && p.age.trim() === consultation.age.trim()) ||
          (consultation.gender &&
            p.gender &&
            p.gender.charAt(0).toLowerCase() === consultation.gender.charAt(0).toLowerCase())
      );
      for (const m of exact.length > 0 ? exact : nameMatches) {
        matched.set(m.id, m);
      }
    }
  }

  return Array.from(matched.values());
}

/**
 * Matches an OPD consultation against currently ADMITTED IPD ward patients
 * using linkedConsultationId, UHID/OPD No, or normalized patient name.
 */
export function findMatchingAdmittedIpdPatient(
  consultation: Consultation,
  ipdPatients: IpdPatientRecord[]
): IpdPatientRecord | null {
  const matches = findMatchingIpdPatientsForOpdConsultation(consultation, ipdPatients, true);
  return matches[0] || null;
}

export function getIpdPatientOtPrefix(patientId: string): string {
  const safePatientSlug = (patientId || 'ipd')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 40);
  return `ot-ipd-${safePatientSlug}-`;
}

export function getOtIdentityKey(ot: OtNotes): string {
  if (ot.id) return ot.id;
  const datePart = (ot.surgeryDate || 'nodate').trim();
  const procPart = (ot.procedureName || 'procedure')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 40);
  return `${datePart}-${procPart}`;
}

export function getOtPostOpDailyNoteId(ot: OtNotes): string {
  return `ot-postop-${getOtIdentityKey(ot)}`;
}

export function isSameOtProcedure(a?: OtNotes | null, b?: OtNotes | null): boolean {
  if (!a || !b) return false;
  if (a.id && b.id && a.id === b.id) return true;
  if (getOtIdentityKey(a) === getOtIdentityKey(b)) return true;
  const dateA = (a.surgeryDate || '').trim();
  const dateB = (b.surgeryDate || '').trim();
  const nameA = (a.procedureName || '').trim().toLowerCase();
  const nameB = (b.procedureName || '').trim().toLowerCase();
  if (dateA && dateB && dateA === dateB && nameA && nameB && nameA === nameB) {
    return true;
  }
  return false;
}

function isPurePostOpMedicationLine(line: string): boolean {
  const cleaned = (line || '')
    .replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '')
    .replace(/^(?:post[-\s]?op\s*)?(?:medications?|drugs?|rx)\s*:\s*/i, '')
    .trim();
  if (!cleaned || cleaned.length < 3) return false;
  const hasExplicitPrefix = EXPLICIT_MED_FORM_PREFIX_RE.test(cleaned);
  if (hasExplicitPrefix) return true;
  if (NON_MED_NURSING_ORDER_RE.test(cleaned)) return false;
  return KNOWN_POSTOP_MED_KEYWORD_RE.test(cleaned);
}

/**
 * Builds or updates Daily Progress timeline entries summarizing OT procedures'
 * immediate post-op care under ONE unified "POD 0 - POST OP" entry per surgery date
 * (avoiding duplicate cards when multiple procedures are performed on the same day,
 * and omitting pure medication lines that are already charted in the Medication Log).
 */
export function syncOtPostOpNotesToDailyTimeline(
  dailyNotes: IpdDailyNote[],
  otProcedures: OtNotes[],
  authorName?: string
): IpdDailyNote[] {
  const validProcs = (otProcedures || []).filter((ot) => hasOtNotesData(ot));
  const procsByDate = new Map<string, OtNotes[]>();

  for (const ot of validProcs) {
    const hasPostOpContent = Boolean(
      ot.postOpOrders?.trim() ||
        ot.procedureName?.trim() ||
        ot.catheterOrStentDetails?.trim() ||
        ot.drainDetails?.trim() ||
        ot.specimenSent?.trim()
    );
    if (!hasPostOpContent) continue;
    const dateStr = ot.surgeryDate || getTodayIso();
    const list = procsByDate.get(dateStr) || [];
    list.push(ot);
    procsByDate.set(dateStr, list);
  }

  const activePostOpIds = new Set<string>(
    Array.from(procsByDate.keys()).map((d) => `ot-postop-${d}`)
  );

  // Prune any orphaned or legacy per-procedure `ot-postop-*` timeline entries
  let nextNotes = (dailyNotes || []).filter(
    (n) => !n.id.startsWith('ot-postop-') || activePostOpIds.has(n.id)
  );

  for (const [dateStr, procs] of procsByDate.entries()) {
    const noteId = `ot-postop-${dateStr}`;
    const firstWithTime = procs.find((p) => p.surgeryTime?.trim());
    const timeStr = firstWithTime?.surgeryTime || 'Post-Op';

    const uniqueProcNames: string[] = [];
    const seenProcKeys = new Set<string>();
    const objectiveLines: string[] = [];
    const seenObjKeys = new Set<string>();
    const nonMedOrderLines: string[] = [];
    const allOrderLines: string[] = [];
    const seenOrderKeys = new Set<string>();

    const pushUniqueObjective = (label: string, val?: string) => {
      const cleaned = (val || '').trim();
      if (!cleaned) return;
      const key = `${label.toLowerCase()}|${cleaned.toLowerCase()}`;
      if (seenObjKeys.has(key)) return;
      seenObjKeys.add(key);
      objectiveLines.push(`[${POD_0_POST_OP_HEADING}] ${label}: ${cleaned}`);
    };

    for (const ot of procs) {
      const pName = (ot.procedureName || '').trim();
      if (pName) {
        const key = pName.toLowerCase();
        if (!seenProcKeys.has(key)) {
          seenProcKeys.add(key);
          uniqueProcNames.push(pName);
        }
      }

      pushUniqueObjective('Catheter / Stent', ot.catheterOrStentDetails);
      pushUniqueObjective('Drain', ot.drainDetails);
      pushUniqueObjective('Specimen Sent', ot.specimenSent);

      if (ot.postOpOrders?.trim()) {
        const splitLines = ot.postOpOrders
          .split(/\r?\n/)
          .flatMap((line) => {
            const trimmed = line.trim();
            if (!trimmed) return [];
            if (trimmed.includes(';')) {
              return trimmed
                .split(/\s*;\s*/)
                .map((s) => s.trim())
                .filter(Boolean);
            }
            return [trimmed];
          });

        for (const rawLine of splitLines) {
          const cleanLine = rawLine.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '').trim();
          if (!cleanLine) continue;
          const sig = cleanLine.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
          if (!sig || seenOrderKeys.has(sig)) continue;
          seenOrderKeys.add(sig);
          allOrderLines.push(cleanLine);
          if (!isPurePostOpMedicationLine(cleanLine)) {
            nonMedOrderLines.push(cleanLine);
          }
        }
      }

      if (ot.implantsOrConsumables?.trim()) {
        const impLine = `Implants / Consumables: ${ot.implantsOrConsumables.trim()}`;
        const sig = impLine.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        if (!seenOrderKeys.has(sig)) {
          seenOrderKeys.add(sig);
          nonMedOrderLines.push(impLine);
        }
      }
    }

    // Prefer non-medication post-op nursing/care instructions (medications already appear in Medication List table)
    const instructionLines = nonMedOrderLines;
    const planLines = instructionLines.map((line) => `[${POD_0_POST_OP_HEADING}] ${line}`);

    const existingIdx = nextNotes.findIndex((n) => n.id === noteId);
    const existingNote = existingIdx >= 0 ? nextNotes[existingIdx] : undefined;

    const syncedNote: IpdDailyNote = {
      id: noteId,
      date: dateStr,
      time: timeStr,
      podLabel: POD_0_POST_OP_HEADING,
      vitals: existingNote?.vitals || {},
      subjective:
        uniqueProcNames.length > 0 ? `OT Procedure: ${uniqueProcNames.join(' + ')}` : '',
      objective: objectiveLines.join('\n'),
      assessmentPlan: planLines.join('\n'),
      authorName:
        procs.find((p) => p.surgeonName?.trim())?.surgeonName ||
        authorName ||
        existingNote?.authorName ||
        '',
      createdAt: existingNote?.createdAt || Date.now(),
    };

    if (existingIdx >= 0) {
      nextNotes[existingIdx] = syncedNote;
    } else {
      nextNotes = [syncedNote, ...nextNotes];
    }
  }

  return nextNotes;
}

// ============================================================================
// Post-Op Orders -> IPD Medication Chart Sync
// ============================================================================

const EXPLICIT_MED_FORM_PREFIX_RE =
  /^(?:inj(?:ection)?\.?|tab(?:let)?s?\.?|cap(?:sule)?s?\.?|syp\.?|syrup|susp(?:ension)?\.?|drops?\.?|oint(?:ment)?\.?|cream|gel|lotion|neb(?:ulisation|ulizer)?\.?|inhaler|patch|supp(?:ository)?\.?|sachet|powder|soln\.?|solution|liquid|ivf|iv\s*fluids?|i\.?v\.?\s*fluids?|t\.|c\.|i\.)(?:\s|$)/i;

const KNOWN_POSTOP_MED_KEYWORD_RE =
  /\b(ceftriaxone|cefoperazone|sulbactam|cefixime|cefuroxime|cefpodoxime|amikacin|gentamicin|piperacillin|tazobactam|meropenem|imipenem|levofloxacin|ciprofloxacin|ofloxacin|nitrofurantoin|fosfomycin|augmentin|amoxicillin|clavulanate|metronidazole|linezolid|azithromycin|doxycycline|paracetamol|pcm|acetaminophen|diclofenac|tramadol|ketorolac|ibuprofen|aceclofenac|drotaverine|buscopan|hyoscine|pantoprazole|rabeprazole|omeprazole|esomeprazole|ranitidine|ondansetron|emeset|metoclopramide|tamsulosin|silodosin|silofast|alfuzosin|urimax|vellos|mirabegron|mirago|solifenacin|tolterodine|darifenacin|phenazopyridine|pyridium|potassium\s*citrate|cital|alkasol|lactulose|cremaffin|duphalac|enoxaparin|clexane|heparin|tranexamic|ethamsylate|furosemide|lasix|mupirocin|bactroban|antibiotics?|analgesics?|anti[-\s]?inflammatory|antiemetics?|alpha[-\s]?blocker|stool\s*softener|ringer\s*lactate|\brl\b|\bdns\b|\bns\b(?=\s*[@\d])|normal\s*saline(?=\s*[@\d]))\b/i;

const NON_MED_NURSING_ORDER_RE =
  /\b(nbm|npo|nil\s*by\s*mouth|oral\s*diet|soft\s*diet|liquid\s*diet|sips\s*to|plenty\s*of\s*(?:oral\s*)?fluids?|oral\s*fluids?\s*after|bladder\s*irrigation|continuous\s*normal\s*saline|cbi\b|catheter\s*removal|foley\s*catheter|dj\s*stent|stent\s*removal|drain\s*removal|dressing\s*check|keep\s*dressing|suture|check\s*hb|x[-\s]?ray|kub\b|usg\b|input\s*\/?\s*output|i\s*\/\s*o\s*chart|urine\s*color|vitals?\b|monitor\b|mobilis|scrotal\s*elevation|self[-\s]?calibration|\bcic\b|review\s*with\s*hpe|follow[-\s]?up|avoid\s*sleeping)\b/i;

function normalizeMedDedupeKey(medicine: string, route?: string): string {
  const cleanName = (medicine || '')
    .toLowerCase()
    .replace(/^(?:inj(?:ection)?\.?|tab(?:let)?s?\.?|cap(?:sule)?s?\.?|syp\.?|syrup|oint(?:ment)?\.?|neb\.?)\s+/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const cleanRoute = (route || '').toLowerCase().includes('iv') ? 'iv' : 'other';
  return `${cleanName}|${cleanRoute}`;
}

function makeMedSlug(text: string): string {
  return (text || 'med')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function parseSinglePostOpMedicationSegment(
  rawSegment: string,
  startDate: string,
  idPrefix: string,
  sourceNoteLabel: string,
  doctorUid?: string
): IpdMedicationOrder | null {
  let segment = (rawSegment || '')
    .replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '')
    .replace(/^(?:post[-\s]?op\s*)?(?:medications?|drugs?|rx)\s*:\s*/i, '')
    .replace(/\.+$/, '')
    .trim();

  if (!segment || segment.length < 3) return null;

  const hasExplicitPrefix = EXPLICIT_MED_FORM_PREFIX_RE.test(segment);
  const masterDirect = findMasterMedicationByName(segment, '', doctorUid);
  const hasKnownKeyword = KNOWN_POSTOP_MED_KEYWORD_RE.test(segment);

  // Exclude nursing / diet / monitoring orders unless they explicitly start with a medication dosage form
  if (!hasExplicitPrefix && NON_MED_NURSING_ORDER_RE.test(segment) && !masterDirect) {
    return null;
  }
  if (!hasExplicitPrefix && !hasKnownKeyword && !masterDirect) {
    return null;
  }

  // Extract duration (e.g. "for 5 days", "x 3d", "for 2 weeks")
  let durationText = '';
  const durMatch = segment.match(
    /\b(?:for|x|×)\s*(\d+(?:\s*[-–]\s*\d+)?\s*(?:days?|d\b|weeks?|wks?|months?))\b/i
  );
  if (durMatch) {
    durationText = durMatch[0].trim();
  }

  // Extract dosage / infusion rate (e.g. "1.5g", "40mg", "0.4 mg", "@ 80 ml/hr", "100 mL/h")
  let dosage = '';
  const rateMatch = segment.match(/(?:@\s*|at\s+)?(\d+(?:\.\d+)?\s*(?:ml|mL)\s*\/\s*(?:hr?|hour))/i);
  const strengthMatch = segment.match(
    /\b(\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?\s*(?:mg|gm|g|mcg|ug|ml|mL|iu|units?|%))\b/i
  );
  if (rateMatch) {
    dosage = rateMatch[1].replace(/\s+/g, ' ').trim();
  } else if (strengthMatch) {
    dosage = strengthMatch[1].replace(/\s+/g, '').trim();
  }

  // Infer route
  let route: IpdMedicationOrder['route'] = 'Oral (PO)';
  if (/\b(?:ivf|iv\s*fluids?|i\.?v\.?\s*fluids?)\b/i.test(segment)) {
    route = 'IV';
  } else if (/\b(?:s\.?c\.?|subcut(?:aneous)?)\b/i.test(segment)) {
    route = 'SC';
  } else if (/\b(?:i\.?m\.?|intramuscular)\b/i.test(segment)) {
    route = 'IM';
  } else if (/\b(?:oint(?:ment)?|cream|gel|lotion|topical|local\s+application)\b/i.test(segment)) {
    route = 'Topical';
  } else if (/\b(?:neb(?:ulisation|ulizer)?)\b/i.test(segment)) {
    route = 'Nebulisation';
  } else if (
    /\b(?:i\.?v\.?|intravenous)\b/i.test(segment) ||
    /^inj(?:ection)?\.?\s/i.test(segment)
  ) {
    route = 'IV';
  } else if (/\b(?:p\.?o\.?|oral|tab(?:let)?|cap(?:sule)?|syp|syrup)\b/i.test(segment)) {
    route = 'Oral (PO)';
  }

  // Extract frequency
  let frequency = '';
  const numericFreq = segment.match(/\b([012]\s*-\s*[012]\s*-\s*[012](?:\s*-\s*[012])?)\b/);
  const qhMatch = segment.match(/\b(Q\s*\d+\s*H)\b/i);
  if (rateMatch) {
    frequency = 'Continuous';
  } else if (numericFreq) {
    frequency = numericFreq[1].replace(/\s+/g, '');
  } else if (qhMatch) {
    frequency = qhMatch[1].replace(/\s+/g, '').toUpperCase();
  } else if (/\b(?:sos|prn|as\s*needed)\b/i.test(segment)) {
    frequency = 'SOS (As needed)';
  } else if (/\bstat\b/i.test(segment)) {
    frequency = 'STAT';
  } else if (/\b(?:qid|q\.i\.d\.?)\b/i.test(segment)) {
    frequency = '1-1-1-1 (QID)';
  } else if (/\b(?:tds|tid|t\.d\.s\.?|t\.i\.d\.?)\b/i.test(segment)) {
    frequency = '1-1-1 (TDS)';
  } else if (/\b(?:bd|bid|b\.d\.?|b\.i\.d\.?)\b/i.test(segment)) {
    frequency = '1-0-1 (BD)';
  } else if (/\b(?:hs|h\.s\.?|bedtime|at\s*night)\b/i.test(segment)) {
    frequency = '0-0-1 (HS)';
  } else if (/\b(?:od|o\.d\.?|once\s*daily)\b/i.test(segment)) {
    frequency = '1-0-0 (OD)';
  }

  // Extract timing (`when`)
  let when = '';
  if (rateMatch) {
    when = 'Continuous infusion';
  } else if (/\b(?:before\s*food|empty\s*stomach|a\/c)\b/i.test(segment)) {
    when = 'Before food (a/c)';
  } else if (/\b(?:after\s*food|p\/c)\b/i.test(segment)) {
    when = 'After food (p/c)';
  } else if (/\b(?:hs|h\.s\.?|bedtime|at\s*night)\b/i.test(segment)) {
    when = 'Bedtime (HS)';
  } else if (/\b(?:sos|prn|as\s*needed)\b/i.test(segment)) {
    when = 'As needed';
  }

  // Clean medicine name by stripping extracted dosage, route tokens, frequency tokens, and duration
  let medicineName = segment
    .replace(/(?:@\s*|at\s+)?\d+(?:\.\d+)?\s*(?:ml|mL)\s*\/\s*(?:hr?|hour)/gi, '')
    .replace(/\b\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?\s*(?:mg|gm|g|mcg|ug|ml|mL|iu|units?|%)\b/gi, '')
    .replace(/\b(?:for|x|×)\s*\d+(?:\s*[-–]\s*\d+)?\s*(?:days?|d\b|weeks?|wks?|months?)\b/gi, '')
    .replace(/\b(?:[012]\s*-\s*[012]\s*-\s*[012](?:\s*-\s*[012])?)\b/gi, '')
    .replace(/\b(?:Q\s*\d+\s*H|BD|BID|B\.D\.|TDS|TID|T\.D\.S\.|QID|OD|O\.D\.|HS|H\.S\.|SOS|PRN|STAT)\b/gi, '')
    .replace(/\b(?:before\s*food|after\s*food|empty\s*stomach|bedtime|as\s*needed|a\/c|p\/c)\b/gi, '')
    // Strip standalone route token when it's not part of "IV Fluids" or "IV Antibiotics"
    .replace(/(?!\bIV\s+(?:Fluids?|Antibiotics?|Analgesics?|Hydration))\b(?:IV|I\.V\.|IM|I\.M\.|SC|S\.C\.|PO|P\.O\.)\b/gi, '')
    .replace(/[@,;:\-–—]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!medicineName || medicineName.length < 2) {
    medicineName = segment;
  }

  // Enrich with doctor's Medicine Master list if matched
  const master = masterDirect || findMasterMedicationByName(medicineName, dosage, doctorUid);
  if (master) {
    if (!dosage && master.dosage) dosage = master.dosage;
    if (!frequency && master.frequency) frequency = master.frequency;
    if (!when && master.when) when = master.when;
  }

  if (!frequency) {
    frequency = route === 'IV' && /\biv\s*fluids?|ivf\b/i.test(medicineName) ? 'Continuous' : '1-0-1 (BD)';
  }

  const noteParts = [
    sourceNoteLabel,
    durationText ? `Duration: ${durationText.replace(/^(?:for|x|×)\s*/i, '')}` : '',
    master?.notes || '',
  ].filter(Boolean);

  return {
    id: `${idPrefix}${makeMedSlug(medicineName)}`,
    medicine: medicineName,
    dosage,
    route,
    frequency,
    when,
    startDate: startDate || getTodayIso(),
    status: 'active',
    notes: Array.from(new Set(noteParts)).join(' · '),
  };
}

/**
 * Extracts structured IPD Medication Orders from OT Post-Op Orders free text.
 */
export function extractMedicationsFromPostOpOrders(
  postOpOrders: string | undefined,
  startDate: string,
  otIdentityKey: string,
  doctorUid?: string,
  procedureLabel?: string
): IpdMedicationOrder[] {
  if (!postOpOrders || !postOpOrders.trim()) return [];

  const rawLines = postOpOrders
    .split(/\r?\n|\s*;\s*/)
    .flatMap((chunk) => {
      const trimmed = chunk.trim();
      if (!trimmed) return [];
      // If a single line contains multiple comma-separated dosage-form orders (e.g. "Inj Pan 40mg IV OD, Inj PCM 1g IV SOS"), split safely
      const commaParts = trimmed.split(/\s*,\s*/);
      if (
        commaParts.length >= 2 &&
        commaParts.filter((p) => EXPLICIT_MED_FORM_PREFIX_RE.test(p.trim())).length >= 2
      ) {
        return commaParts;
      }
      return [trimmed];
    });

  const prefix = `ot-med-${makeMedSlug(otIdentityKey)}-`;
  const sourceLabel = procedureLabel
    ? `Post-Op Order (${procedureLabel.slice(0, 32)})`
    : 'Post-Op Order';

  const parsed: IpdMedicationOrder[] = [];
  const seenIds = new Set<string>();

  for (const line of rawLines) {
    const order = parseSinglePostOpMedicationSegment(
      line,
      startDate,
      prefix,
      sourceLabel,
      doctorUid
    );
    if (!order) continue;
    let uniqueId = order.id;
    let counter = 2;
    while (seenIds.has(uniqueId)) {
      uniqueId = `${order.id}-${counter++}`;
    }
    seenIds.add(uniqueId);
    parsed.push({ ...order, id: uniqueId });
  }

  return parsed;
}

/**
 * Syncs medications parsed from OT Post-Op Orders into the patient's IPD Medication Chart.
 * - Preserves all manually added medications untouched.
 * - Updates existing auto-synced `ot-med-*` orders when OT notes are edited (keeping held/stopped status).
 * - Removes `ot-med-*` orders belonging to deleted OT procedures.
 * - Deduplicates against existing manually-added medications so nothing is duplicated.
 */
export function syncOtPostOpMedicationsToIpd(
  existingMeds: IpdMedicationOrder[],
  otProcedures: OtNotes[],
  doctorUid?: string
): IpdMedicationOrder[] {
  const validProcs = (otProcedures || []).filter((ot) => hasOtNotesData(ot));
  const currentList = existingMeds || [];

  // Map existing ot-med-* orders by id so we preserve manual status/stopDate edits if still present
  const existingById = new Map<string, IpdMedicationOrder>();
  for (const m of currentList) {
    existingById.set(m.id, m);
  }

  // Keep all non-OT-synced medications intact
  const manualMeds = currentList.filter((m) => !m.id.startsWith('ot-med-'));
  const manualKeys = new Set(
    manualMeds.map((m) => normalizeMedDedupeKey(m.medicine, m.route))
  );

  const syncedOtMeds: IpdMedicationOrder[] = [];
  const addedSyncedKeys = new Set<string>();

  for (const ot of validProcs) {
    if (!ot.postOpOrders?.trim()) continue;
    const otKey = getOtIdentityKey(ot);
    const startDate = ot.surgeryDate || getTodayIso();
    const extracted = extractMedicationsFromPostOpOrders(
      ot.postOpOrders,
      startDate,
      otKey,
      doctorUid,
      ot.procedureName
    );
    for (const item of extracted) {
      const dedupeKey = normalizeMedDedupeKey(item.medicine, item.route);
      if (manualKeys.has(dedupeKey) || addedSyncedKeys.has(dedupeKey)) {
        continue;
      }
      addedSyncedKeys.add(dedupeKey);
      const prev = existingById.get(item.id);
      if (prev) {
        syncedOtMeds.push({
          ...item,
          status: prev.status,
          stopDate: prev.stopDate,
        });
      } else {
        syncedOtMeds.push(item);
      }
    }
  }

  return [...syncedOtMeds, ...manualMeds];
}

/**
 * Syncs medication-specific fields entered on the Surgical Protocol post-op orders
 * (such as IV Fluid order and Alpha-Blocker regimen) into the IPD Medication Chart.
 */
export function syncProtocolMedicationsToIpd(
  existingMeds: IpdMedicationOrder[],
  protocol: IpdSurgicalProtocolProgress | undefined,
  fallbackSurgeryDate?: string,
  doctorUid?: string
): IpdMedicationOrder[] {
  const currentList = existingMeds || [];
  const otherMeds = currentList.filter((m) => !m.id.startsWith('proto-med-'));
  if (!protocol) return otherMeds;

  const existingById = new Map<string, IpdMedicationOrder>();
  for (const m of currentList) {
    existingById.set(m.id, m);
  }

  const otherKeys = new Set(otherMeds.map((m) => normalizeMedDedupeKey(m.medicine, m.route)));
  const startDate = protocol.surgeryDate || fallbackSurgeryDate || getTodayIso();
  const tpl = getSurgicalProtocolById(protocol.protocolId);
  const protoTag = tpl?.shortName || protocol.protocolId.toUpperCase();
  const fv = protocol.fieldValues || {};

  const protoMeds: IpdMedicationOrder[] = [];

  // 1. IV Fluid order field
  const ivOrderVal = (fv.ivFluidOrder || '').trim();
  if (ivOrderVal && !/^(?:nil|none|stop|stopped|n\/a|-)$/i.test(ivOrderVal)) {
    const rawLine = /^iv\s*fluids?|^ivf\b/i.test(ivOrderVal)
      ? ivOrderVal
      : `IV Fluids ${ivOrderVal}`;
    const parsed = parseSinglePostOpMedicationSegment(
      rawLine,
      startDate,
      'proto-med-ivfluid-',
      `${protoTag} Protocol Order`,
      doctorUid
    );
    if (parsed) {
      const fixedId = 'proto-med-ivFluidOrder';
      const dedupeKey = normalizeMedDedupeKey(parsed.medicine, parsed.route);
      if (!otherKeys.has(dedupeKey)) {
        const prev = existingById.get(fixedId);
        protoMeds.push({
          ...parsed,
          id: fixedId,
          status: prev?.status || 'active',
          stopDate: prev?.stopDate,
        });
        otherKeys.add(dedupeKey);
      }
    }
  }

  // 2. Alpha-Blocker regimen field (PCNL / URSL protocols)
  const alphaVal = (fv.alphaBlockerRegimen || '').trim();
  if (alphaVal && !/^(?:nil|none|not\s*indicated|n\/a|-)$/i.test(alphaVal)) {
    const rawLine = EXPLICIT_MED_FORM_PREFIX_RE.test(alphaVal) ? alphaVal : `Tab. ${alphaVal}`;
    const parsed = parseSinglePostOpMedicationSegment(
      rawLine,
      startDate,
      'proto-med-alpha-',
      `${protoTag} Protocol Order`,
      doctorUid
    );
    if (parsed) {
      const fixedId = 'proto-med-alphaBlockerRegimen';
      const dedupeKey = normalizeMedDedupeKey(parsed.medicine, parsed.route);
      if (!otherKeys.has(dedupeKey)) {
        const prev = existingById.get(fixedId);
        protoMeds.push({
          ...parsed,
          id: fixedId,
          status: prev?.status || 'active',
          stopDate: prev?.stopDate,
        });
        otherKeys.add(dedupeKey);
      }
    }
  }

  return [...otherMeds, ...protoMeds];
}

/**
 * Returns OT procedures that existed in `prevProcs` but were removed in `nextProcs`.
 */
export function findRemovedOtProcedures(prevProcs: OtNotes[], nextProcs: OtNotes[]): OtNotes[] {
  return (prevProcs || []).filter(
    (prevOt) =>
      hasOtNotesData(prevOt) && !(nextProcs || []).some((nextOt) => isSameOtProcedure(prevOt, nextOt))
  );
}

/**
 * Checks whether an OPD Consultation record corresponds to a specific IPD patient's OT procedure
 * so deleting an OT note in IPD cleanly deletes the synced OPD OT record too.
 */
export function doesOpdConsultationMatchIpdOt(
  c: Consultation,
  patient: IpdPatientRecord,
  proc: OtNotes
): boolean {
  if (!c || !hasOtNotesData(c)) return false;

  const deterministicId = buildStandaloneOpdOtConsultationFromIpd(patient, proc).id;
  if (c.id === deterministicId || c.id.startsWith(`${deterministicId}-ot-`)) {
    return true;
  }

  // Must belong to the same patient
  const samePatient =
    (patient.linkedOpdConsultationId && c.id === patient.linkedOpdConsultationId) ||
    (() => {
      const opdId = normalizeRegId(c.opdNo);
      const uhid = normalizeRegId(patient.uhid);
      const ipd = normalizeRegId(patient.ipdNo);
      return opdId.length >= 3 && ((uhid && uhid === opdId) || (ipd && ipd === opdId));
    })() ||
    (() => {
      const cName = normalizeClinicalPatientName(c.patientName);
      const pName = normalizeClinicalPatientName(patient.patientName);
      return cName.length >= 3 && pName.length >= 3 && cName === pName;
    })();

  if (!samePatient) return false;

  const cProcs = getConsultationOtProcedures(c);
  if (cProcs.some((cp) => isSameOtProcedure(cp, proc))) {
    return true;
  }

  // Fallback match when proc has surgeryDate (or consultation.date) & procedureName
  const procDate = (proc.surgeryDate || '').trim();
  const procName = (proc.procedureName || '').trim().toLowerCase();
  const cDate = (c.otNotes?.surgeryDate || c.date || '').trim();
  const cName = (c.otNotes?.procedureName || '').trim().toLowerCase();
  if (procDate && cDate && procDate === cDate && procName && cName && procName === cName) {
    return true;
  }

  return false;
}

/**
 * Removes OT procedures associated with deleted OPD OT consultation(s) from a matching IPD patient,
 * updating `otProcedures`, `otNotes`, and pruning the corresponding `ot-postop-*` Daily Progress entries.
 */
export function removeOpdOtFromIpdPatient(
  patient: IpdPatientRecord,
  deletedConsultations: Consultation[]
): { updated: IpdPatientRecord; removedCount: number } {
  const existingProcs = getConsultationOtProcedures(patient as any);
  if (existingProcs.length === 0 || deletedConsultations.length === 0) {
    return { updated: patient, removedCount: 0 };
  }

  const remainingProcs = existingProcs.filter((ipdProc) => {
    const detId = buildStandaloneOpdOtConsultationFromIpd(patient, ipdProc).id;
    const isDeleted = deletedConsultations.some((dc) => {
      if (dc.id === detId || dc.id.startsWith(`${detId}-ot-`)) return true;
      const dcProcs = getConsultationOtProcedures(dc);
      if (dcProcs.some((dcp) => isSameOtProcedure(dcp, ipdProc))) return true;
      const dcDate = (dc.otNotes?.surgeryDate || dc.date || '').trim();
      const ipdDate = (ipdProc.surgeryDate || '').trim();
      const dcName = (dc.otNotes?.procedureName || '').trim().toLowerCase();
      const ipdName = (ipdProc.procedureName || '').trim().toLowerCase();
      if (dcDate && ipdDate && dcDate === ipdDate && dcName && ipdName && dcName === ipdName) {
        return true;
      }
      return false;
    });
    return !isDeleted;
  });

  const removedCount = existingProcs.length - remainingProcs.length;
  if (removedCount === 0) {
    return { updated: patient, removedCount: 0 };
  }

  const nextLatest =
    remainingProcs.length > 0 ? remainingProcs[remainingProcs.length - 1] : undefined;
  const nextDailyNotes = syncOtPostOpNotesToDailyTimeline(
    patient.dailyNotes || [],
    remainingProcs,
    patient.attendingConsultant
  );
  const nextMedications = syncOtPostOpMedicationsToIpd(
    patient.medications || [],
    remainingProcs,
    patient.doctorId
  );

  return {
    removedCount,
    updated: {
      ...patient,
      otProcedures: remainingProcs.length > 0 ? remainingProcs : undefined,
      otNotes: nextLatest,
      dailyNotes: nextDailyNotes,
      medications: nextMedications,
      updatedAt: Date.now(),
    },
  };
}

/**
 * Merges incoming OT procedures (from OPD OT Notes or IPD OT entry) into an IPD patient record,
 * deduplicating cleanly and syncing all Post-Op Instructions into the Daily Progress timeline
 * AND Post-Op Medications into the IPD Medication Chart.
 */
export function mergeOtAndPostOpIntoIpdPatient(
  patient: IpdPatientRecord,
  incomingProcs: OtNotes[],
  authorName?: string,
  doctorUid?: string
): IpdPatientRecord {
  const validIncoming = incomingProcs.filter((ot) => hasOtNotesData(ot));
  if (validIncoming.length === 0) return patient;

  const existingProcs = getConsultationOtProcedures(patient as any);
  const mergedProcs = [...existingProcs];

  for (const inc of validIncoming) {
    const incKey = getOtIdentityKey(inc);
    const incDate = (inc.surgeryDate || '').trim();
    const incName = (inc.procedureName || '').trim().toLowerCase();

    const matchIdx = mergedProcs.findIndex((ex) => {
      if (inc.id && ex.id && ex.id === inc.id) return true;
      if (getOtIdentityKey(ex) === incKey) return true;
      if (
        incDate &&
        ex.surgeryDate === incDate &&
        incName &&
        (ex.procedureName || '').trim().toLowerCase() === incName
      ) {
        return true;
      }
      return false;
    });

    if (matchIdx >= 0) {
      mergedProcs[matchIdx] = mergeOtNotes(mergedProcs[matchIdx], inc) || {
        ...mergedProcs[matchIdx],
        ...inc,
      };
    } else {
      mergedProcs.push({
        ...inc,
        id: inc.id || `ot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      });
    }
  }

  const latestOt = mergedProcs[mergedProcs.length - 1];
  const nextDailyNotes = syncOtPostOpNotesToDailyTimeline(
    patient.dailyNotes || [],
    mergedProcs,
    authorName || patient.attendingConsultant
  );
  const nextMedications = syncOtPostOpMedicationsToIpd(
    patient.medications || [],
    mergedProcs,
    doctorUid || patient.doctorId
  );

  return {
    ...patient,
    otProcedures: mergedProcs,
    otNotes: latestOt,
    surgeryDate: patient.surgeryDate || latestOt?.surgeryDate || undefined,
    dailyNotes: nextDailyNotes,
    medications: nextMedications,
    updatedAt: Date.now(),
  };
}

export function serializeOtProceduresForCompare(patient?: IpdPatientRecord | null): string {
  if (!patient) return '';
  const procs = getConsultationOtProcedures(patient as any);
  return JSON.stringify(procs);
}

function normalizeGenderForOpd(
  g?: IpdPatientRecord['gender']
): 'M' | 'F' | 'Other' {
  const s = String(g || '').trim().toLowerCase();
  if (s.startsWith('f')) return 'F';
  if (s.startsWith('m')) return 'M';
  return 'Other';
}

/**
 * Converts an IPD OT procedure into a standalone OPD OT Consultation record
 * that conforms to existing OPD OT List & Master Register rules (dated by surgeryDate,
 * clean standalone OT entry with no phantom OPD fields, deterministic ID).
 */
export function buildStandaloneOpdOtConsultationFromIpd(
  patient: IpdPatientRecord,
  proc: OtNotes,
  doctor?: { uid?: string; fullName?: string; department?: string } | null
): Consultation {
  const effectiveDate =
    proc.surgeryDate || patient.surgeryDate || patient.admissionDate || getTodayIso();
  const normalizedOt: OtNotes = {
    ...normalizeOtNotes(proc, effectiveDate),
    surgeryDate: effectiveDate,
  };
  const safePatientSlug = (patient.id || 'ipd')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 40);
  const safeProcSlug = getOtIdentityKey(normalizedOt)
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 48);

  return {
    id: `ot-ipd-${safePatientSlug}-${safeProcSlug}`,
    opdNo: patient.uhid || patient.ipdNo || '',
    date: effectiveDate,
    salutation: (patient.salutation || '') as any,
    patientName: patient.patientName,
    phoneNumber: patient.phoneNumber || '',
    contactNumber: patient.phoneNumber || '',
    gender: normalizeGenderForOpd(patient.gender),
    age: patient.age || '',
    address: patient.address || '',
    vitals: {},
    complaints: '',
    historyChecklist: {},
    ipss: {},
    diagnosis:
      normalizedOt.postOpDiagnosis ||
      normalizedOt.preOpDiagnosis ||
      patient.admittingDiagnosis ||
      (normalizedOt.procedureName ? `Operated: ${normalizedOt.procedureName}` : ''),
    prescriptions: [],
    otNotes: normalizedOt,
    otProcedures: [normalizedOt],
    doctorId: doctor?.uid || patient.doctorId,
    doctorName: doctor?.fullName || patient.doctorName || patient.attendingConsultant,
    department: doctor?.department || patient.department,
    createdAt: patient.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * Helper to classify whether a surgical protocol checklist item belongs in
 * Objective/Examination vs Assessment & Plan/Instructions inside Daily Progress Notes.
 * Advice, counselling, return precautions, medication reconciliation, and stent tracking
 * always belong under Instructions & Plan even if they mention symptoms like haematuria
 * or low urine output.
 */
function isProtocolAdviceOrPlanItem(text: string): boolean {
  return /\b(explained|written\s+return\s+advice|return\s+advice|advice\s+given|counsell?ed|follow[-\s]?up|registered\s+for\s+tracking|stent\s+registered|medicines\s+reconciled|mobilis(?:e|ation)|oral\s+fluids|diet\s+authorised|authorised\s*[—–-]|authorized\s*[—–-]|catheter\s+removal|twoc\s+planned|discharge\s+summary)\b/i.test(
    text
  );
}

function isExaminationOrMonitoringProtocolItem(text: string): boolean {
  if (isProtocolAdviceOrPlanItem(text)) {
    return false;
  }
  return /\b(observation|vitals|bp|pulse|spo2|temperature|haematuria|urine colour|urine output|clear\s+urine|drain|dressing|wound|patency|blood test|hb|cbc|creatinine|electrolyte|voiding|pvr|review(?:ed)?\s+observations|assess\s+drainage)\b/i.test(
    text
  );
}

function extractBracketTagPrefix(line: string): string | null {
  const match = line.trim().match(/^(\[[^\]]+\])/);
  return match ? match[1].toLowerCase() : null;
}

function extractBracketTagInner(line: string): { tag: string; body: string } | null {
  const match = line.trim().match(/^\[([^\]]+)\]\s*:?\s*(.+)$/);
  if (!match) return null;
  return { tag: match[1].trim(), body: match[2].trim() };
}

function appendUniqueLine(existing: string, line: string): string {
  const trimmed = line.trim();
  const lines = (existing || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.includes(trimmed)) return lines.join('\n');

  const tag = extractBracketTagPrefix(trimmed);
  if (tag) {
    let lastSameTagIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (extractBracketTagPrefix(lines[i]) === tag) {
        lastSameTagIdx = i;
      }
    }
    if (lastSameTagIdx >= 0) {
      lines.splice(lastSameTagIdx + 1, 0, trimmed);
      return lines.join('\n');
    }
  }
  return [...lines, trimmed].join('\n');
}

function removeMatchingLine(existing: string, line: string): string {
  return (existing || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && l !== line.trim())
    .join('\n');
}

function upsertKeyedLine(existing: string, prefix: string, fullLine: string): string {
  const lines = (existing || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const idx = lines.findIndex((l) => l.startsWith(prefix));
  const trimmed = fullLine.trim();
  if (!trimmed) {
    if (idx >= 0) lines.splice(idx, 1);
    return lines.join('\n');
  }
  if (idx >= 0) {
    lines[idx] = trimmed;
    return lines.join('\n');
  }
  const tag = extractBracketTagPrefix(trimmed);
  if (tag) {
    let lastSameTagIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (extractBracketTagPrefix(lines[i]) === tag) {
        lastSameTagIdx = i;
      }
    }
    if (lastSameTagIdx >= 0) {
      lines.splice(lastSameTagIdx + 1, 0, trimmed);
      return lines.join('\n');
    }
  }
  lines.push(trimmed);
  return lines.join('\n');
}

const PROTOCOL_FILLER_SUBJECTIVE_RE =
  /^[A-Za-z0-9/+\-\s]{2,28}\s+Post[-\s]?Op\s+Protocol\s+Progress$/i;

export function isDischargeProtocolDailyNote(note?: IpdDailyNote | null): boolean {
  return Boolean(note && (note.id || '').startsWith('protocol-discharge-'));
}

function isProtocolManagedDailyNote(note?: IpdDailyNote | null): boolean {
  const id = note?.id || '';
  return id.startsWith('protocol-daily-') || id.startsWith('protocol-discharge-');
}

/**
 * Redistributes protocol-synced daily notes (`protocol-daily-*` and `protocol-discharge-*`)
 * so that:
 * - Each POD stage (`[POD 0 - POST OP]`, `[POD 1]`, `[POD 3–4]`, etc.) lives on its exact
 *   POD calendar date (`surgeryDate + N days`) under `protocol-daily-{date}`.
 * - Discharge protocol items (`[Discharge]`) live in their OWN dedicated
 *   `protocol-discharge-{date}` note (`podLabel: "Discharge"`), never mixed with POD orders.
 * - Misplaced discharge counselling lines move from Examination into Plan, and empty
 *   auto-generated protocol notes are removed cleanly.
 */
export function redistributeProtocolDailyNotesByPod(
  dailyNotes: IpdDailyNote[],
  context: {
    surgeryDate?: string;
    admissionDate?: string;
    dischargeDate?: string;
    stages?: Array<{ dayTag: string }>;
  }
): IpdDailyNote[] {
  const { surgeryDate, admissionDate, dischargeDate, stages } = context;
  const hasSurgery = Boolean(surgeryDate && /^\d{4}-\d{2}-\d{2}$/.test(surgeryDate));
  if (!dailyNotes || dailyNotes.length === 0) return [];

  const nonProtocolNotes: IpdDailyNote[] = [];
  const protocolNotes: IpdDailyNote[] = [];

  for (const note of dailyNotes) {
    if (isProtocolManagedDailyNote(note)) {
      protocolNotes.push(note);
    } else {
      nonProtocolNotes.push(note);
    }
  }

  if (protocolNotes.length === 0) {
    return dailyNotes;
  }

  const dailyBucketByDate = new Map<string, IpdDailyNote>();
  const dischargeBucketByDate = new Map<string, IpdDailyNote>();

  const ensureBucket = (
    targetDate: string,
    seed: IpdDailyNote,
    kind: 'daily' | 'discharge'
  ): IpdDailyNote => {
    const map = kind === 'discharge' ? dischargeBucketByDate : dailyBucketByDate;
    let bucket = map.get(targetDate);
    if (!bucket) {
      const podLabel =
        kind === 'discharge'
          ? 'Discharge'
          : formatDailyProgressPodLabel(
              hasSurgery ? formatPodLabel(surgeryDate, targetDate) : seed.podLabel,
              surgeryDate,
              targetDate
            ) || 'Protocol';
      bucket = {
        id: kind === 'discharge' ? `protocol-discharge-${targetDate}` : `protocol-daily-${targetDate}`,
        date: targetDate,
        time: seed.time || getCurrentTimeHHMM(),
        podLabel,
        vitals: {},
        subjective: '',
        objective: '',
        assessmentPlan: '',
        authorName: seed.authorName || '',
        createdAt: seed.createdAt || Date.now(),
      };
      map.set(targetDate, bucket);
    } else {
      if (!bucket.authorName && seed.authorName) {
        bucket.authorName = seed.authorName;
      }
      if (seed.createdAt && (!bucket.createdAt || seed.createdAt < bucket.createdAt)) {
        bucket.createdAt = seed.createdAt;
      }
    }
    return bucket;
  };

  for (const note of protocolNotes) {
    const fallbackDate = note.date || getTodayIso();
    const noteIsDischarge = isDischargeProtocolDailyNote(note);

    // Preserve any real (non-filler) subjective text or vitals on the note's original date
    const cleanedSubjective = (note.subjective || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !PROTOCOL_FILLER_SUBJECTIVE_RE.test(l))
      .join('\n');

    if (cleanedSubjective || noteHasVitals(note)) {
      const origBucket = ensureBucket(
        fallbackDate,
        note,
        noteIsDischarge ? 'discharge' : 'daily'
      );
      if (cleanedSubjective) {
        for (const sl of cleanedSubjective.split('\n')) {
          origBucket.subjective = appendUniqueLine(origBucket.subjective, sl);
        }
      }
      if (noteHasVitals(note) && !noteHasVitals(origBucket)) {
        origBucket.vitals = { ...(note.vitals || {}) };
      }
    }

    const routeFieldLines = (rawText: string, defaultSlot: 'objective' | 'assessmentPlan') => {
      for (const rawLine of (rawText || '').split(/\r?\n/)) {
        const trimmed = rawLine.trim();
        if (!trimmed || PROTOCOL_FILLER_SUBJECTIVE_RE.test(trimmed)) continue;

        const parsed = extractBracketTagInner(trimmed);
        let targetDate = fallbackDate;
        let normalizedLine = trimmed;
        let targetKind: 'daily' | 'discharge' = noteIsDischarge ? 'discharge' : 'daily';

        if (parsed) {
          const matchedStageIdx = stages?.findIndex(
            (st) => st.dayTag.trim().toLowerCase() === parsed.tag.toLowerCase()
          );
          const stageOffset = parseProtocolStageDayOffset(
            parsed.tag,
            matchedStageIdx,
            stages
          );
          targetKind = stageOffset === 'discharge' ? 'discharge' : 'daily';
          const normalizedTag =
            normalizeStageHeadingForDailyProgress(parsed.tag, matchedStageIdx, stages) ||
            parsed.tag;
          targetDate =
            stageOffset === 'discharge'
              ? resolveProtocolStageTargetDate(parsed.tag, {
                  surgeryDate,
                  admissionDate,
                  dischargeDate,
                  fallbackDate,
                  stageIndex: matchedStageIdx,
                  stages,
                })
              : hasSurgery
              ? resolveProtocolStageTargetDate(parsed.tag, {
                  surgeryDate,
                  admissionDate,
                  dischargeDate,
                  fallbackDate,
                  stageIndex: matchedStageIdx,
                  stages,
                })
              : fallbackDate;
          normalizedLine = `[${normalizedTag}] ${parsed.body}`;
        }

        // Move misplaced discharge counselling/return-advice lines out of Examination into Plan
        let slot: 'objective' | 'assessmentPlan' = defaultSlot;
        if (defaultSlot === 'objective') {
          const bodyForCheck = parsed ? parsed.body : trimmed;
          if (isProtocolAdviceOrPlanItem(bodyForCheck)) {
            slot = 'assessmentPlan';
          }
        }

        const targetBucket = ensureBucket(targetDate, note, targetKind);
        if (slot === 'objective') {
          targetBucket.objective = appendUniqueLine(targetBucket.objective, normalizedLine);
        } else {
          targetBucket.assessmentPlan = appendUniqueLine(
            targetBucket.assessmentPlan,
            normalizedLine
          );
        }
      }
    };

    routeFieldLines(note.objective || '', 'objective');
    routeFieldLines(note.assessmentPlan || '', 'assessmentPlan');
  }

  const rebuiltProtocolNotes = [
    ...Array.from(dailyBucketByDate.values()),
    ...Array.from(dischargeBucketByDate.values()),
  ].filter(
    (n) =>
      Boolean(
        n.subjective?.trim() ||
          n.objective?.trim() ||
          n.assessmentPlan?.trim() ||
          noteHasVitals(n)
      )
  );

  return [...rebuiltProtocolNotes, ...nonProtocolNotes].sort((a, b) =>
    `${a.date} ${isDischargeProtocolDailyNote(a) ? '1' : '0'} ${a.time}`.localeCompare(
      `${b.date} ${isDischargeProtocolDailyNote(b) ? '1' : '0'} ${b.time}`
    )
  );
}

/**
 * Returns a patient's daily notes with any legacy mixed-stage protocol notes cleanly
 * routed to each stage's specific POD calendar date.
 */
export function getNormalizedDailyNotesForPatient(patient: IpdPatientRecord): IpdDailyNote[] {
  const effectiveSurgeryDate =
    patient.surgicalProtocol?.surgeryDate ||
    patient.surgeryDate ||
    patient.otNotes?.surgeryDate;
  const effectiveDischargeDate =
    patient.dischargeDate || patient.dischargeSummary?.dischargeDate;
  const tpl = patient.surgicalProtocol
    ? getSurgicalProtocolById(patient.surgicalProtocol.protocolId)
    : null;

  return redistributeProtocolDailyNotesByPod(patient.dailyNotes || [], {
    surgeryDate: effectiveSurgeryDate,
    admissionDate: patient.admissionDate,
    dischargeDate: effectiveDischargeDate,
    stages: tpl?.stages,
  });
}

/**
 * Automatically updates the specific POD's Daily Progress Note when a doctor clicks
 * a checkbox or selects a field/option on the Surgical Protocol panel.
 * Even when clicked retrospectively on a later day, each protocol stage routes to
 * its exact POD calendar date (`surgeryDate + N days`).
 */
export function syncProtocolActionToDailyNotes(
  patient: IpdPatientRecord,
  protocol: IpdSurgicalProtocolProgress,
  action:
    | {
        type: 'toggle-item';
        stageTag: string;
        itemText: string;
        checked: boolean;
      }
    | {
        type: 'set-field';
        stageTag: string;
        fieldLabel: string;
        value: string;
      }
    | {
        type: 'set-deviation';
        value: string;
      },
  authorName?: string
): IpdDailyNote[] {
  const tpl = getSurgicalProtocolById(protocol.protocolId);
  const protoShort = tpl?.shortName || protocol.protocolId.toUpperCase();
  const todayIso = getTodayIso();
  const effectiveSurgeryDate =
    protocol.surgeryDate || patient.surgeryDate || patient.otNotes?.surgeryDate;
  const effectiveDischargeDate =
    patient.dischargeDate || patient.dischargeSummary?.dischargeDate;

  // First migrate any existing mixed-stage protocol notes onto their proper POD dates
  const existingNotes = redistributeProtocolDailyNotesByPod(patient.dailyNotes || [], {
    surgeryDate: effectiveSurgeryDate,
    admissionDate: patient.admissionDate,
    dischargeDate: effectiveDischargeDate,
    stages: tpl?.stages,
  });

  const stageTagForAction = action.type === 'set-deviation' ? '' : action.stageTag || '';
  const stageIdx =
    stageTagForAction && tpl?.stages
      ? tpl.stages.findIndex(
          (st) => st.dayTag.trim().toLowerCase() === stageTagForAction.trim().toLowerCase()
        )
      : -1;

  const isDischargeAction =
    action.type !== 'set-deviation' &&
    parseProtocolStageDayOffset(
      stageTagForAction,
      stageIdx >= 0 ? stageIdx : undefined,
      tpl?.stages
    ) === 'discharge';

  const targetDate =
    action.type === 'set-deviation'
      ? effectiveDischargeDate && /^\d{4}-\d{2}-\d{2}$/.test(effectiveDischargeDate)
        ? effectiveDischargeDate
        : todayIso
      : resolveProtocolStageTargetDate(stageTagForAction, {
          surgeryDate: effectiveSurgeryDate,
          admissionDate: patient.admissionDate,
          dischargeDate: effectiveDischargeDate,
          fallbackDate: todayIso,
          stageIndex: stageIdx >= 0 ? stageIdx : undefined,
          stages: tpl?.stages,
        });

  const noteId = isDischargeAction
    ? `protocol-discharge-${targetDate}`
    : `protocol-daily-${targetDate}`;
  const computedPod = formatDailyProgressPodLabel(
    formatPodLabel(effectiveSurgeryDate, targetDate),
    effectiveSurgeryDate,
    targetDate
  );
  const fallbackStageLabel = stageTagForAction
    ? normalizeStageHeadingForDailyProgress(
        stageTagForAction,
        stageIdx >= 0 ? stageIdx : undefined,
        tpl?.stages
      )
    : '';
  const resolvedPodLabel = isDischargeAction
    ? 'Discharge'
    : computedPod || fallbackStageLabel || 'Protocol';

  const existingIdx = existingNotes.findIndex((n) => n.id === noteId);
  const existingNote: IpdDailyNote =
    existingIdx >= 0
      ? existingNotes[existingIdx]
      : {
          id: noteId,
          date: targetDate,
          time: getCurrentTimeHHMM(),
          podLabel: resolvedPodLabel,
          vitals: {},
          subjective: '',
          objective: '',
          assessmentPlan: '',
          authorName: authorName || patient.attendingConsultant || '',
          createdAt: Date.now(),
        };

  let nextObjective = existingNote.objective || '';
  let nextPlan = existingNote.assessmentPlan || '';

  // Clean up legacy filler subjective text if present on auto-generated protocol notes
  const cleanedSubjective = PROTOCOL_FILLER_SUBJECTIVE_RE.test(
    (existingNote.subjective || '').trim()
  )
    ? ''
    : existingNote.subjective || '';

  if (action.type === 'toggle-item') {
    const normalizedTag =
      normalizeStageHeadingForDailyProgress(
        action.stageTag,
        stageIdx >= 0 ? stageIdx : undefined,
        tpl?.stages
      ) || action.stageTag;
    const orderText = convertProtocolItemToClinicalOrder(action.itemText) || action.itemText;
    const line = `[${normalizedTag}] ${orderText}`;
    const rawNormalizedLine = `[${normalizedTag}] ${action.itemText}`;
    const legacyLine = `[${protoShort} · ${action.stageTag}] ${action.itemText}`;
    const legacyOrderLine = `[${protoShort} · ${action.stageTag}] ${orderText}`;
    const variants = [line, rawNormalizedLine, legacyLine, legacyOrderLine];
    const stripAllVariants = (text: string) =>
      variants.reduce((acc, v) => removeMatchingLine(acc, v), text);

    const isExam = isExaminationOrMonitoringProtocolItem(action.itemText);
    if (action.checked) {
      nextObjective = stripAllVariants(nextObjective);
      nextPlan = stripAllVariants(nextPlan);
      if (isExam) {
        nextObjective = appendUniqueLine(nextObjective, line);
      } else {
        nextPlan = appendUniqueLine(nextPlan, line);
      }
    } else {
      nextObjective = stripAllVariants(nextObjective);
      nextPlan = stripAllVariants(nextPlan);
      // Defensively strip any stale copy on other protocol notes too
      for (let i = 0; i < existingNotes.length; i++) {
        if (i === existingIdx) continue;
        if (!isProtocolManagedDailyNote(existingNotes[i])) continue;
        existingNotes[i] = {
          ...existingNotes[i],
          objective: stripAllVariants(existingNotes[i].objective || ''),
          assessmentPlan: stripAllVariants(existingNotes[i].assessmentPlan || ''),
        };
      }
    }
  } else if (action.type === 'set-field') {
    const normalizedTag =
      normalizeStageHeadingForDailyProgress(
        action.stageTag,
        stageIdx >= 0 ? stageIdx : undefined,
        tpl?.stages
      ) || action.stageTag;
    const prefix = `[${normalizedTag}] ${action.fieldLabel}:`;
    const legacyPrefix = `[${protoShort} · ${action.stageTag}] ${action.fieldLabel}:`;
    const fullLine = action.value.trim() ? `${prefix} ${action.value.trim()}` : '';
    nextPlan = upsertKeyedLine(nextPlan, legacyPrefix, '');
    nextPlan = upsertKeyedLine(nextPlan, prefix, fullLine);
    // Remove stale duplicate keyed lines from any other protocol note
    for (let i = 0; i < existingNotes.length; i++) {
      if (i === existingIdx) continue;
      if (!isProtocolManagedDailyNote(existingNotes[i])) continue;
      existingNotes[i] = {
        ...existingNotes[i],
        assessmentPlan: upsertKeyedLine(
          upsertKeyedLine(existingNotes[i].assessmentPlan || '', legacyPrefix, ''),
          prefix,
          ''
        ),
      };
    }
  } else if (action.type === 'set-deviation') {
    const prefix = `[${protoShort} Remarks]:`;
    const fullLine = action.value.trim() ? `${prefix} ${action.value.trim()}` : '';
    nextPlan = upsertKeyedLine(nextPlan, prefix, fullLine);
  }

  const targetIsEmpty =
    !cleanedSubjective.trim() &&
    !nextObjective.trim() &&
    !nextPlan.trim() &&
    !noteHasVitals(existingNote);

  if (targetIsEmpty) {
    if (existingIdx >= 0) {
      existingNotes.splice(existingIdx, 1);
    }
  } else {
    const updatedNote: IpdDailyNote = {
      ...existingNote,
      date: targetDate,
      time: existingIdx >= 0 ? existingNote.time || getCurrentTimeHHMM() : getCurrentTimeHHMM(),
      podLabel: resolvedPodLabel || existingNote.podLabel,
      subjective: cleanedSubjective,
      objective: nextObjective,
      assessmentPlan: nextPlan,
    };

    if (existingIdx >= 0) {
      existingNotes[existingIdx] = updatedNote;
    } else {
      existingNotes.unshift(updatedNote);
    }
  }

  // Drop any other auto-created protocol notes that became completely empty after cleanup
  return existingNotes
    .filter((n) => {
      if (!isProtocolManagedDailyNote(n)) return true;
      return Boolean(
        n.subjective?.trim() ||
          n.objective?.trim() ||
          n.assessmentPlan?.trim() ||
          noteHasVitals(n)
      );
    })
    .sort((a, b) =>
      `${a.date} ${isDischargeProtocolDailyNote(a) ? '1' : '0'} ${a.time}`.localeCompare(
        `${b.date} ${isDischargeProtocolDailyNote(b) ? '1' : '0'} ${b.time}`
      )
    );
}

export interface ConsolidatedDailyVitalsEntry {
  noteId: string;
  time: string;
  items: string[];
}

export interface ConsolidatedDayProgress {
  visibleNotes: IpdDailyNote[];
  vitalsEntries: ConsolidatedDailyVitalsEntry[];
  combinedSubjective: string;
  combinedObjective: string;
  combinedAssessmentPlan: string;
  authors: string[];
}

function noteHasVitals(note: IpdDailyNote): boolean {
  const v = note.vitals;
  if (!v) return false;
  return Boolean(
    v.bp?.trim() ||
      v.pulse?.trim() ||
      v.temp?.trim() ||
      v.spo2?.trim() ||
      v.intakeMl?.trim() ||
      v.urineOutputMl?.trim() ||
      v.drainOutputMl?.trim()
  );
}

function stripRedundantMedLinesFromLegacyOtPlan(
  text: string,
  hasMedicationsTable: boolean
): string {
  if (!text?.trim() || !hasMedicationsTable) return text || '';
  const kept: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (!trimmed) {
      kept.push('');
      continue;
    }
    // Preserve headings like "Post-Op Instructions:" or "POD 0 - POST OP:"
    if (/^[^:]{2,64}:$/.test(trimmed)) {
      kept.push(trimmed);
      continue;
    }
    const bracketMatch = trimmed.match(/^(\[[^\]]+\])\s*(.+)$/);
    const body = bracketMatch ? bracketMatch[2] : trimmed;
    if (isPurePostOpMedicationLine(body)) {
      continue;
    }
    kept.push(trimmed);
  }
  return kept.join('\n').trim();
}

function stripLegacyVerboseOtObjectiveLines(text: string): string {
  if (!text?.trim()) return '';
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(
      (l) =>
        l &&
        !/^(?:Operative Findings|EBL|Intra-Op Notes)\s*:/i.test(l)
    )
    .map((l) =>
      /^\[/.test(l) ? l : `[${POD_0_POST_OP_HEADING}] ${l}`
    )
    .join('\n');
}

function stripLegacyVerboseOtSubjectiveLines(text: string): string {
  if (!text?.trim()) return '';
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(
      (l) =>
        l &&
        !/^(?:Anaesthesia|Post-Op Diagnosis|OT Procedure Recorded)\s*:?/i.test(l)
    )
    .join('\n');
}

/**
 * Consolidates multiple Daily Progress notes on the same calendar date (e.g. OT post-op note,
 * Surgical Protocol progress note, manual ward round note) into ONE uncluttered, deduplicated
 * clinical view per date, while hiding redundant `med-sync-*` bullet notes when the structured
 * Medication List table is shown.
 */
export function consolidateDailyNotesForDate(
  dayNotes: IpdDailyNote[],
  hasMedicationsTable = false
): ConsolidatedDayProgress {
  const visibleNotes = (dayNotes || []).filter((note) => {
    // Hide auto-created med-sync text notes when the structured medication table is rendered
    if (
      (note.id || '').startsWith('med-sync-') &&
      !note.subjective?.trim() &&
      !note.objective?.trim() &&
      !noteHasVitals(note) &&
      hasMedicationsTable
    ) {
      return false;
    }
    return true;
  });

  // Order entries chronologically within the day: OT/Post-Op first, then protocol, then manual ward rounds
  const ordered = [...visibleNotes].sort((a, b) => {
    const rank = (n: IpdDailyNote) =>
      n.id.startsWith('ot-postop-') ? 0 : n.id.startsWith('protocol-daily-') ? 1 : 2;
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    return (a.time || '').localeCompare(b.time || '');
  });

  const vitalsEntries: ConsolidatedDailyVitalsEntry[] = [];
  const subjectiveChunks: string[] = [];
  const objectiveChunks: string[] = [];
  const planChunks: string[] = [];
  const authorSet = new Set<string>();

  for (const note of ordered) {
    if (note.authorName?.trim()) {
      authorSet.add(note.authorName.trim());
    }

    const v = note.vitals || {};
    const vItems = [
      v.bp ? `BP ${v.bp}` : '',
      v.pulse ? `HR ${v.pulse}` : '',
      v.temp ? `Temp ${v.temp}` : '',
      v.spo2 ? `SpO2 ${v.spo2}` : '',
      v.intakeMl ? `Intake ${v.intakeMl}` : '',
      v.urineOutputMl ? `Urine ${v.urineOutputMl}` : '',
      v.drainOutputMl
        ? `Drain ${v.drainOutputMl}${v.drainCharacter ? ` (${v.drainCharacter})` : ''}`
        : '',
    ].filter(Boolean);

    if (vItems.length > 0) {
      vitalsEntries.push({
        noteId: note.id,
        time: note.time || '',
        items: vItems,
      });
    }

    const isLegacyOt = note.id.startsWith('ot-postop-');
    const isProtocol = note.id.startsWith('protocol-daily-');

    if (note.subjective?.trim()) {
      const cleanedSubj = isLegacyOt
        ? stripLegacyVerboseOtSubjectiveLines(note.subjective)
        : isProtocol
        ? note.subjective
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(
              (l) =>
                l && !/^[A-Za-z0-9/+\-\s]{2,28}\s+Post[-\s]?Op\s+Protocol\s+Progress$/i.test(l)
            )
            .join('\n')
        : note.subjective.trim();
      if (cleanedSubj) subjectiveChunks.push(cleanedSubj);
    }

    if (note.objective?.trim()) {
      const cleanedObj = isLegacyOt
        ? stripLegacyVerboseOtObjectiveLines(note.objective)
        : note.objective.trim();
      if (cleanedObj) objectiveChunks.push(cleanedObj);
    }

    if (note.assessmentPlan?.trim()) {
      const cleanedPlan = isLegacyOt
        ? stripRedundantMedLinesFromLegacyOtPlan(note.assessmentPlan, hasMedicationsTable)
        : note.assessmentPlan.trim();
      if (cleanedPlan) planChunks.push(cleanedPlan);
    }
  }

  return {
    visibleNotes,
    vitalsEntries,
    combinedSubjective: subjectiveChunks.join('\n'),
    combinedObjective: objectiveChunks.join('\n'),
    combinedAssessmentPlan: planChunks.join('\n'),
    authors: Array.from(authorSet),
  };
}

// ============================================================================
// OPD <-> IPD Admission Notes Compilation & Master Register Patient Directory
// ============================================================================

export interface CompiledIpssTable {
  visitDate: string;
  frequency: string;
  urgency: string;
  nocturia: string;
  poorFlow: string;
  intermittency: string;
  straining: string;
  incompleteEvacuation: string;
  hesitancy: string;
  secondVoid: string;
  postVoidDribble: string;
  scoreTotal: string;
  qualityOfLife: string;
}

export interface CompiledOpdVisitBrief {
  id: string;
  date: string;
  complaints: string;
  diagnosis: string;
  assessmentPlan: string;
  medicationsSummary: string;
  hasIpss: boolean;
  hasExam: boolean;
}

export interface CompiledAdmissionNotes {
  matchedOpdVisits: Consultation[];
  latestVisit: Consultation | null;
  briefVisitHistory: CompiledOpdVisitBrief[];
  latestVitals: PatientVitals | null;
  latestVitalsDate: string;
  latestExamination: {
    visitDate: string;
    systemicExamination: string;
    genitalExamination: string;
    perRectalExam: string;
    examinationNotes: string;
  } | null;
  historyChecklistFlags: string[];
  latestIpss: CompiledIpssTable | null;
  latestDiagnosis: string;
  latestComplaints: string;
  latestHistoryText: string;
  pastMedication: string;
  compiledComorbidities: string;
  latestPrescriptions: PrescriptionItem[];
  mergedInvestigations: InvestigationItem[];
  labTestsAndImaging: string;
  formattedAdmissionSummaryText: string;
}

export interface MasterRegisterDirectoryPatient {
  key: string;
  salutation: string;
  patientName: string;
  age: string;
  gender: 'M' | 'F' | 'Other';
  uhid: string;
  phoneNumber: string;
  address: string;
  latestDate: string;
  latestDiagnosis: string;
  comorbidities: string;
  allergies: string;
  opdCount: number;
  otCount: number;
  ipdCount: number;
  hasIpss: boolean;
  isCurrentlyAdmitted: boolean;
  activeIpdId?: string;
  latestConsultation: Consultation | null;
  latestIpdRecord: IpdPatientRecord | null;
}

function sortConsultationsNewestFirst(list: Consultation[]): Consultation[] {
  return [...list].sort((a, b) => {
    const dateCmp = (b.date || '').localeCompare(a.date || '');
    if (dateCmp !== 0) return dateCmp;
    return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
  });
}

function consultationHasAnyExam(c?: Consultation | null): boolean {
  if (!c) return false;
  return Boolean(
    c.systemicExamination?.trim() ||
      c.genitalExamination?.trim() ||
      c.perRectalExam?.trim() ||
      c.examinationNotes?.trim()
  );
}

function consultationHasAnyVitals(c?: Consultation | null): boolean {
  if (!c?.vitals) return false;
  const v = sanitizeVitalsObject(c.vitals);
  return Boolean(
    v.bp ||
      v.pulse ||
      v.temp ||
      v.spo2 ||
      v.weight ||
      v.height ||
      v.bmi ||
      (c.vitals as any)?.randomBloodSugar
  );
}

/**
 * Matches all OPD consultations belonging to an IPD patient (or patient seed),
 * sorted newest-first. By default filters to consultations with OPD clinical data
 * (excluding pure standalone OT-only entries).
 */
export function findMatchingOpdConsultationsForIpdPatient(
  target: {
    id?: string;
    linkedOpdConsultationId?: string;
    patientName?: string;
    uhid?: string;
    ipdNo?: string;
    age?: string;
    gender?: string;
  },
  consultations: Consultation[],
  clinicalOpdOnly = true
): Consultation[] {
  if (!consultations || consultations.length === 0) return [];
  const pool = clinicalOpdOnly
    ? consultations.filter((c) => hasOpdClinicalData(c))
    : consultations;
  if (pool.length === 0) return [];

  const matched = new Map<string, Consultation>();
  const targetLinkedId = (target.linkedOpdConsultationId || '').trim();
  const targetUhid = normalizeRegId(target.uhid);
  const targetIpdNo = normalizeRegId(target.ipdNo);
  const targetName = normalizeClinicalPatientName(target.patientName);

  // 1. Direct linked OPD consultation
  if (targetLinkedId) {
    const direct = pool.find((c) => c.id === targetLinkedId);
    if (direct) matched.set(direct.id, direct);
  }

  // 2. Match by UHID / OPD No (>= 3 chars)
  if (targetUhid.length >= 3 || targetIpdNo.length >= 3) {
    for (const c of pool) {
      const cOpdId = normalizeRegId(c.opdNo);
      if (!cOpdId || cOpdId.length < 3) continue;
      if ((targetUhid && cOpdId === targetUhid) || (targetIpdNo && cOpdId === targetIpdNo)) {
        matched.set(c.id, c);
      }
    }
  }

  // 3. Match by normalized patient name (disambiguating by gender if needed)
  if (targetName.length >= 3) {
    const nameMatches = pool.filter(
      (c) => normalizeClinicalPatientName(c.patientName) === targetName
    );
    const targetGender = (target.gender || '').trim().charAt(0).toLowerCase();
    for (const c of nameMatches) {
      const cGender = (c.gender || '').trim().charAt(0).toLowerCase();
      if (targetGender && cGender && targetGender !== cGender && targetGender !== 'o' && cGender !== 'o') {
        continue;
      }
      matched.set(c.id, c);
    }
  }

  return sortConsultationsNewestFirst(Array.from(matched.values()));
}

/**
 * Finds all IPD admission/discharge records matching a given OPD consultation or patient identity,
 * sorted newest admissionDate first.
 */
export function findMatchingIpdRecordsForPatient(
  target: {
    id?: string;
    patientName?: string;
    opdNo?: string;
    uhid?: string;
    age?: string;
    gender?: string;
  },
  ipdPatients: IpdPatientRecord[]
): IpdPatientRecord[] {
  if (!ipdPatients || ipdPatients.length === 0) return [];
  const pseudoConsultation: Consultation = {
    id: target.id || '',
    opdNo: target.opdNo || target.uhid || '',
    date: '',
    patientName: target.patientName || '',
    gender: (target.gender as any) || 'M',
    age: target.age || '',
    vitals: {},
    complaints: '',
    historyChecklist: {},
    ipss: {},
    diagnosis: '',
    prescriptions: [],
    createdAt: 0,
    updatedAt: 0,
  };
  const matches = findMatchingIpdPatientsForOpdConsultation(
    pseudoConsultation,
    ipdPatients,
    false
  );
  return [...matches].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'admitted' ? -1 : 1;
    const dateCmp = (b.admissionDate || '').localeCompare(a.admissionDate || '');
    if (dateCmp !== 0) return dateCmp;
    const dischA = a.dischargeDate || a.dischargeSummary?.dischargeDate || '';
    const dischB = b.dischargeDate || b.dischargeSummary?.dischargeDate || '';
    const dischCmp = dischB.localeCompare(dischA);
    if (dischCmp !== 0) return dischCmp;
    return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
  });
}

function extractChecklistFlags(c?: Consultation | null): string[] {
  const hc = c?.historyChecklist;
  if (!hc) return [];
  const flags: string[] = [];
  const pushFlag = (label: string, val?: string | boolean) => {
    if (!val) return;
    const s = String(val).trim();
    if (!s || /^(?:no|nil|none|absent|negative|-|--|false)$/i.test(s)) return;
    flags.push(s === 'true' || /^(?:yes|\+|\(\+\))$/i.test(s) ? label : `${label}: ${s}`);
  };
  pushFlag('Burning Micturition', hc.burning);
  pushFlag('Fever', hc.fever);
  pushFlag('Hematuria', hc.hematuria);
  pushFlag('Previous Renal Calculi', hc.previousRenalCalculi);
  pushFlag('Previous Surgery', hc.previousSurgery);
  pushFlag('Constipation', hc.constipation);
  return flags;
}

function extractComorbiditiesFromConsultations(visits: Consultation[]): string {
  const pieces = new Set<string>();
  const knownPatterns: Array<[RegExp, string]> = [
    [/\b(?:dm|t2dm|type\s*2\s*dm|diabetes(?:\s+mellitus)?)\b/i, 'DM'],
    [/\b(?:htn|hypertension)\b/i, 'HTN'],
    [/\b(?:cad|ihd|coronary\s+artery\s+disease|ischemic\s+heart)\b/i, 'CAD/IHD'],
    [/\b(?:ckd|chronic\s+kidney\s+disease)\b/i, 'CKD'],
    [/\b(?:hypothyroid(?:ism)?)\b/i, 'Hypothyroidism'],
    [/\b(?:copd|bronchial\s+asthma|asthma)\b/i, 'Asthma/COPD'],
    [/\b(?:cva|stroke)\b/i, 'CVA'],
  ];

  for (const v of visits) {
    const corpus = [v.history, v.additionalHistory, v.complaints, v.chiefComplaints, v.pastMedication]
      .filter(Boolean)
      .join(' ');
    for (const [re, label] of knownPatterns) {
      if (re.test(corpus)) {
        pieces.add(label);
      }
    }
  }
  return Array.from(pieces).join(', ').slice(0, 400);
}

/**
 * Compiles structured Admission Notes from all matching OPD consultations:
 * - Latest visit examination & vitals (falling back to most recent visit with exam if latest has none)
 * - Brief chronological history across visits (especially useful when multiple visits exist)
 * - Latest IPSS score table (pulled from the latest visit that has IPSS data, if available)
 * - Pre-admission OPD medications & merged investigations
 * - Concise formatted text ready for editable `clinicalSummary`
 */
export function compileAdmissionNotesFromOpd(
  target: {
    id?: string;
    linkedOpdConsultationId?: string;
    patientName?: string;
    uhid?: string;
    ipdNo?: string;
    age?: string;
    gender?: string;
  },
  consultations: Consultation[]
): CompiledAdmissionNotes {
  const matchedOpdVisits = findMatchingOpdConsultationsForIpdPatient(target, consultations, true);
  const latestVisit = matchedOpdVisits[0] || null;

  const briefVisitHistory: CompiledOpdVisitBrief[] = matchedOpdVisits.map((v) => {
    const meds = (v.prescriptions || [])
      .map((p) => [p.medicine || p.drugName, p.dosage, p.frequency].filter(Boolean).join(' ').trim())
      .filter(Boolean)
      .slice(0, 4)
      .join(', ');
    return {
      id: v.id,
      date: v.date,
      complaints: (v.complaints || v.chiefComplaints || '').trim(),
      diagnosis: (v.diagnosis || '').trim(),
      assessmentPlan: (v.assessmentPlan || '').trim(),
      medicationsSummary: meds,
      hasIpss: hasIpssData(v),
      hasExam: consultationHasAnyExam(v),
    };
  });

  // Latest vitals (prefer latest visit; fallback to most recent visit with vitals)
  const vitalsVisit =
    (consultationHasAnyVitals(latestVisit) ? latestVisit : null) ||
    matchedOpdVisits.find((v) => consultationHasAnyVitals(v)) ||
    null;
  const latestVitals = vitalsVisit
    ? {
        ...sanitizeVitalsObject(vitalsVisit.vitals),
        randomBloodSugar: vitalsVisit.vitals?.randomBloodSugar || '',
      }
    : null;
  const latestVitalsDate = vitalsVisit?.date || '';

  // Latest examination (prefer latest visit; fallback to most recent visit with exam)
  const examVisit =
    (consultationHasAnyExam(latestVisit) ? latestVisit : null) ||
    matchedOpdVisits.find((v) => consultationHasAnyExam(v)) ||
    null;
  const latestExamination = examVisit
    ? {
        visitDate: examVisit.date,
        systemicExamination: (examVisit.systemicExamination || '').trim(),
        genitalExamination: (examVisit.genitalExamination || '').trim(),
        perRectalExam: (examVisit.perRectalExam || '').trim(),
        examinationNotes: (examVisit.examinationNotes || '').trim(),
      }
    : null;

  // Latest IPSS score table (from the latest visit that has IPSS data)
  const ipssVisit = matchedOpdVisits.find((v) => hasIpssData(v)) || null;
  const latestIpss: CompiledIpssTable | null = ipssVisit
    ? {
        visitDate: ipssVisit.date,
        frequency: normalizeIpssFieldValue(ipssVisit.ipss?.frequency),
        urgency: normalizeIpssFieldValue(ipssVisit.ipss?.urgency),
        nocturia: normalizeIpssFieldValue(ipssVisit.ipss?.nocturia),
        poorFlow: normalizeIpssFieldValue(ipssVisit.ipss?.poorFlow || ipssVisit.ipss?.poorStream),
        intermittency: normalizeIpssFieldValue(ipssVisit.ipss?.intermittency),
        straining: normalizeIpssFieldValue(ipssVisit.ipss?.straining),
        incompleteEvacuation: normalizeIpssFieldValue(ipssVisit.ipss?.incompleteEvacuation),
        hesitancy: normalizeIpssFieldValue(ipssVisit.ipss?.hesitancy),
        secondVoid: normalizeIpssFieldValue(ipssVisit.ipss?.secondVoid),
        postVoidDribble: normalizeIpssFieldValue(ipssVisit.ipss?.postVoidDribble),
        scoreTotal: normalizeIpssFieldValue(ipssVisit.ipss?.scoreTotal, true),
        qualityOfLife: normalizeIpssFieldValue(ipssVisit.ipss?.qualityOfLife, true),
      }
    : null;

  // Positive history checklist flags across latest visit (or union of visits if latest empty)
  let historyChecklistFlags = extractChecklistFlags(latestVisit);
  if (historyChecklistFlags.length === 0) {
    const flagSet = new Set<string>();
    for (const v of matchedOpdVisits) {
      extractChecklistFlags(v).forEach((f) => flagSet.add(f));
    }
    historyChecklistFlags = Array.from(flagSet);
  }

  const latestDiagnosis =
    (latestVisit?.diagnosis || '').trim() ||
    matchedOpdVisits.find((v) => v.diagnosis?.trim())?.diagnosis?.trim() ||
    '';
  const latestComplaints =
    (latestVisit?.complaints || latestVisit?.chiefComplaints || '').trim() ||
    matchedOpdVisits.find((v) => (v.complaints || v.chiefComplaints || '').trim())?.complaints?.trim() ||
    '';
  const latestHistoryText = [
    latestVisit?.history?.trim(),
    latestVisit?.additionalHistory?.trim(),
  ]
    .filter(Boolean)
    .join('\n');
  const pastMedication =
    (latestVisit?.pastMedication || '').trim() ||
    matchedOpdVisits.find((v) => v.pastMedication?.trim())?.pastMedication?.trim() ||
    '';
  const compiledComorbidities = extractComorbiditiesFromConsultations(matchedOpdVisits);

  const latestPrescriptions =
    (latestVisit?.prescriptions && latestVisit.prescriptions.length > 0
      ? latestVisit.prescriptions
      : matchedOpdVisits.find((v) => (v.prescriptions || []).length > 0)?.prescriptions) || [];

  // Merge unique investigation records across visits
  const invSeen = new Set<string>();
  const mergedInvestigations: InvestigationItem[] = [];
  for (const v of matchedOpdVisits) {
    for (const item of v.investigationRecords || []) {
      const effectiveDate = (item.reportDate || v.date || '').trim();
      const k = `${effectiveDate}|${(item.parameterName || '').trim().toLowerCase()}|${(item.valueOrImpression || '').trim().toLowerCase()}`;
      if (!invSeen.has(k)) {
        invSeen.add(k);
        mergedInvestigations.push({
          ...item,
          reportDate: effectiveDate,
          displayDate: item.displayDate || (effectiveDate ? formatDisplayDate(effectiveDate) : ''),
        });
      }
    }
  }
  const labTestsAndImaging = matchedOpdVisits
    .map((v) => (v.labTestsAndImaging || '').trim())
    .filter(Boolean)
    .slice(0, 3)
    .join('\n');

  // Build concise, clean multi-line text for clinicalSummary (kept under 2700 chars for Firestore rules)
  const summarySections: string[] = [];
  if (matchedOpdVisits.length > 0) {
    if (latestComplaints) {
      summarySections.push(`Chief Complaints (Latest OPD ${formatDisplayDate(latestVisit!.date)}):\n${latestComplaints}`);
    }
    if (latestHistoryText) {
      summarySections.push(`Clinical History:\n${latestHistoryText}`);
    }
    if (matchedOpdVisits.length > 1) {
      const priorLines = briefVisitHistory.slice(0, 5).map((b) => {
        const details = [b.diagnosis, b.complaints].filter(Boolean).join(' — ');
        return `${formatDisplayDate(b.date)}: ${details || 'OPD Follow-up'}`;
      });
      summarySections.push(`Brief OPD Visit History (${matchedOpdVisits.length} visits):\n${priorLines.join('\n')}`);
    }
    if (latestExamination) {
      const sysVal = (latestExamination.systemicExamination || '').trim();
      const genVal = (latestExamination.genitalExamination || '').trim();
      const prVal = (latestExamination.perRectalExam || '').trim();
      const notesVal = (latestExamination.examinationNotes || '').trim();

      const normCore = (s: string) =>
        s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

      const sysCore = normCore(sysVal);
      const genCore = normCore(genVal);
      const prCore = normCore(prVal);
      const notesCore = normCore(notesVal);

      // If examinationNotes is a superset of systemicExamination (common in OPD OCR), keep the richer single line
      let effectiveSystemic = sysVal;
      let includeNotes = Boolean(notesVal);
      if (sysCore && notesCore) {
        if (notesCore.includes(sysCore)) {
          effectiveSystemic = notesVal;
          includeNotes = false;
        } else if (sysCore.includes(notesCore)) {
          includeNotes = false;
        }
      }
      if (includeNotes && notesCore && ((genCore && genCore.includes(notesCore)) || (prCore && prCore.includes(notesCore)))) {
        includeNotes = false;
      }

      const examLines = [
        effectiveSystemic ? `Systemic Exam: ${effectiveSystemic}` : '',
        genVal ? `Local / Genital Exam: ${genVal}` : '',
        prVal ? `Per-Rectal (DRE): ${prVal}` : '',
        includeNotes ? `Examination Notes: ${notesVal}` : '',
      ].filter(Boolean);
      if (examLines.length > 0) {
        summarySections.push(examLines.join('\n'));
      }
    }
    if (latestIpss) {
      const ipssParts = [
        latestIpss.frequency ? `F: ${latestIpss.frequency}` : '',
        latestIpss.urgency ? `U: ${latestIpss.urgency}` : '',
        latestIpss.nocturia ? `N: ${latestIpss.nocturia}` : '',
        latestIpss.poorFlow ? `P: ${latestIpss.poorFlow}` : '',
        latestIpss.intermittency ? `I: ${latestIpss.intermittency}` : '',
        latestIpss.straining ? `S: ${latestIpss.straining}` : '',
        latestIpss.incompleteEvacuation ? `SOIE: ${latestIpss.incompleteEvacuation}` : '',
        latestIpss.scoreTotal ? `Total: ${latestIpss.scoreTotal}` : '',
        latestIpss.qualityOfLife ? `QoL: ${latestIpss.qualityOfLife}` : '',
      ].filter(Boolean);
      if (ipssParts.length > 0) {
        summarySections.push(
          `Latest IPSS (${formatDisplayDate(latestIpss.visitDate)}): ${ipssParts.join(' | ')}`
        );
      }
    }
    if (latestVisit?.assessmentPlan?.trim()) {
      summarySections.push(`OPD Plan: ${latestVisit.assessmentPlan.trim()}`);
    }
  }

  const formattedAdmissionSummaryText = summarySections.join('\n\n').slice(0, 2700);

  return {
    matchedOpdVisits,
    latestVisit,
    briefVisitHistory,
    latestVitals,
    latestVitalsDate,
    latestExamination,
    historyChecklistFlags,
    latestIpss,
    latestDiagnosis,
    latestComplaints,
    latestHistoryText,
    pastMedication,
    compiledComorbidities,
    latestPrescriptions,
    mergedInvestigations,
    labTestsAndImaging,
    formattedAdmissionSummaryText,
  };
}

/**
 * Builds a unified, deduplicated directory of all patients across the Master Register
 * (OPD Consultations + OT Records + Prior/Active IPD Admissions) for fast search & auto-populate
 * when admitting a patient to IPD.
 */
export function buildMasterRegisterPatientDirectory(
  consultations: Consultation[],
  ipdPatients: IpdPatientRecord[]
): MasterRegisterDirectoryPatient[] {
  const byKey = new Map<string, MasterRegisterDirectoryPatient>();

  const makeDirectoryKey = (name?: string, regId?: string, gender?: string) => {
    const cleanName = normalizeClinicalPatientName(name);
    const cleanReg = normalizeRegId(regId);
    if (cleanName) {
      const g = (gender || '').trim().charAt(0).toLowerCase();
      return `${cleanName}|${g === 'f' ? 'f' : g === 'm' ? 'm' : 'x'}`;
    }
    if (cleanReg) return `reg:${cleanReg}`;
    return '';
  };

  // Seed from OPD / OT consultations (newest first)
  const sortedConsults = sortConsultationsNewestFirst(consultations || []);
  for (const c of sortedConsults) {
    if (!c.patientName?.trim()) continue;
    const key = makeDirectoryKey(c.patientName, c.opdNo, c.gender);
    if (!key) continue;

    const isOpd = hasOpdClinicalData(c);
    const isOt = hasOtNotesData(c);
    const hasIpss = hasIpssData(c);
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, {
        key,
        salutation: c.salutation || '',
        patientName: c.patientName.trim(),
        age: c.age || '',
        gender: normalizeGenderForOpd(c.gender),
        uhid: c.opdNo || '',
        phoneNumber: c.phoneNumber || c.contactNumber || '',
        address: c.address || c.city || '',
        latestDate: c.date || '',
        latestDiagnosis: (c.diagnosis || c.otNotes?.postOpDiagnosis || c.otNotes?.preOpDiagnosis || '').trim(),
        comorbidities: extractComorbiditiesFromConsultations([c]),
        allergies: '',
        opdCount: isOpd ? 1 : 0,
        otCount: isOt ? 1 : 0,
        ipdCount: 0,
        hasIpss,
        isCurrentlyAdmitted: false,
        latestConsultation: isOpd ? c : null,
        latestIpdRecord: null,
      });
    } else {
      if (isOpd) existing.opdCount += 1;
      if (isOt) existing.otCount += 1;
      if (hasIpss) existing.hasIpss = true;
      if (!existing.salutation && c.salutation) existing.salutation = c.salutation;
      if (!existing.age && c.age) existing.age = c.age;
      if (!existing.uhid && c.opdNo) existing.uhid = c.opdNo;
      if (!existing.phoneNumber && (c.phoneNumber || c.contactNumber)) {
        existing.phoneNumber = c.phoneNumber || c.contactNumber || '';
      }
      if (!existing.address && (c.address || c.city)) existing.address = c.address || c.city || '';
      if (!existing.latestDiagnosis && c.diagnosis) existing.latestDiagnosis = c.diagnosis.trim();
      if (!existing.comorbidities) {
        const extracted = extractComorbiditiesFromConsultations([c]);
        if (extracted) existing.comorbidities = extracted;
      }
      if (!existing.latestConsultation && isOpd) existing.latestConsultation = c;
      if ((c.date || '') > existing.latestDate) existing.latestDate = c.date || existing.latestDate;
    }
  }

  // Merge IPD admissions (newest admissionDate first)
  const sortedIpd = [...(ipdPatients || [])].sort((a, b) =>
    (b.admissionDate || '').localeCompare(a.admissionDate || '')
  );
  for (const p of sortedIpd) {
    if (!p.patientName?.trim()) continue;
    const key = makeDirectoryKey(p.patientName, p.uhid || p.ipdNo, p.gender);
    if (!key) continue;

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        key,
        salutation: p.salutation || '',
        patientName: p.patientName.trim(),
        age: p.age || '',
        gender: normalizeGenderForOpd(p.gender),
        uhid: p.uhid || p.ipdNo || '',
        phoneNumber: p.phoneNumber || '',
        address: p.address || '',
        latestDate: p.dischargeDate || p.admissionDate || '',
        latestDiagnosis: (p.dischargeSummary?.finalDiagnosis || p.admittingDiagnosis || '').trim(),
        comorbidities: p.comorbidities || '',
        allergies: p.allergies || '',
        opdCount: 0,
        otCount: getConsultationOtProcedures(p as any).length,
        ipdCount: 1,
        hasIpss: false,
        isCurrentlyAdmitted: p.status === 'admitted',
        activeIpdId: p.status === 'admitted' ? p.id : undefined,
        latestConsultation: null,
        latestIpdRecord: p,
      });
    } else {
      existing.ipdCount += 1;
      if (!existing.latestIpdRecord) existing.latestIpdRecord = p;
      if (p.status === 'admitted') {
        existing.isCurrentlyAdmitted = true;
        existing.activeIpdId = p.id;
      }
      if (!existing.salutation && p.salutation) existing.salutation = p.salutation;
      if (!existing.age && p.age) existing.age = p.age;
      if (!existing.uhid && (p.uhid || p.ipdNo)) existing.uhid = p.uhid || p.ipdNo || '';
      if (!existing.phoneNumber && p.phoneNumber) existing.phoneNumber = p.phoneNumber;
      if (!existing.address && p.address) existing.address = p.address;
      if (!existing.comorbidities && p.comorbidities) existing.comorbidities = p.comorbidities;
      if (!existing.allergies && p.allergies) existing.allergies = p.allergies;
      if (!existing.latestDiagnosis && p.admittingDiagnosis) {
        existing.latestDiagnosis = p.admittingDiagnosis.trim();
      }
      const ipdLatestDate = p.dischargeDate || p.admissionDate || '';
      if (ipdLatestDate > existing.latestDate) existing.latestDate = ipdLatestDate;
    }
  }

  return Array.from(byKey.values()).sort((a, b) =>
    (b.latestDate || '').localeCompare(a.latestDate || '')
  );
}

