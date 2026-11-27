import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Download,
  Check,
  Plus,
  Trash2,
  RefreshCw,
  FileText,
  Printer,
  Eye,
  Edit3,
  ArrowLeft,
} from 'lucide-react';
import {
  IpdDischargeSummary,
  IpdPatientRecord,
  IpdWardTreatmentItem,
} from '../types/ipd';
import { PrescriptionItem } from '../types/opd';
import { DoctorAccount } from '../types/doctor';
import { formatDisplayDate } from '../utils/excelExporter';
import {
  getSurgicalProtocolById,
  SurgicalProtocolTemplate,
} from '../utils/surgicalProtocols';
import {
  getConsultationOtProcedures,
  splitOperativeTextIntoLines,
} from '../utils/otNotesUtils';
import { summarizeWardMedicationsGiven } from '../utils/ipdDailyMedications';
import {
  applyMedicationGroupToPrescriptions,
  findMasterMedicationByName,
  MedicationGroup,
  MedicineMasterStore,
} from '../utils/medicineMaster';
import { MedicinePresetsBar, GlobalFieldDatalists } from './FieldSuggestionsBar';
import {
  exportIpdDischargeSummaryPdf,
  getSavedDischargePreprintedPreference,
  saveDischargePreprintedPreference,
  stripLatestOpdExaminationLabel,
} from '../utils/ipdPdfExporter';
import {
  buildDischargeCardModel,
  deduplicateExaminationText,
} from '../utils/ipdDischargeLayout';
import { MedScribeLogo } from './MedScribeLogo';

interface IpdDischargeSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: IpdPatientRecord;
  doctor?: DoctorAccount | null;
  availableProtocols?: SurgicalProtocolTemplate[];
  initialView?: 'edit' | 'review';
  onSaveDischargeSummary: (
    summary: IpdDischargeSummary,
    markAsDischarged: boolean
  ) => void;
  onOpenMedicineMaster?: () => void;
}

function isSubstantiveClinicalValue(raw?: string): raw is string {
  const s = (raw || '').trim();
  if (!s) return false;
  return !/^(none|nil|n\/a|na|no|not\s+sent|not\s+done|not\s+applicable|not\s+placed|absent|-+)$/i.test(
    s
  );
}

function splitClinicalSummaryIntoHistoryAndExam(clinicalSummary?: string): {
  historyText: string;
  examText: string;
} {
  const raw = (clinicalSummary || '').trim();
  if (!raw) return { historyText: '', examText: '' };

  const blocks = raw
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  const historyBlocks: string[] = [];
  const examBlocks: string[] = [];

  for (const block of blocks) {
    const firstLine = block.split('\n')[0]?.trim() || '';
    const isExamBlock =
      /^(latest\s+opd\s+examination|examination\s+on\s+(admission|ipd)|examination\s+notes|physical\s+examination|on\s+examination|clinical\s+examination|systemic\s+exam|local\s*\/?\s*genital\s+exam|per[\s-]*rectal|dre\b)/i.test(
        firstLine
      );
    if (isExamBlock) {
      const cleanedExamBlock = stripLatestOpdExaminationLabel(block);
      if (cleanedExamBlock) {
        examBlocks.push(cleanedExamBlock);
      }
    } else {
      historyBlocks.push(block);
    }
  }

  return {
    historyText: historyBlocks.join('\n\n'),
    examText: examBlocks.join('\n\n'),
  };
}

export function compileDefaultDischargeSummary(
  patient: IpdPatientRecord,
  doctor?: DoctorAccount | null,
  availableProtocols?: SurgicalProtocolTemplate[]
): IpdDischargeSummary {
  const today = new Date().toISOString().split('T')[0];

  const proto = patient.surgicalProtocol
    ? availableProtocols?.find((p) => p.id === patient.surgicalProtocol?.protocolId) ||
      getSurgicalProtocolById(patient.surgicalProtocol.protocolId)
    : undefined;

  // Sort OT procedures chronologically (earliest date/time first)
  const otProcs = [...getConsultationOtProcedures(patient as any)].sort((a, b) => {
    const dCmp = (a.surgeryDate || '9999-99-99').localeCompare(b.surgeryDate || '9999-99-99');
    if (dCmp !== 0) return dCmp;
    return (a.surgeryTime || '').localeCompare(b.surgeryTime || '');
  });

  // 1. Procedure Performed with Date — ONLY procedure name, date, and type of anaesthesia, chronologically
  const procedurePerformed = otProcs
    .map((ot, idx) => {
      const prefix = otProcs.length > 1 ? `${idx + 1}. ` : '';
      const namePart = (ot.procedureName || 'Surgical Procedure').trim();
      const datePart = ot.surgeryDate ? ` — ${formatDisplayDate(ot.surgeryDate)}` : '';
      const anaesthPart = ot.anaesthesiaType?.trim()
        ? ` — Anaesthesia: ${ot.anaesthesiaType.trim()}`
        : '';
      return `${prefix}${namePart}${datePart}${anaesthPart}`;
    })
    .filter(Boolean)
    .join('\n');

  // 2. Presenting History vs Examination on IPD
  const { historyText, examText } = splitClinicalSummaryIntoHistoryAndExam(
    patient.clinicalSummary
  );

  const presentingHistoryParts: string[] = [];
  if (historyText) {
    presentingHistoryParts.push(historyText);
  }
  if (
    patient.comorbidities?.trim() &&
    !historyText.toLowerCase().includes(patient.comorbidities.trim().toLowerCase())
  ) {
    presentingHistoryParts.push(`Comorbidities / Past History: ${patient.comorbidities.trim()}`);
  }
  if (patient.allergies?.trim()) {
    presentingHistoryParts.push(`Known Drug Allergies: ${patient.allergies.trim()}`);
  }

  // Pull earliest non-OT admission vitals / objective examination if present
  const nonOtChronologicalNotes = [...(patient.dailyNotes || [])]
    .filter((n) => !(n.id || '').startsWith('ot-postop-'))
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));

  const firstNoteWithVitals = nonOtChronologicalNotes.find((n) => {
    const v = n.vitals || {};
    return Boolean(v.bp || v.pulse || v.temp || v.spo2 || v.respRate);
  });

  const examParts: string[] = [];
  if (firstNoteWithVitals?.vitals) {
    const v = firstNoteWithVitals.vitals;
    const vitalsList = [
      v.bp ? `BP: ${v.bp}` : '',
      v.pulse ? `Pulse: ${v.pulse}` : '',
      v.temp ? `Temp: ${v.temp}` : '',
      v.spo2 ? `SpO2: ${v.spo2}` : '',
      v.respRate ? `RR: ${v.respRate}` : '',
    ].filter(Boolean);
    if (vitalsList.length > 0) {
      examParts.push(`Vitals on IPD Admission: ${vitalsList.join(' | ')}`);
    }
  }
  if (examText) {
    examParts.push(examText);
  } else {
    const firstObjectiveNote = nonOtChronologicalNotes.find(
      (n) => n.objective?.trim() && !/\[[^\]]+\]/.test(n.objective)
    );
    if (firstObjectiveNote?.objective?.trim()) {
      examParts.push(firstObjectiveNote.objective.trim());
    }
  }

  // 3. Investigations
  const invLines = (patient.investigationRecords || [])
    .slice(0, 20)
    .map(
      (i) =>
        `${i.displayDate || formatDisplayDate(i.reportDate)} — ${i.parameterName}: ${i.valueOrImpression}${i.flag && i.flag !== 'Normal' ? ` (${i.flag})` : ''}`
    );

  // 4. Course in Ward — Paragraph-style short summary of protocol followed without minor checklist details
  const primaryDx =
    otProcs[otProcs.length - 1]?.postOpDiagnosis ||
    otProcs[0]?.postOpDiagnosis ||
    patient.admittingDiagnosis ||
    'urological evaluation and inpatient management';

  const admDateLabel = patient.admissionDate
    ? ` on ${formatDisplayDate(patient.admissionDate)}`
    : '';

  const courseSentences: string[] = [];

  if (otProcs.length > 0) {
    const procNarrative = otProcs
      .map((ot) => {
        const parts = [
          ot.procedureName || 'surgical procedure',
          ot.surgeryDate ? `on ${formatDisplayDate(ot.surgeryDate)}` : '',
          ot.anaesthesiaType ? `under ${ot.anaesthesiaType}` : '',
        ].filter(Boolean);
        return parts.join(' ');
      })
      .join(', followed by ');
    courseSentences.push(
      `The patient was admitted${admDateLabel} with a diagnosis of ${primaryDx} and underwent ${procNarrative}.`
    );
  } else {
    courseSentences.push(
      `The patient was admitted${admDateLabel} with a diagnosis of ${primaryDx} and was managed conservatively in the ward.`
    );
  }

  const fv = patient.surgicalProtocol?.fieldValues || {};
  if (patient.surgicalProtocol && proto) {
    const checkedSet = new Set(patient.surgicalProtocol.checkedItemIds || []);
    const activeStageTags = proto.stages
      .filter((stage) => stage.items.some((it) => checkedSet.has(it.id)))
      .map((stage) => stage.dayTag)
      .filter(Boolean);

    const stagePhrase =
      activeStageTags.length > 0
        ? ` across ${activeStageTags.join(', ')}`
        : '';

    const keyMilestones: string[] = [];
    if (fv.foleyRemovalDate?.trim() || fv.catheterRemovalDate?.trim()) {
      keyMilestones.push(
        `catheter management (${(fv.foleyRemovalDate || fv.catheterRemovalDate).trim()})`
      );
    }
    if (fv.drainRemovalDate?.trim()) {
      keyMilestones.push(`drain removal (${fv.drainRemovalDate.trim()})`);
    }

    const milestonePhrase =
      keyMilestones.length > 0 ? `, including ${keyMilestones.join(' and ')}` : '';

    courseSentences.push(
      `Post-operatively, the patient was managed in accordance with the ${proto.name} pathway${stagePhrase}${milestonePhrase}, with routine monitoring of vitals, pain control, oral intake, ambulation, and urinary output.`
    );

    if (patient.surgicalProtocol.deviationsNote?.trim()) {
      courseSentences.push(
        `Clinical remarks during protocol care: ${patient.surgicalProtocol.deviationsNote.trim()}.`
      );
    }
  } else if (otProcs.length > 0) {
    courseSentences.push(
      'Post-operatively, the patient was managed with IV/oral antibiotics, analgesics, supportive ward care, and regular monitoring of vitals, hydration, and urine output.'
    );
  } else {
    courseSentences.push(
      'During the ward stay, the patient received appropriate inpatient medical therapy, hydration, and daily clinical monitoring with steady symptomatic improvement.'
    );
  }

  const hasIntraOpComplication = otProcs.some((ot) =>
    isSubstantiveClinicalValue(ot.intraOpComplications)
  );
  courseSentences.push(
    hasIntraOpComplication
      ? 'The patient recovered steadily following inpatient management, tolerated oral diet well, voided comfortably, and is now fit for discharge in a stable condition.'
      : 'The hospital course remained uneventful; the patient tolerated oral diet well, ambulated comfortably, voided satisfactorily, and is being discharged in a stable condition.'
  );

  const paragraphCourseInWard = courseSentences.join(' ');

  // 5. OT Notes — Procedure names, intra-op findings & steps, DJ stent, HPE if true; NO post-op orders
  const otNotesBlocks = otProcs
    .map((ot, idx) => {
      const titlePrefix = otProcs.length > 1 ? `${idx + 1}. ` : '';
      const procHeading = `${titlePrefix}${ot.procedureName || 'Surgical Procedure'}${
        ot.surgeryDate ? ` (${formatDisplayDate(ot.surgeryDate)})` : ''
      }:`;

      const detailLines: string[] = [];
      const seenDetail = new Set<string>();
      const pushDetail = (line: string) => {
        const t = line.trim();
        if (!t) return;
        const k = t.toLowerCase();
        if (seenDetail.has(k)) return;
        seenDetail.add(k);
        detailLines.push(t);
      };
      if (isSubstantiveClinicalValue(ot.operativeFindings)) {
        for (const l of splitOperativeTextIntoLines(ot.operativeFindings)) {
          pushDetail(l);
        }
      }
      if (isSubstantiveClinicalValue(ot.operativeSteps)) {
        for (const l of splitOperativeTextIntoLines(ot.operativeSteps)) {
          pushDetail(l);
        }
      }

      // DJ Stent details (from OT catheterOrStentDetails and/or protocol djStentSideSize)
      const djStentParts: string[] = [];
      if (isSubstantiveClinicalValue(ot.catheterOrStentDetails)) {
        djStentParts.push(ot.catheterOrStentDetails.trim());
      }
      if (
        idx === 0 &&
        isSubstantiveClinicalValue(fv.djStentSideSize) &&
        !djStentParts.join(' ').toLowerCase().includes(fv.djStentSideSize.trim().toLowerCase())
      ) {
        djStentParts.push(`DJ Stent: ${fv.djStentSideSize.trim()}`);
      }
      if (djStentParts.length > 0) {
        detailLines.push(`DJ Stent / Catheter: ${djStentParts.join('; ')}`);
      }

      // HPE section ONLY if true / specimen was sent
      if (isSubstantiveClinicalValue(ot.specimenSent)) {
        detailLines.push(`HPE / Specimen Sent: ${ot.specimenSent.trim()}`);
      }

      // Explicitly exclude postOpOrders per clinical format specification
      if (detailLines.length === 0) {
        return procHeading.replace(/:$/, '');
      }
      return `${procHeading}\n${detailLines.join('\n')}`;
    })
    .filter(Boolean);

  const otNotesSummary = otNotesBlocks.join('\n\n');

  // 6. Treatment Given in Ward — Deduplicated summary of all medications given & total days given
  const treatmentGivenInWard: IpdWardTreatmentItem[] = summarizeWardMedicationsGiven(
    patient,
    patient.dischargeDate || today
  );

  // 7. Discharge Medications — Prefer curated Discharge Medications section; fallback to active ward meds
  const hasCuratedDischargeMeds =
    Array.isArray(patient.dischargeMedications) &&
    patient.dischargeMedications.some((m) => (m.medicine || m.drugName || '').trim().length > 0);

  const dischargeMeds: PrescriptionItem[] = hasCuratedDischargeMeds
    ? (patient.dischargeMedications || [])
        .filter((m) => (m.medicine || m.drugName || '').trim().length > 0)
        .map((m) => ({
          medicine: m.medicine || m.drugName || '',
          drugName: m.medicine || m.drugName || '',
          dosage: m.dosage || m.dosageStrength || '',
          dosageStrength: m.dosage || m.dosageStrength || '',
          when: m.when || m.timing || 'After food (p/c)',
          timing: m.when || m.timing || 'After food (p/c)',
          frequency: m.frequency || '1-0-1 (BD)',
          duration: m.duration || '5 Days',
          notes: m.notes || m.instructions || '',
          instructions: m.notes || m.instructions || '',
        }))
    : (patient.medications || [])
        .filter((m) => m.status === 'active')
        .map((m) => {
          const master = findMasterMedicationByName(m.medicine, m.dosage, doctor?.uid);
          const noteText = m.notes || master?.notes || '';
          return {
            medicine: m.medicine,
            drugName: m.medicine,
            dosage: m.dosage,
            dosageStrength: m.dosage,
            when: m.when || master?.when || 'After food (p/c)',
            timing: m.when || master?.when || 'After food (p/c)',
            frequency: m.frequency || master?.frequency || '1-0-1 (BD)',
            duration: master?.duration || '5 Days',
            notes: noteText,
            instructions: noteText,
          };
        });

  // 8. Post-discharge DJ Stent / Catheter / Drain & HPE Plan
  const formatDateOrDuration = (raw: string): string => {
    const trimmed = raw.trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? formatDisplayDate(trimmed) : trimmed;
  };

  const isRetainedInSitu = (raw?: string): raw is string =>
    isSubstantiveClinicalValue(raw) &&
    !/^(not\s+retained|removed|no\s+catheter|no\s+drain|no\s+pcn|no\s+tube|voiding\s+well|passed|successful|clear)$/i.test(
      raw.trim()
    );

  const stentParts: string[] = [];

  // 8a. DJ Stent & Planned Removal Date / Duration
  const djSideRaw = (fv.djStent || '').trim();
  const djActionRaw = (fv.djStentAction || '').trim();
  const djSideSizeRaw = (fv.djStentSideSize || '').trim();
  const djTargetRaw = (fv.djStentTargetDate || '').trim();
  const noDjStentExplicit =
    /^no\s*stent$|^none$|^not\s*placed$/i.test(djActionRaw) ||
    /^none$|^no$|^not\s*placed$/i.test(djSideRaw);

  const otStentClauses: string[] = [];
  const seenStentClauses = new Set<string>();
  for (const ot of otProcs) {
    if (!isSubstantiveClinicalValue(ot.catheterOrStentDetails)) continue;
    const clauses = ot.catheterOrStentDetails
      .split(/[;\n]+/)
      .map((c) => c.trim())
      .filter(Boolean);
    for (const clause of clauses) {
      if (
        /\b(dj|d\.?j\.?|double[\s-]*j|ureteric\s+stent|stent)\b/i.test(clause) &&
        !/^(no|nil|none|not\s+placed)\b/i.test(clause)
      ) {
        const key = clause.toLowerCase();
        if (!seenStentClauses.has(key)) {
          seenStentClauses.add(key);
          otStentClauses.push(clause);
        }
      }
    }
  }

  let djDescriptor = '';
  if (isSubstantiveClinicalValue(djSideSizeRaw)) {
    const hasSideInSize = /\b(right|left|bilateral|b\/l|rt|lt)\b/i.test(djSideSizeRaw);
    const sidePrefix =
      !hasSideInSize && isSubstantiveClinicalValue(djSideRaw) ? `${djSideRaw} ` : '';
    djDescriptor = `${sidePrefix}${djSideSizeRaw}`;
  } else if (otStentClauses.length > 0) {
    djDescriptor = otStentClauses.join('; ');
  } else if (isSubstantiveClinicalValue(djSideRaw)) {
    djDescriptor = `${djSideRaw} DJ Stent`;
  }

  const hasSubstantiveDjAction =
    isSubstantiveClinicalValue(djActionRaw) && !/^no\s*stent$/i.test(djActionRaw);
  const removalByText = isSubstantiveClinicalValue(djTargetRaw)
    ? formatDateOrDuration(djTargetRaw)
    : '';

  if (!noDjStentExplicit && (djDescriptor || removalByText || hasSubstantiveDjAction)) {
    const normalizedDescriptor = djDescriptor
      ? /in\s*situ/i.test(djDescriptor)
        ? djDescriptor
        : `${djDescriptor} in situ`
      : 'In situ';
    const actionLabel = !hasSubstantiveDjAction
      ? 'Removal'
      : /^remove$/i.test(djActionRaw)
        ? 'Removal'
        : djActionRaw;

    if (removalByText) {
      stentParts.push(`DJ Stent: ${normalizedDescriptor} — ${actionLabel} by: ${removalByText}`);
    } else {
      stentParts.push(
        `DJ Stent: ${normalizedDescriptor} — ${actionLabel} by: To be scheduled (specify date / duration)`
      );
    }
  }

  // 8b. Catheter — ONLY if patient is being discharged with catheter in situ
  const catheterRemovedAndVoided =
    (isSubstantiveClinicalValue(fv.catheterRemovalTime) ||
      isSubstantiveClinicalValue(fv.catheterRemovalDateTime)) &&
    (isSubstantiveClinicalValue(fv.voidTime) || isSubstantiveClinicalValue(fv.void1));

  const catheterDischargeDetails: string[] = [];
  const pushUnique = (arr: string[], val?: string) => {
    const trimmed = (val || '').trim();
    if (!trimmed) return;
    if (!arr.some((x) => x.toLowerCase() === trimmed.toLowerCase())) {
      arr.push(trimmed);
    }
  };

  if (isRetainedInSitu(fv.catheterDischargePlan)) {
    pushUnique(catheterDischargeDetails, fv.catheterDischargePlan);
  }
  if (isRetainedInSitu(fv.catheterRetainedReason)) {
    pushUnique(catheterDischargeDetails, fv.catheterRetainedReason);
  }
  if (isRetainedInSitu(fv.failedVoidPlan)) {
    pushUnique(catheterDischargeDetails, fv.failedVoidPlan);
  }
  if (!catheterRemovedAndVoided && isRetainedInSitu(fv.retainedReason)) {
    const reviewPart = isRetainedInSitu(fv.retainedNextReview)
      ? ` (${formatDateOrDuration(fv.retainedNextReview)})`
      : '';
    pushUnique(catheterDischargeDetails, `${fv.retainedReason.trim()}${reviewPart}`);
  }
  if (
    isRetainedInSitu(fv.retainedDrainPlan) &&
    /\b(catheter|foley|spc|suprapubic)\b/i.test(fv.retainedDrainPlan)
  ) {
    pushUnique(catheterDischargeDetails, fv.retainedDrainPlan);
  }

  if (catheterDischargeDetails.length > 0) {
    const combined = catheterDischargeDetails.join('; ');
    const catheterSizePrefix =
      isSubstantiveClinicalValue(fv.catheterFr) &&
      !combined.toLowerCase().includes(fv.catheterFr.trim().toLowerCase())
        ? `${fv.catheterFr.trim()} — `
        : '';
    stentParts.push(`Catheter (In Situ at Discharge): ${catheterSizePrefix}${combined}`);
  }

  // 8c. Drain / PCN Tube — ONLY if patient is being discharged with drain/PCN in situ
  const drainDischargeDetails: string[] = [];
  if (isRetainedInSitu(fv.drainRetainedReason)) {
    pushUnique(drainDischargeDetails, fv.drainRetainedReason);
  }
  if (isRetainedInSitu(fv.pcnRetainedReason)) {
    pushUnique(drainDischargeDetails, `PCN: ${fv.pcnRetainedReason.trim()}`);
  }
  if (
    isRetainedInSitu(fv.retainedDrainPlan) &&
    (/\b(drain|pcn|nephrostomy|tube)\b/i.test(fv.retainedDrainPlan) ||
      !/\b(catheter|foley|spc|suprapubic)\b/i.test(fv.retainedDrainPlan))
  ) {
    pushUnique(drainDischargeDetails, fv.retainedDrainPlan);
  }

  if (drainDischargeDetails.length > 0) {
    const combinedDrain = drainDischargeDetails.join('; ');
    const drainDeviceLabels: string[] = [];
    if (
      (isRetainedInSitu(fv.drainRetainedReason) || isRetainedInSitu(fv.retainedDrainPlan)) &&
      isSubstantiveClinicalValue(fv.drainTypeSite) &&
      !combinedDrain.toLowerCase().includes(fv.drainTypeSite.trim().toLowerCase())
    ) {
      drainDeviceLabels.push(fv.drainTypeSite.trim());
    }
    if (
      isRetainedInSitu(fv.pcnRetainedReason) &&
      isSubstantiveClinicalValue(fv.nephrostomyDetails) &&
      !combinedDrain.toLowerCase().includes(fv.nephrostomyDetails.trim().toLowerCase())
    ) {
      drainDeviceLabels.push(fv.nephrostomyDetails.trim());
    }
    const devicePrefix = drainDeviceLabels.length > 0 ? `${drainDeviceLabels.join(', ')} — ` : '';
    stentParts.push(`Drain / Tube (In Situ at Discharge): ${devicePrefix}${combinedDrain}`);
  }

  // 8d. HPE (Histopathology) & Sample Sent — ONLY if sent or HPE follow-up recorded
  const hpeSamples: string[] = [];
  for (const ot of otProcs) {
    if (isSubstantiveClinicalValue(ot.specimenSent)) {
      pushUnique(hpeSamples, ot.specimenSent);
    }
  }
  const hpeFollowup = isSubstantiveClinicalValue(fv.hpeFollowupDate)
    ? formatDateOrDuration(fv.hpeFollowupDate)
    : '';

  if (hpeSamples.length > 0) {
    stentParts.push(
      `HPE: Sent — Sample: ${hpeSamples.join('; ')}${
        hpeFollowup ? ` (HPE Review: ${hpeFollowup})` : ''
      }`
    );
  } else if (hpeFollowup) {
    stentParts.push(`HPE: Pending review — Follow-up: ${hpeFollowup}`);
  }

  if (
    /^sent$/i.test((fv.stoneAnalysis || '').trim()) &&
    !hpeSamples.some((s) => /stone\s*analysis/i.test(s))
  ) {
    stentParts.push('Stone Analysis: Sent (review report at follow-up)');
  }

  return {
    finalDiagnosis:
      otProcs[otProcs.length - 1]?.postOpDiagnosis ||
      otProcs[0]?.postOpDiagnosis ||
      patient.admittingDiagnosis ||
      '',
    procedurePerformed,
    chiefComplaintsAndHistory: presentingHistoryParts.join('\n\n'),
    examinationOnAdmission: deduplicateExaminationText(examParts.join('\n\n')),
    keyInvestigations: invLines.join('\n') || patient.labTestsAndImaging || '',
    hospitalCourse: paragraphCourseInWard,
    otNotesSummary,
    treatmentGivenInWard,
    conditionAtDischarge:
      'Hemodynamically stable, afebrile, tolerating oral diet, comfortable voiding, surgical site clean and dry.',
    dischargeMedications: dischargeMeds,
    dietAndActivityAdvice:
      proto?.defaultDischargeAdvice ||
      'Maintain adequate oral hydration, normal balanced diet, avoid strenuous lifting for 2–4 weeks, and keep wound clean and dry.',
    redFlagWarnings:
      proto?.defaultReturnWarnings ||
      'Return urgently to emergency for high fever/rigors, heavy hematuria or clots, inability to pass urine, worsening abdominal/flank pain, or persistent vomiting.',
    stentOrTubePlan: stentParts.join('\n'),
    followUpPlan:
      fv.hpeFollowupDate ||
      fv.woundReviewPlan ||
      'Review in Urology OPD after 7 days with pending reports / HPE.',
    authorizedBy: doctor?.fullName || patient.attendingConsultant || '',
    dischargeDate: patient.dischargeDate || today,
    generatedAt: Date.now(),
  };
}

export const IpdDischargeSummaryModal: React.FC<IpdDischargeSummaryModalProps> = ({
  isOpen,
  onClose,
  patient,
  doctor,
  availableProtocols,
  initialView = 'edit',
  onSaveDischargeSummary,
  onOpenMedicineMaster,
}) => {
  const buildInitialSummary = (): IpdDischargeSummary => {
    const compiled = compileDefaultDischargeSummary(patient, doctor, availableProtocols);
    if (!patient.dischargeSummary) return compiled;
    const existing = patient.dischargeSummary;
    const existingMeds = existing.dischargeMedications || [];
    const fallbackCurated = patient.dischargeMedications || [];
    return {
      ...compiled,
      ...existing,
      examinationOnAdmission: deduplicateExaminationText(
        existing.examinationOnAdmission !== undefined
          ? existing.examinationOnAdmission
          : compiled.examinationOnAdmission
      ),
      otNotesSummary:
        existing.otNotesSummary !== undefined ? existing.otNotesSummary : compiled.otNotesSummary,
      treatmentGivenInWard:
        existing.treatmentGivenInWard !== undefined
          ? existing.treatmentGivenInWard
          : compiled.treatmentGivenInWard,
      dischargeMedications: existingMeds.length > 0 ? existingMeds : fallbackCurated,
    };
  };

  const [summary, setSummary] = useState<IpdDischargeSummary>(buildInitialSummary);
  const [markAsDischarged, setMarkAsDischarged] = useState(patient.status === 'discharged');
  const [viewMode, setViewMode] = useState<'edit' | 'review'>(initialView);
  const [usePrePrintedStationery, setUsePrePrintedStationery] = useState<boolean>(
    getSavedDischargePreprintedPreference
  );
  const printSheetRef = useRef<HTMLDivElement | null>(null);

  const handleTogglePrePrintedStationery = (checked: boolean) => {
    setUsePrePrintedStationery(checked);
    saveDischargePreprintedPreference(checked);
  };

  useEffect(() => {
    if (isOpen) {
      setSummary(buildInitialSummary());
      setMarkAsDischarged(patient.status === 'discharged');
      setViewMode(initialView);
      setUsePrePrintedStationery(getSavedDischargePreprintedPreference());
    }
  }, [isOpen, patient.id, initialView]);

  if (!isOpen) return null;

  const cardModel = buildDischargeCardModel(patient, summary, doctor);
  const fullPatientName = cardModel.fullPatientName;

  const renderMonochromeLines = (lines: string[]) => (
    <div className="space-y-0.5 text-[11.5px] leading-[1.45] text-neutral-950">
      {lines.map((line, idx) => {
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0 && colonIdx <= 34 && !line.startsWith('http')) {
          const keyPart = line.slice(0, colonIdx).trim();
          const valPart = line.slice(colonIdx + 1).trim();
          if (valPart && !/^\d{1,2}\/\d{1,2}/.test(keyPart)) {
            return (
              <div key={idx}>
                <span className="font-semibold text-black">{keyPart}: </span>
                <span>{valPart}</span>
              </div>
            );
          }
        }
        return <div key={idx}>{line}</div>;
      })}
    </div>
  );

  const updateField = <K extends keyof IpdDischargeSummary>(
    key: K,
    val: IpdDischargeSummary[K]
  ) => {
    setSummary((prev) => ({ ...prev, [key]: val }));
  };

  const updateWardTreatmentRow = (idx: number, patch: Partial<IpdWardTreatmentItem>) => {
    setSummary((prev) => {
      const next = [...(prev.treatmentGivenInWard || [])];
      const cur = next[idx] || {
        medicine: '',
        dosage: '',
        route: 'IV',
        frequency: '1-0-1 (BD)',
        durationOrDates: '',
        notes: '',
      };
      next[idx] = { ...cur, ...patch };
      return { ...prev, treatmentGivenInWard: next };
    });
  };

  const updateRx = (idx: number, patch: Partial<PrescriptionItem>) => {
    setSummary((prev) => {
      const next = [...(prev.dischargeMedications || [])];
      const cur = next[idx] || {
        medicine: '',
        dosage: '',
        when: 'After food (p/c)',
        frequency: '1-0-1 (BD)',
        duration: '5 Days',
        notes: '',
      };
      const updated = { ...cur, ...patch };
      if (patch.medicine !== undefined) {
        const master = findMasterMedicationByName(patch.medicine, cur.dosage, doctor?.uid);
        if (master) {
          if (!cur.dosage && master.dosage) updated.dosage = master.dosage;
          if (!cur.notes && master.notes) updated.notes = master.notes;
          if (!cur.when && master.when) updated.when = master.when;
          if (!cur.frequency && master.frequency) updated.frequency = master.frequency;
          if (!cur.duration && master.duration) updated.duration = master.duration;
        }
      }
      next[idx] = updated;
      return { ...prev, dischargeMedications: next };
    });
  };

  const handleApplyGroup = (group: MedicationGroup, store: MedicineMasterStore) => {
    setSummary((prev) => {
      const { prescriptions } = applyMedicationGroupToPrescriptions(
        prev.dischargeMedications,
        group,
        store
      );
      return { ...prev, dischargeMedications: prescriptions };
    });
  };

  const handleSaveAndExport = (alsoPdf: boolean, closeAfter = true) => {
    const finalSummary: IpdDischargeSummary = {
      ...summary,
      examinationOnAdmission: deduplicateExaminationText(summary.examinationOnAdmission),
      generatedAt: Date.now(),
    };
    onSaveDischargeSummary(finalSummary, markAsDischarged);
    if (alsoPdf) {
      exportIpdDischargeSummaryPdf(
        {
          ...patient,
          dischargeSummary: finalSummary,
          dischargeDate: finalSummary.dischargeDate || patient.dischargeDate,
          status: markAsDischarged ? 'discharged' : patient.status,
        },
        doctor,
        { preprintedStationery: usePrePrintedStationery }
      );
    }
    if (closeAfter) {
      onClose();
    }
  };

  const handlePrintSummary = (saveBeforePrint = false) => {
    if (saveBeforePrint) {
      const finalSummary: IpdDischargeSummary = {
        ...summary,
        examinationOnAdmission: deduplicateExaminationText(summary.examinationOnAdmission),
        generatedAt: Date.now(),
      };
      onSaveDischargeSummary(finalSummary, markAsDischarged);
    }

    const printNode = printSheetRef.current;
    if (!printNode) {
      window.print();
      return;
    }

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.left = '-9999px';
    iframe.style.top = '0';
    iframe.style.width = '210mm';
    iframe.style.height = '297mm';
    iframe.style.border = '0';
    iframe.style.visibility = 'hidden';
    iframe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      window.print();
      return;
    }

    const styleNodes = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map((el) => el.outerHTML)
      .join('\n');

    doc.open();
    doc.write(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Discharge Summary - ${fullPatientName.replace(/</g, '&lt;')}</title>
    ${styleNodes}
    <style>
      @page {
        size: A4 portrait;
        margin: 12mm;
      }
      html, body {
        margin: 0;
        padding: 0;
        background: #ffffff !important;
        color: #0f172a !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .discharge-print-root {
        width: 100%;
        max-width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        border: none !important;
        box-shadow: none !important;
      }
      .discharge-avoid-break {
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .discharge-print-hide {
        display: none !important;
      }
      .discharge-stationery-spacer {
        height: 30mm;
        border: none !important;
        background: transparent !important;
        color: transparent !important;
        font-size: 0 !important;
      }
      .discharge-stationery-spacer * {
        display: none !important;
      }
      table {
        border-collapse: collapse;
        width: 100%;
      }
      thead {
        display: table-header-group;
      }
      tr {
        break-inside: avoid;
        page-break-inside: avoid;
      }
    </style>
  </head>
  <body>
    <div class="discharge-print-root">
      ${printNode.innerHTML}
    </div>
  </body>
</html>`);
    doc.close();

    const triggerPrint = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } finally {
        window.setTimeout(() => {
          if (iframe.parentNode) {
            iframe.parentNode.removeChild(iframe);
          }
        }, 1200);
      }
    };

    window.setTimeout(triggerPrint, 250);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
      <div className="bg-white rounded-2xl border border-[#DDD6FE] shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Modal Header — Unified OPD Pastel Gradient & MedScribe Logo */}
        <div className="px-5 py-4 border-b border-[#E6E0F0] flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-[#F3EEFF] via-[#EDF6FF] to-[#EBFBF3]">
          <div className="flex items-center gap-3">
            <MedScribeLogo variant="icon" size="sm" />
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <FileText className="w-3.5 h-3.5 text-violet-700" />
                <span className="font-semibold text-slate-800">{fullPatientName}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-violet-800">{patient.ipdNo || 'IPD'}</span>
                <span aria-hidden="true">·</span>
                <span>{patient.wardOrBed || 'Ward'}</span>
              </div>
              <h2 className="text-base font-bold text-slate-900 mt-0.5">
                {viewMode === 'review'
                  ? 'Discharge Summary — Review & Print'
                  : 'Discharge Summary Generator'}
              </h2>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex items-center rounded-xl border border-[#DDD6FE] bg-[#EFEBF9]/90 p-0.5"
              role="tablist"
              aria-label="Discharge summary mode"
            >
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'edit'}
                onClick={() => setViewMode('edit')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                  viewMode === 'edit'
                    ? 'bg-violet-700 text-white shadow-2xs'
                    : 'text-slate-700 hover:text-violet-950'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'review'}
                onClick={() => setViewMode('review')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                  viewMode === 'review'
                    ? 'bg-violet-700 text-white shadow-2xs'
                    : 'text-violet-800 hover:bg-white/70'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Print &amp; Review</span>
              </button>
            </div>

            {viewMode === 'edit' ? (
              <button
                type="button"
                onClick={() =>
                  setSummary(compileDefaultDischargeSummary(patient, doctor, availableProtocols))
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#DFD8F0] bg-white/90 hover:bg-white text-xs font-semibold text-violet-950 transition-colors cursor-pointer"
                title="Re-pull latest OT notes, protocol summary, investigations, ward treatments, and discharge medications"
              >
                <RefreshCw className="w-3.5 h-3.5 text-violet-700" />
                <span>Re-Compile from Chart</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handlePrintSummary(false)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-violet-700 hover:bg-violet-800 text-white text-xs font-bold shadow-2xs transition-colors cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Now</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-white/70 transition-colors cursor-pointer"
              aria-label="Close discharge summary modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        {viewMode === 'review' ? (
          <div className="flex-1 overflow-y-auto bg-slate-100/90 p-4 sm:p-6 space-y-4">
            {/* Review & Print Options Strip */}
            <div className="max-w-[210mm] mx-auto bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-xs">
              <div className="flex flex-wrap items-center gap-4">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={usePrePrintedStationery}
                    onChange={(e) => handleTogglePrePrintedStationery(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-700 focus:ring-indigo-500"
                  />
                  <span>Pre-Printed Hospital Stationery (blank letterhead space)</span>
                </label>
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={markAsDischarged}
                    onChange={(e) => setMarkAsDischarged(e.target.checked)}
                    className="rounded border-slate-300 text-teal-700 focus:ring-teal-500"
                  />
                  <span>Mark as Discharged on save</span>
                </label>
              </div>
              <button
                type="button"
                onClick={() => setViewMode('edit')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 hover:text-indigo-900 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Edit Fields</span>
              </button>
            </div>

            {/* A4 Printable Discharge Summary Sheet — Classic Monochrome NABH Hospital Layout */}
            <div className="max-w-[210mm] mx-auto bg-white border border-slate-300 shadow-sm p-6 sm:p-9 text-black">
              <div ref={printSheetRef} className="text-[11.5px] leading-[1.45] text-black font-sans">
                {/* Hospital / Doctor Letterhead (Omitted cleanly when Pre-Printed Stationery is selected) */}
                {usePrePrintedStationery ? (
                  <div className="discharge-stationery-spacer h-[30mm] border border-dashed border-neutral-300 bg-neutral-50/70 flex items-center justify-center text-[11px] text-neutral-400 mb-3">
                    <span className="discharge-print-hide">
                      Pre-printed Hospital Letterhead Space (30 mm) — Hidden on Print &amp; PDF
                    </span>
                  </div>
                ) : (
                  <header className="text-center border-b border-black pb-2.5 mb-2.5">
                    <h1 className="text-[16px] font-bold tracking-wide uppercase text-black">
                      {cardModel.hospitalName}
                    </h1>
                    {cardModel.departmentTitle && (
                      <div className="text-[11px] font-bold uppercase tracking-wide text-neutral-800 mt-0.5">
                        {cardModel.departmentTitle}
                      </div>
                    )}
                    <div className="text-[11px] text-neutral-900 mt-0.5">
                      {[
                        cardModel.doctorName,
                        cardModel.doctorDegrees,
                        cardModel.doctorRegNo ? `Reg: ${cardModel.doctorRegNo}` : '',
                      ]
                        .filter(Boolean)
                        .join('  |  ')}
                    </div>
                  </header>
                )}

                {/* Document Title */}
                <div className="text-center mb-2">
                  <div className="text-[13px] font-bold tracking-[0.12em] uppercase text-black">
                    DISCHARGE SUMMARY
                  </div>
                </div>

                {/* Compact Colon-Aligned Patient Demographics Strip */}
                <section className="discharge-avoid-break border-y border-black py-2 px-1.5 mb-3">
                  <div className="grid grid-cols-2 gap-x-8 gap-y-0.5 text-[11.5px] tabular-nums">
                    <div className="space-y-0.5">
                      {cardModel.uhid && (
                        <div className="grid grid-cols-[78px_1fr]">
                          <span className="font-bold">UHID</span>
                          <span>: {cardModel.uhid}</span>
                        </div>
                      )}
                      <div className="grid grid-cols-[78px_1fr]">
                        <span className="font-bold">Name</span>
                        <span className="font-bold">: {cardModel.fullPatientName}</span>
                      </div>
                      <div className="grid grid-cols-[78px_1fr]">
                        <span className="font-bold">Age / Sex</span>
                        <span>: {cardModel.ageSex}</span>
                      </div>
                      <div className="grid grid-cols-[78px_1fr]">
                        <span className="font-bold">Consultant</span>
                        <span>: {cardModel.consultantName}</span>
                      </div>
                    </div>
                    <div className="space-y-0.5">
                      {cardModel.ipdNo && (
                        <div className="grid grid-cols-[118px_1fr]">
                          <span className="font-bold">IP NO</span>
                          <span>: {cardModel.ipdNo}</span>
                        </div>
                      )}
                      <div className="grid grid-cols-[118px_1fr]">
                        <span className="font-bold">Bed No</span>
                        <span>: {cardModel.wardOrBed}</span>
                      </div>
                      <div className="grid grid-cols-[118px_1fr]">
                        <span className="font-bold">Date of Admission</span>
                        <span>: {cardModel.admissionDate}</span>
                      </div>
                      {cardModel.surgeryDate && (
                        <div className="grid grid-cols-[118px_1fr]">
                          <span className="font-bold">Date of Surgery</span>
                          <span>: {cardModel.surgeryDate}</span>
                        </div>
                      )}
                      <div className="grid grid-cols-[118px_1fr]">
                        <span className="font-bold">Date of Discharge</span>
                        <span>: {cardModel.dischargeDate}</span>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Single Continuous Bordered Clinical Form Frame (Empty Sections Automatically Omitted) */}
                <div className="border border-black divide-y divide-black">
                  {/* 1. DIAGNOSIS */}
                  {cardModel.diagnosis && (
                    <section className="discharge-avoid-break px-3 py-2">
                      <div className="text-[11px] font-bold uppercase tracking-wide text-black mb-0.5">
                        DIAGNOSIS :
                      </div>
                      <div className="text-[11.5px] font-semibold text-black whitespace-pre-wrap">
                        {cardModel.diagnosis}
                      </div>
                    </section>
                  )}

                  {/* 2. PRESENTING COMPLAINTS & HISTORY */}
                  {cardModel.presentingHistoryLines.length > 0 && (
                    <section className="discharge-avoid-break px-3 py-2">
                      <div className="text-[11px] font-bold uppercase tracking-wide text-black mb-0.5">
                        PRESENTING COMPLAINTS &amp; HISTORY :
                      </div>
                      {renderMonochromeLines(cardModel.presentingHistoryLines)}
                    </section>
                  )}

                  {/* 3. EXAMINATION ON ADMISSION */}
                  {cardModel.examinationLines.length > 0 && (
                    <section className="discharge-avoid-break px-3 py-2">
                      <div className="text-[11px] font-bold uppercase tracking-wide text-black mb-0.5">
                        EXAMINATION ON ADMISSION :
                      </div>
                      {renderMonochromeLines(cardModel.examinationLines)}
                    </section>
                  )}

                  {/* 4. COURSE IN HOSPITAL */}
                  {cardModel.courseInHospital && (
                    <section className="discharge-avoid-break px-3 py-2">
                      <div className="text-[11px] font-bold uppercase tracking-wide text-black mb-0.5">
                        COURSE IN HOSPITAL :
                      </div>
                      <p className="text-[11.5px] leading-[1.5] text-neutral-950 whitespace-pre-wrap">
                        {cardModel.courseInHospital}
                      </p>
                    </section>
                  )}

                  {/* 5. SURGERIES / PROCEDURE PERFORMED (Chronologically) */}
                  {(cardModel.surgeries.length > 0 || cardModel.fallbackProcedureLines.length > 0) && (
                    <section className="px-3 py-2">
                      <div className="text-[11px] font-bold uppercase tracking-wide text-black mb-1">
                        SURGERIES / PROCEDURE PERFORMED (Chronologically) :
                      </div>
                      {cardModel.surgeries.length > 0 ? (
                        <div className="space-y-2.5 text-[11.5px] leading-[1.45]">
                          {cardModel.surgeries.map((surg, sIdx) => (
                            <div key={sIdx} className="space-y-0.5">
                              {surg.surgeryDate && (
                                <div>
                                  <span className="font-bold">SURGERY DATE: </span>
                                  <span className="tabular-nums">{surg.surgeryDate}</span>
                                </div>
                              )}
                              <div>
                                <span className="font-bold">NAME OF THE SURGERY / PROCEDURE: </span>
                                <span>{surg.procedureName}</span>
                              </div>
                              {surg.performedBy && (
                                <div>
                                  <span className="font-bold">PERFORMED BY: </span>
                                  <span>{surg.performedBy}</span>
                                </div>
                              )}
                              {surg.detailsLines.length > 0 && (
                                <div className="pt-0.5">
                                  <div className="font-bold">
                                    DETAILS OF SURGERY / PROCEDURE AND FINDINGS :
                                  </div>
                                  {renderMonochromeLines(surg.detailsLines)}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        renderMonochromeLines(cardModel.fallbackProcedureLines)
                      )}
                    </section>
                  )}

                  {/* 6. ANAESTHESIA DETAILS */}
                  {cardModel.anaesthesia && (
                    <section className="discharge-avoid-break px-3 py-2">
                      <div className="text-[11px] font-bold uppercase tracking-wide text-black mb-0.5">
                        ANAESTHESIA DETAILS :
                      </div>
                      <div className="space-y-0.5 text-[11.5px]">
                        {cardModel.anaesthesia.typeOfAnaesthesia && (
                          <div>
                            <span className="font-bold">TYPE OF ANAESTHESIA: </span>
                            <span>{cardModel.anaesthesia.typeOfAnaesthesia}</span>
                          </div>
                        )}
                        {cardModel.anaesthesia.anaesthetistName && (
                          <div>
                            <span className="font-bold">NAME OF ANAESTHETIST: </span>
                            <span>{cardModel.anaesthesia.anaesthetistName}</span>
                          </div>
                        )}
                        {cardModel.anaesthesia.criticalEvents && (
                          <div>
                            <span className="font-bold">CRITICAL EVENTS IN OT IN DETAILS: </span>
                            <span>{cardModel.anaesthesia.criticalEvents}</span>
                          </div>
                        )}
                      </div>
                    </section>
                  )}

                  {/* 7. SIGNIFICANT MEDICATION GIVEN DURING HOSPITALIZATION */}
                  {cardModel.wardMedications.length > 0 && (
                    <section className="px-3 py-2">
                      <div className="text-[11px] font-bold uppercase tracking-wide text-black mb-1.5">
                        SIGNIFICANT MEDICATION GIVEN DURING HOSPITALIZATION :
                      </div>
                      <table className="w-full text-left border-collapse border border-black text-[10.5px] tabular-nums">
                        <thead>
                          <tr className="bg-neutral-100 border-b border-black font-bold text-black">
                            <th className="py-1 px-1.5 border-r border-black w-7 text-center">#</th>
                            <th className="py-1 px-2 border-r border-black">Medicine &amp; Strength</th>
                            <th className="py-1 px-2 border-r border-black">Route</th>
                            <th className="py-1 px-2 border-r border-black">Frequency</th>
                            <th className="py-1 px-2 border-r border-black">Days Given</th>
                            <th className="py-1 px-2">Remarks</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cardModel.wardMedications.map((item, idx) => (
                            <tr
                              key={idx}
                              className="border-b border-neutral-700 last:border-b-0 align-top"
                            >
                              <td className="py-1 px-1.5 border-r border-neutral-700 text-center">
                                {idx + 1}
                              </td>
                              <td className="py-1 px-2 border-r border-neutral-700 font-semibold">
                                {item.medicine}
                                {item.dosage ? ` (${item.dosage})` : ''}
                              </td>
                              <td className="py-1 px-2 border-r border-neutral-700">
                                {item.route || '—'}
                              </td>
                              <td className="py-1 px-2 border-r border-neutral-700">
                                {item.frequency || '—'}
                              </td>
                              <td className="py-1 px-2 border-r border-neutral-700">
                                {item.durationOrDates || '—'}
                              </td>
                              <td className="py-1 px-2">{item.notes || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </section>
                  )}

                  {/* 8. DETAILS OF IMPLANTS / STENTS / CATHETERS */}
                  {cardModel.implantsAndStentsLines.length > 0 && (
                    <section className="discharge-avoid-break px-3 py-2">
                      <div className="text-[11px] font-bold uppercase tracking-wide text-black mb-0.5">
                        DETAILS OF IMPLANTS / STENTS / CATHETERS :
                      </div>
                      {renderMonochromeLines(cardModel.implantsAndStentsLines)}
                    </section>
                  )}

                  {/* 9. SIGNIFICANT LABORATORY INVESTIGATIONS (Separate Row 1) */}
                  {cardModel.labInvestigationLines.length > 0 && (
                    <section className="px-3 py-2">
                      <div className="text-[11px] font-bold uppercase tracking-wide text-black mb-0.5">
                        SIGNIFICANT LABORATORY INVESTIGATIONS :
                      </div>
                      <div className="tabular-nums">
                        {renderMonochromeLines(cardModel.labInvestigationLines)}
                      </div>
                    </section>
                  )}

                  {/* 10. SIGNIFICANT RADIOLOGY INVESTIGATIONS (Separate Row 2) */}
                  {cardModel.radiologyInvestigationLines.length > 0 && (
                    <section className="px-3 py-2">
                      <div className="text-[11px] font-bold uppercase tracking-wide text-black mb-0.5">
                        SIGNIFICANT RADIOLOGY INVESTIGATIONS :
                      </div>
                      <div className="tabular-nums">
                        {renderMonochromeLines(cardModel.radiologyInvestigationLines)}
                      </div>
                    </section>
                  )}

                  {/* 11. CONDITION AT DISCHARGE IN DETAIL */}
                  {(cardModel.dischargeVitals.length > 0 || cardModel.conditionAtDischarge) && (
                    <section className="discharge-avoid-break px-3 py-2">
                      <div className="text-[11px] font-bold uppercase tracking-wide text-black mb-1">
                        CONDITION AT DISCHARGE IN DETAIL :
                      </div>
                      {cardModel.dischargeVitals.length > 0 && (
                        <div className="grid grid-cols-2 gap-x-8 gap-y-0.5 mb-1.5 text-[11.5px] tabular-nums">
                          {cardModel.dischargeVitals.map((vital, vIdx) => (
                            <div key={vIdx} className="grid grid-cols-[44px_1fr]">
                              <span className="font-bold">{vital.label}</span>
                              <span>: {vital.value}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {cardModel.conditionAtDischarge && (
                        <p className="text-[11.5px] leading-[1.45] text-neutral-950 whitespace-pre-wrap">
                          {cardModel.conditionAtDischarge}
                        </p>
                      )}
                    </section>
                  )}

                  {/* 12. DISCHARGE MEDICATIONS (Rx) */}
                  {cardModel.dischargeMedications.length > 0 && (
                    <section className="px-3 py-2">
                      <div className="text-[11px] font-bold uppercase tracking-wide text-black mb-1.5">
                        DISCHARGE MEDICATIONS (Rx) :
                      </div>
                      <table className="w-full text-left border-collapse border border-black text-[10.5px] tabular-nums">
                        <thead>
                          <tr className="bg-neutral-100 border-b border-black font-bold text-black">
                            <th className="py-1 px-1.5 border-r border-black w-7 text-center">#</th>
                            <th className="py-1 px-2 border-r border-black">Medicine &amp; Strength</th>
                            <th className="py-1 px-2 border-r border-black">Frequency</th>
                            <th className="py-1 px-2 border-r border-black">Timing</th>
                            <th className="py-1 px-2 border-r border-black">Duration</th>
                            <th className="py-1 px-2">Instructions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cardModel.dischargeMedications.map((rx, idx) => (
                            <tr
                              key={idx}
                              className="border-b border-neutral-700 last:border-b-0 align-top"
                            >
                              <td className="py-1 px-1.5 border-r border-neutral-700 text-center">
                                {idx + 1}
                              </td>
                              <td className="py-1 px-2 border-r border-neutral-700 font-semibold">
                                {rx.medicine || rx.drugName}
                                {rx.dosage ? ` (${rx.dosage})` : ''}
                              </td>
                              <td className="py-1 px-2 border-r border-neutral-700">
                                {rx.frequency || '—'}
                              </td>
                              <td className="py-1 px-2 border-r border-neutral-700">
                                {rx.when || rx.timing || '—'}
                              </td>
                              <td className="py-1 px-2 border-r border-neutral-700">
                                {rx.duration || '—'}
                              </td>
                              <td className="py-1 px-2">{rx.notes || rx.instructions || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </section>
                  )}

                  {/* 13. DISCHARGE ADVICE (DIET, WOUND & ACTIVITY) */}
                  {cardModel.dischargeAdviceLines.length > 0 && (
                    <section className="discharge-avoid-break px-3 py-2">
                      <div className="text-[11px] font-bold uppercase tracking-wide text-black mb-0.5">
                        DISCHARGE ADVICE (DIET, WOUND &amp; ACTIVITY) :
                      </div>
                      {renderMonochromeLines(cardModel.dischargeAdviceLines)}
                    </section>
                  )}

                  {/* 14. FOLLOW-UP PLAN */}
                  {cardModel.followUpLines.length > 0 && (
                    <section className="discharge-avoid-break px-3 py-2">
                      <div className="text-[11px] font-bold uppercase tracking-wide text-black mb-0.5">
                        FOLLOW-UP PLAN :
                      </div>
                      {renderMonochromeLines(cardModel.followUpLines)}
                    </section>
                  )}

                  {/* 15. URGENT RETURN WARNINGS (RED FLAGS) */}
                  {cardModel.redFlagLines.length > 0 && (
                    <section className="discharge-avoid-break px-3 py-2">
                      <div className="text-[11px] font-bold uppercase tracking-wide text-black mb-0.5">
                        URGENT RETURN WARNINGS (RED FLAGS) :
                      </div>
                      {renderMonochromeLines(cardModel.redFlagLines)}
                    </section>
                  )}
                </div>

                {/* Signature & Hospital Print Footer */}
                <footer className="discharge-avoid-break pt-6 mt-2">
                  <div className="flex justify-end">
                    <div className="text-right min-w-[200px]">
                      <div className="h-9 border-b border-black mb-1" />
                      <div className="text-[11.5px] font-bold text-black">
                        {cardModel.doctorName}
                      </div>
                      {cardModel.doctorDegrees && (
                        <div className="text-[10px] text-neutral-800">{cardModel.doctorDegrees}</div>
                      )}
                      {cardModel.doctorRegNo && (
                        <div className="text-[10px] text-neutral-800 tabular-nums">
                          Reg. No: {cardModel.doctorRegNo}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-5 pt-2 border-t border-neutral-300 flex flex-wrap items-center justify-between gap-3 text-[10px] text-neutral-700 tabular-nums">
                    <div>Prepared By: {cardModel.preparedBy}</div>
                    <div>Print Date &amp; Time: {cardModel.printTimestamp}</div>
                  </div>
                </footer>
              </div>
            </div>
          </div>
        ) : (
          /* EDIT FORM VIEW — Follows exact ordered headings */
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Discharge Metadata */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Discharge Date</label>
                <input
                  type="date"
                  value={summary.dischargeDate}
                  onChange={(e) => updateField('dischargeDate', e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-900"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Authorised By</label>
                <input
                  type="text"
                  value={summary.authorizedBy}
                  onChange={(e) => updateField('authorizedBy', e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-900"
                />
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={markAsDischarged}
                    onChange={(e) => setMarkAsDischarged(e.target.checked)}
                    className="rounded border-slate-300 text-teal-700 focus:ring-teal-500"
                  />
                  <span>Mark patient status as Discharged on save</span>
                </label>
              </div>
            </div>

            {/* 1. Diagnosis & 2. Procedure Performed with Date */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700">Diagnosis</label>
                </div>
                <textarea
                  rows={2}
                  value={summary.finalDiagnosis}
                  onChange={(e) => updateField('finalDiagnosis', e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-900"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700">
                    Procedure Performed with Date
                    <span className="font-normal text-slate-400 ml-1">
                      (Name, date &amp; anaesthesia, chronological)
                    </span>
                  </label>
                </div>
                <textarea
                  rows={2}
                  value={summary.procedurePerformed}
                  onChange={(e) => updateField('procedurePerformed', e.target.value)}
                  placeholder="e.g. URSL + DJ Stenting — Wed, Nov 25, 2026 — Anaesthesia: Spinal"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-900"
                />
              </div>
            </div>

            {/* 3. Presenting History & 4. Examination on IPD */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700">Presenting History</label>
                </div>
                <textarea
                  rows={4}
                  value={summary.chiefComplaintsAndHistory}
                  onChange={(e) => updateField('chiefComplaintsAndHistory', e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-900"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700">Examination on IPD</label>
                </div>
                <textarea
                  rows={4}
                  value={summary.examinationOnAdmission || ''}
                  onChange={(e) => updateField('examinationOnAdmission', e.target.value)}
                  placeholder="Vitals on admission, systemic, abdominal, local/genital, and DRE examination findings..."
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-900"
                />
              </div>
            </div>

            {/* 5. Investigations & 6. Course in Ward */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700">Investigations</label>
                </div>
                <textarea
                  rows={4}
                  value={summary.keyInvestigations}
                  onChange={(e) => updateField('keyInvestigations', e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-900 font-mono"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700">
                    Course in Ward
                    <span className="font-normal text-slate-400 ml-1">
                      (Concise paragraph summary of protocol followed)
                    </span>
                  </label>
                </div>
                <textarea
                  rows={4}
                  value={summary.hospitalCourse}
                  onChange={(e) => updateField('hospitalCourse', e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-900"
                />
              </div>
            </div>

            {/* 7. OT Notes (Detail OT notes only with date — no post-op orders) */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700">
                  OT Notes
                  <span className="font-normal text-slate-400 ml-1">
                    (Procedure name, intra-op findings &amp; steps, DJ stent, HPE if sent — excludes
                    post-op orders)
                  </span>
                </label>
              </div>
              <textarea
                rows={4}
                value={summary.otNotesSummary || ''}
                onChange={(e) => updateField('otNotesSummary', e.target.value)}
                placeholder="Auto-compiled from OT Notes in chronological order (leave blank if no surgery was performed)"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-900"
              />
            </div>

            {/* 8. Treatment Given in Ward (Editable Table) */}
            <div className="space-y-2.5 pt-2 border-t border-slate-200">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-bold text-slate-900">Treatment Given in Ward</h3>
                  <p className="text-[11px] text-slate-500">
                    Inpatient medications &amp; ward therapies — printed as a structured table in
                    the discharge summary.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateField('treatmentGivenInWard', [
                      ...(summary.treatmentGivenInWard || []),
                      {
                        medicine: '',
                        dosage: '',
                        route: 'IV',
                        frequency: '1-0-1 (BD)',
                        durationOrDates: '',
                        notes: '',
                      },
                    ])
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 text-teal-800 border border-teal-200 text-xs font-semibold cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Ward Treatment</span>
                </button>
              </div>

              {(summary.treatmentGivenInWard || []).length === 0 ? (
                <div className="p-3 rounded-lg border border-dashed border-slate-200 text-xs text-slate-500 text-center">
                  No ward treatments listed. Click &ldquo;Add Ward Treatment&rdquo; or Re-Compile
                  from Chart to pull from inpatient Medication Log.
                </div>
              ) : (
                <div className="border border-slate-200 rounded-lg overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600">
                        <th className="py-2 px-2.5 w-8 text-center">#</th>
                        <th className="py-2 px-2">Medicine</th>
                        <th className="py-2 px-2 w-28">Dosage</th>
                        <th className="py-2 px-2 w-28">Route</th>
                        <th className="py-2 px-2 w-32">Frequency</th>
                        <th className="py-2 px-2 w-32">Days Given</th>
                        <th className="py-2 px-2">Remarks</th>
                        <th className="py-2 px-2 w-10 text-right" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(summary.treatmentGivenInWard || []).map((item, idx) => (
                        <tr key={idx} className="bg-white">
                          <td className="py-1.5 px-2.5 text-center text-slate-400 font-mono">
                            {idx + 1}
                          </td>
                          <td className="py-1.5 px-2">
                            <input
                              list="suggest-medicine"
                              placeholder="Medicine"
                              value={item.medicine || ''}
                              onChange={(e) =>
                                updateWardTreatmentRow(idx, { medicine: e.target.value })
                              }
                              className="w-full px-2 py-1 text-xs border border-slate-200 rounded bg-white font-semibold"
                            />
                          </td>
                          <td className="py-1.5 px-2">
                            <input
                              list="suggest-dosage"
                              placeholder="Strength"
                              value={item.dosage || ''}
                              onChange={(e) =>
                                updateWardTreatmentRow(idx, { dosage: e.target.value })
                              }
                              className="w-full px-2 py-1 text-xs border border-slate-200 rounded bg-white"
                            />
                          </td>
                          <td className="py-1.5 px-2">
                            <input
                              placeholder="IV / PO / IM"
                              value={item.route || ''}
                              onChange={(e) =>
                                updateWardTreatmentRow(idx, { route: e.target.value })
                              }
                              className="w-full px-2 py-1 text-xs border border-slate-200 rounded bg-white"
                            />
                          </td>
                          <td className="py-1.5 px-2">
                            <input
                              list="suggest-frequency"
                              placeholder="BD / TDS"
                              value={item.frequency || ''}
                              onChange={(e) =>
                                updateWardTreatmentRow(idx, { frequency: e.target.value })
                              }
                              className="w-full px-2 py-1 text-xs border border-slate-200 rounded bg-white"
                            />
                          </td>
                          <td className="py-1.5 px-2">
                            <input
                              placeholder="e.g., 3 Days"
                              value={item.durationOrDates || ''}
                              onChange={(e) =>
                                updateWardTreatmentRow(idx, { durationOrDates: e.target.value })
                              }
                              className="w-full px-2 py-1 text-xs border border-slate-200 rounded bg-white"
                            />
                          </td>
                          <td className="py-1.5 px-2">
                            <input
                              placeholder="Notes"
                              value={item.notes || ''}
                              onChange={(e) =>
                                updateWardTreatmentRow(idx, { notes: e.target.value })
                              }
                              className="w-full px-2 py-1 text-xs border border-slate-200 rounded bg-white"
                            />
                          </td>
                          <td className="py-1.5 px-2 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                updateField(
                                  'treatmentGivenInWard',
                                  (summary.treatmentGivenInWard || []).filter((_, i) => i !== idx)
                                )
                              }
                              className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                              aria-label="Remove ward treatment row"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* 9. Condition on Discharge */}
            <div className="space-y-1 pt-2 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700">
                  Condition on Discharge
                </label>
              </div>
              <textarea
                rows={2}
                value={summary.conditionAtDischarge}
                onChange={(e) => updateField('conditionAtDischarge', e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-900"
              />
            </div>

            {/* 10. Discharge Medications */}
            <div className="space-y-2.5 pt-2 border-t border-slate-200">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-bold text-slate-900">Discharge Medications (Rx)</h3>
                <button
                  type="button"
                  onClick={() =>
                    updateField('dischargeMedications', [
                      ...(summary.dischargeMedications || []),
                      {
                        medicine: '',
                        dosage: '',
                        when: 'After food (p/c)',
                        frequency: '1-0-1 (BD)',
                        duration: '5 Days',
                        notes: '',
                      },
                    ])
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-800 border border-indigo-200 text-xs font-semibold cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Medicine</span>
                </button>
              </div>

              <MedicinePresetsBar
                onAddMedicinePreset={(preset) =>
                  updateField('dischargeMedications', [
                    ...(summary.dischargeMedications || []),
                    preset,
                  ])
                }
                onApplyMedicationGroup={handleApplyGroup}
                onOpenMedicineMaster={onOpenMedicineMaster}
                doctorUid={doctor?.uid}
              />

              <div className="space-y-2">
                {(summary.dischargeMedications || []).map((rx, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center p-2.5 rounded-lg border border-slate-200 bg-slate-50/50"
                  >
                    <input
                      list="suggest-medicine"
                      placeholder="Medicine"
                      value={rx.medicine || ''}
                      onChange={(e) =>
                        updateRx(idx, { medicine: e.target.value, drugName: e.target.value })
                      }
                      className="sm:col-span-3 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white font-semibold"
                    />
                    <input
                      list="suggest-dosage"
                      placeholder="Dosage"
                      value={rx.dosage || ''}
                      onChange={(e) =>
                        updateRx(idx, { dosage: e.target.value, dosageStrength: e.target.value })
                      }
                      className="sm:col-span-2 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
                    />
                    <input
                      list="suggest-frequency"
                      placeholder="Frequency"
                      value={rx.frequency || ''}
                      onChange={(e) => updateRx(idx, { frequency: e.target.value })}
                      className="sm:col-span-2 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
                    />
                    <input
                      list="suggest-duration"
                      placeholder="Duration"
                      value={rx.duration || ''}
                      onChange={(e) => updateRx(idx, { duration: e.target.value })}
                      className="sm:col-span-2 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
                    />
                    <input
                      list="suggest-rxNotes"
                      placeholder="Patient note (e.g. red urine)"
                      value={rx.notes || ''}
                      onChange={(e) =>
                        updateRx(idx, { notes: e.target.value, instructions: e.target.value })
                      }
                      className="sm:col-span-2 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
                    />
                    <div className="sm:col-span-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() =>
                          updateField(
                            'dischargeMedications',
                            summary.dischargeMedications.filter((_, i) => i !== idx)
                          )
                        }
                        className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                        aria-label="Remove discharge medication"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 11-14. Post-Discharge Sections (After Discharge Medications — Exact Image 2 Order) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-200">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700">
                    Diet, Wound &amp; Activity Advice
                  </label>
                </div>
                <textarea
                  rows={3}
                  value={summary.dietAndActivityAdvice}
                  onChange={(e) => updateField('dietAndActivityAdvice', e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-900"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-rose-800">
                    Urgent Return Warnings (Red Flags)
                  </label>
                </div>
                <textarea
                  rows={3}
                  value={summary.redFlagWarnings}
                  onChange={(e) => updateField('redFlagWarnings', e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-rose-200 rounded-lg bg-rose-50/30 text-slate-900"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700">
                    DJ Stent / Catheter / Drain &amp; HPE Plan
                  </label>
                </div>
                <textarea
                  rows={3}
                  value={summary.stentOrTubePlan}
                  onChange={(e) => updateField('stentOrTubePlan', e.target.value)}
                  placeholder="DJ stent & removal date/duration; catheter or drain only if discharged in situ; HPE & sample sent..."
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-900"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700">Follow-Up Plan</label>
                </div>
                <textarea
                  rows={2}
                  value={summary.followUpPlan}
                  onChange={(e) => updateField('followUpPlan', e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-900"
                />
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2.5">
          <div>
            {viewMode === 'review' ? (
              <button
                type="button"
                onClick={() => setViewMode('edit')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Edit</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2.5">
            {viewMode === 'edit' ? (
              <>
                <button
                  type="button"
                  onClick={() => setViewMode('review')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-indigo-300 text-indigo-800 bg-indigo-50 hover:bg-indigo-100 text-xs font-bold cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print &amp; Review</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveAndExport(false)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-teal-700 text-teal-800 bg-white hover:bg-teal-50 text-xs font-semibold cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Save Summary</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveAndExport(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Save &amp; Export Discharge PDF</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => handleSaveAndExport(false)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-teal-700 text-teal-800 bg-white hover:bg-teal-50 text-xs font-semibold cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Save Summary</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveAndExport(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-xs font-semibold cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Save &amp; Export PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => handlePrintSummary(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-bold cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Save &amp; Print Summary</span>
                </button>
              </>
            )}
          </div>
        </div>

        <GlobalFieldDatalists />
      </div>
    </div>
  );
};
