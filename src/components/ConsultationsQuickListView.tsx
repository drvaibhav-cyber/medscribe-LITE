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
  Eye,
  LayoutGrid,
  Plus,
  Calendar,
  Stethoscope,
  Scissors,
  Layers,
  Trash2,
  BedDouble,
  Printer,
} from 'lucide-react';
import { Consultation } from '../types/opd';
import { IpdPatientRecord } from '../types/ipd';
import { formatDisplayDate, getMonthInfo } from '../utils/excelExporter';
import { exportOpdSheetsToPdf } from '../utils/pdfExporter';
import {
  cleanExplicitOpdNo,
  sanitizeSalutationAndPatientName,
} from '../utils/investigationUtils';
import {
  getPatientConsolidatedTimelineEntries,
  hasOpdClinicalData,
  hasOtNotesData,
} from '../utils/otNotesUtils';
import { findMatchingIpdRecordsForPatient } from '../utils/ipdClinicalSync';

interface ConsultationsQuickListViewProps {
  consultations: Consultation[];
  allConsultations: Consultation[];
  ipdPatients?: IpdPatientRecord[];
  selectedYearKey: string;
  onSelectYearKey: (yearKey: string) => void;
  selectedMonthKey: string;
  onSelectMonthKey: (monthKey: string) => void;
  onOpenNotes: (
    consultation: Consultation,
    mode?: 'single' | 'consolidated',
    docType?: 'opd' | 'ot'
  ) => void;
  onEditConsultation: (consultation: Consultation, initialTab?: 'patient' | 'ot') => void;
  onDeleteConsultation?: (id: string) => void;
  onAdmitPatient?: (consultation: Consultation) => void;
  onOpenIpdChart?: (patient: IpdPatientRecord) => void;
  onPrintDischargeSummary?: (patient: IpdPatientRecord) => void;
  onExportDischargePdf?: (patient: IpdPatientRecord) => void;
  onOpenDetailedRegister: () => void;
  onBackToDesk: () => void;
  onAddNewConsultation: () => void;
}

function formatCleanPatientDisplayName(c: Consultation): string {
  const { salutation, patientName } = sanitizeSalutationAndPatientName(
    c.salutation,
    c.patientName
  );
  const baseName = (patientName || c.patientName || 'OPD Patient').trim();
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

export const ConsultationsQuickListView: React.FC<ConsultationsQuickListViewProps> = ({
  consultations,
  allConsultations,
  ipdPatients = [],
  selectedYearKey,
  onSelectYearKey,
  selectedMonthKey,
  onSelectMonthKey,
  onOpenNotes,
  onEditConsultation,
  onDeleteConsultation,
  onAdmitPatient,
  onOpenIpdChart,
  onPrintDischargeSummary,
  onExportDischargePdf,
  onOpenDetailedRegister,
  onBackToDesk,
  onAddNewConsultation,
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

  // Filter to show only OPD consultations (excluding standalone OT-only entries) and sort newest visit first
  const filteredRows = useMemo(() => {
    const q = localSearch.trim().toLowerCase();
    const matching = consultations.filter((c) => {
      // Consultations list shows only OPD consultations; standalone OT-only entries belong in OT Notes & Master Chart
      if (!hasOpdClinicalData(c) && hasOtNotesData(c)) {
        return false;
      }

      const { year, monthKey } = getMonthInfo(c.date);
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
      const diagStr = (c.diagnosis || '').toLowerCase();
      const procStr = (c.otNotes?.procedureName || '').toLowerCase();
      const phoneStr = (c.phoneNumber || c.contactNumber || '').toLowerCase();
      const opdStr = cleanExplicitOpdNo(c.opdNo).toLowerCase();
      const dateStr = formatDisplayDate(c.date).toLowerCase();
      return (
        nameStr.includes(q) ||
        diagStr.includes(q) ||
        procStr.includes(q) ||
        phoneStr.includes(q) ||
        opdStr.includes(q) ||
        dateStr.includes(q) ||
        (c.date || '').toLowerCase().includes(q)
      );
    });

    const sorted = [...matching].sort((a, b) => {
      const cmp = (b.date || '').localeCompare(a.date || '');
      if (cmp !== 0) return cmp;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });

    return sorted;
  }, [consultations, selectedYearKey, selectedMonthKey, localSearch]);

  // Reset to page 1 when filters change
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
      <div className="bg-gradient-to-r from-[#F3EEFF] via-[#EDF6FF] to-[#EBFBF3] rounded-2xl border border-[#DDD6FE] p-4 sm:p-5 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
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

            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#E0F2FE] text-sky-950 border border-[#7DD3FC] text-xs font-bold">
              <Stethoscope className="w-3.5 h-3.5 text-sky-800" />
              <span>Consultations ({totalItems})</span>
            </span>

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
            Patient Consultations — Quick Clinical List
          </h1>
          <p className="text-xs text-slate-600">
            Click a <strong className="text-violet-900">Patient Name</strong> with previous visits or OT records to expand/collapse their date-wise history. Click{' '}
            <strong className="text-slate-800">Open Notes</strong> for chronological A4 Print Preview of OPD &amp; OT notes.
          </p>
        </div>

        {/* Right Action Buttons: New Entry, Export All PDF, Open Detailed Register */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onAddNewConsultation}
            className="px-3.5 py-2.5 rounded-xl bg-[#D1FAE5] hover:bg-[#A7F3D0] text-emerald-950 border border-[#6EE7B7] font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5 text-emerald-800" />
            <span>New Patient</span>
          </button>

          {filteredRows.length > 0 && (
            <button
              type="button"
              onClick={() =>
                exportOpdSheetsToPdf(filteredRows, {
                  allConsultations,
                })
              }
              className="px-3.5 py-2.5 rounded-xl bg-white/95 hover:bg-white text-sky-950 border border-[#7DD3FC] font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shadow-2xs"
              title="Export all consultations in current list as A4 PDF"
            >
              <Download className="w-3.5 h-3.5 text-sky-700" />
              <span>Export List PDF ({filteredRows.length})</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenDetailedRegister}
            className="px-4 py-2.5 rounded-xl bg-[#DDD6FE] hover:bg-[#C4B5FD] text-violet-950 border border-[#C4B5FD] font-bold text-xs flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shadow-2xs"
            title="Open the full multi-column detailed Excel Patient Register"
          >
            <Eye className="w-3.5 h-3.5 text-violet-800" />
            <span>Open Detailed Register</span>
          </button>
        </div>
      </div>

      {/* Main Quick List Card */}
      <div className="bg-[#FDFBF9] rounded-2xl border border-[#E2DCF0] shadow-xs overflow-hidden">
        {/* Filter & Top-Right Pagination Bar */}
        <div className="px-4 sm:px-6 py-3.5 bg-white border-b border-[#EAE4F4] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Quick Filter Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-sky-600 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="Filter patients by name, diagnosis, procedure, or date..."
              className="w-full pl-9 pr-8 py-2 text-xs bg-[#F7F9FC] focus:bg-white border border-[#DCE6F5] focus:border-sky-400 rounded-xl outline-none text-slate-900 placeholder:text-slate-400 transition-colors"
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

          {/* Pagination Indicator & Prev/Next Buttons */}
          <div className="flex items-center justify-end gap-3 self-end sm:self-auto">
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

        {/* Clean Tabular List */}
        {paginatedRows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#EEF5FC] border-b border-[#DCE7F5] text-xs font-bold text-[#1D63DC]">
                  <th className="py-3.5 pl-5 pr-3 whitespace-nowrap">Patient name</th>
                  <th className="py-3.5 px-3 whitespace-nowrap">Date of visit</th>
                  <th className="py-3.5 px-3 whitespace-nowrap">Age / Sex</th>
                  <th className="py-3.5 px-3">Diagnosis</th>
                  <th className="py-3.5 pl-3 pr-5 text-right whitespace-nowrap">View / Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ECE8F4] text-xs sm:text-sm bg-white">
                {paginatedRows.map((c) => {
                  const displayName = formatCleanPatientDisplayName(c);
                  const ageSex = formatAgeSexSuffix(c);
                  const explicitOpd = cleanExplicitOpdNo(c.opdNo);
                  const formattedVisitDate = formatDisplayDate(c.date);
                  const diagnosisText = (c.diagnosis || '').trim();
                  const fallbackComplaints = (c.complaints || c.chiefComplaints || '').trim();

                  const timelineEntries = getPatientConsolidatedTimelineEntries(
                    c,
                    allConsultations,
                    'latest-first'
                  );
                  const matchingIpdRecords = findMatchingIpdRecordsForPatient(c, ipdPatients);
                  const opdCount = timelineEntries.filter((e) => e.kind === 'opd').length;
                  const otCount = timelineEntries.filter((e) => e.kind === 'ot').length;
                  const ipdCount = matchingIpdRecords.length;
                  const totalHistoryEntries = timelineEntries.length + ipdCount;
                  const hasPreviousOrOtRecords =
                    timelineEntries.length > 1 ||
                    otCount > 0 ||
                    ipdCount > 0 ||
                    hasOtNotesData(c);
                  const isExpanded = Boolean(expandedPatients[c.id]);

                  return (
                    <tr
                      key={c.id}
                      className="hover:bg-[#F8FAFF] transition-colors group align-top"
                    >
                      {/* 1. Patient Name with (AgeY, Sex) + Clickable Collapsible Sub-List of Dates (OPD, IPD & OT) */}
                      <td className="py-4 pl-5 pr-3 align-top">
                        {hasPreviousOrOtRecords ? (
                          <div>
                            <button
                              type="button"
                              onClick={() => togglePatientExpand(c.id)}
                              className="text-left group/name inline-flex flex-wrap items-center gap-1.5 cursor-pointer focus:outline-none"
                              title="Click patient name to expand or collapse OPD, IPD & OT history"
                            >
                              <span className="font-bold text-[#2B3A67] group-hover/name:text-[#1D63DC] group-hover/name:underline leading-snug">
                                {displayName}
                              </span>
                              <span className="text-slate-700 font-semibold">
                                ({ageSex})
                              </span>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#EDE9FE] text-[#4C1D95] border border-[#C4B5FD] text-[11px] font-bold">
                                <Layers className="w-3 h-3 text-[#6D28D9]" />
                                <span>
                                  {opdCount} OPD
                                  {otCount > 0 ? ` • ${otCount} OT` : ''}
                                  {ipdCount > 0 ? ` • ${ipdCount} IPD` : ''}
                                </span>
                                {isExpanded ? (
                                  <ChevronUp className="w-3.5 h-3.5 text-[#5B21B6]" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5 text-[#5B21B6]" />
                                )}
                              </span>
                            </button>

                            {explicitOpd && (
                              <div className="text-[11px] font-mono text-violet-700 mt-0.5">
                                UHID/OPD: {explicitOpd}
                              </div>
                            )}

                            {/* Collapsible Sub-List of Previous OPD, IPD & OT Dates */}
                            {isExpanded && (
                              <div className="mt-2.5 pl-3 border-l-2 border-[#C4B5FD] space-y-1.5">
                                <div className="text-[10.5px] font-extrabold uppercase tracking-wider text-[#5B4D9D]">
                                  Chronological OPD, IPD &amp; OT History (Click name again to collapse):
                                </div>
                                {/* IPD Admission & Discharge Entries */}
                                {matchingIpdRecords.map((ipdRec) => {
                                  const admDateStr = formatDisplayDate(ipdRec.admissionDate);
                                  const dischRaw =
                                    ipdRec.dischargeDate ||
                                    ipdRec.dischargeSummary?.dischargeDate ||
                                    '';
                                  const dischDateStr = dischRaw ? formatDisplayDate(dischRaw) : '';
                                  const hasSummary =
                                    Boolean(ipdRec.dischargeSummary) ||
                                    ipdRec.status === 'discharged';
                                  const ipdDiag =
                                    ipdRec.dischargeSummary?.finalDiagnosis ||
                                    ipdRec.admittingDiagnosis ||
                                    'In-Patient Admission';

                                  return (
                                    <div
                                      key={`ipd-${ipdRec.id}`}
                                      className="p-2 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-2 bg-teal-50/75 border-teal-200 text-teal-950"
                                    >
                                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                                        <span className="px-2 py-0.5 rounded-md text-[10.5px] font-extrabold inline-flex items-center gap-1 shrink-0 bg-teal-100 text-teal-950 border border-teal-300">
                                          <BedDouble className="w-3 h-3 text-teal-800" />
                                          <span>
                                            IPD ({ipdRec.status === 'admitted' ? 'Admitted' : 'Discharged'})
                                          </span>
                                        </span>
                                        <span className="font-mono font-bold text-slate-900 tabular-nums shrink-0">
                                          Adm: {admDateStr}
                                          {dischDateStr ? ` → Disch: ${dischDateStr}` : ''}
                                        </span>
                                        <span className="text-slate-700 font-semibold truncate max-w-[220px] sm:max-w-[300px]">
                                          — {ipdDiag}
                                          {ipdRec.wardOrBed ? ` (${ipdRec.wardOrBed})` : ''}
                                        </span>
                                      </div>

                                      <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                                        {onOpenIpdChart && (
                                          <button
                                            type="button"
                                            onClick={() => onOpenIpdChart(ipdRec)}
                                            className="px-2 py-0.5 rounded-lg bg-white hover:bg-teal-100 text-teal-900 border border-teal-300 text-[11px] font-bold cursor-pointer"
                                            title="Open this patient's IPD ward chart"
                                          >
                                            IPD Chart
                                          </button>
                                        )}
                                        {onPrintDischargeSummary && (
                                          <button
                                            type="button"
                                            onClick={() => onPrintDischargeSummary(ipdRec)}
                                            className="px-2 py-0.5 rounded-lg bg-[#EDE9FE] hover:bg-[#DDD6FE] text-violet-950 border border-[#C4B5FD] text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                                            title="Review & Print A4 Discharge Summary"
                                          >
                                            <Printer className="w-3 h-3 text-violet-800" />
                                            <span>
                                              {hasSummary ? 'Print Discharge' : 'Discharge Summary'}
                                            </span>
                                          </button>
                                        )}
                                        {onExportDischargePdf && hasSummary && (
                                          <button
                                            type="button"
                                            onClick={() => onExportDischargePdf(ipdRec)}
                                            className="px-2 py-0.5 rounded-lg bg-white hover:bg-sky-50 text-sky-800 border border-sky-200 text-[11px] font-bold cursor-pointer"
                                            title="Download Discharge Summary PDF"
                                          >
                                            PDF
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}

                                {/* OPD & OT Entries */}
                                {timelineEntries.map((entry) => {
                                  const entryDateStr = formatDisplayDate(entry.date);
                                  const isOtEntry = entry.kind === 'ot';
                                  const summaryText = isOtEntry
                                    ? entry.otNotes?.procedureName ||
                                      entry.otNotes?.postOpDiagnosis ||
                                      'Operative Notes'
                                    : entry.consultation.diagnosis ||
                                      entry.consultation.complaints ||
                                      'OPD Consultation';

                                  return (
                                    <div
                                      key={entry.id}
                                      className={`p-2 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-2 ${
                                        isOtEntry
                                          ? 'bg-[#FFFBEB] border-[#FDE68A] text-amber-950'
                                          : 'bg-[#F5F8FF] border-[#D8E5FA] text-slate-800'
                                      }`}
                                    >
                                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                                        <span
                                          className={`px-2 py-0.5 rounded-md text-[10.5px] font-extrabold inline-flex items-center gap-1 shrink-0 ${
                                            isOtEntry
                                              ? 'bg-[#FEF3C7] text-amber-950 border border-[#FCD34D]'
                                              : 'bg-[#E0F2FE] text-sky-950 border border-[#BAE6FD]'
                                          }`}
                                        >
                                          {isOtEntry ? (
                                            <>
                                              <Scissors className="w-3 h-3 text-amber-800" />
                                              <span>OT</span>
                                            </>
                                          ) : (
                                            <>
                                              <Stethoscope className="w-3 h-3 text-sky-800" />
                                              <span>OPD</span>
                                            </>
                                          )}
                                        </span>
                                        <span className="font-mono font-bold text-slate-900 tabular-nums shrink-0">
                                          {entryDateStr}
                                        </span>
                                        <span className="text-slate-700 font-semibold truncate max-w-[240px] sm:max-w-[320px]">
                                          — {summaryText}
                                        </span>
                                      </div>

                                      <div className="flex items-center gap-1.5 shrink-0">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            onOpenNotes(
                                              entry.consultation,
                                              'single',
                                              isOtEntry ? 'ot' : 'opd'
                                            )
                                          }
                                          className="px-2 py-0.5 rounded-lg bg-white hover:bg-[#EEF5FC] text-slate-800 border border-[#CBD5E1] text-[11px] font-bold cursor-pointer"
                                          title={
                                            isOtEntry
                                              ? 'Open this date’s Detailed OT Notes sheet'
                                              : 'Open this date’s OPD Case Sheet'
                                          }
                                        >
                                          Preview
                                        </button>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              onEditConsultation(
                                                entry.consultation,
                                                isOtEntry ? 'ot' : 'patient'
                                              )
                                            }
                                            className="px-2 py-0.5 rounded-lg bg-white/90 hover:bg-[#EDE9FE] text-violet-900 border border-[#DDD6FE] text-[11px] font-bold cursor-pointer"
                                            title="Edit this record"
                                          >
                                            Edit
                                          </button>
                                          {onDeleteConsultation && (
                                            <button
                                              type="button"
                                              onClick={() => onDeleteConsultation(entry.consultation.id)}
                                              className="px-2 py-0.5 rounded-lg bg-white/90 hover:bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-bold cursor-pointer"
                                              title="Delete this record"
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
                              <span className="text-slate-700 font-semibold ml-1">
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

                      {/* 2. Date of Visit */}
                      <td className="py-4 px-3 align-top whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 text-slate-700 font-medium tabular-nums">
                          <Calendar className="w-3.5 h-3.5 text-sky-700 shrink-0" />
                          <span>{formattedVisitDate}</span>
                        </span>
                      </td>

                      {/* 3. Age / Sex */}
                      <td className="py-4 px-3 align-top whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-[#F4F1FA] text-violet-950 border border-[#E3DDF2] text-xs font-bold tabular-nums">
                          {ageSex}
                        </span>
                      </td>

                      {/* 4. Diagnosis */}
                      <td className="py-4 px-3 align-top max-w-xs sm:max-w-md">
                        {diagnosisText ? (
                          <span className="font-semibold text-slate-900 line-clamp-2">
                            {diagnosisText}
                          </span>
                        ) : fallbackComplaints ? (
                          <span className="text-slate-600 italic line-clamp-1">
                            {fallbackComplaints}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* 5. View / Actions: Open Notes (Chronological Print Preview of OPD & OT Notes) + Edit + Export PDF */}
                      <td className="py-4 pl-3 pr-5 align-top text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-2">
                          {/* Open Notes (opens A4 Print Preview — automatically shows chronological OPD & OT notes when available) */}
                          <button
                            type="button"
                            onClick={() =>
                              onOpenNotes(
                                c,
                                hasPreviousOrOtRecords ? 'consolidated' : 'single',
                                'opd'
                              )
                            }
                            className="px-3.5 py-1.5 rounded-lg bg-white hover:bg-[#EEF5FC] text-slate-800 hover:text-[#1D63DC] border border-[#CBD5E1] hover:border-[#93C5FD] font-semibold text-xs shadow-2xs transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                            title={
                              hasPreviousOrOtRecords
                                ? `Open chronological Print Preview of all ${totalHistoryEntries} OPD, IPD & OT records for this patient`
                                : 'Open A4 Print Preview & Clinical Notes Pad'
                            }
                          >
                            <FileText className="w-3.5 h-3.5 text-[#1D63DC]" />
                            <span>
                              Open Notes
                              {hasPreviousOrOtRecords ? ` (${totalHistoryEntries})` : ''}
                            </span>
                          </button>

                          {/* Edit button */}
                          <button
                            type="button"
                            onClick={() => onEditConsultation(c, 'patient')}
                            className="px-3 py-1.5 rounded-lg bg-[#F5F3FF] hover:bg-[#EDE9FE] text-violet-950 border border-[#DDD6FE] font-semibold text-xs transition-colors inline-flex items-center gap-1 cursor-pointer"
                            title="Edit patient consultation record"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-violet-700" />
                            <span>Edit</span>
                          </button>

                          {/* Export PDF button */}
                          <button
                            type="button"
                            onClick={() =>
                              exportOpdSheetsToPdf([c], {
                                allConsultations,
                                isConsolidatedMode: hasPreviousOrOtRecords,
                              })
                            }
                            className="px-3 py-1.5 rounded-lg bg-[#ECFDF5] hover:bg-[#D1FAE5] text-emerald-950 border border-[#A7F3D0] font-semibold text-xs transition-colors inline-flex items-center gap-1 cursor-pointer"
                            title="Download A4 Case Sheet PDF for this patient"
                          >
                            <Download className="w-3.5 h-3.5 text-emerald-700" />
                            <span>Export PDF</span>
                          </button>

                          {/* Admit to UroWard IPD button */}
                          {onAdmitPatient && (
                            <button
                              type="button"
                              onClick={() => onAdmitPatient(c)}
                              className="px-3 py-1.5 rounded-lg bg-teal-50 hover:bg-teal-700 text-teal-900 hover:text-white border border-teal-300 font-semibold text-xs transition-colors inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                              title="Admit patient and send data handoff to UroWard IPD"
                            >
                              <BedDouble className="w-3.5 h-3.5" />
                              <span>Admit</span>
                            </button>
                          )}

                          {/* Delete button */}
                          {onDeleteConsultation && (
                            <button
                              type="button"
                              onClick={() => onDeleteConsultation(c.id)}
                              className="px-2.5 py-1.5 rounded-lg bg-rose-50/80 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold text-xs transition-colors inline-flex items-center gap-1 cursor-pointer"
                              title="Delete consultation record"
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
            <div className="text-sm font-bold text-slate-800">
              No matching patient consultations found
            </div>
            <p className="text-xs text-slate-600 max-w-md mx-auto">
              Try clearing the search filter or add a new patient consultation from the Clinical Desk.
            </p>
            {localSearch && (
              <button
                type="button"
                onClick={() => setLocalSearch('')}
                className="px-4 py-2 rounded-xl bg-[#EDE9FE] hover:bg-[#DDD6FE] text-violet-950 border border-[#C4B5FD] text-xs font-bold cursor-pointer"
              >
                Clear Search Filter
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
