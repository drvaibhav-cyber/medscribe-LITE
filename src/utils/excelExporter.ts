import * as XLSX from 'xlsx';
import { Consultation } from '../types/opd';
import {
  cleanExplicitOpdNo,
  formatPatientNameWithSalutation,
} from './investigationUtils';

/**
 * Neutralize spreadsheet formula execution (e.g. =CMD, @SUM, +cmd, -cmd) in exported cells
 * while preserving normal clinical text, numbers, and '-' / '--' empty markers.
 */
function sanitizeSpreadsheetCell(val: any): any {
  if (typeof val !== 'string') return val;
  if (/^[\t\r]*[=@]/.test(val) || /^[\t\r]*[+-][a-zA-Z(]/.test(val)) {
    return `'${val}`;
  }
  return val;
}

/**
 * Format date string (YYYY-MM-DD) into readable formats
 */
export function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return 'Undated';
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    if (!y || !m || !d) return dateStr;
    const dateObj = new Date(y, m - 1, d);
    return dateObj.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

/**
 * Extract Month Label (e.g. "October 2024") and Month Key ("2024-10") from a date string
 */
export function getMonthInfo(dateStr: string): { monthKey: string; monthLabel: string; year: number; monthIndex: number } {
  if (!dateStr || !dateStr.includes('-')) {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    return { monthKey, monthLabel, year: now.getFullYear(), monthIndex: now.getMonth() };
  }

  const [y, m] = dateStr.split('-').map(Number);
  const year = y || new Date().getFullYear();
  const monthIndex = (m || 1) - 1;
  const dateObj = new Date(year, monthIndex, 1);
  const monthLabel = dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const monthKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;

  return { monthKey, monthLabel, year, monthIndex };
}

/**
 * Formats vitals object into a compact one-liner string for Excel
 */
export function formatVitalsSummary(v: Consultation['vitals']): string {
  if (!v) return '-';
  const parts: string[] = [];
  if (v.bp) parts.push(`BP: ${v.bp}`);
  if (v.pulse) parts.push(`PR: ${v.pulse} bpm`);
  if (v.temp) parts.push(`Temp: ${v.temp}`);
  if (v.spo2) parts.push(`SpO2: ${v.spo2}%`);
  if (v.weight) parts.push(`Wt: ${v.weight} kg`);
  if (v.height) parts.push(`Ht: ${v.height} cm`);
  if (v.bmi) parts.push(`BMI: ${v.bmi}`);
  if (v.waist) parts.push(`Waist: ${v.waist} cm`);
  if (v.hip) parts.push(`Hip: ${v.hip} cm`);
  return parts.length > 0 ? parts.join(' | ') : '-';
}

/**
 * Formats prescriptions array into numbered lines matching the EMR table columns:
 * Medicine | Dosage | When | Frequency | Duration | Notes
 */
export function formatPrescriptionsSummary(c: Consultation): string {
  if (c.prescriptionsSummaryText && c.prescriptionsSummaryText.trim()) {
    return c.prescriptionsSummaryText;
  }
  if (!c.prescriptions || c.prescriptions.length === 0) {
    return '-';
  }
  return c.prescriptions
    .map((rx, idx) => {
      const name = rx.medicine || rx.drugName || 'Medicine';
      const dosage = rx.dosage || rx.dosageStrength || '';
      const when = rx.when || rx.timing || '';
      const freq = rx.frequency || '';
      const dur = rx.duration || '';
      const notes = rx.notes || rx.instructions || '';

      const parts = [
        `${idx + 1}.`,
        name,
        dosage ? `(${dosage})` : '',
        freq ? `- ${freq}` : '',
        when ? `[${when}]` : '',
        dur ? `x ${dur}` : '',
        notes ? `{${notes}}` : '',
      ].filter(Boolean);

      return parts.join(' ');
    })
    .join('\n');
}

/**
 * Format IPSS (International Prostatic Symptoms Score) summary
 */
export function formatIpssSummary(c: Consultation): string {
  const ip = c.ipss;
  if (!ip) return '-';
  const items: string[] = [];
  if (ip.frequency) items.push(`[F] Freq: ${ip.frequency}`);
  if (ip.urgency) items.push(`[U] Urgency: ${ip.urgency}`);
  if (ip.nocturia) items.push(`[N] Nocturia: ${ip.nocturia}`);
  const pf = ip.poorFlow || ip.poorStream;
  if (pf) items.push(`[P] Poor Flow: ${pf}`);
  if (ip.intermittency) items.push(`[I] Intermittency: ${ip.intermittency}`);
  if (ip.straining) items.push(`[S] Straining: ${ip.straining}`);
  if (ip.incompleteEvacuation) items.push(`[S] Incomplete: ${ip.incompleteEvacuation}`);
  if (ip.qualityOfLife) items.push(`QoL: ${ip.qualityOfLife}`);
  return items.length > 0 ? items.join(' | ') : '-';
}

/**
 * Format Clinical History Checklist (Burning, Fever, Hematuria, etc.)
 */
export function formatHistoryChecklistSummary(c: Consultation): string {
  const h = c.historyChecklist;
  if (!h) return c.history || '-';
  const items: string[] = [];
  if (h.burning) items.push(`Burning: ${h.burning}`);
  if (h.fever) items.push(`Fever: ${h.fever}`);
  if (h.hematuria) items.push(`Hematuria: ${h.hematuria}`);
  if (h.previousRenalCalculi) items.push(`Prev Calculi: ${h.previousRenalCalculi}`);
  if (h.previousSurgery) items.push(`Prev Surgery: ${h.previousSurgery}`);
  if (h.constipation) items.push(`Constipation: ${h.constipation}`);
  return items.length > 0 ? items.join(' | ') : (c.history || '-');
}

/**
 * Group consultations into Months, and inside each Month group by Date
 */
export function groupConsultationsByMonthAndDate(consultations: Consultation[]) {
  const monthMap = new Map<string, {
    monthKey: string;
    monthLabel: string;
    year: number;
    monthIndex: number;
    dateMap: Map<string, Consultation[]>;
  }>();

  consultations.forEach((item) => {
    const { monthKey, monthLabel, year, monthIndex } = getMonthInfo(item.date);
    if (!monthMap.has(monthKey)) {
      monthMap.set(monthKey, {
        monthKey,
        monthLabel,
        year,
        monthIndex,
        dateMap: new Map(),
      });
    }

    const monthGroup = monthMap.get(monthKey)!;
    const dateKey = item.date || 'Undated';
    if (!monthGroup.dateMap.has(dateKey)) {
      monthGroup.dateMap.set(dateKey, []);
    }
    monthGroup.dateMap.get(dateKey)!.push(item);
  });

  const sortedMonths = Array.from(monthMap.values()).sort((a, b) => b.monthKey.localeCompare(a.monthKey));

  return sortedMonths.map((m) => {
    const sortedDates = Array.from(m.dateMap.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, items]) => ({
        date,
        displayDate: formatDisplayDate(date),
        consultations: items.sort((a, b) => (a.time || '').localeCompare(b.time || '')),
      }));

    const totalConsultations = sortedDates.reduce((acc, curr) => acc + curr.consultations.length, 0);

    return {
      monthKey: m.monthKey,
      monthLabel: m.monthLabel,
      year: m.year,
      monthIndex: m.monthIndex,
      dates: sortedDates,
      totalConsultations,
    };
  });
}

/**
 * All EMR Headings matching the uploaded forms:
 * - Patient Demographics: Name, Phone, Gender, Age/DOB, Language, City, Address, PIN
 * - Vitals: BP, Pulse, Temp, Height, Weight, BMI, Waist, Hip, Waist/Hip, SPO2
 * - Complaints
 * - Case Sheet History: Burning, Fever, Hematuria, Previous renal calculi, Previous Surgery, Constipation
 * - IPSS: Frequency, Urgency, Nocturia, Poor Stream, Intermittency, Straining, Incomplete Evacuation, Hesitancy, 2nd Void, Post Void Dribble, Quality of Life
 * - Examination: Systemic Exam, Genital Exam, Per Rectal Exam (DRE)
 * - Past Medication & History
 * - Lab Tests and Imaging
 * - Diagnosis & Tests Requested (By When)
 * - Prescriptions (Rx)
 * - Diet and Exercise, Admission Advice, Assessment/Plan, Advice, Next Visit, Referred To
 */
export const EMR_EXCEL_COLUMNS = [
  'Sl. No',
  'OPD / UHID',
  'Date',
  'Time',
  'Patient Name',
  'Phone Number',
  'Gender',
  'Age / DOB',
  'Preferred Language',
  'City',
  'Address',
  'Pin',
  'BP (mmHg)',
  'Pulse (bpm)',
  'Temp (°F/°C)',
  'Height (cm)',
  'Weight (kg)',
  'BMI',
  'Waist (cm)',
  'Hip (cm)',
  'SPO2 (%)',
  'Complaints',
  'Burning (Urine)',
  'Fever',
  'Hematuria',
  'Previous Renal Calculi ?',
  'Previous Surgery ?',
  'Constipation ?',
  'IPSS [F] - Frequency',
  'IPSS [U] - Urgency',
  'IPSS [N] - Nocturia',
  'IPSS [P] - Poor Flow',
  'IPSS [I] - Intermittency',
  'IPSS [S] - Straining',
  'IPSS [S] - Sense of Incomplete Evacuation',
  'IPSS - Quality of Life Score',
  'Systemic Examination',
  'Genital Examination',
  'Per Rectal Exam',
  'Past Medication',
  'Additional History',
  'Lab Tests and Imaging',
  'Diagnosis',
  'Tests Requested',
  'By When (Tests)',
  // Prescriptions columns with distinct headings as shown in EMR form:
  // Medicine | Dosage | When | Frequency | Duration | Notes
  'Rx 1 - Medicine',
  'Rx 1 - Dosage',
  'Rx 1 - When',
  'Rx 1 - Frequency',
  'Rx 1 - Duration',
  'Rx 1 - Notes',
  'Rx 2 - Medicine',
  'Rx 2 - Dosage',
  'Rx 2 - When',
  'Rx 2 - Frequency',
  'Rx 2 - Duration',
  'Rx 2 - Notes',
  'Rx 3 - Medicine',
  'Rx 3 - Dosage',
  'Rx 3 - When',
  'Rx 3 - Frequency',
  'Rx 3 - Duration',
  'Rx 3 - Notes',
  'Rx 4 - Medicine',
  'Rx 4 - Dosage',
  'Rx 4 - When',
  'Rx 4 - Frequency',
  'Rx 4 - Duration',
  'Rx 4 - Notes',
  'Prescriptions (All Summary)',
  'Diet and Exercise',
  'Admission Advice',
  'Assessment / Plan',
  'Advice',
  'Next Visit',
  'Referred To (Doctor)',
  'Referred To (Speciality)',
  'Referred To (Contact)',
  'OT Date',
  'OT Hospital / Surgical Centre',
  'OT Procedure Done',
  'OT Anaesthesia & Position',
  'OT Intra-Op Findings',
  'OT Operative Steps',
  'OT Catheter / DJ Stent',
  'OT Post-Op Orders',
  'Treating Doctor',
];

/**
 * Build row array for a single consultation matching all EMR headings
 */
export function buildConsultationRow(c: Consultation, index: number): any[] {
  const v = c.vitals || {};
  const h = c.historyChecklist || {};
  const ip = c.ipss || {};
  const ref = c.referredTo || {};

  const nameWithSalutation = formatPatientNameWithSalutation(c.salutation, c.patientName) || '-';
  const ageDob = [c.age, c.dob ? `(DOB: ${c.dob})` : ''].filter(Boolean).join(' ') || '-';
  const complaints = c.complaints || c.chiefComplaints || '-';
  const testsReq = c.testsRequested || c.investigationsAdvised || '-';
  const advice = c.advice || c.adviceAndDiet || '-';
  const nextVisit = c.nextVisit || c.followUpDate || '-';
  const exam = c.examinationNotes || '-';

  return [
    index,
    cleanExplicitOpdNo(c.opdNo) || '-',
    c.date || '-',
    c.time || '-',
    nameWithSalutation,
    c.phoneNumber || c.contactNumber || '-',
    c.gender || '-',
    ageDob,
    c.preferredLanguage || 'English',
    c.city || '-',
    c.address || c.addressOrCity || '-',
    c.pin || '-',
    v.bp || '-',
    v.pulse || '-',
    v.temp || '-',
    v.height || '-',
    v.weight || '-',
    v.bmi || '-',
    v.waist || '-',
    v.hip || '-',
    v.spo2 ? `${v.spo2}%` : '-',
    complaints,
    h.burning || '-',
    h.fever || '-',
    h.hematuria || '-',
    h.previousRenalCalculi || '-',
    h.previousSurgery || '-',
    h.constipation || '-',
    ip.frequency || '-',
    ip.urgency || '-',
    ip.nocturia || '-',
    ip.poorFlow || ip.poorStream || '-',
    ip.intermittency || '-',
    ip.straining || '-',
    ip.incompleteEvacuation || '-',
    ip.qualityOfLife || '-',
    c.systemicExamination || exam,
    c.genitalExamination || '-',
    c.perRectalExam || '-',
    c.pastMedication || '-',
    c.additionalHistory || c.history || '-',
    c.labTestsAndImaging || '-',
    c.diagnosis || '-',
    testsReq,
    c.testsRequestedByWhen || '-',
    // Rx 1: Medicine | Dosage | When | Frequency | Duration | Notes
    c.prescriptions?.[0] ? (c.prescriptions[0].medicine || c.prescriptions[0].drugName || '-') : '-',
    c.prescriptions?.[0] ? (c.prescriptions[0].dosage || c.prescriptions[0].dosageStrength || '-') : '-',
    c.prescriptions?.[0] ? (c.prescriptions[0].when || c.prescriptions[0].timing || '-') : '-',
    c.prescriptions?.[0] ? (c.prescriptions[0].frequency || '-') : '-',
    c.prescriptions?.[0] ? (c.prescriptions[0].duration || '-') : '-',
    c.prescriptions?.[0] ? (c.prescriptions[0].notes || c.prescriptions[0].instructions || '-') : '-',
    // Rx 2: Medicine | Dosage | When | Frequency | Duration | Notes
    c.prescriptions?.[1] ? (c.prescriptions[1].medicine || c.prescriptions[1].drugName || '-') : '-',
    c.prescriptions?.[1] ? (c.prescriptions[1].dosage || c.prescriptions[1].dosageStrength || '-') : '-',
    c.prescriptions?.[1] ? (c.prescriptions[1].when || c.prescriptions[1].timing || '-') : '-',
    c.prescriptions?.[1] ? (c.prescriptions[1].frequency || '-') : '-',
    c.prescriptions?.[1] ? (c.prescriptions[1].duration || '-') : '-',
    c.prescriptions?.[1] ? (c.prescriptions[1].notes || c.prescriptions[1].instructions || '-') : '-',
    // Rx 3: Medicine | Dosage | When | Frequency | Duration | Notes
    c.prescriptions?.[2] ? (c.prescriptions[2].medicine || c.prescriptions[2].drugName || '-') : '-',
    c.prescriptions?.[2] ? (c.prescriptions[2].dosage || c.prescriptions[2].dosageStrength || '-') : '-',
    c.prescriptions?.[2] ? (c.prescriptions[2].when || c.prescriptions[2].timing || '-') : '-',
    c.prescriptions?.[2] ? (c.prescriptions[2].frequency || '-') : '-',
    c.prescriptions?.[2] ? (c.prescriptions[2].duration || '-') : '-',
    c.prescriptions?.[2] ? (c.prescriptions[2].notes || c.prescriptions[2].instructions || '-') : '-',
    // Rx 4: Medicine | Dosage | When | Frequency | Duration | Notes
    c.prescriptions?.[3] ? (c.prescriptions[3].medicine || c.prescriptions[3].drugName || '-') : '-',
    c.prescriptions?.[3] ? (c.prescriptions[3].dosage || c.prescriptions[3].dosageStrength || '-') : '-',
    c.prescriptions?.[3] ? (c.prescriptions[3].when || c.prescriptions[3].timing || '-') : '-',
    c.prescriptions?.[3] ? (c.prescriptions[3].frequency || '-') : '-',
    c.prescriptions?.[3] ? (c.prescriptions[3].duration || '-') : '-',
    c.prescriptions?.[3] ? (c.prescriptions[3].notes || c.prescriptions[3].instructions || '-') : '-',
    formatPrescriptionsSummary(c),
    c.dietAndExercise || '-',
    c.admissionAdvice || 'No',
    c.assessmentPlan || '-',
    advice,
    nextVisit,
    ref.doctorName || '-',
    ref.speciality || '-',
    [ref.phoneNo, ref.email].filter(Boolean).join(' / ') || '-',
    c.otNotes?.surgeryDate || '-',
    c.otNotes?.hospitalName || '-',
    c.otNotes?.procedureName || '-',
    [c.otNotes?.anaesthesiaType, c.otNotes?.patientPosition].filter(Boolean).join(', ') || '-',
    c.otNotes?.operativeFindings || '-',
    c.otNotes?.operativeSteps || '-',
    c.otNotes?.catheterOrStentDetails || '-',
    c.otNotes?.postOpOrders || '-',
    c.doctorName || '-',
  ].map(sanitizeSpreadsheetCell);
}

/**
 * Generates and downloads a multi-sheet Excel (.xlsx) file
 * Each month is a distinct Sheet, with daily consultations sorted under Date headings!
 */
export function buildOpdWorkbook(consultations: Consultation[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const groupedMonths = groupConsultationsByMonthAndDate(consultations);

  if (groupedMonths.length === 0) {
    const emptyWs = XLSX.utils.aoa_to_sheet([
      ['EMR CONSULTATION REGISTER'],
      ['No consultations recorded yet.'],
    ]);
    XLSX.utils.book_append_sheet(wb, emptyWs, 'Empty Register');
    return wb;
  }

  // 1. Create a Master Summary / Index Sheet first
  const summaryRows: any[][] = [
    ['EMR OPD CLINICAL REGISTER - MASTER SUMMARY'],
    [`Generated on: ${new Date().toLocaleString()}`, `Total Records: ${consultations.length}`],
    [],
    ['Month Sheet Name', 'Year-Month', 'Consultation Days', 'Total Patients Consulted', 'Top Diagnoses'],
  ];

  groupedMonths.forEach((m) => {
    const diagnoses = m.dates
      .flatMap((d) => d.consultations.map((c) => c.diagnosis).filter(Boolean))
      .slice(0, 3)
      .join(', ');

    summaryRows.push([
      m.monthLabel,
      m.monthKey,
      m.dates.length,
      m.totalConsultations,
      diagnoses || 'General Consultation',
    ]);
  });

  const summaryWs = XLSX.utils.aoa_to_sheet(summaryRows);
  summaryWs['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 18 }, { wch: 24 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Register Summary');

  // 2. Create a separate worksheet for EACH MONTH with Daily Consultations under Date headings!
  groupedMonths.forEach((m) => {
    const sheetName = m.monthLabel.replace(/[:\\/?*[\]]/g, '').slice(0, 31);
    const rows: any[][] = [];

    // Title banner
    rows.push([`🏥 EMR OUTPATIENT DEPARTMENT (OPD) REGISTER - ${m.monthLabel.toUpperCase()}`]);
    rows.push([`Total Active Dates: ${m.dates.length}  |  Total Patients Consulted: ${m.totalConsultations}  |  All Form Headings Included`]);
    rows.push([]);

    let overallRowIdx = 1;

    // Loop through each DATE heading in this month
    m.dates.forEach((d) => {
      // Prominent DATE SECTION HEADER ROW
      rows.push([
        `📅 DATE: ${d.displayDate} (${d.date}) — ${d.consultations.length} Consultation${d.consultations.length === 1 ? '' : 's'}`,
      ]);

      // Table Column Headers matching the uploaded EMR forms
      rows.push(EMR_EXCEL_COLUMNS);

      // Add each patient row for this date
      d.consultations.forEach((c) => {
        rows.push(buildConsultationRow(c, overallRowIdx++));
      });

      // Blank spacer row between dates for clean visual separation
      rows.push([]);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Practical column widths for all EMR fields
    ws['!cols'] = EMR_EXCEL_COLUMNS.map((colName) => {
      if (colName === 'Sl. No') return { wch: 8 };
      if (colName === 'OPD / UHID') return { wch: 14 };
      if (colName === 'Patient Name') return { wch: 24 };
      if (colName === 'Complaints') return { wch: 32 };
      if (colName === 'Diagnosis') return { wch: 28 };
      if (colName.includes('Medicine')) return { wch: 28 };
      if (colName.includes('Dosage')) return { wch: 16 };
      if (colName.includes('When')) return { wch: 18 };
      if (colName.includes('Frequency')) return { wch: 16 };
      if (colName.includes('Duration')) return { wch: 14 };
      if (colName.includes('Notes')) return { wch: 28 };
      if (colName.includes('Summary')) return { wch: 45 };
      if (colName === 'Systemic Examination' || colName === 'Genital Examination' || colName === 'Per Rectal Exam') return { wch: 24 };
      if (colName === 'Lab Tests and Imaging') return { wch: 42 };
      if (colName === 'Tests Requested') return { wch: 28 };
      if (colName === 'Diet and Exercise' || colName === 'Assessment / Plan' || colName === 'Advice') return { wch: 28 };
      return { wch: Math.max(colName.length + 3, 12) };
    });

    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  // 3. Create a dedicated "Prescriptions (Rx)" worksheet matching the exact EMR prescription table:
  // Columns: # | Date | Patient Name | OPD / UHID | Medicine | Dosage | When | Frequency | Duration | Notes
  const rxSheetRows: any[][] = [
    ['🏥 EMR PRESCRIPTIONS REGISTER — ALL MEDICATIONS'],
    ['Direct transcription from clinic notes matching the EMR Prescription Table (Medicine | Dosage | When | Frequency | Duration | Notes)'],
    [],
    ['#', 'Date', 'Patient Name', 'OPD / UHID', 'Medicine', 'Dosage', 'When', 'Frequency', 'Duration', 'Notes'],
  ];

  let rxCounter = 1;
  consultations.forEach((c) => {
    const list = c.prescriptions && c.prescriptions.length > 0 ? c.prescriptions : [];
    list.forEach((rx) => {
      rxSheetRows.push([
        rxCounter++,
        c.date || '-',
        formatPatientNameWithSalutation(c.salutation, c.patientName) || '-',
        cleanExplicitOpdNo(c.opdNo) || '-',
        rx.medicine || rx.drugName || '-',
        rx.dosage || rx.dosageStrength || '-',
        rx.when || rx.timing || '-',
        rx.frequency || '-',
        rx.duration || '-',
        rx.notes || rx.instructions || '-',
      ]);
    });
  });

  if (rxSheetRows.length === 4) {
    rxSheetRows.push(['-', '-', '-', '-', 'No prescriptions recorded', '-', '-', '-', '-', '-']);
  }

  const rxWs = XLSX.utils.aoa_to_sheet(rxSheetRows);
  rxWs['!cols'] = [
    { wch: 6 },
    { wch: 14 },
    { wch: 24 },
    { wch: 16 },
    { wch: 30 },
    { wch: 16 },
    { wch: 20 },
    { wch: 16 },
    { wch: 14 },
    { wch: 35 },
  ];
  XLSX.utils.book_append_sheet(wb, rxWs, 'Prescriptions (Rx)');

  // 4. Create a dedicated "OT Register" worksheet for all operated OPD & freelance surgical patients
  const otSheetRows: any[][] = [
    ['🏥 OPERATION THEATRE (OT) & FREELANCE SURGERY REGISTER'],
    ['Includes OPD Operated Patients and Standalone Freelance Surgical Procedures'],
    [],
    [
      '#',
      'Surgery Date',
      'Patient Name',
      'Age / Sex',
      'OPD / UHID',
      'Hospital / Surgical Centre',
      'Procedure Done',
      'Pre/Post-Op Diagnosis',
      'Anaesthesia & Position',
      'Intra-Op Findings',
      'Operative Steps',
      'Catheter / DJ Stent',
      'Post-Op Orders',
      'Operating Surgeon',
    ],
  ];

  let otCounter = 1;
  consultations.forEach((c) => {
    const ot = c.otNotes;
    if (!ot || !(ot.procedureName || ot.operativeFindings || ot.operativeSteps || ot.hospitalName)) {
      return;
    }
    otSheetRows.push([
      otCounter++,
      ot.surgeryDate || c.date || '-',
      formatPatientNameWithSalutation(c.salutation, c.patientName) || '-',
      [c.age, c.gender].filter(Boolean).join(' / ') || '-',
      cleanExplicitOpdNo(c.opdNo) || '-',
      ot.hospitalName || 'OPD / Primary Hospital',
      ot.procedureName || '-',
      ot.postOpDiagnosis || ot.preOpDiagnosis || c.diagnosis || '-',
      [ot.anaesthesiaType, ot.patientPosition].filter(Boolean).join(', ') || '-',
      ot.operativeFindings || '-',
      ot.operativeSteps || '-',
      ot.catheterOrStentDetails || '-',
      ot.postOpOrders || '-',
      ot.surgeonName || c.doctorName || '-',
    ]);
  });

  if (otSheetRows.length === 4) {
    otSheetRows.push([
      '-',
      '-',
      'No OT procedures recorded yet',
      '-',
      '-',
      '-',
      '-',
      '-',
      '-',
      '-',
      '-',
      '-',
      '-',
      '-',
    ]);
  }

  const otWs = XLSX.utils.aoa_to_sheet(otSheetRows);
  otWs['!cols'] = [
    { wch: 6 },
    { wch: 14 },
    { wch: 24 },
    { wch: 12 },
    { wch: 14 },
    { wch: 26 },
    { wch: 32 },
    { wch: 28 },
    { wch: 20 },
    { wch: 36 },
    { wch: 42 },
    { wch: 24 },
    { wch: 32 },
    { wch: 22 },
  ];
  XLSX.utils.book_append_sheet(wb, otWs, 'OT Register');

  return wb;
}

export function buildOpdExcelArrayBuffer(consultations: Consultation[]): ArrayBuffer {
  const wb = buildOpdWorkbook(consultations);
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
}

export function exportOpdToExcel(consultations: Consultation[], fileName = 'EMR_OPD_Consultation_Register.xlsx') {
  const wb = buildOpdWorkbook(consultations);
  XLSX.writeFile(wb, fileName);
}

/**
 * Export specific month as CSV
 */
export function exportMonthToCsv(monthLabel: string, consultations: Consultation[]) {
  const wsRows: any[][] = [EMR_EXCEL_COLUMNS];

  let idx = 1;
  consultations.forEach((c) => {
    wsRows.push(buildConsultationRow(c, idx++));
  });

  const ws = XLSX.utils.aoa_to_sheet(wsRows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `EMR_OPD_${monthLabel.replace(/\s+/g, '_')}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
