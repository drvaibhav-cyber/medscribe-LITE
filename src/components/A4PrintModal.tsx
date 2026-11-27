import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  X,
  Printer,
  Download,
  Sliders,
  ZoomIn,
  ZoomOut,
  FileText,
  Layers,
  ArrowUpDown,
  Edit3,
  Scissors,
  BedDouble,
} from 'lucide-react';
import { Consultation } from '../types/opd';
import { IpdPatientRecord } from '../types/ipd';
import { formatDisplayDate } from '../utils/excelExporter';
import { findMatchingIpdRecordsForPatient } from '../utils/ipdClinicalSync';
import { exportOpdSheetsToPdf, getActiveDoctorPrintCredentials } from '../utils/pdfExporter';
import { DateWiseInvestigationTable } from './DateWiseInvestigationTable';
import {
  areClinicalCoresDuplicate,
  buildDateWiseInvestigationTable,
  cleanChiefComplaintsText,
  cleanExplicitOpdNo,
  deduplicateClinicalText,
  expandClinicalShorthands,
  hasIpssData as checkHasIpssData,
  normalizeClinicalClauseCore,
  normalizeIpssFieldValue,
  sanitizeAndEnrichConsultationFields,
  sanitizeLabTestsAndImagingText,
  sanitizePrescriptionItem,
} from '../utils/investigationUtils';
import {
  getAllPatientOtProcedures,
  getPatientConsolidatedTimelineEntries,
  hasOtNotesData,
  isFalsePositiveOpdAsOtNotes,
  rescueOpdFromFalseOtNotes,
  splitOperativeTextIntoLines,
} from '../utils/otNotesUtils';
import { deduplicateExaminationText } from '../utils/ipdDischargeLayout';
import { DoctorAccount } from '../types/doctor';
import { MedScribeLogo } from './MedScribeLogo';
import {
  buildLabeledAdviceRows,
  formatRxTableRow,
  PrintLayoutMode,
} from '../utils/printLayoutUtils';

interface A4PrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  consultation: Consultation | null;
  allConsultations?: Consultation[];
  ipdPatients?: IpdPatientRecord[];
  initialMode?: 'single' | 'consolidated';
  initialDocType?: 'opd' | 'ot';
  currentDoctor?: DoctorAccount | null;
  onEditConsultation?: (consultation: Consultation) => void;
}

/**
 * Normalizes a patient name by stripping leading salutations (Mr., Mrs., Ms., Dr., Master, etc.)
 * and punctuation so "MR. PRAVIN PALADKAR" matches "Pravin Paladkar".
 */
export function normalizePatientKey(name?: string): string {
  if (!name) return '';
  let clean = name.trim().toLowerCase();
  while (/^(mr|mrs|ms|miss|dr|master|shri|smt|baby)\.?\s+/i.test(clean)) {
    clean = clean.replace(/^(mr|mrs|ms|miss|dr|master|shri|smt|baby)\.?\s+/i, '').trim();
  }
  return clean.replace(/\s+/g, ' ').trim();
}

/**
 * Formats patient full name with salutation while preventing duplicate salutations
 * such as "MRS. MRS. SUSHILA DEVI".
 */
function formatPatientFullName(salutation?: string, patientName?: string): string {
  const cleanSal = cleanPrintText(salutation).toUpperCase().replace(/\.+$/, '');
  const cleanName = cleanPrintText(patientName).toUpperCase();
  if (!cleanName) return cleanSal ? `${cleanSal}.` : '';
  let strippedName = cleanName;
  let inferredSal = cleanSal;
  while (/^(MR|MRS|MS|MISS|DR|MASTER|SHRI|SMT|BABY)\.?\s+/i.test(strippedName)) {
    const m = strippedName.match(/^(MR|MRS|MS|MISS|DR|MASTER|SHRI|SMT|BABY)\.?\s+/i);
    if (m && !inferredSal) {
      inferredSal = m[1].toUpperCase();
    }
    strippedName = strippedName.replace(/^(MR|MRS|MS|MISS|DR|MASTER|SHRI|SMT|BABY)\.?\s+/i, '').trim();
  }
  if (!inferredSal) return strippedName || cleanName;
  return `${inferredSal}. ${strippedName || cleanName}`;
}

/**
 * Finds all consultations belonging to the same patient (matching normalized name, explicit non-generic OPD/UHID, or phone),
 * including the target consultation (even if it is currently in OCR review and not saved yet).
 */
export function getConsolidatedPatientConsultations(
  target: Consultation,
  allConsultations: Consultation[] = [],
  sortOrder: 'chronological' | 'latest-first' = 'latest-first'
): Consultation[] {
  const targetNameKey = normalizePatientKey(target.patientName);
  const isTargetGeneric =
    !targetNameKey ||
    ['patient', 'opd patient', 'unknown', 'unnamed', 'untitled'].includes(targetNameKey) ||
    /^opd patient #\d+$/i.test(targetNameKey);
  const targetOpd = cleanExplicitOpdNo(target.opdNo).toLowerCase();
  const isMeaningfulOpd = targetOpd.length >= 3;
  const targetPhone = (target.phoneNumber || target.contactNumber || '').replace(/\D/g, '');
  const isMeaningfulPhone = targetPhone.length >= 8;

  const matchedMap = new Map<string, Consultation>();

  // Always include the target consultation (with its latest edits)
  matchedMap.set(target.id || 'target-current', target);

  for (const item of allConsultations) {
    if (!item) continue;
    if (item.id && item.id === target.id) {
      matchedMap.set(item.id, target);
      continue;
    }

    const itemNameKey = normalizePatientKey(item.patientName);
    const isItemGeneric =
      !itemNameKey ||
      ['patient', 'opd patient', 'unknown', 'unnamed', 'untitled'].includes(itemNameKey) ||
      /^opd patient #\d+$/i.test(itemNameKey);
    const itemOpd = cleanExplicitOpdNo(item.opdNo).toLowerCase();
    const itemPhone = (item.phoneNumber || item.contactNumber || '').replace(/\D/g, '');

    // Never merge two consultations that have distinct, non-generic patient names!
    const namesConflict = Boolean(!isTargetGeneric && !isItemGeneric && targetNameKey !== itemNameKey);
    if (namesConflict) continue;

    const nameMatches = Boolean(!isTargetGeneric && !isItemGeneric && targetNameKey === itemNameKey);
    const opdMatches = Boolean(isMeaningfulOpd && itemOpd && targetOpd === itemOpd);
    const phoneMatches = Boolean(
      isMeaningfulPhone &&
        itemPhone.length >= 8 &&
        itemPhone.slice(-10) === targetPhone.slice(-10)
    );

    if (nameMatches || opdMatches || phoneMatches) {
      // Avoid duplicate if same date + same complaints + same diagnosis as target
      const isDuplicateOfTarget =
        item.date === target.date &&
        (item.diagnosis || '').trim().toLowerCase() === (target.diagnosis || '').trim().toLowerCase() &&
        (item.complaints || '').trim().toLowerCase() === (target.complaints || '').trim().toLowerCase();

      if (!isDuplicateOfTarget) {
        matchedMap.set(item.id || `${item.date}-${matchedMap.size}`, item);
      }
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

/**
 * Returns the total number of consultations found for this patient (including target).
 * Previous records exist if and only if getPatientHistoryCount(target, allConsultations) > 1.
 */
export function getPatientHistoryCount(
  target: Consultation | null | undefined,
  allConsultations: Consultation[] = []
): number {
  if (!target) return 0;
  return getConsolidatedPatientConsultations(target, allConsultations).length;
}

/**
 * Cleans a clinical field string by removing placeholder phrases like
 * "Not explicitly stated", "Not explicitly noted", "Not stated", "Not mentioned", etc.
 */
function cleanPrintText(val?: string | number | null): string {
  if (val === undefined || val === null) return '';
  let s = expandClinicalShorthands(String(val).trim());
  if (!s) return '';

  // Strip leaked AI chain-of-thought reasoning if present in older/raw transcripts
  const arrowIdx = s.search(/\s*(?:->|→)\s*(?:["']|wait|let'?s|omit|using|empty|keep|use|assuming|note:)/i);
  if (arrowIdx >= 0) {
    s = s.slice(0, arrowIdx).trim();
  }
  s = s
    .replace(/\b(?:wait,|let'?s\s+(?:keep|use|leave|omit|check|set|put)|using\s+empty\s+string|i\s+will\s+map|interpreting\s+as|based\s+on\s+instructions|mapped\s+to)[\s\S]*$/i, '')
    .replace(/\(\s*(?:[^)]*\b(?:blank\s+on\s+sheet|time\s+of\s+incision|omitted|empty\s+string|written\s+as|assuming|schema|note:)\b[^)]*)\)/gi, '')
    .trim();
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

function hasText(val?: string | number | null): boolean {
  return Boolean(cleanPrintText(val));
}

export function hasIpssData(rawC: Consultation): boolean {
  return checkHasIpssData(sanitizeAndEnrichConsultationFields(rawC));
}

function splitIntoItems(text?: string): string[] {
  const deduped = deduplicateClinicalText(text, '; ');
  const cleaned = cleanPrintText(deduped);
  if (!cleaned) return [];
  const rawParts = cleaned
    .split(/\r?\n|;|\||•|\u2022/)
    .map((s) => cleanPrintText(s.replace(/^[\-•*°\s]+/, '')))
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

function formatIndianDate(dateStr?: string): string {
  if (!dateStr) return '';
  const match = String(dateStr).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }
  return dateStr;
}

interface SingleA4SheetProps {
  consultation: Consultation;
  allConsultations?: Consultation[];
  visitIndex: number;
  totalVisits: number;
  isConsolidatedMode: boolean;
  sortOrder?: 'chronological' | 'latest-first';
  departmentTitle: string;
  doctorName: string;
  doctorDegrees: string;
  doctorSuperSpec: string;
  doctorRegNo: string;
  hospitalName?: string;
  clinicAddress?: string;
  clinicPhone?: string;
  clinicEmail?: string;
  preprintedStationery: boolean;
  ipssMode: 'auto' | 'show' | 'hide';
  investigationsPrintMode: 'whole-table' | 'latest-only';
  printLayout?: PrintLayoutMode;
  showInvestigations?: boolean;
  showVitalsInCo: boolean;
  showHistoryChecklist: boolean;
  hideEmptySections: boolean;
  bodyFontSizeClass: string;
}

const SingleA4CaseSheet: React.FC<SingleA4SheetProps> = ({
  consultation: rawConsultation,
  allConsultations = [],
  visitIndex,
  totalVisits,
  isConsolidatedMode,
  sortOrder = 'latest-first',
  departmentTitle,
  doctorName,
  doctorDegrees,
  doctorSuperSpec,
  doctorRegNo,
  hospitalName,
  clinicAddress,
  clinicPhone,
  clinicEmail,
  preprintedStationery,
  ipssMode,
  investigationsPrintMode,
  printLayout = 'split',
  showInvestigations = true,
  showVitalsInCo,
  showHistoryChecklist,
  hideEmptySections,
  bodyFontSizeClass,
}) => {
  const c = useMemo(() => sanitizeAndEnrichConsultationFields(rawConsultation), [rawConsultation]);
  const v = c.vitals || {};
  const hc = c.historyChecklist || {};
  const ip = c.ipss || {};

  const shouldShowIpss =
    ipssMode === 'show' ? true : ipssMode === 'hide' ? false : hasIpssData(c);

  const complaintItems = splitIntoItems(
    cleanChiefComplaintsText(c.complaints || c.chiefComplaints)
  );

  const checklistItems: Array<{ label: string; value: string }> = [];
  if (showHistoryChecklist && hc) {
    if (hasText(hc.burning))
      checklistItems.push({ label: 'Burning Micturition', value: cleanPrintText(hc.burning) });
    if (hasText(hc.fever))
      checklistItems.push({ label: 'Fever', value: cleanPrintText(hc.fever) });
    if (hasText(hc.hematuria))
      checklistItems.push({ label: 'Hematuria', value: cleanPrintText(hc.hematuria) });
    if (hasText(hc.previousRenalCalculi))
      checklistItems.push({
        label: 'Prev. Renal Calculi',
        value: cleanPrintText(hc.previousRenalCalculi),
      });
    if (hasText(hc.previousSurgery))
      checklistItems.push({ label: 'Prev. Surgery', value: cleanPrintText(hc.previousSurgery) });
    if (hasText(hc.constipation))
      checklistItems.push({ label: 'Constipation', value: cleanPrintText(hc.constipation) });
  }

  const vitalsParts: string[] = [];
  if (showVitalsInCo && v) {
    if (hasText(v.bp)) {
      const bp = cleanPrintText(v.bp);
      vitalsParts.push(`BP: ${bp}${bp.includes('mmHg') ? '' : ' mmHg'}`);
    }
    if (hasText(v.pulse)) {
      const pulse = cleanPrintText(v.pulse);
      vitalsParts.push(`Pulse: ${pulse}${pulse.includes('bpm') ? '' : ' bpm'}`);
    }
    if (hasText(v.temp)) vitalsParts.push(`Temp: ${cleanPrintText(v.temp)}`);
    if (hasText(v.weight)) {
      const wt = cleanPrintText(v.weight);
      vitalsParts.push(`Wt: ${wt}${wt.includes('kg') ? '' : ' kg'}`);
    }
    if (hasText(v.spo2)) {
      const spo2 = cleanPrintText(v.spo2);
      vitalsParts.push(`SpO2: ${spo2}${spo2.includes('%') ? '' : '%'}`);
    }
  }

  const examLines: Array<{ label: string; value: string }> = [];
  if (hasText(c.systemicExamination || c.examinationNotes)) {
    const val = splitIntoItems(c.systemicExamination || c.examinationNotes).join('; ');
    if (val) {
      examLines.push({
        label: 'P/A & Systemic',
        value: val,
      });
    }
  }
  if (hasText(c.genitalExamination)) {
    const val = splitIntoItems(c.genitalExamination).join('; ');
    if (val) {
      examLines.push({
        label: 'Genital Exam',
        value: val,
      });
    }
  }
  if (hasText(c.perRectalExam)) {
    const val = splitIntoItems(c.perRectalExam).join('; ');
    if (val) {
      examLines.push({
        label: 'PR Exam (DRE)',
        value: val,
      });
    }
  }

  const sanitizedLabAndHistory = sanitizeLabTestsAndImagingText(
    c.labTestsAndImaging,
    c.pastMedication
  );

  const rawPastMedList: string[] = [];
  if (hasText(c.history)) {
    rawPastMedList.push(...splitIntoItems(c.history));
  }
  if (
    hasText(c.additionalHistory) &&
    cleanPrintText(c.additionalHistory) !== cleanPrintText(c.history)
  ) {
    rawPastMedList.push(...splitIntoItems(c.additionalHistory));
  }
  if (hasText(sanitizedLabAndHistory.pastMedication)) {
    rawPastMedList.push(...splitIntoItems(sanitizedLabAndHistory.pastMedication));
  }
  const pastMedAndComorbidities = splitIntoItems(rawPastMedList.join('; '));

  const deduplicatedDiagnosis = splitIntoItems(c.diagnosis).join(' / ');

  const reportedInvestigations = splitIntoItems(sanitizedLabAndHistory.labTestsAndImaging);

  const toldInvestigations = splitIntoItems(
    [
      cleanPrintText(c.testsRequested || c.investigationsAdvised),
      hasText(c.testsRequestedByWhen) ? `(By: ${cleanPrintText(c.testsRequestedByWhen)})` : '',
    ]
      .filter(Boolean)
      .join(' ')
  );

  const stripHydrationAdvice = (val?: string): string => {
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
  };

  const rawPlanLines: string[] = [];
  if (c.admissionAdvice === 'Yes') {
    rawPlanLines.push('Admit in Ward');
  }
  const assessmentWithoutHydration = stripHydrationAdvice(c.assessmentPlan);
  if (hasText(assessmentWithoutHydration)) {
    rawPlanLines.push(...splitIntoItems(assessmentWithoutHydration));
  }
  const rawAdviceSource = hasText(c.advice) ? c.advice : c.adviceAndDiet;
  const adviceWithoutHydration = stripHydrationAdvice(rawAdviceSource);
  if (hasText(adviceWithoutHydration)) {
    rawPlanLines.push(...splitIntoItems(adviceWithoutHydration));
  }
  const dietWithoutHydration = stripHydrationAdvice(c.dietAndExercise);
  if (hasText(dietWithoutHydration)) {
    rawPlanLines.push(`Diet & Exercise: ${cleanPrintText(dietWithoutHydration)}`);
  }
  if (hasText(c.nextVisit || c.followUpDate)) {
    rawPlanLines.push(`Next Visit / Follow-up: ${cleanPrintText(c.nextVisit || c.followUpDate)}`);
  }

  const planLines: string[] = [];
  const planSeenCores: string[] = [];
  for (const item of rawPlanLines) {
    if (/^referred\s+to\b/i.test(item.trim()) || /\bhydration\b/i.test(item)) continue;
    const core = normalizeClinicalClauseCore(item);
    if (!core) continue;
    const dupIdx = planSeenCores.findIndex(
      (existing) =>
        existing === core ||
        (existing.length >= 6 && core.includes(existing)) ||
        (core.length >= 6 && existing.includes(core))
    );
    if (dupIdx === -1) {
      planSeenCores.push(core);
      planLines.push(item);
    } else if (item.length > planLines[dupIdx].length && !planLines[dupIdx].startsWith('Next Visit') && !planLines[dupIdx].startsWith('Diet & Exercise')) {
      planSeenCores[dupIdx] = core;
      planLines[dupIdx] = item;
    }
  }

  const rawPrescriptions = (c.prescriptions || [])
    .map((rx) => sanitizePrescriptionItem(rx))
    .filter((rx) => hasText(rx.medicine || rx.drugName));
  const seenMedKeys = new Set<string>();
  const prescriptions = rawPrescriptions.filter((rx) => {
    const medKey = `${cleanPrintText(rx.medicine || rx.drugName).toLowerCase()}|${cleanPrintText(rx.dosage || rx.dosageStrength).toLowerCase()}`;
    if (seenMedKeys.has(medKey)) return false;
    seenMedKeys.add(medKey);
    return true;
  });

  const labeledAdviceRows = useMemo(() => buildLabeledAdviceRows(c), [c]);
  const cleanScoreTotal = normalizeIpssFieldValue(ip.scoreTotal, true);
  const cleanQol = normalizeIpssFieldValue(ip.qualityOfLife, true);

  const renderFullWidthRxAndAdvice = () => {
    const hasRx = prescriptions.length > 0 || hasText(c.prescriptionsSummaryText);
    const hasAdvice = labeledAdviceRows.length > 0;
    if (!hasRx && !hasAdvice && hideEmptySections) return null;

    return (
      <div className="space-y-2.5 pt-2">
        {hasRx && (
          <div className="space-y-1">
            <div className="flex items-end justify-between">
              <span
                className="font-serif font-bold text-[22px] leading-none text-slate-950 select-none"
                aria-label="Prescription Rx"
              >
                &#8478;
              </span>
            </div>

            {prescriptions.length > 0 ? (
              <div className="w-full border-t border-b border-slate-800 text-[11.5px]">
                <div className="grid grid-cols-12 items-center border-b border-slate-800 py-1 px-1 font-black text-slate-950 text-[11px]">
                  <div className="col-span-6 pr-2">Medicine</div>
                  <div className="col-span-2 text-center">Dosage</div>
                  <div className="col-span-4 pl-2">Timing - Freq. - Duration</div>
                </div>

                <div className="divide-y divide-slate-400">
                  {prescriptions.map((rx, idx) => {
                    const row = formatRxTableRow(rx);
                    return (
                      <div key={idx} className="grid grid-cols-12 items-start py-1.5 px-1">
                        <div className="col-span-6 pr-2">
                          <div className="flex items-baseline gap-2">
                            <span className="font-semibold text-slate-800 shrink-0">
                              {idx + 1})
                            </span>
                            <div>
                              <div className="font-black text-slate-950 tracking-tight leading-snug">
                                {row.medicineLine}
                              </div>
                              {row.notesLine && (
                                <div className="text-[10.5px] font-normal text-slate-800 leading-snug mt-0.5">
                                  Notes : {row.notesLine}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="col-span-2 text-center font-bold tabular-nums text-slate-950 whitespace-nowrap pt-0.5">
                          {row.dosagePattern || '—'}
                        </div>
                        <div className="col-span-4 pl-2 font-semibold text-slate-900 leading-snug pt-0.5">
                          {row.timingFreqDuration || '—'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="border-t border-b border-slate-800 py-1.5 px-1 text-slate-900 font-medium whitespace-pre-wrap">
                {splitIntoItems(c.prescriptionsSummaryText).join('\n')}
              </div>
            )}
          </div>
        )}

        {(hasAdvice || !hideEmptySections) && (
          <div className="space-y-1 pt-1 text-[11.5px]">
            {hasAdvice ? (
              labeledAdviceRows.map((row, idx) => (
                <div key={idx} className="leading-snug text-slate-950">
                  <span className="font-black">{row.label}: </span>
                  <span className="font-medium">{row.text}</span>
                </div>
              ))
            ) : (
              <div className="space-y-1.5 pt-1">
                <div className="font-black text-slate-950">Advice:</div>
                <div className="border-b border-slate-300 h-4" />
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="a4-sheet-wrapper">
      {/* Screen-only Visit Separator Label when viewing Consolidated Case History */}
      {isConsolidatedMode && (
        <div className="no-print-stationery-guide mb-2 px-4 py-2 rounded-t-xl bg-[#E1F7FC] border border-[#A9CFF7] text-[#28527A] flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 font-bold">
            <span className="px-2 py-0.5 rounded bg-[#D6DDF8] text-[#2F4362] border border-[#B5C4F0] font-mono text-[11px]">
              Visit #{sortOrder === 'latest-first' ? totalVisits - visitIndex : visitIndex + 1} of {totalVisits}
              {sortOrder === 'latest-first' && visitIndex === 0 ? ' (Latest Visit)' : ''}
            </span>
            <span>Consultation Date: {formatIndianDate(c.date)}</span>
            {deduplicatedDiagnosis && (
              <span className="text-violet-800 font-semibold">
                · Dx: {deduplicatedDiagnosis}
              </span>
            )}
          </div>
          {cleanExplicitOpdNo(c.opdNo) && (
            <span className="font-mono text-[11px] text-[#3B6B98] font-semibold">
              OPD/UHID: {cleanPrintText(cleanExplicitOpdNo(c.opdNo))}
            </span>
          )}
        </div>
      )}

      {/* THE A4 PRINTABLE SHEET (210mm x 297mm) */}
      <div
        style={{
          width: '210mm',
          minHeight: '297mm',
          padding: preprintedStationery ? '10mm 12mm 28mm 12mm' : '10mm 12mm 8mm 12mm',
          boxSizing: 'border-box',
        }}
        className={`a4-printable-sheet bg-white text-slate-900 shadow-2xl flex flex-col justify-between font-sans ${bodyFontSizeClass}`}
      >
        {/* TOP + MIDDLE CONTENT WRAPPER */}
        <div className="space-y-3">
          {/* 1. HEADER AREA */}
          <div className="grid grid-cols-12 items-start gap-3 pb-2.5 border-b border-slate-800">
            {/* Left: Reserved space */}
            <div className="col-span-3 flex flex-col items-center justify-center pt-1">
              <div className="w-24 h-16" aria-hidden="true" />
            </div>

            {/* Center: Department & Logged-In Doctor Credentials */}
            <div className="col-span-6 text-center space-y-0.5 pt-0.5">
              <div className="font-extrabold text-[13px] tracking-wider uppercase text-slate-900">
                {departmentTitle}
              </div>
              <div className="text-[15px] font-black tracking-wide text-slate-950 uppercase pt-0.5">
                {doctorName || c.doctorName}
              </div>
              {doctorDegrees && (
                <div className="text-[11.5px] font-semibold text-slate-800">{doctorDegrees}</div>
              )}
              {doctorSuperSpec && (
                <div className="text-[11.5px] font-bold text-slate-900">{doctorSuperSpec}</div>
              )}
              {doctorRegNo && (
                <div className="text-[11px] font-mono font-bold text-slate-800 pt-0.5">
                  {doctorRegNo}
                </div>
              )}
            </div>

            {/* Right: Reserved space + Printed DATE below */}
            <div className="col-span-3 flex flex-col items-end justify-between h-full gap-2">
              <div className="w-13 h-13 pr-2" aria-hidden="true" />

              {/* DATE (Unboxed) */}
              <div className="w-full text-right pr-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 mr-1.5">
                  DATE:
                </span>
                <span className="text-[12.5px] font-mono font-black text-slate-950">
                  {formatIndianDate(c.date)}
                </span>
              </div>
            </div>
          </div>

          {/* 2. PATIENT NAME & AGE / GENDER ROW */}
          <div className="flex items-center justify-between border-b border-slate-400 pb-2 px-1 text-[13px]">
            <div className="flex items-baseline gap-2 flex-1">
              <span className="font-bold text-slate-700 uppercase text-[11.5px]">Pt Name:</span>
              <span className="font-black text-slate-950 text-[14px] uppercase border-b border-dotted border-slate-500 min-w-[220px] pb-0.5">
                {formatPatientFullName(c.salutation, c.patientName)}
              </span>
              {hasText(cleanExplicitOpdNo(c.opdNo)) && (
                <span className="text-[11px] font-mono text-slate-600 ml-3">
                  (UHID/OPD: <strong>{cleanPrintText(cleanExplicitOpdNo(c.opdNo))}</strong>)
                </span>
              )}
            </div>

            <div className="flex items-baseline gap-4 shrink-0">
              <div className="flex items-baseline gap-1.5">
                <span className="font-bold text-slate-700 uppercase text-[11.5px]">
                  Age / Sex:
                </span>
                <span className="font-black text-slate-950 text-[13.5px] border-b border-dotted border-slate-500 min-w-[70px] text-center pb-0.5">
                  {[cleanPrintText(c.age), cleanPrintText(c.gender)].filter(Boolean).join(' / ') || '—'}
                </span>
              </div>
              {hasText(c.phoneNumber || c.contactNumber) && (
                <div className="flex items-baseline gap-1 text-[11px] font-mono text-slate-700">
                  <span>Ph:</span>
                  <strong>{cleanPrintText(c.phoneNumber || c.contactNumber)}</strong>
                </div>
              )}
            </div>
          </div>

          {/* 3. CLINICAL BODY: 3 SELECTABLE LAYOUTS (1. Column, 2. Split [Default], 3. Flat) */}
          {printLayout === 'flat' ? (
            <div className="space-y-2.5 pt-1">
              {/* FLAT 1: VITALS */}
              {showVitalsInCo && (!hideEmptySections || vitalsParts.length > 0) && (
                <div className="flex flex-wrap items-baseline gap-x-2 border-b border-slate-200 pb-1">
                  <span className="font-black text-[11.5px] uppercase tracking-wider text-slate-950">
                    VITALS:
                  </span>
                  <span className="text-[11px] font-mono font-semibold text-slate-900">
                    {vitalsParts.length > 0
                      ? vitalsParts.join('  •  ')
                      : 'BP: ________  •  Pulse: ______  •  Wt: ______'}
                  </span>
                </div>
              )}

              {/* FLAT 2: CHIEF COMPLAINTS */}
              {(!hideEmptySections || complaintItems.length > 0) && (
                <div className="space-y-0.5">
                  <div className="font-black text-[11.5px] uppercase tracking-wider text-slate-950">
                    Chief Complaints
                  </div>
                  {complaintItems.length > 0 ? (
                    <div className="text-slate-900 font-medium pl-0.5 leading-snug">
                      {complaintItems.join('  •  ')}
                    </div>
                  ) : (
                    !hideEmptySections && <div className="border-b border-slate-300 h-4" />
                  )}
                </div>
              )}

              {/* FLAT 3: IPSS IN A SINGLE FLAT STRUCTURED LINE */}
              {shouldShowIpss && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between border-b border-slate-300 pb-0.5">
                    <span className="font-black text-[11.5px] uppercase tracking-wider text-slate-950">
                      IPSS
                    </span>
                    {(hasText(cleanScoreTotal) || hasText(cleanQol)) && (
                      <span className="text-[10.5px] font-bold text-slate-800">
                        {hasText(cleanScoreTotal) ? `Total Score: ${cleanPrintText(cleanScoreTotal)}` : ''}
                        {hasText(cleanScoreTotal) && hasText(cleanQol) ? '  •  ' : ''}
                        {hasText(cleanQol) ? `QoL: ${cleanPrintText(cleanQol)}` : ''}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-7 border border-slate-400 divide-x divide-slate-300 text-[10px]">
                    {[
                      { code: '[F] Freq', val: normalizeIpssFieldValue(ip.frequency) },
                      { code: '[U] Urg', val: normalizeIpssFieldValue(ip.urgency) },
                      { code: '[N] Noct', val: normalizeIpssFieldValue(ip.nocturia) },
                      { code: '[P] Flow', val: normalizeIpssFieldValue(ip.poorFlow || ip.poorStream) },
                      { code: '[I] Intm', val: normalizeIpssFieldValue(ip.intermittency) },
                      { code: '[S] Strn', val: normalizeIpssFieldValue(ip.straining) },
                      { code: '[S] Evac', val: normalizeIpssFieldValue(ip.incompleteEvacuation) },
                    ].map((cell, idx) => (
                      <div key={idx} className="px-1.5 py-1 text-center leading-tight bg-slate-50/40">
                        <div className="font-bold text-slate-700 text-[9px] truncate">{cell.code}</div>
                        <div className="font-black text-slate-950 truncate mt-0.5">
                          {cleanPrintText(cell.val) || '—'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* FLAT 4: NEGATIVE / HISTORY CHECKLIST */}
              {checklistItems.length > 0 && (
                <div className="border-b border-slate-200 pb-1">
                  <span className="font-black text-[11px] uppercase tracking-wider text-slate-950 mr-2">
                    Negative / History:
                  </span>
                  <span className="text-[10.5px] text-slate-800">
                    {checklistItems.map((ci, idx) => (
                      <span key={idx}>
                        {idx > 0 ? '  |  ' : ''}
                        <span className="font-medium text-slate-700">{ci.label}: </span>
                        <strong className="text-slate-950">{ci.value}</strong>
                      </span>
                    ))}
                  </span>
                </div>
              )}

              {/* FLAT 5: EXAMINATION */}
              {(!hideEmptySections || examLines.length > 0) && (
                <div className="space-y-0.5">
                  <div className="font-black text-[11.5px] uppercase tracking-wider text-slate-950">
                    Examination (O/E)
                  </div>
                  {examLines.length > 0 ? (
                    <div className="space-y-0.5 pl-0.5">
                      {examLines.map((ex, idx) => (
                        <div key={idx} className="leading-snug">
                          <span className="font-bold text-slate-900">{ex.label}: </span>
                          <span className="text-slate-800 font-medium">{ex.value}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="border-b border-slate-300 h-4" />
                  )}
                </div>
              )}

              {/* FLAT 6: PREVIOUS INVESTIGATIONS */}
              {showInvestigations &&
                (() => {
                  const invTable = buildDateWiseInvestigationTable(c, allConsultations);
                  const hasTable = invTable.rows.length > 0;
                  if (!hasTable && reportedInvestigations.length === 0) return null;

                  return (
                    <div className="space-y-1 pt-0.5">
                      <div className="font-black text-[11.5px] uppercase tracking-wider text-slate-950">
                        Previous Investigations (Lab Tests &amp; Imaging)
                      </div>
                      {hasTable ? (
                        <DateWiseInvestigationTable
                          consultation={c}
                          allConsultations={allConsultations}
                          printMode
                          printScope={investigationsPrintMode}
                        />
                      ) : (
                        <div className="text-slate-900 font-medium pl-0.5 leading-snug">
                          {reportedInvestigations.join('  •  ')}
                        </div>
                      )}
                    </div>
                  );
                })()}

              {/* FLAT 7: PAST MEDICATION / COMORBIDITIES */}
              {(!hideEmptySections || pastMedAndComorbidities.length > 0) && (
                <div className="leading-snug">
                  <span className="font-black text-[11.5px] uppercase tracking-wider text-slate-950 mr-2">
                    Past Medication / Comorbidities:
                  </span>
                  {pastMedAndComorbidities.length > 0 ? (
                    <span className="text-slate-900 font-medium">
                      {pastMedAndComorbidities.join('  •  ')}
                    </span>
                  ) : (
                    <span className="inline-block border-b border-slate-300 w-48 align-bottom" />
                  )}
                </div>
              )}

              {/* FLAT 8: DIAGNOSIS */}
              {(!hideEmptySections || Boolean(deduplicatedDiagnosis)) && (
                <div className="leading-snug">
                  <span className="font-black text-[11.5px] uppercase tracking-wider text-slate-950 mr-2">
                    Diagnosis:
                  </span>
                  {deduplicatedDiagnosis ? (
                    <span className="text-[13px] font-black text-slate-950">
                      &Delta; {deduplicatedDiagnosis}
                    </span>
                  ) : (
                    <span className="inline-block border-b border-slate-300 w-56 align-bottom" />
                  )}
                </div>
              )}

              {/* FLAT 9: ADVISED INVESTIGATIONS */}
              {(!hideEmptySections || toldInvestigations.length > 0) && (
                <div className="leading-snug">
                  <span className="font-black text-[11.5px] uppercase tracking-wider text-slate-950 mr-2">
                    Advised Investigations:
                  </span>
                  {toldInvestigations.length > 0 ? (
                    <span className="text-slate-900 font-semibold">
                      {toldInvestigations.join('; ')}
                    </span>
                  ) : (
                    <span className="inline-block border-b border-slate-300 w-56 align-bottom" />
                  )}
                </div>
              )}

              {/* FLAT 10: MEDICATIONS (Rx) + ASSESSMENT / ADVICE / DIET & FOLLOW-UP */}
              {renderFullWidthRxAndAdvice()}
            </div>
          ) : (
            <div className="space-y-3">
              {/* UPPER 2-COLUMN CLINICAL BODY (Used for both Column & Split layouts) */}
              <div className="grid grid-cols-12 gap-4 pt-1">
                {/* LEFT COLUMN (5 Cols): Vitals -> Chief Complaints -> IPSS -> Negative History -> Examination */}
                <div className="col-span-5 space-y-3.5 border-r border-slate-300 pr-3">
                  {/* LEFT 1: VITALS */}
                  {showVitalsInCo && (!hideEmptySections || vitalsParts.length > 0) && (
                    <div className="space-y-1">
                      <div className="font-black text-[12px] uppercase tracking-wider text-slate-950">
                        VITALS
                      </div>
                      {vitalsParts.length > 0 ? (
                        <div className="text-[11.5px] font-mono font-semibold text-slate-900 leading-snug">
                          {vitalsParts.join('  •  ')}
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-500 font-mono">
                          BP: ________  •  Pulse: ______  •  Wt: ______
                        </div>
                      )}
                    </div>
                  )}

                  {/* LEFT 2: Chief Complaints */}
                  {(!hideEmptySections || complaintItems.length > 0) && (
                    <div className="space-y-1">
                      <div className="font-black text-[12px] uppercase tracking-wider text-slate-950">
                        Chief Complaints
                      </div>

                      {complaintItems.length > 0 ? (
                        <ul className="list-disc list-inside space-y-0.5 text-slate-900 font-medium pl-0.5">
                          {complaintItems.map((item, idx) => (
                            <li key={idx} className="leading-snug">
                              {item}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        !hideEmptySections && (
                          <div className="space-y-2 pt-1">
                            <div className="border-b border-slate-300 h-4" />
                            <div className="border-b border-slate-300 h-4" />
                            <div className="border-b border-slate-300 h-4" />
                          </div>
                        )
                      )}
                    </div>
                  )}

                  {/* LEFT 3: IPSS */}
                  {shouldShowIpss && (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between border-b border-slate-400 pb-0.5">
                        <span className="font-black text-[12px] uppercase tracking-wider text-slate-950">
                          IPSS
                        </span>
                        {(hasText(cleanScoreTotal) || hasText(cleanQol)) && (
                          <span className="text-[10.5px] font-bold text-slate-800">
                            {hasText(cleanScoreTotal) ? `Score: ${cleanPrintText(cleanScoreTotal)}` : ''}
                            {hasText(cleanScoreTotal) && hasText(cleanQol) ? ' • ' : ''}
                            {hasText(cleanQol) ? `QoL: ${cleanPrintText(cleanQol)}` : ''}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10.5px] border border-slate-400 p-1.5">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-1 border-b border-dotted border-slate-300 pb-0.5">
                            <span className="font-bold text-slate-800">[F] Frequency:</span>
                            <span className="font-black text-slate-950 whitespace-nowrap">
                              {cleanPrintText(normalizeIpssFieldValue(ip.frequency)) || '—'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-1 border-b border-dotted border-slate-300 pb-0.5">
                            <span className="font-bold text-slate-800">[U] Urgency:</span>
                            <span className="font-black text-slate-950 whitespace-nowrap">
                              {cleanPrintText(normalizeIpssFieldValue(ip.urgency)) || '—'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-1 border-b border-dotted border-slate-300 pb-0.5">
                            <span className="font-bold text-slate-800">[N] Nocturia:</span>
                            <span className="font-black text-slate-950 whitespace-nowrap">
                              {cleanPrintText(normalizeIpssFieldValue(ip.nocturia)) || '—'}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-1 border-l border-slate-300 pl-2">
                          <div className="flex items-center justify-between gap-1 border-b border-dotted border-slate-300 pb-0.5">
                            <span className="font-bold text-slate-800">[P] Poor Flow:</span>
                            <span className="font-black text-slate-950 whitespace-nowrap">
                              {cleanPrintText(normalizeIpssFieldValue(ip.poorFlow || ip.poorStream)) || '—'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-1 border-b border-dotted border-slate-300 pb-0.5">
                            <span className="font-bold text-slate-800">[I] Intermittency:</span>
                            <span className="font-black text-slate-950 whitespace-nowrap">
                              {cleanPrintText(normalizeIpssFieldValue(ip.intermittency)) || '—'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-1 border-b border-dotted border-slate-300 pb-0.5">
                            <span className="font-bold text-slate-800">[S] Straining:</span>
                            <span className="font-black text-slate-950 whitespace-nowrap">
                              {cleanPrintText(normalizeIpssFieldValue(ip.straining)) || '—'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-1 border-b border-dotted border-slate-300 pb-0.5">
                            <span className="font-bold text-slate-800">[S] Incomplete Evac:</span>
                            <span className="font-black text-slate-950 whitespace-nowrap">
                              {cleanPrintText(normalizeIpssFieldValue(ip.incompleteEvacuation)) || '—'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* LEFT 4: Negative History / Clinical History Checklist */}
                  {checklistItems.length > 0 && (
                    <div className="space-y-1 pt-1">
                      <div className="font-black text-[11px] uppercase tracking-wider text-slate-950 border-b border-slate-300 pb-0.5">
                        Negative / History Checklist
                      </div>
                      <div className="pt-0.5 text-[10.5px] leading-snug text-slate-800 grid grid-cols-2 gap-x-2 gap-y-1">
                        {checklistItems.map((ci, idx) => (
                          <div
                            key={idx}
                            className="flex items-baseline gap-1 whitespace-nowrap tracking-tight"
                          >
                            <span className="font-medium text-slate-700">&bull; {ci.label}:</span>
                            <span className="font-bold text-slate-950">{ci.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* LEFT 5: EXAMINATION */}
                  {(!hideEmptySections || examLines.length > 0) && (
                    <div className="space-y-1 pt-1">
                      <div className="font-black text-[12px] uppercase tracking-wider text-slate-950">
                        EXAMINATION
                      </div>

                      <div className="pl-0.5 space-y-1">
                        <div className="font-bold text-slate-800 text-[11.5px]">O/E:</div>
                        {examLines.length > 0 ? (
                          <div className="space-y-1 pl-1">
                            {examLines.map((ex, idx) => (
                              <div key={idx} className="leading-snug">
                                <span className="font-bold text-slate-900">{ex.label}: </span>
                                <span className="text-slate-800 font-medium">{ex.value}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="space-y-2 pt-1">
                            <div className="border-b border-slate-300 h-4" />
                            <div className="border-b border-slate-300 h-4" />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* RIGHT COLUMN (7 Cols) */}
                <div className="col-span-7 min-w-0 space-y-3.5">
                  {/* RIGHT 1: Previous Investigations */}
                  {showInvestigations &&
                    (() => {
                      const invTable = buildDateWiseInvestigationTable(c, allConsultations);
                      const hasTable = invTable.rows.length > 0;
                      if (!hasTable && reportedInvestigations.length === 0) return null;

                      return (
                        <div className="space-y-1.5">
                          <div className="font-black text-[12px] uppercase tracking-wider text-slate-950">
                            Previous Investigations (Lab Tests &amp; Imaging)
                          </div>

                          {hasTable ? (
                            <DateWiseInvestigationTable
                              consultation={c}
                              allConsultations={allConsultations}
                              printMode
                              printScope={investigationsPrintMode}
                            />
                          ) : (
                            <ol className="space-y-0.5 pl-0.5">
                              {reportedInvestigations.map((inv, idx) => (
                                <li key={idx} className="flex items-start gap-1.5 leading-snug">
                                  <span className="font-bold text-slate-900 shrink-0">{idx + 1}.</span>
                                  <span className="text-slate-900 font-medium">{inv}</span>
                                </li>
                              ))}
                            </ol>
                          )}
                        </div>
                      );
                    })()}

                  {/* RIGHT 2: PAST MEDICATION / COMORBIDITIES */}
                  {(!hideEmptySections || pastMedAndComorbidities.length > 0) && (
                    <div className="space-y-0.5 pt-1">
                      <div className="font-black text-[12px] uppercase tracking-wider text-slate-950">
                        PAST MEDICATION / COMORBIDITIES
                      </div>
                      {pastMedAndComorbidities.length > 0 ? (
                        <div className="text-slate-900 font-medium pl-0.5 leading-snug">
                          {pastMedAndComorbidities.join('  •  ')}
                        </div>
                      ) : (
                        <div className="border-b border-slate-300 h-4" />
                      )}
                    </div>
                  )}

                  {/* RIGHT 3: DIAGNOSIS */}
                  {(!hideEmptySections || Boolean(deduplicatedDiagnosis)) && (
                    <div className="space-y-0.5 pt-1">
                      <div className="font-black text-[12px] uppercase tracking-wider text-slate-950">
                        DIAGNOSIS
                      </div>
                      {deduplicatedDiagnosis ? (
                        <div className="text-[13px] font-black text-slate-950 pl-0.5">
                          &Delta; {deduplicatedDiagnosis}
                        </div>
                      ) : (
                        <div className="border-b border-slate-300 h-4" />
                      )}
                    </div>
                  )}

                  {/* RIGHT 4: Advised Investigations */}
                  {(!hideEmptySections || toldInvestigations.length > 0) && (
                    <div className="space-y-1 pt-1">
                      <div className="font-black text-[12px] uppercase tracking-wider text-slate-950">
                        Advised Investigations
                      </div>
                      {toldInvestigations.length > 0 ? (
                        <div className="text-slate-900 font-semibold leading-snug pl-0.5">
                          {toldInvestigations.join('; ')}
                        </div>
                      ) : (
                        <div className="border-b border-slate-300 h-4" />
                      )}
                    </div>
                  )}

                  {/* RIGHT 5 & 6 (ONLY in 'column' layout — in 'split' layout these render full-width below!) */}
                  {printLayout === 'column' && (
                    <>
                      {(prescriptions.length > 0 || hasText(c.prescriptionsSummaryText)) && (
                        <div className="space-y-2 pt-1">
                          <div className="font-black text-[12.5px] uppercase tracking-wider text-slate-950 border-b border-slate-400 pb-0.5">
                            MEDICATIONS (Rx)
                          </div>

                          {prescriptions.length > 0 ? (
                            <div className="space-y-2 pt-1">
                              {prescriptions.map((rx, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-start gap-2 pb-1.5 border-b border-slate-200 last:border-b-0"
                                >
                                  <span className="font-black text-[12px] text-slate-950 shrink-0 mt-0.5">
                                    {idx + 1}.
                                  </span>
                                  <div className="flex-1">
                                    <div className="flex items-baseline justify-between gap-2 flex-wrap">
                                      <span className="font-black text-[13px] text-slate-950">
                                        {cleanPrintText(rx.medicine || rx.drugName)}
                                        {hasText(rx.dosage || rx.dosageStrength)
                                          ? `  ${cleanPrintText(rx.dosage || rx.dosageStrength)}`
                                          : ''}
                                      </span>
                                      <span className="font-mono font-bold text-[12px] text-slate-900">
                                        {cleanPrintText(rx.frequency)}
                                        {hasText(rx.duration) ? `  ×  ${cleanPrintText(rx.duration)}` : ''}
                                      </span>
                                    </div>
                                    <div className="text-[11px] text-slate-700 font-medium flex items-center gap-3 mt-0.5">
                                      {hasText(rx.when || rx.timing) && (
                                        <span>&bull; Timing: {cleanPrintText(rx.when || rx.timing)}</span>
                                      )}
                                      {hasText(rx.notes || rx.instructions) && (
                                        <span>&bull; Note: {cleanPrintText(rx.notes || rx.instructions)}</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-slate-900 font-medium whitespace-pre-wrap pl-1">
                              {splitIntoItems(c.prescriptionsSummaryText).join('\n')}
                            </div>
                          )}
                        </div>
                      )}

                      {(!hideEmptySections || planLines.length > 0) && (
                        <div className="space-y-1 pt-1">
                          <div className="font-black text-[12px] uppercase tracking-wider text-slate-950">
                            PLAN
                          </div>
                          {planLines.length > 0 ? (
                            <ul className="list-disc list-inside space-y-0.5 text-slate-900 font-semibold pl-0.5">
                              {planLines.map((pl, idx) => (
                                <li key={idx} className="leading-snug">
                                  {pl}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="border-b border-slate-300 h-4" />
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* BOTTOM FULL-WIDTH Rx + ADVICE / ASSESSMENT / FOLLOW-UP (Used in 'split' layout) */}
              {printLayout === 'split' && (
                <div className="border-t border-slate-300 pt-1">
                  {renderFullWidthRxAndAdvice()}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 4. SIGN-OFF & OPTIONAL LETTERHEAD FOOTER */}
        <div className="pt-3 mt-4">
          <div className="flex justify-end pb-2 pr-2">
            <div className="text-right">
              <div className="text-[11px] font-bold text-slate-800">
                {doctorName || c.doctorName}
              </div>
              <div className="text-[9.5px] text-slate-600 font-medium">
                {doctorSuperSpec || departmentTitle || 'Consultant Physician'}
              </div>
              {doctorRegNo && (
                <div className="text-[9px] font-mono text-slate-500">Reg. No: {doctorRegNo}</div>
              )}
            </div>
          </div>

          {!preprintedStationery && (
            <>
              <div className="h-1 w-full bg-gradient-to-r from-[#008075] via-[#00685e] to-[#1b365d] mb-2" />

              <div className="flex flex-wrap items-end justify-between gap-3 text-[9px] leading-tight text-slate-700">
                <div className="space-y-0.5 max-w-[60%]">
                  <div className="text-[11px] font-extrabold text-[#1b365d] tracking-tight">
                    {hospitalName || 'Medical Clinic'}
                  </div>
                  {clinicAddress && <div>{clinicAddress}</div>}
                </div>

                <div className="text-right space-y-0.5">
                  {clinicPhone && <div>Phone: {clinicPhone}</div>}
                  {clinicEmail && <div>E-mail: {clinicEmail}</div>}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const DetailedOtNotesA4Sheet: React.FC<{
  consultation: Consultation;
  procedureNumber?: number;
  totalProcedures?: number;
  isChronologicalMode?: boolean;
  departmentTitle: string;
  doctorName: string;
  doctorDegrees: string;
  doctorSuperSpec: string;
  doctorRegNo: string;
  preprintedStationery: boolean;
  bodyFontSizeClass: string;
}> = ({
  consultation: c,
  procedureNumber = 1,
  totalProcedures = 1,
  isChronologicalMode = false,
  departmentTitle,
  doctorName,
  doctorDegrees,
  doctorSuperSpec,
  doctorRegNo,
  preprintedStationery,
  bodyFontSizeClass,
}) => {
  const ot = c.otNotes || {};
  const surgeryDateStr = formatIndianDate(ot.surgeryDate || c.date);
  const preOpDx = cleanPrintText(ot.preOpDiagnosis || c.diagnosis);
  const postOpDx = cleanPrintText(ot.postOpDiagnosis || ot.preOpDiagnosis || c.diagnosis);
  const findingsList = splitOperativeTextIntoLines(ot.operativeFindings);
  const stepsList = splitOperativeTextIntoLines(ot.operativeSteps);
  const postOpList = splitIntoItems(ot.postOpOrders);

  return (
    <div className="a4-sheet-wrapper">
      {isChronologicalMode && totalProcedures > 1 && (
        <div className="no-print-stationery-guide mb-2 px-4 py-1.5 bg-[#FEF3C7] text-amber-950 border border-[#FCD34D] rounded-t-xl flex items-center justify-between text-xs font-bold shadow-xs">
          <span className="flex items-center gap-2">
            <Scissors className="w-3.5 h-3.5 text-amber-800" />
            <span>
              OT PROCEDURE #{procedureNumber} — SURGERY DATE: {surgeryDateStr}
            </span>
          </span>
          <span className="text-amber-900 font-semibold truncate max-w-md">
            {cleanPrintText(ot.procedureName) || postOpDx || 'Operative Notes'}
          </span>
        </div>
      )}
      <div
        style={{
          width: '210mm',
          minHeight: '297mm',
          padding: preprintedStationery ? '10mm 12mm 28mm 12mm' : '10mm 12mm 8mm 12mm',
          boxSizing: 'border-box',
        }}
        className={`a4-printable-sheet bg-white text-slate-900 shadow-2xl flex flex-col justify-between font-sans ${bodyFontSizeClass}`}
      >
        <div className="space-y-4">
          {/* 1. HEADER AREA */}
          <div className="grid grid-cols-12 items-start gap-3 pb-2.5 border-b-2 border-slate-900">
            <div className="col-span-3 flex flex-col items-start justify-center pt-1">
              {hasText(ot.hospitalName) && (
                <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-900">
                  {cleanPrintText(ot.hospitalName)}
                </div>
              )}
            </div>

            <div className="col-span-6 text-center space-y-0.5 pt-0.5">
              <div className="font-extrabold text-[13px] tracking-wider uppercase text-slate-900">
                {departmentTitle}
              </div>
              <div className="text-[15px] font-black tracking-wide text-slate-950 uppercase pt-0.5">
                {doctorName || ot.surgeonName || c.doctorName}
              </div>
              {doctorDegrees && (
                <div className="text-[11.5px] font-semibold text-slate-800">{doctorDegrees}</div>
              )}
              {doctorSuperSpec && (
                <div className="text-[11.5px] font-bold text-slate-900">{doctorSuperSpec}</div>
              )}
              {doctorRegNo && (
                <div className="text-[11px] font-mono font-bold text-slate-800 pt-0.5">
                  {doctorRegNo}
                </div>
              )}
            </div>

            <div className="col-span-3 flex flex-col items-end justify-between h-full gap-1.5">
              <div className="px-2.5 py-1 border border-slate-900 text-[11px] font-black uppercase tracking-wider text-slate-950">
                OPERATION THEATRE NOTES
              </div>
              <div className="w-full text-right pr-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 mr-1.5">
                  SURGERY DATE:
                </span>
                <span className="text-[12.5px] font-mono font-black text-slate-950">
                  {surgeryDateStr}
                </span>
              </div>
              {(() => {
                const rawTime = String(ot.surgeryTime || '').trim();
                const isLeakedBlankTime =
                  /\b(keep\s+.*\bblank|empty\s+string|omitted|is\s+blank|blank\s+on\s+sheet|time\s+of\s+incision)\b/i.test(
                    rawTime
                  );
                const cleanTime = isLeakedBlankTime ? '' : cleanPrintText(rawTime);
                return cleanTime ? (
                  <div className="w-full text-right pr-1 text-[11px] font-mono text-slate-700">
                    Time: <strong>{cleanTime}</strong>
                  </div>
                ) : null;
              })()}
            </div>
          </div>

          {/* 2. PATIENT DEMOGRAPHICS & HOSPITAL BAR */}
          <div className="grid grid-cols-12 gap-2 border-b border-slate-400 pb-2.5 text-[12.5px]">
            <div className="col-span-6 flex items-baseline gap-2">
              <span className="font-bold text-slate-700 uppercase text-[11px]">Patient Name:</span>
              <span className="font-black text-slate-950 text-[14px] uppercase">
                {formatPatientFullName(c.salutation, c.patientName)}
              </span>
              {hasText(cleanExplicitOpdNo(c.opdNo)) && (
                <span className="text-[11px] font-mono text-slate-600">
                  ({cleanPrintText(cleanExplicitOpdNo(c.opdNo))})
                </span>
              )}
            </div>
            <div className="col-span-3 flex items-baseline gap-1.5">
              <span className="font-bold text-slate-700 uppercase text-[11px]">Age / Sex:</span>
              <span className="font-black text-slate-950">
                {[cleanPrintText(c.age), cleanPrintText(c.gender)].filter(Boolean).join(' / ') || '—'}
              </span>
            </div>
            <div className="col-span-3 text-right">
              {hasText(ot.hospitalName) ? (
                <span className="text-[11.5px] font-bold text-slate-900">
                  Centre: {cleanPrintText(ot.hospitalName)}
                </span>
              ) : hasText(c.phoneNumber || c.contactNumber) ? (
                <span className="text-[11px] font-mono text-slate-700">
                  Ph: <strong>{cleanPrintText(c.phoneNumber || c.contactNumber)}</strong>
                </span>
              ) : null}
            </div>
          </div>

          {/* 3. PROCEDURE & DIAGNOSIS SUMMARY TABLE */}
          <div className="border border-slate-800 rounded-xs overflow-hidden text-[12px]">
            <div className="p-2.5 bg-slate-100 border-b border-slate-400 flex items-baseline gap-2">
              <span className="font-black uppercase tracking-wider text-slate-800 text-[11px] shrink-0 w-40">
                OPERATION PERFORMED:
              </span>
              <span className="font-black text-[14px] text-slate-950">
                {cleanPrintText(ot.procedureName) || 'Surgical Procedure'}
              </span>
            </div>

            <div className="grid grid-cols-2 border-b border-slate-300">
              <div className="p-2 border-r border-slate-300">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                  Pre-Operative Diagnosis
                </div>
                <div className="font-bold text-slate-950 mt-0.5">{preOpDx || '—'}</div>
              </div>
              <div className="p-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                  Post-Operative Diagnosis
                </div>
                <div className="font-bold text-slate-950 mt-0.5">{postOpDx || '—'}</div>
              </div>
            </div>

            <div className="grid grid-cols-5 text-[11px]">
              <div className="p-2 border-r border-slate-300">
                <div className="text-[9.5px] font-bold uppercase text-slate-600">Surgeon</div>
                <div className="font-bold text-slate-950 mt-0.5">
                  {cleanPrintText(ot.surgeonName || doctorName || c.doctorName) || '—'}
                </div>
              </div>
              <div className="p-2 border-r border-slate-300">
                <div className="text-[9.5px] font-bold uppercase text-slate-600">Assistant</div>
                <div className="font-semibold text-slate-900 mt-0.5">
                  {cleanPrintText(ot.assistantName) || '—'}
                </div>
              </div>
              <div className="p-2 border-r border-slate-300">
                <div className="text-[9.5px] font-bold uppercase text-slate-600">Anaesthetist</div>
                <div className="font-semibold text-slate-900 mt-0.5">
                  {cleanPrintText(ot.anaesthetistName) || '—'}
                </div>
              </div>
              <div className="p-2 border-r border-slate-300">
                <div className="text-[9.5px] font-bold uppercase text-slate-600">Anaesthesia</div>
                <div className="font-bold text-slate-950 mt-0.5">
                  {cleanPrintText(ot.anaesthesiaType) || '—'}
                </div>
              </div>
              <div className="p-2">
                <div className="text-[9.5px] font-bold uppercase text-slate-600">Position</div>
                <div className="font-bold text-slate-950 mt-0.5">
                  {cleanPrintText(ot.patientPosition) || '—'}
                </div>
              </div>
            </div>
          </div>

          {/* 4. INTRA-OPERATIVE FINDINGS */}
          <div className="space-y-1.5 pt-1">
            <div className="font-black text-[12.5px] uppercase tracking-wider text-slate-950 border-b border-slate-400 pb-0.5">
              INTRA-OPERATIVE FINDINGS
            </div>
            {findingsList.length > 0 ? (
              <ul className="list-disc list-inside space-y-1 text-slate-900 font-medium pl-1">
                {findingsList.map((f, i) => (
                  <li key={i} className="leading-snug">
                    {f}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-slate-500 text-xs italic pl-1">Not specified</div>
            )}
          </div>

          {/* 5. OPERATIVE STEPS / PROCEDURE DETAILS */}
          <div className="space-y-1.5 pt-1">
            <div className="font-black text-[12.5px] uppercase tracking-wider text-slate-950 border-b border-slate-400 pb-0.5">
              OPERATIVE STEPS &amp; PROCEDURE NOTES
            </div>
            {stepsList.length > 0 ? (
              <ol className="list-decimal list-inside space-y-1 text-slate-900 font-medium pl-1">
                {stepsList.map((step, i) => (
                  <li key={i} className="leading-snug">
                    {step}
                  </li>
                ))}
              </ol>
            ) : (
              <div className="text-slate-500 text-xs italic pl-1">Not specified</div>
            )}
          </div>

          {/* 6. CATHETER / DJ STENT, BLOOD LOSS, COMPLICATIONS & SPECIMEN */}
          <div className="grid grid-cols-2 gap-3 pt-1 text-[11.5px]">
            <div className="p-2.5 border border-slate-300 space-y-1">
              <div>
                <span className="font-black uppercase text-[10.5px] text-slate-700">
                  Catheter / DJ Stent / Drain:{' '}
                </span>
                <span className="font-bold text-slate-950">
                  {cleanPrintText(ot.catheterOrStentDetails || ot.drainDetails) || '—'}
                </span>
              </div>
              <div>
                <span className="font-black uppercase text-[10.5px] text-slate-700">
                  Specimen Sent:{' '}
                </span>
                <span className="font-semibold text-slate-900">
                  {cleanPrintText(ot.specimenSent) || 'Nil'}
                </span>
              </div>
            </div>

            <div className="p-2.5 border border-slate-300 space-y-1">
              <div>
                <span className="font-black uppercase text-[10.5px] text-slate-700">
                  Estimated Blood Loss:{' '}
                </span>
                <span className="font-semibold text-slate-900">
                  {cleanPrintText(ot.estimatedBloodLoss) || 'Minimal'}
                </span>
              </div>
              <div>
                <span className="font-black uppercase text-[10.5px] text-slate-700">
                  Intra-Op Complications:{' '}
                </span>
                <span className="font-semibold text-slate-900">
                  {cleanPrintText(ot.intraOpComplications) || 'None / Uneventful'}
                </span>
              </div>
            </div>
          </div>

          {/* 7. POST-OPERATIVE ORDERS & MEDICATIONS */}
          <div className="space-y-1.5 pt-1">
            <div className="font-black text-[12.5px] uppercase tracking-wider text-slate-950 border-b border-slate-400 pb-0.5">
              POST-OPERATIVE ORDERS &amp; ADVICE
            </div>
            {postOpList.length > 0 ? (
              <ul className="list-disc list-inside space-y-1 text-slate-900 font-semibold pl-1">
                {postOpList.map((po, i) => (
                  <li key={i} className="leading-snug">
                    {po}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-slate-500 text-xs italic pl-1">As per standard ward protocol</div>
            )}

            {hasText(ot.freelanceNotes || ot.implantsOrConsumables) && (
              <div className="pt-1 text-[11px] text-slate-800 pl-1">
                <span className="font-bold">Implants / Remarks: </span>
                <span>{cleanPrintText(ot.freelanceNotes || ot.implantsOrConsumables)}</span>
              </div>
            )}
          </div>

          {/* 7B. HAND-DRAWN SURGICAL DIAGRAM / INTRA-OP SKETCH (KEPT AS-IS) */}
          {Array.isArray(ot.handDrawnDiagrams) && ot.handDrawnDiagrams.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <div className="font-black text-[11.5px] uppercase tracking-wider text-slate-950 border-b border-slate-400 pb-0.5">
                HAND-DRAWN SURGICAL DIAGRAM / OPERATIVE SKETCH
              </div>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                {ot.handDrawnDiagrams.slice(0, 1).map((diagUrl, dIdx) => (
                  <div
                    key={dIdx}
                    className="border border-slate-300 rounded-xs p-1 bg-white inline-flex flex-col items-center"
                  >
                    <img
                      src={diagUrl}
                      alt="Surgical Diagram"
                      className="max-h-[48mm] max-w-[90mm] object-contain"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 8. SURGEON SIGN-OFF */}
        <div className="pt-4 mt-4 border-t border-slate-300 flex items-end justify-between">
          <div className="text-[10px] text-slate-600">
            {hasText(ot.hospitalName) && (
              <div>Surgical Centre: <strong>{cleanPrintText(ot.hospitalName)}</strong></div>
            )}
            <div>Printed on: {formatIndianDate(new Date().toISOString().split('T')[0])}</div>
          </div>
          <div className="text-right pr-2">
            <div className="text-[11.5px] font-black text-slate-900 uppercase">
              {doctorName || ot.surgeonName || c.doctorName}
            </div>
            <div className="text-[10px] text-slate-700 font-semibold">
              {doctorSuperSpec || departmentTitle || 'Operating Surgeon'}
            </div>
            {doctorRegNo && (
              <div className="text-[9.5px] font-mono text-slate-600">Reg. No: {doctorRegNo}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

interface IpdSummaryA4SheetProps {
  patient: IpdPatientRecord;
  sheetNumber: number;
  totalSheets: number;
  departmentTitle: string;
  doctorName: string;
  doctorDegrees: string;
  doctorSuperSpec: string;
  doctorRegNo: string;
  preprintedStationery: boolean;
  bodyFontSizeClass: string;
}

const IpdSummaryA4Sheet: React.FC<IpdSummaryA4SheetProps> = ({
  patient,
  sheetNumber,
  totalSheets,
  departmentTitle,
  doctorName,
  doctorDegrees,
  doctorSuperSpec,
  doctorRegNo,
  preprintedStationery,
  bodyFontSizeClass,
}) => {
  const ds = patient.dischargeSummary;
  const dischDate = patient.dischargeDate || ds?.dischargeDate || '';
  const isDischarged = patient.status === 'discharged' || Boolean(ds);

  return (
    <div
      className="a4-case-sheet bg-white text-black shadow-2xl border border-slate-300 relative mx-auto"
      style={{
        width: '210mm',
        minHeight: '297mm',
        padding: preprintedStationery ? '32mm 14mm 14mm 14mm' : '12mm 14mm 14mm 14mm',
        boxSizing: 'border-box',
        fontFamily: 'Arial, Helvetica, sans-serif',
      }}
    >
      {!preprintedStationery && (
        <div className="border-b-2 border-black pb-2 mb-3 flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
              {patient.hospitalName || departmentTitle}
            </div>
            <div className="text-base font-extrabold text-black mt-0.5">{doctorName}</div>
            <div className="text-[10px] text-slate-700">
              {[doctorDegrees, doctorSuperSpec].filter(Boolean).join(' · ')}
            </div>
          </div>
          <div className="text-right text-[10px] text-slate-700">
            <div className="font-bold uppercase tracking-wider text-black">
              {isDischarged ? 'IPD Discharge Summary' : 'IPD In-Patient Record'}
            </div>
            {doctorRegNo && <div className="font-mono mt-0.5">Reg: {doctorRegNo}</div>}
          </div>
        </div>
      )}

      {/* Sheet Title & Page Indicator */}
      <div className="flex items-center justify-between border-b border-black pb-1.5 mb-3">
        <div className="text-sm font-extrabold uppercase tracking-wide">
          {isDischarged ? 'IPD Admission & Discharge Summary' : 'IPD Admission Summary'}
        </div>
        <div className="text-[10px] font-mono text-slate-700">
          Consolidated Sheet {sheetNumber} of {totalSheets}
        </div>
      </div>

      {/* Patient & Admission Demographics Box */}
      <div
        className={`grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 border border-black/80 p-2.5 mb-3 ${bodyFontSizeClass}`}
      >
        <div>
          <span className="font-bold">Patient: </span>
          <span>
            {patient.salutation ? `${patient.salutation} ` : ''}
            {patient.patientName}
          </span>
        </div>
        <div>
          <span className="font-bold">Age / Sex: </span>
          <span>
            {patient.age ? `${patient.age} Yrs` : '—'} / {patient.gender || '—'}
          </span>
        </div>
        {(patient.ipdNo?.trim() || patient.uhid?.trim()) && (
          <div>
            <span className="font-bold">
              {patient.ipdNo?.trim() && patient.uhid?.trim()
                ? 'IPD / UHID: '
                : patient.ipdNo?.trim()
                ? 'IP NO: '
                : 'UHID: '}
            </span>
            <span className="font-mono">
              {[patient.ipdNo?.trim(), patient.uhid?.trim()].filter(Boolean).join(' / ')}
            </span>
          </div>
        )}
        <div>
          <span className="font-bold">Admission Date: </span>
          <span className="font-mono">{formatDisplayDate(patient.admissionDate)}</span>
        </div>
        <div>
          <span className="font-bold">Discharge Date: </span>
          <span className="font-mono">
            {dischDate ? formatDisplayDate(dischDate) : patient.status === 'admitted' ? 'Admitted (In-Ward)' : '—'}
          </span>
        </div>
        <div>
          <span className="font-bold">Ward / Bed: </span>
          <span>{patient.wardOrBed || '—'}</span>
        </div>
      </div>

      {/* Clinical Content */}
      <div className={`space-y-2.5 leading-relaxed ${bodyFontSizeClass}`}>
        <div>
          <div className="font-extrabold uppercase text-[10.5px] border-b border-slate-300 pb-0.5 mb-1">
            Diagnosis
          </div>
          <div className="font-bold">
            {ds?.finalDiagnosis || patient.admittingDiagnosis || 'Not specified'}
          </div>
        </div>

        {(ds?.procedurePerformed || patient.otNotes?.procedureName) && (
          <div>
            <div className="font-extrabold uppercase text-[10.5px] border-b border-slate-300 pb-0.5 mb-1">
              Procedure Performed with Date
            </div>
            <div className="whitespace-pre-wrap font-semibold">
              {ds?.procedurePerformed ||
                [
                  patient.otNotes?.procedureName,
                  patient.otNotes?.surgeryDate
                    ? `— ${formatDisplayDate(patient.otNotes.surgeryDate)}`
                    : '',
                  patient.otNotes?.anaesthesiaType
                    ? `— Anaesthesia: ${patient.otNotes.anaesthesiaType}`
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
            </div>
          </div>
        )}

        {(ds?.chiefComplaintsAndHistory || patient.clinicalSummary) && (
          <div>
            <div className="font-extrabold uppercase text-[10.5px] border-b border-slate-300 pb-0.5 mb-1">
              Presenting History
            </div>
            <div className="whitespace-pre-wrap">
              {ds?.chiefComplaintsAndHistory || patient.clinicalSummary}
            </div>
          </div>
        )}

        {deduplicateExaminationText(ds?.examinationOnAdmission) && (
          <div>
            <div className="font-extrabold uppercase text-[10.5px] border-b border-slate-300 pb-0.5 mb-1">
              Examination on Admission
            </div>
            <div className="whitespace-pre-wrap">
              {deduplicateExaminationText(ds?.examinationOnAdmission)}
            </div>
          </div>
        )}

        {ds?.keyInvestigations && (
          <div>
            <div className="font-extrabold uppercase text-[10.5px] border-b border-slate-300 pb-0.5 mb-1">
              Investigations
            </div>
            <div className="whitespace-pre-wrap">{ds.keyInvestigations}</div>
          </div>
        )}

        {ds?.hospitalCourse && (
          <div>
            <div className="font-extrabold uppercase text-[10.5px] border-b border-slate-300 pb-0.5 mb-1">
              Course in Ward
            </div>
            <div className="whitespace-pre-wrap text-justify">{ds.hospitalCourse}</div>
          </div>
        )}

        {(ds?.otNotesSummary || patient.otNotes?.operativeFindings || patient.otNotes?.operativeSteps) && (
          <div>
            <div className="font-extrabold uppercase text-[10.5px] border-b border-slate-300 pb-0.5 mb-1">
              OT Notes
            </div>
            <div className="space-y-0.5">
              {splitOperativeTextIntoLines(
                ds?.otNotesSummary ||
                  [patient.otNotes?.operativeFindings, patient.otNotes?.operativeSteps]
                    .filter(Boolean)
                    .join('\n')
              ).map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          </div>
        )}

        {ds?.treatmentGivenInWard && ds.treatmentGivenInWard.length > 0 && (
          <div>
            <div className="font-extrabold uppercase text-[10.5px] border-b border-slate-300 pb-0.5 mb-1">
              Treatment Given in Ward
            </div>
            <table className="w-full border-collapse border border-black/60 text-[10.5px]">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-black/50 px-1.5 py-1 text-left w-7">#</th>
                  <th className="border border-black/50 px-1.5 py-1 text-left">Medicine</th>
                  <th className="border border-black/50 px-1.5 py-1 text-left">Route</th>
                  <th className="border border-black/50 px-1.5 py-1 text-left">Frequency</th>
                  <th className="border border-black/50 px-1.5 py-1 text-left">Duration / Dates</th>
                  <th className="border border-black/50 px-1.5 py-1 text-left">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {ds.treatmentGivenInWard.map((t, idx) => (
                  <tr key={idx}>
                    <td className="border border-black/40 px-1.5 py-1 font-mono">{idx + 1}</td>
                    <td className="border border-black/40 px-1.5 py-1 font-bold">
                      {t.medicine}
                      {t.dosage ? ` (${t.dosage})` : ''}
                    </td>
                    <td className="border border-black/40 px-1.5 py-1">{t.route || '—'}</td>
                    <td className="border border-black/40 px-1.5 py-1">{t.frequency || '—'}</td>
                    <td className="border border-black/40 px-1.5 py-1">
                      {t.durationOrDates || '—'}
                    </td>
                    <td className="border border-black/40 px-1.5 py-1">{t.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {ds?.conditionAtDischarge && (
          <div>
            <span className="font-extrabold uppercase text-[10.5px]">Condition on Discharge: </span>
            <span>{ds.conditionAtDischarge}</span>
          </div>
        )}

        {ds && ds.dischargeMedications && ds.dischargeMedications.length > 0 && (
          <div>
            <div className="font-extrabold uppercase text-[10.5px] border-b border-slate-300 pb-0.5 mb-1">
              Discharge Medications
            </div>
            <table className="w-full border-collapse border border-black/60 text-[10.5px]">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-black/50 px-1.5 py-1 text-left w-7">#</th>
                  <th className="border border-black/50 px-1.5 py-1 text-left">Medicine</th>
                  <th className="border border-black/50 px-1.5 py-1 text-left">Dosage / Freq</th>
                  <th className="border border-black/50 px-1.5 py-1 text-left">Duration</th>
                  <th className="border border-black/50 px-1.5 py-1 text-left">Notes</th>
                </tr>
              </thead>
              <tbody>
                {ds.dischargeMedications.map((m, idx) => (
                  <tr key={idx}>
                    <td className="border border-black/40 px-1.5 py-1 font-mono">{idx + 1}</td>
                    <td className="border border-black/40 px-1.5 py-1 font-bold">
                      {m.medicine || m.drugName}
                    </td>
                    <td className="border border-black/40 px-1.5 py-1">
                      {[m.dosage, m.frequency, m.when].filter(Boolean).join(' · ')}
                    </td>
                    <td className="border border-black/40 px-1.5 py-1">{m.duration || '—'}</td>
                    <td className="border border-black/40 px-1.5 py-1">{m.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {ds?.dietAndActivityAdvice && (
          <div>
            <div className="font-extrabold uppercase text-[10.5px] border-b border-slate-300 pb-0.5 mb-1">
              Diet, Wound &amp; Activity Advice
            </div>
            <div className="whitespace-pre-wrap">{ds.dietAndActivityAdvice}</div>
          </div>
        )}

        {ds?.redFlagWarnings && (
          <div>
            <div className="font-extrabold uppercase text-[10.5px] border-b border-slate-300 pb-0.5 mb-1">
              Urgent Return Warnings (Red Flags)
            </div>
            <div className="whitespace-pre-wrap">{ds.redFlagWarnings}</div>
          </div>
        )}

        {ds?.stentOrTubePlan && (
          <div>
            <div className="font-extrabold uppercase text-[10.5px] border-b border-slate-300 pb-0.5 mb-1">
              DJ Stent / Catheter / Drain &amp; HPE Plan
            </div>
            <div className="whitespace-pre-wrap">{ds.stentOrTubePlan}</div>
          </div>
        )}

        {ds?.followUpPlan && (
          <div>
            <div className="font-extrabold uppercase text-[10.5px] border-b border-slate-300 pb-0.5 mb-1">
              Follow-Up Plan
            </div>
            <div className="whitespace-pre-wrap">{ds.followUpPlan}</div>
          </div>
        )}
      </div>

      {/* Footer Signature */}
      <div className="mt-8 pt-4 flex items-end justify-between text-[10.5px] border-t border-slate-300">
        <div className="text-slate-600">
          {patient.attendingConsultant ? `Attending Consultant: ${patient.attendingConsultant}` : ''}
        </div>
        <div className="text-right">
          <div className="font-bold">{doctorName}</div>
          {doctorRegNo && <div className="font-mono text-[9.5px]">Reg: {doctorRegNo}</div>}
        </div>
      </div>
    </div>
  );
};

export const A4PrintModal: React.FC<A4PrintModalProps> = ({
  isOpen,
  onClose,
  consultation,
  allConsultations = [],
  ipdPatients = [],
  initialMode = 'single',
  initialDocType = 'opd',
  currentDoctor,
  onEditConsultation,
}) => {
  const printContainerRef = useRef<HTMLDivElement>(null);

  const [viewMode, setViewMode] = useState<'single' | 'consolidated'>(initialMode);
  const [docType, setDocType] = useState<'opd' | 'ot'>(initialDocType);
  const [sortOrder, setSortOrder] = useState<'chronological' | 'latest-first'>('latest-first');

  const initialCreds = useMemo(
    () => getActiveDoctorPrintCredentials(currentDoctor),
    [currentDoctor]
  );

  // Editable Doctor Header (initialized from currently logged-in doctor)
  const [departmentTitle, setDepartmentTitle] = useState(initialCreds.departmentTitle);
  const [doctorName, setDoctorName] = useState(initialCreds.doctorName);
  const [doctorDegrees, setDoctorDegrees] = useState(initialCreds.doctorDegrees);
  const [doctorSuperSpec, setDoctorSuperSpec] = useState(initialCreds.doctorSuperSpec);
  const [doctorRegNo, setDoctorRegNo] = useState(initialCreds.doctorRegNo);

  // Sync doctor credentials whenever the logged-in doctor changes or modal opens
  useEffect(() => {
    if (isOpen) {
      const creds = getActiveDoctorPrintCredentials(currentDoctor);
      setDepartmentTitle(creds.departmentTitle);
      setDoctorName(creds.doctorName);
      setDoctorDegrees(creds.doctorDegrees);
      setDoctorSuperSpec(creds.doctorSuperSpec);
      setDoctorRegNo(creds.doctorRegNo);
    }
  }, [isOpen, currentDoctor]);

  // Section visibility & layout adaptation controls
  const [preprintedStationery, setPreprintedStationery] = useState(true);
  const [ipssMode, setIpssMode] = useState<'auto' | 'show' | 'hide'>('auto');
  const [investigationsPrintMode, setInvestigationsPrintMode] = useState<
    'whole-table' | 'latest-only'
  >('whole-table');
  const [printLayout, setPrintLayout] = useState<PrintLayoutMode>('split');
  const [showInvestigations, setShowInvestigations] = useState(true);
  const [showVitalsInCo, setShowVitalsInCo] = useState(true);
  const [showHistoryChecklist, setShowHistoryChecklist] = useState(true);
  const [hideEmptySections, setHideEmptySections] = useState(true);
  const [fontScale, setFontScale] = useState<'compact' | 'normal' | 'large'>('normal');
  const [previewZoom, setPreviewZoom] = useState(0.85);

  const effectiveConsultation = useMemo(() => {
    if (!consultation) return null;
    if (isFalsePositiveOpdAsOtNotes(consultation.otNotes, consultation)) {
      return rescueOpdFromFalseOtNotes(consultation);
    }
    return consultation;
  }, [consultation]);

  const consolidatedList = useMemo(() => {
    if (!effectiveConsultation) return [];
    return getConsolidatedPatientConsultations(effectiveConsultation, allConsultations, sortOrder);
  }, [effectiveConsultation, allConsultations, sortOrder]);

  const consolidatedTimelineEntries = useMemo(() => {
    if (!effectiveConsultation) return [];
    return getPatientConsolidatedTimelineEntries(effectiveConsultation, allConsultations, sortOrder);
  }, [effectiveConsultation, allConsultations, sortOrder]);

  const patientOtEntries = useMemo(() => {
    if (!effectiveConsultation) return [];
    return getAllPatientOtProcedures(effectiveConsultation, allConsultations, sortOrder);
  }, [effectiveConsultation, allConsultations, sortOrder]);

  const patientIpdRecords = useMemo(() => {
    if (!effectiveConsultation || ipdPatients.length === 0) return [];
    const matched = findMatchingIpdRecordsForPatient(effectiveConsultation, ipdPatients);
    return [...matched].sort((a, b) => {
      const dateA = a.dischargeDate || a.admissionDate || '';
      const dateB = b.dischargeDate || b.admissionDate || '';
      return sortOrder === 'latest-first'
        ? dateB.localeCompare(dateA)
        : dateA.localeCompare(dateB);
    });
  }, [effectiveConsultation, ipdPatients, sortOrder]);

  const totalConsolidatedSheetsCount =
    consolidatedTimelineEntries.length + patientIpdRecords.length;
  const hasPreviousRecords =
    consolidatedTimelineEntries.length > 1 ||
    consolidatedList.length > 1 ||
    patientIpdRecords.length > 0;
  const hasMultipleOtProcedures = patientOtEntries.length >= 2;

  useEffect(() => {
    if (isOpen && effectiveConsultation) {
      const targetDocType =
        initialDocType === 'ot' && hasOtNotesData(effectiveConsultation) ? 'ot' : 'opd';
      setDocType(targetDocType);
      if (targetDocType === 'ot') {
        setViewMode(
          initialMode === 'consolidated' && patientOtEntries.length > 1
            ? 'consolidated'
            : 'single'
        );
      } else {
        setViewMode(
          initialMode === 'consolidated' &&
            (consolidatedTimelineEntries.length > 1 ||
              consolidatedList.length > 1 ||
              patientIpdRecords.length > 0)
            ? 'consolidated'
            : 'single'
        );
      }
    }
  }, [
    isOpen,
    effectiveConsultation,
    initialMode,
    initialDocType,
    consolidatedTimelineEntries.length,
    consolidatedList.length,
    patientOtEntries.length,
    patientIpdRecords.length,
  ]);

  if (!isOpen || !consultation || !effectiveConsultation) return null;

  const activePreviewEntries =
    docType === 'ot'
      ? viewMode === 'consolidated' && patientOtEntries.length > 0
        ? patientOtEntries
        : [
            {
              id: `ot-single-${effectiveConsultation.id}`,
              kind: 'ot' as const,
              date: effectiveConsultation.otNotes?.surgeryDate || effectiveConsultation.date,
              consultation: effectiveConsultation,
              otNotes: effectiveConsultation.otNotes,
              chronologicalIndex: 1,
            },
          ]
      : viewMode === 'consolidated' && consolidatedTimelineEntries.length > 0
      ? consolidatedTimelineEntries
      : [
          {
            id: `opd-single-${effectiveConsultation.id}`,
            kind: 'opd' as const,
            date: effectiveConsultation.date,
            consultation: effectiveConsultation,
            chronologicalIndex: 1,
          },
        ];

  const sheetsToRender = activePreviewEntries.map((e) => e.consultation);

  const bodyFontSizeClass =
    fontScale === 'compact'
      ? 'text-[11px] leading-snug'
      : fontScale === 'large'
      ? 'text-[13.5px] leading-relaxed'
      : 'text-[12px] leading-normal';

  const handlePrintA4 = () => {
    if (!printContainerRef.current) return;

    const sheetHtml = printContainerRef.current.innerHTML;
    const styleTags = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map((el) => el.outerHTML)
      .join('\n');

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      window.print();
      return;
    }

    const safePrintTitle = String(consultation?.patientName || 'Patient')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    doc.open();
    doc.write(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>OPD Case Sheet - ${safePrintTitle}</title>
    ${styleTags}
    <style>
      @page {
        size: A4 portrait;
        margin: 0mm;
      }
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        width: 210mm;
        background: #ffffff !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .a4-sheet-wrapper {
        page-break-after: always;
        break-after: page;
        margin: 0 !important;
        padding: 0 !important;
      }
      .a4-sheet-wrapper:last-child {
        page-break-after: auto;
        break-after: auto;
      }
      .a4-printable-sheet {
        width: 210mm !important;
        min-height: 297mm !important;
        max-height: 297mm !important;
        margin: 0 !important;
        box-shadow: none !important;
        border: none !important;
        transform: none !important;
      }
      .no-print-stationery-guide {
        display: none !important;
      }
    </style>
  </head>
  <body>
    ${sheetHtml}
  </body>
</html>`);
    doc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (e) {
        console.error('Iframe print fallback:', e);
        window.print();
      } finally {
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        }, 2000);
      }
    }, 350);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-1 sm:p-2">
      <div className="bg-[#FAF8F5] rounded-2xl w-[99vw] max-w-[1880px] h-[97vh] shadow-2xl border border-[#DFD8F0] overflow-hidden flex flex-col">
        {/* Top Action & Configuration Bar (Pastel Lavender-Sky Header) */}
        <div className="px-4 sm:px-5 py-2.5 bg-gradient-to-r from-[#F3EEFF] via-[#EDF6FF] to-[#ECFBF5] border-b border-[#DFD8F0] flex flex-wrap lg:flex-nowrap items-center justify-between gap-2.5 text-slate-800 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 shrink">
            <MedScribeLogo variant="icon" size="sm" />
            <div className="min-w-0">
              <h2 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                Prescription &amp; Case Sheet Print Preview
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-600 truncate">
                Patient:{' '}
                <strong className="text-slate-900 uppercase">
                  {(consultation.patientName || '').toUpperCase()}
                </strong>{' '}
                &bull;{' '}
                {viewMode === 'consolidated' ? (
                  <span>
                    Showing chronological{' '}
                    <strong className="text-teal-800">{activePreviewEntries.length}</strong>{' '}
                    {docType === 'ot' ? 'OT procedure notes' : 'OPD & OT notes'}
                  </span>
                ) : (
                  <span>
                    Date:{' '}
                    <strong className="text-slate-900">
                      {formatIndianDate(
                        docType === 'ot'
                          ? consultation.otNotes?.surgeryDate || consultation.date
                          : consultation.date
                      )}
                    </strong>
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 flex-nowrap overflow-x-auto max-w-full py-0.5 shrink-0">
            {/* Switch between OPD Case Sheet, Detailed OT Notes, and Consolidated Chronological History */}
            <div className="flex items-center gap-1 bg-white/85 p-1 rounded-xl border border-[#DFD8F0] text-xs shrink-0">
              <button
                type="button"
                onClick={() => {
                  setDocType('opd');
                  setViewMode('single');
                }}
                className={`px-2.5 py-1 rounded-lg font-bold transition-colors whitespace-nowrap cursor-pointer ${
                  docType === 'opd' && viewMode === 'single'
                    ? 'bg-[#DDD6FE] text-violet-950 border border-[#C4B5FD] shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                OPD Case Sheet
              </button>
              <button
                type="button"
                onClick={() => {
                  setDocType('ot');
                  setViewMode(hasMultipleOtProcedures ? 'consolidated' : 'single');
                }}
                className={`px-2.5 py-1 rounded-lg font-bold transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  docType === 'ot'
                    ? 'bg-[#FEF3C7] text-amber-950 border border-[#FCD34D] shadow-2xs'
                    : hasOtNotesData(consultation) || patientOtEntries.length > 0
                    ? 'text-amber-900 bg-[#FFFBEB] hover:bg-[#FEF3C7]'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Open Detailed A4 Operation Theatre (OT) Notes Sheet (includes previous OT procedures if > 1)"
              >
                <Scissors className="w-3.5 h-3.5 text-amber-800" />
                <span>
                  Detailed OT Notes
                  {hasMultipleOtProcedures ? ` (${patientOtEntries.length})` : ''}
                </span>
              </button>
              <button
                type="button"
                disabled={!hasPreviousRecords}
                onClick={() => {
                  if (hasPreviousRecords) {
                    setDocType('opd');
                    setViewMode('consolidated');
                  }
                }}
                className={`px-2.5 py-1 rounded-lg font-bold transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                  !hasPreviousRecords
                    ? 'text-slate-400 bg-slate-100 opacity-50 cursor-not-allowed'
                    : docType === 'opd' && viewMode === 'consolidated'
                    ? 'bg-[#D1FAE5] text-emerald-950 border border-[#6EE7B7] shadow-2xs cursor-pointer'
                    : 'text-slate-600 hover:text-slate-900 cursor-pointer'
                }`}
                title={
                  hasPreviousRecords
                    ? `View chronological OPD, IPD & OT history (${totalConsolidatedSheetsCount} sheets) for this patient in A4 print format`
                    : 'No previous consultation, IPD, or OT records found for this patient'
                }
              >
                <Layers className="w-3.5 h-3.5" />
                <span>
                  Consolidated{' '}
                  {hasPreviousRecords ? `(${totalConsolidatedSheetsCount})` : ''}
                </span>
              </button>
            </div>

            {/* Investigations Print Option (Latest 2 Dates vs Only Latest Reports) */}
            <div className="flex items-center gap-1 bg-white/85 p-1 rounded-xl border border-[#DFD8F0] text-xs shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowInvestigations(true);
                  setInvestigationsPrintMode('whole-table');
                }}
                className={`px-2.5 py-1 rounded-lg font-bold transition-colors whitespace-nowrap cursor-pointer ${
                  showInvestigations && investigationsPrintMode === 'whole-table'
                    ? 'bg-[#E1F7FC] text-[#244B70] border border-[#A9CFF7] shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Print up to the latest 5 dates of investigations in comparison table"
              >
                Latest 5 Dates
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowInvestigations(true);
                  setInvestigationsPrintMode('latest-only');
                }}
                className={`px-2.5 py-1 rounded-lg font-bold transition-colors whitespace-nowrap cursor-pointer ${
                  showInvestigations && investigationsPrintMode === 'latest-only'
                    ? 'bg-[#E1F7FC] text-[#244B70] border border-[#A9CFF7] shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Include only the latest investigation reports"
              >
                Only Latest Reports
              </button>
            </div>

            {/* Zoom Controls */}
            <div className="hidden sm:flex items-center gap-1 bg-white/85 px-2 py-1 rounded-xl border border-[#DFD8F0] text-xs shrink-0">
              <button
                type="button"
                onClick={() => setPreviewZoom((z) => Math.max(0.55, +(z - 0.1).toFixed(2)))}
                className="p-1 hover:bg-[#F3F0FA] rounded text-slate-600 cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="font-mono text-[11px] px-1 text-slate-700 font-semibold">
                {Math.round(previewZoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setPreviewZoom((z) => Math.min(1.15, +(z + 0.1).toFixed(2)))}
                className="p-1 hover:bg-[#F3F0FA] rounded text-slate-600 cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            {onEditConsultation && consultation && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEditConsultation(consultation);
                }}
                className="px-3 py-1.5 bg-[#E0F2FE] hover:bg-[#BAE6FD] text-sky-950 border border-[#7DD3FC] text-xs font-bold rounded-xl shadow-2xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer whitespace-nowrap shrink-0"
                title="Edit this patient consultation record"
              >
                <Edit3 className="w-3.5 h-3.5 text-sky-800" />
                <span>Edit</span>
              </button>
            )}

            <button
              type="button"
              onClick={handlePrintA4}
              className="px-3.5 py-1.5 bg-[#D1FAE5] hover:bg-[#A7F3D0] text-emerald-950 border border-[#6EE7B7] text-xs font-bold rounded-xl shadow-2xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Printer className="w-3.5 h-3.5 text-emerald-800" />
              <span>
                {activePreviewEntries.length > 1
                  ? `Print All (${activePreviewEntries.length} Sheets)`
                  : 'Print A4 Sheet'}
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                exportOpdSheetsToPdf(sheetsToRender, {
                  allConsultations,
                  docType,
                  isConsolidatedMode: viewMode === 'consolidated',
                  sortOrder,
                  departmentTitle,
                  doctorName,
                  doctorDegrees,
                  doctorSuperSpec,
                  doctorRegNo,
                  preprintedStationery,
                  ipssMode,
                  investigationsPrintMode,
                  printLayout,
                  showInvestigations,
                  showVitalsInCo,
                  showHistoryChecklist,
                  hideEmptySections,
                })
              }
              className="px-3.5 py-1.5 bg-[#DDD6FE] hover:bg-[#C4B5FD] text-violet-950 border border-[#C4B5FD] text-xs font-bold rounded-xl shadow-2xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer whitespace-nowrap shrink-0"
              title="Download Case Sheet as PDF in A4 Print Layout"
            >
              <Download className="w-3.5 h-3.5 text-violet-800" />
              <span>
                {activePreviewEntries.length > 1
                  ? `Export PDF (${activePreviewEntries.length} Sheets)`
                  : 'Export PDF'}
              </span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl bg-white/90 hover:bg-[#FFE4E6] text-slate-700 hover:text-rose-900 border border-[#DFD8F0] hover:border-rose-300 text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
              title="Close Print Preview"
            >
              <X className="w-4 h-4" />
              <span>Close</span>
            </button>
          </div>
        </div>

        {/* Main Workspace: Left Customization Sidebar + Right A4 Sheet Canvas */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12">
          {/* Left Sidebar: Section & Layout Adjustments (Pastel Lavender-Cream Sidebar) */}
          <div className="lg:col-span-3 bg-[#F6F4FB] border-b lg:border-b-0 lg:border-r border-[#E2DCF0] p-4 overflow-y-auto space-y-4 text-xs text-slate-700">
            {(viewMode === 'consolidated' || activePreviewEntries.length > 1) && (
              <div className="p-3 rounded-xl bg-[#ECFBF5] border border-[#A7F3D0] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-emerald-950 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-emerald-700" />
                    {docType === 'ot'
                      ? `Chronological OT Notes (${activePreviewEntries.length})`
                      : `Chronological OPD & OT (${activePreviewEntries.length})`}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setSortOrder((prev) =>
                        prev === 'chronological' ? 'latest-first' : 'chronological'
                      )
                    }
                    className="px-2 py-0.5 rounded bg-white hover:bg-[#D1FAE5] text-emerald-900 text-[10px] font-semibold flex items-center gap-1 border border-[#6EE7B7] cursor-pointer"
                    title="Reverse chronological order"
                  >
                    <ArrowUpDown className="w-3 h-3" />
                    <span>{sortOrder === 'chronological' ? 'Oldest → Latest' : 'Latest → Oldest'}</span>
                  </button>
                </div>

                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {activePreviewEntries.map((entry, idx) => {
                    const isOt = entry.kind === 'ot';
                    return (
                      <div
                        key={entry.id || idx}
                        className={`p-2 rounded-lg border text-[11px] ${
                          isOt
                            ? 'bg-[#FFFBEB] border-[#FDE68A]'
                            : 'bg-white border-[#BBF7D0]'
                        }`}
                      >
                        <div className="flex items-center justify-between font-bold text-slate-900">
                          <span className="flex items-center gap-1">
                            {isOt ? (
                              <Scissors className="w-3 h-3 text-amber-800 shrink-0" />
                            ) : (
                              <FileText className="w-3 h-3 text-emerald-800 shrink-0" />
                            )}
                            <span>
                              {isOt
                                ? `OT Procedure #${entry.chronologicalIndex}`
                                : `OPD Visit #${entry.chronologicalIndex}`}
                            </span>
                          </span>
                          <span
                            className={`font-mono ${
                              isOt ? 'text-amber-900' : 'text-emerald-800'
                            }`}
                          >
                            {formatIndianDate(entry.date)}
                          </span>
                        </div>
                        <div className="text-slate-600 truncate mt-0.5">
                          {isOt
                            ? cleanPrintText(entry.otNotes?.procedureName) ||
                              cleanPrintText(entry.otNotes?.postOpDiagnosis) ||
                              'Operative Notes'
                            : cleanPrintText(entry.consultation.diagnosis) ||
                              cleanPrintText(entry.consultation.complaints) ||
                              'OPD Consultation'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-slate-800 font-bold uppercase tracking-wider text-[11px]">
                <Sliders className="w-3.5 h-3.5 text-violet-700" />
                <span>A4 Layout &amp; Section Fit</span>
              </div>

              <div className="p-3 rounded-xl bg-white border border-[#E2DCF0] space-y-2.5">
                <div className="pb-2 border-b border-[#EFEBF9]">
                  <label className="flex items-start gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={preprintedStationery}
                      onChange={(e) => setPreprintedStationery(e.target.checked)}
                      className="mt-0.5 rounded text-violet-600 focus:ring-violet-500"
                    />
                    <div>
                      <span className="text-[11px] font-bold text-violet-900 block">
                        Pre-Printed Hospital Stationery
                      </span>
                      <span className="text-[10px] text-slate-600 leading-tight block mt-0.5">
                        Skips printing hospital header &amp; footer (leaves exact blank margins for your physical letterhead paper).
                      </span>
                    </div>
                  </label>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Page Layout Format
                  </label>
                  <div className="grid grid-cols-3 gap-1">
                    {[
                      {
                        id: 'column',
                        label: '1. Column',
                        title: 'Classic 2-column side-by-side layout',
                      },
                      {
                        id: 'split',
                        label: '2. Split',
                        title: '2-column clinical upper half + combined full-width Rx & Advice bottom',
                      },
                      {
                        id: 'flat',
                        label: '3. Flat',
                        title: 'Single-column stacked flat fields (1-line IPSS to save space)',
                      },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setPrintLayout(opt.id as PrintLayoutMode)}
                        title={opt.title}
                        className={`py-1.5 px-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                          printLayout === opt.id
                            ? 'bg-violet-100 text-violet-950 border border-violet-300 shadow-2xs'
                            : 'bg-[#F6F4FB] text-slate-600 hover:bg-[#EDE9FE]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1 leading-tight">
                    {printLayout === 'split'
                      ? 'Upper 2 columns + combined full-width Rx table & Advice below.'
                      : printLayout === 'flat'
                      ? 'Single-column stacked flow with flat 1-line IPSS to save print space.'
                      : 'Traditional 2-column side-by-side clinical & Rx columns.'}
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label className="block text-[11px] font-semibold text-slate-700">
                      Investigations (Lab &amp; Imaging)
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowInvestigations((prev) => !prev)}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
                        showInvestigations
                          ? 'bg-[#E1F7FC] text-[#244B70] border-[#A9CFF7] hover:bg-[#CBEFFA]'
                          : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                      }`}
                      title="Toggle whether Previous Investigations appear on the print layout"
                    >
                      {showInvestigations ? 'Included' : 'Excluded'}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {[
                      { id: 'whole-table', label: 'Latest 2 Dates' },
                      { id: 'latest-only', label: 'Only Latest Reports' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setShowInvestigations(true);
                          setInvestigationsPrintMode(opt.id as any);
                        }}
                        className={`py-1.5 px-2 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                          showInvestigations && investigationsPrintMode === opt.id
                            ? 'bg-[#E1F7FC] text-[#244B70] border border-[#A9CFF7]'
                            : showInvestigations
                            ? 'bg-[#F6F4FB] text-slate-600 hover:bg-[#EDE9FE]'
                            : 'bg-slate-100 text-slate-400 hover:bg-[#EDE9FE] hover:text-slate-700'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">IPSS</label>
                  <div className="grid grid-cols-3 gap-1">
                    {[
                      { id: 'auto', label: 'Auto' },
                      { id: 'show', label: 'Show' },
                      { id: 'hide', label: 'Skip' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setIpssMode(opt.id as any)}
                        className={`py-1 px-2 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                          ipssMode === opt.id
                            ? 'bg-[#DDD6FE] text-violet-950 border border-[#C4B5FD]'
                            : 'bg-[#F6F4FB] text-slate-600 hover:bg-[#EDE9FE]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Text &amp; Spacing Size
                  </label>
                  <div className="grid grid-cols-3 gap-1">
                    {[
                      { id: 'compact', label: 'Compact' },
                      { id: 'normal', label: 'Standard' },
                      { id: 'large', label: 'Large' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setFontScale(opt.id as any)}
                        className={`py-1 px-2 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                          fontScale === opt.id
                            ? 'bg-[#D1FAE5] text-emerald-950 border border-[#6EE7B7]'
                            : 'bg-[#F6F4FB] text-slate-600 hover:bg-[#EDE9FE]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="flex items-center gap-2 pt-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={hideEmptySections}
                    onChange={(e) => setHideEmptySections(e.target.checked)}
                    className="rounded text-violet-600 focus:ring-violet-500"
                  />
                  <span className="text-[11px] text-slate-700">
                    Skip empty sections automatically
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showInvestigations}
                    onChange={(e) => setShowInvestigations(e.target.checked)}
                    className="rounded text-violet-600 focus:ring-violet-500"
                  />
                  <span className="text-[11px] text-slate-700">
                    Include Investigations (Lab &amp; Imaging)
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showVitalsInCo}
                    onChange={(e) => setShowVitalsInCo(e.target.checked)}
                    className="rounded text-violet-600 focus:ring-violet-500"
                  />
                  <span className="text-[11px] text-slate-700">Include Vitals section</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showHistoryChecklist}
                    onChange={(e) => setShowHistoryChecklist(e.target.checked)}
                    className="rounded text-violet-600 focus:ring-violet-500"
                  />
                  <span className="text-[11px] text-slate-700">
                    Include Negative / History Checklist
                  </span>
                </label>
              </div>
            </div>

            {/* Doctor Header Customization */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-slate-800 font-bold uppercase tracking-wider text-[11px]">
                <FileText className="w-3.5 h-3.5 text-violet-700" />
                <span>Doctor Header</span>
              </div>
              <div className="p-3 rounded-xl bg-white border border-[#E2DCF0] space-y-2">
                <div>
                  <label className="block text-[10px] text-slate-500 mb-0.5">Department</label>
                  <input
                    type="text"
                    value={departmentTitle}
                    onChange={(e) => setDepartmentTitle(e.target.value)}
                    className="w-full px-2 py-1 rounded-lg bg-[#F7F5FC] border border-[#DFD8F0] text-slate-900 text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 mb-0.5">Doctor Name</label>
                  <input
                    type="text"
                    value={doctorName}
                    onChange={(e) => setDoctorName(e.target.value)}
                    className="w-full px-2 py-1 rounded-lg bg-[#F7F5FC] border border-[#DFD8F0] text-slate-900 text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 mb-0.5">
                    Qualifications Line 1
                  </label>
                  <input
                    type="text"
                    value={doctorDegrees}
                    onChange={(e) => setDoctorDegrees(e.target.value)}
                    className="w-full px-2 py-1 rounded-lg bg-[#F7F5FC] border border-[#DFD8F0] text-slate-900 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 mb-0.5">
                    Super-Speciality Line 2
                  </label>
                  <input
                    type="text"
                    value={doctorSuperSpec}
                    onChange={(e) => setDoctorSuperSpec(e.target.value)}
                    className="w-full px-2 py-1 rounded-lg bg-[#F7F5FC] border border-[#DFD8F0] text-slate-900 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 mb-0.5">
                    Registration Number (MMC)
                  </label>
                  <input
                    type="text"
                    value={doctorRegNo}
                    onChange={(e) => setDoctorRegNo(e.target.value)}
                    className="w-full px-2 py-1 rounded-lg bg-[#F7F5FC] border border-[#DFD8F0] text-slate-900 text-xs font-mono"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right Canvas: Live A4 Paper Sheet Preview on Soft Pastel Mist Canvas */}
          <div className="lg:col-span-9 bg-[#EAE6F3] overflow-auto p-4 sm:p-8 flex justify-center items-start">
            <div
              style={{
                transform: `scale(${previewZoom})`,
                transformOrigin: 'top center',
              }}
              className="transition-transform duration-150"
            >
              <div ref={printContainerRef} className="space-y-10">
                {docType === 'opd' && viewMode === 'consolidated' && patientIpdRecords.length > 0
                  ? (() => {
                      const combinedSheets = [
                        ...activePreviewEntries.map((entry) => ({
                          kind: entry.kind as 'opd' | 'ot',
                          sortDate: entry.date || '',
                          id: entry.id,
                          entry,
                          ipdPatient: null as IpdPatientRecord | null,
                        })),
                        ...patientIpdRecords.map((p) => ({
                          kind: 'ipd' as const,
                          sortDate: p.dischargeDate || p.admissionDate || '',
                          id: `ipd-sheet-${p.id}`,
                          entry: null as (typeof activePreviewEntries)[number] | null,
                          ipdPatient: p,
                        })),
                      ].sort((a, b) =>
                        sortOrder === 'latest-first'
                          ? b.sortDate.localeCompare(a.sortDate)
                          : a.sortDate.localeCompare(b.sortDate)
                      );

                      return combinedSheets.map((item, idx) =>
                        item.kind === 'ipd' && item.ipdPatient ? (
                          <IpdSummaryA4Sheet
                            key={item.id}
                            patient={item.ipdPatient}
                            sheetNumber={idx + 1}
                            totalSheets={combinedSheets.length}
                            departmentTitle={departmentTitle}
                            doctorName={doctorName}
                            doctorDegrees={doctorDegrees}
                            doctorSuperSpec={doctorSuperSpec}
                            doctorRegNo={doctorRegNo}
                            preprintedStationery={preprintedStationery}
                            bodyFontSizeClass={bodyFontSizeClass}
                          />
                        ) : item.entry && item.entry.kind === 'ot' ? (
                          <DetailedOtNotesA4Sheet
                            key={item.id || `ot-${idx}`}
                            consultation={item.entry.consultation}
                            procedureNumber={item.entry.chronologicalIndex}
                            totalProcedures={combinedSheets.length}
                            isChronologicalMode={combinedSheets.length > 1}
                            departmentTitle={departmentTitle}
                            doctorName={doctorName}
                            doctorDegrees={doctorDegrees}
                            doctorSuperSpec={doctorSuperSpec}
                            doctorRegNo={doctorRegNo}
                            preprintedStationery={preprintedStationery}
                            bodyFontSizeClass={bodyFontSizeClass}
                          />
                        ) : item.entry ? (
                          <SingleA4CaseSheet
                            key={item.id || `opd-${idx}`}
                            consultation={item.entry.consultation}
                            allConsultations={allConsultations}
                            visitIndex={idx}
                            totalVisits={combinedSheets.length}
                            sortOrder={sortOrder}
                            isConsolidatedMode={true}
                            departmentTitle={departmentTitle}
                            doctorName={doctorName}
                            doctorDegrees={doctorDegrees}
                            doctorSuperSpec={doctorSuperSpec}
                            doctorRegNo={doctorRegNo}
                            hospitalName={currentDoctor?.hospitalName}
                            clinicAddress={currentDoctor?.clinicAddress}
                            clinicPhone={currentDoctor?.phone}
                            clinicEmail={currentDoctor?.email}
                            preprintedStationery={preprintedStationery}
                            ipssMode={ipssMode}
                            investigationsPrintMode={investigationsPrintMode}
                            printLayout={printLayout}
                            showInvestigations={showInvestigations}
                            showVitalsInCo={showVitalsInCo}
                            showHistoryChecklist={showHistoryChecklist}
                            hideEmptySections={hideEmptySections}
                            bodyFontSizeClass={bodyFontSizeClass}
                          />
                        ) : null
                      );
                    })()
                  : activePreviewEntries.map((entry, idx) =>
                      entry.kind === 'ot' ? (
                        <DetailedOtNotesA4Sheet
                          key={entry.id || `ot-${idx}`}
                          consultation={entry.consultation}
                          procedureNumber={entry.chronologicalIndex}
                          totalProcedures={activePreviewEntries.length}
                          isChronologicalMode={activePreviewEntries.length > 1}
                          departmentTitle={departmentTitle}
                          doctorName={doctorName}
                          doctorDegrees={doctorDegrees}
                          doctorSuperSpec={doctorSuperSpec}
                          doctorRegNo={doctorRegNo}
                          preprintedStationery={preprintedStationery}
                          bodyFontSizeClass={bodyFontSizeClass}
                        />
                      ) : (
                        <SingleA4CaseSheet
                          key={entry.id || `opd-${idx}`}
                          consultation={entry.consultation}
                          allConsultations={allConsultations}
                          visitIndex={idx}
                          totalVisits={activePreviewEntries.length}
                          sortOrder={sortOrder}
                          isConsolidatedMode={
                            viewMode === 'consolidated' || activePreviewEntries.length > 1
                          }
                          departmentTitle={departmentTitle}
                          doctorName={doctorName}
                          doctorDegrees={doctorDegrees}
                          doctorSuperSpec={doctorSuperSpec}
                          doctorRegNo={doctorRegNo}
                          hospitalName={currentDoctor?.hospitalName}
                          clinicAddress={currentDoctor?.clinicAddress}
                          clinicPhone={currentDoctor?.phone}
                          clinicEmail={currentDoctor?.email}
                          preprintedStationery={preprintedStationery}
                          ipssMode={ipssMode}
                          investigationsPrintMode={investigationsPrintMode}
                          printLayout={printLayout}
                          showInvestigations={showInvestigations}
                          showVitalsInCo={showVitalsInCo}
                          showHistoryChecklist={showHistoryChecklist}
                          hideEmptySections={hideEmptySections}
                          bodyFontSizeClass={bodyFontSizeClass}
                        />
                      )
                    )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
