import { jsPDF } from 'jspdf';
import { Consultation } from '../types/opd';
import {
  areClinicalCoresDuplicate,
  buildDateWiseInvestigationTable,
  cleanChiefComplaintsText,
  cleanExplicitOpdNo,
  deduplicateClinicalText,
  expandClinicalShorthands,
  hasIpssData,
  MAX_PRINT_INVESTIGATION_DATES,
  normalizeClinicalClauseCore,
  normalizeIpssFieldValue,
  sanitizeAndEnrichConsultationFields,
  sanitizeLabTestsAndImagingText,
} from './investigationUtils';
import {
  getAllPatientOtProcedures,
  getPatientConsolidatedTimelineEntries,
  hasOtNotesData,
  splitOperativeTextIntoLines,
} from './otNotesUtils';
import { DoctorAccount, getRuntimeActiveDoctor } from '../types/doctor';
import {
  buildLabeledAdviceRows,
  formatRxTableRow,
  PrintLayoutMode,
} from './printLayoutUtils';

export interface DoctorPrintCredentials {
  departmentTitle: string;
  doctorName: string;
  doctorDegrees: string;
  doctorSuperSpec: string;
  doctorRegNo: string;
  hospitalName: string;
}

export function getActiveDoctorPrintCredentials(
  overrideDoctor?: DoctorAccount | null
): DoctorPrintCredentials {
  const doc: DoctorAccount | null = overrideDoctor || getRuntimeActiveDoctor();

  if (doc) {
    return {
      departmentTitle: (doc.department || 'CLINICAL DEPARTMENT').trim().toUpperCase(),
      doctorName: (doc.fullName || 'Attending Physician').trim(),
      doctorDegrees: (doc.qualification || '').trim(),
      doctorSuperSpec: (doc.speciality || '').trim(),
      doctorRegNo: (doc.registrationNo || '').trim(),
      hospitalName: (doc.hospitalName || 'Medical Clinic').trim(),
    };
  }

  return {
    departmentTitle: 'CLINICAL DEPARTMENT',
    doctorName: 'Attending Physician',
    doctorDegrees: '',
    doctorSuperSpec: '',
    doctorRegNo: '',
    hospitalName: 'Medical Clinic',
  };
}

export interface PdfExportOptions {
  allConsultations?: Consultation[];
  docType?: 'opd' | 'ot';
  isConsolidatedMode?: boolean;
  sortOrder?: 'chronological' | 'latest-first';
  departmentTitle?: string;
  doctorName?: string;
  doctorDegrees?: string;
  doctorSuperSpec?: string;
  doctorRegNo?: string;
  preprintedStationery?: boolean;
  ipssMode?: 'auto' | 'show' | 'hide';
  investigationsPrintMode?: 'whole-table' | 'latest-only';
  printLayout?: PrintLayoutMode;
  showInvestigations?: boolean;
  showVitalsInCo?: boolean;
  showHistoryChecklist?: boolean;
  hideEmptySections?: boolean;
}

function cleanPrintText(val?: string | number | null): string {
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

function hasText(val?: string | number | null): boolean {
  return Boolean(cleanPrintText(val));
}

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

function formatIndianDate(dateStr?: string): string {
  if (!dateStr) return '';
  const match = String(dateStr).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }
  return dateStr;
}

function renderSinglePageToDoc(
  doc: jsPDF,
  rawC: Consultation,
  _visitIndex: number,
  _totalVisits: number,
  opts: Required<PdfExportOptions>
) {
  const c = sanitizeAndEnrichConsultationFields(rawC);
  const pageWidth = 210;
  // Match exact Print Preview padding (10mm top, 12mm right, 12mm left)
  const leftMargin = 12;
  const rightMargin = 12;
  const contentWidth = pageWidth - leftMargin - rightMargin;
  let curY = 10;

  const v = c.vitals || {};
  const hc = c.historyChecklist || {};
  const ip = c.ipss || {};

  // =========================================================================
  // 1. HEADER AREA (Exact match to Print Preview: NO CARE Logo, NO NABH Logo, NO Box around Doctor Name)
  // =========================================================================
  const headerTopY = curY;
  const centerX = leftMargin + contentWidth / 2;

  let docLineY = headerTopY + 4.5;

  // Department Title (bold uppercase, 10pt)
  if (hasText(opts.departmentTitle)) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text(opts.departmentTitle.toUpperCase(), centerX, docLineY, { align: 'center' });
    docLineY += 5;
  }

  // Doctor Name (extra-bold uppercase, 11.5pt — unboxed!)
  const resolvedDocName = (opts.doctorName || c.doctorName || '').trim().toUpperCase();
  if (resolvedDocName) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(2, 6, 23); // slate-950
    doc.text(resolvedDocName, centerX, docLineY, { align: 'center' });
    docLineY += 4.3;
  }

  // Qualifications Line 1
  if (hasText(opts.doctorDegrees)) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.8);
    doc.setTextColor(30, 41, 59); // slate-800
    doc.text(opts.doctorDegrees.trim(), centerX, docLineY, { align: 'center' });
    docLineY += 3.8;
  }

  // Super-Speciality Line 2
  if (hasText(opts.doctorSuperSpec)) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.8);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text(opts.doctorSuperSpec.trim(), centerX, docLineY, { align: 'center' });
    docLineY += 3.8;
  }

  // Registration Number (MMC)
  if (hasText(opts.doctorRegNo)) {
    doc.setFont('courier', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);
    doc.text(opts.doctorRegNo.trim(), centerX, docLineY, { align: 'center' });
    docLineY += 3.5;
  }

  // Right side: Unboxed DATE aligned near bottom of header
  const headerBottomY = Math.max(docLineY + 1, headerTopY + 21);
  const dateStr = formatIndianDate(c.date);
  doc.setFont('courier', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(2, 6, 23);
  const dateValW = doc.getTextWidth(dateStr);
  doc.text(dateStr, pageWidth - rightMargin - 1, headerBottomY - 2, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.text('DATE:', pageWidth - rightMargin - 1 - dateValW - 2, headerBottomY - 2, {
    align: 'right',
  });

  // Solid bottom border under Header Area (border-b border-slate-800)
  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.35);
  doc.line(leftMargin, headerBottomY + 1, pageWidth - rightMargin, headerBottomY + 1);

  curY = headerBottomY + 6.5;

  // =========================================================================
  // 2. PATIENT NAME & AGE / SEX ROW (Exact match to Print Preview)
  // =========================================================================
  const ptFullName = formatPatientFullName(c.salutation, c.patientName);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.8);
  doc.setTextColor(51, 65, 85); // slate-700
  doc.text('PT NAME:', leftMargin + 1, curY);

  const ptLabelW = doc.getTextWidth('PT NAME:') + 2.5;
  const ptNameX = leftMargin + 1 + ptLabelW;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(2, 6, 23); // slate-950
  doc.text(ptFullName, ptNameX, curY);

  // Dotted underline under Pt Name (min-w-[220px] equivalent ~55mm)
  const ptNameW = Math.max(doc.getTextWidth(ptFullName) + 4, 55);
  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.25);
  doc.setLineDashPattern([0.6, 0.8], 0);
  doc.line(ptNameX, curY + 1.2, ptNameX + ptNameW, curY + 1.2);
  doc.setLineDashPattern([], 0);

  const explicitOpd = cleanExplicitOpdNo(c.opdNo);
  if (hasText(explicitOpd)) {
    const uhidX = ptNameX + ptNameW + 3;
    doc.setFont('courier', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`(UHID/OPD: ${cleanPrintText(explicitOpd)})`, uhidX, curY);
  }

  // Right side: Age / Sex + Ph
  let rightCursorX = pageWidth - rightMargin - 1;
  if (hasText(c.phoneNumber || c.contactNumber)) {
    const phText = `Ph: ${cleanPrintText(c.phoneNumber || c.contactNumber)}`;
    doc.setFont('courier', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    doc.text(phText, rightCursorX, curY, { align: 'right' });
    rightCursorX -= doc.getTextWidth(phText) + 5;
  }

  const ageSexVal = [cleanPrintText(c.age), cleanPrintText(c.gender)].filter(Boolean).join(' / ') || '—';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(2, 6, 23);
  const ageBoxW = Math.max(doc.getTextWidth(ageSexVal) + 6, 18);
  const ageBoxCenterX = rightCursorX - ageBoxW / 2;
  doc.text(ageSexVal, ageBoxCenterX, curY, { align: 'center' });

  // Dotted underline under Age / Sex
  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.25);
  doc.setLineDashPattern([0.6, 0.8], 0);
  doc.line(rightCursorX - ageBoxW, curY + 1.2, rightCursorX, curY + 1.2);
  doc.setLineDashPattern([], 0);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.8);
  doc.setTextColor(51, 65, 85);
  doc.text('AGE / SEX:', rightCursorX - ageBoxW - 2, curY, { align: 'right' });

  // Bottom border under Patient Row (border-b border-slate-400)
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.3);
  doc.line(leftMargin, curY + 3, pageWidth - rightMargin, curY + 3);

  curY += 8;

  // =========================================================================
  // 3. CLINICAL BODY: 3 LAYOUTS ('column', 'split' [default], 'flat')
  // =========================================================================
  const totalBodyW = contentWidth;
  const leftColX = leftMargin;
  const leftColW = Math.round(totalBodyW * (5 / 12)) - 3.5;
  const dividerX = leftColX + leftColW + 3.5;
  const rightColX = dividerX + 4;
  const rightColW = pageWidth - rightMargin - rightColX;

  let leftY = curY;
  let rightY = curY;

  const drawSectionHeader = (title: string, x: number, y: number): number => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.2);
    doc.setTextColor(2, 6, 23); // slate-950
    doc.text(title.toUpperCase(), x, y);
    return y + 4.3;
  };

  const drawWrappedBullets = (
    items: string[],
    x: number,
    y: number,
    maxW: number,
    boldItems = false
  ): number => {
    let ny = y;
    doc.setFont('helvetica', boldItems ? 'bold' : 'normal');
    doc.setFontSize(8.8);
    doc.setTextColor(15, 23, 42);
    for (const item of items) {
      const lines = doc.splitTextToSize(`• ${item}`, maxW - 1);
      doc.text(lines, x + 0.5, ny);
      ny += lines.length * 4 + 0.8;
    }
    return ny;
  };

  // -------------------------------------------------------------------------
  // LEFT COLUMN (5 Cols):
  //   1. VITALS
  //   2. CHIEF COMPLAINTS
  //   3. IPSS
  //   4. NEGATIVE / HISTORY CHECKLIST
  //   5. EXAMINATION (O/E: P/A & Systemic, Genital Exam, PR Exam (DRE))
  // -------------------------------------------------------------------------

  // LEFT 1: VITALS
  const vitalsParts: string[] = [];
  if (opts.showVitalsInCo && v) {
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

  if (opts.showVitalsInCo && (!opts.hideEmptySections || vitalsParts.length > 0)) {
    leftY = drawSectionHeader('VITALS', leftColX, leftY);
    doc.setFont('courier', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    const vText =
      vitalsParts.length > 0
        ? vitalsParts.join('  •  ')
        : 'BP: ________  •  Pulse: ______  •  Wt: ______';
    const vLines = doc.splitTextToSize(vText, leftColW);
    doc.text(vLines, leftColX, leftY);
    leftY += vLines.length * 4 + 3;
  }

  // LEFT 2: CHIEF COMPLAINTS
  const complaintItems = splitIntoItems(
    cleanChiefComplaintsText(c.complaints || c.chiefComplaints)
  );
  const checklistItems: Array<{ label: string; value: string }> = [];
  if (opts.showHistoryChecklist && hc) {
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

  if (!opts.hideEmptySections || complaintItems.length > 0) {
    leftY = drawSectionHeader('CHIEF COMPLAINTS', leftColX, leftY);
    if (complaintItems.length > 0) {
      leftY = drawWrappedBullets(complaintItems, leftColX, leftY, leftColW);
    } else if (!opts.hideEmptySections) {
      leftY += 12;
    }
    leftY += 2;
  }

  // LEFT 3: IPSS (Exact match to Print Preview: 3 rows on left [F, U, N], 4 rows on right [P, I, S, S])
  const shouldShowIpss =
    opts.ipssMode === 'show' ? true : opts.ipssMode === 'hide' ? false : hasIpssData(c);

  if (shouldShowIpss) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.2);
    doc.setTextColor(2, 6, 23);
    doc.text('IPSS', leftColX, leftY);

    if (hasText(ip.scoreTotal) || hasText(ip.qualityOfLife)) {
      const scoreRight = [
        hasText(ip.scoreTotal) ? `Score: ${cleanPrintText(ip.scoreTotal)}` : '',
        hasText(ip.qualityOfLife) ? `QoL: ${cleanPrintText(ip.qualityOfLife)}` : '',
      ]
        .filter(Boolean)
        .join(' • ');
      doc.setFontSize(8);
      doc.setTextColor(30, 41, 59);
      doc.text(scoreRight, leftColX + leftColW, leftY, { align: 'right' });
    }

    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.25);
    doc.line(leftColX, leftY + 1.2, leftColX + leftColW, leftY + 1.2);
    leftY += 3.2;

    const boxTopY = leftY;
    const rowH = 4.8;
    const boxH = rowH * 4 + 2;
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.25);
    doc.rect(leftColX, boxTopY, leftColW, boxH);

    const midX = leftColX + leftColW / 2;
    doc.line(midX, boxTopY + 1, midX, boxTopY + boxH - 1);

    const leftIpssRows: Array<[string, string]> = [
      ['[F] Frequency:', cleanPrintText(normalizeIpssFieldValue(ip.frequency)) || '—'],
      ['[U] Urgency:', cleanPrintText(normalizeIpssFieldValue(ip.urgency)) || '—'],
      ['[N] Nocturia:', cleanPrintText(normalizeIpssFieldValue(ip.nocturia)) || '—'],
    ];
    const rightIpssRows: Array<[string, string]> = [
      ['[P] Poor Flow:', cleanPrintText(normalizeIpssFieldValue(ip.poorFlow || ip.poorStream)) || '—'],
      ['[I] Intermittency:', cleanPrintText(normalizeIpssFieldValue(ip.intermittency)) || '—'],
      ['[S] Straining:', cleanPrintText(normalizeIpssFieldValue(ip.straining)) || '—'],
      ['[S] Incomplete Evac:', cleanPrintText(normalizeIpssFieldValue(ip.incompleteEvacuation)) || '—'],
    ];

    const drawIpssCell = (label: string, val: string, xStart: number, xEnd: number, ry: number) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.4);
      doc.setTextColor(30, 41, 59);
      doc.text(label, xStart, ry);
      const labelW = doc.getTextWidth(label);
      const maxValW = Math.max(8, xEnd - xStart - labelW - 1.5);
      let valFontSize = 7.4;
      doc.setFontSize(valFontSize);
      if (doc.getTextWidth(val) > maxValW) {
        valFontSize = 6.3;
        doc.setFontSize(valFontSize);
      }
      doc.setTextColor(2, 6, 23);
      doc.text(val, xEnd, ry, { align: 'right' });

      doc.setDrawColor(203, 213, 225);
      doc.setLineDashPattern([0.5, 0.7], 0);
      doc.line(xStart, ry + 1.1, xEnd, ry + 1.1);
      doc.setLineDashPattern([], 0);
    };

    leftIpssRows.forEach(([label, val], idx) => {
      drawIpssCell(label, val, leftColX + 1.5, midX - 1.5, boxTopY + 4 + idx * rowH);
    });

    rightIpssRows.forEach(([label, val], idx) => {
      drawIpssCell(label, val, midX + 2, leftColX + leftColW - 1.5, boxTopY + 4 + idx * rowH);
    });

    leftY = boxTopY + boxH + 4;
  }

  // LEFT 4: NEGATIVE / HISTORY CHECKLIST
  if (checklistItems.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.4);
    doc.setTextColor(2, 6, 23);
    doc.text('NEGATIVE / HISTORY CHECKLIST', leftColX, leftY);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.25);
    doc.line(leftColX, leftY + 1.1, leftColX + leftColW, leftY + 1.1);
    leftY += 4.0;

    const drawSingleLineChecklistCell = (
      item: { label: string; value: string },
      cellX: number,
      cellY: number
    ) => {
      const prefix = `• ${item.label}: `;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.4);
      doc.setTextColor(51, 65, 85);
      doc.text(prefix, cellX, cellY);
      const prefixW = doc.getTextWidth(prefix);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(2, 6, 23);
      doc.text(item.value, cellX + prefixW, cellY);
    };

    const secondColX = leftColX + leftColW / 2 + 1;
    for (let i = 0; i < checklistItems.length; i += 2) {
      drawSingleLineChecklistCell(checklistItems[i], leftColX, leftY);
      if (checklistItems[i + 1]) {
        drawSingleLineChecklistCell(checklistItems[i + 1], secondColX, leftY);
      }
      leftY += 3.8;
    }
    leftY += 2.5;
  }

  // LEFT 4: EXAMINATION (Exact match to Print Preview: EXAMINATION -> O/E: -> P/A & Systemic, Genital Exam, PR Exam (DRE))
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

  if (!opts.hideEmptySections || examLines.length > 0) {
    leftY = drawSectionHeader('EXAMINATION', leftColX, leftY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.8);
    doc.setTextColor(30, 41, 59);
    doc.text('O/E:', leftColX + 0.5, leftY);
    leftY += 4.2;

    if (examLines.length > 0) {
      examLines.forEach((ex) => {
        const prefix = `${ex.label}: `;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.8);
        const prefixW = doc.getTextWidth(prefix);

        doc.setFont('helvetica', 'normal');
        const wrapped = doc.splitTextToSize(`${prefix}${ex.value}`, leftColW - 2);
        wrapped.forEach((line: string, lIdx: number) => {
          if (lIdx === 0 && line.startsWith(prefix)) {
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(15, 23, 42);
            doc.text(prefix, leftColX + 1.5, leftY);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(30, 41, 59);
            doc.text(line.slice(prefix.length), leftColX + 1.5 + prefixW, leftY);
          } else {
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(30, 41, 59);
            doc.text(line, leftColX + 1.5, leftY);
          }
          leftY += 4;
        });
        leftY += 0.8;
      });
    } else if (!opts.hideEmptySections) {
      leftY += 10;
    }
    leftY += 2;
  }

  // -------------------------------------------------------------------------
  // RIGHT COLUMN (7 Cols) — Exact Print Preview Sequencing:
  //   1. PREVIOUS INVESTIGATIONS (LAB TESTS & IMAGING)
  //   2. PAST MEDICATION / COMORBIDITIES
  //   3. DIAGNOSIS
  //   4. ADVISED INVESTIGATIONS
  //   5. MEDICATIONS (Rx)
  //   6. PLAN
  // -------------------------------------------------------------------------

  const sanitizedLabAndHistory = sanitizeLabTestsAndImagingText(
    c.labTestsAndImaging,
    c.pastMedication
  );
  const reportedInvestigations = opts.showInvestigations
    ? splitIntoItems(sanitizedLabAndHistory.labTestsAndImaging)
    : [];

  // RIGHT 1: PREVIOUS INVESTIGATIONS (LAB TESTS & IMAGING)
  if (opts.showInvestigations) {
    const invTable = buildDateWiseInvestigationTable(c, opts.allConsultations);

    let allowedDates = invTable.dates;
    if (opts.investigationsPrintMode === 'latest-only' && invTable.dates.length > 0) {
      const matchingConsultationDate = invTable.dates.find((d) => d.isoDate === c.date);
      const targetDate = matchingConsultationDate || invTable.dates[invTable.dates.length - 1];
      allowedDates = [targetDate];
    } else if (invTable.dates.length > MAX_PRINT_INVESTIGATION_DATES) {
      allowedDates = invTable.dates.slice(-MAX_PRINT_INVESTIGATION_DATES);
    }

    const allowedIsoSet = new Set(allowedDates.map((d) => d.isoDate));
    let labRowsToRender = invTable.labRows.filter((r) =>
      allowedDates.some((d) => Boolean(r.valuesByDate[d.isoDate]?.value))
    );
    let shownLabDates = allowedDates.filter((d) =>
      labRowsToRender.some((r) => Boolean(r.valuesByDate[d.isoDate]?.value))
    );
    let imagingEntriesToRender = invTable.imagingTimeline.filter((img) =>
      allowedIsoSet.has(img.isoDate)
    );

    if (
      opts.investigationsPrintMode === 'latest-only' &&
      labRowsToRender.length === 0 &&
      imagingEntriesToRender.length === 0 &&
      invTable.dates.length > 0
    ) {
      const lastDate = invTable.dates[invTable.dates.length - 1];
      labRowsToRender = invTable.labRows.filter((r) => Boolean(r.valuesByDate[lastDate.isoDate]?.value));
      shownLabDates = labRowsToRender.length > 0 ? [lastDate] : [];
      imagingEntriesToRender = invTable.imagingTimeline.filter((img) => img.isoDate === lastDate.isoDate);
    }

    const hasLabMatrix = labRowsToRender.length > 0 && shownLabDates.length > 0;
    const hasImagingBottom = imagingEntriesToRender.length > 0;
    const hasTable = hasLabMatrix || hasImagingBottom;

    if (hasTable || reportedInvestigations.length > 0) {
      rightY = drawSectionHeader('PREVIOUS INVESTIGATIONS (LAB TESTS & IMAGING)', rightColX, rightY);

    if (hasTable) {
      rightY += 1;

      let paramColW = 36;
      let dateColWidths: number[] = [];

      if (hasLabMatrix) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.2);
        let measuredParamW = doc.getTextWidth('Investigation') + 6;
        labRowsToRender.forEach((row) => {
          const w = doc.getTextWidth(row.parameterName) + 6;
          if (w > measuredParamW) measuredParamW = w;
        });
        const maxParamCap = shownLabDates.length >= 4 ? 32 : 48;
        const minParamFloor = shownLabDates.length >= 4 ? 26 : 34;
        paramColW = Math.min(Math.max(measuredParamW, minParamFloor), maxParamCap);

        const maxAvailableForDates = rightColW - paramColW;
        dateColWidths = shownLabDates.map((d) => {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.2);
          let maxW = doc.getTextWidth(d.displayDate || d.isoDate) + 4;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          labRowsToRender.forEach((row) => {
            const val = row.valuesByDate[d.isoDate]?.value || '—';
            const w = doc.getTextWidth(val) + 4;
            if (w > maxW) maxW = w;
          });
          const maxPerCol =
            shownLabDates.length === 1
              ? Math.min(maxAvailableForDates, 48)
              : maxAvailableForDates / shownLabDates.length;
          return Math.min(Math.max(maxW, Math.min(18, maxPerCol)), maxPerCol);
        });
      }

      const labTableW = hasLabMatrix
        ? paramColW + dateColWidths.reduce((sum, w) => sum + w, 0)
        : 0;

      let imagingMinW = 0;
      if (hasImagingBottom) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        imagingEntriesToRender.forEach((img) => {
          const headerW = doc.getTextWidth(`${img.studyName} — ${img.displayDate}`) + 8;
          if (headerW > imagingMinW) imagingMinW = headerW;
          img.bullets.forEach((b) => {
            const bw = doc.getTextWidth(`• ${b}`) + 8;
            if (bw > imagingMinW) imagingMinW = bw;
          });
        });
        imagingMinW = Math.min(Math.max(imagingMinW, 62), rightColW);
      }

      const totalTableW = Math.min(Math.max(labTableW, imagingMinW, 52), rightColW);
      if (hasLabMatrix && totalTableW > labTableW && dateColWidths.length > 0) {
        const extraPerCol = (totalTableW - labTableW) / dateColWidths.length;
        dateColWidths = dateColWidths.map((w) => w + extraPerCol);
      }

      let trY = rightY - 2.5;

      if (hasLabMatrix) {
        const thH = 4.8;
        doc.setFillColor(241, 245, 249);
        doc.setDrawColor(100, 116, 139);
        doc.setLineWidth(0.25);
        doc.rect(rightColX, trY, totalTableW, thH, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.2);
        doc.setTextColor(15, 23, 42);
        doc.text('Investigation', rightColX + 1.5, trY + 3.3);

        let curHeaderX = rightColX + paramColW;
        shownLabDates.forEach((d, dIdx) => {
          const colW = dateColWidths[dIdx];
          doc.line(curHeaderX, trY, curHeaderX, trY + thH);
          doc.text(d.displayDate || d.isoDate, curHeaderX + colW / 2, trY + 3.3, {
            align: 'center',
          });
          curHeaderX += colW;
        });

        trY += thH;

        labRowsToRender.forEach((row) => {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.2);
          const paramLines = doc.splitTextToSize(row.parameterName, paramColW - 3);
          let maxRowLines = paramLines.length;

          const cellLinesByDate = shownLabDates.map((d, dIdx) => {
            const val = row.valuesByDate[d.isoDate]?.value || '—';
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            const lines = doc.splitTextToSize(val, dateColWidths[dIdx] - 3);
            if (lines.length > maxRowLines) maxRowLines = lines.length;
            return lines;
          });

          const rH = Math.max(maxRowLines * 3.3 + 1.8, 4.6);
          doc.setDrawColor(148, 163, 184);
          doc.rect(rightColX, trY, totalTableW, rH);

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.2);
          doc.setTextColor(15, 23, 42);
          doc.text(paramLines, rightColX + 1.5, trY + 3.2);

          let curCellX = rightColX + paramColW;
          shownLabDates.forEach((_, dIdx) => {
            const colW = dateColWidths[dIdx];
            doc.line(curCellX, trY, curCellX, trY + rH);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(30, 41, 59);
            const lines = cellLinesByDate[dIdx];
            if (lines.length === 1 && lines[0].length <= 18) {
              doc.text(lines[0], curCellX + colW / 2, trY + 3.2, { align: 'center' });
            } else {
              doc.text(lines, curCellX + 1.5, trY + 3.2);
            }
            curCellX += colW;
          });

          trY += rH;
        });
      }

      if (hasImagingBottom) {
        imagingEntriesToRender.forEach((imgEntry) => {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          const wrappedBulletGroups = imgEntry.bullets.map((b) =>
            doc.splitTextToSize(`• ${b}`, totalTableW - 5)
          );
          const totalBulletLines = wrappedBulletGroups.reduce((sum, g) => sum + g.length, 0);
          const boxH = 4.8 + totalBulletLines * 3.3 + 1.8;

          doc.setFillColor(248, 250, 252);
          doc.setDrawColor(148, 163, 184);
          doc.setLineWidth(0.25);
          doc.rect(rightColX, trY, totalTableW, boxH, 'FD');

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.2);
          doc.setTextColor(15, 23, 42);
          const headerText = `${imgEntry.studyName} — ${imgEntry.displayDate}`;
          doc.text(headerText, rightColX + 1.8, trY + 3.4);
          const headerW = doc.getTextWidth(headerText);
          doc.setDrawColor(148, 163, 184);
          doc.setLineWidth(0.2);
          doc.line(rightColX + 1.8, trY + 4, rightColX + 1.8 + headerW, trY + 4);

          let bulletY = trY + 7;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.setTextColor(30, 41, 59);
          wrappedBulletGroups.forEach((lines) => {
            doc.text(lines, rightColX + 3, bulletY);
            bulletY += lines.length * 3.3;
          });

          trY += boxH;
        });
      }

      rightY = trY + 4;
    } else if (reportedInvestigations.length > 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.8);
      doc.setTextColor(15, 23, 42);
      reportedInvestigations.forEach((inv, idx) => {
        const lines = doc.splitTextToSize(`${idx + 1}. ${inv}`, rightColW - 1);
        doc.text(lines, rightColX + 0.5, rightY);
        rightY += lines.length * 4 + 0.6;
      });
      rightY += 2;
    }
    }
  }

  // RIGHT 2: PAST MEDICATION / COMORBIDITIES
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

  if (!opts.hideEmptySections || pastMedAndComorbidities.length > 0) {
    rightY = drawSectionHeader('PAST MEDICATION / COMORBIDITIES', rightColX, rightY);
    if (pastMedAndComorbidities.length > 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.8);
      doc.setTextColor(15, 23, 42);
      const pmLines = doc.splitTextToSize(pastMedAndComorbidities.join('  •  '), rightColW - 1);
      doc.text(pmLines, rightColX + 0.5, rightY);
      rightY += pmLines.length * 4 + 2.5;
    } else {
      rightY += 5;
    }
  }

  // RIGHT 3: DIAGNOSIS (Exact match to Print Preview: Δ {diagnosis} in bold unboxed text)
  const deduplicatedDiagnosis = splitIntoItems(c.diagnosis).join(' / ');
  if (!opts.hideEmptySections || Boolean(deduplicatedDiagnosis)) {
    rightY = drawSectionHeader('DIAGNOSIS', rightColX, rightY);
    if (deduplicatedDiagnosis) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(2, 6, 23);
      const diagLines = doc.splitTextToSize(`Δ ${deduplicatedDiagnosis}`, rightColW - 1);
      doc.text(diagLines, rightColX + 0.5, rightY);
      rightY += diagLines.length * 4.4 + 2.5;
    } else {
      rightY += 5;
    }
  }

  // RIGHT 4: ADVISED INVESTIGATIONS
  const toldInvestigations = splitIntoItems(
    [
      cleanPrintText(c.testsRequested || c.investigationsAdvised),
      hasText(c.testsRequestedByWhen) ? `(By: ${cleanPrintText(c.testsRequestedByWhen)})` : '',
    ]
      .filter(Boolean)
      .join(' ')
  );

  if (!opts.hideEmptySections || toldInvestigations.length > 0) {
    rightY = drawSectionHeader('ADVISED INVESTIGATIONS', rightColX, rightY);
    if (toldInvestigations.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.8);
      doc.setTextColor(15, 23, 42);
      const advInvLines = doc.splitTextToSize(toldInvestigations.join('; '), rightColW - 1);
      doc.text(advInvLines, rightColX + 0.5, rightY);
      rightY += advInvLines.length * 4 + 2.5;
    } else {
      rightY += 5;
    }
  }

  const renderFullWidthRxAndAdvicePdf = (startY: number): number => {
    const rawPrescriptions = (c.prescriptions || []).filter((rx) =>
      hasText(rx.medicine || rx.drugName)
    );
    const seenMedKeys = new Set<string>();
    const prescriptions = rawPrescriptions.filter((rx) => {
      const medKey = `${cleanPrintText(rx.medicine || rx.drugName).toLowerCase()}|${cleanPrintText(
        rx.dosage || rx.dosageStrength
      ).toLowerCase()}`;
      if (seenMedKeys.has(medKey)) return false;
      seenMedKeys.add(medKey);
      return true;
    });

    const labeledAdviceRows = buildLabeledAdviceRows(c);
    const hasRx = prescriptions.length > 0 || hasText(c.prescriptionsSummaryText);
    const hasAdvice = labeledAdviceRows.length > 0;
    if (!hasRx && !hasAdvice && opts.hideEmptySections) return startY;

    let ry = startY;
    const ensureSpace = (neededMm: number) => {
      if (ry + neededMm > 258) {
        doc.addPage('a4', 'portrait');
        ry = 16;
      }
    };

    const drawRxTableHeader = () => {
      ensureSpace(14);
      doc.setFont('times', 'bold');
      doc.setFontSize(15);
      doc.setTextColor(2, 6, 23);
      doc.text('Rx', leftMargin, ry);
      ry += 2.2;

      doc.setDrawColor(15, 23, 42);
      doc.setLineWidth(0.32);
      doc.line(leftMargin, ry, leftMargin + contentWidth, ry);

      const headerRowTop = ry;
      ry += 4.2;

      const colMedX = leftMargin + 1;
      const colDosageCenterX = leftMargin + contentWidth * 0.57;
      const colSummaryX = leftMargin + contentWidth * 0.67;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.4);
      doc.setTextColor(2, 6, 23);
      doc.text('Medicine', colMedX, ry);
      doc.text('Dosage', colDosageCenterX, ry, { align: 'center' });
      doc.text('Timing - Freq. - Duration', colSummaryX, ry);

      ry += 2;
      doc.setDrawColor(15, 23, 42);
      doc.setLineWidth(0.32);
      doc.line(leftMargin, headerRowTop + 6.2, leftMargin + contentWidth, headerRowTop + 6.2);
      ry += 4.2;
    };

    if (hasRx) {
      if (prescriptions.length > 0) {
        drawRxTableHeader();
        const colNumX = leftMargin + 1;
        const colMedX = leftMargin + 7.5;
        const colMedW = contentWidth * 0.5 - 9;
        const colDosageCenterX = leftMargin + contentWidth * 0.57;
        const colSummaryX = leftMargin + contentWidth * 0.67;
        const colSummaryW = contentWidth * 0.33 - 1;

        prescriptions.forEach((rx, idx) => {
          const row = formatRxTableRow(rx);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.5);
          const medLines = doc.splitTextToSize(row.medicineLine || '—', colMedW);
          const summaryLines = doc.splitTextToSize(row.timingFreqDuration || '—', colSummaryW);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.6);
          const notesLines = row.notesLine
            ? doc.splitTextToSize(`Notes : ${row.notesLine}`, colMedW)
            : [];

          const leftHeight = medLines.length * 3.8 + notesLines.length * 3.3;
          const rightHeight = summaryLines.length * 3.8;
          const rowContentH = Math.max(leftHeight, rightHeight, 4.2);

          if (ry + rowContentH + 4 > 258) {
            doc.setDrawColor(15, 23, 42);
            doc.setLineWidth(0.32);
            doc.line(leftMargin, ry - 1.5, leftMargin + contentWidth, ry - 1.5);
            doc.addPage('a4', 'portrait');
            ry = 16;
            drawRxTableHeader();
          }

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.4);
          doc.setTextColor(30, 41, 59);
          doc.text(`${idx + 1})`, colNumX, ry);

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.6);
          doc.setTextColor(2, 6, 23);
          doc.text(medLines, colMedX, ry);

          if (notesLines.length > 0) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.6);
            doc.setTextColor(51, 65, 85);
            doc.text(notesLines, colMedX, ry + medLines.length * 3.8);
          }

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.4);
          doc.setTextColor(2, 6, 23);
          doc.text(row.dosagePattern || '—', colDosageCenterX, ry, { align: 'center' });

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.3);
          doc.setTextColor(15, 23, 42);
          doc.text(summaryLines, colSummaryX, ry);

          ry += rowContentH + 1.8;

          doc.setDrawColor(idx === prescriptions.length - 1 ? 15 : 148, idx === prescriptions.length - 1 ? 23 : 163, idx === prescriptions.length - 1 ? 42 : 184);
          doc.setLineWidth(idx === prescriptions.length - 1 ? 0.32 : 0.2);
          doc.line(leftMargin, ry - 0.8, leftMargin + contentWidth, ry - 0.8);

          if (idx < prescriptions.length - 1) {
            ry += 3.6;
          } else {
            ry += 3.5;
          }
        });
      } else if (hasText(c.prescriptionsSummaryText)) {
        ensureSpace(14);
        doc.setFont('times', 'bold');
        doc.setFontSize(15);
        doc.setTextColor(2, 6, 23);
        doc.text('Rx', leftMargin, ry);
        ry += 3;
        doc.setDrawColor(15, 23, 42);
        doc.setLineWidth(0.3);
        doc.line(leftMargin, ry, leftMargin + contentWidth, ry);
        ry += 4.5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.6);
        const sumLines = doc.splitTextToSize(
          splitIntoItems(c.prescriptionsSummaryText).join('\n'),
          contentWidth - 2
        );
        doc.text(sumLines, leftMargin + 1, ry);
        ry += sumLines.length * 4 + 2;
        doc.line(leftMargin, ry, leftMargin + contentWidth, ry);
        ry += 3.5;
      }
    }

    if (hasAdvice || !opts.hideEmptySections) {
      if (hasAdvice) {
        labeledAdviceRows.forEach((row) => {
          const prefix = `${row.label}: `;
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.6);
          const prefixW = doc.getTextWidth(prefix);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.6);
          const wrapped = doc.splitTextToSize(`${prefix}${row.text}`, contentWidth - 2);
          ensureSpace(wrapped.length * 4 + 2);
          wrapped.forEach((line: string, lIdx: number) => {
            if (lIdx === 0 && line.startsWith(prefix)) {
              doc.setFont('helvetica', 'bold');
              doc.setTextColor(2, 6, 23);
              doc.text(prefix, leftMargin + 0.5, ry);
              doc.setFont('helvetica', 'normal');
              doc.setTextColor(15, 23, 42);
              doc.text(line.slice(prefix.length), leftMargin + 0.5 + prefixW, ry);
            } else {
              doc.setFont('helvetica', 'normal');
              doc.setTextColor(15, 23, 42);
              doc.text(line, leftMargin + 0.5, ry);
            }
            ry += 4;
          });
          ry += 0.8;
        });
      } else {
        ensureSpace(8);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.6);
        doc.setTextColor(2, 6, 23);
        doc.text('Advice:', leftMargin + 0.5, ry);
        doc.setDrawColor(148, 163, 184);
        doc.line(leftMargin + 16, ry + 0.5, leftMargin + contentWidth, ry + 0.5);
        ry += 6;
      }
    }

    return ry;
  };

  if (opts.printLayout === 'flat') {
    // =====================================================================
    // FLAT LAYOUT: Single-column full-width stacked clinical flow + 1-line IPSS
    // =====================================================================
    let flatY = curY;

    if (opts.showVitalsInCo && (!opts.hideEmptySections || vitalsParts.length > 0)) {
      const vText =
        vitalsParts.length > 0
          ? vitalsParts.join('  •  ')
          : 'BP: ________  •  Pulse: ______  •  Wt: ______';
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.8);
      doc.setTextColor(2, 6, 23);
      doc.text('VITALS:', leftMargin, flatY);
      doc.setFont('courier', 'bold');
      doc.setFontSize(8.4);
      doc.setTextColor(15, 23, 42);
      const vLines = doc.splitTextToSize(vText, contentWidth - 18);
      doc.text(vLines, leftMargin + 17, flatY);
      flatY += vLines.length * 4 + 2.2;
    }

    if (!opts.hideEmptySections || complaintItems.length > 0) {
      flatY = drawSectionHeader('CHIEF COMPLAINTS', leftMargin, flatY);
      if (complaintItems.length > 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.6);
        doc.setTextColor(15, 23, 42);
        const cLines = doc.splitTextToSize(complaintItems.join('  •  '), contentWidth - 2);
        doc.text(cLines, leftMargin + 0.5, flatY);
        flatY += cLines.length * 3.9 + 2;
      } else {
        flatY += 6;
      }
    }

    if (shouldShowIpss) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.8);
      doc.setTextColor(2, 6, 23);
      doc.text('IPSS', leftMargin, flatY);

      if (hasText(ip.scoreTotal) || hasText(ip.qualityOfLife)) {
        const scoreRight = [
          hasText(ip.scoreTotal) ? `Total Score: ${cleanPrintText(ip.scoreTotal)}` : '',
          hasText(ip.qualityOfLife) ? `QoL: ${cleanPrintText(ip.qualityOfLife)}` : '',
        ]
          .filter(Boolean)
          .join('  •  ');
        doc.setFontSize(8);
        doc.setTextColor(30, 41, 59);
        doc.text(scoreRight, leftMargin + contentWidth, flatY, { align: 'right' });
      }

      flatY += 2;
      const barH = 8.4;
      const cellW = contentWidth / 7;
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(100, 116, 139);
      doc.setLineWidth(0.25);
      doc.rect(leftMargin, flatY, contentWidth, barH, 'FD');

      const ipssCells: Array<[string, string]> = [
        ['[F] Freq', cleanPrintText(normalizeIpssFieldValue(ip.frequency)) || '—'],
        ['[U] Urg', cleanPrintText(normalizeIpssFieldValue(ip.urgency)) || '—'],
        ['[N] Noct', cleanPrintText(normalizeIpssFieldValue(ip.nocturia)) || '—'],
        ['[P] Flow', cleanPrintText(normalizeIpssFieldValue(ip.poorFlow || ip.poorStream)) || '—'],
        ['[I] Intm', cleanPrintText(normalizeIpssFieldValue(ip.intermittency)) || '—'],
        ['[S] Strn', cleanPrintText(normalizeIpssFieldValue(ip.straining)) || '—'],
        ['[S] Evac', cleanPrintText(normalizeIpssFieldValue(ip.incompleteEvacuation)) || '—'],
      ];

      ipssCells.forEach(([code, val], idx) => {
        const cx = leftMargin + idx * cellW;
        if (idx > 0) {
          doc.setDrawColor(203, 213, 225);
          doc.line(cx, flatY, cx, flatY + barH);
        }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.6);
        doc.setTextColor(71, 85, 105);
        doc.text(code, cx + cellW / 2, flatY + 3.1, { align: 'center' });

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.6);
        doc.setTextColor(2, 6, 23);
        const fitVal = doc.splitTextToSize(val, cellW - 2)[0] || val;
        doc.text(fitVal, cx + cellW / 2, flatY + 6.9, { align: 'center' });
      });

      flatY += barH + 4;
    }

    if (checklistItems.length > 0) {
      const checklistFlatStr = checklistItems.map((ci) => `${ci.label}: ${ci.value}`).join('  |  ');
      const prefix = 'NEGATIVE / HISTORY: ';
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.2);
      const pw = doc.getTextWidth(prefix);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      const wrapped = doc.splitTextToSize(`${prefix}${checklistFlatStr}`, contentWidth - 1);
      wrapped.forEach((line: string, lIdx: number) => {
        if (lIdx === 0 && line.startsWith(prefix)) {
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(2, 6, 23);
          doc.text(prefix, leftMargin, flatY);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(30, 41, 59);
          doc.text(line.slice(prefix.length), leftMargin + pw, flatY);
        } else {
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(30, 41, 59);
          doc.text(line, leftMargin, flatY);
        }
        flatY += 3.8;
      });
      flatY += 2;
    }

    if (!opts.hideEmptySections || examLines.length > 0) {
      flatY = drawSectionHeader('EXAMINATION (O/E)', leftMargin, flatY);
      if (examLines.length > 0) {
        examLines.forEach((ex) => {
          const prefix = `${ex.label}: `;
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.5);
          const pw = doc.getTextWidth(prefix);
          doc.setFont('helvetica', 'normal');
          const wrapped = doc.splitTextToSize(`${prefix}${ex.value}`, contentWidth - 2);
          wrapped.forEach((line: string, lIdx: number) => {
            if (lIdx === 0 && line.startsWith(prefix)) {
              doc.setFont('helvetica', 'bold');
              doc.setTextColor(15, 23, 42);
              doc.text(prefix, leftMargin + 0.5, flatY);
              doc.setFont('helvetica', 'normal');
              doc.setTextColor(30, 41, 59);
              doc.text(line.slice(prefix.length), leftMargin + 0.5 + pw, flatY);
            } else {
              doc.setFont('helvetica', 'normal');
              doc.setTextColor(30, 41, 59);
              doc.text(line, leftMargin + 0.5, flatY);
            }
            flatY += 3.8;
          });
        });
      }
      flatY += 2;
    }

    if (opts.showInvestigations) {
      const invTable = buildDateWiseInvestigationTable(c, opts.allConsultations);
      let allowedDates = invTable.dates;
      if (opts.investigationsPrintMode === 'latest-only' && invTable.dates.length > 0) {
        const matchingConsultationDate = invTable.dates.find((d) => d.isoDate === c.date);
        allowedDates = [matchingConsultationDate || invTable.dates[invTable.dates.length - 1]];
      } else if (invTable.dates.length > MAX_PRINT_INVESTIGATION_DATES) {
        allowedDates = invTable.dates.slice(-MAX_PRINT_INVESTIGATION_DATES);
      }
      const allowedIsoSet = new Set(allowedDates.map((d) => d.isoDate));
      const labRows = invTable.labRows.filter((r) =>
        allowedDates.some((d) => Boolean(r.valuesByDate[d.isoDate]?.value))
      );
      const shownDates = allowedDates.filter((d) =>
        labRows.some((r) => Boolean(r.valuesByDate[d.isoDate]?.value))
      );
      const imgEntries = invTable.imagingTimeline.filter((img) => allowedIsoSet.has(img.isoDate));
      const hasTbl = (labRows.length > 0 && shownDates.length > 0) || imgEntries.length > 0;

      if (hasTbl || reportedInvestigations.length > 0) {
        flatY = drawSectionHeader('PREVIOUS INVESTIGATIONS (LAB TESTS & IMAGING)', leftMargin, flatY);
        if (hasTbl) {
          let trY = flatY - 2;
          if (labRows.length > 0 && shownDates.length > 0) {
            const pColW = 54;
            const dColW = (contentWidth - pColW) / shownDates.length;
            const thH = 4.6;
            doc.setFillColor(241, 245, 249);
            doc.setDrawColor(100, 116, 139);
            doc.rect(leftMargin, trY, contentWidth, thH, 'FD');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.2);
            doc.setTextColor(15, 23, 42);
            doc.text('Investigation', leftMargin + 2, trY + 3.2);
            shownDates.forEach((d, dIdx) => {
              const dx = leftMargin + pColW + dIdx * dColW;
              doc.line(dx, trY, dx, trY + thH);
              doc.text(d.displayDate || d.isoDate, dx + dColW / 2, trY + 3.2, { align: 'center' });
            });
            trY += thH;
            labRows.forEach((row) => {
              const rH = 4.5;
              doc.setDrawColor(148, 163, 184);
              doc.rect(leftMargin, trY, contentWidth, rH);
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(7.2);
              doc.setTextColor(15, 23, 42);
              doc.text(row.parameterName, leftMargin + 2, trY + 3.1);
              shownDates.forEach((d, dIdx) => {
                const dx = leftMargin + pColW + dIdx * dColW;
                doc.line(dx, trY, dx, trY + rH);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(7);
                doc.text(row.valuesByDate[d.isoDate]?.value || '—', dx + dColW / 2, trY + 3.1, {
                  align: 'center',
                });
              });
              trY += rH;
            });
          }
          if (imgEntries.length > 0) {
            imgEntries.forEach((imgEntry) => {
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(7);
              const bGroups = imgEntry.bullets.map((b) =>
                doc.splitTextToSize(`• ${b}`, contentWidth - 6)
              );
              const totalLines = bGroups.reduce((s, g) => s + g.length, 0);
              const boxH = 4.6 + totalLines * 3.2 + 1.5;
              doc.setFillColor(248, 250, 252);
              doc.setDrawColor(148, 163, 184);
              doc.rect(leftMargin, trY, contentWidth, boxH, 'FD');
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(7.2);
              doc.setTextColor(15, 23, 42);
              doc.text(`${imgEntry.studyName} — ${imgEntry.displayDate}`, leftMargin + 2, trY + 3.2);
              let by = trY + 6.6;
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(7);
              bGroups.forEach((lines) => {
                doc.text(lines, leftMargin + 3, by);
                by += lines.length * 3.2;
              });
              trY += boxH;
            });
          }
          flatY = trY + 3.5;
        } else {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          const lines = doc.splitTextToSize(reportedInvestigations.join('  •  '), contentWidth - 2);
          doc.text(lines, leftMargin + 0.5, flatY);
          flatY += lines.length * 3.9 + 2;
        }
      }
    }

    if (!opts.hideEmptySections || pastMedAndComorbidities.length > 0) {
      const prefix = 'PAST MEDICATION / COMORBIDITIES: ';
      const textVal = pastMedAndComorbidities.join('  •  ');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      const pw = doc.getTextWidth(prefix);
      doc.setFont('helvetica', 'normal');
      const wrapped = doc.splitTextToSize(`${prefix}${textVal}`, contentWidth - 1);
      wrapped.forEach((line: string, idx: number) => {
        if (idx === 0 && line.startsWith(prefix)) {
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(2, 6, 23);
          doc.text(prefix, leftMargin, flatY);
          doc.setFont('helvetica', 'normal');
          doc.text(line.slice(prefix.length), leftMargin + pw, flatY);
        } else {
          doc.text(line, leftMargin, flatY);
        }
        flatY += 3.9;
      });
      flatY += 1.5;
    }

    if (!opts.hideEmptySections || Boolean(deduplicatedDiagnosis)) {
      const prefix = 'DIAGNOSIS: ';
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.8);
      const pw = doc.getTextWidth(prefix);
      doc.setFontSize(9.5);
      doc.setTextColor(2, 6, 23);
      doc.text(prefix, leftMargin, flatY);
      if (deduplicatedDiagnosis) {
        const dLines = doc.splitTextToSize(`Δ ${deduplicatedDiagnosis}`, contentWidth - pw - 2);
        doc.text(dLines, leftMargin + pw, flatY);
        flatY += dLines.length * 4.2 + 1.5;
      } else {
        flatY += 5;
      }
    }

    if (!opts.hideEmptySections || toldInvestigations.length > 0) {
      const prefix = 'ADVISED INVESTIGATIONS: ';
      const valText = toldInvestigations.join('; ');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.6);
      const pw = doc.getTextWidth(prefix);
      const wrapped = doc.splitTextToSize(`${prefix}${valText}`, contentWidth - 1);
      wrapped.forEach((line: string, idx: number) => {
        if (idx === 0 && line.startsWith(prefix)) {
          doc.setTextColor(2, 6, 23);
          doc.text(prefix, leftMargin, flatY);
          doc.setTextColor(15, 23, 42);
          doc.text(line.slice(prefix.length), leftMargin + pw, flatY);
        } else {
          doc.text(line, leftMargin, flatY);
        }
        flatY += 3.9;
      });
      flatY += 2;
    }

    renderFullWidthRxAndAdvicePdf(flatY + 1);
  } else if (opts.printLayout === 'split') {
    // =====================================================================
    // SPLIT LAYOUT (DEFAULT): 2 columns on upper half + combined full-width Rx & Advice below
    // =====================================================================
    const upperBottomY = Math.max(leftY, rightY);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.line(dividerX, curY - 3, dividerX, upperBottomY);

    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.25);
    doc.line(leftMargin, upperBottomY + 1.5, leftMargin + contentWidth, upperBottomY + 1.5);

    renderFullWidthRxAndAdvicePdf(upperBottomY + 6.5);
  } else {
    // =====================================================================
    // COLUMN LAYOUT: Classic 2-column side-by-side (Rx + Plan in right col)
    // =====================================================================
    const rawPrescriptions = (c.prescriptions || []).filter((rx) =>
      hasText(rx.medicine || rx.drugName)
    );
    const seenMedKeys = new Set<string>();
    const prescriptions = rawPrescriptions.filter((rx) => {
      const medKey = `${cleanPrintText(rx.medicine || rx.drugName).toLowerCase()}|${cleanPrintText(
        rx.dosage || rx.dosageStrength
      ).toLowerCase()}`;
      if (seenMedKeys.has(medKey)) return false;
      seenMedKeys.add(medKey);
      return true;
    });

    if (prescriptions.length > 0 || hasText(c.prescriptionsSummaryText)) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(2, 6, 23);
      doc.text('MEDICATIONS (Rx)', rightColX, rightY);
      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.25);
      doc.line(rightColX, rightY + 1.2, rightColX + rightColW, rightY + 1.2);
      rightY += 5.2;

      if (prescriptions.length > 0) {
        prescriptions.forEach((rx, idx) => {
          const numStr = `${idx + 1}.`;
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(2, 6, 23);
          doc.text(numStr, rightColX, rightY);

          const itemLeftX = rightColX + 5.5;
          const itemW = rightColW - 5.5;

          const medAndDosage = [
            cleanPrintText(rx.medicine || rx.drugName),
            hasText(rx.dosage || rx.dosageStrength)
              ? cleanPrintText(rx.dosage || rx.dosageStrength)
              : '',
          ]
            .filter(Boolean)
            .join('  ');

          const freqAndDuration = [
            cleanPrintText(rx.frequency),
            hasText(rx.duration) ? `×  ${cleanPrintText(rx.duration)}` : '',
          ]
            .filter(Boolean)
            .join('  ');

          doc.setFont('courier', 'bold');
          doc.setFontSize(8.8);
          const freqW = freqAndDuration ? doc.getTextWidth(freqAndDuration) + 3 : 0;

          if (freqAndDuration) {
            doc.setTextColor(15, 23, 42);
            doc.text(freqAndDuration, rightColX + rightColW, rightY, { align: 'right' });
          }

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9.5);
          doc.setTextColor(2, 6, 23);
          const medMaxW = Math.max(itemW - freqW, 45);
          const medLines = doc.splitTextToSize(medAndDosage, medMaxW);
          doc.text(medLines, itemLeftX, rightY);
          rightY += medLines.length * 4;

          const subParts: string[] = [];
          if (hasText(rx.when || rx.timing)) {
            subParts.push(`• Timing: ${cleanPrintText(rx.when || rx.timing)}`);
          }
          if (hasText(rx.notes || rx.instructions)) {
            subParts.push(`• Note: ${cleanPrintText(rx.notes || rx.instructions)}`);
          }
          if (subParts.length > 0) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(51, 65, 85);
            const subLines = doc.splitTextToSize(subParts.join('    '), itemW);
            doc.text(subLines, itemLeftX, rightY);
            rightY += subLines.length * 3.6;
          }

          if (idx < prescriptions.length - 1) {
            doc.setDrawColor(226, 232, 240);
            doc.setLineWidth(0.2);
            doc.line(rightColX, rightY + 0.8, rightColX + rightColW, rightY + 0.8);
            rightY += 4.2;
          } else {
            rightY += 2.5;
          }
        });
      } else if (hasText(c.prescriptionsSummaryText)) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.8);
        doc.setTextColor(15, 23, 42);
        const sumLines = doc.splitTextToSize(
          splitIntoItems(c.prescriptionsSummaryText).join('\n'),
          rightColW - 2
        );
        doc.text(sumLines, rightColX + 1, rightY);
        rightY += sumLines.length * 4 + 3;
      }
    }

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
      } else if (
        item.length > planLines[dupIdx].length &&
        !planLines[dupIdx].startsWith('Next Visit') &&
        !planLines[dupIdx].startsWith('Diet & Exercise')
      ) {
        planSeenCores[dupIdx] = core;
        planLines[dupIdx] = item;
      }
    }

    if (!opts.hideEmptySections || planLines.length > 0) {
      rightY += 1.5;
      rightY = drawSectionHeader('PLAN', rightColX, rightY);
      if (planLines.length > 0) {
        rightY = drawWrappedBullets(planLines, rightColX, rightY, rightColW, true);
      }
    }

    const bodyBottomY = Math.max(leftY, rightY, 240);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.line(dividerX, curY - 3, dividerX, Math.min(bodyBottomY, 258));
  }

  // =========================================================================
  // 4. DOCTOR SIGN-OFF AT BOTTOM RIGHT (No CARE / NABH / Hospital Footer)
  // =========================================================================
  const footerTopY = 264;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.8);
  doc.setTextColor(30, 41, 59);
  const signDocName = opts.doctorName || c.doctorName || '';
  if (signDocName) {
    doc.text(signDocName, pageWidth - rightMargin - 2, footerTopY, { align: 'right' });
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  const signSpec = opts.doctorSuperSpec || opts.departmentTitle || 'Consultant Physician';
  doc.text(signSpec, pageWidth - rightMargin - 2, footerTopY + 3.8, { align: 'right' });
  if (opts.doctorRegNo) {
    doc.setFont('courier', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(`Reg. No: ${opts.doctorRegNo}`, pageWidth - rightMargin - 2, footerTopY + 7.2, {
      align: 'right',
    });
  }
}

function renderDetailedOtNotesPageToDoc(
  doc: jsPDF,
  c: Consultation,
  opts: Required<PdfExportOptions>
) {
  const pageWidth = 210;
  const leftMargin = 12;
  const rightMargin = 12;
  const contentWidth = pageWidth - leftMargin - rightMargin;
  const ot = c.otNotes || {};

  let curY = 12;
  const centerX = pageWidth / 2;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text((opts.departmentTitle || 'DEPT OF UROLOGY').toUpperCase(), centerX, curY, {
    align: 'center',
  });
  curY += 4.8;

  const headerDoctorName = (opts.doctorName || c.doctorName || '').toUpperCase();
  doc.setFontSize(11.5);
  doc.setTextColor(2, 6, 23);
  doc.text(headerDoctorName, centerX, curY, { align: 'center' });
  curY += 4;

  if (opts.doctorDegrees) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);
    doc.text(opts.doctorDegrees, centerX, curY, { align: 'center' });
    curY += 3.6;
  }

  if (opts.doctorSuperSpec) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(opts.doctorSuperSpec, centerX, curY, { align: 'center' });
    curY += 3.6;
  }

  if (opts.doctorRegNo) {
    doc.setFont('courier', 'bold');
    doc.setFontSize(8.2);
    doc.setTextColor(30, 41, 59);
    doc.text(opts.doctorRegNo, centerX, curY, { align: 'center' });
    curY += 3.6;
  }

  const dateRightX = pageWidth - rightMargin - 1;
  const dateLabelY = Math.max(curY - 1, 27);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  const formattedDate = formatIndianDate(ot.surgeryDate || c.date);
  doc.setFont('courier', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(2, 6, 23);
  const dateValueWidth = doc.getTextWidth(formattedDate);
  doc.text(formattedDate, dateRightX, dateLabelY, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.text('SURGERY DATE:', dateRightX - dateValueWidth - 2, dateLabelY, { align: 'right' });

  curY = Math.max(curY + 2, dateLabelY + 3);
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.35);
  doc.line(leftMargin, curY, pageWidth - rightMargin, curY);
  curY += 5.5;

  // Title Banner
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('OPERATION THEATRE (OT) / SURGICAL NOTES', centerX, curY, { align: 'center' });
  curY += 6;

  // Patient Row
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  const fullName = formatPatientFullName(c.salutation, c.patientName);
  const ageSex = [cleanPrintText(c.age), cleanPrintText(c.gender)].filter(Boolean).join(' / ') || '—';
  doc.text(`Pt Name: ${fullName}`, leftMargin + 1, curY);
  doc.text(`Age / Sex: ${ageSex}`, pageWidth - rightMargin - 1, curY, { align: 'right' });
  curY += 4.5;

  if (hasText(ot.hospitalName)) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.8);
    doc.setTextColor(51, 65, 85);
    doc.text(`Hospital / Surgical Centre: ${cleanPrintText(ot.hospitalName)}`, leftMargin + 1, curY);
    curY += 4.5;
  }

  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.25);
  doc.line(leftMargin, curY, pageWidth - rightMargin, curY);
  curY += 5;

  const drawOtBlock = (label: string, value?: string) => {
    const cleanVal = cleanPrintText(value);
    if (!cleanVal) return;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(label.toUpperCase(), leftMargin + 1, curY);
    curY += 4.2;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);
    const lines = doc.splitTextToSize(cleanVal, contentWidth - 4);
    doc.text(lines, leftMargin + 2, curY);
    curY += lines.length * 4.2 + 3.5;
  };

  drawOtBlock('Operation / Procedure Performed', ot.procedureName);
  drawOtBlock('Pre-Operative Diagnosis', ot.preOpDiagnosis || c.diagnosis);
  drawOtBlock('Post-Operative Diagnosis', ot.postOpDiagnosis);

  const teamParts = [
    hasText(ot.surgeonName) ? `Surgeon: ${cleanPrintText(ot.surgeonName)}` : '',
    hasText(ot.assistantName) ? `Assistant: ${cleanPrintText(ot.assistantName)}` : '',
    hasText(ot.anaesthetistName) ? `Anaesthetist: ${cleanPrintText(ot.anaesthetistName)}` : '',
    hasText(ot.anaesthesiaType) ? `Anaesthesia: ${cleanPrintText(ot.anaesthesiaType)}` : '',
    hasText(ot.patientPosition) ? `Position: ${cleanPrintText(ot.patientPosition)}` : '',
  ].filter(Boolean);
  if (teamParts.length > 0) {
    drawOtBlock('Operating Team, Anaesthesia & Position', teamParts.join('  |  '));
  }

  const drawOtLineList = (label: string, value?: string) => {
    const items = splitOperativeTextIntoLines(value);
    if (items.length === 0) return;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(label.toUpperCase(), leftMargin + 1, curY);
    curY += 4.2;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);
    for (const item of items) {
      const lines = doc.splitTextToSize(`• ${item}`, contentWidth - 4);
      doc.text(lines, leftMargin + 2, curY);
      curY += lines.length * 4.1 + 0.6;
    }
    curY += 2.8;
  };

  drawOtLineList('Intra-Operative Findings', ot.operativeFindings);
  drawOtLineList('Operative Steps / Procedure Notes', ot.operativeSteps);
  drawOtBlock('Catheter / DJ Stent / Drain Details', ot.catheterOrStentDetails || ot.drainDetails);
  drawOtBlock('Estimated Blood Loss & Complications', ot.estimatedBloodLoss || ot.intraOpComplications);
  drawOtBlock('Specimen Sent (HPE / Stone Analysis)', ot.specimenSent);
  drawOtBlock('Post-Operative Orders & Ward Instructions', ot.postOpOrders);
  drawOtBlock('Implants / Freelance Surgical Remarks', ot.freelanceNotes || ot.implantsOrConsumables);

  if (Array.isArray(ot.handDrawnDiagrams) && ot.handDrawnDiagrams.length > 0 && curY < 238) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text('HAND-DRAWN SURGICAL DIAGRAM / OPERATIVE SKETCH', leftMargin + 1, curY);
    curY += 2.5;

    const availH = Math.min(42, Math.max(18, 255 - curY));
    const boxW = Math.min(76, contentWidth / 2 - 4);
    ot.handDrawnDiagrams.slice(0, 1).forEach((diagUrl, idx) => {
      if (!diagUrl || !diagUrl.startsWith('data:image/')) return;
      const xPos = leftMargin + 2 + idx * (boxW + 6);
      try {
        const fmt = diagUrl.startsWith('data:image/webp')
          ? 'WEBP'
          : diagUrl.startsWith('data:image/png')
          ? 'PNG'
          : 'JPEG';
        doc.setDrawColor(148, 163, 184);
        doc.setLineWidth(0.25);
        doc.rect(xPos, curY, boxW, availH);
        doc.addImage(diagUrl, fmt, xPos + 1, curY + 1, boxW - 2, availH - 2);
      } catch {
        // Fallback if WebP decoding not supported in older jsPDF build
      }
    });
    curY += availH + 3;
  }

  const footerTopY = 264;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.8);
  doc.setTextColor(30, 41, 59);
  const signDocName = opts.doctorName || c.doctorName || '';
  if (signDocName) {
    doc.text(signDocName, pageWidth - rightMargin - 2, footerTopY, { align: 'right' });
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  const signSpec = opts.doctorSuperSpec || opts.departmentTitle || 'Consultant Urologist';
  doc.text(signSpec, pageWidth - rightMargin - 2, footerTopY + 3.8, { align: 'right' });
  if (opts.doctorRegNo) {
    doc.setFont('courier', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(`Reg. No: ${opts.doctorRegNo}`, pageWidth - rightMargin - 2, footerTopY + 7.2, {
      align: 'right',
    });
  }
}

export function exportOpdSheetsToPdf(
  consultationsToExport: Consultation[],
  options: PdfExportOptions = {}
) {
  if (!consultationsToExport || consultationsToExport.length === 0) return;

  const activeCreds = getActiveDoctorPrintCredentials();

  const mergedOpts: Required<PdfExportOptions> = {
    allConsultations: options.allConsultations ?? consultationsToExport,
    docType: options.docType ?? 'opd',
    isConsolidatedMode: options.isConsolidatedMode ?? consultationsToExport.length > 1,
    sortOrder: options.sortOrder ?? 'latest-first',
    departmentTitle: options.departmentTitle ?? activeCreds.departmentTitle,
    doctorName: options.doctorName ?? activeCreds.doctorName,
    doctorDegrees: options.doctorDegrees ?? activeCreds.doctorDegrees,
    doctorSuperSpec: options.doctorSuperSpec ?? activeCreds.doctorSuperSpec,
    doctorRegNo: options.doctorRegNo ?? activeCreds.doctorRegNo,
    preprintedStationery: options.preprintedStationery ?? true,
    ipssMode: options.ipssMode ?? 'auto',
    investigationsPrintMode: options.investigationsPrintMode ?? 'whole-table',
    printLayout: options.printLayout ?? 'split',
    showInvestigations: options.showInvestigations ?? true,
    showVitalsInCo: options.showVitalsInCo ?? true,
    showHistoryChecklist: options.showHistoryChecklist ?? true,
    hideEmptySections: options.hideEmptySections ?? true,
  };

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  if (mergedOpts.isConsolidatedMode && consultationsToExport.length >= 1) {
    const target = consultationsToExport[0];
    const entries =
      mergedOpts.docType === 'ot'
        ? getAllPatientOtProcedures(target, mergedOpts.allConsultations, mergedOpts.sortOrder)
        : getPatientConsolidatedTimelineEntries(
            target,
            mergedOpts.allConsultations,
            mergedOpts.sortOrder
          );

    if (entries.length > 0) {
      entries.forEach((entry, idx) => {
        if (idx > 0) {
          doc.addPage('a4', 'portrait');
        }
        if (entry.kind === 'ot' || mergedOpts.docType === 'ot') {
          renderDetailedOtNotesPageToDoc(doc, entry.consultation, mergedOpts);
        } else {
          renderSinglePageToDoc(doc, entry.consultation, idx, entries.length, mergedOpts);
        }
      });
    } else {
      consultationsToExport.forEach((c, idx) => {
        if (idx > 0) doc.addPage('a4', 'portrait');
        if (mergedOpts.docType === 'ot') {
          renderDetailedOtNotesPageToDoc(doc, c, mergedOpts);
        } else {
          renderSinglePageToDoc(doc, c, idx, consultationsToExport.length, mergedOpts);
        }
      });
    }
  } else {
    consultationsToExport.forEach((c, idx) => {
      if (idx > 0) {
        doc.addPage('a4', 'portrait');
      }
      if (mergedOpts.docType === 'ot') {
        renderDetailedOtNotesPageToDoc(doc, c, mergedOpts);
      } else {
        renderSinglePageToDoc(doc, c, idx, consultationsToExport.length, mergedOpts);
      }
    });
  }

  const primary = consultationsToExport[0];
  const safeName = (primary.patientName || 'Patient')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const safeDate = primary.date || new Date().toISOString().split('T')[0];

  const filename =
    mergedOpts.docType === 'ot'
      ? `OT_Notes_${safeName}_${primary.otNotes?.surgeryDate || safeDate}.pdf`
      : mergedOpts.isConsolidatedMode
      ? `Consolidated_OPD_And_OT_History_${safeName}.pdf`
      : `OPD_Case_Sheet_${safeName}_${safeDate}.pdf`;

  doc.save(filename);
}
