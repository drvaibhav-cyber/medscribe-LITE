import { DoctorAccount } from '../types/doctor';
import {
  IpdDailyVitals,
  IpdDischargeSummary,
  IpdPatientRecord,
  IpdWardTreatmentItem,
} from '../types/ipd';
import { OtNotes, PrescriptionItem } from '../types/opd';
import {
  getConsultationOtProcedures,
  splitOperativeTextIntoLines,
} from './otNotesUtils';
import { getActiveDoctorPrintCredentials } from './pdfExporter';

export interface StructuredDischargeSurgery {
  surgeryDate: string;
  procedureName: string;
  performedBy: string;
  detailsLines: string[];
}

export interface StructuredAnaesthesiaDetails {
  typeOfAnaesthesia: string;
  anaesthetistName: string;
  criticalEvents: string;
}

export interface DischargeVitalsRow {
  label: string;
  value: string;
}

export interface DischargeCardModel {
  fullPatientName: string;
  uhid: string;
  ipdNo: string;
  ageSex: string;
  wardOrBed: string;
  consultantName: string;
  admissionDate: string;
  surgeryDate: string;
  dischargeDate: string;
  printTimestamp: string;

  diagnosis: string;
  presentingHistoryLines: string[];
  examinationLines: string[];
  courseInHospital: string;
  surgeries: StructuredDischargeSurgery[];
  fallbackProcedureLines: string[];
  anaesthesia: StructuredAnaesthesiaDetails | null;
  wardMedications: IpdWardTreatmentItem[];
  implantsAndStentsLines: string[];
  labInvestigationLines: string[];
  radiologyInvestigationLines: string[];
  dischargeVitals: DischargeVitalsRow[];
  conditionAtDischarge: string;
  dischargeMedications: PrescriptionItem[];
  dischargeAdviceLines: string[];
  followUpLines: string[];
  redFlagLines: string[];

  preparedBy: string;
  doctorName: string;
  doctorDegrees: string;
  doctorRegNo: string;
  hospitalName: string;
  departmentTitle: string;
}

const NON_SUBSTANTIVE_RE =
  /^(none|nil|n\/a|na|no|not\s+mentioned|not\s+recorded|not\s+specified|not\s+applicable|not\s+documented|not\s+done|not\s+sent|not\s+placed|absent|—|-+)$/i;

const RADIOLOGY_KEYWORD_RE =
  /\b(usg|ultrasound|ultrasonography|sonography|x[\s-]?ray|xray|cxr|kub\b|ncct|cect|ct\s+(?:kub|abdomen|pelvis|urogram|scan|chest|brain)|mri\b|ivp\b|ivu\b|mcu\b|rgu\b|vcug\b|dtpa\b|dmsa\b|ec\s+scan|renogram|doppler|2d\s*echo|echo\b|ecg\b|ekg\b|radiology|imaging|pet[\s-]?ct|uroflow(?:metry)?|pvr\b|bmd\b|mammogram)\b/i;

export function isSubstantiveText(raw?: string | null): boolean {
  const s = (raw || '').trim();
  if (!s) return false;
  return !NON_SUBSTANTIVE_RE.test(s.replace(/[.]+$/, '').trim());
}

/**
 * Formats ISO YYYY-MM-DD as compact hospital DD/MM/YYYY (e.g., 07/10/2026).
 */
export function formatHospitalDate(raw?: string | null): string {
  const s = (raw || '').trim();
  if (!s) return '';
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  }
  return s;
}

/**
 * Formats a timestamp as DD/MM/YYYY HH:MM matching standard hospital print footers.
 */
export function formatPrintDateTime(timestamp?: number): string {
  const d = timestamp ? new Date(timestamp) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

export function stripLatestOpdExaminationHeading(text?: string): string {
  if (!text) return '';
  return text
    .replace(/^\s*(?:[-•*]\s*)?latest\s+opd\s+examination(?:\s*\([^)]*\))?\s*:?\s*\r?\n?/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Normalizes multi-line clinical text into clean plain lines (no decorative bullets or pill tags).
 */
export function toCleanClinicalLines(text?: string, stripOpdExamLabel = false): string[] {
  if (!text) return [];
  const prepared = stripOpdExamLabel ? stripLatestOpdExaminationHeading(text) : text;
  const rawLines = prepared.split(/\r?\n/);
  const result: string[] = [];

  for (const rawLine of rawLines) {
    const cleaned = rawLine
      .replace(/^\s*[•●▪◦*-]\s*/, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned) continue;
    // Skip redundant standalone "Chief Complaints (Latest OPD ...):" wrapper header if followed by data
    if (/^chief\s+complaints\s*\(latest\s+opd[^)]*\)\s*:?\s*$/i.test(cleaned)) {
      continue;
    }
    result.push(cleaned);
  }
  return result;
}

const EXAM_LINE_PREFIX_RE =
  /^(systemic\s+exam(?:ination)?|examination\s+notes|physical\s+examination|clinical\s+examination|on\s+examination|local\s*\/?\s*genital\s+exam(?:ination)?|per[\s-]*rectal(?:\s*\(dre\))?|dre)\s*:\s*/i;

function normalizeExamCore(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Deduplicates overlapping examination lines (e.g. when both "Systemic Exam: Per Abdomen: Soft"
 * and "Examination Notes: Per Abdomen: Soft, Bilateral flanks NT" appear) and keeps only the single
 * most complete entry.
 */
export function deduplicateExaminationLines(lines: string[]): string[] {
  interface ParsedExamLine {
    raw: string;
    label: string;
    value: string;
    core: string;
  }

  const parsed: ParsedExamLine[] = lines
    .map((raw) => {
      const m = raw.match(EXAM_LINE_PREFIX_RE);
      const label = m ? m[1].trim() : '';
      const value = m ? raw.slice(m[0].length).trim() : raw.trim();
      return {
        raw,
        label,
        value,
        core: normalizeExamCore(value),
      };
    })
    .filter((p) => Boolean(p.core));

  const kept: ParsedExamLine[] = [];

  for (const item of parsed) {
    let merged = false;
    for (let i = 0; i < kept.length; i++) {
      const existing = kept[i];
      if (existing.core === item.core || existing.core.includes(item.core)) {
        // Existing line already covers this one; prefer "Systemic Exam" label if existing was generic "Examination Notes"
        if (/^examination\s+notes$/i.test(existing.label) && /^systemic\s+exam/i.test(item.label)) {
          existing.label = 'Systemic Exam';
          existing.raw = `Systemic Exam: ${existing.value}`;
        }
        merged = true;
        break;
      }
      if (item.core.includes(existing.core)) {
        // Incoming line is richer; keep incoming value and preserve "Systemic Exam" label if applicable
        const preferredLabel =
          /^systemic\s+exam/i.test(existing.label) && /^examination\s+notes$/i.test(item.label)
            ? 'Systemic Exam'
            : item.label || existing.label;
        kept[i] = {
          raw: preferredLabel ? `${preferredLabel}: ${item.value}` : item.value,
          label: preferredLabel,
          value: item.value,
          core: item.core,
        };
        merged = true;
        break;
      }
    }
    if (!merged) {
      kept.push(item);
    }
  }

  return kept.map((k) => k.raw);
}

export function deduplicateExaminationText(text?: string): string {
  const cleanedLines = toCleanClinicalLines(text, true);
  return deduplicateExaminationLines(cleanedLines).join('\n');
}

function buildOtDetailsLines(ot: OtNotes): string[] {
  const lines: string[] = [];
  const seenCores = new Set<string>();

  const pushUniqueLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const core = trimmed.toLowerCase().replace(/\s+/g, ' ');
    if (seenCores.has(core)) return;
    seenCores.add(core);
    lines.push(trimmed);
  };

  for (const l of splitOperativeTextIntoLines(ot.operativeFindings)) {
    pushUniqueLine(l);
  }
  for (const l of splitOperativeTextIntoLines(ot.operativeSteps)) {
    pushUniqueLine(l);
  }
  if (isSubstantiveText(ot.catheterOrStentDetails)) {
    const val = ot.catheterOrStentDetails!.trim();
    if (!lines.some((l) => l.toLowerCase().includes(val.toLowerCase()))) {
      pushUniqueLine(val);
    }
  }
  if (isSubstantiveText(ot.drainDetails)) {
    pushUniqueLine(`Drain: ${ot.drainDetails!.trim()}`);
  }
  if (isSubstantiveText(ot.specimenSent)) {
    pushUniqueLine(`Specimen Sent: ${ot.specimenSent!.trim()}`);
  }
  if (isSubstantiveText(ot.estimatedBloodLoss)) {
    pushUniqueLine(`Estimated Blood Loss: ${ot.estimatedBloodLoss!.trim()}`);
  }

  return lines;
}

function buildStructuredSurgeriesAndAnaesthesia(
  patient: IpdPatientRecord,
  summary: IpdDischargeSummary,
  defaultSurgeon: string
): {
  surgeries: StructuredDischargeSurgery[];
  fallbackProcedureLines: string[];
  anaesthesia: StructuredAnaesthesiaDetails | null;
} {
  const otProcs = [...getConsultationOtProcedures(patient as any)].sort((a, b) => {
    const dCmp = (a.surgeryDate || '9999-99-99').localeCompare(b.surgeryDate || '9999-99-99');
    if (dCmp !== 0) return dCmp;
    return (a.surgeryTime || '').localeCompare(b.surgeryTime || '');
  });

  const surgeries: StructuredDischargeSurgery[] = [];
  const anaesthesiaTypes: string[] = [];
  const anaesthetists: string[] = [];
  const criticalEvents: string[] = [];

  for (const ot of otProcs) {
    const procName = (ot.procedureName || '').trim();
    const detailsFromOt = buildOtDetailsLines(ot);
    if (procName || detailsFromOt.length > 0) {
      surgeries.push({
        surgeryDate: formatHospitalDate(ot.surgeryDate || patient.surgeryDate),
        procedureName: procName || 'Surgical Procedure',
        performedBy: (ot.surgeonName || defaultSurgeon || '').trim(),
        detailsLines: detailsFromOt,
      });
    }

    if (isSubstantiveText(ot.anaesthesiaType)) {
      const val = ot.anaesthesiaType!.trim();
      if (!anaesthesiaTypes.some((x) => x.toLowerCase() === val.toLowerCase())) {
        anaesthesiaTypes.push(val);
      }
    }
    if (isSubstantiveText(ot.anaesthetistName)) {
      const val = ot.anaesthetistName!.trim();
      if (!anaesthetists.some((x) => x.toLowerCase() === val.toLowerCase())) {
        anaesthetists.push(val);
      }
    }
    if (isSubstantiveText(ot.intraOpComplications)) {
      const val = ot.intraOpComplications!.trim();
      if (!/^(uneventful|no\s+complications?)$/i.test(val)) {
        if (!criticalEvents.some((x) => x.toLowerCase() === val.toLowerCase())) {
          criticalEvents.push(val);
        }
      }
    }
  }

  const hasSummaryProcedureOrOt = Boolean(
    summary.procedurePerformed?.trim() || summary.otNotesSummary?.trim()
  );

  // If the doctor intentionally cleared both Procedure Performed and OT Notes in the editor, omit surgical/anaesthesia sections
  if (!hasSummaryProcedureOrOt) {
    return {
      surgeries: [],
      fallbackProcedureLines: [],
      anaesthesia: null,
    };
  }

  // If there is a single surgery and the doctor edited otNotesSummary in the editor, split cleanly one-per-line
  const rawManualLines = toCleanClinicalLines(summary.otNotesSummary);
  const manualOtLines: string[] = [];
  const seenManual = new Set<string>();
  for (const line of rawManualLines) {
    // Expand inline "Intra-Operative Findings: A. B. C." or "Operative Steps: A. B. C." into clean individual lines
    const headingPrefix = line.match(
      /^(intra[\s-]*operative\s+findings|operative\s+findings|operative\s+steps(?:\s*\/?\s*procedure\s+notes)?)\s*:\s*(.*)$/i
    );
    if (headingPrefix) {
      const rest = (headingPrefix[2] || '').trim();
      if (rest) {
        for (const sub of splitOperativeTextIntoLines(rest)) {
          const k = sub.toLowerCase();
          if (!seenManual.has(k)) {
            seenManual.add(k);
            manualOtLines.push(sub);
          }
        }
      }
      continue;
    }
    const splitSubs = splitOperativeTextIntoLines(line);
    for (const sub of splitSubs) {
      const k = sub.toLowerCase();
      if (!seenManual.has(k)) {
        seenManual.add(k);
        manualOtLines.push(sub);
      }
    }
  }

  if (surgeries.length === 1 && manualOtLines.length > 0) {
    const procLower = surgeries[0].procedureName.toLowerCase();
    const cleanedDetails = manualOtLines.filter((line, idx) => {
      if (idx === 0 && line.toLowerCase().startsWith(procLower) && /:\s*$/.test(line)) {
        return false;
      }
      return true;
    });
    if (cleanedDetails.length > 0) {
      surgeries[0].detailsLines = cleanedDetails;
    }
  }

  // Also pull Anaesthesia from procedurePerformed text if otProcs didn't specify it
  if (anaesthesiaTypes.length === 0 && summary.procedurePerformed) {
    const anaesthMatch = summary.procedurePerformed.match(/anaesthesia\s*:\s*([^\n;]+)/i);
    if (anaesthMatch && isSubstantiveText(anaesthMatch[1])) {
      anaesthesiaTypes.push(anaesthMatch[1].trim());
    }
  }

  const fallbackProcedureLines: string[] = [];
  if (surgeries.length === 0) {
    const procLines = toCleanClinicalLines(summary.procedurePerformed);
    fallbackProcedureLines.push(...procLines);
    for (const line of manualOtLines) {
      if (!fallbackProcedureLines.some((p) => p.toLowerCase() === line.toLowerCase())) {
        fallbackProcedureLines.push(line);
      }
    }
  }

  const hasAnaesthesia =
    anaesthesiaTypes.length > 0 || anaesthetists.length > 0 || criticalEvents.length > 0;

  return {
    surgeries,
    fallbackProcedureLines,
    anaesthesia: hasAnaesthesia
      ? {
          typeOfAnaesthesia: anaesthesiaTypes.join(', '),
          anaesthetistName: anaesthetists.join(', '),
          criticalEvents: criticalEvents.join('; '),
        }
      : null,
  };
}

/**
 * Splits investigations cleanly into two separate lists:
 * 1. Significant Laboratory Investigations
 * 2. Significant Radiology Investigations
 */
export function splitInvestigationsLabAndRadiology(
  keyInvestigationsText?: string,
  patient?: IpdPatientRecord
): { labLines: string[]; radiologyLines: string[] } {
  const labLines: string[] = [];
  const radiologyLines: string[] = [];

  const imagingParamNames = new Set(
    (patient?.investigationRecords || [])
      .filter((r) => r.category === 'imaging')
      .map((r) => (r.parameterName || '').trim().toLowerCase())
      .filter(Boolean)
  );
  const labParamNames = new Set(
    (patient?.investigationRecords || [])
      .filter((r) => r.category === 'lab')
      .map((r) => (r.parameterName || '').trim().toLowerCase())
      .filter(Boolean)
  );

  const lines = toCleanClinicalLines(keyInvestigationsText);

  for (const line of lines) {
    // Check if the line matches a known investigation record parameter
    const afterDate = line.replace(/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\s*[—–-]\s*/, '');
    const paramPart = afterDate.split(':')[0]?.trim().toLowerCase() || '';

    let isRadiology = false;
    if (paramPart && imagingParamNames.has(paramPart)) {
      isRadiology = true;
    } else if (paramPart && labParamNames.has(paramPart)) {
      isRadiology = false;
    } else if (RADIOLOGY_KEYWORD_RE.test(afterDate)) {
      isRadiology = true;
    }

    if (isRadiology) {
      radiologyLines.push(line);
    } else {
      labLines.push(line);
    }
  }

  return { labLines, radiologyLines };
}

function extractLatestDischargeVitals(patient: IpdPatientRecord): DischargeVitalsRow[] {
  const notes = [...(patient.dailyNotes || [])]
    .filter((n) => n.vitals && Object.values(n.vitals).some((v) => isSubstantiveText(v)))
    .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));

  const v: IpdDailyVitals | undefined = notes[0]?.vitals;
  if (!v) return [];

  const rows: DischargeVitalsRow[] = [];
  if (isSubstantiveText(v.pulse)) {
    const val = v.pulse!.trim();
    rows.push({
      label: 'PR',
      value: /\/min|bpm/i.test(val) ? val : `${val}/min`,
    });
  }
  if (isSubstantiveText(v.bp)) {
    const val = v.bp!.trim();
    rows.push({
      label: 'BP',
      value: /mmhg/i.test(val) ? val : `${val} mmHg`,
    });
  }
  if (isSubstantiveText(v.respRate)) {
    const val = v.respRate!.trim();
    rows.push({
      label: 'RR',
      value: /\/min/i.test(val) ? val : `${val}/min`,
    });
  }
  if (isSubstantiveText(v.spo2)) {
    const val = v.spo2!.trim();
    rows.push({
      label: 'SpO2',
      value: /%/.test(val) ? val : `${val}% on RA`,
    });
  }
  if (isSubstantiveText(v.temp)) {
    rows.push({
      label: 'Temp',
      value: v.temp!.trim(),
    });
  }
  return rows;
}

export function buildDischargeCardModel(
  patient: IpdPatientRecord,
  summary: IpdDischargeSummary,
  doctor?: DoctorAccount | null
): DischargeCardModel {
  const creds = getActiveDoctorPrintCredentials(doctor);
  const fullPatientName = `${patient.salutation ? `${patient.salutation} ` : ''}${patient.patientName}`.trim();
  const ageText = patient.age
    ? /yr|year|m\b|mo/i.test(String(patient.age))
      ? String(patient.age).trim()
      : `${String(patient.age).trim()} yrs`
    : '';
  const ageSex = [ageText, patient.gender || ''].filter(Boolean).join(' / ') || '—';

  const consultantName = (
    summary.authorizedBy ||
    patient.attendingConsultant ||
    creds.doctorName ||
    ''
  ).trim();

  const { surgeries, fallbackProcedureLines, anaesthesia } =
    buildStructuredSurgeriesAndAnaesthesia(patient, summary, consultantName);

  const { labLines, radiologyLines } = splitInvestigationsLabAndRadiology(
    summary.keyInvestigations,
    patient
  );

  const wardMedications = (summary.treatmentGivenInWard || []).filter((t) =>
    Boolean((t.medicine || '').trim())
  );

  const dischargeMedications = (summary.dischargeMedications || []).filter((m) =>
    Boolean((m.medicine || m.drugName || '').trim())
  );

  const diagnosis = (summary.finalDiagnosis || patient.admittingDiagnosis || '').trim();

  return {
    fullPatientName,
    uhid: isSubstantiveText(patient.uhid) ? patient.uhid!.trim() : '',
    ipdNo: isSubstantiveText(patient.ipdNo) ? patient.ipdNo!.trim() : '',
    ageSex,
    wardOrBed: (patient.wardOrBed || '').trim() || '—',
    consultantName: consultantName || '—',
    admissionDate: formatHospitalDate(patient.admissionDate) || '—',
    surgeryDate: formatHospitalDate(patient.surgeryDate),
    dischargeDate: formatHospitalDate(summary.dischargeDate || patient.dischargeDate) || '—',
    printTimestamp: formatPrintDateTime(Date.now()),

    diagnosis,
    presentingHistoryLines: toCleanClinicalLines(summary.chiefComplaintsAndHistory),
    examinationLines: deduplicateExaminationLines(
      toCleanClinicalLines(summary.examinationOnAdmission, true)
    ),
    courseInHospital: (summary.hospitalCourse || '').trim(),
    surgeries,
    fallbackProcedureLines,
    anaesthesia,
    wardMedications,
    implantsAndStentsLines: toCleanClinicalLines(summary.stentOrTubePlan),
    labInvestigationLines: labLines,
    radiologyInvestigationLines: radiologyLines,
    dischargeVitals: extractLatestDischargeVitals(patient),
    conditionAtDischarge: (summary.conditionAtDischarge || '').trim(),
    dischargeMedications,
    dischargeAdviceLines: toCleanClinicalLines(summary.dietAndActivityAdvice),
    followUpLines: toCleanClinicalLines(summary.followUpPlan),
    redFlagLines: toCleanClinicalLines(summary.redFlagWarnings),

    preparedBy: consultantName || creds.doctorName || 'Consultant',
    doctorName: consultantName || creds.doctorName || 'Attending Consultant',
    doctorDegrees: creds.doctorDegrees || '',
    doctorRegNo: creds.doctorRegNo || '',
    hospitalName: creds.hospitalName || '',
    departmentTitle: creds.departmentTitle || '',
  };
}
