import { Consultation, InvestigationItem } from '../types/opd';

export const MAX_PRINT_INVESTIGATION_DATES = 5;
export const MAX_PATIENT_INVESTIGATION_DATES = MAX_PRINT_INVESTIGATION_DATES;

export interface DateWiseInvestigationRow {
  key: string;
  parameterName: string;
  category: 'lab' | 'imaging';
  panelOrStudy?: string;
  valuesByDate: Record<string, { value: string; flag?: string; referenceRange?: string }>;
  dateCount: number;
}

export interface ImagingTimelineEntry {
  key: string;
  isoDate: string;
  displayDate: string;
  studyName: string;
  bullets: string[];
  rawText: string;
  flag?: string;
}

export interface DateWiseInvestigationTableData {
  dates: Array<{ isoDate: string; displayDate: string }>;
  labDates: Array<{ isoDate: string; displayDate: string }>;
  rows: DateWiseInvestigationRow[];
  labRows: DateWiseInvestigationRow[];
  imagingRows: DateWiseInvestigationRow[];
  imagingTimeline: ImagingTimelineEntry[];
  multiDateRows: DateWiseInvestigationRow[];
  hasSimilarTestsAcrossDates: boolean;
  allItems: InvestigationItem[];
}

/**
 * Normalizes a patient name for matching records across visits
 */
export function normalizePatientKeyForInv(name?: string): string {
  if (!name) return '';
  return name
    .trim()
    .toLowerCase()
    .replace(/^(mr|mrs|ms|miss|dr|master|shri|smt|baby)\.?\s+/i, '')
    .replace(/\s*\(2nd visit[^)]*\)/gi, '')
    .replace(/\s*\(patient #\d+\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes any date string (YYYY-MM-DD, DD/MM/YY, DD/MM/YYYY, DD/MM) into { isoDate, displayDate }
 */
export function normalizeInvestigationDate(
  rawDate?: string,
  fallbackIsoDate?: string
): { isoDate: string; displayDate: string } {
  const defaultYear =
    fallbackIsoDate && /^\d{4}/.test(fallbackIsoDate)
      ? parseInt(fallbackIsoDate.slice(0, 4), 10)
      : new Date().getFullYear();

  const s = (rawDate || '').trim().replace(/^\[|\]$/g, '');
  if (!s) {
    const fb =
      fallbackIsoDate && /^\d{4}-\d{2}-\d{2}$/.test(fallbackIsoDate)
        ? fallbackIsoDate
        : new Date().toISOString().split('T')[0];
    const [y, m, d] = fb.split('-');
    return { isoDate: fb, displayDate: `${d}/${m}/${y.slice(-2)}` };
  }

  // YYYY-MM-DD
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return {
      isoDate: s,
      displayDate: `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1].slice(-2)}`,
    };
  }

  // DD/MM/YYYY or DD/MM/YY or DD-MM-YYYY
  const dmyMatch = s.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?$/);
  if (dmyMatch) {
    const d = parseInt(dmyMatch[1], 10);
    const m = parseInt(dmyMatch[2], 10);
    let y = dmyMatch[3] ? parseInt(dmyMatch[3], 10) : defaultYear;
    if (y < 100) y += 2000;
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const disp = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${String(y).slice(-2)}`;
      return { isoDate: iso, displayDate: disp };
    }
  }

  return { isoDate: s, displayDate: s };
}

/**
 * Detects whether a phrase or parameter name is a surgical procedure, operative history,
 * or clinical intervention (e.g. DVIU, Meatoplasty, TURP, Cystoscopy, Catheter removal)
 * rather than a Laboratory Test or Diagnostic Imaging study.
 */
export function isSurgicalOrClinicalProcedure(rawText?: string): boolean {
  const s = (rawText || '').trim().toLowerCase();
  if (!s) return false;

  // If it clearly names a genuine imaging modality or lab test, do not classify the whole string as purely surgical
  if (
    /\b(hb\b|haemoglobin|hemoglobin|tlc\b|wbc\b|creatinine|s\.?\s*creat|urine\s*(?:r\/m|routine|c\/s|culture)|psa\b|hba1c|fbs\b|rbs\b|ppbs\b|usg\b|ultrasound|sonography|ct\s*kub|ncct|cect|urography|mri\b|x-?ray|uroflow|uroflowmetry|qmax|2d\s*echo)\b/i.test(
      s
    )
  ) {
    return false;
  }

  return /\b(dviu|direct\s+visual\s+internal\s+urethrotomy|oiu|optical\s+internal\s+urethrotomy|urethrotomy|meatoplasty|meatotomy|urethroplasty|bni\b|bladder\s+neck\s+incision|turp|turbt|ursl|rirs|pcnl|eswl|lithotripsy|cystolithotripsy|cystolitholapaxy|dj\s*stent|stenting|stent\s+removal|catheter\s+removal|catheterization|catheterisation|foley|puc\b|spc\b|suprapubic|circumcision|dorsal\s+slit|frenuloplasty|hydrocelectomy|varicocelectomy|orchidopexy|orchiectomy|orchidectomy|nephrectomy|pyeloplasty|cystoscopy|urethral\s+dilatation|dilatation|calibration|s\/p\b|post[\s\-]?op|operated\s+for|previous\s+surgery|surgical\s+history)\b/i.test(
    s
  );
}

/**
 * Validates that a candidate parameter name belongs strictly to Laboratory Tests or Diagnostic Imaging studies.
 * Prevents surgical history (like DVIU, Meatoplasty) or general clinical notes from entering Previous Investigations.
 */
export function isStrictLabOrImagingParameter(
  rawName: string,
  rawVal?: string,
  category?: 'lab' | 'imaging'
): boolean {
  const nameClean = (rawName || '').trim().toLowerCase();
  const valClean = (rawVal || '').trim().toLowerCase();
  if (!nameClean) return false;

  // Reject any surgical history or clinical procedure (e.g., DVIU, Meatoplasty, Cystoscopy, TURP, Catheter removal)
  if (isSurgicalOrClinicalProcedure(nameClean)) {
    return false;
  }
  if (category !== 'imaging' && isSurgicalOrClinicalProcedure(`${nameClean} ${valClean}`)) {
    return false;
  }

  // Check recognized imaging / diagnostic study names
  if (
    /\b(usg|ultrasound|sonography|kub|ct\b|ncct|cect|urography|mri|mp-?mri|x-?ray|xray|rgu|mcu|ivp|ivu|uroflow|uroflowmetry|qmax|voided\s*vol|echo|2d\s*echo|ecg|ekg|dtpa|dmsa|pet\b|bone\s*scan|doppler|scrotal|inguino|pvr|post\s*void|prostate|hydroureteronephrosis|hydronephrosis|hun\b|hdn\b)\b/i.test(
      nameClean
    ) ||
    /^\(?p\)?$/i.test(nameClean)
  ) {
    return true;
  }

  // Check recognized laboratory test names
  if (
    /\b(hb\b|haemoglobin|hemoglobin|tlc\b|wbc\b|leucocyte|leukocyte|cbc\b|creat|creatinine|cr\b|s\.?\s*cr\b|sr\.?\s*cr\b|kft\b|rft\b|renal\s*function|urine|urinalysis|pus\s*cells?|culture|c\/s|r\/m|u\/r|ur\s*r\/m|u\s*r\/m|psa\b|hba1c|hb\s*a1c|glycated|fbs\b|rbs\b|ppbs\b|blood\s*sugar|glucose|lft\b|bilirubin|sgot|sgpt|ast\b|alt\b|alp\b|alkaline\s*phosphatase|protein|albumin|globulin|lipid|cholesterol|triglyceride|hdl\b|ldl\b|tsh\b|t3\b|t4\b|thyroid|pt\b|inr\b|aptt|hiv\b|hbsag|hcv\b|vdrl|semen|stone\s*analysis|hpe\b|histopathology|calcium|phosphorus|vitamin|vit\s*d|vit\s*b12|electrolyte|crp\b|procalcitonin|amylase|lipase|ldh\b|afp\b|beta\s*hcg)\b/i.test(
      nameClean
    )
  ) {
    return true;
  }

  return false;
}

/**
 * Strips any surgical history (such as DVIU, Meatoplasty, TURP, URSL, Cystoscopy, S/P procedures)
 * that may have been written or transcribed into `labTestsAndImaging`, and returns both the cleaned
 * `labTestsAndImaging` string and any surgical history notes so they can be preserved in `pastMedication`.
 * IMPORTANT: Never passes `labTestsAndImaging` through `deduplicateClinicalText` because `deduplicateClinicalText`
 * strips numbers and splits on `;`, which corrupts multi-date lab groups!
 */
export function sanitizeLabTestsAndImagingText(
  labText?: string,
  existingPastMedication?: string
): {
  cleanLabTestsAndImaging: string;
  updatedPastMedication: string;
  labTestsAndImaging: string;
  pastMedication: string;
} {
  const rawLab = (labText || '').trim();
  const rawPast = deduplicateClinicalText(existingPastMedication || '', '; ');
  if (!rawLab) {
    return {
      cleanLabTestsAndImaging: '',
      updatedPastMedication: rawPast,
      labTestsAndImaging: '',
      pastMedication: rawPast,
    };
  }

  const keptLabSegments: string[] = [];
  const extractedSurgicalNotes: string[] = [];

  // Split date blocks by pipe `|`, newline, or `&` followed by a date
  const segments = rawLab
    .split(/\s*\|\s*|\r?\n|\s+(?:&|and)\s+(?=\[?\d{1,2}[\/\-.]\d{1,2}\b)/i)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const seg of segments) {
    const datePrefixMatch = seg.match(
      /^(\[?(?:0?[1-9]|[12]\d|3[01])[\/\-.](?:0?[1-9]|1[0-2])(?:[\/\-.]\d{2,4})?\]?)\s*(?:[:\-–]\s*|\s+(?=[A-Za-z(]))(.*)$/
    );
    const dateHeader = datePrefixMatch ? datePrefixMatch[1].trim() : '';
    const withoutDate = datePrefixMatch ? datePrefixMatch[2].trim() : seg;

    if (isSurgicalOrClinicalProcedure(withoutDate)) {
      extractedSurgicalNotes.push(withoutDate);
      continue;
    }

    // Check semicolon or comma-separated sub-parts inside a date segment without detaching the date header
    const delimiter = withoutDate.includes(';') ? ';' : ',';
    const subParts = withoutDate
      .split(delimiter === ';' ? /\s*;\s*/ : /\s*,\s*/)
      .map((p) => p.trim())
      .filter(Boolean);

    if (subParts.length > 1) {
      const cleanSubParts: string[] = [];
      for (const sp of subParts) {
        const spNoDate = sp
          .replace(/^\[?\d{1,4}[\/\-.]\d{1,2}(?:[\/\-.]\d{2,4})?\]?\s*[:\-–]?\s*/, '')
          .trim();
        if (isSurgicalOrClinicalProcedure(spNoDate)) {
          extractedSurgicalNotes.push(spNoDate);
        } else {
          cleanSubParts.push(sp);
        }
      }
      if (cleanSubParts.length > 0) {
        const joinedSub = cleanSubParts.join(delimiter === ';' ? ' ; ' : ', ');
        keptLabSegments.push(dateHeader ? `${dateHeader}: ${joinedSub}` : joinedSub);
      }
    } else {
      keptLabSegments.push(seg);
    }
  }

  const updatedPast = deduplicateClinicalText(
    [rawPast, ...extractedSurgicalNotes].filter(Boolean).join('; '),
    '; '
  );

  // Deduplicate exact identical segments only (preserving all numbers and dates)
  const uniqueLabSegments: string[] = [];
  for (const seg of keptLabSegments) {
    const norm = seg.toLowerCase().replace(/\s+/g, ' ').trim();
    if (norm && !uniqueLabSegments.some((u) => u.toLowerCase().replace(/\s+/g, ' ').trim() === norm)) {
      uniqueLabSegments.push(seg);
    }
  }

  const finalLabs = uniqueLabSegments.join(' | ');
  return {
    cleanLabTestsAndImaging: finalLabs,
    updatedPastMedication: updatedPast,
    labTestsAndImaging: finalLabs,
    pastMedication: updatedPast,
  };
}

/**
 * Normalizes a clinical clause (from Chief Complaints, Plan, or Advice) to its core clinical meaning
 * so duplicate mentions like "Came for catheter removal" and "Catheter removal" (or "Plan: To review after 1 month"
 * and "Review after 1 month") are recognized as duplicates.
 */
export function expandClinicalShorthands(raw?: string): string {
  if (!raw) return '';
  return String(raw)
    .trim()
    .replace(/\(\s*(?:f\s*\/\s*u|r\s*\/\s*[wv])\s*\)/gi, '')
    .replace(/\bf\s*\/\s*u\b/gi, 'Follow-up')
    .replace(/\b(to)\s+r\s*\/\s*[wv]\b/gi, '$1 review')
    .replace(/\br\s*\/\s*[wv]\b/gi, 'Review')
    .replace(/(?:^|(?<=[\s;(,\-•]))\/\s*c\s*\/\s*o\b/gi, 'Operated case of')
    .replace(/\bo\s*\/\s*c\s*\/\s*o\b/gi, 'Operated case of')
    .replace(/\bk\s*\/\s*c\s*\/\s*o\b/gi, 'Known case of')
    .replace(/\bs\s*\/\s*p\b/gi, 'Status post')
    .replace(/\bi\s*\/\s*v\s*\/\s*o\b/gi, 'in view of')
    .replace(/\br\s*\/\s*o\b/gi, 'rule out')
    .replace(/\b1\s*\/\s*v\s*[-–]?\s*(?:o|s)\s*\/\s*o\b/gi, 'in view of')
    .replace(/\s*∴\s*/g, ' due to ')
    .replace(
      /([a-zA-Z0-9)])\s+(?:c̄|c)\s+(physician|neurology|gynaecologist|gynecologist|cardiologist|surgeon|medicine|reports?|full\s+bladder|pvr|ui\b|ml\b|boo\b|uti\b|stone|calculus)/gi,
      '$1 with $2'
    )
    .replace(/\b(?:b\/l\s+u\/l)\b/gi, 'Bilateral upper limb')
    .replace(
      /\b(?:Operated\s+case\s+of|Status\s+post)\s*[\(\/\-]?\s*(?:Operated\s+case\s+of|Status\s+post)\)?/gi,
      'Operated case of'
    )
    .replace(/\b(Month|Day|Week|Year)s?(?:onths|ays|eeks|ears)\b/gi, '$1s')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Cleans Chief Complaints text by:
 * 1. Expanding standard clinical shorthands (F/u -> Follow-up, o/c/o -> Operated case of, k/c/o -> Known case of, etc.).
 * 2. Removing standalone "c/o" ("complaint of") and OCR-misread "y/o" (where handwritten cursive "c/o"
 *    at the start of a complaint line was misread as "y/o", i.e. not preceded by an age number like "48 y/o")
 *    so Chief Complaints bullets state the symptoms directly without redundant "c/o" or misread "y/o" prefixes.
 */
export function cleanChiefComplaintsText(raw?: string): string {
  if (!raw || !String(raw).trim()) return '';
  let s = expandClinicalShorthands(String(raw));
  let prev = '';
  while (s !== prev) {
    prev = s;
    s = s.replace(
      /(?<![a-zA-Z0-9\/])(?:c\s*\/\s*o|(?<!\d\s*)y\s*\/\s*o|complaining\s+of|complaints?\s+of)\b\s*[:.\-–]?\s*/gi,
      ''
    );
  }
  s = s
    .replace(/\s{2,}/g, ' ')
    .replace(/;\s*;/g, ';')
    .replace(/^[;\s,\-|•:]+|[;\s,\-|•:]+$/g, '')
    .trim();

  return deduplicateClinicalText(s, '; ');
}

/**
 * Separates comorbidities (Known case of DM, HTN, Myasthenia gravis, IHD, CKD, Hypothyroidism, Asthma, etc.)
 * and past surgical history (Operated case of..., Status post..., h/o appendectomy/TURP/etc.) out of Chief Complaints
 * into `pastMedication`, while stripping leading age/sex tokens like "65/M".
 */
export function separateComorbiditiesAndSurgeries(
  rawComplaints?: string,
  rawPastMedication?: string
): { cleanComplaints: string; updatedPastMedication: string; detectedSurgicalHistory: boolean } {
  let detectedSurgicalHistory = false;
  const movedPastClauses: string[] = [];
  const keptComplaintClauses: string[] = [];

  const cleanExistingPast = deduplicateClinicalText(rawPastMedication || '', '; ');
  const expandedComp = cleanChiefComplaintsText(rawComplaints || '');
  if (!expandedComp) {
    return {
      cleanComplaints: '',
      updatedPastMedication: cleanExistingPast,
      detectedSurgicalHistory: /\b(?:operated|status\s+post|s\/p\b|o\/c\/o\b|appendect|appendicect|cholecystect|hysterect|turp|ursl|pcnl|rirs|dviu|oiu|urethroplasty|meatoplasty|nephrectomy|hydrocelectomy|cabg|ptca|lscs|surgery)\b/i.test(
        cleanExistingPast
      ),
    };
  }

  const rawClauses = expandedComp
    .split(/\s*(?:;|\||\r?\n)\s*|(?<=[a-zA-Z0-9)])\.\s+(?=(?:\d{1,3}\s*\/\s*[MF]\b|known\s+case|k\/c\/o|operated\s+case|o\/c\/o|status\s+post|s\/p|history\s+of|h\/o|dm\b|t2dm|htn\b|hypertension|diabetes|myasthenia|ihd\b|cad\b|ckd\b|hypothyroid|fever|luts|no\s+h\/o|on\s+cath))/i)
    .map((s) => s.trim())
    .filter(Boolean);

  const acuteSymptomRe =
    /\b(?:fever|pain|burning|dysuria|hematuria|haematuria|luts|urgency|frequency|nocturia|poor\s+flow|intermittency|straining|retention|swelling|lump|ulcer|discharge|frothy|pus|platelet|referred|catheter(?:\s+(?:in\s*situ|for|removal|x|\d))|on\s+cath|fall|trauma|vomiting|nausea|chills|rigors)\b/i;
  const comorbidityLeadRe =
    /^(?:\d{1,3}\s*(?:yrs?|y)?\s*\/\s*[MF]\s*[,:\-–]?\s*)?(?:known\s+case\s+of|k\s*\/\s*c\s*\/\s*o|k\/c\/o)\b/i;
  const pastSurgLeadRe =
    /^(?:\d{1,3}\s*(?:yrs?|y)?\s*\/\s*[MF]\s*[,:\-–]?\s*)?(?:operated\s+case\s+of|o\s*\/\s*c\s*\/\s*o|status\s+post|s\s*\/\s*p|post[\s\-]?op(?:erative)?\s+(?:case\s+of)?|(?:past\s+)?history\s+of|h\s*\/\s*o)\s+(?:appendect|appendicect|cholecystect|hysterect|lscs|c[\s-]?section|cabg|ptca|angioplasty|turp|ursl|pcnl|rirs|dviu|oiu|urethroplasty|meatoplasty|nephrectomy|pyeloplasty|hydrocelectomy|varicocelectomy|hernia|circumcision|orchiectomy|surgery|sx\b|myasthenia|dm\b|t2dm|diabetes|htn\b|hypertension|ihd\b|cad\b|ckd\b|asthma|copd|hypothyroid|hyperthyroid|tuberculosis|tb\b|stroke|cva\b|epilepsy)/i;
  const pureComorbidityWordsRe =
    /^(?:type\s*[12]\s*)?(?:dm\s*2?|t2dm|diabetes(?:\s+mellitus)?|htn|hypertension|myasthenia\s+gravis|ihd|cad|ischemic\s+heart\s+disease|ckd|chronic\s+kidney\s+disease|hypothyroid(?:ism)?|hyperthyroid(?:ism)?|asthma|bronchial\s+asthma|copd|cva|stroke|epilepsy|seizure\s+disorder|parkinson(?:'s)?|rheumatoid\s+arthritis|osa|bph|bpe)(?:\s*[,&+/and\-–]\s*(?:type\s*[12]\s*)?(?:dm\s*2?|t2dm|diabetes(?:\s+mellitus)?|htn|hypertension|myasthenia\s+gravis|ihd|cad|ckd|hypothyroid(?:ism)?|hyperthyroid(?:ism)?|asthma|copd|cva|stroke|epilepsy|dyslipidemia|dlp))*\.?$/i;
  const surgicalKeywordRe =
    /\b(?:operated\s+case\s+of|status\s+post|s\/p\b|o\/c\/o\b|appendect|appendicect|cholecystect|hysterect|lscs|cabg|ptca|turp|ursl|pcnl|rirs|dviu|oiu|urethroplasty|meatoplasty|nephrectomy|pyeloplasty|hydrocelectomy|varicocelectomy|circumcision|surgery)\b/i;

  for (let clause of rawClauses) {
    clause = clause.replace(/^\d{1,3}\s*(?:yrs?|y)?\s*\/\s*[MF]\b\s*[,;:\-–]?\s*/i, '').trim();
    if (!clause) continue;

    if (comorbidityLeadRe.test(clause) || pastSurgLeadRe.test(clause) || pureComorbidityWordsRe.test(clause)) {
      movedPastClauses.push(clause);
      if (surgicalKeywordRe.test(clause)) detectedSurgicalHistory = true;
      continue;
    }

    const mixedMatch = clause.match(
      /^((?:known\s+case\s+of|k\/c\/o)\s+[^;\-–]+?)(?:\s*[-–:]\s*|\s+(?=fever\b|pain\b|luts\b|burning\b|hematuria\b|platelet\b|on\s+cath\b))(.+)$/i
    );
    if (mixedMatch && acuteSymptomRe.test(mixedMatch[2])) {
      movedPastClauses.push(mixedMatch[1].trim());
      if (surgicalKeywordRe.test(mixedMatch[1])) detectedSurgicalHistory = true;
      keptComplaintClauses.push(mixedMatch[2].trim());
      continue;
    }

    if (
      !acuteSymptomRe.test(clause) &&
      /\b(?:known\s+case\s+of|dm\s*2?|t2dm|htn|hypertension|diabetes|myasthenia\s+gravis|ihd|cad|hypothyroid|appendectom|appendicectom|cholecystectom|hysterectom)\b/i.test(
        clause
      )
    ) {
      movedPastClauses.push(clause);
      if (surgicalKeywordRe.test(clause)) detectedSurgicalHistory = true;
      continue;
    }

    keptComplaintClauses.push(clause);
  }

  return {
    cleanComplaints: cleanChiefComplaintsText(keptComplaintClauses.join('; ')),
    updatedPastMedication: deduplicateClinicalText([cleanExistingPast, ...movedPastClauses].filter(Boolean).join('; '), '; '),
    detectedSurgicalHistory,
  };
}

export function normalizeClinicalClauseCore(clause?: string): string {
  if (!clause) return '';
  let s = expandClinicalShorthands(clause)
    .toLowerCase()
    .replace(/^[\-•*°\d.)\s]+/, '')
    .trim();

  // Iteratively strip common clinical lead-in prefixes (including o/c/o = operated case of, s/p = status post, k/c/o, h/o, c/o)
  let prev = '';
  while (s !== prev) {
    prev = s;
    s = s
      .replace(
        /^(?:follow[\s\-]?up(?:\s+case)?|f\/u|review|came\s+for|here\s+for|present\s+for|presented\s+for|admitted\s+for|o\/c\/o|\/c\/o|operated\s+case\s+of|operated\s+for|s\/p|status\s+post|post[\s\-]?op(?:erative)?(?:\s+case\s+of)?|prev(?:ious)?\s+surgery|past\s+surgery|surgical\s+history|k\/c\/o|known\s+case\s+of|c\/o|complaining\s+of|complaints?\s+of|h\/o|history\s+of|case\s+of|i\/v\/o|in\s+view\s+of|plan\s+for|plan|assessment\s*(?:&|\/|and)?\s*plan|adv|advice|advised\s+to|advised|treatment|rx|next\s+visit\s*(?:\/|\-|:)?\s*follow[\s\-]?up|next\s+visit|to\s+review|to)\s*[:\-–—]?\s*/i,
        ''
      )
      .replace(/^(?:for|of|with|on|at|in)\s+/i, '')
      .trim();
  }

  return s
    .replace(
      /\b(?:operated\s+case\s+of|operated\s+for|status\s+post|post[\s\-]?op(?:erative)?|known\s+case\s+of|history\s+of|complaining\s+of|case\s+of|prev(?:ious)?\s+surgery|past\s+surgery)\b/gi,
      ' '
    )
    .replace(/\b(\d{1,2}[\/\-.]\d{1,2}[\/\-.])20(\d{2})\b/g, '$1$2')
    .replace(/\b(done|today|now|advised|planned|on|dated|dt|at|in|for|of|with|the)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function areClinicalCoresDuplicate(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (shorter.length >= 4 && longer.includes(shorter)) return true;
  if (shorter.length >= 3) {
    const escaped = shorter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(?:^|\\s)${escaped}(?:$|\\s)`).test(longer)) {
      return true;
    }
  }
  const tokensA = a.split(/\s+/).filter(Boolean);
  const tokensB = b.split(/\s+/).filter(Boolean);
  if (tokensA.length > 0 && tokensB.length > 0) {
    const setA = new Set(tokensA);
    const setB = new Set(tokensB);
    if (tokensA.every((t) => setB.has(t)) || tokensB.every((t) => setA.has(t))) {
      return true;
    }
    // Also check if all non-numeric words (e.g. "spc insertion") are identical and at least 3 chars
    const wordsA = tokensA.filter((t) => !/^\d+$/.test(t) && t.length >= 2);
    const wordsB = tokensB.filter((t) => !/^\d+$/.test(t) && t.length >= 2);
    if (
      wordsA.length > 0 &&
      wordsA.join(' ').length >= 3 &&
      wordsA.join(' ') === wordsB.join(' ')
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Splits narrative clinical text (Chief Complaints, Past Medication, Assessment Plan, Advice, etc.) into individual clauses
 * and removes any duplicate or redundant clauses (e.g., when "o/c/o SPC insertion" and "S/P SPC insertion" or "catheter removal" are mentioned twice).
 */
export function deduplicateClinicalText(rawText?: string, joinSeparator = '; '): string {
  if (!rawText || !String(rawText).trim()) return '';
  const cleaned = expandClinicalShorthands(rawText);

  // Split on semicolons, pipes, newlines, bullets, sentence-ending periods, or inline repeated "Operated case of" / "Status post"
  const rawClauses = cleaned
    .split(
      /\s*(?:;|\||\r?\n|•|\u2022)\s*|(?<!\b(?:Dr|Mr|Mrs|Ms|Miss|Master|St|Tab|Cap|Inj|Syp|T|S|Sr|c|v|\d))\.\s+|(?<=\S{3,})\s*(?:[-–—/]\s*|\s+)(?=(?:Operated\s+case\s+of|Status\s+post)\b)/i
    )
    .map((c) => expandClinicalShorthands(c.replace(/^[\-•*°\s]+|[\s.;,]+$/g, '')))
    .filter(Boolean);

  if (rawClauses.length === 0) return '';

  const uniqueClauses: string[] = [];
  const uniqueCores: string[] = [];
  const seenSubCores: string[] = [];

  for (const clause of rawClauses) {
    // Also check if a single clause has comma-separated identical repeats (or repeats a sub-clause from an earlier clause)
    const commaParts = clause.split(/\s*,\s*/).filter(Boolean);
    let deduplicatedClause = clause;
    if (commaParts.length > 1) {
      const keptComma: string[] = [];
      for (const cp of commaParts) {
        const cpClean = expandClinicalShorthands(cp);
        const cpCore = normalizeClinicalClauseCore(cpClean);
        if (!cpCore) continue;
        const dupIdx = seenSubCores.findIndex((k) => areClinicalCoresDuplicate(k, cpCore));
        if (dupIdx === -1) {
          keptComma.push(cpClean);
          seenSubCores.push(cpCore);
        }
      }
      if (keptComma.length === 0) continue;
      deduplicatedClause = keptComma.join(', ');
    }

    const core = normalizeClinicalClauseCore(deduplicatedClause);
    if (!core) continue;

    // Also check if this single clause was already seen as a comma sub-part in an earlier clause
    const alreadyInSub =
      commaParts.length === 1 && seenSubCores.some((k) => areClinicalCoresDuplicate(k, core));
    if (alreadyInSub && uniqueCores.some((uc) => areClinicalCoresDuplicate(uc, core))) {
      continue;
    }
    if (commaParts.length === 1) {
      seenSubCores.push(core);
    }

    const existingIdx = uniqueCores.findIndex((existingCore) =>
      areClinicalCoresDuplicate(existingCore, core)
    );

    if (existingIdx === -1) {
      uniqueClauses.push(deduplicatedClause);
      uniqueCores.push(core);
    } else {
      // Keep whichever version is cleaner/more complete
      if (deduplicatedClause.length > uniqueClauses[existingIdx].length) {
        uniqueClauses[existingIdx] = deduplicatedClause;
        uniqueCores[existingIdx] = core;
      }
    }
  }

  return uniqueClauses.join(joinSeparator);
}

/**
 * Deduplicates `assessmentPlan`, `advice`, and `nextVisit` across each other so that:
 * 1. No clause is repeated twice within `assessmentPlan` or within `advice`.
 * 2. Clauses already present in `assessmentPlan` are not duplicated in `advice` (so Record Input and Print never show the same plan item twice).
 */
export function deduplicatePlanAndAdviceFields(
  assessmentPlan?: string,
  advice?: string,
  nextVisit?: string
): { assessmentPlan: string; advice: string; nextVisit: string } {
  const cleanPlan = deduplicateClinicalText(assessmentPlan, '; ');
  const rawAdviceDedup = deduplicateClinicalText(advice, '; ');
  const cleanNextVisit = deduplicateClinicalText(nextVisit, '; ');

  if (!rawAdviceDedup) {
    return {
      assessmentPlan: cleanPlan,
      advice: '',
      nextVisit: cleanNextVisit,
    };
  }

  const planCores = cleanPlan
    .split(/\s*;\s*/)
    .map((c) => normalizeClinicalClauseCore(c))
    .filter(Boolean);

  const adviceClauses = rawAdviceDedup
    .split(/\s*;\s*/)
    .map((c) => c.trim())
    .filter(Boolean);

  const filteredAdviceClauses = adviceClauses.filter((advClause) => {
    const advCore = normalizeClinicalClauseCore(advClause);
    if (!advCore) return false;
    const alreadyInPlan = planCores.some((pCore) => areClinicalCoresDuplicate(pCore, advCore));
    return !alreadyInPlan;
  });

  return {
    assessmentPlan: cleanPlan,
    advice: filteredAdviceClauses.join('; '),
    nextVisit: cleanNextVisit,
  };
}

/**
 * Checks if a lab parameter should be ignored according to user clinical rules:
 * - Strictly excludes surgical history / procedures (e.g. DVIU, Meatoplasty, TURP, Cystoscopy, Catheter removal)
 * - In CBC: ONLY Hb and TLC should be added (ignore Platelets, RBC, PCV, MCV, DLC, Polys, Neutrophils, Lymphocytes, ESR, etc.)
 * - In KFT: ONLY Serum Creatinine should be added (ignore Urea, BUN, Uric Acid, Sodium, Potassium, Chloride, eGFR, etc.)
 * - Also ignore isolated dipstick sub-tokens like standalone "Albumin" or "Bacteria" that were split from Urine R/M.
 */
export function shouldSkipLabParameter(rawName: string, rawVal?: string): boolean {
  const lower = (rawName || '').trim().toLowerCase();
  if (!lower) return true;

  // Never allow surgical history or clinical procedures in Lab/Imaging tables
  if (isSurgicalOrClinicalProcedure(lower) || isSurgicalOrClinicalProcedure(rawVal)) {
    return true;
  }

  if (/urine/i.test(lower)) return false;

  // Unwanted CBC parameters
  if (
    /^(plt|platelets?|platelet count|rbc|rbc count|pcv|hematocrit|haematocrit|mcv|mch|mchc|rdw|mpv|dlc|polys?|neutrophils?|lymphocytes?|eosinophils?|monocytes?|basophils?|esr)$/i.test(
      lower
    )
  ) {
    return true;
  }

  // Unwanted KFT parameters
  if (
    /^(urea|blood urea|b\.?\s*urea|bun|serum urea|uric acid|s\.?\s*uric acid|serum uric acid|sodium|s\.?\s*sodium|serum sodium|na\+?|potassium|s\.?\s*potassium|serum potassium|k\+?|chloride|cl\-?|egfr|gfr)$/i.test(
      lower
    )
  ) {
    return true;
  }

  // Standalone urine dipstick sub-tokens accidentally split by comma
  if (/^(albumin|bacteria|bact|epithelial|epi cells?|casts?|crystals?)$/i.test(lower)) {
    return true;
  }

  // Must be a recognized lab or imaging test
  if (!isStrictLabOrImagingParameter(lower, rawVal)) {
    return true;
  }

  return false;
}

/**
 * Repairs legacy or mis-split parameter/value pairs (e.g., parameterName="Serum" & value="Creatinine - 1.35 mg/dL",
 * or parameterName="Urine" & value="Routine (R/M) - Pus cells 24-28/hpf").
 */
export function repairMisSplitParameterAndValue(
  rawParam: string,
  rawVal: string
): { paramName: string; valText: string } {
  let p = (rawParam || '').trim();
  let v = (rawVal || '').trim();

  if (/^serum$/i.test(p) && /^creatinine\b/i.test(v)) {
    p = 'Serum Creatinine';
    v = v.replace(/^creatinine\s*[:=\-–]?\s*/i, '').trim();
  } else if (/^urine$/i.test(p)) {
    if (/^(?:routine(?:\s*\(r\/m\))?|r\/m)\b/i.test(v)) {
      p = 'Urine Routine (R/M)';
      v = v.replace(/^(?:routine(?:\s*\(r\/m\))?|r\/m)\s*[:=\-–]?\s*/i, '').trim();
    } else if (/^(?:culture(?:\s*\(c\/s\))?|c\/s)\b/i.test(v)) {
      p = 'Urine Culture (C/S)';
      v = v.replace(/^(?:culture(?:\s*\(c\/s\))?|c\/s)\s*[:=\-–]?\s*/i, '').trim();
    }
  } else if (/^hb\s*\(haemoglobin\)$/i.test(p) && /^haemoglobin\b/i.test(v)) {
    v = v.replace(/^haemoglobin\s*[:=\-–]?\s*/i, '').trim();
  }

  return { paramName: p, valText: v };
}

/**
 * Checks if a parameter name is a specific USG sub-finding (like PVR, Prostate size, or Hydroureteronephrosis)
 * so that when grouped into a USG row, the sub-finding label is preserved in the bullet text.
 */
export function formatUsgSubFindingIfApplicable(
  rawParameterName: string,
  rawValue: string
): string {
  const paramClean = (rawParameterName || '').trim().replace(/^[\-•*:]+|[\-•*:]+$/g, '').trim();
  const valClean = (rawValue || '').trim();
  if (!valClean) return '';

  const pLower = paramClean.toLowerCase();
  const vLower = valClean.toLowerCase();

  // PVR / Post Void Residue
  if (/^(pvr|post\s*void\s*residu(?:e|al)(?:\s*urine)?|pre\s*(?:&|and|\/)\s*post\s*void)$/i.test(pLower)) {
    if (!/\b(pvr|post\s*void)\b/i.test(vLower)) {
      return `PVR - ${valClean}`;
    }
    return valClean;
  }

  // Prostate size / volume (including circled '(P)' shorthand)
  if (
    /^(prostate|\(?p\)?|prostate\s*size|prostate\s*vol(?:ume)?|prostate\s*wt|prostate\s*weight|bpe|bph)$/i.test(
      pLower
    )
  ) {
    const expandedVal = valClean.replace(/\bc\s+ml\b/gi, 'with ML');
    if (!/\bprostate\b/i.test(vLower)) {
      const label = /size/i.test(pLower) ? 'Prostate size' : 'Prostate';
      return `${label} - ${expandedVal}`;
    }
    return expandedVal;
  }

  // Hydroureteronephrosis / Hydronephrosis
  if (/^(hydroureteronephrosis|hydronephrosis|hun|hdn)$/i.test(pLower)) {
    if (!/\b(hydroureteronephrosis|hydronephrosis|hun|hdn)\b/i.test(vLower)) {
      return `Hydroureteronephrosis - ${valClean}`;
    }
    return valClean;
  }

  return valClean.replace(/\bc\s+ml\b/gi, 'with ML');
}

/**
 * Standardizes test/parameter/imaging names so similar investigations across dates merge into the same table row
 */
export function standardizeParameterName(
  rawName: string,
  rawCategory?: 'lab' | 'imaging',
  panelHint?: string
): { canonicalKey: string; displayName: string; category: 'lab' | 'imaging'; panelOrStudy: string } {
  const cleaned = (rawName || '')
    .trim()
    .replace(/^(?:reports?\s+brought|repeat|previous|prev\.?|latest)\s*[:\-]?\s*/i, '')
    .replace(/^[\-•*:]+|[\-•*:]+$/g, '')
    .trim();
  const lower = cleaned.toLowerCase();
  const panelLower = (panelHint || '').toLowerCase();

  // Imaging checks first (excluding surgical procedures like cystoscopy, DVIU, meatoplasty)
  if (
    !isSurgicalOrClinicalProcedure(cleaned) &&
    (rawCategory === 'imaging' ||
      /\b(usg|ultrasound|sonography|kub|ct\b|ncct|cect|urography|mri|x-?ray|uroflow|uroflowmetry|echo|ecg|rgu|mcu|ivp|dtpa|dmsa|pvr|post\s*void\s*residu|prostate\s*size|prostate\s*vol|hydroureteronephrosis|hydronephrosis)\b/i.test(
        `${lower} ${panelLower}`
      ) ||
      /^(prostate|\(?p\)?|pvr|hun|hdn)$/i.test(lower))
  ) {
    if (/\b(uroflow|uroflowmetry|qmax|voided vol)/i.test(`${lower} ${panelLower}`)) {
      return {
        canonicalKey: 'img_uroflowmetry',
        displayName: 'Uroflowmetry',
        category: 'imaging',
        panelOrStudy: 'Uroflowmetry',
      };
    }
    if (/\b(ct\b|ncct|cect|urography)/i.test(`${lower} ${panelLower}`)) {
      return {
        canonicalKey: 'img_ct_kub',
        displayName: 'CT KUB / Urography',
        category: 'imaging',
        panelOrStudy: 'CT KUB',
      };
    }
    if (/\b(mri|mp-?mri)/i.test(`${lower} ${panelLower}`)) {
      return {
        canonicalKey: 'img_mri',
        displayName: 'MRI Pelvis / Prostate',
        category: 'imaging',
        panelOrStudy: 'MRI',
      };
    }
    if (/\b(x-?ray|xray|ivs|ivp|rgu|mcu)/i.test(`${lower} ${panelLower}`)) {
      return {
        canonicalKey: 'img_xray_kub',
        displayName: 'X-Ray KUB',
        category: 'imaging',
        panelOrStudy: 'X-Ray KUB',
      };
    }
    if (/\b(echo|2d echo)/i.test(`${lower} ${panelLower}`)) {
      return {
        canonicalKey: 'img_echo',
        displayName: '2D ECHO',
        category: 'imaging',
        panelOrStudy: '2D ECHO',
      };
    }
    if (/\b(inguino|scrotal|testis|doppler)/i.test(`${lower} ${panelLower}`)) {
      return {
        canonicalKey: 'img_usg_scrotal',
        displayName: 'USG Inguino-Scrotal / Doppler',
        category: 'imaging',
        panelOrStudy: 'USG Scrotum',
      };
    }
    if (
      /\b(usg|ultrasound|sonography|kub|abdomen|pelvis|prostate|pvr|post\s*void|hydroureteronephrosis|hydronephrosis|hun)\b/i.test(
        `${lower} ${panelLower}`
      ) ||
      /^\(?p\)?$/i.test(lower)
    ) {
      return {
        canonicalKey: 'img_usg_kub',
        displayName: 'USG',
        category: 'imaging',
        panelOrStudy: 'USG',
      };
    }
    const niceName = cleaned || panelHint || 'Imaging Study';
    return {
      canonicalKey: `img_${niceName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
      displayName: niceName,
      category: 'imaging',
      panelOrStudy: panelHint || niceName,
    };
  }

  // Lab parameter standardization (check HbA1c before Hb)
  if (/^(hba1c|hb\s*a1c|hb1ac|glycated\s*hb|glycosylated\s*hemoglobin)$/i.test(lower)) {
    return { canonicalKey: 'lab_hba1c', displayName: 'HbA1c', category: 'lab', panelOrStudy: 'Diabetes' };
  }
  if (/^(hb|haemoglobin|hemoglobin|hb\s*\(.*\)|hb%|cbc\s*[-:]?\s*hb)$/i.test(lower)) {
    return { canonicalKey: 'lab_hb', displayName: 'Hb (Haemoglobin)', category: 'lab', panelOrStudy: 'CBC' };
  }
  if (/^(tlc|wbc|total leucocyte count|total leukocyte count|total wbc|tlc\s*\(.*\)|cbc\s*[-:]?\s*tlc)$/i.test(lower)) {
    return {
      canonicalKey: 'lab_tlc',
      displayName: 'TLC (Total Leucocyte Count)',
      category: 'lab',
      panelOrStudy: 'CBC',
    };
  }
  if (
    /^(creat|creatinine|cr|s\.?\s*cr|sr\.?\s*cr|s\.?\s*creat|sr\.?\s*creat|serum\s*creatinine|s\.?\s*creatinine|sr\.?\s*creatinine|kft|rft)$/i.test(
      lower
    )
  ) {
    return {
      canonicalKey: 'lab_creatinine',
      displayName: 'Serum Creatinine',
      category: 'lab',
      panelOrStudy: 'KFT',
    };
  }
  if (/^(psa|s\.?\s*psa|sr\.?\s*psa|serum\s*psa|total\s*psa|free\s*psa|psa\s*total)$/i.test(lower)) {
    return { canonicalKey: 'lab_psa', displayName: 'Serum PSA', category: 'lab', panelOrStudy: 'PSA' };
  }
  if (/^(fbs|fasting blood sugar|fasting glucose)$/i.test(lower)) {
    return {
      canonicalKey: 'lab_fbs',
      displayName: 'Fasting Blood Sugar (FBS)',
      category: 'lab',
      panelOrStudy: 'Diabetes',
    };
  }
  if (/^(ppbs|post prandial|rbs|random blood sugar|blood sugar)$/i.test(lower)) {
    return {
      canonicalKey: 'lab_rbs_ppbs',
      displayName: 'Blood Sugar (RBS / PPBS)',
      category: 'lab',
      panelOrStudy: 'Diabetes',
    };
  }
  if (
    /^(urine\s*c\/s|ur\.?\s*c\/s|u\.?\s*c\/s|urine\s*culture|urine\s*cs|culture\s*&\s*sensitivity|urine\s*culture\s*\(c\/s\))$/i.test(
      lower
    )
  ) {
    return {
      canonicalKey: 'lab_urine_cs',
      displayName: 'Urine Culture (C/S)',
      category: 'lab',
      panelOrStudy: 'Urine C/S',
    };
  }
  if (
    /^(urine\s*r\/m|ur\.?\s*r\/m|u\.?\s*r\/m|u\/r|urine\s*routine(?:\s*&\s*microscopy)?|urine\s*rm|urinalysis|urine\s*routine\s*\(r\/m\)|urine\s*dipstick|pus\s*cells?|urine\s*pus\s*cells?|urine\s*rbc)$/i.test(
      lower
    )
  ) {
    return {
      canonicalKey: 'lab_urine_rm',
      displayName: 'Urine Routine (R/M)',
      category: 'lab',
      panelOrStudy: 'Urine R/M',
    };
  }

  const displayName = cleaned || panelHint || 'Lab Parameter';
  return {
    canonicalKey: `lab_${displayName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
    displayName,
    category: 'lab',
    panelOrStudy: panelHint || 'Lab',
  };
}

/**
 * Sanitizes value text according to clinical rules:
 * - Urine R/M: if normal/WNL/NAD/(N), returns "Normal study"
 * - Urine Culture: keeps only the organism grown (or "No growth" / "Sterile")
 */
export function sanitizeInvestigationValue(
  canonicalKey: string,
  rawValue: string,
  rawParameterName?: string
): string {
  let val = (rawValue || '').trim().replace(/^[.:\-–\s]+|[.\s]+$/g, '').trim();
  if (!val) return '';

  if (canonicalKey === 'img_usg_kub' && rawParameterName) {
    val = formatUsgSubFindingIfApplicable(rawParameterName, val);
  }

  if (canonicalKey === 'lab_urine_rm') {
    val = val
      .replace(/^(?:routine\s*\(r\/m\)|urine\s*r\/m|ur\.?\s*r\/m|u\.?\s*r\/m)\s*[:=\-–]?\s*/i, '')
      .trim();
    if (/^\(?\s*(?:n|normal|nad|wnl|within normal limits|nil|normal study)\s*\)?$/i.test(val)) {
      return 'Normal study';
    }
  }

  if (canonicalKey === 'lab_urine_cs') {
    val = val
      .replace(/^(?:culture\s*\(c\/s\)|urine\s*c\/s|ur\.?\s*c\/s|u\.?\s*c\/s)\s*[:=\-–]?\s*/i, '')
      .replace(/\b(?:sensitive to|resistant to|intermediate to|s:|r:|colony count)[^;|]*/gi, '')
      .replace(/[;,\s]+$/, '')
      .trim();
    if (/^\(?\s*(?:sterile|no growth|nil|negative|normal)\s*\)?$/i.test(val)) {
      return 'No growth (Sterile)';
    }
  }

  if (canonicalKey === 'lab_creatinine') {
    val = val.replace(/^(?:s\.?|sr\.?|serum)?\s*(?:creat(?:inine)?|cr)\s*[:=\-]?\s*/i, '').trim();
  }

  return val;
}

/**
 * Combines two imaging findings strings on the same date without duplicating bullets
 */
export function mergeImagingValueStrings(existingVal: string, newVal: string): string {
  const splitFindings = (str: string): string[] =>
    (str || '')
      .split(/\s*(?:•|\n|;)\s*/)
      .map((s) => s.replace(/^[\-•*]\s*/, '').replace(/^Impression:\s*/i, '').trim())
      .filter(Boolean);

  const combined: string[] = [];
  for (const part of [...splitFindings(existingVal), ...splitFindings(newVal)]) {
    const normPart = part.toLowerCase().replace(/[^a-z0-9]/g, '');
    const exists = combined.some((c) => {
      const normC = c.toLowerCase().replace(/[^a-z0-9]/g, '');
      return normC === normPart || normC.includes(normPart);
    });
    if (!exists) {
      const subIdx = combined.findIndex((c) => {
        const normC = c.toLowerCase().replace(/[^a-z0-9]/g, '');
        return normPart.includes(normC);
      });
      if (subIdx >= 0) {
        combined[subIdx] = part;
      } else {
        combined.push(part);
      }
    }
  }
  return combined.join(' • ');
}

/**
 * Splits an imaging value/impression into clean, non-redundant bullet points for full-row display
 */
export function splitImagingIntoBullets(rawText: string): string[] {
  if (!rawText || !rawText.trim()) return [];
  const cleaned = rawText
    .replace(/^Impression:\s*/i, '')
    .replace(/\bc\s+ml\b/gi, 'with ML')
    .trim();

  // First split by explicit bullet '•', semicolon ';', or newline
  const primaryParts = cleaned
    .split(/\s*(?:•|\n|;)\s*/)
    .map((s) => s.replace(/^[\-•*o°]\s*/i, '').trim())
    .filter(Boolean);

  // Also split any long comma-separated USG part or inline PVR + Prostate into individual findings
  const expandedParts: string[] = [];
  for (const part of primaryParts) {
    // Normalize inline "120/180cc PVR prostate 37.2cc with ML" or "(P) - 37.2cc" into comma-separated sub-findings
    const withNormalizedProstate = part
      .replace(/\b(pvr)\s+(prostate\b|\(p\))/gi, '$1, $2')
      .replace(/(?:^|,\s*)\(p\)\s*[:\-–]?\s*/gi, (m) => (m.startsWith(',') ? ', Prostate - ' : 'Prostate - '));

    const commaSub = withNormalizedProstate
      .split(/\s*,\s*/)
      .map((s) => s.replace(/^[\-•*o°]\s*/i, '').trim())
      .filter(Boolean);
    if (
      commaSub.length > 1 &&
      commaSub.some((p) =>
        /\b(pvr|prostate|hydroureteronephrosis|hydronephrosis|calculus|stone|cyst|qmax)\b/i.test(p)
      )
    ) {
      expandedParts.push(...commaSub);
    } else {
      expandedParts.push(withNormalizedProstate);
    }
  }

  // Deduplicate bullets (e.g., if "PVR 85ml" and "PVR - 85ml" both appear)
  const uniqueBullets: string[] = [];
  for (const item of expandedParts) {
    const normItem = item.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!normItem) continue;
    const alreadyExists = uniqueBullets.some((u) => {
      const normU = u.toLowerCase().replace(/[^a-z0-9]/g, '');
      return normU === normItem || normU.includes(normItem) || normItem.includes(normU);
    });
    if (!alreadyExists) {
      uniqueBullets.push(item);
    }
  }

  return uniqueBullets.length > 0 ? uniqueBullets : [cleaned];
}

/**
 * Parses a consultation's `labTestsAndImaging` free-text string into structured `InvestigationItem[]`
 * so both handwritten OPD sheet notes and structured OCR items participate in the date-wise table.
 */
export function parseLabTestsAndImagingToItems(
  text?: string,
  fallbackIsoDate?: string
): InvestigationItem[] {
  if (!text || !text.trim()) return [];
  const raw = text
    .trim()
    .replace(/^(?:reports?\s+brought|previous\s+investigations?|labs?\s*&?\s*imaging)\s*[:\-]\s*/i, '');
  const items: InvestigationItem[] = [];

  let activeDateIso = fallbackIsoDate || new Date().toISOString().split('T')[0];
  let activeDateDisp = normalizeInvestigationDate(activeDateIso, fallbackIsoDate).displayDate;

  // Pre-split multi-date strings on:
  // - pipe `|`
  // - newline `\r?\n`
  // - semicolon `;`
  // - `&` or `and` before a date token (e.g. `& 8/11 hb - 14.79`)
  // - comma `,` before a date token (e.g. `, 8/11: hb - 14.79` or `, 8/11 hb - 14.79`)
  const segments = raw
    .split(
      /\s*\|\s*|\r?\n|;\s*|\s+(?:&|and)\s+(?=\[?(?:0?[1-9]|[12]\d|3[01])[\/\-.](?:0?[1-9]|1[0-2])\b)|,\s*(?=\[?(?:0?[1-9]|[12]\d|3[01])[\/\-.](?:0?[1-9]|1[0-2])(?:[\/\-.]\d{2,4})?\]?\s*(?:[:\-–]|\s+[A-Za-z(]))/i
    )
    .map((s) => s.trim())
    .filter(Boolean);

  // Regex matching a real DD/MM or DD/MM/YY or YYYY-MM-DD date prefix (followed by `:`, `-`, or space before a test name, and NOT followed by cc/ml/mm)
  const DATE_PREFIX_RE =
    /^\[?((?:20\d{2}[\/\-.](?:0?[1-9]|1[0-2])[\/\-.](?:0?[1-9]|[12]\d|3[01]))|(?:(?:0?[1-9]|[12]\d|3[01])[\/\-.](?:0?[1-9]|1[0-2])(?:[\/\-.]\d{2,4})?))(?!\s*(?:cc|ml|mm|cm|mg|g\/dl|hpf|%)\b)\]?\s*(?:[:\-–]\s*|\s+(?=[A-Za-z(]))(.+)$/i;

  for (const seg of segments) {
    let body = seg
      .replace(/^(?:reports?\s+brought)\s*[:\-]\s*/i, '')
      .replace(/^[•*°o]\s*/, '')
      .trim();
    if (!body || /^[_—\-]+$/.test(body)) continue;

    // Check if segment is just a standalone date header e.g. "6/11/26" or "22/11" or "USG - 5/11/26"
    const standaloneUsgDateMatch = body.match(
      /^(?:(usg(?:\s*kub)?)\s*[:\-–]?\s*)?\[?((?:0?[1-9]|[12]\d|3[01])[\/\-.](?:0?[1-9]|1[0-2])(?:[\/\-.]\d{2,4})?)\]?\s*:?$/i
    );
    if (standaloneUsgDateMatch) {
      const normD = normalizeInvestigationDate(standaloneUsgDateMatch[2], fallbackIsoDate);
      activeDateIso = normD.isoDate;
      activeDateDisp = normD.displayDate;
      continue;
    }

    let currentIso = activeDateIso;
    let currentDisp = activeDateDisp;

    const usgDatePrefixMatch = body.match(
      /^(usg(?:\s*kub)?)\s*[:\-–]?\s*\[?((?:0?[1-9]|[12]\d|3[01])[\/\-.](?:0?[1-9]|1[0-2])(?:[\/\-.]\d{2,4})?)\]?\s*[:\-–]?\s*(.+)$/i
    );
    if (usgDatePrefixMatch) {
      const normD = normalizeInvestigationDate(usgDatePrefixMatch[2], fallbackIsoDate);
      currentIso = normD.isoDate;
      currentDisp = normD.displayDate;
      activeDateIso = currentIso;
      activeDateDisp = currentDisp;
      body = `USG - ${usgDatePrefixMatch[3].trim()}`;
    } else {
      const datePrefixMatch = body.match(DATE_PREFIX_RE);
      if (datePrefixMatch) {
        const normD = normalizeInvestigationDate(datePrefixMatch[1], fallbackIsoDate);
        currentIso = normD.isoDate;
        currentDisp = normD.displayDate;
        activeDateIso = currentIso;
        activeDateDisp = currentDisp;
        body = datePrefixMatch[2].trim();
      }
    }

    // Smart top-level comma splitting: ONLY split at a comma if what follows the comma begins a new recognizable test
    // (so "Urine Routine (R/M) - Pus cells 24-28/hpf, Albumin 1+" or "USG - 120/180cc PVR, Prostate 37.2cc with ML" are handled cleanly)
    const rawCommaParts: string[] = [];
    let depth = 0;
    let buf = '';
    for (let i = 0; i < body.length; i++) {
      const ch = body[i];
      if (ch === '(') depth++;
      else if (ch === ')') depth = Math.max(0, depth - 1);

      if (ch === ',' && depth === 0) {
        const restAfterComma = body.slice(i + 1).trim();
        const looksLikeNewTest =
          /^(?:\[?(?:0?[1-9]|[12]\d|3[01])[\/\-.](?:0?[1-9]|1[0-2])\b|hb\b|hb\s*a1c\b|hba1c\b|haemoglobin\b|hemoglobin\b|tlc\b|wbc\b|cbc\b|kft\b|rft\b|s\.?\s*creat|sr\.?\s*creat|serum\s+creat|creat(?:inine)?\b|s\.?\s*cr\b|sr\.?\s*cr\b|cr\b|urine\b|ur\.?\s*r\/m|u\.?\s*r\/m|u\/r\b|ur\.?\s*c\/s|u\.?\s*c\/s|psa\b|s\.?\s*psa|sr\.?\s*psa|serum\s+psa|fbs\b|rbs\b|ppbs\b|usg\b|ultrasound\b|ct\b|ncct\b|uroflow|x-?ray\b|mri\b|pvr\b|prostate\b|\(p\)\s*[:\-–]?|hydroureteronephrosis\b)/i.test(
            restAfterComma
          );
        if (looksLikeNewTest) {
          if (buf.trim()) rawCommaParts.push(buf.trim());
          buf = '';
          continue;
        }
      }
      buf += ch;
    }
    if (buf.trim()) rawCommaParts.push(buf.trim());

    for (const rawChunk of rawCommaParts) {
      const chunk = rawChunk
        .replace(/^(?:reports?\s+brought)\s*[:\-]\s*/i, '')
        .replace(/^[•*°o]\s*/, '')
        .trim();
      if (!chunk) continue;

      let chunkIso = currentIso;
      let chunkDisp = currentDisp;
      let cleanChunk = chunk;
      const inlineDateMatch = cleanChunk.match(DATE_PREFIX_RE);
      if (inlineDateMatch) {
        const normD = normalizeInvestigationDate(inlineDateMatch[1], fallbackIsoDate);
        chunkIso = normD.isoDate;
        chunkDisp = normD.displayDate;
        currentIso = chunkIso;
        currentDisp = chunkDisp;
        activeDateIso = chunkIso;
        activeDateDisp = chunkDisp;
        cleanChunk = inlineDateMatch[2].trim();
      }

      // Check if this chunk starts with an imaging study name e.g. "USG - 120/180cc PVR prostate 37.2cc with ML" or "(P) - 37.2cc c ML"
      const chunkImagingMatch = cleanChunk.match(
        /^(usg(?:\s*kub(?:\s*\/\s*abdomen\s*&\s*pelvis)?)?|ultrasound|ct\s*kub(?:\s*\/\s*urography)?|ncct\s*kub|uroflowmetry|x-?ray\s*kub|mri(?:\s*pelvis|\s*prostate)?|prostate(?:\s*size)?|\(p\)|pvr)\s*(?:[:=\-–]\s*|\s+(?=\d))(.+)$/i
      );
      if (chunkImagingMatch) {
        const studyRaw = chunkImagingMatch[1].trim();
        const restVal = chunkImagingMatch[2].trim();
        const std = standardizeParameterName(studyRaw, 'imaging');
        const val = sanitizeInvestigationValue(std.canonicalKey, restVal, studyRaw);
        if (val) {
          items.push({
            reportDate: chunkIso,
            displayDate: chunkDisp,
            category: 'imaging',
            panelOrStudy: std.panelOrStudy,
            parameterName: std.displayName,
            valueOrImpression: val,
          });
        }
        continue;
      }

      // Case 1: Panel with parentheses like "CBC (Hb 13, TLC 9700)" or "KFT (S. Creatinine 1.1 mg/dL)" or "USG KUB (Calculus 14.7mm)"
      const parenMatch = cleanChunk.match(/^([A-Za-z0-9\s\/+\-.]+?)\s*\(([^)]+)\)$/);
      if (
        parenMatch &&
        !/\((?:haemoglobin|total leucocyte|r\/m|c\/s|fbs|rbs)\)$/i.test(cleanChunk) &&
        !/^(?:ur\.?\s*r\/m|u\.?\s*r\/m|urine\s*r\/m|urine\s*routine)/i.test(parenMatch[1].trim())
      ) {
        const outerName = parenMatch[1].trim();
        const innerContent = parenMatch[2].trim();
        const outerStd = standardizeParameterName(outerName);

        if (outerStd.category === 'imaging' || /urine|u\/r|r\/m/i.test(outerName)) {
          const val = sanitizeInvestigationValue(outerStd.canonicalKey, innerContent, outerName);
          if (val) {
            items.push({
              reportDate: chunkIso,
              displayDate: chunkDisp,
              category: outerStd.category,
              panelOrStudy: outerStd.panelOrStudy,
              parameterName: outerStd.displayName,
              valueOrImpression: val,
            });
          }
        } else {
          const subParts = innerContent.split(/\s*,\s*/).filter(Boolean);
          let parsedSub = false;
          for (const sub of subParts) {
            const kv = sub.match(
              /^([A-Za-z0-9\s\/+\-.]+?)\s*(?:[:=\-]\s*|\s+)(\d[\d.,\s\/a-zA-Z%]*)$/
            );
            if (kv) {
              const subName = kv[1].trim();
              if (shouldSkipLabParameter(subName)) {
                parsedSub = true;
                continue;
              }
              const std = standardizeParameterName(subName, 'lab', outerName);
              const val = sanitizeInvestigationValue(std.canonicalKey, kv[2].trim(), subName);
              if (val) {
                items.push({
                  reportDate: chunkIso,
                  displayDate: chunkDisp,
                  category: std.category,
                  panelOrStudy: outerName,
                  parameterName: std.displayName,
                  valueOrImpression: val,
                });
              }
              parsedSub = true;
            }
          }
          if (!parsedSub && !shouldSkipLabParameter(outerName)) {
            const val = sanitizeInvestigationValue(outerStd.canonicalKey, innerContent, outerName);
            if (val) {
              items.push({
                reportDate: chunkIso,
                displayDate: chunkDisp,
                category: outerStd.category,
                panelOrStudy: outerStd.panelOrStudy,
                parameterName: outerStd.displayName,
                valueOrImpression: val,
              });
            }
          }
        }
        continue;
      }

      // Case 2A: Explicit delimiter ` - `, ` – `, `: `, or ` = ` (prevents splitting "Serum Creatinine - 1.35" at the space after "Serum")
      const cleanPrefix = cleanChunk.replace(/^cbc\s*[:\-–]\s*/i, '');
      const explicitDelimMatch = cleanPrefix.match(
        /^([A-Za-z(][A-Za-z0-9\s\/+.()]{0,42}?)\s*[:=\-–]\s*(.+)$/
      );
      if (explicitDelimMatch) {
        const repaired = repairMisSplitParameterAndValue(
          explicitDelimMatch[1],
          explicitDelimMatch[2]
        );
        const std = standardizeParameterName(repaired.paramName);
        if (std.category !== 'imaging' && shouldSkipLabParameter(repaired.paramName, repaired.valText)) {
          continue;
        }
        const val = sanitizeInvestigationValue(std.canonicalKey, repaired.valText, repaired.paramName);
        if (val) {
          items.push({
            reportDate: chunkIso,
            displayDate: chunkDisp,
            category: std.category,
            panelOrStudy: std.panelOrStudy,
            parameterName: std.displayName,
            valueOrImpression: val,
          });
        }
        continue;
      }

      // Case 2B: Space-separated known parameter + value (e.g. "Hb 13.0", "TLC 9700", "Creat 0.96", "cr 0.96", "HbA1c 5.7%")
      const spaceSeparatedMatch = cleanPrefix.match(
        /^(hba1c|hb\s*a1c|hb1ac|hb(?:\s*\(haemoglobin\))?|haemoglobin|hemoglobin|tlc(?:\s*\(total leucocyte count\))?|wbc|serum\s*creatinine|s\.?\s*creatinine|sr\.?\s*creatinine|s\.?\s*creat|sr\.?\s*creat|creat(?:inine)?|s\.?\s*cr|sr\.?\s*cr|cr|serum\s*psa|sr\.?\s*psa|s\.?\s*psa|psa|fbs|rbs|ppbs|urine\s*r\/m|ur\.?\s*r\/m|u\.?\s*r\/m|u\/r|urine\s*routine(?:\s*\(r\/m\))?|urine\s*c\/s|ur\.?\s*c\/s|u\.?\s*c\/s|urine\s*culture(?:\s*\(c\/s\))?|usg(?:\s*kub)?|pvr|prostate(?:\s*size)?|\(p\))\s+(.+)$/i
      );
      if (spaceSeparatedMatch) {
        const rawParam = spaceSeparatedMatch[1].trim();
        const rawVal = spaceSeparatedMatch[2].trim();
        const std = standardizeParameterName(rawParam);
        if (std.category !== 'imaging' && shouldSkipLabParameter(rawParam, rawVal)) continue;
        const val = sanitizeInvestigationValue(std.canonicalKey, rawVal, rawParam);
        if (val) {
          items.push({
            reportDate: chunkIso,
            displayDate: chunkDisp,
            category: std.category,
            panelOrStudy: std.panelOrStudy,
            parameterName: std.displayName,
            valueOrImpression: val,
          });
        }
      }
    }
  }

  return items;
}

/**
 * Extracts all structured + parsed investigation items from a single consultation.
 * IMPORTANT: When `c.labTestsAndImaging` is present and parses into items, `fromText` is authoritative
 * so that manual edits in `labTestsAndImaging` immediately reflect in the table and stale/phantom values
 * never persist in `investigationRecords`.
 */
export function getInvestigationItemsForConsultation(c: Consultation): InvestigationItem[] {
  const fromStructured = Array.isArray(c.investigationRecords) ? c.investigationRecords : [];
  const hasLabText = Boolean(c.labTestsAndImaging && c.labTestsAndImaging.trim());
  const fromText = hasLabText ? parseLabTestsAndImagingToItems(c.labTestsAndImaging, c.date) : [];

  // Map structured metadata (flag, referenceRange) by date+canonicalKey so text items can inherit them if applicable
  const structuredMetaMap = new Map<string, { flag?: InvestigationItem['flag']; referenceRange?: string; id?: string }>();
  for (const sItem of fromStructured) {
    const repaired = repairMisSplitParameterAndValue(sItem.parameterName, sItem.valueOrImpression);
    const std = standardizeParameterName(repaired.paramName, sItem.category, sItem.panelOrStudy);
    const normDate = normalizeInvestigationDate(sItem.reportDate || sItem.displayDate, c.date);
    structuredMetaMap.set(`${normDate.isoDate}__${std.canonicalKey}`, {
      flag: sItem.flag,
      referenceRange: sItem.referenceRange,
      id: sItem.id,
    });
  }

  // If `labTestsAndImaging` has text and produced parsed items, use ONLY `fromText` as the source of truth
  // so no unwritten/stale values from `investigationRecords` can ever pollute the consultation!
  const sourceItems = hasLabText && fromText.length > 0 ? fromText : fromStructured;

  const combinedMap = new Map<string, InvestigationItem>();

  for (const item of sourceItems) {
    const repaired = repairMisSplitParameterAndValue(
      item.parameterName,
      item.valueOrImpression
    );
    const std = standardizeParameterName(repaired.paramName, item.category, item.panelOrStudy);
    if (
      isSurgicalOrClinicalProcedure(repaired.paramName) ||
      (std.category !== 'imaging' && shouldSkipLabParameter(repaired.paramName, repaired.valText))
    ) {
      continue;
    }
    const normDate = normalizeInvestigationDate(item.reportDate || item.displayDate, c.date);
    const cleanVal = sanitizeInvestigationValue(
      std.canonicalKey,
      repaired.valText,
      repaired.paramName
    );
    if (!cleanVal) continue;

    const dedupKey = `${normDate.isoDate}__${std.canonicalKey}`;
    const meta = structuredMetaMap.get(dedupKey);
    const existing = combinedMap.get(dedupKey);
    if (!existing) {
      combinedMap.set(dedupKey, {
        ...item,
        id: item.id || meta?.id,
        flag: item.flag || meta?.flag,
        referenceRange: item.referenceRange || meta?.referenceRange,
        reportDate: normDate.isoDate,
        displayDate: normDate.displayDate,
        category: std.category,
        panelOrStudy: item.panelOrStudy || std.panelOrStudy,
        parameterName: std.displayName,
        valueOrImpression: cleanVal,
      });
    } else if (std.category === 'imaging') {
      combinedMap.set(dedupKey, {
        ...existing,
        valueOrImpression: mergeImagingValueStrings(existing.valueOrImpression, cleanVal),
      });
    } else if (
      std.canonicalKey === 'lab_urine_rm' &&
      !existing.valueOrImpression.toLowerCase().includes(cleanVal.toLowerCase())
    ) {
      combinedMap.set(dedupKey, {
        ...existing,
        valueOrImpression: `${existing.valueOrImpression}, ${cleanVal}`,
      });
    }
  }

  return Array.from(combinedMap.values());
}

/**
 * Strips any auto-generated placeholder OPD/UHID numbers (e.g. "OPD-1111-01", "OPD-01", "UHID-2026-1234")
 * so OPD/UHID is ONLY populated when explicitly written on the sheet or entered by the doctor.
 */
export function cleanExplicitOpdNo(rawOpd?: string): string {
  if (!rawOpd) return '';
  const trimmed = String(rawOpd).trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (
    lower === '-' ||
    lower === '--' ||
    lower === '—' ||
    lower === 'n/a' ||
    lower === 'na' ||
    lower === 'none' ||
    lower === 'nil' ||
    lower === 'opd-01' ||
    /^opd-\d{4}-\d{1,3}$/i.test(trimmed) ||
    /^uhid-\d{4}-\d{4}$/i.test(trimmed) ||
    /^uhid-\d{4}$/i.test(trimmed)
  ) {
    return '';
  }
  return trimmed;
}

/**
 * Separates salutation (Mr., Mrs., Ms., Dr., Master, etc.) from patientName so patientName
 * never contains a duplicate salutation prefix (e.g., "MRS. MRS. SUSHILA DEVI").
 */
export function sanitizeSalutationAndPatientName(
  rawSalutation?: string,
  rawPatientName?: string
): { salutation: string; patientName: string } {
  let cleanName = String(rawPatientName || '').trim();
  let detectedSal = String(rawSalutation || '').trim();

  // Repeatedly strip leading salutations from patientName (handles "MRS. MRS. SUSHILA DEVI" -> "SUSHILA DEVI")
  const salRegex = /^(mr|mrs|ms|miss|dr|master|shri|smt|baby)\.?\s+/i;
  while (salRegex.test(cleanName)) {
    const match = cleanName.match(salRegex);
    if (match && !detectedSal) {
      detectedSal = match[1];
    }
    cleanName = cleanName.replace(salRegex, '').trim();
  }

  // Also strip duplicate salutation inside rawSalutation itself if present
  while (salRegex.test(detectedSal)) {
    const match = detectedSal.match(salRegex);
    if (match) {
      detectedSal = match[1];
      break;
    }
  }

  let normalizedSal = '';
  if (detectedSal) {
    const lowerSal = detectedSal.toLowerCase().replace(/\.+$/, '').trim();
    if (lowerSal === 'mr' || lowerSal === 'shri') normalizedSal = 'Mr.';
    else if (lowerSal === 'mrs' || lowerSal === 'smt') normalizedSal = 'Mrs.';
    else if (lowerSal === 'ms' || lowerSal === 'miss') normalizedSal = 'Ms.';
    else if (lowerSal === 'dr') normalizedSal = 'Dr.';
    else if (lowerSal === 'master') normalizedSal = 'Master';
    else if (lowerSal === 'baby') normalizedSal = 'Baby';
    else normalizedSal = detectedSal;
  }

  return {
    salutation: normalizedSal,
    patientName: cleanName || String(rawPatientName || '').trim(),
  };
}

/**
 * Formats patient full name with salutation while guaranteeing the salutation never appears twice
 */
export function formatPatientNameWithSalutation(
  salutation?: string,
  patientName?: string
): string {
  const { salutation: cleanSal, patientName: cleanName } = sanitizeSalutationAndPatientName(
    salutation,
    patientName
  );
  if (!cleanName) return cleanSal;
  return cleanSal ? `${cleanSal} ${cleanName}` : cleanName;
}

/**
 * Finds all consultations belonging to the same patient (matching normalized name, explicit UHID/OPD no, or phone number)
 */
export function findMatchingPatientConsultations(
  targetConsultation: Consultation,
  allConsultations: Consultation[] = []
): Consultation[] {
  const targetNameKey = normalizePatientKeyForInv(targetConsultation.patientName);
  const isGenericName =
    !targetNameKey ||
    ['patient', 'opd patient', 'unknown', 'unnamed', 'untitled'].includes(targetNameKey) ||
    /^opd patient #\d+$/i.test(targetNameKey);

  const targetOpd = cleanExplicitOpdNo(targetConsultation.opdNo).toLowerCase();
  const isMeaningfulOpd = targetOpd.length >= 3;

  const normalizePhone = (p?: string) => (p || '').replace(/\D+/g, '').slice(-10);
  const targetPhone = normalizePhone(
    targetConsultation.phoneNumber || targetConsultation.contactNumber
  );
  const isMeaningfulPhone = targetPhone.length === 10;

  const matched: Consultation[] = [targetConsultation];
  for (const c of allConsultations) {
    if (!c || c.id === targetConsultation.id) continue;
    const cNameKey = normalizePatientKeyForInv(c.patientName);
    const cIsGeneric =
      !cNameKey ||
      ['patient', 'opd patient', 'unknown', 'unnamed', 'untitled'].includes(cNameKey) ||
      /^opd patient #\d+$/i.test(cNameKey);
    const cOpd = cleanExplicitOpdNo(c.opdNo).toLowerCase();
    const cPhone = normalizePhone(c.phoneNumber || c.contactNumber);

    // If both records have distinct non-generic patient names, they are different patients!
    const namesConflict = Boolean(!isGenericName && !cIsGeneric && targetNameKey !== cNameKey);
    if (namesConflict) continue;

    const matchesName = Boolean(!isGenericName && !cIsGeneric && targetNameKey === cNameKey);
    const matchesOpd = Boolean(isMeaningfulOpd && cOpd && targetOpd === cOpd);
    const matchesPhone = Boolean(isMeaningfulPhone && cPhone && targetPhone === cPhone);

    if (matchesName || matchesOpd || matchesPhone) {
      matched.push(c);
    }
  }
  return matched;
}

/**
 * Builds a Date-Wise Comparison Table for a consultation.
 * By default (`includePatientHistory = false`), it ONLY uses the investigations recorded in `targetConsultation`
 * itself (which may span multiple dates noted in the left margin, such as 22/11 and 8/11) so that values from
 * other consultations in the database are NEVER unexpectedly added into the current sheet.
 */
export function buildDateWiseInvestigationTable(
  targetConsultation: Consultation,
  allConsultations: Consultation[] = [],
  includePatientHistory = false,
  maxDates?: number
): DateWiseInvestigationTableData {
  const patientConsultations = includePatientHistory
    ? findMatchingPatientConsultations(targetConsultation, allConsultations)
    : [targetConsultation];

  // Sort patient consultations chronologically so newer records take precedence on same-date lab edits
  const sortedConsultations = [...patientConsultations].sort((a, b) =>
    (a.date || '').localeCompare(b.date || '')
  );

  const rawItems: InvestigationItem[] = [];
  const allDatesMap = new Map<string, string>(); // isoDate -> displayDate

  for (const c of sortedConsultations) {
    const cItems = getInvestigationItemsForConsultation(c);
    for (const item of cItems) {
      const normDate = normalizeInvestigationDate(item.reportDate || item.displayDate, c.date);
      allDatesMap.set(normDate.isoDate, normDate.displayDate);
      rawItems.push({
        ...item,
        reportDate: normDate.isoDate,
        displayDate: normDate.displayDate,
      });
    }
  }

  // Sort all distinct dates chronologically; keep ALL dates in records unless an explicit maxDates cap (e.g. 5 for printing) is passed
  const allSortedDates = Array.from(allDatesMap.entries())
    .map(([isoDate, displayDate]) => ({ isoDate, displayDate }))
    .sort((a, b) => a.isoDate.localeCompare(b.isoDate));

  const dates =
    typeof maxDates === 'number' && maxDates > 0 && allSortedDates.length > maxDates
      ? allSortedDates.slice(-maxDates)
      : allSortedDates;

  const allowedIsoDates = new Set(dates.map((d) => d.isoDate));

  const allItems: InvestigationItem[] = [];
  const rowMap = new Map<string, DateWiseInvestigationRow>();
  const labDateSet = new Set<string>();

  for (const item of rawItems) {
    if (!allowedIsoDates.has(item.reportDate)) continue;

    const repaired = repairMisSplitParameterAndValue(
      item.parameterName,
      item.valueOrImpression
    );
    const std = standardizeParameterName(repaired.paramName, item.category, item.panelOrStudy);
    if (
      isSurgicalOrClinicalProcedure(repaired.paramName) ||
      (std.category !== 'imaging' && shouldSkipLabParameter(repaired.paramName, repaired.valText))
    ) {
      continue;
    }

    const cleanVal = sanitizeInvestigationValue(
      std.canonicalKey,
      repaired.valText,
      repaired.paramName
    );
    if (!cleanVal) continue;

    if (std.category === 'lab') {
      labDateSet.add(item.reportDate);
    }

    allItems.push({
      ...item,
      category: std.category,
      parameterName: std.displayName,
      valueOrImpression: cleanVal,
    });

    let row = rowMap.get(std.canonicalKey);
    if (!row) {
      row = {
        key: std.canonicalKey,
        parameterName: std.displayName,
        category: std.category,
        panelOrStudy: item.panelOrStudy || std.panelOrStudy,
        valuesByDate: {},
        dateCount: 0,
      };
      rowMap.set(std.canonicalKey, row);
    }

    const existingCell = row.valuesByDate[item.reportDate];
    if (std.category === 'imaging' && existingCell?.value) {
      row.valuesByDate[item.reportDate] = {
        value: mergeImagingValueStrings(existingCell.value, cleanVal),
        flag: item.flag || existingCell.flag,
        referenceRange: item.referenceRange || existingCell.referenceRange,
      };
    } else if (!existingCell || item.id) {
      row.valuesByDate[item.reportDate] = {
        value: cleanVal,
        flag: item.flag,
        referenceRange: item.referenceRange,
      };
    }
  }

  const rows = Array.from(rowMap.values())
    .map((r) => ({
      ...r,
      dateCount: Object.keys(r.valuesByDate).length,
    }))
    .filter((r) => r.dateCount > 0)
    .sort((a, b) => {
      if (a.category !== b.category) {
        return a.category === 'lab' ? -1 : 1;
      }
      return a.parameterName.localeCompare(b.parameterName);
    });

  const labRows = rows.filter((r) => r.category === 'lab');
  const imagingRows = rows.filter((r) => r.category === 'imaging');

  const labDates =
    labDateSet.size > 0
      ? dates.filter((d) => labDateSet.has(d.isoDate))
      : dates;

  // Build chronological imagingTimeline entries (one below the other with dates)
  const imagingTimeline: ImagingTimelineEntry[] = [];
  for (const d of dates) {
    for (const imgRow of imagingRows) {
      const cell = imgRow.valuesByDate[d.isoDate];
      if (cell && cell.value) {
        const bullets = splitImagingIntoBullets(cell.value);
        imagingTimeline.push({
          key: `${imgRow.key}__${d.isoDate}`,
          isoDate: d.isoDate,
          displayDate: d.displayDate,
          studyName: imgRow.parameterName,
          bullets: bullets.length > 0 ? bullets : [cell.value],
          rawText: cell.value,
          flag: cell.flag,
        });
      }
    }
  }

  const multiDateRows = rows.filter((r) => r.dateCount > 1);
  const hasSimilarTestsAcrossDates = multiDateRows.length > 0 || dates.length > 1;

  return {
    dates,
    labDates,
    rows,
    labRows,
    imagingRows,
    imagingTimeline,
    multiDateRows,
    hasSimilarTestsAcrossDates,
    allItems,
  };
}

/**
 * Formats an array of `InvestigationItem`s into a clean, readable date-grouped clinical string
 * ("DD/MM/YY: Test Name - Value ; Test Name 2 - Value 2") for `labTestsAndImaging`.
 * Keeps ALL dates by default for records; optionally caps to the latest `maxDates` when specified (e.g. for printing).
 */
export function formatInvestigationItemsToText(
  items: InvestigationItem[],
  maxDates?: number
): string {
  if (!items || items.length === 0) return '';

  const byDate = new Map<string, { displayDate: string; entries: string[] }>();
  for (const item of items) {
    if (!item.valueOrImpression?.trim()) continue;
    const repaired = repairMisSplitParameterAndValue(
      item.parameterName,
      item.valueOrImpression
    );
    const std = standardizeParameterName(repaired.paramName, item.category, item.panelOrStudy);
    if (
      isSurgicalOrClinicalProcedure(repaired.paramName) ||
      (std.category !== 'imaging' && shouldSkipLabParameter(repaired.paramName, repaired.valText))
    ) {
      continue;
    }

    const normDate = normalizeInvestigationDate(item.reportDate || item.displayDate);
    const cleanVal = sanitizeInvestigationValue(
      std.canonicalKey,
      repaired.valText,
      repaired.paramName
    );
    if (!cleanVal) continue;

    if (!byDate.has(normDate.isoDate)) {
      byDate.set(normDate.isoDate, { displayDate: normDate.displayDate, entries: [] });
    }
    const group = byDate.get(normDate.isoDate)!;
    const entryStr = `${std.displayName} - ${cleanVal}`;
    if (!group.entries.some((e) => e.toLowerCase() === entryStr.toLowerCase())) {
      group.entries.push(entryStr);
    }
  }

  // Sort chronologically; keep all dates unless an explicit maxDates limit is provided
  const sortedChronological = Array.from(byDate.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  );
  const finalDates =
    typeof maxDates === 'number' && maxDates > 0 && sortedChronological.length > maxDates
      ? sortedChronological.slice(-maxDates)
      : sortedChronological;

  return finalDates
    .map(([, group]) => `${group.displayDate}: ${group.entries.join(' ; ')}`)
    .join(' | ');
}

/**
 * Normalizes and merges a consultation's own investigations along with any newly uploaded report items (`newItems`),
 * capping the result to at most the latest 5 dates (`MAX_PATIENT_INVESTIGATION_DATES = 5`).
 * IMPORTANT: Never injects `historicalItems` from other consultations in `allConsultations` into `consultation.labTestsAndImaging`
 * unless `includePatientHistory = true` is explicitly requested.
 */
export function mergeInvestigationsIntoConsultation(
  consultation: Consultation,
  newItems: InvestigationItem[] = [],
  allConsultations: Consultation[] = [],
  includePatientHistory = false
): { investigationRecords: InvestigationItem[]; labTestsAndImaging: string } {
  const historicalItems: InvestigationItem[] = [];
  if (includePatientHistory && allConsultations.length > 0) {
    const patientVisits = findMatchingPatientConsultations(consultation, allConsultations);
    const sortedVisits = [...patientVisits].sort((a, b) =>
      (a.date || '').localeCompare(b.date || '')
    );
    for (const v of sortedVisits) {
      if (v.id === consultation.id) continue;
      historicalItems.push(...getInvestigationItemsForConsultation(v));
    }
  }

  const currentItems = getInvestigationItemsForConsultation(consultation);
  // Only append `newItems` if they are distinct from `consultation.investigationRecords` (e.g. newly scanned lab report photos)
  const isSameArrayRef = newItems === consultation.investigationRecords;
  const extraNewItems = isSameArrayRef ? [] : newItems;

  const mergedMap = new Map<string, InvestigationItem>();

  for (const item of [...historicalItems, ...currentItems, ...extraNewItems]) {
    if (!item.valueOrImpression?.trim()) continue;
    const repaired = repairMisSplitParameterAndValue(
      item.parameterName,
      item.valueOrImpression
    );
    const std = standardizeParameterName(repaired.paramName, item.category, item.panelOrStudy);
    if (
      isSurgicalOrClinicalProcedure(repaired.paramName) ||
      (std.category !== 'imaging' && shouldSkipLabParameter(repaired.paramName, repaired.valText))
    ) {
      continue;
    }

    const normDate = normalizeInvestigationDate(
      item.reportDate || item.displayDate,
      consultation.date
    );
    const cleanVal = sanitizeInvestigationValue(
      std.canonicalKey,
      repaired.valText,
      repaired.paramName
    );
    if (!cleanVal) continue;

    const key = `${normDate.isoDate}__${std.canonicalKey}`;
    const existing = mergedMap.get(key);
    if (existing && std.category === 'imaging') {
      mergedMap.set(key, {
        ...existing,
        valueOrImpression: mergeImagingValueStrings(existing.valueOrImpression, cleanVal),
      });
    } else {
      mergedMap.set(key, {
        ...item,
        id: item.id || `inv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        reportDate: normDate.isoDate,
        displayDate: normDate.displayDate,
        category: std.category,
        panelOrStudy: item.panelOrStudy || std.panelOrStudy,
        parameterName: std.displayName,
        valueOrImpression: cleanVal,
      });
    }
  }

  const allMerged = Array.from(mergedMap.values()).sort((a, b) =>
    (a.reportDate || '').localeCompare(b.reportDate || '')
  );

  // Preserve ALL investigation dates in stored records (the 5-date cap applies ONLY during printing/PDF export)
  const formattedText = formatInvestigationItemsToText(allMerged);
  const sanitizedFallbackLabText = sanitizeLabTestsAndImagingText(
    consultation.labTestsAndImaging
  ).cleanLabTestsAndImaging;

  // When no external newItems or historicalItems are being merged in, keep `sanitizedFallbackLabText`
  // if it contains any investigation clauses so that no left-margin investigation note is ever dropped
  // just because a free-text clause didn't match a rigid key-value regex!
  const shouldKeepRawSheetLabText =
    extraNewItems.length === 0 &&
    historicalItems.length === 0 &&
    Boolean(sanitizedFallbackLabText);

  return {
    investigationRecords: allMerged,
    labTestsAndImaging: shouldKeepRawSheetLabText
      ? sanitizedFallbackLabText
      : formattedText || sanitizedFallbackLabText || '',
  };
}

/**
 * Normalizes a Yes/No checklist value without stripping '-' or 'nil' first.
 */
export function normalizeHistoryYesNo(val?: string | number | null): 'Yes' | 'No' | '' {
  if (val === undefined || val === null) return '';
  const s = String(val).trim().toLowerCase().replace(/[.!?]+$/, '').trim();
  if (!s) return '';
  if (
    ['yes', 'y', '+', '(+)', '(+ve)', 'present', 'positive', 'true', '1', '✓', '✔'].includes(s) ||
    s.startsWith('yes') ||
    s.startsWith('present')
  ) {
    return 'Yes';
  }
  if (
    ['no', 'n', '-', '--', '—', '(-)', '(-ve)', 'absent', 'negative', 'nil', 'none', 'false', '0', '✗', '✘'].includes(
      s
    ) ||
    s.startsWith('no ') ||
    s === 'no' ||
    s.startsWith('absent') ||
    s.startsWith('nil')
  ) {
    return 'No';
  }
  return '';
}

/**
 * Normalizes an IPSS symptom value so negative shorthand ('-', 'nil', 'none', '0', '(-)') becomes 'No'
 * and positive shorthand ('+', '(+)', 'yes') becomes 'Yes', while preserving frequency counts ('2-3x', 'ok', '+ 3/5').
 */
export function normalizeIpssFieldValue(
  val?: string | number | null,
  isNumericScoreField = false
): string {
  if (val === undefined || val === null) return '';
  const raw = String(val).trim();
  if (!raw) return '';
  const lower = raw.toLowerCase().replace(/[.!?]+$/, '').trim();
  if (
    [
      'undefined',
      'null',
      'n/a',
      'na',
      'unknown',
      'not mentioned',
      'not recorded',
      'not specified',
      'not available',
      'not applicable',
      'not documented',
      'unspecified',
    ].includes(lower) ||
    /^(?:not|none)\s+(?:(?:explicitly|clearly|specifically)\s+)?(?:stated|noted|mentioned|recorded|documented|specified|written|provided).*$/i.test(
      lower
    )
  ) {
    return '';
  }

  if (isNumericScoreField) {
    if (
      ['-', '--', '—', '(-)', '(-ve)', 'nil', 'none', 'absent', 'negative', 'no', 'n', 'yes', 'y', '+', '(+)'].includes(
        lower
      ) ||
      !/\d/.test(raw)
    ) {
      return '';
    }
    const scoreMatch = raw.match(/\b(\d{1,2}(?:\s*\/\s*(?:35|5|6))?)\b/);
    return scoreMatch ? scoreMatch[1].replace(/\s+/g, '') : '';
  }

  if (
    [
      '-',
      '--',
      '—',
      '(-)',
      '(-ve)',
      'nil',
      'none',
      'absent',
      'negative',
      'no',
      'n',
      '0',
      'ok',
      'okay',
      'nl',
      '(nl)',
      'normal',
      'no soie',
      'soie (-)',
      'soie -',
    ].includes(lower)
  ) {
    return 'No';
  }
  if (['(+) c ui', '+ c ui', '+c ui', 'yes c ui', 'with ui', 'yes with ui'].includes(lower)) {
    return 'Yes (with UI)';
  }
  if (['+', '(+)', '(+ve)', 'yes', 'y', 'present', 'positive', '(+) soie', '+ soie'].includes(lower)) {
    return 'Yes';
  }

  // Strip leaked AI reasoning commentary (e.g. "3/5 (Yes, + 3/5 written as U - + 3/5, interpreting as... I will map to 'Yes (3/5)')")
  if (
    raw.length > 22 ||
    /\b(written\s+as|interpret(?:ing|ed)?|based\s+on|instructions|marking\s+as|notation|prompt\s+asks|will\s+map|map\s+to|note\s+says|context|assuming)\b/i.test(
      raw
    )
  ) {
    const mappedQuote = raw.match(/(?:map\s+to|mark(?:ing)?\s+as|output)\s+['"]([^'"]{1,20})['"]/i);
    if (mappedQuote && mappedQuote[1]) {
      return mappedQuote[1].trim();
    }
    const gradeMatch = raw.match(/\b([1-5]\s*\/\s*5)\b/);
    if (gradeMatch && gradeMatch[1]) {
      return `Yes (${gradeMatch[1].replace(/\s+/g, '')})`;
    }
    const freqMatch = raw.match(/\b(\d+\s*[-–]\s*\d+\s*x?|\d+\s*x)\b/i);
    if (freqMatch && freqMatch[1]) {
      const f = freqMatch[1].replace(/\s+/g, '');
      return f.endsWith('x') ? f : `${f}x`;
    }
    if (/\b(?:with\s+ui|urge\s+incontinence|\(\+\)\s*(?:c|with)\s*ui)\b/i.test(raw)) {
      return 'Yes (with UI)';
    }
    if (/\bhesitancy\b/i.test(raw)) {
      return 'Yes (Hesitancy)';
    }
    const beforeParen = raw.split(/[(\n,]/)[0].trim();
    if (/^\+?\s*[1-5]\s*\/\s*5$/.test(beforeParen)) {
      return `Yes (${beforeParen.replace(/^\+\s*/, '').replace(/\s+/g, '')})`;
    }
    if (/^(?:yes|\+|present|positive)\b/i.test(beforeParen)) return 'Yes';
    if (/^(?:no|\-|nil|absent|negative|ok|nl|normal)\b/i.test(beforeParen)) return 'No';
    return beforeParen.slice(0, 18) || 'Yes';
  }

  if (/^\+\s*([1-5]\s*\/\s*5)$/.test(raw)) {
    return `Yes (${raw.replace(/^\+\s*/, '').replace(/\s+/g, '')})`;
  }
  if (/^[1-5]\s*\/\s*5$/.test(raw)) {
    return `Yes (${raw.replace(/\s+/g, '')})`;
  }
  if (/^\(\+\)\s*([1-5]\s*\/\s*5)$/.test(raw)) {
    const m = raw.match(/([1-5]\s*\/\s*5)/);
    return `${m![1].replace(/\s+/g, '')} (+)`;
  }
  if (/^([1-5]\s*\/\s*5)\s*\(?\+\)?$/.test(raw)) {
    const m = raw.match(/([1-5]\s*\/\s*5)/);
    return `${m![1].replace(/\s+/g, '')} (+)`;
  }
  if (/\b(?:\(\+\)\s*(?:c|with)\s*ui|\+\s*(?:c|with)\s*ui|with\s+ui)\b/i.test(raw)) {
    return 'Yes (with UI)';
  }

  return raw;
}

/**
 * Returns true ONLY if the consultation actually contains recorded IPSS values
 * (so we never render or print an IPSS table when IPSS was not mentioned on the OPD sheet).
 */
export function hasIpssData(c?: Partial<Consultation> | null): boolean {
  const ip = c?.ipss;
  if (!ip || typeof ip !== 'object') return false;
  return Boolean(
    normalizeIpssFieldValue(ip.frequency) ||
      normalizeIpssFieldValue(ip.urgency) ||
      normalizeIpssFieldValue(ip.nocturia) ||
      normalizeIpssFieldValue(ip.poorFlow || ip.poorStream) ||
      normalizeIpssFieldValue(ip.intermittency) ||
      normalizeIpssFieldValue(ip.straining) ||
      normalizeIpssFieldValue(ip.incompleteEvacuation) ||
      normalizeIpssFieldValue(ip.hesitancy) ||
      normalizeIpssFieldValue(ip.secondVoid) ||
      normalizeIpssFieldValue(ip.postVoidDribble) ||
      normalizeIpssFieldValue(ip.qualityOfLife, true) ||
      normalizeIpssFieldValue(ip.scoreTotal, true)
  );
}

/**
 * Sanitizes vitals object and recovers clean BP, Pulse, Weight, SpO2, Temp values
 * when OCR leaked chain-of-thought reasoning or stacked vitals into a single field (such as `weight`).
 */
export function sanitizeVitalsObject(rawVitals?: Consultation['vitals']): NonNullable<Consultation['vitals']> {
  const v = rawVitals || {};
  let bp = String(v.bp || '').trim();
  let pulse = String(v.pulse || '').trim();
  let temp = String(v.temp || '').trim();
  let height = String(v.height || '').trim();
  let weight = String(v.weight || '').trim();
  let bmi = String(v.bmi || '').trim();
  let waist = String(v.waist || '').trim();
  let hip = String(v.hip || '').trim();
  let waistHipRatio = String(v.waistHipRatio || '').trim();
  let spo2 = String(v.spo2 || '').trim();

  const combinedText = [bp, pulse, weight, spo2, temp].join(' | ');
  const hasLeakedCommentary =
    weight.length > 18 ||
    bp.length > 18 ||
    pulse.length > 15 ||
    spo2.length > 15 ||
    /\b(wait|corrected|input|interpretation|note:|schema|assuming|mapped as|appear to be|provided image|handwriting|shorthand)\b/i.test(
      combinedText
    ) ||
    /[()]/.test(weight) ||
    /\d+\s*\/\s*\d+/.test(weight);

  if (hasLeakedCommentary) {
    // Extract BP (e.g. 126/70 or 130/99) from leaked text
    const bpMatches = Array.from(
      combinedText.matchAll(/\b([89]\d|1\d{2}|2[0-4]\d)\s*\/\s*([4-9]\d|1[0-3]\d)\b/g)
    );
    if (bpMatches.length > 0) {
      // Prefer a BP match that comes from the leaked weight/commentary over a generic 120/80 placeholder if weight had explicit BP
      const fromWeightBp = weight.match(/\b([89]\d|1\d{2}|2[0-4]\d)\s*\/\s*([4-9]\d|1[0-3]\d)\b/);
      if (fromWeightBp) {
        bp = `${fromWeightBp[1]}/${fromWeightBp[2]}`;
      } else {
        const m = bpMatches[0];
        bp = `${m[1]}/${m[2]}`;
      }
    }

    // Extract Pulse (e.g. "pulse 86", "P - 86", "pulse: 74", "74 (pulse?)")
    const pulseExplicit =
      weight.match(/(?:pulse|\bp\b)\s*[:=\-'"]*\s*(\d{2,3})\b/i) ||
      weight.match(/\b(\d{2,3})\s*\(\s*pulse/i) ||
      weight.match(/(?:kg|kgy|ky)\s*\/\s*(\d{2,3})\b/i) ||
      combinedText.match(/(?:pulse|\bp\b)\s*[:=\-'"]*\s*(\d{2,3})\b/i);
    if (pulseExplicit && pulseExplicit[1]) {
      const pNum = parseInt(pulseExplicit[1], 10);
      if (pNum >= 40 && pNum <= 220) {
        pulse = String(pNum);
      }
    }

    // Extract SpO2 (e.g. "spo2 99%", "SpO2 - 99%")
    const spo2Explicit =
      combinedText.match(/(?:spo2|sp02)\s*[:=\-'"]*\s*(\d{2,3})\s*%?/i) ||
      weight.match(/\b(9\d|100)\s*%/);
    if (spo2Explicit && spo2Explicit[1]) {
      const sNum = parseInt(spo2Explicit[1], 10);
      if (sNum >= 70 && sNum <= 100) {
        spo2 = `${sNum}%`;
      }
    }

    // Extract Weight (e.g. "69 kg", "58.8 kg", "69kgy")
    const wtExplicit =
      weight.match(/\b(\d{1,3}(?:\.\d+)?)\s*(?:kg|kgy|ky|kgs)\b/i) ||
      weight.match(/(?:wt|weight)\s*[:=\-'"]*\s*(\d{1,3}(?:\.\d+)?)\b/i) ||
      combinedText.match(/\b(\d{1,3}(?:\.\d+)?)\s*(?:kg|kgy|ky|kgs)\b/i);
    if (wtExplicit && wtExplicit[1]) {
      const wNum = parseFloat(wtExplicit[1]);
      if (wNum >= 2 && wNum <= 250) {
        weight = `${wtExplicit[1]} kg`;
      }
    }
  }

  // Final concise cleanup for each vital field so no parenthetical commentary ever remains
  const cleanSingleVital = (val: string, type: 'bp' | 'pulse' | 'weight' | 'spo2' | 'temp' | 'other'): string => {
    if (!val) return '';
    const trimmed = val.trim();
    if (!trimmed || ['-', '--', '—', 'nil', 'none', 'n/a', 'na'].includes(trimmed.toLowerCase())) return '';
    if (type === 'bp') {
      const m = trimmed.match(/\b([789]\d|1\d{2}|2[0-4]\d)\s*\/\s*([4-9]\d|1[0-4]\d)\b/);
      return m ? `${m[1]}/${m[2]}` : trimmed.split(/[(\n]/)[0].trim().slice(0, 20);
    }
    if (type === 'pulse') {
      const m = trimmed.match(/\b(\d{2,3})\b/);
      return m ? m[1] : trimmed.split(/[(\n]/)[0].trim().slice(0, 15);
    }
    if (type === 'weight') {
      const m = trimmed.match(/\b(\d{1,3}(?:\.\d+)?)\s*(?:kg|kgy|ky|kgs)?\b/i);
      return m ? `${m[1]} kg` : trimmed.split(/[(\n]/)[0].trim().slice(0, 15);
    }
    if (type === 'spo2') {
      const m = trimmed.match(/\b(\d{2,3})\s*%?/);
      return m ? `${m[1]}%` : trimmed.split(/[(\n]/)[0].trim().slice(0, 10);
    }
    return trimmed.split(/[(\n]/)[0].trim().slice(0, 25);
  };

  return {
    bp: cleanSingleVital(bp, 'bp'),
    pulse: cleanSingleVital(pulse, 'pulse'),
    temp: cleanSingleVital(temp, 'temp'),
    height: cleanSingleVital(height, 'other'),
    weight: cleanSingleVital(weight, 'weight'),
    bmi: cleanSingleVital(bmi, 'other'),
    waist: cleanSingleVital(waist, 'other'),
    hip: cleanSingleVital(hip, 'other'),
    waistHipRatio: cleanSingleVital(waistHipRatio, 'other'),
    spo2: cleanSingleVital(spo2, 'spo2'),
  };
}

/**
 * Normalizes prescription duration strings ("x 3m", "x3m", "15d", "5/7", "2/52", "1/12", "cont", "SOS").
 */
export function normalizeRxDurationValue(rawDur?: string | number | null): string {
  if (rawDur === undefined || rawDur === null) return '';
  let d = String(rawDur).trim();
  if (!d) return '';
  const lower = d.toLowerCase().replace(/[.!?]+$/, '').trim();
  if (
    [
      'undefined',
      'null',
      'none',
      'n/a',
      'na',
      '-',
      '--',
      '—',
      'unknown',
      'not mentioned',
      'not recorded',
      'not specified',
      'not available',
      'not applicable',
      'not documented',
      'unspecified',
      'nil',
    ].includes(lower) ||
    /^(?:not|none)\s+(?:(?:explicitly|clearly|specifically)\s+)?(?:stated|noted|mentioned|recorded|documented|specified|written|provided).*$/i.test(
      lower
    )
  ) {
    return '';
  }

  const hadExplicitMultiplier = /^(?:duration\s*[:\-]\s*|(?:x|×|\*)\s*|for\s+)/i.test(d);
  d = d.replace(/^(?:duration\s*[:\-]\s*|(?:x|×|\*)\s*[-–]?\s*|for\s+)/i, '').trim();
  d = d.replace(/^[\(\[]+|[\)\]]+$/g, '').trim();
  if (!d) return '';

  if (/^(?:1\s*\/\s*2|½|0\.5)\s*(?:months?|mths?|mons?|mos?|m(?!g|l|c|m|eq|ol|in))\b\.?/i.test(d)) {
    return '15 Days';
  }

  const slashDur = d.match(/^(\d+)\s*\/\s*(7|52|12)(?:\b|[\s.,;(\-]|$)/);
  if (slashDur) {
    const n = parseInt(slashDur[1], 10);
    const unit = slashDur[2];
    if (n > 0 && n <= 365) {
      if (unit === '7') return n === 1 ? '1 Day' : `${n} Days`;
      if (unit === '52') return n === 1 ? '1 Week' : `${n} Weeks`;
      if (unit === '12') return n === 1 ? '1 Month' : `${n} Months`;
    }
  }

  const unitMatch = d.match(
    /^(\d+(?:\.\d+)?(?:\s*[-–]\s*\d+(?:\.\d+)?)?)\s*(years?|yrs?|y|months?|mths?|mons?|mos?|m(?!g|l|c|m|eq|ol|in)|weeks?|wks?|wk|w|days?|d)(?:\b|\.|[\s,;(\-]|$)/i
  );
  if (unitMatch) {
    const num = unitMatch[1].replace(/\s+/g, '');
    const u = unitMatch[2].toLowerCase();
    const isOne = num === '1';
    if (u.startsWith('y')) return isOne ? '1 Year' : `${num} Years`;
    if (u.startsWith('m')) return isOne ? '1 Month' : `${num} Months`;
    if (u.startsWith('w')) return isOne ? '1 Week' : `${num} Weeks`;
    if (u.startsWith('d')) return isOne ? '1 Day' : `${num} Days`;
  }

  if (hadExplicitMultiplier) {
    const bareNum = d.match(/^(\d+(?:\s*[-–]\s*\d+)?)\s*\.?$/);
    if (bareNum) {
      const firstN = parseInt(bareNum[1], 10);
      if (firstN >= 1 && firstN <= 90) {
        const cleanNum = bareNum[1].replace(/\s+/g, '');
        return cleanNum === '1' ? '1 Day' : `${cleanNum} Days`;
      }
    }
  }

  if (/^(?:cont\.?|contd\.?|continue|continuous|long\s*term|lifelong|regular(?:ly)?)(?:\b|\.)/i.test(d)) {
    return 'Continue';
  }
  if (/^(?:sos|prn|when\s+required|as\s+needed)(?:\b|\.)/i.test(d)) {
    return 'SOS';
  }
  if (/^(?:stat|single\s+dose)(?:\b|\.)/i.test(d)) {
    return 'Stat';
  }

  if (/^\d+(?:\.\d+)?\s*(?:mg|g|gm|mcg|ml|iu|%|tab|cap)/i.test(d)) {
    return '';
  }

  return d;
}

/**
 * Sanitizes a single prescription item:
 * 1. Normalizes shorthand durations ("x 3m", "15d", "x 10", "5/7", "2/52", "1/12") and recovers `duration` if embedded in `frequency`/`when`/`notes`/`medicine`.
 * 2. Strips AI commentary from `when` and `notes`.
 * 3. Deduplicates `medicine` and `dosage` so `T. Veltam 0.2` + `0.2 mg` doesn't render as `T. Veltam 0.2 0.2 mg`.
 */
export function sanitizePrescriptionItem(rx: any): any {
  if (!rx || typeof rx !== 'object') return rx;
  let medicine = String(rx.medicine || rx.drugName || '').trim();
  let dosage = String(rx.dosage || rx.dosageStrength || '').trim();
  let when = String(rx.when || rx.timing || '').trim();
  let frequency = String(rx.frequency || '').trim();
  let duration =
    normalizeRxDurationValue(rx.duration) ||
    normalizeRxDurationValue(rx.rawDurationText);
  let notes = String(rx.notes || rx.instructions || '').trim();

  // 1. Recover duration if embedded inside `frequency`, `notes`, `when`, or `medicine`
  const durTokenPattern =
    /(?:duration\s*[:\-]\s*|(?:^|[\s,(;/|\-])(?:(?:x|×|\*)\s*|for\s+))((?:1\s*\/\s*2|½|0\.5)\s*(?:months?|mths?|mons?|mos?|m(?!g|l|c|m|eq|ol|in))\b\.?|\d+(?:\.\d+)?(?:\s*[-–]\s*\d+(?:\.\d+)?)?\s*(?:\/\s*(?:7|52|12)|years?|yrs?|y|months?|mths?|mons?|mos?|m(?!g|l|c|m|eq|ol|in)|weeks?|wks?|wk|w|days?|d)\b\.?|cont\.?|contd\.?|continue)/i;
  const bareXNumPattern = /(?:^|[\s,(;/|])(?:x|×|\*)\s*(\d{1,2}(?:\s*[-–]\s*\d{1,2})?)\b(?!\s*(?:mg|g|gm|mcg|ml|iu|%|\/))/i;
  const slashDurPattern = /(?:^|[\s,(;/|])(\d+\s*\/\s*(?:7|52|12))\b/;
  const unprefixedUnitDurPattern =
    /(?:^|[\s,(\[;/|\-])(\d+(?:\.\d+)?(?:\s*[-–]\s*\d+(?:\.\d+)?)?\s*(?:years?|yrs?|months?|mths?|mons?|mos?|m(?!g|l|c|m|eq|ol|in)|weeks?|wks?|wk|w|days?|d))\b\.?(?:\)|\])?/i;

  if (!duration) {
    const extractFrom = (text: string, allowUnprefixedUnit: boolean): { extracted: string; cleaned: string } => {
      if (!text) return { extracted: '', cleaned: text };
      let m = text.match(durTokenPattern);
      let isBareX = false;
      if (!m) {
        m = text.match(bareXNumPattern);
        if (m) isBareX = true;
      }
      if (!m && allowUnprefixedUnit) {
        m = text.match(slashDurPattern) || text.match(unprefixedUnitDurPattern);
      }
      if (m && m[1]) {
        const norm = normalizeRxDurationValue(isBareX ? `x ${m[1]}` : m[1]);
        if (norm) {
          const cleaned = text
            .replace(m[0], ' ')
            .replace(/\s{2,}/g, ' ')
            .replace(/^[\s,;|\-–]+|[\s,;|\-–]+$/g, '')
            .trim();
          return { extracted: norm, cleaned };
        }
      }
      return { extracted: '', cleaned: text };
    };

    const fromFreq = extractFrom(frequency, true);
    if (fromFreq.extracted) {
      duration = fromFreq.extracted;
      if (fromFreq.cleaned) frequency = fromFreq.cleaned;
    }
    if (!duration) {
      const fromNotes = extractFrom(notes, true);
      if (fromNotes.extracted) {
        duration = fromNotes.extracted;
        notes = fromNotes.cleaned;
      }
    }
    if (!duration) {
      const fromWhen = extractFrom(when, true);
      if (fromWhen.extracted) {
        duration = fromWhen.extracted;
        if (fromWhen.cleaned) when = fromWhen.cleaned;
      }
    }
    if (!duration) {
      const fromMed = extractFrom(medicine, false);
      if (fromMed.extracted) {
        duration = fromMed.extracted;
        if (fromMed.cleaned) medicine = fromMed.cleaned;
      }
    }
  }

  // 2. Clean `when` (Timing) if it contains AI commentary or is overly long
  if (
    when.length > 25 ||
    /\b(implied|mapping|actually|standard|class of|specifically|as per|will map|will set|duration:|medicine:|dosage:)\b/i.test(
      when
    )
  ) {
    const lowerWhen = when.toLowerCase();
    if (lowerWhen.includes('bedtime') || /\bhs\b/.test(lowerWhen) || /^0\s*[-—]\s*0\s*[-—]\s*1/.test(frequency)) {
      when = 'Bedtime (HS)';
    } else if (lowerWhen.includes('before food') || lowerWhen.includes('empty stomach') || /\ba\/c\b/.test(lowerWhen)) {
      when = 'Before food (a/c)';
    } else if (lowerWhen.includes('afternoon') && /^0\s*[-—]\s*1\s*[-—]\s*0/.test(frequency)) {
      when = 'Afternoon (After food)';
    } else if (lowerWhen.includes('sos') || lowerWhen.includes('when required')) {
      when = 'SOS / When required';
    } else if (lowerWhen.includes('injection') || /\b(?:inj|iv|im)\b/.test(lowerWhen)) {
      when = 'IV / Injection';
    } else {
      when = 'After food (p/c)';
    }
  }

  // 3. Clean `notes` if it contains AI reasoning commentary
  if (
    notes &&
    (/\b(implied|mapping|actually|standard|class of|specifically|as per|will map|will set|duration:|medicine:|dosage:|wait,)\b/i.test(
      notes
    ) ||
      notes.length > 90)
  ) {
    notes = '';
  }

  // 4. Deduplicate `medicine` and `dosage` (e.g. medicine: "T. Veltam 0.2", dosage: "0.2 mg" or medicine: "T. Soliten 5mg", dosage: "5 mg")
  if (medicine && dosage) {
    const cleanDosage = dosage.trim();
    const dosageNumMatch = cleanDosage.match(/^(\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?)\s*(mg|g|gm|mcg|ml|iu|%)?$/i);
    if (dosageNumMatch) {
      const numPart = dosageNumMatch[1].replace(/\s+/g, '');
      const unitPart = dosageNumMatch[2] || '';
      const escapedNum = numPart.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const trailingRe = new RegExp(`\\s+${escapedNum}\\s*(?:${unitPart}|mg|g|gm|mcg|ml)?\\s*$`, 'i');
      if (trailingRe.test(medicine)) {
        medicine = medicine.replace(trailingRe, '').trim();
        if (unitPart) {
          dosage = `${numPart} ${unitPart}`;
        }
      }
    } else if (medicine.toLowerCase().endsWith(cleanDosage.toLowerCase())) {
      medicine = medicine.slice(0, medicine.length - cleanDosage.length).trim();
    }
  }

  // 5. Preserve real Myfos (Fosfomycin 3g sachet); only convert to Tab Mirago if paired with impossible 25/50 mg tablet strength
  if (
    (/\bmyfos\b/i.test(medicine) && /\b(?:25|50)\s*mg\b/i.test(`${medicine} ${dosage}`)) ||
    /\bmyfos\s*sat?chet\b.*\b(?:25|50)\s*mg\b/i.test(`${medicine} ${dosage}`)
  ) {
    const combinedDoseAndMed = `${medicine} ${dosage}`.toLowerCase();
    medicine = 'Tab Mirago';
    if (/\b50\s*(?:mg)?\b/.test(combinedDoseAndMed)) {
      dosage = '50 mg';
    } else if (/\b25\s*(?:mg)?\b/.test(combinedDoseAndMed)) {
      dosage = '25 mg';
    }
    if (/\b(?:stat|dissolve|empty\s+stomach|single\s+dose)\b/i.test(when)) {
      when = /^0\s*[-—]\s*0\s*[-—]\s*1/.test(frequency) ? 'Bedtime (HS)' : 'After food (p/c)';
    }
  }

  // 6. Correct 'Dilodal M - D' / 'Silodal M - D' / 'Silodol' / 'Dilodal' to 'Silodal D' / 'Silodal' while keeping written combinations as is
  if (/\b(?:silod[ao]l|dilod[ao]l)\b/i.test(medicine)) {
    medicine = medicine
      .replace(/\b(?:silod[ao]l|dilod[ao]l)\s*[-–—]?\s*m\s*[-–—]?\s*d\b/gi, 'Silodal D')
      .replace(/\b(?:silod[ao]l|dilod[ao]l)\s+md\b/gi, 'Silodal D')
      .replace(/\b(?:silodol|dilod[ao]l)\b/gi, 'Silodal')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  return {
    ...rx,
    medicine,
    dosage,
    when,
    frequency,
    duration,
    notes,
  };
}

/**
 * Enriches and normalizes `historyChecklist` (including Negative History) and `ipss` from both structured fields
 * and clinical text (`complaints`, `diagnosis`, `pastMedication`) so negative history and LUTS/IPSS scores are never dropped.
 */
export function enrichHistoryChecklistAndIpss(c: Consultation): {
  complaints: string;
  historyChecklist: NonNullable<Consultation['historyChecklist']>;
  ipss: NonNullable<Consultation['ipss']>;
} {
  const hc = c.historyChecklist || {};
  const ip = c.ipss || {};

  let complaints = String(c.complaints || c.chiefComplaints || '').trim();
  const diagnosis = String(c.diagnosis || '').trim();
  const pastMed = String(c.pastMedication || c.history || c.additionalHistory || '').trim();

  // If complaints is empty but diagnosis contains a symptom like "Burning micturition", populate complaints
  if (!complaints && /\b(burning\s+micturition|dysuria|flank\s+pain|hematuria|luts|poor\s+flow|urinary\s+retention|incontinence|scrotal\s+pain|testicular\s+pain)\b/i.test(diagnosis)) {
    const sympParts = diagnosis
      .split(/\s*\/\s*|\s*;\s*/)
      .filter((p) =>
        /\b(burning|dysuria|pain|hematuria|luts|poor\s+flow|retention|incontinence|frequency|urgency|nocturia)\b/i.test(p)
      );
    if (sympParts.length > 0) {
      complaints = sympParts.join('; ');
    }
  }

  const allClinicalText = `${complaints} ; ${diagnosis} ; ${pastMed}`;

  let burning = normalizeHistoryYesNo(hc.burning);
  let fever = normalizeHistoryYesNo(hc.fever);
  let hematuria = normalizeHistoryYesNo(hc.hematuria);
  let previousRenalCalculi = normalizeHistoryYesNo(hc.previousRenalCalculi);
  let previousSurgery = normalizeHistoryYesNo(hc.previousSurgery);
  let constipation: string = hc.constipation
    ? String(hc.constipation).toLowerCase().includes('hard') || String(hc.constipation).toLowerCase().includes('laxative')
      ? 'hard stools / on laxative'
      : normalizeHistoryYesNo(hc.constipation)
    : '';

  // Infer from clinical text when not already set
  if (!burning) {
    if (/\b(?:no|nil|absent|denies|without)\s+(?:h\/o\s+|c\/o\s+)?(?:burning|dysuria)\b|\bburning\s*[:\-]?\s*(?:no|nil|\(-\)|-)\b/i.test(allClinicalText)) {
      burning = 'No';
    } else if (/\b(?:burning(?:\s+micturition)?|dysuria)\b/i.test(allClinicalText)) {
      burning = 'Yes';
    }
  }

  if (!fever) {
    if (/\b(?:no|nil|absent|denies|without|afebrile)\s+(?:h\/o\s+|c\/o\s+)?fever\b|\bfever\s*[:\-]?\s*(?:no|nil|\(-\)|-)\b|\bafebrile\b/i.test(allClinicalText)) {
      fever = 'No';
    } else if (/\bfever\b/i.test(allClinicalText)) {
      fever = 'Yes';
    }
  }

  if (!hematuria) {
    if (/\b(?:no|nil|absent|denies|without)\s+(?:h\/o\s+|c\/o\s+)?(?:hematuria|haematuria|blood\s+in\s+urine)\b|\b(?:hematuria|haematuria)\s*[:\-]?\s*(?:no|nil|\(-\)|-)\b/i.test(allClinicalText)) {
      hematuria = 'No';
    } else if (/\b(?:hematuria|haematuria)\b/i.test(allClinicalText)) {
      hematuria = 'Yes';
    }
  }

  if (!previousRenalCalculi) {
    if (/\b(?:no|nil|absent)\s+(?:h\/o\s+)?(?:prev(?:ious)?\s+)?(?:renal\s+calculi|kidney\s+stone|stone\s+disease)\b/i.test(allClinicalText)) {
      previousRenalCalculi = 'No';
    } else if (/\b(?:prev(?:ious)?\s+renal\s+calcul|h\/o\s+(?:renal\s+)?(?:calcul|stone)|known\s+case\s+of\s+.*calcul|operated\s+case\s+of\s+.*(?:ursl|pcnl|rirs|lithotripsy))\b/i.test(allClinicalText)) {
      previousRenalCalculi = 'Yes';
    }
  }

  if (!previousSurgery) {
    if (/\b(?:no|nil)\s+(?:h\/o\s+)?(?:prev(?:ious)?|past)\s+surg/i.test(allClinicalText)) {
      previousSurgery = 'No';
    } else if (
      /\b(?:operated\s+case\s+of|status\s+post|s\/p\b|o\/c\/o\b|turp|ursl|pcnl|rirs|dviu|oiu|meatoplasty|urethroplasty|cystolithotripsy|nephrectomy|pyeloplasty|hydrocelectomy|varicocelectomy|orchiectomy|circumcision|cholecystectomy|appendectomy|cabg|angioplasty|lsCS|hysterectomy)\b/i.test(
        pastMed
      )
    ) {
      previousSurgery = 'Yes';
    }
  }

  if (!constipation) {
    if (/\b(?:no|nil|absent)\s+(?:h\/o\s+)?constipation\b|\bconstipation\s*[:\-]?\s*(?:no|nil|\(-\)|-)\b|\bbowel\s+(?:normal|regular)\b/i.test(allClinicalText)) {
      constipation = 'No';
    } else if (/\b(?:hard\s+stools?|on\s+laxative)\b/i.test(allClinicalText)) {
      constipation = 'hard stools / on laxative';
    } else if (/\bconstipation\b/i.test(allClinicalText)) {
      constipation = 'Yes';
    }
  }

  // Normalize explicit IPSS fields ONLY — never synthesize IPSS from general complaints/diagnosis
  // when no IPSS block was recorded on the OPD sheet.
  const frequency = normalizeIpssFieldValue(ip.frequency);
  const urgency = normalizeIpssFieldValue(ip.urgency);
  const nocturia = normalizeIpssFieldValue(ip.nocturia);
  const poorFlow = normalizeIpssFieldValue(ip.poorFlow || ip.poorStream);
  const intermittency = normalizeIpssFieldValue(ip.intermittency);
  const straining = normalizeIpssFieldValue(ip.straining);
  const incompleteEvacuation = normalizeIpssFieldValue(ip.incompleteEvacuation);
  const qualityOfLife = normalizeIpssFieldValue(ip.qualityOfLife, true);
  const scoreTotal = normalizeIpssFieldValue(ip.scoreTotal, true);
  const hesitancy = normalizeIpssFieldValue(ip.hesitancy);
  const secondVoid = normalizeIpssFieldValue(ip.secondVoid);
  const postVoidDribble = normalizeIpssFieldValue(ip.postVoidDribble);

  return {
    complaints,
    historyChecklist: {
      burning,
      fever,
      hematuria,
      previousRenalCalculi,
      previousSurgery,
      constipation: constipation as any,
    },
    ipss: {
      frequency,
      urgency,
      nocturia,
      poorFlow,
      poorStream: poorFlow,
      intermittency,
      straining,
      incompleteEvacuation,
      qualityOfLife,
      scoreTotal,
      hesitancy,
      secondVoid,
      postVoidDribble,
    },
  };
}

/**
 * Sanitizes systemic examination and genital examination fields:
 * 1. Fixes OCR misreads where cursive 'Flank - NT' under O/E is output as 'Flank: tenderness present' or 'left/right flank mild tenderness +'.
 * 2. Ensures 'cath insitu' / 'catheter in situ' written on the OPD sheet is always placed inside `genitalExamination` along with other genital exam comments.
 */
export function sanitizeExamFields(
  rawSystemic?: string,
  rawGenital?: string,
  rawComplaints?: string
): { systemicExamination: string; genitalExamination: string } {
  let systemic = String(rawSystemic || '').trim();
  let genital = String(rawGenital || '').trim();
  const complaints = String(rawComplaints || '').trim();

  // 1. In systemicExamination, fix OCR misread of 'Flank - NT' -> 'tenderness present' / 'flank tenderness present'
  //    and strip bogus "Per Abdomen (P/A): ok" leaked from IPSS "P - ok"
  if (systemic) {
    systemic = systemic
      .replace(
        /\b(?:comment\s+on\s+)?(?:b\/l\s+|bilateral\s+|left\s+|right\s+|\(l\)\s*|\(r\)\s*)?flanks?\s*(?:[:=\-–—]\s*|\s+)(?:mild\s+)?tenderness(?:\s+present|\s*\+)?\b/gi,
        'Bilateral flanks non-tender (NT)'
      )
      .replace(
        /(?:^|;\s*|\.\s*)tenderness\s+present\b/gi,
        (m) => (m.startsWith(';') ? '; Non-tender (NT)' : 'Non-tender (NT)')
      )
      .replace(/(?:^|;\s*)Per\s+Abdomen\s*(?:\(P\/A\))?\s*:\s*ok\b/gi, '')
      .trim();
  }
  if (genital) {
    genital = genital
      .replace(/^(?:not\s+examined|not\s+done)\s*;\s*/i, '')
      .trim();
  }

  // 2. If 'cath insitu' / 'catheter in situ' / 'Foley in situ' / 'PUC in situ' / 'SPC in situ' appears in systemicExamination or complaints,
  //    ensure it is included in genitalExamination along with other genital examination comments!
  const cathRegex =
    /\b((?:foley(?:'s)?\s+|puc\s+|spc\s+|suprapubic\s+|per\s+urethral\s+)?cath(?:eter)?\s+in\s*situ(?:\s*[-–:]\s*[^;,.]+)?|(?:puc|spc|foley(?:'s)?)\s+in\s*situ)\b/i;

  const sysCathMatch = systemic.match(cathRegex);
  const compCathMatch = complaints.match(cathRegex);
  const genHasCath = cathRegex.test(genital);

  if (!genHasCath && (sysCathMatch || compCathMatch)) {
    const matchedCathText = (sysCathMatch ? sysCathMatch[1] : compCathMatch![1]).trim();
    const formattedCath = /^cath\s+in\s*situ$/i.test(matchedCathText)
      ? 'cath insitu'
      : matchedCathText;
    genital = genital ? `${genital}; ${formattedCath}` : formattedCath;
  }

  // Remove the misplaced 'cath insitu' clause from systemicExamination so it lives cleanly under genitalExamination
  if (sysCathMatch) {
    const remainingSys = systemic
      .split(/\s*;\s*/)
      .filter((clause) => !cathRegex.test(clause.trim()) || clause.trim().length > 35)
      .join('; ')
      .trim();
    systemic = remainingSys;
  }

  return {
    systemicExamination: deduplicateClinicalText(systemic, '; '),
    genitalExamination: deduplicateClinicalText(genital, '; '),
  };
}

/**
 * Full consultation sanitizer for vitals, prescriptions, exams, negative history checklist, and IPSS.
 */
export function sanitizeAndEnrichConsultationFields(c: Consultation): Consultation {
  if (!c) return c;
  const cleanVitals = sanitizeVitalsObject(c.vitals);
  const rawPrescriptions = Array.isArray(c.prescriptions)
    ? c.prescriptions.map((rx) => sanitizePrescriptionItem(rx))
    : [];

  const isMedPrefix = (s: string) =>
    /^(?:t\.|tab\.?|cap\.?|syp\.?|syrup|inj\.?|ij\b|sachet|satchet|oint\.?|cream|drops?|powder|lotion|gel\b|spray)\b/i.test(
      s.trim()
    );
  const isPureDiagnosticTest = (s: string) => {
    const clean = s.replace(/^[\-•*°\d.)\s]+/, '').trim();
    if (!clean || isMedPrefix(clean)) return false;
    return /^(?:adv(?:ised)?\s*[:\-–]?\s*)?(?:usg\b|ultrasound\b|sonography\b|ct\s*kub\b|ncct\b|cect\b|x-?ray\b|mri\b|uroflow(?:metry)?\b|rgu\b|mcu\b|ivp\b|dtpa\b|dmsa\b|2d\s*echo\b|ecg\b|doppler\b|urine\s*(?:r\/m|routine|c\/s|culture)\b|ur?\.?\s*(?:r\/m|c\/s)\b|s(?:r|erum)?\.?\s*(?:creat(?:inine)?|cr|psa)\b|psa\b|cbc\b|kft\b|rft\b|lft\b|hba1c\b|fbs\b|ppbs\b|rbs\b|lipid\s*profile\b|thyroid\b|tsh\b|stone\s*analysis\b|semen\s*analysis\b)/i.test(
      clean
    );
  };

  // 1. Rescue any advised investigations written above/below medications that were placed in prescriptions[],
  //    and strip printed background sheet medications peeking from underneath the page edge
  const isBackgroundPrintedEdgeRx = (medStr: string) =>
    /\b(?:pyridostigmine|aprin\s*\/\s*azoran|azoran|ln\s*block|glyree\s*m2|tinaglip\s*m|rosuprex|rez\s*dsr|neurok(?:e)?)\b/i.test(
      medStr
    );
  const hasForegroundHandwrittenRx = rawPrescriptions.some(
    (rx) => !isBackgroundPrintedEdgeRx(String(rx?.medicine || '')) && !isPureDiagnosticTest(String(rx?.medicine || ''))
  );

  const rescuedAdvisedTests: string[] = [];
  const cleanPrescriptions = rawPrescriptions.filter((rx) => {
    const medStr = String(rx?.medicine || '').trim();
    if (isPureDiagnosticTest(medStr)) {
      rescuedAdvisedTests.push(medStr.replace(/^adv(?:ised)?\s*[:\-–]?\s*/i, '').trim());
      return false;
    }
    if (hasForegroundHandwrittenRx && isBackgroundPrintedEdgeRx(medStr)) {
      return false;
    }
    return true;
  });

  // 2. Rescue advised tests from advice / assessmentPlan into testsRequested
  let updatedAdvice = String(c.advice || '').trim();
  const currentPlan = String(c.assessmentPlan || '').trim();
  if (updatedAdvice) {
    const advClauses = updatedAdvice.split(/\s*;\s*/).filter(Boolean);
    const keptAdvice: string[] = [];
    for (const cl of advClauses) {
      const trimmed = cl.trim();
      if (
        isPureDiagnosticTest(trimmed) &&
        !/\b(?:admit|ward|surgery|operation|catheter|stent|dilatation|cystoscopy|turp|ursl|pcnl)\b/i.test(
          trimmed
        )
      ) {
        rescuedAdvisedTests.push(trimmed.replace(/^adv(?:ised)?\s*[:\-–]?\s*/i, '').trim());
      } else {
        keptAdvice.push(trimmed);
      }
    }
    updatedAdvice = keptAdvice.join('; ');
  }
  if (currentPlan) {
    for (const cl of currentPlan.split(/\s*;\s*/).filter(Boolean)) {
      const trimmed = cl.trim();
      const rwMatch = trimmed.match(
        /^(?:to\s+)?(?:review|follow[\s\-]?up)\s+with\s+(?:reports?\s+of\s+)?(.+)$/i
      );
      if (rwMatch && isPureDiagnosticTest(rwMatch[1])) {
        const cleanedTest = rwMatch[1]
          .replace(/\b(?:after|in)\s+\d+\s*(?:days?|weeks?|months?|m|d|w)\b.*$/i, '')
          .replace(/[.,;]+$/, '')
          .trim();
        if (cleanedTest) rescuedAdvisedTests.push(cleanedTest);
      } else if (
        isPureDiagnosticTest(trimmed) &&
        !/\b(?:admit|ward|surgery|operation|catheter|stent|dilatation|cystoscopy|turp|ursl|pcnl)\b/i.test(
          trimmed
        )
      ) {
        rescuedAdvisedTests.push(trimmed.replace(/^adv(?:ised)?\s*[:\-–]?\s*/i, '').trim());
      }
    }
  }

  const finalTestsRequested = deduplicateClinicalText(
    [c.testsRequested || c.investigationsAdvised || '', ...rescuedAdvisedTests]
      .filter(Boolean)
      .join(', '),
    ', '
  );

  // 3. Rescue Front-page dated/valued investigation findings from pastMedication into labTestsAndImaging
  let updatedPastMed = String(c.pastMedication || '').trim();
  let updatedLabText = String(c.labTestsAndImaging || '').trim();
  if (updatedPastMed) {
    const pastClauses = updatedPastMed.split(/\s*;\s*/).filter(Boolean);
    const keptPast: string[] = [];
    const rescuedLabs: string[] = [];
    const datedInvRe =
      /^(?:\[?(?:0?[1-9]|[12]\d|3[01])[\/\-.](?:0?[1-9]|1[0-2])(?:[\/\-.]\d{2,4})?\]?\s*[:\-–]?\s*)?(?:usg\b|ultrasound\b|ct\s*kub\b|ncct\b|cect\b|mri\b|x-?ray\b|uroflow(?:metry)?\b|rgu\b|mcu\b|urine\s*(?:r\/m|routine|c\/s|culture)\b|ur?\.?\s*(?:r\/m|c\/s)\b|hb\b|tlc\b|s(?:r|erum)?\.?\s*(?:creat(?:inine)?|cr|psa)\b|hba1c\b)/i;

    for (const cl of pastClauses) {
      const trimmed = cl.trim();
      const hasSurgicalWord =
        /\b(?:operated|status\s+post|s\/p\b|o\/c\/o\b|known\s+case|k\/c\/o\b|turp|ursl|pcnl|rirs|dviu|oiu|meatoplasty|urethroplasty|nephrectomy|hydrocelectomy|circumcision|stent|catheter)\b/i.test(
          trimmed
        );
      if (!hasSurgicalWord && datedInvRe.test(trimmed) && /[:=\-–]|\d/.test(trimmed)) {
        rescuedLabs.push(trimmed);
      } else {
        keptPast.push(trimmed);
      }
    }
    if (rescuedLabs.length > 0) {
      updatedPastMed = keptPast.join('; ');
      updatedLabText = [updatedLabText, ...rescuedLabs].filter(Boolean).join(' | ');
    }
  }

  const compSeparated = separateComorbiditiesAndSurgeries(
    c.complaints || c.chiefComplaints || '',
    updatedPastMed
  );
  updatedPastMed = compSeparated.updatedPastMedication;

  const enriched = enrichHistoryChecklistAndIpss({
    ...c,
    complaints: compSeparated.cleanComplaints,
    chiefComplaints: compSeparated.cleanComplaints,
    pastMedication: updatedPastMed,
    vitals: cleanVitals,
    prescriptions: cleanPrescriptions,
  });
  if (compSeparated.detectedSurgicalHistory && !enriched.historyChecklist.previousSurgery) {
    enriched.historyChecklist.previousSurgery = 'Yes';
  }
  const cleanedExams = sanitizeExamFields(
    c.systemicExamination,
    c.genitalExamination,
    enriched.complaints || compSeparated.cleanComplaints
  );

  let cleanRxSummary = String(c.prescriptionsSummaryText || '').trim();
  if (cleanRxSummary) {
    cleanRxSummary = cleanRxSummary
      .replace(/\b(?:silod[ao]l|dilod[ao]l)\s*[-–—]?\s*m\s*[-–—]?\s*d\b/gi, 'Silodal D')
      .replace(/\b(?:silod[ao]l|dilod[ao]l)\s+md\b/gi, 'Silodal D')
      .replace(/\b(?:silodol|dilod[ao]l)\b/gi, 'Silodal');
  }

  // Auto-populate referredTo.speciality from assessmentPlan/advice "Review with <Specialty>" if missing
  const refObj = {
    doctorName: String(c.referredTo?.doctorName || '').trim(),
    speciality: String(c.referredTo?.speciality || '').trim(),
    phoneNo: String(c.referredTo?.phoneNo || '').trim(),
    email: String(c.referredTo?.email || '').trim(),
  };
  if (!refObj.speciality) {
    const planAdvText = `${currentPlan} ; ${updatedAdvice}`;
    const specMatch = planAdvText.match(
      /\b(?:review|follow[\s\-]?up|refer(?:red)?|consult|opinion)\s+(?:with|to|c)\s+(physician|neurology|neurologist|gynaecologist|gynecologist|gynaecology|cardiology|cardiologist|nephrology|nephrologist|medicine|general\s+medicine|endocrinology|surgeon|oncology|orthopaedics)\b/i
    );
    if (specMatch && specMatch[1]) {
      refObj.speciality = specMatch[1].charAt(0).toUpperCase() + specMatch[1].slice(1);
    }
  }

  return {
    ...c,
    vitals: cleanVitals,
    prescriptions: cleanPrescriptions,
    prescriptionsSummaryText: cleanRxSummary || c.prescriptionsSummaryText,
    complaints: enriched.complaints || compSeparated.cleanComplaints,
    chiefComplaints: enriched.complaints || compSeparated.cleanComplaints,
    pastMedication: updatedPastMed,
    labTestsAndImaging: updatedLabText,
    testsRequested: finalTestsRequested,
    investigationsAdvised: finalTestsRequested,
    advice: updatedAdvice,
    referredTo: refObj,
    systemicExamination: cleanedExams.systemicExamination,
    genitalExamination: cleanedExams.genitalExamination,
    historyChecklist: enriched.historyChecklist,
    ipss: enriched.ipss,
  };
}

