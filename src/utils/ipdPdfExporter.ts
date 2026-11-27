import { jsPDF } from 'jspdf';
import { IpdDailyNote, IpdMedicationOrder, IpdPatientRecord } from '../types/ipd';
import { DoctorAccount } from '../types/doctor';
import { getActiveDoctorPrintCredentials } from './pdfExporter';
import {
  formatDailyProgressPodLabel,
  formatPodLabel,
  getProtocolCompletionStats,
  getSurgicalProtocolById,
} from './surgicalProtocols';
import { formatDisplayDate } from './excelExporter';
import {
  getConsultationOtProcedures,
  splitOperativeTextIntoLines,
} from './otNotesUtils';
import {
  formatGroupedClinicalNotePlainText,
  parseAndGroupClinicalNoteBlocks,
} from '../components/FormattedClinicalNote';
import {
  ResolvedDailyMedicationRow,
  getResolvedDailyMedicationsForDate,
  getSavedDailyMedicationDates,
} from './ipdDailyMedications';
import {
  consolidateDailyNotesForDate,
  getNormalizedDailyNotesForPatient,
  isDischargeProtocolDailyNote,
} from './ipdClinicalSync';
import { buildDischargeCardModel, DischargeCardModel } from './ipdDischargeLayout';

function safeFileSlug(name: string): string {
  return (name || 'Patient')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);
}

const DISCHARGE_PREPRINTED_STORAGE_KEY = 'medscribe_ipd_discharge_preprinted_stationery';

export function getSavedDischargePreprintedPreference(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(DISCHARGE_PREPRINTED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function saveDischargePreprintedPreference(enabled: boolean): void {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DISCHARGE_PREPRINTED_STORAGE_KEY, enabled ? 'true' : 'false');
    }
  } catch {
    // Ignore storage errors
  }
}

export function stripLatestOpdExaminationLabel(text?: string): string {
  if (!text) return '';
  return text
    .replace(/^\s*(?:[-•*]\s*)?latest\s+opd\s+examination(?:\s*\([^)]*\))?\s*:?\s*\r?\n?/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function drawHospitalHeader(
  pdf: jsPDF,
  title: string,
  doctor?: DoctorAccount | null,
  preprintedStationery = false
): number {
  const pageW = pdf.internal.pageSize.getWidth();

  if (preprintedStationery) {
    // Skip hospital name, department, doctor credentials & divider; leave clean 36mm top letterhead space
    let y = 38;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11.5);
    pdf.setTextColor(15, 23, 42);
    pdf.text(title.toUpperCase(), pageW / 2, y, { align: 'center' });
    return y + 5.5;
  }

  const creds = getActiveDoctorPrintCredentials(doctor);
  let y = 14;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.setTextColor(30, 41, 59);
  pdf.text(creds.hospitalName.toUpperCase(), pageW / 2, y, { align: 'center' });
  y += 5;

  pdf.setFontSize(9.5);
  pdf.setTextColor(71, 85, 105);
  pdf.text(creds.departmentTitle, pageW / 2, y, { align: 'center' });
  y += 4.5;

  pdf.setFontSize(10);
  pdf.setTextColor(15, 23, 42);
  const docLine = [creds.doctorName, creds.doctorDegrees, creds.doctorRegNo ? `Reg: ${creds.doctorRegNo}` : '']
    .filter(Boolean)
    .join('  |  ');
  pdf.text(docLine, pageW / 2, y, { align: 'center' });
  y += 5;

  pdf.setDrawColor(148, 163, 184);
  pdf.setLineWidth(0.4);
  pdf.line(14, y, pageW - 14, y);
  y += 6;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11.5);
  pdf.setTextColor(15, 23, 42);
  pdf.text(title.toUpperCase(), pageW / 2, y, { align: 'center' });
  y += 5.5;

  return y;
}

function ensurePageSpace(pdf: jsPDF, y: number, neededHeight: number): number {
  const pageH = pdf.internal.pageSize.getHeight();
  if (y + neededHeight > pageH - 16) {
    pdf.addPage();
    return 18;
  }
  return y;
}

function drawSectionHeading(pdf: jsPDF, title: string, y: number): number {
  const pageW = pdf.internal.pageSize.getWidth();
  y = ensurePageSpace(pdf, y, 13);
  pdf.setFillColor(240, 253, 250);
  pdf.rect(14, y - 4.2, pageW - 28, 7, 'F');
  pdf.setFillColor(15, 118, 110);
  pdf.rect(14, y - 4.2, 1.4, 7, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9.5);
  pdf.setTextColor(15, 23, 42);
  pdf.text(title.toUpperCase(), 17.5, y + 0.6);
  return y + 7.2;
}

function drawWrappedBlock(
  pdf: jsPDF,
  text: string,
  y: number,
  fontSize = 8.8,
  indent = 16
): number {
  if (!text || !text.trim()) return y;
  const pageW = pdf.internal.pageSize.getWidth();
  const maxWidth = pageW - indent - 15;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(fontSize);
  pdf.setTextColor(30, 41, 59);
  const lines = pdf.splitTextToSize(text.trim(), maxWidth) as string[];
  for (const line of lines) {
    y = ensurePageSpace(pdf, y, 5);
    pdf.text(line, indent, y);
    y += 4.2;
  }
  return y + 1.5;
}

/**
 * Draws clubbed clinical blocks (e.g. "URSL · POD 1", "POD 1 (25/11/2026)") with bold,
 * subtly highlighted sub-headings on their own line and clean bulleted items underneath.
 */
function drawFormattedClinicalBlocks(
  pdf: jsPDF,
  text: string,
  y: number,
  fontSize = 8.7
): number {
  if (!text || !text.trim()) return y;
  const blocks = parseAndGroupClinicalNoteBlocks(text);
  if (blocks.length === 0) return drawWrappedBlock(pdf, text, y, fontSize);

  const pageW = pdf.internal.pageSize.getWidth();

  for (const block of blocks) {
    if (block.type === 'protocol-group') {
      y = ensurePageSpace(pdf, y, 11);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(fontSize);
      const headingWidth = Math.min(pageW - 34, pdf.getTextWidth(block.tag) + 5);
      pdf.setFillColor(241, 245, 249);
      pdf.roundedRect(16, y - 3.6, headingWidth, 5.2, 0.8, 0.8, 'F');
      pdf.setTextColor(15, 118, 110);
      pdf.text(block.tag, 18.2, y + 0.1);
      y += 5.4;

      for (const entry of block.entries) {
        const lineText =
          entry.kind === 'kv' && entry.label
            ? `• ${entry.label}: ${entry.text}`
            : `• ${entry.text}`;
        y = drawWrappedBlock(pdf, lineText, y, fontSize - 0.1, 19);
      }
      y += 0.8;
    } else if (block.type === 'section-heading') {
      y = ensurePageSpace(pdf, y, 8);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(fontSize);
      pdf.setTextColor(15, 23, 42);
      pdf.text(block.heading, 16, y);
      y += 4.8;
    } else if (block.type === 'kv') {
      y = ensurePageSpace(pdf, y, 9);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(fontSize);
      pdf.setTextColor(15, 23, 42);
      pdf.text(`${block.heading}:`, 16, y);
      y += 4.3;
      y = drawWrappedBlock(pdf, block.value, y, fontSize - 0.1, 19);
    } else {
      y = drawWrappedBlock(pdf, `• ${block.text}`, y, fontSize - 0.1, 16);
    }
  }

  return y + 1;
}

function drawPatientBanner(pdf: jsPDF, patient: IpdPatientRecord, y: number): number {
  const pageW = pdf.internal.pageSize.getWidth();
  y = ensurePageSpace(pdf, y, 22);
  pdf.setDrawColor(203, 213, 225);
  pdf.setLineWidth(0.3);
  pdf.rect(14, y, pageW - 28, 20);

  const fullName = `${patient.salutation ? `${patient.salutation} ` : ''}${patient.patientName}`.trim();
  const pod = formatPodLabel(patient.surgeryDate);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9.5);
  pdf.setTextColor(15, 23, 42);
  pdf.text(`Patient: ${fullName}`, 17, y + 5.5);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  pdf.setTextColor(51, 65, 85);
  pdf.text(
    `Age/Sex: ${patient.age || '—'} / ${patient.gender || '—'}    |    Ward/Bed: ${patient.wardOrBed || '—'}`,
    17,
    y + 11
  );
  pdf.text(
    `Admitted: ${formatDisplayDate(patient.admissionDate)}${patient.surgeryDate ? `    |    Surgery: ${formatDisplayDate(patient.surgeryDate)} (${pod || 'POD'})` : ''}${patient.dischargeDate ? `    |    Discharged: ${formatDisplayDate(patient.dischargeDate)}` : ''}`,
    17,
    y + 16.5
  );

  pdf.setFont('helvetica', 'bold');
  pdf.text(`IPD No: ${patient.ipdNo || '—'}`, pageW - 17, y + 5.5, { align: 'right' });
  pdf.setFont('helvetica', 'normal');
  pdf.text(`UHID: ${patient.uhid || '—'}`, pageW - 17, y + 11, { align: 'right' });
  pdf.text(`Status: ${patient.status.toUpperCase()}`, pageW - 17, y + 16.5, { align: 'right' });

  return y + 25;
}

/**
 * Exports a comprehensive IPD Clinical Progress, Medication Log, Investigations, OT Notes & Protocol Report PDF for doctor reviews.
 */
export function exportIpdPatientReviewPdf(
  patient: IpdPatientRecord,
  doctor?: DoctorAccount | null
): void {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let y = drawHospitalHeader(pdf, 'IPD Inpatient Clinical Review & Medication Report', doctor);
  y = drawPatientBanner(pdf, patient, y);

  // Diagnosis & Clinical Summary
  y = drawSectionHeading(pdf, '1. Admitting Diagnosis & Clinical Summary', y);
  y = drawWrappedBlock(pdf, `Diagnosis: ${patient.admittingDiagnosis || '—'}`, y);
  if (patient.comorbidities) {
    y = drawWrappedBlock(pdf, `Comorbidities: ${patient.comorbidities}`, y);
  }
  if (patient.allergies) {
    y = drawWrappedBlock(pdf, `Allergies: ${patient.allergies}`, y);
  }
  if (patient.clinicalSummary) {
    y = drawWrappedBlock(pdf, `Clinical Summary: ${patient.clinicalSummary}`, y);
  }

  // Daily Progress Notes
  const normalizedDailyNotes = getNormalizedDailyNotesForPatient(patient);
  y = drawSectionHeading(
    pdf,
    `2. Daily Progress Notes (${normalizedDailyNotes.length} entries)`,
    y
  );
  if (normalizedDailyNotes.length === 0) {
    y = drawWrappedBlock(pdf, 'No daily progress notes recorded yet.', y);
  } else {
    const sortedNotes = [...normalizedDailyNotes].sort((a, b) =>
      `${a.date} ${isDischargeProtocolDailyNote(a) ? '1' : '0'} ${a.time}`.localeCompare(
        `${b.date} ${isDischargeProtocolDailyNote(b) ? '1' : '0'} ${b.time}`
      )
    );
    for (const note of sortedNotes) {
      y = ensurePageSpace(pdf, y, 20);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8.8);
      pdf.setTextColor(15, 23, 42);
      const isDischargeNote = isDischargeProtocolDailyNote(note);
      const notePod = isDischargeNote
        ? 'Discharge'
        : formatDailyProgressPodLabel(note.podLabel, patient.surgeryDate, note.date);
      const header = isDischargeNote
        ? `Discharge on ${formatDisplayDate(note.date)}${note.authorName ? `  ·  ${note.authorName}` : ''}`
        : `${formatDisplayDate(note.date)} ${note.time || ''}${notePod ? `  ·  ${notePod}` : ''}${note.authorName ? `  ·  ${note.authorName}` : ''}`;
      pdf.text(header, 16, y);
      y += 4.3;

      const v = note.vitals || {};
      const vitalsParts = [
        v.bp ? `BP ${v.bp}` : '',
        v.pulse ? `PR ${v.pulse}` : '',
        v.temp ? `Temp ${v.temp}` : '',
        v.spo2 ? `SpO2 ${v.spo2}` : '',
        v.intakeMl ? `Intake ${v.intakeMl}` : '',
        v.urineOutputMl ? `UO ${v.urineOutputMl}` : '',
        v.drainOutputMl ? `Drain ${v.drainOutputMl}${v.drainCharacter ? ` (${v.drainCharacter})` : ''}` : '',
      ].filter(Boolean);
      if (vitalsParts.length > 0) {
        y = drawWrappedBlock(pdf, `Vitals & I/O: ${vitalsParts.join(' · ')}`, y, 8.2, 18);
      }
      if (note.subjective) {
        y = drawWrappedBlock(
          pdf,
          `S:\n${formatGroupedClinicalNotePlainText(note.subjective, notePod)}`,
          y,
          8.5,
          18
        );
      }
      if (note.objective) {
        y = drawWrappedBlock(
          pdf,
          `O:\n${formatGroupedClinicalNotePlainText(note.objective, notePod)}`,
          y,
          8.5,
          18
        );
      }
      if (note.assessmentPlan) {
        y = drawWrappedBlock(
          pdf,
          `A/P:\n${formatGroupedClinicalNotePlainText(note.assessmentPlan, notePod)}`,
          y,
          8.5,
          18
        );
      }
      y += 1.5;
    }
  }

  // Inpatient Medication Orders & Administration Log
  y = drawSectionHeading(
    pdf,
    `3. Inpatient Medication Chart (${patient.medications.length} orders · ${patient.medicationLogs.length} MAR logs)`,
    y
  );
  if (patient.medications.length === 0) {
    y = drawWrappedBlock(pdf, 'No inpatient medications charted.', y);
  } else {
    patient.medications.forEach((med, idx) => {
      const line = `${idx + 1}. ${med.medicine}${med.dosage ? ` ${med.dosage}` : ''}  |  ${med.route || 'PO'}  |  ${med.frequency || '—'}${med.when ? ` (${med.when})` : ''}  |  [${med.status.toUpperCase()}]${med.startDate ? ` from ${formatDisplayDate(med.startDate)}` : ''}${med.notes ? ` — Note: ${med.notes}` : ''}`;
      y = drawWrappedBlock(pdf, line, y, 8.5, 16);
    });
  }

  const savedMedDates = getSavedDailyMedicationDates(patient);
  if (savedMedDates.length > 0) {
    y = ensurePageSpace(pdf, y, 12);
    for (const dateKey of savedMedDates) {
      const resolved = getResolvedDailyMedicationsForDate(patient, dateKey);
      if (resolved.items.length === 0) continue;
      y = ensurePageSpace(pdf, y, 10);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8.5);
      pdf.setTextColor(51, 65, 85);
      pdf.text(`Medication List for ${formatDisplayDate(dateKey)}:`, 16, y);
      y += 4.5;
      for (const item of resolved.items) {
        const statusText = item.status === 'confirmed' ? 'CONFIRMED' : 'HELD';
        const line = `• ${item.medicine}${item.dosage ? ` ${item.dosage}` : ''}  |  ${item.route}${item.frequency ? ` · ${item.frequency}` : ''}  |  Day ${item.dayNumber}  |  [${statusText}]`;
        y = drawWrappedBlock(pdf, line, y, 8.1, 18);
      }
      y += 1.5;
    }
  }

  // Investigations
  y = drawSectionHeading(
    pdf,
    `4. Investigations (${patient.investigationRecords.length} structured records)`,
    y
  );
  if (patient.investigationRecords.length > 0) {
    const sortedInv = [...patient.investigationRecords].sort((a, b) =>
      (b.reportDate || '').localeCompare(a.reportDate || '')
    );
    for (const inv of sortedInv) {
      const invLine = `• ${inv.displayDate || formatDisplayDate(inv.reportDate)} [${inv.category.toUpperCase()}] ${inv.parameterName}: ${inv.valueOrImpression}${inv.flag && inv.flag !== 'Normal' ? ` (${inv.flag})` : ''}`;
      y = drawWrappedBlock(pdf, invLine, y, 8.3, 16);
    }
  } else if (patient.labTestsAndImaging) {
    y = drawWrappedBlock(pdf, patient.labTestsAndImaging, y, 8.5, 16);
  } else {
    y = drawWrappedBlock(pdf, 'No investigations recorded.', y);
  }

  // Operation Theatre Notes
  const otProcs = getConsultationOtProcedures(patient as any);
  if (otProcs.length > 0) {
    y = drawSectionHeading(pdf, `5. Operation Theatre (OT) Notes (${otProcs.length})`, y);
    otProcs.forEach((ot, i) => {
      const head = `Procedure ${i + 1}: ${ot.procedureName || 'Surgery'} on ${formatDisplayDate(ot.surgeryDate || '')}${ot.surgeonName ? ` · Surgeon: ${ot.surgeonName}` : ''}${ot.anaesthesiaType ? ` · ${ot.anaesthesiaType}` : ''}`;
      y = drawWrappedBlock(pdf, head, y, 8.8, 16);
      if (ot.operativeFindings) {
        const findingLines = splitOperativeTextIntoLines(ot.operativeFindings);
        if (findingLines.length > 0) {
          y = drawWrappedBlock(pdf, 'Findings:', y, 8.3, 18);
          for (const fl of findingLines) {
            y = drawWrappedBlock(pdf, `• ${fl}`, y, 8.2, 21);
          }
        }
      }
      if (ot.operativeSteps) {
        const stepLines = splitOperativeTextIntoLines(ot.operativeSteps);
        if (stepLines.length > 0) {
          y = drawWrappedBlock(pdf, 'Steps:', y, 8.3, 18);
          for (const sl of stepLines) {
            y = drawWrappedBlock(pdf, `• ${sl}`, y, 8.2, 21);
          }
        }
      }
      if (ot.catheterOrStentDetails) y = drawWrappedBlock(pdf, `Catheter/Stent: ${ot.catheterOrStentDetails}`, y, 8.3, 18);
      if (ot.drainDetails) y = drawWrappedBlock(pdf, `Drain: ${ot.drainDetails}`, y, 8.3, 18);
      if (ot.specimenSent) y = drawWrappedBlock(pdf, `Specimen: ${ot.specimenSent}`, y, 8.3, 18);
    });
  }

  // Surgical Protocol Compliance
  if (patient.surgicalProtocol) {
    const proto = getSurgicalProtocolById(patient.surgicalProtocol.protocolId);
    if (proto) {
      const stats = getProtocolCompletionStats(
        patient.surgicalProtocol.protocolId,
        patient.surgicalProtocol.checkedItemIds
      );
      y = drawSectionHeading(
        pdf,
        `6. Surgical Protocol: ${proto.name} (${stats.completed}/${stats.total} · ${stats.percent}%)`,
        y
      );
      const fvEntries = Object.entries(patient.surgicalProtocol.fieldValues || {}).filter(
        ([, val]) => Boolean(String(val || '').trim())
      );
      if (fvEntries.length > 0) {
        const kvLine = fvEntries.map(([k, v]) => `${k}: ${v}`).join('  |  ');
        y = drawWrappedBlock(pdf, `Recorded Parameters: ${kvLine}`, y, 8.1, 16);
      }
      const checkedSet = new Set(patient.surgicalProtocol.checkedItemIds || []);
      for (const stage of proto.stages) {
        const doneCount = stage.items.filter((it) => checkedSet.has(it.id)).length;
        y = drawWrappedBlock(
          pdf,
          `${stage.dayTag} — ${stage.title} (${doneCount}/${stage.items.length} completed)`,
          y,
          8.4,
          16
        );
      }
      if (patient.surgicalProtocol.deviationsNote) {
        y = drawWrappedBlock(
          pdf,
          `Deviations / Remarks: ${patient.surgicalProtocol.deviationsNote}`,
          y,
          8.3,
          16
        );
      }
    }
  }

  const fileName = `IPD_Review_${safeFileSlug(patient.patientName)}_${patient.admissionDate || 'record'}.pdf`;
  pdf.save(fileName);
}

function drawPdfTable(
  pdf: jsPDF,
  headers: string[],
  colWidths: number[],
  rows: string[][],
  y: number
): number {
  const startX = 14;
  const totalW = colWidths.reduce((a, b) => a + b, 0);
  const padX = 2;
  const lineH = 3.8;
  const headerH = 6.5;

  const drawHeader = (curY: number): number => {
    pdf.setFillColor(241, 245, 249);
    pdf.setDrawColor(148, 163, 184);
    pdf.setLineWidth(0.25);
    pdf.rect(startX, curY, totalW, headerH, 'FD');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.8);
    pdf.setTextColor(30, 41, 59);
    let x = startX;
    for (let i = 0; i < headers.length; i++) {
      if (i > 0) {
        pdf.line(x, curY, x, curY + headerH);
      }
      pdf.text(headers[i], x + padX, curY + 4.4);
      x += colWidths[i];
    }
    return curY + headerH;
  };

  y = ensurePageSpace(pdf, y, headerH + 8);
  y = drawHeader(y);

  pdf.setFontSize(8);
  for (const row of rows) {
    const cellLines = row.map((cell, i) => {
      pdf.setFont('helvetica', i === 1 ? 'bold' : 'normal');
      return pdf.splitTextToSize(cell || '—', Math.max(6, colWidths[i] - padX * 2)) as string[];
    });
    const maxLines = Math.max(1, ...cellLines.map((l) => l.length));
    const rowH = maxLines * lineH + 2.8;

    const pageH = pdf.internal.pageSize.getHeight();
    if (y + rowH > pageH - 16) {
      pdf.addPage();
      y = 18;
      y = drawHeader(y);
    }

    pdf.setDrawColor(203, 213, 225);
    pdf.setLineWidth(0.2);
    pdf.rect(startX, y, totalW, rowH, 'S');

    let x = startX;
    for (let i = 0; i < colWidths.length; i++) {
      if (i > 0) {
        pdf.line(x, y, x, y + rowH);
      }
      pdf.setFont('helvetica', i === 1 ? 'bold' : 'normal');
      pdf.setTextColor(i === 0 ? 100 : 15, i === 0 ? 116 : 23, i === 0 ? 139 : 42);
      const lines = cellLines[i] || ['—'];
      lines.forEach((ln, li) => {
        pdf.text(ln, x + padX, y + 4.0 + li * lineH);
      });
      x += colWidths[i];
    }
    y += rowH;
  }

  return y + 3;
}

/**
 * Exports a clean monochrome NABH-style A4 Hospital Discharge Summary PDF
 * matching standard hospital stationery with bordered clinical sections,
 * automatic continuation headers on Page 2+, split Lab & Radiology rows,
 * and automatic omission of empty sections.
 */
export function exportIpdDischargeSummaryPdf(
  patient: IpdPatientRecord,
  doctor?: DoctorAccount | null,
  options?: { preprintedStationery?: boolean }
): void {
  const ds = patient.dischargeSummary;
  if (!ds) return;

  const usePreprinted =
    options?.preprintedStationery !== undefined
      ? Boolean(options.preprintedStationery)
      : getSavedDischargePreprintedPreference();

  const model: DischargeCardModel = buildDischargeCardModel(patient, ds, doctor);
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth(); // 210
  const pageH = pdf.internal.pageSize.getHeight(); // 297
  const marginX = 13;
  const boxW = pageW - marginX * 2; // 184
  const padX = 3.2;
  const textX = marginX + padX;
  const textMaxW = boxW - padX * 2;
  const pageBottomLimit = pageH - 18; // Reserve footer strip at bottom

  let y = 14;
  let frameTopY = 0;
  let frameOpen = false;
  let isFirstSectionOnPage = true;

  const setBlackInk = () => {
    pdf.setTextColor(15, 15, 15);
    pdf.setDrawColor(30, 30, 30);
  };

  const closeCurrentFrame = () => {
    if (!frameOpen) return;
    pdf.setDrawColor(30, 30, 30);
    pdf.setLineWidth(0.32);
    // Left, right, and bottom border of the continuous clinical box on this page
    pdf.line(marginX, frameTopY, marginX, y);
    pdf.line(marginX + boxW, frameTopY, marginX + boxW, y);
    pdf.line(marginX, y, marginX + boxW, y);
    frameOpen = false;
  };

  const openFrameAtCurrentY = () => {
    frameTopY = y;
    pdf.setDrawColor(30, 30, 30);
    pdf.setLineWidth(0.32);
    pdf.line(marginX, frameTopY, marginX + boxW, frameTopY);
    frameOpen = true;
    isFirstSectionOnPage = true;
  };

  const drawContinuationHeader = () => {
    setBlackInk();
    const topY = 14;
    pdf.setLineWidth(0.32);
    pdf.line(marginX, topY, marginX + boxW, topY);

    const contLeft: Array<[string, string, boolean?]> = [];
    if (model.uhid) contLeft.push(['UHID', model.uhid]);
    contLeft.push(['Name', model.fullPatientName, true]);

    const contRight: Array<[string, string]> = [];
    if (model.ipdNo) contRight.push(['IP NO', model.ipdNo]);
    if (model.wardOrBed && model.wardOrBed !== '—') contRight.push(['Bed No', model.wardOrBed]);

    const rowCount = Math.max(1, contLeft.length, contRight.length);
    const rowStep = 4.6;
    for (let i = 0; i < rowCount; i++) {
      const ry = topY + 4.8 + i * rowStep;
      const l = contLeft[i];
      const r = contRight[i];
      if (l) {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8.2);
        pdf.text(l[0], marginX + 2, ry);
        pdf.setFont('helvetica', l[2] ? 'bold' : 'normal');
        pdf.text(`: ${l[1]}`, marginX + 22, ry);
      }
      if (r) {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8.2);
        pdf.text(r[0], marginX + 112, ry);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`: ${r[1]}`, marginX + 132, ry);
      }
    }

    const bottomY = topY + rowCount * rowStep + 3;
    pdf.setLineWidth(0.32);
    pdf.line(marginX, bottomY, marginX + boxW, bottomY);
    y = bottomY + 2.8;
  };

  const startNewPageInsideFrame = () => {
    closeCurrentFrame();
    pdf.addPage();
    drawContinuationHeader();
    openFrameAtCurrentY();
  };

  const ensureRoom = (neededMm: number) => {
    if (y + neededMm > pageBottomLimit) {
      startNewPageInsideFrame();
    }
  };

  const startSectionDivider = (minHeaderAndFirstLineMm = 14) => {
    if (y + minHeaderAndFirstLineMm > pageBottomLimit) {
      startNewPageInsideFrame();
    } else if (!isFirstSectionOnPage) {
      pdf.setDrawColor(30, 30, 30);
      pdf.setLineWidth(0.28);
      pdf.line(marginX, y, marginX + boxW, y);
    }
    isFirstSectionOnPage = false;
    y += 4.2;
  };

  const drawSectionLabel = (label: string) => {
    setBlackInk();
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.4);
    pdf.text(label, textX, y);
    y += 4.2;
  };

  const drawParagraph = (text: string, fontSize = 8.4, bold = false, indent = 0) => {
    if (!text.trim()) return;
    setBlackInk();
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.setFontSize(fontSize);
    const wrapped = pdf.splitTextToSize(text.trim(), textMaxW - indent) as string[];
    for (const line of wrapped) {
      ensureRoom(4.5);
      pdf.text(line, textX + indent, y);
      y += 3.9;
    }
  };

  const drawLabeledLine = (label: string, value: string, fontSize = 8.4) => {
    if (!value.trim()) return;
    setBlackInk();
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(fontSize);
    const prefix = `${label}: `;
    const fullLine = `${prefix}${value.trim()}`;
    const wrapped = pdf.splitTextToSize(fullLine, textMaxW) as string[];
    wrapped.forEach((line, idx) => {
      ensureRoom(4.5);
      if (idx === 0 && line.startsWith(prefix)) {
        pdf.setFont('helvetica', 'bold');
        pdf.text(prefix, textX, y);
        const w = pdf.getTextWidth(prefix);
        pdf.setFont('helvetica', 'normal');
        pdf.text(line.slice(prefix.length), textX + w, y);
      } else {
        pdf.setFont('helvetica', 'normal');
        pdf.text(line, textX, y);
      }
      y += 3.9;
    });
  };

  const drawPlainLines = (lines: string[], fontSize = 8.3) => {
    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0 && colonIdx <= 34 && !line.startsWith('http')) {
        const keyPart = line.slice(0, colonIdx).trim();
        const valPart = line.slice(colonIdx + 1).trim();
        if (valPart && !/^\d{1,2}\/\d{1,2}/.test(keyPart)) {
          drawLabeledLine(keyPart, valPart, fontSize);
          continue;
        }
      }
      drawParagraph(line, fontSize);
    }
  };

  const drawMonochromeTable = (
    headers: string[],
    colWidths: number[],
    rows: string[][]
  ) => {
    const tableX = textX;
    const tableW = colWidths.reduce((a, b) => a + b, 0);
    const rowLineH = 3.5;

    const drawHeaderRow = () => {
      ensureRoom(11);
      pdf.setFillColor(244, 244, 244);
      pdf.setDrawColor(40, 40, 40);
      pdf.setLineWidth(0.24);
      pdf.rect(tableX, y - 3.2, tableW, 5.6, 'FD');

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.6);
      pdf.setTextColor(15, 15, 15);
      let cx = tableX;
      headers.forEach((h, i) => {
        if (i > 0) {
          pdf.line(cx, y - 3.2, cx, y + 2.4);
        }
        pdf.text(h, cx + 1.4, y + 0.5);
        cx += colWidths[i];
      });
      y += 2.4;
    };

    drawHeaderRow();

    for (const row of rows) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.7);
      const cellLines = row.map((cell, i) =>
        pdf.splitTextToSize(cell || '—', Math.max(6, colWidths[i] - 2.6)) as string[]
      );
      const maxLines = Math.max(1, ...cellLines.map((l) => l.length));
      const rowH = maxLines * rowLineH + 2.2;

      if (y + rowH > pageBottomLimit) {
        startNewPageInsideFrame();
        y += 4;
        drawHeaderRow();
      }

      pdf.setDrawColor(60, 60, 60);
      pdf.setLineWidth(0.2);
      pdf.rect(tableX, y, tableW, rowH);

      let cx = tableX;
      cellLines.forEach((lines, i) => {
        if (i > 0) {
          pdf.line(cx, y, cx, y + rowH);
        }
        pdf.setFont('helvetica', i === 1 ? 'bold' : 'normal');
        pdf.setFontSize(7.7);
        pdf.setTextColor(15, 15, 15);
        lines.forEach((ln, li) => {
          pdf.text(ln, cx + 1.4, y + 3.4 + li * rowLineH);
        });
        cx += colWidths[i];
      });
      y += rowH;
    }
    y += 2.4;
  };

  // --- PAGE 1 HEADER ---
  if (usePreprinted) {
    // Clean 36mm blank space for pre-printed hospital stationery
    y = 36;
  } else {
    setBlackInk();
    y = 13;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.text(model.hospitalName.toUpperCase(), pageW / 2, y, { align: 'center' });
    y += 4.6;

    if (model.departmentTitle) {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8.8);
      pdf.text(model.departmentTitle, pageW / 2, y, { align: 'center' });
      y += 4.1;
    }

    const docLine = [
      model.doctorName,
      model.doctorDegrees,
      model.doctorRegNo ? `Reg: ${model.doctorRegNo}` : '',
    ]
      .filter(Boolean)
      .join('  |  ');
    if (docLine) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.4);
      pdf.text(docLine, pageW / 2, y, { align: 'center' });
      y += 4.2;
    }

    pdf.setLineWidth(0.4);
    pdf.line(marginX, y, marginX + boxW, y);
    y += 5.4;
  }

  // Title: DISCHARGE SUMMARY
  setBlackInk();
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.text('DISCHARGE SUMMARY', pageW / 2, y, { align: 'center' });
  y += 3.4;

  // --- PAGE 1 PATIENT DEMOGRAPHICS BAND (Monochrome 2-column colon-aligned) ---
  pdf.setDrawColor(30, 30, 30);
  pdf.setLineWidth(0.32);
  const demoTopY = y;
  pdf.line(marginX, demoTopY, marginX + boxW, demoTopY);

  const leftRows: Array<[string, string, boolean?]> = [];
  if (model.uhid) {
    leftRows.push(['UHID', model.uhid]);
  }
  leftRows.push(
    ['Name', model.fullPatientName, true],
    ['Age / Sex', model.ageSex],
    ['Consultant', model.consultantName]
  );

  const rightRows: Array<[string, string]> = [];
  if (model.ipdNo) {
    rightRows.push(['IP NO', model.ipdNo]);
  }
  rightRows.push(
    ['Bed No', model.wardOrBed],
    ['Date of Admission', model.admissionDate]
  );
  if (model.surgeryDate) {
    rightRows.push(['Date of Surgery', model.surgeryDate]);
  }
  rightRows.push(['Date of Discharge', model.dischargeDate]);

  const demoRowCount = Math.max(leftRows.length, rightRows.length);
  const demoRowH = 4.3;
  let dy = demoTopY + 4.4;
  for (let i = 0; i < demoRowCount; i++) {
    const lr = leftRows[i];
    const rr = rightRows[i];
    if (lr) {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8.2);
      pdf.text(lr[0], marginX + 2.2, dy);
      pdf.setFont('helvetica', lr[2] ? 'bold' : 'normal');
      pdf.text(`: ${lr[1]}`, marginX + 24, dy);
    }
    if (rr) {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8.2);
      pdf.text(rr[0], marginX + 104, dy);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`: ${rr[1]}`, marginX + 135, dy);
    }
    dy += demoRowH;
  }

  const demoBottomY = demoTopY + demoRowCount * demoRowH + 2.2;
  pdf.line(marginX, demoBottomY, marginX + boxW, demoBottomY);
  y = demoBottomY + 2.8;

  // --- START CONTINUOUS BORDERED CLINICAL BODY FRAME ---
  openFrameAtCurrentY();

  // 1. DIAGNOSIS
  if (model.diagnosis) {
    startSectionDivider(12);
    drawSectionLabel('DIAGNOSIS :');
    drawParagraph(model.diagnosis, 8.6, true);
    y += 1.4;
  }

  // 2. PRESENTING COMPLAINTS & HISTORY
  if (model.presentingHistoryLines.length > 0) {
    startSectionDivider(14);
    drawSectionLabel('PRESENTING COMPLAINTS & HISTORY :');
    drawPlainLines(model.presentingHistoryLines);
    y += 1.4;
  }

  // 3. EXAMINATION ON ADMISSION
  if (model.examinationLines.length > 0) {
    startSectionDivider(14);
    drawSectionLabel('EXAMINATION ON ADMISSION :');
    drawPlainLines(model.examinationLines);
    y += 1.4;
  }

  // 4. COURSE IN HOSPITAL
  if (model.courseInHospital) {
    startSectionDivider(14);
    drawSectionLabel('COURSE IN HOSPITAL :');
    drawParagraph(model.courseInHospital, 8.4);
    y += 1.4;
  }

  // 5. SURGERIES / PROCEDURE PERFORMED (Chronologically)
  if (model.surgeries.length > 0 || model.fallbackProcedureLines.length > 0) {
    startSectionDivider(18);
    drawSectionLabel('SURGERIES / PROCEDURE PERFORMED (Chronologically) :');
    if (model.surgeries.length > 0) {
      model.surgeries.forEach((surg, idx) => {
        if (idx > 0) {
          y += 1.6;
          ensureRoom(12);
        }
        if (surg.surgeryDate) {
          drawLabeledLine('SURGERY DATE', surg.surgeryDate, 8.3);
        }
        drawLabeledLine('NAME OF THE SURGERY / PROCEDURE', surg.procedureName, 8.3);
        if (surg.performedBy) {
          drawLabeledLine('PERFORMED BY', surg.performedBy, 8.3);
        }
        if (surg.detailsLines.length > 0) {
          ensureRoom(8);
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(8.2);
          pdf.text('DETAILS OF SURGERY / PROCEDURE AND FINDINGS :', textX, y);
          y += 4;
          drawPlainLines(surg.detailsLines, 8.2);
        }
      });
    } else {
      drawPlainLines(model.fallbackProcedureLines, 8.3);
    }
    y += 1.4;
  }

  // 6. ANAESTHESIA DETAILS
  if (model.anaesthesia) {
    startSectionDivider(14);
    drawSectionLabel('ANAESTHESIA DETAILS :');
    if (model.anaesthesia.typeOfAnaesthesia) {
      drawLabeledLine('TYPE OF ANAESTHESIA', model.anaesthesia.typeOfAnaesthesia, 8.3);
    }
    if (model.anaesthesia.anaesthetistName) {
      drawLabeledLine('NAME OF ANAESTHETIST', model.anaesthesia.anaesthetistName, 8.3);
    }
    if (model.anaesthesia.criticalEvents) {
      drawLabeledLine('CRITICAL EVENTS IN OT IN DETAILS', model.anaesthesia.criticalEvents, 8.3);
    }
    y += 1.4;
  }

  // 7. SIGNIFICANT MEDICATION GIVEN DURING HOSPITALIZATION
  if (model.wardMedications.length > 0) {
    startSectionDivider(20);
    drawSectionLabel('SIGNIFICANT MEDICATION GIVEN DURING HOSPITALIZATION :');
    drawMonochromeTable(
      ['#', 'Medicine & Strength', 'Route', 'Frequency', 'Days Given', 'Remarks'],
      [8, 52, 20, 26, 34, 37.6],
      model.wardMedications.map((t, idx) => [
        String(idx + 1),
        `${t.medicine}${t.dosage ? ` (${t.dosage})` : ''}`,
        t.route || '—',
        t.frequency || '—',
        t.durationOrDates || '—',
        t.notes || '—',
      ])
    );
  }

  // 8. DETAILS OF IMPLANTS / STENTS / CATHETERS
  if (model.implantsAndStentsLines.length > 0) {
    startSectionDivider(13);
    drawSectionLabel('DETAILS OF IMPLANTS / STENTS / CATHETERS :');
    drawPlainLines(model.implantsAndStentsLines, 8.3);
    y += 1.4;
  }

  // 9. SIGNIFICANT LABORATORY INVESTIGATIONS (Separate Row 1)
  if (model.labInvestigationLines.length > 0) {
    startSectionDivider(13);
    drawSectionLabel('SIGNIFICANT LABORATORY INVESTIGATIONS :');
    drawPlainLines(model.labInvestigationLines, 8.1);
    y += 1.4;
  }

  // 10. SIGNIFICANT RADIOLOGY INVESTIGATIONS (Separate Row 2)
  if (model.radiologyInvestigationLines.length > 0) {
    startSectionDivider(13);
    drawSectionLabel('SIGNIFICANT RADIOLOGY INVESTIGATIONS :');
    drawPlainLines(model.radiologyInvestigationLines, 8.1);
    y += 1.4;
  }

  // 11. CONDITION AT DISCHARGE IN DETAIL
  if (model.dischargeVitals.length > 0 || model.conditionAtDischarge) {
    startSectionDivider(16);
    drawSectionLabel('CONDITION AT DISCHARGE IN DETAIL :');
    if (model.dischargeVitals.length > 0) {
      // Compact 2-column colon-aligned vitals matching hospital card
      for (let i = 0; i < model.dischargeVitals.length; i += 2) {
        ensureRoom(4.5);
        const left = model.dischargeVitals[i];
        const right = model.dischargeVitals[i + 1];
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8.3);
        pdf.text(left.label, textX, y);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`: ${left.value}`, textX + 14, y);
        if (right) {
          pdf.setFont('helvetica', 'bold');
          pdf.text(right.label, textX + 74, y);
          pdf.setFont('helvetica', 'normal');
          pdf.text(`: ${right.value}`, textX + 88, y);
        }
        y += 4.1;
      }
      if (model.conditionAtDischarge) {
        y += 0.8;
      }
    }
    if (model.conditionAtDischarge) {
      drawParagraph(model.conditionAtDischarge, 8.3);
    }
    y += 1.4;
  }

  // 12. DISCHARGE MEDICATIONS (Rx)
  if (model.dischargeMedications.length > 0) {
    startSectionDivider(20);
    drawSectionLabel('DISCHARGE MEDICATIONS (Rx) :');
    drawMonochromeTable(
      ['#', 'Medicine & Strength', 'Frequency', 'Timing', 'Duration', 'Instructions'],
      [8, 52, 24, 28, 22, 43.6],
      model.dischargeMedications.map((rx, idx) => [
        String(idx + 1),
        `${rx.medicine || rx.drugName}${rx.dosage ? ` (${rx.dosage})` : ''}`,
        rx.frequency || '—',
        rx.when || rx.timing || '—',
        rx.duration || '—',
        rx.notes || rx.instructions || '—',
      ])
    );
  }

  // 13. DISCHARGE ADVICE (DIET, WOUND & ACTIVITY)
  if (model.dischargeAdviceLines.length > 0) {
    startSectionDivider(13);
    drawSectionLabel('DISCHARGE ADVICE (DIET, WOUND & ACTIVITY) :');
    drawPlainLines(model.dischargeAdviceLines, 8.3);
    y += 1.4;
  }

  // 14. FOLLOW-UP PLAN
  if (model.followUpLines.length > 0) {
    startSectionDivider(13);
    drawSectionLabel('FOLLOW-UP PLAN :');
    drawPlainLines(model.followUpLines, 8.3);
    y += 1.4;
  }

  // 15. URGENT RETURN WARNINGS (RED FLAGS)
  if (model.redFlagLines.length > 0) {
    startSectionDivider(13);
    drawSectionLabel('URGENT RETURN WARNINGS (RED FLAGS) :');
    drawPlainLines(model.redFlagLines, 8.3);
    y += 1.4;
  }

  // Close the continuous bordered clinical frame
  closeCurrentFrame();

  // --- SIGNATURE BLOCK ---
  if (y + 22 > pageBottomLimit) {
    pdf.addPage();
    drawContinuationHeader();
  }
  const sigTopY = y + 12;
  pdf.setDrawColor(40, 40, 40);
  pdf.setLineWidth(0.3);
  pdf.line(pageW - 76, sigTopY, pageW - marginX, sigTopY);

  setBlackInk();
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.8);
  pdf.text(model.doctorName, pageW - marginX, sigTopY + 4.3, { align: 'right' });

  let sigInfoY = sigTopY + 8.1;
  if (model.doctorDegrees) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.6);
    pdf.text(model.doctorDegrees, pageW - marginX, sigInfoY, { align: 'right' });
    sigInfoY += 3.5;
  }
  if (model.doctorRegNo) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.6);
    pdf.text(`Reg. No: ${model.doctorRegNo}`, pageW - marginX, sigInfoY, { align: 'right' });
  }

  // --- PAGE FOOTERS ON EVERY PAGE (Prepared By | Print Date & Time | Page X of Y) ---
  const totalPages = pdf.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    pdf.setPage(p);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(40, 40, 40);
    const footerY = pageH - 9;
    pdf.text(`Prepared By: ${model.preparedBy}`, marginX, footerY);
    pdf.text(`Print Date & Time: ${model.printTimestamp}`, pageW / 2, footerY, {
      align: 'center',
    });
    pdf.text(`Page ${p} of ${totalPages}`, pageW - marginX, footerY, { align: 'right' });
  }

  const fileName = `Discharge_Summary_${safeFileSlug(patient.patientName)}_${ds.dischargeDate || 'summary'}.pdf`;
  pdf.save(fileName);
}

/**
 * Exports a single-sheet Ward Census / Rounds Handover PDF of all currently admitted IPD patients.
 */
export function exportIpdWardRoundsPdf(
  patients: IpdPatientRecord[],
  doctor?: DoctorAccount | null
): void {
  const admitted = patients.filter((p) => p.status === 'admitted');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const today = new Date().toISOString().split('T')[0];
  let y = drawHospitalHeader(
    pdf,
    `IPD Ward Rounds Census — ${formatDisplayDate(today)} (${admitted.length} Admitted)`,
    doctor
  );

  if (admitted.length === 0) {
    drawWrappedBlock(pdf, 'No currently admitted IPD patients.', y);
  } else {
    admitted.forEach((p, idx) => {
      y = ensurePageSpace(pdf, y, 26);
      const pod = formatPodLabel(p.surgeryDate);
      const latestNote = [...p.dailyNotes].sort((a, b) =>
        `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)
      )[0];
      const activeMeds = p.medications.filter((m) => m.status === 'active');
      const proto = p.surgicalProtocol
        ? getSurgicalProtocolById(p.surgicalProtocol.protocolId)
        : undefined;
      const stats = p.surgicalProtocol
        ? getProtocolCompletionStats(
            p.surgicalProtocol.protocolId,
            p.surgicalProtocol.checkedItemIds
          )
        : null;

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9.5);
      pdf.setTextColor(15, 23, 42);
      pdf.text(
        `${idx + 1}. ${p.wardOrBed || 'Bed —'}  |  ${p.patientName} (${p.age || '—'}/${p.gender || '—'})  ${pod ? `· ${pod}` : ''}`,
        14,
        y
      );
      y += 4.5;

      y = drawWrappedBlock(
        pdf,
        `Dx: ${p.admittingDiagnosis || '—'}${p.otNotes?.procedureName ? `  |  OT: ${p.otNotes.procedureName}` : ''}${proto && stats ? `  |  Protocol: ${proto.shortName} (${stats.completed}/${stats.total})` : ''}`,
        y,
        8.3,
        17
      );
      if (latestNote) {
        const vitalsStr = [
          latestNote.vitals?.bp ? `BP ${latestNote.vitals.bp}` : '',
          latestNote.vitals?.pulse ? `PR ${latestNote.vitals.pulse}` : '',
          latestNote.vitals?.temp ? `T ${latestNote.vitals.temp}` : '',
          latestNote.vitals?.urineOutputMl ? `UO ${latestNote.vitals.urineOutputMl}` : '',
          latestNote.vitals?.drainOutputMl ? `Drain ${latestNote.vitals.drainOutputMl}` : '',
        ]
          .filter(Boolean)
          .join(' · ');
        y = drawWrappedBlock(
          pdf,
          `Latest (${formatDisplayDate(latestNote.date)}): ${vitalsStr ? `[${vitalsStr}] ` : ''}${latestNote.assessmentPlan || latestNote.subjective || '—'}`,
          y,
          8.1,
          17
        );
      }
      if (activeMeds.length > 0) {
        y = drawWrappedBlock(
          pdf,
          `Active Meds (${activeMeds.length}): ${activeMeds.map((m) => `${m.medicine} ${m.dosage}`.trim()).join(', ')}`,
          y,
          8.0,
          17
        );
      }
      y += 2;
    });
  }

  pdf.save(`IPD_Ward_Rounds_${today}.pdf`);
}

/**
 * Exports a single day's IPD Daily Clinical Progress Note & Day Medication Chart to A4 PDF.
 */
export function exportIpdDailyNotePdf(
  patient: IpdPatientRecord,
  dateKey: string,
  dayNotes: IpdDailyNote[],
  _medsForDate: IpdMedicationOrder[],
  doctor?: DoctorAccount | null
): void {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const isDischargeOnly =
    dayNotes.length > 0 && dayNotes.every((dn) => isDischargeProtocolDailyNote(dn));
  const podLabel = isDischargeOnly
    ? 'Discharge'
    : formatDailyProgressPodLabel(
        dayNotes.find((dn) => dn.podLabel)?.podLabel,
        patient.surgeryDate,
        dateKey
      );
  const title = isDischargeOnly
    ? `Discharge on ${formatDisplayDate(dateKey)}`
    : `IPD Daily Clinical Progress Note — ${formatDisplayDate(dateKey)}${podLabel ? ` (${podLabel})` : ''}`;

  let y = drawHospitalHeader(pdf, title, doctor);
  y = drawPatientBanner(pdf, patient, y);

  if (patient.admittingDiagnosis) {
    y = drawWrappedBlock(pdf, `Diagnosis: ${patient.admittingDiagnosis}`, y, 9, 14);
  }

  const resolvedMeds = getResolvedDailyMedicationsForDate(patient, dateKey);
  const consolidated = consolidateDailyNotesForDate(
    dayNotes,
    !isDischargeOnly && resolvedMeds.items.length > 0
  );

  y = drawSectionHeading(
    pdf,
    isDischargeOnly
      ? `Discharge on ${formatDisplayDate(dateKey)}`
      : `Clinical Progress${podLabel ? ` — ${podLabel}` : ''}`,
    y
  );

  if (
    !consolidated.combinedSubjective &&
    !consolidated.combinedObjective &&
    !consolidated.combinedAssessmentPlan &&
    consolidated.vitalsEntries.length === 0
  ) {
    y = drawWrappedBlock(pdf, 'No clinical progress entries recorded for this date.', y);
  } else {
    if (consolidated.vitalsEntries.length > 0) {
      for (const ve of consolidated.vitalsEntries) {
        y = drawWrappedBlock(
          pdf,
          `Vitals & I/O${ve.time ? ` (${ve.time})` : ''}: ${ve.items.join(' · ')}`,
          y,
          8.3,
          16
        );
      }
    }

    if (consolidated.combinedSubjective) {
      y = drawWrappedBlock(
        pdf,
        `CLINICAL CONTEXT:\n${formatGroupedClinicalNotePlainText(consolidated.combinedSubjective, podLabel)}`,
        y,
        8.5,
        16
      );
    }
    if (consolidated.combinedObjective) {
      y = drawWrappedBlock(
        pdf,
        `EXAMINATION & MONITORING:\n${formatGroupedClinicalNotePlainText(consolidated.combinedObjective, podLabel)}`,
        y,
        8.5,
        16
      );
    }
    if (consolidated.combinedAssessmentPlan) {
      y = drawWrappedBlock(
        pdf,
        `INSTRUCTIONS & PLAN:\n${formatGroupedClinicalNotePlainText(consolidated.combinedAssessmentPlan, podLabel)}`,
        y,
        8.5,
        16
      );
    }
    y += 2;
  }
  if (!isDischargeOnly) {
    y = drawSectionHeading(
      pdf,
      `Medication List for ${formatDisplayDate(dateKey)} (${resolvedMeds.items.length})`,
      y
    );

    if (resolvedMeds.items.length === 0) {
      y = drawWrappedBlock(pdf, 'No active inpatient medications charted for this date.', y);
    } else {
      y = drawPdfTable(
        pdf,
        ['#', 'Medicine & Dose', 'Route / Freq', 'Med Day', 'Status', 'Notes'],
        [8, 52, 42, 18, 24, 38],
        resolvedMeds.items.map((med, idx) => [
          String(idx + 1),
          `${med.medicine}${med.dosage ? ` (${med.dosage})` : ''}`,
          [med.route || 'PO', med.frequency, med.when].filter(Boolean).join(' · '),
          `Day ${med.dayNumber}`,
          med.status === 'confirmed'
            ? 'Confirmed'
            : med.status === 'held'
            ? 'Held'
            : 'Charted',
          med.notes || '—',
        ]),
        y
      );
    }
  }

  // Signature block
  const pageW = pdf.internal.pageSize.getWidth();
  y = ensurePageSpace(pdf, y + 8, 22);
  pdf.setDrawColor(148, 163, 184);
  pdf.line(pageW - 76, y + 12, pageW - 16, y + 12);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.setTextColor(15, 23, 42);
  const creds = getActiveDoctorPrintCredentials(doctor);
  pdf.text(creds.doctorName || patient.attendingConsultant || 'Consultant Urologist', pageW - 46, y + 16.5, {
    align: 'center',
  });
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(71, 85, 105);
  pdf.text(`Date: ${formatDisplayDate(dateKey)}`, 16, y + 16.5);

  const fileName = isDischargeOnly
    ? `IPD_Discharge_Notes_${safeFileSlug(patient.patientName)}_${dateKey}.pdf`
    : `IPD_Daily_Note_${safeFileSlug(patient.patientName)}_${dateKey}.pdf`;
  pdf.save(fileName);
}

/**
 * Exports a standalone single-day IPD Daily Medication Chart to A4 PDF.
 */
export function exportIpdDailyMedicationPdf(
  patient: IpdPatientRecord,
  dateKey: string,
  items: ResolvedDailyMedicationRow[],
  doctor?: DoctorAccount | null
): void {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const podLabel = formatDailyProgressPodLabel(undefined, patient.surgeryDate, dateKey);
  const title = `IPD Daily Medication Chart — ${formatDisplayDate(dateKey)}${podLabel ? ` (${podLabel})` : ''}`;

  let y = drawHospitalHeader(pdf, title, doctor);
  y = drawPatientBanner(pdf, patient, y);

  if (patient.admittingDiagnosis) {
    y = drawWrappedBlock(pdf, `Diagnosis: ${patient.admittingDiagnosis}`, y, 9, 14);
  }
  if (patient.allergies) {
    y = drawWrappedBlock(pdf, `Drug Allergies: ${patient.allergies}`, y, 8.8, 14);
  }

  y = drawSectionHeading(
    pdf,
    `Medication List for ${formatDisplayDate(dateKey)} (${items.length})`,
    y
  );

  if (items.length === 0) {
    y = drawWrappedBlock(pdf, 'No inpatient medications charted or confirmed for this date.', y);
  } else {
    y = drawPdfTable(
      pdf,
      ['#', 'Medicine & Dose', 'Route / Freq', 'Med Day', 'Status', 'Notes', 'Sign'],
      [8, 46, 38, 16, 20, 34, 20],
      items.map((med, idx) => [
        String(idx + 1),
        `${med.medicine}${med.dosage ? ` (${med.dosage})` : ''}`,
        [med.route || 'PO', med.frequency, med.when].filter(Boolean).join(' · '),
        `Day ${med.dayNumber}`,
        med.status === 'confirmed'
          ? 'Confirmed'
          : med.status === 'held'
          ? 'Held'
          : 'Charted',
        med.notes || '—',
        '',
      ]),
      y
    );
  }

  const pageW = pdf.internal.pageSize.getWidth();
  y = ensurePageSpace(pdf, y + 8, 22);
  pdf.setDrawColor(148, 163, 184);
  pdf.line(pageW - 76, y + 12, pageW - 16, y + 12);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.setTextColor(15, 23, 42);
  const creds = getActiveDoctorPrintCredentials(doctor);
  pdf.text(
    creds.doctorName || patient.attendingConsultant || 'Consultant Urologist',
    pageW - 46,
    y + 16.5,
    { align: 'center' }
  );
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(71, 85, 105);
  pdf.text(`Date: ${formatDisplayDate(dateKey)}`, 16, y + 16.5);

  const fileName = `IPD_Medication_Chart_${safeFileSlug(patient.patientName)}_${dateKey}.pdf`;
  pdf.save(fileName);
}
