import { Consultation, OtNotes } from '../types/opd';
import { cleanExplicitOpdNo, expandClinicalShorthands } from './investigationUtils';

function stripAiReasoningFromOtField(val: string): string {
  let s = val.trim();
  if (!s) return '';
  const arrowIdx = s.search(/\s*(?:->|→)\s*(?:["']|wait|let'?s|omit|using|empty|keep|use|assuming|note:)/i);
  if (arrowIdx >= 0) {
    s = s.slice(0, arrowIdx).trim();
  }
  s = s
    .replace(/\b(?:wait,|let'?s\s+(?:keep|use|leave|omit|check|set|put)|using\s+empty\s+string|i\s+will\s+map|interpreting\s+as|based\s+on\s+instructions|mapped\s+to)[\s\S]*$/i, '')
    .replace(/\(\s*(?:[^)]*\b(?:blank\s+on\s+sheet|time\s+of\s+incision|omitted|empty\s+string|written\s+as|assuming|schema|note:)\b[^)]*)\)/gi, '')
    .trim();
  return s;
}

function cleanOtTimeField(val?: string | null): string {
  if (!val) return '';
  const raw = String(val).trim();
  if (!raw) return '';
  const hasReasoning =
    /\b(wait,|let'?s\s+|using\s+empty\s+string|omitted|blank\s+on\s+sheet|time\s+of\s+incision|if\s+blank|i\s+will\s+map|mapped\s+to|interpreting|prompt\s+asks|schema|based\s+on|doa\s*\/\s*cat)\b|->|→/i.test(
      raw
    );
  if (hasReasoning) {
    if (/\b(keep\s+.*\bblank|empty\s+string|omitted|is\s+blank|blank\s+on\s+sheet|not\s+mentioned)\b/i.test(raw)) {
      return '';
    }
    const head = raw.split(/[(\n→]|->/)[0].trim();
    const m = head.match(/\b(\d{1,2}\s*:\s*\d{2}(?:\s*(?:AM|PM|hrs?|mins?))?(?:\s*\([^)]{1,20}\))?)\b/i);
    return m ? m[1].replace(/\s+/g, ' ').trim() : '';
  }
  return cleanOtField(raw);
}

function cleanOtField(val?: string | null): string {
  if (!val) return '';
  const s = stripAiReasoningFromOtField(expandClinicalShorthands(String(val).trim()));
  if (!s) return '';
  const lower = s.toLowerCase().replace(/[.!?]+$/, '').trim();
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
      'not mentioned',
      'not recorded',
      'not specified',
      'not applicable',
      'not documented',
      'not stated',
      'not noted',
    ].includes(lower)
  ) {
    return '';
  }
  return s;
}

const PROTECTED_MEDICAL_ABBREV_RE =
  /(?:^|[\s(/])(?:dr|mr|mrs|ms|st|fr|no|rt|lt|b\/l|u\/o|p\/a|p\/r|s\/o|c\/o|k\/c\/o|o\/c\/o|s\/p|i\/v\/o|approx|esp|viz|i\.e|e\.g|etc|vs|tab|inj|cap|syp|cm|mm|ml|kg|gm|mg|hr|hrs|min|sec|deg|gr|pod|vol|ht|wt|pt|ref|reg|dt|diln|sed|cath|opd|ipd|ot|usg|kub|bph|uti|rbs|cbc|kft|lft|ecg|cxr)\.$/i;

/**
 * Splits paragraph-style operative findings or operative steps into crisp, standalone lines
 * (one finding/step per line) while preserving medical abbreviations (Dr., Rt., Fr., s/o., etc.)
 * and decimal measurements (6.9 mm, 3.5 cm, 0.035").
 */
export function splitOperativeTextIntoLines(text?: string | null): string[] {
  const cleaned = cleanOtField(text);
  if (!cleaned) return [];

  // Normalize line endings and split explicit newlines / semicolons / bullet symbols first
  const primaryChunks = cleaned
    .replace(/\r\n?/g, '\n')
    .split(/\n+|;+|(?:\s*[•●▪◦]\s*)/)
    .map((c) => c.trim())
    .filter(Boolean);

  const lines: string[] = [];

  for (const chunk of primaryChunks) {
    // Also split inline numbered items like "1. Scope passed 2. Stricture dilated"
    const numberedSplit = chunk.split(/\s+(?=\d{1,2}[.)]\s+[A-Za-z])/);

    for (const part of numberedSplit) {
      // Split sentence boundaries (". " followed by an uppercase letter or digit) except after protected abbreviations
      let buffer = '';
      let i = 0;
      while (i < part.length) {
        const ch = part[i];
        buffer += ch;
        if (ch === '.' && i + 1 < part.length && /\s/.test(part[i + 1])) {
          let nextIdx = i + 1;
          while (nextIdx < part.length && /\s/.test(part[nextIdx])) nextIdx++;
          const nextChar = part[nextIdx] || '';
          const isDecimal = i > 0 && /\d/.test(part[i - 1]) && /\d/.test(part[i + 1]);
          const isProtectedAbbrev = PROTECTED_MEDICAL_ABBREV_RE.test(buffer.trim());
          // Don't split a leading list number like "1. "
          const isLeadingNumber = /^\d{1,2}\.$/.test(buffer.trim());
          if (!isDecimal && !isProtectedAbbrev && !isLeadingNumber && /[A-Z0-9?]/.test(nextChar)) {
            const finalized = buffer
              .replace(/\.$/, '')
              .replace(/^\s*(?:[-*•●▪◦]|\d{1,2}[.)])\s+/, '')
              .trim();
            if (finalized) lines.push(finalized);
            buffer = '';
            i = nextIdx;
            continue;
          }
        }
        i++;
      }
      const remainder = buffer
        .replace(/^\s*(?:[-*•●▪◦]|\d{1,2}[.)])\s+/, '')
        .replace(/\.\s*$/, '')
        .trim();
      if (remainder) lines.push(remainder);
    }
  }

  // Deduplicate exact repeated lines while preserving chronological order
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const line of lines) {
    const key = line.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(line);
  }
  return unique;
}

export function formatOperativeNotesLineByLine(text?: string | null): string {
  return splitOperativeTextIntoLines(text).join('\n');
}

/**
 * Detects when an `OtNotes` object is actually a false-positive copy of an OPD consultation
 * (e.g. when an OPD sheet mentioned a past surgery like "TURP - 2024 at Shatayu Hospital"
 * and OPD examination/plan fields were mistakenly copied into `operativeFindings` and `operativeSteps`).
 */
export function isFalsePositiveOpdAsOtNotes(
  ot?: Partial<OtNotes> | null,
  parentConsultation?: Consultation | null
): boolean {
  if (!ot) return false;
  const proc = cleanOtField(ot.procedureName);
  const findings = cleanOtField(ot.operativeFindings);
  const steps = cleanOtField(ot.operativeSteps);
  const combined = `${proc} | ${findings} | ${steps}`;

  // Genuine operative intra-op keywords that only appear in real OT notes
  const hasRealIntraOpTerms =
    /\b(resectoscope|verumontanum|ureteric\s+orifice|holmium|laser\s+fiber|morcellat|nephroscop|amplatz|guidewire|lithotomy\s+position|spinal\s+anaesthesia|general\s+anaesthesia|iv\s+sedation|iv\s+sed\b|under\s+sa\b|under\s+ga\b|sheath\s+passed|chips\s+evacuated|trilobar|bilobar|median\s+lobe\s+resected|cystoscopy\s+done|urethral\s+dilat|metal\s+dilator|bulbar\s+urethral|fibrous\s+ring|trigonal\s+inflammation|hunner|efflux\s*\+|negotiate\s+scope|30\s*(?:°|deg|degree)\s*scope|foley(?:'s)?\s+cath(?:eter)?\s+placed|time\s+of\s+incision|operation\s+notes?)\b/i.test(
      combined
    ) ||
    Boolean(cleanOtField(ot.anaesthesiaType)) ||
    Boolean(cleanOtField(ot.patientPosition)) ||
    Boolean(cleanOtField(ot.surgeryTime)) ||
    Boolean(cleanOtField(ot.catheterOrStentDetails)) ||
    (Array.isArray(ot.handDrawnDiagrams) && ot.handDrawnDiagrams.length > 0);

  if (hasRealIntraOpTerms) return false;

  // 1. Check if `operativeFindings` contains OPD physical examination lines (P/A, bladder np, testes, anal opening/DRE)
  if (
    /\b(per\s+abdomen\s*:|bladder\s+non[\s\-]?palpable|bilateral\s+flanks\s+non[\s\-]?tender|external\s+genitalia\s+normal|tight\s+anal\s+opening|could\s+not\s+do|left\s+testis\s*:|right\s+testis\s*:|upto\s+inguinal\s+region)\b/i.test(
      findings
    )
  ) {
    return true;
  }

  // 2. Check if `operativeSteps` contains OPD clinical plan / past surgical history / comorbidity phrases
  if (
    /\b(admit\s+in\s+ward|cardiology\s+review|scrotal\s+support|status\s+post\s+|operated\s+case\s+of|no\s+known\s+comorbidities|known\s+case\s+of|next\s+visit|review\s+after|catheter\s+free\s+trial)\b/i.test(
      steps
    )
  ) {
    return true;
  }

  // 3. Check if `procedureName` is a past surgical history note with a prior year or status-post prefix (e.g. "TURP - 2024 at Shatayu Hospital")
  if (
    proc &&
    /\b(?:status\s+post|s\/p\b|operated\s+case\s+of|o\/c\/o\b|[-–—]\s*20[012]\d|\bin\s+20[012]\d)\b/i.test(
      proc
    )
  ) {
    return true;
  }

  // 4. If parentConsultation has OPD examination or plan and `operativeFindings` / `operativeSteps` simply mirrors it
  if (parentConsultation) {
    const sys = cleanOtField(parentConsultation.systemicExamination);
    const gen = cleanOtField(parentConsultation.genitalExamination);
    const plan = cleanOtField(parentConsultation.assessmentPlan);
    if (
      (sys && findings && findings.toLowerCase().includes(sys.toLowerCase())) ||
      (gen && findings && findings.toLowerCase().includes(gen.toLowerCase())) ||
      (plan && steps && steps.toLowerCase().includes(plan.toLowerCase()))
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Restores OPD fields from a false-positive `otNotes` object when an OPD record was previously split into an `-ot-` entry.
 */
export function rescueOpdFromFalseOtNotes(c: Consultation): Consultation {
  if (!c) return c;
  const ot = c.otNotes || (Array.isArray(c.otProcedures) ? c.otProcedures[0] : undefined);
  if (!ot || !isFalsePositiveOpdAsOtNotes(ot, c)) return c;

  let sysExam = cleanOtField(c.systemicExamination);
  let genExam = cleanOtField(c.genitalExamination);
  let prExam = cleanOtField(c.perRectalExam);
  let plan = cleanOtField(c.assessmentPlan);
  let pastMed = cleanOtField(c.pastMedication);
  let diag = cleanOtField(c.diagnosis);

  if ((!sysExam && !genExam && !prExam) && cleanOtField(ot.operativeFindings)) {
    const clauses = cleanOtField(ot.operativeFindings)
      .split(/\s*;\s*|\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    const sysParts: string[] = [];
    const genParts: string[] = [];
    const prParts: string[] = [];
    for (const cl of clauses) {
      if (/\b(anal|prostate|pr\b|dre\b|rectal)\b/i.test(cl)) {
        prParts.push(cl);
      } else if (/\b(testis|testes|scrot|hydrocele|epididym|inguinal|genital|meatus|penis|cath)\b/i.test(cl)) {
        genParts.push(cl);
      } else {
        sysParts.push(cl);
      }
    }
    sysExam = sysParts.join('; ');
    genExam = genParts.join('; ');
    prExam = prParts.join('; ');
  }

  if (!plan && cleanOtField(ot.operativeSteps)) {
    const stepClauses = cleanOtField(ot.operativeSteps)
      .split(/\s*;\s*|\r?\n/)
      .map((s) => s.replace(/^\d+[.)]\s*/, '').trim())
      .filter(Boolean);
    const planParts: string[] = [];
    const pastParts: string[] = pastMed ? [pastMed] : [];
    for (const sc of stepClauses) {
      if (/\b(status\s+post|operated\s+case|turp\s*[-–]?\s*20\d{2}|comorbidit|known\s+case)\b/i.test(sc)) {
        pastParts.push(sc);
      } else {
        planParts.push(sc);
      }
    }
    plan = planParts.join('; ');
    pastMed = Array.from(new Set(pastParts)).join('; ');
  }

  const proc = cleanOtField(ot.procedureName);
  if (proc && !pastMed.toLowerCase().includes(proc.toLowerCase())) {
    const formattedPast = /^(?:status\s+post|s\/p|operated)/i.test(proc) ? proc : `Status post ${proc}`;
    pastMed = [pastMed, formattedPast].filter(Boolean).join('; ');
  }

  if (!diag || /^operated\s*:/i.test(diag)) {
    diag = cleanOtField(ot.postOpDiagnosis) || cleanOtField(ot.preOpDiagnosis) || diag;
  }

  let rxList = Array.isArray(c.prescriptions) ? [...c.prescriptions] : [];
  if (rxList.length === 0 && cleanOtField(ot.postOpOrders)) {
    const rawRxLines = cleanOtField(ot.postOpOrders)
      .split(/\s*;\s*|\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    rxList = rawRxLines.map((line) => {
      const freqMatch = line.match(/\b([012]\s*-\s*[012]\s*-\s*[012](?:\s*\([^)]+\))?|SOS)\b/i);
      const durMatch = line.match(/\b(\d+\s*(?:Days?|Months?|Weeks?))\b/i);
      const medPart = line
        .replace(freqMatch ? freqMatch[0] : '', '')
        .replace(durMatch ? durMatch[0] : '', '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      return {
        medicine: medPart || line,
        dosage: '',
        when: /^inj\b/i.test(medPart) ? 'IV / Injection' : 'After food (p/c)',
        frequency: freqMatch ? freqMatch[1].trim() : '1-0-1 (BD)',
        duration: durMatch ? durMatch[1].trim() : '',
        notes: '',
      };
    });
  }

  const baseId = String(c.id || '').includes('-ot-')
    ? String(c.id).split('-ot-')[0]
    : c.id;

  return {
    ...c,
    id: baseId,
    diagnosis: diag,
    systemicExamination: sysExam,
    genitalExamination: genExam,
    perRectalExam: prExam,
    assessmentPlan: plan,
    pastMedication: pastMed,
    prescriptions: rxList,
    historyChecklist: {
      ...(c.historyChecklist || {}),
      ...(pastMed && /\b(turp|status\s+post|operated)\b/i.test(pastMed)
        ? { previousSurgery: 'Yes' }
        : {}),
    },
    otNotes: undefined,
    otProcedures: undefined,
  };
}

/**
 * Checks if a Consultation record or an OtNotes object contains meaningful OT / Operative Notes data.
 */
export function hasOtNotesData(input?: Consultation | Partial<OtNotes> | null): boolean {
  if (!input) return false;
  if ('otNotes' in input || 'patientName' in input || 'otProcedures' in input) {
    const c = input as Consultation;
    if (
      Array.isArray(c.otProcedures) &&
      c.otProcedures.some((p) => hasSingleOtNotesObjectData(p, c))
    ) {
      return true;
    }
    return hasSingleOtNotesObjectData(c.otNotes, c);
  }
  return hasSingleOtNotesObjectData(input as Partial<OtNotes>);
}

function hasSingleOtNotesObjectData(
  ot?: Partial<OtNotes> | null,
  parentConsultation?: Consultation | null
): boolean {
  if (!ot) return false;
  if (isFalsePositiveOpdAsOtNotes(ot, parentConsultation)) return false;
  return Boolean(
    cleanOtField(ot.procedureName) ||
      cleanOtField(ot.operativeFindings) ||
      cleanOtField(ot.operativeSteps) ||
      cleanOtField(ot.postOpOrders) ||
      cleanOtField(ot.catheterOrStentDetails) ||
      cleanOtField(ot.preOpDiagnosis) ||
      cleanOtField(ot.postOpDiagnosis) ||
      cleanOtField(ot.specimenSent) ||
      cleanOtField(ot.implantsOrConsumables) ||
      cleanOtField(ot.freelanceNotes) ||
      (Array.isArray(ot.handDrawnDiagrams) && ot.handDrawnDiagrams.length > 0)
  );
}

/**
 * Detects if a record without OT notes is a phantom empty "OPD" remnant that was accidentally split
 * off from a standalone OT record (e.g., an `ot-...` record whose `otNotes` was stripped into `ot-...-ot-...`),
 * OR if a split `-ot-` entry is a false-positive OPD consultation whose base OPD record already exists.
 */
export function isPhantomSplitOtRemnant(
  c?: Consultation | null,
  allList: Consultation[] = []
): boolean {
  if (!c) return false;
  const idStr = String(c.id || '').trim();

  // If this is a split `-ot-` record whose `otNotes` was a false-positive copy of an OPD consultation,
  // check if its parent OPD record (or same-patient OPD record) exists in `allList`. If so, it is a phantom split!
  if (idStr.includes('-ot-') && isFalsePositiveOpdAsOtNotes(c.otNotes, c)) {
    const baseId = idStr.split('-ot-')[0];
    const hasParentOrSiblingOpd = allList.some(
      (other) =>
        other &&
        other.id !== idStr &&
        (other.id === baseId ||
          (other.patientName &&
            c.patientName &&
            other.patientName.trim().toLowerCase() === c.patientName.trim().toLowerCase() &&
            !String(other.id || '').includes('-ot-')))
    );
    if (hasParentOrSiblingOpd) {
      return true;
    }
    return false;
  }

  if (hasOtNotesData(c)) return false;

  // Any record created in the dedicated OT form (`id` starting with `ot-`) that now has no `otNotes`
  // is a phantom remnant left behind when `otNotes` was split into `ot-...-ot-...`.
  if (/^ot-\d+/i.test(idStr)) {
    return true;
  }
  if (idStr.includes('-ot-') && !isFalsePositiveOpdAsOtNotes(c.otNotes, c)) {
    return true;
  }

  const hasComplaints = Boolean(cleanOtField(c.complaints || c.chiefComplaints));
  const hasVitals = Boolean(
    c.vitals &&
      (cleanOtField(c.vitals.bp) ||
        cleanOtField(c.vitals.pulse) ||
        cleanOtField(c.vitals.temp) ||
        cleanOtField(c.vitals.weight) ||
        cleanOtField(c.vitals.spo2))
  );
  const hasExam = Boolean(
    cleanOtField(c.systemicExamination) ||
      cleanOtField(c.genitalExamination) ||
      cleanOtField(c.perRectalExam) ||
      cleanOtField(c.examinationNotes)
  );
  const hasRx =
    Array.isArray(c.prescriptions) &&
    c.prescriptions.some((r) => Boolean(cleanOtField(r.medicine)));
  const hasAdvisedTests = Boolean(cleanOtField(c.testsRequested || c.investigationsAdvised));
  const hasPlanOrAdvice = Boolean(
    cleanOtField(c.assessmentPlan) ||
      cleanOtField(c.advice) ||
      cleanOtField(c.dietAndExercise) ||
      cleanOtField(c.nextVisit)
  );
  const hasLabs =
    Boolean(cleanOtField(c.labTestsAndImaging)) ||
    (Array.isArray(c.investigationRecords) && c.investigationRecords.length > 0);
  const hasPastMed = Boolean(cleanOtField(c.pastMedication));

  const hasAnyRealOpdContent =
    hasComplaints ||
    hasVitals ||
    hasExam ||
    hasRx ||
    hasAdvisedTests ||
    hasPlanOrAdvice ||
    hasLabs ||
    hasPastMed;

  if (!hasAnyRealOpdContent && idStr && allList.length > 0) {
    const hasSplitOtChild = allList.some(
      (other) => other && other.id && String(other.id).startsWith(`${idStr}-ot-`) && hasOtNotesData(other)
    );
    if (hasSplitOtChild) return true;
  }

  return false;
}

/**
 * Checks whether a Consultation record contains OPD visit data (complaints, vitals, exam, Rx, plan, etc.)
 * rather than being a standalone OT-only record.
 */
export function hasOpdClinicalData(c?: Consultation | null): boolean {
  if (!c) return false;
  if (isPhantomSplitOtRemnant(c)) return false;

  const idStr = String(c.id || '').trim();
  // Records created via the standalone "Add OT Notes" form (`ot-...`) or expanded OT entries (`...-ot-...`)
  // are strictly OT Notes entries, never OPD consultations.
  if (/^ot-\d+/i.test(idStr) || idStr.includes('-ot-')) {
    return false;
  }

  // If it doesn't have OT notes at all, treat it as an OPD visit record
  if (!hasOtNotesData(c)) return true;

  const hasComplaints = Boolean(cleanOtField(c.complaints || c.chiefComplaints));
  const hasVitals = Boolean(
    c.vitals &&
      (cleanOtField(c.vitals.bp) ||
        cleanOtField(c.vitals.pulse) ||
        cleanOtField(c.vitals.temp) ||
        cleanOtField(c.vitals.weight) ||
        cleanOtField(c.vitals.spo2))
  );
  const hasExam = Boolean(
    cleanOtField(c.systemicExamination) ||
      cleanOtField(c.genitalExamination) ||
      cleanOtField(c.perRectalExam) ||
      cleanOtField(c.examinationNotes)
  );
  const hasRx = Array.isArray(c.prescriptions) && c.prescriptions.some((r) => Boolean(cleanOtField(r.medicine)));
  const hasAdvisedTests = Boolean(cleanOtField(c.testsRequested || c.investigationsAdvised));
  const hasPlanOrAdvice = Boolean(
    cleanOtField(c.assessmentPlan) ||
      cleanOtField(c.advice) ||
      cleanOtField(c.dietAndExercise) ||
      cleanOtField(c.nextVisit)
  );
  const hasLabs =
    Boolean(cleanOtField(c.labTestsAndImaging)) ||
    (Array.isArray(c.investigationRecords) && c.investigationRecords.length > 0);
  const hasPastMed = Boolean(cleanOtField(c.pastMedication));

  return (
    hasComplaints ||
    hasVitals ||
    hasExam ||
    hasRx ||
    hasAdvisedTests ||
    hasPlanOrAdvice ||
    hasLabs ||
    hasPastMed
  );
}

export function createEmptyOtNotes(
  defaultDate?: string,
  surgeonName?: string,
  hospitalName?: string
): OtNotes {
  return {
    id: `ot-proc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    surgeryDate: defaultDate || new Date().toISOString().split('T')[0],
    surgeryTime: '',
    hospitalName: hospitalName || '',
    procedureName: '',
    preOpDiagnosis: '',
    postOpDiagnosis: '',
    surgeonName: surgeonName || '',
    assistantName: '',
    anaesthetistName: '',
    anaesthesiaType: '',
    patientPosition: '',
    operativeFindings: '',
    operativeSteps: '',
    intraOpComplications: '',
    estimatedBloodLoss: '',
    catheterOrStentDetails: '',
    drainDetails: '',
    specimenSent: '',
    postOpOrders: '',
    implantsOrConsumables: '',
    freelanceNotes: '',
    handDrawnDiagrams: [],
  };
}

export function normalizeOtNotes(
  raw?: Partial<OtNotes> | null,
  fallbackDate?: string
): OtNotes {
  const ot = raw || {};
  const cleanDiagrams = Array.isArray(ot.handDrawnDiagrams)
    ? Array.from(
        new Set(
          ot.handDrawnDiagrams.filter(
            (d): d is string =>
              typeof d === 'string' && d.startsWith('data:image/') && d.length <= 42000
          )
        )
      ).slice(0, 1)
    : [];

  return {
    id: ot.id || `ot-proc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    surgeryDate: cleanOtField(ot.surgeryDate) || fallbackDate || '',
    surgeryTime: cleanOtTimeField(ot.surgeryTime),
    hospitalName: cleanOtField(ot.hospitalName),
    procedureName: cleanOtField(ot.procedureName),
    preOpDiagnosis: cleanOtField(ot.preOpDiagnosis),
    postOpDiagnosis: cleanOtField(ot.postOpDiagnosis),
    surgeonName: cleanOtField(ot.surgeonName),
    assistantName: cleanOtField(ot.assistantName),
    anaesthetistName: cleanOtField(ot.anaesthetistName),
    anaesthesiaType: cleanOtField(ot.anaesthesiaType),
    patientPosition: cleanOtField(ot.patientPosition),
    operativeFindings: formatOperativeNotesLineByLine(ot.operativeFindings),
    operativeSteps: formatOperativeNotesLineByLine(ot.operativeSteps),
    intraOpComplications: cleanOtField(ot.intraOpComplications),
    estimatedBloodLoss: cleanOtField(ot.estimatedBloodLoss),
    catheterOrStentDetails: cleanOtField(ot.catheterOrStentDetails),
    drainDetails: cleanOtField(ot.drainDetails),
    specimenSent: cleanOtField(ot.specimenSent),
    postOpOrders: cleanOtField(ot.postOpOrders),
    implantsOrConsumables: cleanOtField(ot.implantsOrConsumables),
    freelanceNotes: cleanOtField(ot.freelanceNotes),
    ...(cleanDiagrams.length > 0 ? { handDrawnDiagrams: cleanDiagrams } : {}),
    ...(typeof ot.hasHandDrawnDiagram === 'boolean'
      ? { hasHandDrawnDiagram: ot.hasHandDrawnDiagram }
      : {}),
    ...(Array.isArray(ot.handDrawnDiagramBox2d) && ot.handDrawnDiagramBox2d.length === 4
      ? { handDrawnDiagramBox2d: ot.handDrawnDiagramBox2d.map((n) => Number(n) || 0) }
      : {}),
    ...(typeof ot.handDrawnDiagramPageIndex === 'number'
      ? { handDrawnDiagramPageIndex: ot.handDrawnDiagramPageIndex }
      : {}),
  };
}

function mergeTwoStrings(a?: string, b?: string, sep = '; '): string {
  const ca = cleanOtField(a);
  const cb = cleanOtField(b);
  if (!ca) return cb;
  if (!cb) return ca;
  if (ca.toLowerCase().includes(cb.toLowerCase())) return ca;
  if (cb.toLowerCase().includes(ca.toLowerCase())) return cb;
  return `${ca}${sep}${cb}`;
}

export function mergeOtNotes(existing?: OtNotes, incoming?: OtNotes): OtNotes {
  const ex = normalizeOtNotes(existing);
  const inc = normalizeOtNotes(incoming);
  const mergedDiagrams = Array.from(
    new Set([...(inc.handDrawnDiagrams || []), ...(ex.handDrawnDiagrams || [])])
  ).slice(0, 1);
  const mergedBox2d =
    Array.isArray(inc.handDrawnDiagramBox2d) && inc.handDrawnDiagramBox2d.length === 4
      ? inc.handDrawnDiagramBox2d
      : ex.handDrawnDiagramBox2d;
  const mergedPageIndex =
    typeof inc.handDrawnDiagramPageIndex === 'number'
      ? inc.handDrawnDiagramPageIndex
      : ex.handDrawnDiagramPageIndex;

  return {
    id: ex.id || inc.id,
    surgeryDate: inc.surgeryDate || ex.surgeryDate,
    surgeryTime: inc.surgeryTime || ex.surgeryTime,
    hospitalName: inc.hospitalName || ex.hospitalName,
    procedureName: mergeTwoStrings(ex.procedureName, inc.procedureName, ' + '),
    preOpDiagnosis: mergeTwoStrings(ex.preOpDiagnosis, inc.preOpDiagnosis, ' / '),
    postOpDiagnosis: mergeTwoStrings(ex.postOpDiagnosis, inc.postOpDiagnosis, ' / '),
    surgeonName: inc.surgeonName || ex.surgeonName,
    assistantName: inc.assistantName || ex.assistantName,
    anaesthetistName: inc.anaesthetistName || ex.anaesthetistName,
    anaesthesiaType: inc.anaesthesiaType || ex.anaesthesiaType,
    patientPosition: inc.patientPosition || ex.patientPosition,
    operativeFindings: mergeTwoStrings(ex.operativeFindings, inc.operativeFindings, '\n'),
    operativeSteps: mergeTwoStrings(ex.operativeSteps, inc.operativeSteps, '\n'),
    intraOpComplications: mergeTwoStrings(ex.intraOpComplications, inc.intraOpComplications),
    estimatedBloodLoss: inc.estimatedBloodLoss || ex.estimatedBloodLoss,
    catheterOrStentDetails: mergeTwoStrings(
      ex.catheterOrStentDetails,
      inc.catheterOrStentDetails
    ),
    drainDetails: mergeTwoStrings(ex.drainDetails, inc.drainDetails),
    specimenSent: mergeTwoStrings(ex.specimenSent, inc.specimenSent),
    postOpOrders: mergeTwoStrings(ex.postOpOrders, inc.postOpOrders, '\n'),
    implantsOrConsumables: mergeTwoStrings(ex.implantsOrConsumables, inc.implantsOrConsumables),
    freelanceNotes: mergeTwoStrings(ex.freelanceNotes, inc.freelanceNotes),
    ...(mergedDiagrams.length > 0 ? { handDrawnDiagrams: mergedDiagrams } : {}),
    ...(ex.hasHandDrawnDiagram || inc.hasHandDrawnDiagram ? { hasHandDrawnDiagram: true } : {}),
    ...(mergedBox2d ? { handDrawnDiagramBox2d: mergedBox2d } : {}),
    ...(typeof mergedPageIndex === 'number' ? { handDrawnDiagramPageIndex: mergedPageIndex } : {}),
  };
}

/**
 * Returns all valid OT procedures attached to a single Consultation record.
 * Preserves chronological order (oldest -> latest) and ensures `c.otNotes` is included.
 */
export function getConsultationOtProcedures(c?: Consultation | null): OtNotes[] {
  if (!c) return [];
  const rawList: OtNotes[] = [];

  if (Array.isArray(c.otProcedures) && c.otProcedures.length > 0) {
    for (const p of c.otProcedures) {
      if (hasSingleOtNotesObjectData(p, c)) {
        rawList.push(normalizeOtNotes(p, c.date));
      }
    }
  }

  if (hasSingleOtNotesObjectData(c.otNotes, c)) {
    const primaryNorm = normalizeOtNotes(c.otNotes, c.date);
    const alreadyPresent = rawList.some((p) => {
      if (p.id && c.otNotes?.id && p.id === c.otNotes.id) return true;
      const sameDate = (p.surgeryDate || c.date) === (primaryNorm.surgeryDate || c.date);
      const sameProc =
        (p.procedureName || '').trim().toLowerCase() ===
        (primaryNorm.procedureName || '').trim().toLowerCase();
      const sameSteps =
        (p.operativeSteps || '').trim().toLowerCase() ===
        (primaryNorm.operativeSteps || '').trim().toLowerCase();
      return sameDate && sameProc && (Boolean(primaryNorm.procedureName) || sameSteps);
    });
    if (!alreadyPresent) {
      rawList.push(primaryNorm);
    }
  }

  return rawList.sort((a, b) => (a.surgeryDate || '').localeCompare(b.surgeryDate || ''));
}

/**
 * When adding OT notes to an existing patient Consultation record:
 * - If the existing record has no OT notes yet, sets `otNotes` and `otProcedures: [newProc]`.
 * - If the existing record ALREADY has previous OT notes, appends the incoming OT notes as a
 *   NEW procedure in `otProcedures` (or updates the matching procedure if it shares the exact same id),
 *   and sets `otNotes` to the most recent procedure.
 */
export function appendOtProceduresToConsultation(
  existing: Consultation,
  incomingItem: { otNotes?: Partial<OtNotes>; otProcedures?: OtNotes[]; date?: string }
): { otNotes?: OtNotes; otProcedures?: OtNotes[] } {
  const existingProcs = getConsultationOtProcedures(existing);

  const incomingProcs: OtNotes[] = [];
  if (Array.isArray(incomingItem.otProcedures) && incomingItem.otProcedures.length > 0) {
    for (const p of incomingItem.otProcedures) {
      if (hasSingleOtNotesObjectData(p)) {
        incomingProcs.push(normalizeOtNotes(p, incomingItem.date || existing.date));
      }
    }
  } else if (hasSingleOtNotesObjectData(incomingItem.otNotes)) {
    incomingProcs.push(
      normalizeOtNotes(incomingItem.otNotes, incomingItem.date || existing.date)
    );
  }

  if (existingProcs.length === 0 && incomingProcs.length === 0) {
    return { otNotes: undefined, otProcedures: undefined };
  }

  const combined = [...existingProcs];

  for (const inc of incomingProcs) {
    // Check if an identical procedure (by id, or exact same date + exact same non-empty procedureName & findings) already exists
    const matchByIdIdx = inc.id ? combined.findIndex((p) => p.id === inc.id) : -1;
    if (matchByIdIdx >= 0) {
      combined[matchByIdIdx] = inc;
      continue;
    }

    const exactDuplicateIdx = combined.findIndex((p) => {
      const sameDate = (p.surgeryDate || '') === (inc.surgeryDate || '');
      const pName = (p.procedureName || '').trim().toLowerCase();
      const incName = (inc.procedureName || '').trim().toLowerCase();
      const pSteps = (p.operativeSteps || '').trim().toLowerCase();
      const incSteps = (inc.operativeSteps || '').trim().toLowerCase();
      return sameDate && pName === incName && pSteps === incSteps && Boolean(pName || pSteps);
    });

    if (exactDuplicateIdx >= 0) {
      combined[exactDuplicateIdx] = mergeOtNotes(combined[exactDuplicateIdx], inc);
    } else {
      // Previous OT notes exist -> Add as a NEW procedure to that record!
      combined.push({
        ...inc,
        id: inc.id || `ot-proc-${Date.now()}-${combined.length + 1}`,
      });
    }
  }

  combined.sort((a, b) => (a.surgeryDate || '').localeCompare(b.surgeryDate || ''));
  const latestProc = combined[combined.length - 1];

  return {
    otNotes: latestProc,
    otProcedures: combined,
  };
}

/**
 * Ensures that:
 * 1. Any Consultation record that has BOTH OPD clinical data and OT notes is separated into:
 *    - The OPD consultation entry on its OPD visit date (without embedded OT notes), and
 *    - Separate standalone OT entry/entries on each procedure's surgeryDate.
 * 2. Any standalone OT record that has multiple procedures in `otProcedures` is separated into
 *    individual standalone OT entries (one entry per procedure under its surgeryDate).
 * Deduplicates so already-separated OT entries are never duplicated.
 */
export function expandSeparateOpdAndOtEntries(list: Consultation[]): Consultation[] {
  if (!Array.isArray(list) || list.length === 0) return [];

  const result: Consultation[] = [];
  const pendingOtEntries: Consultation[] = [];

  for (const rawC of list) {
    if (!rawC) continue;
    if (isPhantomSplitOtRemnant(rawC, list)) {
      continue;
    }
    const c =
      isFalsePositiveOpdAsOtNotes(rawC.otNotes, rawC) ||
      (Array.isArray(rawC.otProcedures) &&
        rawC.otProcedures.some((p) => isFalsePositiveOpdAsOtNotes(p, rawC)))
        ? rescueOpdFromFalseOtNotes(rawC)
        : rawC;
    const procs = getConsultationOtProcedures(c);
    const hasOpd = hasOpdClinicalData(c);

    if (procs.length === 0) {
      // Pure OPD consultation record
      result.push({
        ...c,
        otNotes: undefined,
        otProcedures: undefined,
      });
      continue;
    }

    if (hasOpd) {
      // Record has BOTH OPD visit data and OT notes:
      // 1. Keep the OPD consultation as its own entry on the OPD visit date
      result.push({
        ...c,
        otNotes: undefined,
        otProcedures: undefined,
      });

      // 2. Queue each OT procedure as a separate standalone OT entry under its surgeryDate
      procs.forEach((proc, idx) => {
        const sDate = proc.surgeryDate || c.date || new Date().toISOString().split('T')[0];
        const normProc: OtNotes = {
          ...normalizeOtNotes(proc, sDate),
          surgeryDate: sDate,
        };
        const otDiag =
          normProc.postOpDiagnosis ||
          normProc.preOpDiagnosis ||
          (normProc.procedureName ? `Operated: ${normProc.procedureName}` : '') ||
          c.diagnosis ||
          'Operative Procedure';

        pendingOtEntries.push({
          id: `${c.id}-ot-${normProc.id || idx + 1}`,
          opdNo: c.opdNo,
          date: sDate,
          time: normProc.surgeryTime || c.time || '',
          salutation: c.salutation,
          patientName: c.patientName,
          phoneNumber: c.phoneNumber,
          contactNumber: c.contactNumber || c.phoneNumber,
          gender: c.gender,
          age: c.age,
          dob: c.dob,
          preferredLanguage: c.preferredLanguage,
          city: c.city,
          address: c.address,
          addressOrCity: c.addressOrCity,
          pin: c.pin,
          vitals: {},
          complaints: '',
          chiefComplaints: '',
          historyChecklist: {
            previousSurgery: 'Yes',
          },
          ipss: {},
          systemicExamination: '',
          genitalExamination: '',
          perRectalExam: '',
          examinationNotes: '',
          pastMedication: '',
          additionalHistory: '',
          history: '',
          labTestsAndImaging: '',
          investigationRecords: [],
          diagnosis: otDiag,
          testsRequested: '',
          testsRequestedByWhen: '',
          prescriptions: [],
          dietAndExercise: '',
          admissionAdvice: 'Yes',
          assessmentPlan: '',
          advice: '',
          nextVisit: '',
          referredTo: c.referredTo || {},
          otNotes: normProc,
          otProcedures: [normProc],
          doctorId: c.doctorId,
          doctorName: c.doctorName,
          department: c.department,
          createdAt: (c.createdAt || Date.now()) + idx + 1,
          updatedAt: c.updatedAt || Date.now(),
        });
      });
    } else {
      // Standalone OT-only record: if it has 1 or more procedures, emit each procedure as its own separate OT entry
      procs.forEach((proc, idx) => {
        const sDate = proc.surgeryDate || c.date || new Date().toISOString().split('T')[0];
        const normProc: OtNotes = {
          ...normalizeOtNotes(proc, sDate),
          surgeryDate: sDate,
        };
        const otDiag =
          normProc.postOpDiagnosis ||
          normProc.preOpDiagnosis ||
          (normProc.procedureName ? `Operated: ${normProc.procedureName}` : '') ||
          c.diagnosis ||
          'Operative Procedure';

        pendingOtEntries.push({
          ...c,
          id: idx === 0 ? c.id : `${c.id}-ot-${normProc.id || idx + 1}`,
          date: sDate,
          time: normProc.surgeryTime || c.time || '',
          vitals: {},
          complaints: '',
          chiefComplaints: '',
          prescriptions: [],
          diagnosis: otDiag,
          otNotes: normProc,
          otProcedures: [normProc],
          createdAt: (c.createdAt || Date.now()) + idx,
        });
      });
    }
  }

  // Deduplicate standalone OT entries by (patientKey + surgeryDate + procedureName + operativeSteps)
  const seenOtSignatures = new Set<string>();
  for (const otEntry of pendingOtEntries) {
    const pKey = getPatientIdentityGroupingKey(otEntry);
    const proc = otEntry.otNotes;
    const sDate = proc?.surgeryDate || otEntry.date || '';
    const pName = (proc?.procedureName || '').trim().toLowerCase();
    const pSteps = (proc?.operativeSteps || '').trim().toLowerCase().slice(0, 80);
    const pFindings = (proc?.operativeFindings || '').trim().toLowerCase().slice(0, 80);
    const sig = `${pKey}|${sDate}|${pName}|${pSteps}|${pFindings}`;
    if (seenOtSignatures.has(sig)) continue;
    seenOtSignatures.add(sig);
    result.push(otEntry);
  }

  return result.sort((a, b) => {
    const dateCmp = (b.date || '').localeCompare(a.date || '');
    if (dateCmp !== 0) return dateCmp;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
}

export function normalizePatientIdentityName(name?: string): string {
  if (!name) return '';
  let clean = name.trim().toLowerCase();
  while (/^(mr|mrs|ms|miss|dr|master|shri|smt|baby)\.?\s+/i.test(clean)) {
    clean = clean.replace(/^(mr|mrs|ms|miss|dr|master|shri|smt|baby)\.?\s+/i, '').trim();
  }
  return clean.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function isGenericPatientName(name?: string): boolean {
  const norm = normalizePatientIdentityName(name);
  if (!norm) return true;
  if (['patient', 'opd patient', 'ot patient', 'unknown', 'unnamed', 'untitled'].includes(norm)) {
    return true;
  }
  return /^(?:opd|ot)\s+patient\s*#?\d*$/i.test(norm);
}

/**
 * Finds the index of a matching patient consultation in `existingList`.
 * - For standard OPD records, matches on same date + same patient name.
 * - When `item` contains OT Notes (`hasOtNotesData(item)`), also matches across dates
 *   to the most recent existing OPD/OT record of the same patient (by normalized name,
 *   explicit UHID/OPD number, or 10-digit phone number) so OT notes detected in a batch
 *   are automatically added to the respective patient's data.
 */
export function findMatchingPatientIndexForBatchItem(
  item: Consultation,
  existingList: Consultation[],
  skipIds?: Set<string>
): number {
  const itemName = normalizePatientIdentityName(item.patientName);
  const itemGeneric = isGenericPatientName(item.patientName);
  const itemOpd = cleanExplicitOpdNo(item.opdNo).toLowerCase();
  const itemPhone = (item.phoneNumber || item.contactNumber || '').replace(/\D/g, '');
  const itemHasOt = hasOtNotesData(item);

  // 1. First pass: exact same date + same non-generic patient name (or same explicit UHID)
  for (let i = 0; i < existingList.length; i++) {
    const ex = existingList[i];
    if (skipIds && skipIds.has(ex.id)) continue;
    const exName = normalizePatientIdentityName(ex.patientName);
    const exGeneric = isGenericPatientName(ex.patientName);
    const exOpd = cleanExplicitOpdNo(ex.opdNo).toLowerCase();

    if (ex.date === item.date) {
      if (!itemGeneric && !exGeneric && itemName === exName) {
        return i;
      }
      if (itemOpd.length >= 3 && exOpd.length >= 3 && itemOpd === exOpd) {
        return i;
      }
    }
  }

  // 2. Second pass (specifically when OT Notes are present): match to pre-existing patient record across dates
  if (itemHasOt) {
    let bestIdx = -1;
    let bestDate = '';

    for (let i = 0; i < existingList.length; i++) {
      const ex = existingList[i];
      if (skipIds && skipIds.has(ex.id)) continue;

      const exName = normalizePatientIdentityName(ex.patientName);
      const exGeneric = isGenericPatientName(ex.patientName);
      const exOpd = cleanExplicitOpdNo(ex.opdNo).toLowerCase();
      const exPhone = (ex.phoneNumber || ex.contactNumber || '').replace(/\D/g, '');

      // Never merge two patients with different real names
      if (!itemGeneric && !exGeneric && itemName !== exName) continue;

      const nameMatch = !itemGeneric && !exGeneric && itemName === exName;
      const opdMatch = itemOpd.length >= 3 && exOpd.length >= 3 && itemOpd === exOpd;
      const phoneMatch =
        itemPhone.length >= 10 &&
        exPhone.length >= 10 &&
        itemPhone.slice(-10) === exPhone.slice(-10);

      if (nameMatch || opdMatch || phoneMatch) {
        if (bestIdx === -1 || (ex.date || '') >= bestDate) {
          bestIdx = i;
          bestDate = ex.date || '';
        }
      }
    }
    return bestIdx;
  }

  return -1;
}

/**
 * Checks if `existingList` already contains a record for the SAME patient on the EXACT SAME date
 * and of the SAME record type (both OPD visits, or both OT notes for the same procedure).
 * Used when the same handwritten OPD note is uploaded twice (or front + back pages are uploaded separately)
 * so we update/merge into the existing row instead of creating a duplicate entry on that date.
 */
export function findSameDateSameTypeMatchIndex(
  item: Consultation,
  existingList: Consultation[]
): number {
  const itemName = normalizePatientIdentityName(item.patientName);
  const itemGeneric = isGenericPatientName(item.patientName);
  const itemOpd = cleanExplicitOpdNo(item.opdNo).toLowerCase();
  const itemIsOt = hasOtNotesData(item);
  const itemProcName = (item.otNotes?.procedureName || '').trim().toLowerCase();

  for (let i = 0; i < existingList.length; i++) {
    const ex = existingList[i];
    if (!ex || ex.date !== item.date) continue;

    const exIsOt = hasOtNotesData(ex);
    // Keep OPD consultation and OT Notes as separate entries even on the same date
    if (itemIsOt !== exIsOt) continue;

    const exName = normalizePatientIdentityName(ex.patientName);
    const exGeneric = isGenericPatientName(ex.patientName);
    const exOpd = cleanExplicitOpdNo(ex.opdNo).toLowerCase();

    // Never merge two different named patients
    if (!itemGeneric && !exGeneric && itemName !== exName) continue;

    const sameName = !itemGeneric && !exGeneric && itemName === exName;
    const sameOpd = itemOpd.length >= 3 && exOpd.length >= 3 && itemOpd === exOpd;

    if (!sameName && !sameOpd) continue;

    if (itemIsOt) {
      const exProcName = (ex.otNotes?.procedureName || '').trim().toLowerCase();
      if (itemProcName && exProcName && itemProcName !== exProcName) {
        continue;
      }
    }

    return i;
  }

  return -1;
}

/**
 * Merges a newly uploaded/re-uploaded Consultation into an existing same-patient, same-date, same-type
 * record in place, preserving the existing record's `id` so no duplicate row is created.
 */
export function mergeSameDateSameTypeConsultation(
  existing: Consultation,
  incoming: Consultation
): Consultation {
  const mergedVitals = {
    bp: cleanOtField(incoming.vitals?.bp) || cleanOtField(existing.vitals?.bp) || '',
    pulse: cleanOtField(incoming.vitals?.pulse) || cleanOtField(existing.vitals?.pulse) || '',
    temp: cleanOtField(incoming.vitals?.temp) || cleanOtField(existing.vitals?.temp) || '',
    weight: cleanOtField(incoming.vitals?.weight) || cleanOtField(existing.vitals?.weight) || '',
    spo2: cleanOtField(incoming.vitals?.spo2) || cleanOtField(existing.vitals?.spo2) || '',
  };

  // Deduplicate prescriptions by normalized medicine name
  const combinedRx = [...(existing.prescriptions || [])];
  for (const incRx of incoming.prescriptions || []) {
    const medNorm = (incRx.medicine || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    if (!medNorm) continue;
    const existingRxIdx = combinedRx.findIndex(
      (r) =>
        (r.medicine || '')
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '') === medNorm
    );
    if (existingRxIdx >= 0) {
      combinedRx[existingRxIdx] = {
        ...combinedRx[existingRxIdx],
        medicine: incRx.medicine || combinedRx[existingRxIdx].medicine,
        dosage: incRx.dosage || combinedRx[existingRxIdx].dosage,
        frequency: incRx.frequency || combinedRx[existingRxIdx].frequency,
        when: incRx.when || combinedRx[existingRxIdx].when,
        duration: incRx.duration || combinedRx[existingRxIdx].duration,
      };
    } else {
      combinedRx.push(incRx);
    }
  }

  // Merge history checklist (preserving positive/negative ticks from both)
  const mergedChecklist: Consultation['historyChecklist'] = {
    burning: incoming.historyChecklist?.burning || existing.historyChecklist?.burning || '',
    fever: incoming.historyChecklist?.fever || existing.historyChecklist?.fever || '',
    hematuria: incoming.historyChecklist?.hematuria || existing.historyChecklist?.hematuria || '',
    previousRenalCalculi:
      incoming.historyChecklist?.previousRenalCalculi ||
      existing.historyChecklist?.previousRenalCalculi ||
      '',
    previousSurgery:
      incoming.historyChecklist?.previousSurgery ||
      existing.historyChecklist?.previousSurgery ||
      '',
    constipation:
      incoming.historyChecklist?.constipation || existing.historyChecklist?.constipation || '',
  };

  const mergedIpss = {
    ...(existing.ipss || {}),
    ...(incoming.ipss || {}),
    frequency: incoming.ipss?.frequency || existing.ipss?.frequency,
    urgency: incoming.ipss?.urgency || existing.ipss?.urgency,
    nocturia: incoming.ipss?.nocturia || existing.ipss?.nocturia,
    poorFlow: incoming.ipss?.poorFlow || existing.ipss?.poorFlow,
    poorStream: incoming.ipss?.poorStream || existing.ipss?.poorStream,
    intermittency: incoming.ipss?.intermittency || existing.ipss?.intermittency,
    straining: incoming.ipss?.straining || existing.ipss?.straining,
    incompleteEvacuation:
      incoming.ipss?.incompleteEvacuation || existing.ipss?.incompleteEvacuation,
    scoreTotal: incoming.ipss?.scoreTotal ?? existing.ipss?.scoreTotal,
    qualityOfLife: incoming.ipss?.qualityOfLife || existing.ipss?.qualityOfLife,
    hesitancy: incoming.ipss?.hesitancy || existing.ipss?.hesitancy,
    secondVoid: incoming.ipss?.secondVoid || existing.ipss?.secondVoid,
    postVoidDribble: incoming.ipss?.postVoidDribble || existing.ipss?.postVoidDribble,
  };

  const mergedComplaints = mergeTwoStrings(
    existing.complaints || existing.chiefComplaints,
    incoming.complaints || incoming.chiefComplaints,
    '; '
  );

  const mergedOt =
    hasOtNotesData(existing) || hasOtNotesData(incoming)
      ? mergeOtNotes(existing.otNotes, incoming.otNotes)
      : undefined;

  return {
    ...existing,
    ...incoming,
    id: existing.id,
    createdAt: existing.createdAt || incoming.createdAt,
    updatedAt: Date.now(),
    salutation: incoming.salutation || existing.salutation,
    patientName: !isGenericPatientName(incoming.patientName)
      ? incoming.patientName
      : existing.patientName,
    age: incoming.age || existing.age,
    gender: incoming.gender || existing.gender,
    opdNo: cleanExplicitOpdNo(incoming.opdNo) || cleanExplicitOpdNo(existing.opdNo),
    phoneNumber: incoming.phoneNumber || existing.phoneNumber,
    contactNumber: incoming.contactNumber || existing.contactNumber || existing.phoneNumber,
    city: incoming.city || existing.city,
    address: incoming.address || existing.address,
    vitals: mergedVitals,
    complaints: mergedComplaints,
    chiefComplaints: mergedComplaints,
    historyChecklist: mergedChecklist,
    ipss: mergedIpss,
    pastMedication: mergeTwoStrings(existing.pastMedication, incoming.pastMedication, '; '),
    systemicExamination: mergeTwoStrings(
      existing.systemicExamination,
      incoming.systemicExamination,
      '; '
    ),
    genitalExamination: mergeTwoStrings(
      existing.genitalExamination,
      incoming.genitalExamination,
      '; '
    ),
    perRectalExam: mergeTwoStrings(existing.perRectalExam, incoming.perRectalExam, '; '),
    diagnosis: mergeTwoStrings(existing.diagnosis, incoming.diagnosis, ' / '),
    testsRequested: mergeTwoStrings(existing.testsRequested, incoming.testsRequested, ', '),
    assessmentPlan: mergeTwoStrings(existing.assessmentPlan, incoming.assessmentPlan, '; '),
    advice: mergeTwoStrings(existing.advice, incoming.advice, '; '),
    nextVisit: incoming.nextVisit || existing.nextVisit,
    prescriptions: combinedRx,
    otNotes: mergedOt,
    otProcedures: mergedOt ? [mergedOt] : undefined,
  };
}

export function getPatientIdentityGroupingKey(c: Consultation): string {
  const normName = normalizePatientIdentityName(c.patientName);
  if (!isGenericPatientName(c.patientName) && normName) {
    return `name:${normName}`;
  }
  const opd = cleanExplicitOpdNo(c.opdNo).toLowerCase();
  if (opd.length >= 3) {
    return `opd:${opd}`;
  }
  const phone = (c.phoneNumber || c.contactNumber || '').replace(/\D/g, '');
  if (phone.length >= 8) {
    return `phone:${phone.slice(-10)}`;
  }
  return `id:${c.id || c.date}`;
}

export function getPatientMatchingConsultations(
  target: Consultation,
  allConsultations: Consultation[] = [],
  sortOrder: 'chronological' | 'latest-first' = 'latest-first'
): Consultation[] {
  const targetNameKey = normalizePatientIdentityName(target.patientName);
  const isTargetGeneric = isGenericPatientName(target.patientName);
  const targetOpd = cleanExplicitOpdNo(target.opdNo).toLowerCase();
  const isMeaningfulOpd = targetOpd.length >= 3;
  const targetPhone = (target.phoneNumber || target.contactNumber || '').replace(/\D/g, '');
  const isMeaningfulPhone = targetPhone.length >= 8;

  const matchedMap = new Map<string, Consultation>();
  matchedMap.set(target.id || 'target-current', target);

  for (const item of allConsultations) {
    if (!item) continue;
    if (item.id && item.id === target.id) {
      matchedMap.set(item.id, target);
      continue;
    }

    const itemNameKey = normalizePatientIdentityName(item.patientName);
    const isItemGeneric = isGenericPatientName(item.patientName);
    const itemOpd = cleanExplicitOpdNo(item.opdNo).toLowerCase();
    const itemPhone = (item.phoneNumber || item.contactNumber || '').replace(/\D/g, '');

    if (!isTargetGeneric && !isItemGeneric && targetNameKey !== itemNameKey) {
      continue;
    }

    const nameMatches = Boolean(!isTargetGeneric && !isItemGeneric && targetNameKey === itemNameKey);
    const opdMatches = Boolean(isMeaningfulOpd && itemOpd && targetOpd === itemOpd);
    const phoneMatches = Boolean(
      isMeaningfulPhone &&
        itemPhone.length >= 8 &&
        itemPhone.slice(-10) === targetPhone.slice(-10)
    );

    if (nameMatches || opdMatches || phoneMatches) {
      matchedMap.set(item.id || `${item.date}-${matchedMap.size}`, item);
    }
  }

  const list = Array.from(matchedMap.values());
  list.sort((a, b) => {
    const cmp = (a.date || '').localeCompare(b.date || '');
    if (cmp !== 0) return sortOrder === 'chronological' ? cmp : -cmp;
    return sortOrder === 'chronological'
      ? (a.createdAt || 0) - (b.createdAt || 0)
      : (b.createdAt || 0) - (a.createdAt || 0);
  });

  return list;
}

export interface PatientTimelineEntry {
  id: string;
  kind: 'opd' | 'ot';
  date: string; // YYYY-MM-DD (visit date for 'opd', surgeryDate for 'ot')
  consultation: Consultation;
  otNotes?: OtNotes; // Populated when kind === 'ot'
  procedureIndex?: number; // 0-based index within consultation.otProcedures
  chronologicalIndex: number; // 1-based chronological sequence number
}

/**
 * Builds the chronological list of all Visit OPD Notes and OT Notes for a patient
 * across all their consultation records (and multi-procedure OT records).
 */
export function getPatientConsolidatedTimelineEntries(
  target: Consultation,
  allConsultations: Consultation[] = [],
  sortOrder: 'chronological' | 'latest-first' = 'chronological'
): PatientTimelineEntry[] {
  const matchedConsultations = getPatientMatchingConsultations(
    target,
    allConsultations,
    'chronological'
  );

  const rawEntries: Omit<PatientTimelineEntry, 'chronologicalIndex'>[] = [];
  const seenOtKeys = new Set<string>();

  for (const c of matchedConsultations) {
    if (isPhantomSplitOtRemnant(c, allConsultations)) continue;
    const otProcs = getConsultationOtProcedures(c);
    const hasOpd = hasOpdClinicalData(c);

    // Include OPD Visit entry if this record has OPD consultation data (or if it has no OT procedures at all)
    if (hasOpd || otProcs.length === 0) {
      rawEntries.push({
        id: `opd-${c.id || c.date}`,
        kind: 'opd',
        date: c.date || '',
        consultation: c,
      });
    }

    // Include each OT Procedure entry attached to this record
    otProcs.forEach((proc, pIdx) => {
      const sDate = proc.surgeryDate || c.date || '';
      const dedupKey = `${sDate}|${(proc.procedureName || '').trim().toLowerCase()}|${(
        proc.operativeSteps || ''
      )
        .trim()
        .toLowerCase()
        .slice(0, 80)}`;
      if (seenOtKeys.has(dedupKey)) return;
      seenOtKeys.add(dedupKey);

      rawEntries.push({
        id: `ot-${c.id || c.date}-${proc.id || pIdx}`,
        kind: 'ot',
        date: sDate,
        consultation: {
          ...c,
          otNotes: proc,
        },
        otNotes: proc,
        procedureIndex: pIdx,
      });
    });
  }

  // Sort oldest -> latest first to assign chronologicalIndex
  rawEntries.sort((a, b) => {
    const cmp = (a.date || '').localeCompare(b.date || '');
    if (cmp !== 0) return cmp;
    if (a.kind !== b.kind) {
      // On the exact same date, show OPD Visit before OT Procedure
      return a.kind === 'opd' ? -1 : 1;
    }
    return (a.consultation.createdAt || 0) - (b.consultation.createdAt || 0);
  });

  const withChronologicalNum: PatientTimelineEntry[] = rawEntries.map((entry, idx) => ({
    ...entry,
    chronologicalIndex: idx + 1,
  }));

  if (sortOrder === 'latest-first') {
    return [...withChronologicalNum].reverse();
  }
  return withChronologicalNum;
}

/**
 * Returns all OT procedures recorded for a patient across all their records and multi-procedure arrays.
 */
export function getAllPatientOtProcedures(
  target: Consultation,
  allConsultations: Consultation[] = [],
  sortOrder: 'chronological' | 'latest-first' = 'latest-first'
): PatientTimelineEntry[] {
  const allEntries = getPatientConsolidatedTimelineEntries(target, allConsultations, 'chronological');
  const otOnly = allEntries
    .filter((e) => e.kind === 'ot')
    .map((e, idx) => ({
      ...e,
      chronologicalIndex: idx + 1,
    }));

  if (sortOrder === 'latest-first') {
    return [...otOnly].reverse();
  }
  return otOnly;
}

export interface UrologyOtTemplate {
  id: string;
  label: string;
  shortTag: string;
  procedureName: string;
  preOpDiagnosis: string;
  postOpDiagnosis: string;
  anaesthesiaType: string;
  patientPosition: string;
  operativeFindings: string;
  operativeSteps: string;
  intraOpComplications: string;
  estimatedBloodLoss: string;
  catheterOrStentDetails: string;
  drainDetails: string;
  specimenSent: string;
  postOpOrders: string;
  fields?: Partial<OtNotes>;
}

export const UROLOGY_OT_TEMPLATES: UrologyOtTemplate[] = [
  {
    id: 'bipolar-turp',
    label: 'Bipolar TURP (Prostate)',
    shortTag: 'TURP',
    procedureName: 'Cystoscopy + Bipolar TURP (Transurethral Resection of Prostate)',
    preOpDiagnosis: 'Benign Prostatic Enlargement (BPE) with LUTS / Acute Urinary Retention',
    postOpDiagnosis: 'BPE — Status Post Bipolar TURP',
    anaesthesiaType: 'Spinal Anaesthesia (SA)',
    patientPosition: 'Lithotomy position',
    operativeFindings:
      'Anterior urethra normal. Enlarged trilobar / bilobar occlusive prostate. Bilateral ureteric orifices normal, clear efflux seen. Urinary bladder mildly trabeculated, no calculus or growth.',
    operativeSteps:
      'Under spinal anaesthesia in lithotomy position, parts painted and draped. 26Fr continuous-flow Bipolar resectoscope introduced under vision. Median lobe resected first from 5 to 7 o’clock down to surgical capsule. Left and right lateral lobes systematically resected up to verumontanum. Apical tissue trimmed carefully preserving external sphincter. Prostatic chips evacuated using Ellik evacuator. Complete hemostasis achieved. Free flow of clear irrigation fluid confirmed.',
    intraOpComplications: 'Nil / Uneventful',
    estimatedBloodLoss: 'Minimal',
    catheterOrStentDetails:
      '20Fr / 22Fr 3-way Foley catheter placed, balloon inflated with 30ml sterile water; continuous normal saline bladder irrigation started with mild traction.',
    drainDetails: 'Nil',
    specimenSent: 'Prostatic chips sent in formalin for Histopathological Examination (HPE)',
    postOpOrders:
      'NBM for 4 hours, then sips to soft diet; IV Fluids RL/DNS @ 80 ml/hr; Inj Cefoperazone + Sulbactam 1.5g IV BD; Inj Pantoprazole 40mg IV OD; Inj Paracetamol 1g IV SOS; Continuous normal saline bladder irrigation — monitor urine color & output.',
  },
  {
    id: 'ursl-dj-stent',
    label: 'URSL + DJ Stenting',
    shortTag: 'URSL + DJ',
    procedureName: 'Cystoscopy + Ureteroscopic Lithotripsy (URSL) + DJ Stenting',
    preOpDiagnosis: 'Ureteric Calculus with Hydroureteronephrosis',
    postOpDiagnosis: 'Ureteric Calculus — Complete Clearance with DJ Stent in situ',
    anaesthesiaType: 'Spinal Anaesthesia (SA)',
    patientPosition: 'Lithotomy position',
    operativeFindings:
      'Urethra and bladder normal. Ureteric orifice identified and cannulated with 0.035" hydrophilic guidewire under C-arm guidance. Impacted calculus visualized in ureter with proximal hydroureter.',
    operativeSteps:
      'Under spinal anaesthesia in lithotomy position, parts painted and draped. Cystoscopy done and safety Terumo guidewire passed past the ureteric calculus into the renal pelvis under fluoroscopic control. 6/7.5Fr semi-rigid ureteroscope introduced alongside guidewire. Calculus fragmented completely into fine dust/extractable fragments using pneumatic / Holmium laser lithotripsy. Residual fragments extracted with forceps. Check ureteroscopy showed clear ureter up to PUJ. 5Fr / 26cm Double-J (DJ) stent deployed over guidewire; position of both coils confirmed on C-arm.',
    intraOpComplications: 'Nil / Uneventful',
    estimatedBloodLoss: 'Minimal (< 10 ml)',
    catheterOrStentDetails:
      '5Fr 26cm DJ Stent in situ (coils verified in renal pelvis & bladder); 16Fr Foley catheter placed.',
    drainDetails: 'Nil',
    specimenSent: 'Stone fragments sent for FTIR Stone Analysis',
    postOpOrders:
      'NBM for 4 hours; IV Fluids; Inj Cefoperazone + Sulbactam 1.5g IV BD; Inj Drotaverine / Paracetamol IV SOS; Catheter removal tomorrow morning; Review for DJ stent removal after 2-3 weeks.',
  },
  {
    id: 'rirs-laser',
    label: 'RIRS + Holmium/Thulium Laser',
    shortTag: 'RIRS Laser',
    procedureName: 'Retrograde Intrarenal Surgery (RIRS) + Laser Lithotripsy + DJ Stenting',
    preOpDiagnosis: 'Renal / Upper Ureteric Calculus',
    postOpDiagnosis: 'Renal Calculus — Complete Laser Dusting with DJ Stent in situ',
    anaesthesiaType: 'General Anaesthesia (GA) / Spinal Anaesthesia',
    patientPosition: 'Lithotomy position',
    operativeFindings:
      'Pre-stented / compliant ureter. Renal calculus visualized in calyx / renal pelvis.',
    operativeSteps:
      'Under anaesthesia in lithotomy position, cystoscopy performed and existing DJ stent removed / guidewire placed into pelvicalyceal system under C-arm guidance. Ureteral access sheath (9.5/11.5Fr) positioned just below PUJ under fluoroscopy. Flexible ureteroscope advanced into pelvicalyceal system; all calyces inspected. Calculus dusted completely using Holmium/Thulium laser fiber (dusting & pop-corning settings). Calyces irrigated and inspected for clearance. 5Fr 26cm DJ stent placed under fluoroscopic control.',
    intraOpComplications: 'Nil / Uneventful',
    estimatedBloodLoss: 'Minimal',
    catheterOrStentDetails: '5Fr 26cm DJ Stent in situ; 16Fr Foley catheter in situ',
    drainDetails: 'Nil',
    specimenSent: 'Stone fragments / dust for analysis',
    postOpOrders:
      'NBM for 4 hours; IV Antibiotics & Hydration; Foley catheter removal on POD-1; Plenty of oral fluids after discharge; Plan DJ stent removal in 2-3 weeks.',
  },
  {
    id: 'pcnl-dj',
    label: 'PCNL + DJ Stenting',
    shortTag: 'PCNL',
    procedureName: 'Cystoscopy + Retrograde Pyelography (RGP) + PCNL + DJ Stenting',
    preOpDiagnosis: 'Renal Calculus / Staghorn Calculus',
    postOpDiagnosis: 'Renal Calculus — Status Post PCNL with Complete Clearance',
    anaesthesiaType: 'General Anaesthesia (GA) / Spinal Anaesthesia',
    patientPosition: 'Lithotomy followed by Prone position',
    operativeFindings:
      'Radio-opaque renal calculus occupying renal pelvis / calyx. Clear pelvicalyceal anatomy delineated on retrograde pyelogram.',
    operativeSteps:
      'In lithotomy position, cystoscopy done and 5Fr open-ended ureteric catheter placed into renal pelvis. Patient turned to prone position with bolsters. Retrograde contrast injected under C-arm; targeted calyx punctured using 18G initial puncture needle via bull’s-eye technique. Hydrophilic guidewire parked down the ureter. Tract serially dilated using metallic Alken / Amplatz dilators and Amplatz sheath positioned. Nephroscopy performed; calculus fragmented using pneumatic / laser lithotripter and fragments retrieved with graspers. Fluoroscopic and nephroscopic clearance confirmed. Antegrade 5Fr 26cm DJ stent placed.',
    intraOpComplications: 'Nil / Uneventful',
    estimatedBloodLoss: 'Minimal',
    catheterOrStentDetails: '5Fr 26cm DJ Stent in situ; 16Fr Foley catheter in situ',
    drainDetails: 'Nephrostomy tube in situ / Tubeless PCNL with skin suture',
    specimenSent: 'Stone fragments sent for Stone Analysis',
    postOpOrders:
      'NBM for 6 hours; Strict input/output & urine color chart; IV Antibiotics & Analgesics; Check Hb & X-ray KUB tomorrow morning.',
  },
  {
    id: 'oiu-dviu',
    label: 'OIU / DVIU (Stricture Urethra)',
    shortTag: 'OIU / DVIU',
    procedureName: 'Cystourethroscopy + Optical Internal Urethrotomy (OIU / DVIU)',
    preOpDiagnosis: 'Stricture Urethra (Bulbar / Penobulbar)',
    postOpDiagnosis: 'Stricture Urethra — Status Post OIU',
    anaesthesiaType: 'Spinal Anaesthesia (SA)',
    patientPosition: 'Lithotomy position',
    operativeFindings:
      'Narrow annular / short-segment stricture noted in bulbar urethra. Proximal urethra and bladder normal after urethrotomy.',
    operativeSteps:
      'Under spinal anaesthesia in lithotomy position, 21Fr urethrotome sheath with 0-degree lens introduced up to stricture site. 0.035" guidewire negotiated across the stricture into the urinary bladder. Cold knife (Sachse knife) urethrotomy performed at 12 o’clock position incising fibrous scar tissue until 21Fr sheath passed smoothly into the bladder. Bladder inspected and found normal. 16Fr silicone Foley catheter placed over guidewire.',
    intraOpComplications: 'Nil / Uneventful',
    estimatedBloodLoss: 'Minimal',
    catheterOrStentDetails: '16Fr 100% Silicone Foley catheter in situ (keep for 7–10 days)',
    drainDetails: 'Nil',
    specimenSent: 'Nil',
    postOpOrders:
      'Oral diet after 4 hours; IV/Oral Antibiotics for 5 days; Foley catheter removal after 7-10 days followed by Self-Calibration / CIC teaching.',
  },
  {
    id: 'cystolithotripsy',
    label: 'Cystolithotripsy (Bladder Stone)',
    shortTag: 'CLT',
    procedureName: 'Cystoscopy + Endoscopic Cystolithotripsy / Cystolitholapaxy',
    preOpDiagnosis: 'Vesical Calculus (Urinary Bladder Calculus)',
    postOpDiagnosis: 'Vesical Calculus — Complete Endoscopic Clearance',
    anaesthesiaType: 'Spinal Anaesthesia (SA)',
    patientPosition: 'Lithotomy position',
    operativeFindings:
      'Single / multiple radio-opaque calculi noted in urinary bladder. Bladder mucosa mildly congested, bilateral ureteric orifices normal.',
    operativeSteps:
      'Under spinal anaesthesia in lithotomy position, cystoscopy performed. Vesical calculus visualized and fragmented completely using pneumatic / laser lithoclast through nephroscope / cystoscope sheath. All stone fragments evacuated completely using Ellik evacuator. Check cystoscopy confirmed complete stone clearance and intact bladder mucosa without perforation.',
    intraOpComplications: 'Nil / Uneventful',
    estimatedBloodLoss: 'Minimal',
    catheterOrStentDetails: '18Fr 2-way Foley catheter placed',
    drainDetails: 'Nil',
    specimenSent: 'Stone fragments sent for Stone Analysis',
    postOpOrders:
      'Oral fluids after 4 hours; IV Antibiotics; Catheter removal on POD-1.',
  },
  {
    id: 'dj-stent-removal',
    label: 'DJ Stent Removal / Cystoscopy',
    shortTag: 'DJ Removal',
    procedureName: 'Cystoscopy + DJ Stent Removal',
    preOpDiagnosis: 'DJ Stent in situ (Post URSL / PCNL / RIRS)',
    postOpDiagnosis: 'Status Post Complete DJ Stent Removal',
    anaesthesiaType: 'Local Anaesthesia (2% Lignocaine Jelly) / Short Sedation',
    patientPosition: 'Lithotomy position',
    operativeFindings:
      'Anterior & posterior urethra normal. Bladder mucosa normal. Lower coil of DJ stent visualized in bladder without significant encrustation.',
    operativeSteps:
      'Under aseptic precautions and per-urethral 2% lignocaine jelly instillation in lithotomy position, cystoscope introduced into bladder. Lower end of DJ stent grasped with stent removal forceps and gently extracted intact in toto. Bladder emptied.',
    intraOpComplications: 'Nil / Intact stent removed completely',
    estimatedBloodLoss: 'Nil',
    catheterOrStentDetails: 'No catheter required',
    drainDetails: 'Nil',
    specimenSent: 'Nil',
    postOpOrders:
      'Plenty of oral fluids (2.5–3 L/day); Oral antibiotic for 3 days; Analgesic SOS.',
  },
  {
    id: 'turbt',
    label: 'TURBT (Bladder Mass)',
    shortTag: 'TURBT',
    procedureName: 'Cystoscopy + Transurethral Resection of Bladder Tumor (TURBT)',
    preOpDiagnosis: 'Urinary Bladder Mass / Growth (SOL Bladder)',
    postOpDiagnosis: 'Bladder Tumor — Complete Endoscopic Resection (TURBT)',
    anaesthesiaType: 'Spinal Anaesthesia + Obturator Block / General Anaesthesia',
    patientPosition: 'Lithotomy position',
    operativeFindings:
      'Papillary lesion noted on bladder wall. Bilateral ureteric orifices identified and spared. Rest of bladder mucosa inspected.',
    operativeSteps:
      'Under anaesthesia in lithotomy position, bimanual examination performed. 26Fr continuous-flow Bipolar resectoscope introduced. Exophytic bladder tumor resected systematically down to lamina propria. Separate deep muscle biopsy taken from tumor base and sent in a separate labelled container. Edges fulgurated and complete hemostasis achieved. No bladder wall perforation noted.',
    intraOpComplications: 'Nil / No obturator jerk or perforation',
    estimatedBloodLoss: 'Minimal',
    catheterOrStentDetails:
      '20Fr 3-way Foley catheter placed with continuous normal saline irrigation.',
    drainDetails: 'Nil',
    specimenSent:
      'Container 1: Superficial bladder tumor chips for HPE; Container 2: Deep muscle biopsy from tumor base for HPE',
    postOpOrders:
      'NBM for 4 hours; Continuous saline irrigation; IV Antibiotics; Review with HPE report for further intravesical / definitive plan.',
  },
  {
    id: 'circumcision',
    label: 'Circumcision',
    shortTag: 'Circumcision',
    procedureName: 'Circumcision + Frenuloplasty',
    preOpDiagnosis: 'Phimosis / Recurrent Balanoposthitis',
    postOpDiagnosis: 'Phimosis — Status Post Circumcision',
    anaesthesiaType: 'Penile Ring Block + Dorsal Nerve Block / Spinal Anaesthesia',
    patientPosition: 'Supine position',
    operativeFindings:
      'Tight non-retractile prepuce with cicatricial ring. Glans and external urethral meatus normal.',
    operativeSteps:
      'Under anaesthesia in supine position, parts painted and draped. Preputial adhesions gently separated from glans and smegma cleared. Dorsal slit / sleeve resection of inner and outer preputial skin performed leaving a 5mm mucosal collar. Meticulous bipolar hemostasis of superficial dorsal vessels and frenular artery achieved. Mucocutaneous approximation done using interrupted 4-0 Vicryl Rapide absorbable sutures in 4 quadrants and intervening stitches. Paraffin gauze dressing applied.',
    intraOpComplications: 'Nil',
    estimatedBloodLoss: 'Minimal (< 10 ml)',
    catheterOrStentDetails: 'Nil',
    drainDetails: 'Nil',
    specimenSent: 'Preputial skin if indicated',
    postOpOrders:
      'Oral antibiotics & analgesics for 5 days; Keep dressing dry for 48 hours; Local antibiotic ointment application after dressing removal.',
  },
  {
    id: 'hydrocelectomy',
    label: 'Hydrocelectomy (Jaboulay / Lord)',
    shortTag: 'Hydrocele',
    procedureName: 'Scrotal Exploration + Jaboulay’s Eversion / Lord’s Plication of Sac',
    preOpDiagnosis: 'Primary Vaginal Hydrocele',
    postOpDiagnosis: 'Hydrocele — Status Post Hydrocelectomy',
    anaesthesiaType: 'Spinal Anaesthesia (SA)',
    patientPosition: 'Supine position',
    operativeFindings:
      'Tense straw-colored hydrocele fluid in tunica vaginalis sac. Testis, epididymis, and spermatic cord normal.',
    operativeSteps:
      'Under spinal anaesthesia in supine position, scrotum painted and draped. Paramedian raphe / transverse scrotal incision made through dartos down to tunica vaginalis. Hydrocele sac delivered, opened, and clear amber fluid evacuated. Testis and epididymis inspected and found normal. Excess sac excised and edges everted behind the epididymis (Jaboulay’s procedure) / plicated (Lord’s procedure) using 3-0 Vicryl. Meticulous hemostasis secured. Testis reposited in scrotal pouch in normal anatomical orientation. Dartos and skin closed in layers with 3-0 Vicryl. Scrotal support dressing applied.',
    intraOpComplications: 'Nil',
    estimatedBloodLoss: 'Minimal',
    catheterOrStentDetails: 'Nil',
    drainDetails: 'Corrugated drain if needed / Nil',
    specimenSent: 'Nil',
    postOpOrders:
      'Scrotal elevation & support; IV/Oral Antibiotics & Anti-inflammatory analgesics for 5 days; Dressing check on POD-2.',
  },
];
