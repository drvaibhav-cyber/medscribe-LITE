import React, { useState, useMemo, useEffect } from 'react';
import {
  FileText,
  Edit3,
  Download,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  Plus,
  Calendar,
  Scissors,
  Building2,
  UserPlus,
  Stethoscope,
  Layers,
  Trash2,
  BedDouble,
} from 'lucide-react';
import { Consultation } from '../types/opd';
import { formatDisplayDate, getMonthInfo } from '../utils/excelExporter';
import { exportOpdSheetsToPdf } from '../utils/pdfExporter';
import {
  cleanExplicitOpdNo,
  sanitizeSalutationAndPatientName,
} from '../utils/investigationUtils';
import {
  getAllPatientOtProcedures,
  getPatientIdentityGroupingKey,
  hasOpdClinicalData,
  hasOtNotesData,
} from '../utils/otNotesUtils';

interface OtNotesQuickListViewProps {
  consultations: Consultation[];
  allConsultations: Consultation[];
  selectedYearKey: string;
  onSelectYearKey: (yearKey: string) => void;
  selectedMonthKey: string;
  onSelectMonthKey: (monthKey: string) => void;
  onOpenOtNotesPreview: (
    consultation: Consultation,
    mode?: 'single' | 'consolidated'
  ) => void;
  onEditOtNotes: (consultation: Consultation) => void;
  onDeleteConsultation?: (id: string) => void;
  onAdmitPatient?: (consultation: Consultation) => void;
  onAddNewOtPatient: () => void;
  onOpenConsultationsList: () => void;
  onOpenDetailedRegister?: () => void;
  onBackToDesk: () => void;
}

function formatCleanPatientDisplayName(c: Consultation): string {
  const { salutation, patientName } = sanitizeSalutationAndPatientName(
    c.salutation,
    c.patientName
  );
  const baseName = (patientName || c.patientName || 'Patient').trim();
  const cleanSal = (salutation || '').trim().replace(/\.+$/, '');
  if (!cleanSal) return baseName;
  return `${cleanSal}. ${baseName}`;
}

function formatAgeSexSuffix(c: Consultation): string {
  const rawAge = String(c.age || '')
    .trim()
    .replace(/\s*(yrs?|years?|y)$/i, '');
  const agePart = rawAge ? `${rawAge}Y` : '—';
  const sexPart = c.gender ? String(c.gender).trim().toUpperCase() : '—';
  return `${agePart}, ${sexPart}`;
}

export const OtNotesQuickListView: React.FC<OtNotesQuickListViewProps> = ({
  consultations,
  allConsultations,
  selectedYearKey,
  onSelectYearKey,
  selectedMonthKey,
  onSelectMonthKey,
  onOpenOtNotesPreview,
  onEditOtNotes,
  onDeleteConsultation,
  onAdmitPatient,
  onAddNewOtPatient,
  onOpenConsultationsList,
  onBackToDesk,
}) => {
  const [localSearch, setLocalSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedPatients, setExpandedPatients] = useState<Record<string, boolean>>({});
  const pageSize = 10;

  const togglePatientExpand = (patientKey: string) => {
    setExpandedPatients((prev) => ({
      ...prev,
      [patientKey]: !prev[patientKey],
    }));
  };

  const otRecordsCount = useMemo(() => {
    return consultations.filter((c) => hasOtNotesData(c)).length;
  }, [consultations]);

  const opdConsultationsCount = useMemo(() => {
    return consultations.filter((c) => hasOpdClinicalData(c) || !hasOtNotesData(c)).length;
  }, [consultations]);

  // Strictly show only patients who have OT notes on record, filtered by year/month and search query
  const filteredRows = useMemo(() => {
    const q = localSearch.trim().toLowerCase();
    const matching = consultations.filter((c) => {
      if (!hasOtNotesData(c)) {
        return false;
      }

      const effectiveDate = c.otNotes?.surgeryDate || c.date;
      const { year, monthKey } = getMonthInfo(effectiveDate);
      if (selectedYearKey !== 'ALL' && String(year) !== selectedYearKey) {
        return false;
      }
      if (
        selectedMonthKey !== 'ALL' &&
        selectedMonthKey !== 'PRESCRIPTIONS' &&
        monthKey !== selectedMonthKey
      ) {
        return false;
      }

      if (!q) return true;
      const nameStr = formatCleanPatientDisplayName(c).toLowerCase();
      const allProcs = getAllPatientOtProcedures(c, allConsultations, 'latest-first');
      const procStr = allProcs
        .map((p) => p.otNotes?.procedureName || '')
        .join(' ')
        .toLowerCase();
      const hospStr = (c.otNotes?.hospitalName || '').toLowerCase();
      const diagStr = (
        c.otNotes?.postOpDiagnosis ||
        c.otNotes?.preOpDiagnosis ||
        c.diagnosis ||
        ''
      ).toLowerCase();
      const findingsStr = (c.otNotes?.operativeFindings || '').toLowerCase();
      const opdStr = cleanExplicitOpdNo(c.opdNo).toLowerCase();
      const dateStr = formatDisplayDate(effectiveDate).toLowerCase();

      return (
        nameStr.includes(q) ||
        procStr.includes(q) ||
        hospStr.includes(q) ||
        diagStr.includes(q) ||
        findingsStr.includes(q) ||
        opdStr.includes(q) ||
        dateStr.includes(q) ||
        (effectiveDate || '').toLowerCase().includes(q)
      );
    });

    const sorted = [...matching].sort((a, b) => {
      const dateA = a.otNotes?.surgeryDate || a.date || '';
      const dateB = b.otNotes?.surgeryDate || b.date || '';
      const cmp = dateB.localeCompare(dateA);
      if (cmp !== 0) return cmp;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });

    return sorted;
  }, [consultations, allConsultations, selectedYearKey, selectedMonthKey, localSearch]);

  useEffect(() => {
    setCurrentPage(1);
  }, [localSearch, selectedYearKey, selectedMonthKey, consultations.length]);

  const totalItems = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endIndex = Math.min(safePage * pageSize, totalItems);

  const paginatedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, safePage, pageSize]);

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
      {/* Top Action & Navigation Header */}
      <div className="bg-gradient-to-r from-[#FFF7ED] via-[#F3EEFF] to-[#EDF6FF] rounded-2xl border border-[#FED7AA] p-4 sm:p-5 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onBackToDesk}
              className="px-3 py-1.5 rounded-xl bg-white/90 hover:bg-white text-violet-950 border border-[#C4B5FD] text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              title="Return to Privacy-Safe Clinical Desk"
            >
              <LayoutGrid className="w-3.5 h-3.5 text-violet-700" />
              <span>Clinical Desk</span>
            </button>

            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#FFEDD5] text-amber-950 border border-[#FDBA74] text-xs font-bold">
              <Scissors className="w-3.5 h-3.5 text-amber-800" />
              <span>OT Register ({otRecordsCount})</span>
            </span>

            <button
              type="button"
              onClick={onOpenConsultationsList}
              className="px-3 py-1 rounded-xl bg-white/85 hover:bg-white text-sky-950 border border-[#BAE6FD] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Stethoscope className="w-3.5 h-3.5 text-sky-700" />
              <span>OPD Consultations ({opdConsultationsCount})</span>
            </button>

            {(selectedYearKey !== 'ALL' || selectedMonthKey !== 'ALL') && (
              <button
                type="button"
                onClick={() => {
                  onSelectYearKey('ALL');
                  onSelectMonthKey('ALL');
                }}
                className="px-2.5 py-1 rounded-lg bg-white/80 hover:bg-white text-slate-700 border border-[#DFD8F0] text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
              >
                <span>
                  Filter: {selectedMonthKey !== 'ALL' ? selectedMonthKey : selectedYearKey}
                </span>
                <X className="w-3 h-3 text-slate-500" />
              </button>
            )}
          </div>

          <h1 className="text-lg sm:text-xl font-bold text-slate-900 pt-1">
            Operation Theatre (OT) &amp; Freelance Surgery Register
          </h1>
          <p className="text-xs text-slate-600">
            Click a <strong className="text-amber-950">Patient Name</strong> with multiple OT notes to expand/collapse all procedure dates &amp; procedure names. Click{' '}
            <strong className="text-slate-800">Open OT Notes</strong> to view current &amp; previous OT notes in A4 Print Preview.
          </p>
        </div>

        {/* Right Action Buttons: Add OT Notes & Export PDF */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onAddNewOtPatient}
            className="px-3.5 py-2.5 rounded-xl bg-[#FFEDD5] hover:bg-[#FED7AA] text-amber-950 border border-[#FDBA74] font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shadow-2xs"
            title="Open manual form directly on the OT Notes tab"
          >
            <Plus className="w-3.5 h-3.5 text-amber-800" />
            <span>+ Add OT Notes</span>
          </button>

          {filteredRows.length > 0 && (
            <button
              type="button"
              onClick={() =>
                exportOpdSheetsToPdf(filteredRows, {
                  allConsultations,
                  docType: 'ot',
                })
              }
              className="px-3.5 py-2.5 rounded-xl bg-white/95 hover:bg-white text-emerald-950 border border-[#6EE7B7] font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shadow-2xs"
              title="Export all OT sheets in current list as A4 PDF"
            >
              <Download className="w-3.5 h-3.5 text-emerald-700" />
              <span>Export PDF ({filteredRows.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* Main OT List Card */}
      <div className="bg-[#FDFBF9] rounded-2xl border border-[#E2DCF0] shadow-xs overflow-hidden">
        {/* Filter Bar + Mode Switcher + Pagination */}
        <div className="px-4 sm:px-6 py-3.5 bg-white border-b border-[#EAE4F4] flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 flex-1">
            {/* Operated Patients Header Pill */}
            <div className="inline-flex items-center px-3 py-1.5 rounded-xl bg-[#FFEDD5] text-amber-950 border border-[#FDBA74] text-xs font-bold shrink-0 shadow-2xs">
              Operated Patients ({otRecordsCount})
            </div>

            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-amber-700 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                placeholder="Search by patient name, procedure (e.g. TURP, URSL, PCNL), hospital, or date..."
                className="w-full pl-9 pr-8 py-2 text-xs bg-[#F7F9FC] focus:bg-white border border-[#DCE6F5] focus:border-amber-400 rounded-xl outline-none text-slate-900 placeholder:text-slate-400 transition-colors"
              />
              {localSearch && (
                <button
                  type="button"
                  onClick={() => setLocalSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-0.5 rounded"
                  title="Clear filter"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Pagination Indicator */}
          <div className="flex items-center justify-end gap-3 self-end md:self-auto">
            <span className="text-xs sm:text-sm font-bold text-slate-700 tabular-nums">
              {totalItems === 0 ? '0 of 0' : `${startIndex} - ${endIndex} of ${totalItems}`}
            </span>
            <div className="inline-flex items-center gap-1.5">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="w-8 h-8 rounded-lg border border-[#D5DCE6] bg-white hover:bg-[#F3F6FA] disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center text-slate-700 transition-colors cursor-pointer"
                title="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="w-8 h-8 rounded-lg border border-[#D5DCE6] bg-white hover:bg-[#F3F6FA] disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center text-slate-700 transition-colors cursor-pointer"
                title="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Tabular OT List */}
        {paginatedRows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#FFF7ED] border-b border-[#FED7AA] text-xs font-bold text-amber-950">
                  <th className="py-3.5 pl-5 pr-3 whitespace-nowrap">Date of Surgery</th>
                  <th className="py-3.5 px-3 whitespace-nowrap">Patient Name (Age / Sex)</th>
                  <th className="py-3.5 px-3">Procedure Done &amp; Anaesthesia</th>
                  <th className="py-3.5 px-3">Diagnosis / Hospital</th>
                  <th className="py-3.5 pl-3 pr-5 text-right whitespace-nowrap">
                    Detailed OT Notes / Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ECE8F4] text-xs sm:text-sm bg-white">
                {paginatedRows.map((c) => {
                  const displayName = formatCleanPatientDisplayName(c);
                  const ageSex = formatAgeSexSuffix(c);
                  const explicitOpd = cleanExplicitOpdNo(c.opdNo);
                  // Get all OT procedures for this patient across their record(s)
                  const patientOtEntries = getAllPatientOtProcedures(
                    c,
                    allConsultations,
                    'latest-first'
                  );
                  const hasMultipleOtProcedures = patientOtEntries.length >= 2;
                  const isExpanded = Boolean(expandedPatients[c.id]);

                  const hasOt = hasOtNotesData(c) || patientOtEntries.length > 0;
                  const ot = hasOtNotesData(c) ? c.otNotes || {} : patientOtEntries[0]?.otNotes || {};
                  const effectiveDate = ot.surgeryDate || c.date;
                  const formattedDate = formatDisplayDate(effectiveDate);
                  const procedureDone = (ot.procedureName || '').trim();
                  const diagText = (
                    ot.postOpDiagnosis ||
                    ot.preOpDiagnosis ||
                    c.diagnosis ||
                    ''
                  ).trim();
                  const hospitalName = (ot.hospitalName || '').trim();
                  const anaesthesia = (ot.anaesthesiaType || '').trim();
                  const stentOrCatheter = (ot.catheterOrStentDetails || '').trim();

                  return (
                    <tr
                      key={c.id}
                      className="hover:bg-[#FFFBF5] transition-colors group align-top"
                    >
                      {/* 1. Date of Surgery */}
                      <td className="py-4 pl-5 pr-3 align-top whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 text-slate-800 font-bold tabular-nums">
                          <Calendar className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                          <span>{formattedDate}</span>
                        </div>
                        {ot.surgeryTime && (
                          <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                            {ot.surgeryTime}
                          </div>
                        )}
                      </td>

                      {/* 2. Patient Name + Age/Sex + Clickable Collapsible Sub-List of OT Procedures */}
                      <td className="py-4 px-3 align-top">
                        {hasMultipleOtProcedures ? (
                          <div>
                            <button
                              type="button"
                              onClick={() => togglePatientExpand(c.id)}
                              className="text-left group/name inline-flex flex-wrap items-center gap-1.5 cursor-pointer focus:outline-none"
                              title="Click patient name to expand or collapse all recorded OT procedure dates & procedure names"
                            >
                              <span className="font-bold text-amber-950 group-hover/name:text-amber-700 group-hover/name:underline leading-snug">
                                {displayName}
                              </span>
                              <span className="text-slate-600 font-semibold">
                                ({ageSex})
                              </span>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#FEF3C7] text-amber-950 border border-[#FCD34D] text-[11px] font-extrabold">
                                <Layers className="w-3 h-3 text-amber-800" />
                                <span>{patientOtEntries.length} OT Procedures</span>
                                {isExpanded ? (
                                  <ChevronUp className="w-3.5 h-3.5 text-amber-900" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5 text-amber-900" />
                                )}
                              </span>
                            </button>

                            {explicitOpd && (
                              <div className="text-[11px] font-mono text-violet-700 mt-0.5">
                                UHID/OPD: {explicitOpd}
                              </div>
                            )}

                            {/* Collapsible Sub-List of Procedure Dates & Procedure Names */}
                            {isExpanded && (
                              <div className="mt-2.5 pl-3 border-l-2 border-[#FCD34D] space-y-1.5">
                                <div className="text-[10.5px] font-extrabold uppercase tracking-wider text-amber-900">
                                  Recorded OT Procedures (Click name again to collapse):
                                </div>
                                {patientOtEntries.map((entry, idx) => {
                                  const procDateStr = formatDisplayDate(entry.date);
                                  const procTitle =
                                    entry.otNotes?.procedureName ||
                                    entry.otNotes?.postOpDiagnosis ||
                                    `Procedure #${patientOtEntries.length - idx}`;
                                  return (
                                    <div
                                      key={entry.id}
                                      className="p-2 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] text-xs flex flex-wrap items-center justify-between gap-2"
                                    >
                                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                                        <span className="px-2 py-0.5 rounded-md bg-[#FEF3C7] text-amber-950 border border-[#FCD34D] text-[10.5px] font-extrabold inline-flex items-center gap-1 shrink-0">
                                          <Scissors className="w-3 h-3 text-amber-800" />
                                          <span>#{entry.chronologicalIndex}</span>
                                        </span>
                                        <span className="font-mono font-bold text-slate-900 tabular-nums shrink-0">
                                          {procDateStr}
                                        </span>
                                        <span className="font-bold text-amber-950 truncate max-w-[260px] sm:max-w-[340px]">
                                          — {procTitle}
                                        </span>
                                      </div>

                                      <div className="flex items-center gap-1.5 shrink-0">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            onOpenOtNotesPreview(entry.consultation, 'single')
                                          }
                                          className="px-2 py-0.5 rounded-lg bg-white hover:bg-[#FEF3C7] text-amber-950 border border-[#FCD34D] text-[11px] font-bold cursor-pointer"
                                          title="Open this specific procedure’s OT Notes sheet"
                                        >
                                          Preview
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => onEditOtNotes(entry.consultation)}
                                          className="px-2 py-0.5 rounded-lg bg-white/90 hover:bg-[#EDE9FE] text-violet-900 border border-[#DDD6FE] text-[11px] font-bold cursor-pointer"
                                          title="Edit this OT procedure"
                                        >
                                          Edit
                                        </button>
                                        {onDeleteConsultation && (
                                          <button
                                            type="button"
                                            onClick={() => onDeleteConsultation(entry.consultation.id)}
                                            className="px-2 py-0.5 rounded-lg bg-white/90 hover:bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-bold cursor-pointer"
                                            title="Delete this OT procedure"
                                          >
                                            Delete
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div>
                            <div className="font-bold text-slate-900 leading-snug">
                              {displayName}
                              <span className="text-slate-600 font-semibold ml-1">
                                ({ageSex})
                              </span>
                            </div>
                            {explicitOpd && (
                              <div className="text-[11px] font-mono text-violet-700 mt-0.5">
                                UHID/OPD: {explicitOpd}
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* 3. Procedure Done & Anaesthesia */}
                      <td className="py-4 px-3 align-top max-w-xs sm:max-w-md">
                        {procedureDone ? (
                          <div className="space-y-1">
                            <div className="font-bold text-amber-950 leading-snug">
                              {procedureDone}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                              {anaesthesia && (
                                <span className="px-2 py-0.5 rounded-md bg-[#F3EEFF] text-violet-900 border border-[#DDD6FE] font-semibold">
                                  {anaesthesia}
                                </span>
                              )}
                              {stentOrCatheter && (
                                <span className="px-2 py-0.5 rounded-md bg-[#E0F2FE] text-sky-900 border border-[#BAE6FD] font-medium truncate max-w-[230px]">
                                  {stentOrCatheter}
                                </span>
                              )}
                            </div>
                          </div>
                        ) : hasOt ? (
                          <span className="text-amber-900 font-medium italic">
                            Operative Findings Recorded
                          </span>
                        ) : (
                          <span className="text-slate-400 italic text-xs">
                            No OT procedure logged yet
                          </span>
                        )}
                      </td>

                      {/* 4. Diagnosis & Freelance Hospital/Centre */}
                      <td className="py-4 px-3 align-top max-w-xs">
                        {diagText ? (
                          <div className="font-semibold text-slate-800 line-clamp-2">
                            {diagText}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                        {hospitalName && (
                          <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-900 bg-[#ECFDF5] border border-[#A7F3D0] px-2 py-0.5 rounded-md mt-1">
                            <Building2 className="w-3 h-3 text-emerald-700 shrink-0" />
                            <span className="truncate max-w-[200px]">{hospitalName}</span>
                          </div>
                        )}
                      </td>

                      {/* 5. Actions: Open Detailed OT Notes (includes previous OT notes when >= 2), Edit OT Notes, Export PDF */}
                      <td className="py-4 pl-3 pr-5 align-top text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-2">
                          {hasOt ? (
                            <button
                              type="button"
                              onClick={() =>
                                onOpenOtNotesPreview(
                                  c,
                                  hasMultipleOtProcedures ? 'consolidated' : 'single'
                                )
                              }
                              className="px-3.5 py-1.5 rounded-lg bg-[#FFF7ED] hover:bg-[#FFEDD5] text-amber-950 border border-[#FDBA74] font-bold text-xs shadow-2xs transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                              title={
                                hasMultipleOtProcedures
                                  ? `Open chronological Print Preview of all ${patientOtEntries.length} OT Notes for this patient`
                                  : 'Open Detailed OT Notes & A4 Print Preview'
                              }
                            >
                              <FileText className="w-3.5 h-3.5 text-amber-800" />
                              <span>
                                Open OT Notes
                                {hasMultipleOtProcedures ? ` (${patientOtEntries.length})` : ''}
                              </span>
                            </button>
                          ) : null}

                          <button
                            type="button"
                            onClick={() => onEditOtNotes(c)}
                            className="px-3 py-1.5 rounded-lg bg-[#F5F3FF] hover:bg-[#EDE9FE] text-violet-950 border border-[#DDD6FE] font-semibold text-xs transition-colors inline-flex items-center gap-1 cursor-pointer"
                            title={
                              hasOt
                                ? 'Edit OT Notes or add a new procedure to this patient'
                                : 'Add OT Notes to this existing OPD patient'
                            }
                          >
                            <Edit3 className="w-3.5 h-3.5 text-violet-700" />
                            <span>{hasOt ? 'Edit / + Proc' : '+ Add OT Notes'}</span>
                          </button>

                          {hasOt && (
                            <button
                              type="button"
                              onClick={() =>
                                exportOpdSheetsToPdf(
                                  hasMultipleOtProcedures
                                    ? patientOtEntries.map((e) => e.consultation)
                                    : [c],
                                  {
                                    allConsultations,
                                    docType: 'ot',
                                    isConsolidatedMode: hasMultipleOtProcedures,
                                  }
                                )
                              }
                              className="px-3 py-1.5 rounded-lg bg-[#ECFDF5] hover:bg-[#D1FAE5] text-emerald-950 border border-[#A7F3D0] font-semibold text-xs transition-colors inline-flex items-center gap-1 cursor-pointer"
                              title="Download A4 PDF with OT Notes"
                            >
                              <Download className="w-3.5 h-3.5 text-emerald-700" />
                              <span>Export PDF</span>
                            </button>
                          )}

                          {onAdmitPatient && (
                            <button
                              type="button"
                              onClick={() => onAdmitPatient(c)}
                              className="px-3 py-1.5 rounded-lg bg-teal-50 hover:bg-teal-700 text-teal-900 hover:text-white border border-teal-300 font-semibold text-xs transition-colors inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                              title="Admit patient and send OT + patient data handoff to UroWard IPD"
                            >
                              <BedDouble className="w-3.5 h-3.5" />
                              <span>Admit</span>
                            </button>
                          )}

                          {onDeleteConsultation && (
                            <button
                              type="button"
                              onClick={() => onDeleteConsultation(c.id)}
                              className="px-2.5 py-1.5 rounded-lg bg-rose-50/80 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold text-xs transition-colors inline-flex items-center gap-1 cursor-pointer"
                              title="Delete OT record"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                              <span>Delete</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-10 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[#FFF7ED] border border-[#FED7AA] text-amber-800 flex items-center justify-center mx-auto">
              <Scissors className="w-6 h-6" />
            </div>
            <div className="text-sm font-bold text-slate-900">
              {localSearch.trim() ? 'No matching OT records found' : 'No OT Notes recorded yet'}
            </div>
            <p className="text-xs text-slate-600 max-w-lg mx-auto">
              {localSearch.trim()
                ? 'Try clearing the search filter or add a new OT note.'
                : 'Add operative notes for a freelance surgery or an OPD patient using + Add OT Notes.'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={onAddNewOtPatient}
                className="px-4 py-2 rounded-xl bg-[#FFEDD5] hover:bg-[#FED7AA] text-amber-950 border border-[#FDBA74] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5 text-amber-800" />
                <span>+ New Patient OT Notes</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
