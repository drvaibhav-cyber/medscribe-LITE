import React, { useState, useMemo } from 'react';
import {
  FileSpreadsheet,
  Calendar,
  Search,
  Filter,
  Download,
  Trash2,
  Edit3,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Eye,
  Plus,
  Sliders,
  CheckCircle,
  Stethoscope,
  Activity,
  Layers,
  Pill,
  Printer,
  FlaskConical,
  EyeOff,
  Scissors,
  Maximize2,
  Minimize2,
  BedDouble,
  FileText,
} from 'lucide-react';
import { Consultation } from '../types/opd';
import { IpdPatientRecord } from '../types/ipd';
import {
  groupConsultationsByMonthAndDate,
  formatDisplayDate,
  getMonthInfo,
  formatVitalsSummary,
  formatPrescriptionsSummary,
  exportOpdToExcel,
  exportMonthToCsv,
} from '../utils/excelExporter';
import { getPatientHistoryCount } from './A4PrintModal';
import { exportOpdSheetsToPdf } from '../utils/pdfExporter';
import { DateWiseInvestigationTable } from './DateWiseInvestigationTable';
import {
  buildDateWiseInvestigationTable,
  cleanExplicitOpdNo,
  formatPatientNameWithSalutation,
} from '../utils/investigationUtils';
import { hasOtNotesData } from '../utils/otNotesUtils';
import {
  findMatchingIpdRecordsForPatient,
  findMatchingOpdConsultationsForIpdPatient,
} from '../utils/ipdClinicalSync';

interface ExcelWorkbookViewProps {
  consultations: Consultation[];
  allConsultations?: Consultation[];
  ipdPatients?: IpdPatientRecord[];
  focusedDate?: string | null;
  selectedYearKey?: string;
  onSelectYearKey?: (yearKey: string) => void;
  selectedMonthKey?: string;
  onSelectMonthKey?: (key: string) => void;
  onEditConsultation: (c: Consultation) => void;
  onDeleteConsultation: (id: string) => void;
  onPrintConsultation: (c: Consultation) => void;
  onConsolidatedHistory: (c: Consultation) => void;
  onAddInvestigation?: (c: Consultation) => void;
  onAddOtNotes?: (c: Consultation) => void;
  onAdmitPatient?: (c: Consultation) => void;
  onOpenIpdChart?: (patient: IpdPatientRecord) => void;
  onPrintDischargeSummary?: (patient: IpdPatientRecord) => void;
  onExportDischargePdf?: (patient: IpdPatientRecord) => void;
  onViewPatientTimeline: (patientName: string) => void;
  onAddNewForDate: (dateStr: string) => void;
  onHidePatientList?: () => void;
}

export const ExcelWorkbookView: React.FC<ExcelWorkbookViewProps> = ({
  consultations,
  allConsultations,
  ipdPatients = [],
  focusedDate,
  selectedYearKey: externalYearKey,
  onSelectYearKey,
  selectedMonthKey: externalMonthKey,
  onSelectMonthKey,
  onEditConsultation,
  onDeleteConsultation,
  onPrintConsultation,
  onConsolidatedHistory,
  onAddInvestigation,
  onAddOtNotes,
  onAdmitPatient,
  onOpenIpdChart,
  onPrintDischargeSummary,
  onExportDischargePdf,
  onViewPatientTimeline,
  onAddNewForDate,
  onHidePatientList,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [ipdStatusFilter, setIpdStatusFilter] = useState<'all' | 'admitted' | 'discharged'>('all');
  const [isIpdRegisterCollapsed, setIsIpdRegisterCollapsed] = useState(false);
  const [internalYearKey, setInternalYearKey] = useState<string>('ALL');
  const [internalMonthKey, setInternalMonthKey] = useState<string>('ALL');
  const selectedYearKey = externalYearKey !== undefined ? externalYearKey : internalYearKey;
  const selectedMonthKey = externalMonthKey !== undefined ? externalMonthKey : internalMonthKey;

  const setSelectedYearKey = (yearKey: string) => {
    setInternalYearKey(yearKey);
    onSelectYearKey?.(yearKey);
  };

  const setSelectedMonthKey = (key: string) => {
    setInternalMonthKey(key);
    onSelectMonthKey?.(key);
  };
  const [collapsedDates, setCollapsedDates] = useState<Record<string, boolean>>({});
  const [showColumnToggles, setShowColumnToggles] = useState(false);
  const [activePreset, setActivePreset] = useState<'collapsed' | 'default' | 'all' | 'urology'>('collapsed');

  // Column visibility state — Master Register collapses by default to show Patient Name, Diagnosis, Medications, and Action buttons
  const [visibleColumns, setVisibleColumns] = useState({
    opdNo: false,
    time: false,
    patientName: true,
    phone: false,
    gender: false,
    ageDob: false,
    language: false,
    city: false,
    address: false,
    pin: false,
    bp: false,
    pulse: false,
    temp: false,
    height: false,
    weight: false,
    bmi: false,
    spo2: false,
    complaints: false,
    // Case Sheet History Checklist
    burning: false,
    fever: false,
    hematuria: false,
    prevCalculi: false,
    prevSurgery: false,
    constipation: false,
    // IPSS
    ipssScore: false,
    // Exams
    systemicExam: false,
    genitalExam: false,
    perRectalExam: false,
    pastMedication: false,
    labTestsAndImaging: false,
    diagnosis: true,
    testsRequested: false,
    testsByWhen: false,
    prescriptions: true,
    dietExercise: false,
    admissionAdvice: false,
    assessmentPlan: false,
    advice: false,
    nextVisit: false,
    referredTo: false,
    doctor: false,
  });

  const isColumnsCollapsed = activePreset === 'collapsed';

  const applyPreset = (preset: 'collapsed' | 'default' | 'all' | 'urology') => {
    setActivePreset(preset);
    if (preset === 'collapsed') {
      setVisibleColumns({
        opdNo: false,
        time: false,
        patientName: true,
        phone: false,
        gender: false,
        ageDob: false,
        language: false,
        city: false,
        address: false,
        pin: false,
        bp: false,
        pulse: false,
        temp: false,
        height: false,
        weight: false,
        bmi: false,
        spo2: false,
        complaints: false,
        burning: false,
        fever: false,
        hematuria: false,
        prevCalculi: false,
        prevSurgery: false,
        constipation: false,
        ipssScore: false,
        systemicExam: false,
        genitalExam: false,
        perRectalExam: false,
        pastMedication: false,
        labTestsAndImaging: false,
        diagnosis: true,
        testsRequested: false,
        testsByWhen: false,
        prescriptions: true,
        dietExercise: false,
        admissionAdvice: false,
        assessmentPlan: false,
        advice: false,
        nextVisit: false,
        referredTo: false,
        doctor: false,
      });
    } else if (preset === 'all') {
      const allTrue = Object.keys(visibleColumns).reduce((acc, k) => ({ ...acc, [k]: true }), {} as typeof visibleColumns);
      setVisibleColumns(allTrue);
    } else if (preset === 'urology') {
      setVisibleColumns({
        opdNo: true,
        time: false,
        patientName: true,
        phone: true,
        gender: true,
        ageDob: true,
        language: false,
        city: false,
        address: false,
        pin: false,
        bp: true,
        pulse: true,
        temp: false,
        height: false,
        weight: false,
        bmi: false,
        spo2: false,
        complaints: true,
        burning: true,
        fever: true,
        hematuria: true,
        prevCalculi: true,
        prevSurgery: true,
        constipation: true,
        ipssScore: true,
        systemicExam: true,
        genitalExam: true,
        perRectalExam: true,
        pastMedication: true,
        labTestsAndImaging: true,
        diagnosis: true,
        testsRequested: true,
        testsByWhen: true,
        prescriptions: true,
        dietExercise: false,
        admissionAdvice: true,
        assessmentPlan: true,
        advice: true,
        nextVisit: true,
        referredTo: true,
        doctor: true,
      });
    } else {
      // Expanded (Full Master Register default view)
      setVisibleColumns({
        opdNo: true,
        time: true,
        patientName: true,
        phone: true,
        gender: true,
        ageDob: true,
        language: false,
        city: false,
        address: false,
        pin: false,
        bp: true,
        pulse: true,
        temp: true,
        height: false,
        weight: true,
        bmi: false,
        spo2: true,
        complaints: true,
        burning: true,
        fever: true,
        hematuria: true,
        prevCalculi: true,
        prevSurgery: true,
        constipation: true,
        ipssScore: true,
        systemicExam: true,
        genitalExam: true,
        perRectalExam: true,
        pastMedication: true,
        labTestsAndImaging: true,
        diagnosis: true,
        testsRequested: true,
        testsByWhen: true,
        prescriptions: true,
        dietExercise: true,
        admissionAdvice: true,
        assessmentPlan: true,
        advice: true,
        nextVisit: true,
        referredTo: true,
        doctor: true,
      });
    }
  };

  // Filter consultations by search term across all EMR fields
  const filteredConsultations = useMemo(() => {
    if (!searchTerm.trim()) return consultations;
    const q = searchTerm.toLowerCase();
    return consultations.filter((c) => {
      const rxText = (c.prescriptions || []).map((r) => `${r.medicine || r.drugName || ''} ${r.dosage || ''}`).join(' ');
      const ipssText = c.ipss ? Object.values(c.ipss).filter(Boolean).join(' ') : '';
      return (
        c.patientName.toLowerCase().includes(q) ||
        c.diagnosis.toLowerCase().includes(q) ||
        (c.opdNo && c.opdNo.toLowerCase().includes(q)) ||
        (c.phoneNumber && c.phoneNumber.includes(q)) ||
        (c.complaints && c.complaints.toLowerCase().includes(q)) ||
        (c.chiefComplaints && c.chiefComplaints.toLowerCase().includes(q)) ||
        (c.history && c.history.toLowerCase().includes(q)) ||
        (c.doctorName && c.doctorName.toLowerCase().includes(q)) ||
        c.date.includes(q) ||
        rxText.toLowerCase().includes(q) ||
        ipssText.toLowerCase().includes(q)
      );
    });
  }, [consultations, searchTerm]);

  // Group into Months & Dates
  const groupedMonths = useMemo(() => {
    return groupConsultationsByMonthAndDate(filteredConsultations);
  }, [filteredConsultations]);

  // Compute available years (including years from records + standard recent years)
  const availableYears = useMemo(() => {
    const yearCounts = new Map<string, number>();
    ['2026', '2025', '2024'].forEach((yr) => yearCounts.set(yr, 0));
    filteredConsultations.forEach((c) => {
      const { year } = getMonthInfo(c.date);
      const yKey = String(year);
      yearCounts.set(yKey, (yearCounts.get(yKey) || 0) + 1);
    });
    return Array.from(yearCounts.entries())
      .map(([yearKey, count]) => ({ yearKey, yearLabel: yearKey, count }))
      .sort((a, b) => b.yearKey.localeCompare(a.yearKey));
  }, [filteredConsultations]);

  // Compute months under the selected year
  const monthsUnderSelectedYear = useMemo(() => {
    if (selectedYearKey === 'ALL') {
      return groupedMonths.map((m) => ({
        monthKey: m.monthKey,
        monthLabel: m.monthLabel,
        shortLabel: m.monthLabel,
        count: m.totalConsultations,
      }));
    }
    const yearNum = parseInt(selectedYearKey, 10) || new Date().getFullYear();
    const countByMonthKey = new Map<string, number>();
    groupedMonths.forEach((m) => {
      countByMonthKey.set(m.monthKey, m.totalConsultations);
    });

    const allTwelve: Array<{
      monthKey: string;
      monthLabel: string;
      shortLabel: string;
      count: number;
    }> = [];
    for (let mIdx = 0; mIdx < 12; mIdx++) {
      const mKey = `${yearNum}-${String(mIdx + 1).padStart(2, '0')}`;
      const dateObj = new Date(yearNum, mIdx, 1);
      const monthLabel = dateObj.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      });
      const shortLabel = dateObj.toLocaleDateString('en-US', {
        month: 'short',
      });
      allTwelve.push({
        monthKey: mKey,
        monthLabel,
        shortLabel,
        count: countByMonthKey.get(mKey) || 0,
      });
    }
    return allTwelve;
  }, [groupedMonths, selectedYearKey]);

  const activeYearTotalCount = useMemo(() => {
    if (selectedYearKey === 'ALL') return filteredConsultations.length;
    return availableYears.find((y) => y.yearKey === selectedYearKey)?.count ?? 0;
  }, [selectedYearKey, filteredConsultations.length, availableYears]);

  // Flat list of all prescribed medications matching the user's Prescriptions table headings:
  // # | Medicine | Dosage | When | Frequency | Duration | Notes
  const allPrescriptions = useMemo(() => {
    const list: Array<{
      rxIndex: number;
      consultation: Consultation;
      medicine: string;
      dosage: string;
      when: string;
      frequency: string;
      duration: string;
      notes: string;
    }> = [];

    let count = 1;
    filteredConsultations.forEach((c) => {
      (c.prescriptions || []).forEach((rx) => {
        list.push({
          rxIndex: count++,
          consultation: c,
          medicine: rx.medicine || rx.drugName || '-',
          dosage: rx.dosage || rx.dosageStrength || '-',
          when: rx.when || rx.timing || '-',
          frequency: rx.frequency || '-',
          duration: rx.duration || '-',
          notes: rx.notes || rx.instructions || '-',
        });
      });
    });

    return list;
  }, [filteredConsultations]);

  // Whenever a consultation is saved with a specific paper date, switch to its Year & Month Sheet and expand that Date heading
  React.useEffect(() => {
    if (focusedDate && /^\d{4}-\d{2}-\d{2}$/.test(focusedDate)) {
      const { monthKey, year } = getMonthInfo(focusedDate);
      setSelectedYearKey(String(year));
      setSelectedMonthKey(monthKey);
      setCollapsedDates((prev) => ({
        ...prev,
        [focusedDate]: false,
      }));
    }
  }, [focusedDate]);

  const activeMonthData = useMemo(() => {
    if (selectedMonthKey === 'ALL') return null;
    return groupedMonths.find((m) => m.monthKey === selectedMonthKey) || null;
  }, [groupedMonths, selectedMonthKey]);

  const displayedMonthGroups = useMemo(() => {
    if (selectedMonthKey === 'ALL') {
      if (selectedYearKey === 'ALL') return groupedMonths;
      return groupedMonths.filter((m) => String(m.year) === selectedYearKey);
    }
    return groupedMonths.filter((m) => m.monthKey === selectedMonthKey);
  }, [groupedMonths, selectedMonthKey, selectedYearKey]);

  const toggleDateCollapse = (dateStr: string) => {
    setCollapsedDates((prev) => ({
      ...prev,
      [dateStr]: !prev[dateStr],
    }));
  };

  // Identify repeat patients in current month
  const repeatPatientNamesInMonth = useMemo(() => {
    if (!activeMonthData) return new Set<string>();
    const counts = new Map<string, number>();
    activeMonthData.dates.forEach((d) => {
      d.consultations.forEach((c) => {
        const name = c.patientName.trim().toLowerCase();
        counts.set(name, (counts.get(name) || 0) + 1);
      });
    });
    const repeatSet = new Set<string>();
    counts.forEach((count, name) => {
      if (count > 1) repeatSet.add(name);
    });
    return repeatSet;
  }, [activeMonthData]);

  // Filter IPD Admissions & Discharges log by search term, year/month sheet, and status
  const filteredIpdPatients = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return [...(ipdPatients || [])]
      .filter((p) => {
        if (ipdStatusFilter !== 'all' && p.status !== ipdStatusFilter) return false;
        const admDate = p.admissionDate || '';
        const dischDate = p.dischargeDate || p.dischargeSummary?.dischargeDate || '';

        // Apply year / month filter unless on dedicated IPD_REGISTER sheet
        if (selectedMonthKey !== 'IPD_REGISTER' && selectedMonthKey !== 'PRESCRIPTIONS') {
          if (selectedYearKey !== 'ALL') {
            const matchesYear =
              admDate.startsWith(selectedYearKey) || dischDate.startsWith(selectedYearKey);
            if (!matchesYear) return false;
          }
          if (selectedMonthKey !== 'ALL') {
            const matchesMonth =
              admDate.startsWith(selectedMonthKey) || dischDate.startsWith(selectedMonthKey);
            if (!matchesMonth) return false;
          }
        }

        if (!q) return true;
        const hay = [
          p.patientName,
          p.ipdNo,
          p.uhid,
          p.wardOrBed,
          p.admittingDiagnosis,
          p.dischargeSummary?.finalDiagnosis,
          p.otNotes?.procedureName,
          p.phoneNumber,
          p.status,
          admDate,
          dischDate,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        const dateA = a.dischargeDate || a.admissionDate || '';
        const dateB = b.dischargeDate || b.admissionDate || '';
        const cmp = dateB.localeCompare(dateA);
        if (cmp !== 0) return cmp;
        return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
      });
  }, [ipdPatients, searchTerm, ipdStatusFilter, selectedYearKey, selectedMonthKey]);

  const renderIpdRegisterSection = (standaloneSheet = false) => {
    const admittedTotal = filteredIpdPatients.filter((p) => p.status === 'admitted').length;
    const dischargedTotal = filteredIpdPatients.filter((p) => p.status === 'discharged').length;

    return (
      <div className="bg-white rounded-2xl border border-teal-200/90 shadow-2xs overflow-hidden">
        <div
          onClick={() => {
            if (!standaloneSheet) setIsIpdRegisterCollapsed((prev) => !prev);
          }}
          className={`bg-gradient-to-r from-teal-50 via-[#F0FDFA] to-[#EFF6FF] px-5 py-3.5 border-b border-teal-200/80 flex flex-wrap items-center justify-between gap-3 ${
            standaloneSheet ? '' : 'cursor-pointer select-none'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {!standaloneSheet &&
              (isIpdRegisterCollapsed ? (
                <ChevronRight className="w-4 h-4 text-teal-700" />
              ) : (
                <ChevronDown className="w-4 h-4 text-teal-700" />
              ))}
            <div className="w-8 h-8 rounded-lg bg-teal-700 text-white flex items-center justify-center shrink-0">
              <BedDouble className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 flex-wrap">
                <span>IPD Admissions &amp; Discharges Log</span>
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-white border border-teal-200 text-teal-900 tabular-nums">
                  {filteredIpdPatients.length} Record{filteredIpdPatients.length === 1 ? '' : 's'}
                </span>
              </h3>
              <p className="text-[11px] text-slate-600">
                {admittedTotal} Admitted · {dischargedTotal} Discharged · Includes discharge dates
                and printable discharge summaries on record
              </p>
            </div>
          </div>

          <div
            className="flex items-center gap-1.5 flex-wrap"
            onClick={(e) => e.stopPropagation()}
          >
            {(
              [
                { id: 'all', label: 'All IPD' },
                { id: 'admitted', label: 'Admitted' },
                { id: 'discharged', label: 'Discharged' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setIpdStatusFilter(opt.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                  ipdStatusFilter === opt.id
                    ? 'bg-teal-700 text-white'
                    : 'bg-white text-slate-700 border border-teal-200 hover:bg-teal-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {(standaloneSheet || !isIpdRegisterCollapsed) && (
          <div className="overflow-x-auto">
            {filteredIpdPatients.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No IPD admissions or discharges match the current filter.
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                    <th className="py-2.5 px-3 w-10">#</th>
                    <th className="py-2.5 px-3">Patient Name</th>
                    <th className="py-2.5 px-3">IPD / UHID &amp; Ward</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Admission Date</th>
                    <th className="py-2.5 px-3">Discharge Date</th>
                    <th className="py-2.5 px-3 min-w-[200px]">Diagnosis / Procedure</th>
                    <th className="py-2.5 px-3">Discharge Summary</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredIpdPatients.map((p, idx) => {
                    const effectiveDischargeDate =
                      p.dischargeDate || p.dischargeSummary?.dischargeDate || '';
                    const hasSavedSummary = Boolean(p.dischargeSummary);
                    const linkedOpdVisits = findMatchingOpdConsultationsForIpdPatient(
                      p,
                      allConsultations || consultations,
                      false
                    );
                    const totalHistoryCount = linkedOpdVisits.length + 1;

                    const isDischarged = p.status === 'discharged';
                    return (
                      <tr
                        key={p.id}
                        className={
                          isDischarged
                            ? 'bg-[#FFF4E5]/75 hover:bg-[#FFEAD0]/80 border-l-4 border-l-amber-500 transition-colors'
                            : 'hover:bg-teal-50/30 border-l-4 border-l-transparent transition-colors'
                        }
                      >
                        <td className="py-3 px-3 font-mono text-slate-400">{idx + 1}</td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={() => onViewPatientTimeline(p.patientName)}
                              className="font-bold text-slate-900 hover:text-teal-800 underline decoration-slate-300 hover:decoration-teal-500 text-left cursor-pointer"
                              title="View full patient timeline (OPD + IPD + OT)"
                            >
                              {formatPatientNameWithSalutation(p.salutation, p.patientName)}
                            </button>
                            {(p.age || p.gender) && (
                              <span className="text-[11px] font-semibold text-slate-500">
                                ({p.age ? `${p.age}Y` : ''}
                                {p.age && p.gender ? '/' : ''}
                                {p.gender || ''})
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                          <div className="font-semibold text-slate-800">
                            {p.ipdNo || p.uhid || '—'}
                          </div>
                          <div className="text-[10px] text-slate-500 font-sans">
                            {p.wardOrBed || 'General Ward'}
                          </div>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border ${
                              p.status === 'admitted'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-amber-100 text-amber-900 border-amber-300'
                            }`}
                          >
                            {p.status === 'admitted' ? 'Admitted' : 'Discharged'}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-800 whitespace-nowrap tabular-nums">
                          {formatDisplayDate(p.admissionDate)}
                        </td>
                        <td className="py-3 px-3 font-mono whitespace-nowrap tabular-nums">
                          {effectiveDischargeDate ? (
                            <span className="font-bold text-amber-950 bg-amber-100/80 border border-amber-200 px-2 py-0.5 rounded">
                              {formatDisplayDate(effectiveDischargeDate)}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-900">
                            {p.dischargeSummary?.finalDiagnosis ||
                              p.admittingDiagnosis ||
                              'Diagnosis pending'}
                          </div>
                          {(p.dischargeSummary?.procedurePerformed || p.otNotes?.procedureName) && (
                            <div className="text-[11px] text-amber-900 font-medium mt-0.5">
                              OT:{' '}
                              {p.dischargeSummary?.procedurePerformed || p.otNotes?.procedureName}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          {hasSavedSummary ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-violet-900 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded">
                              <FileText className="w-3 h-3 text-violet-700" />
                              <span>Printable On Record</span>
                            </span>
                          ) : p.status === 'discharged' ? (
                            <span className="text-[11px] font-semibold text-amber-800">
                              Ready to Print
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400">In-Patient</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-1.5 flex-wrap">
                            {linkedOpdVisits.length > 0 && (
                              <button
                                type="button"
                                onClick={() => onConsolidatedHistory(linkedOpdVisits[0])}
                                className="px-2 py-1 text-[11px] font-semibold text-teal-800 bg-teal-50/70 hover:bg-teal-100 rounded border border-teal-200 inline-flex items-center gap-1 cursor-pointer"
                                title={`View & Print Consolidated History (${totalHistoryCount} OPD + OT + IPD records)`}
                              >
                                <Layers className="w-3 h-3 text-teal-700" />
                                <span>Consolidated ({totalHistoryCount})</span>
                              </button>
                            )}
                            {onPrintDischargeSummary && (
                              <button
                                type="button"
                                onClick={() => onPrintDischargeSummary(p)}
                                className="px-2.5 py-1 text-[11px] font-bold text-violet-950 bg-[#EDE9FE] hover:bg-[#DDD6FE] rounded border border-[#C4B5FD] inline-flex items-center gap-1 cursor-pointer"
                                title="Review & Print A4 Discharge Summary"
                              >
                                <Printer className="w-3 h-3 text-violet-800" />
                                <span>
                                  {hasSavedSummary || p.status === 'discharged'
                                    ? 'Print Discharge Summary'
                                    : 'Discharge Summary'}
                                </span>
                              </button>
                            )}
                            {onExportDischargePdf && (hasSavedSummary || p.status === 'discharged') && (
                              <button
                                type="button"
                                onClick={() => onExportDischargePdf(p)}
                                className="px-2 py-1 text-[11px] font-semibold text-sky-800 bg-sky-50 hover:bg-sky-100 rounded border border-sky-200 inline-flex items-center gap-1 cursor-pointer"
                                title="Export Discharge Summary PDF"
                              >
                                <Download className="w-3 h-3 text-sky-700" />
                                <span>PDF</span>
                              </button>
                            )}
                            {onOpenIpdChart && (
                              <button
                                type="button"
                                onClick={() => onOpenIpdChart(p)}
                                className="px-2 py-1 text-[11px] font-semibold text-teal-900 bg-white hover:bg-teal-700 hover:text-white rounded border border-teal-300 inline-flex items-center gap-1 cursor-pointer transition-colors"
                                title="Open Patient IPD Chart"
                              >
                                <BedDouble className="w-3 h-3" />
                                <span>Open IPD</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-5 space-y-4">
      {/* Top Controls: Hide List Button, Search, Presets, Export */}
      <div className="bg-[#FFFDF9] p-4 rounded-2xl border border-[#E4DFEC] shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1">
          {onHidePatientList && (
            <button
              type="button"
              onClick={onHidePatientList}
              className="px-3.5 py-2 rounded-xl bg-[#D6DDF8] hover:bg-[#C3CEF5] text-[#2F4362] border border-[#B5C4F0] text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
              title="Conceal patient records and return to the Clinical Desk"
            >
              <EyeOff className="w-3.5 h-3.5 text-[#4B6385]" />
              <span>Hide Patient List</span>
            </button>
          )}

          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#6881A1]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter records by patient, phone, diagnosis, drug, IPSS..."
              className="w-full pl-9 pr-4 py-2 text-xs bg-[#F6F4FB] border border-[#DFD8F0] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#A9CFF7]/40 focus:border-[#8BBDF2] focus:bg-white transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-2 text-xs text-slate-400 hover:text-slate-600"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* View Options & Presets */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Primary Expand / Collapse Master Register Toggle Button */}
          <button
            type="button"
            onClick={() => applyPreset(isColumnsCollapsed ? 'default' : 'collapsed')}
            className={`px-3.5 py-2 text-xs font-bold rounded-xl border flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs ${
              isColumnsCollapsed
                ? 'bg-[#EDE9FE] hover:bg-[#DDD6FE] text-violet-950 border-[#C4B5FD]'
                : 'bg-[#FEF3C7] hover:bg-[#FDE68A] text-amber-950 border-[#FCD34D]'
            }`}
            title={
              isColumnsCollapsed
                ? 'Expand Master Register to show all clinical columns (Vitals, History, IPSS, Exams, Labs, Plan)'
                : 'Collapse Master Register to show only Patient, Diagnosis, Medication & Action buttons'
            }
          >
            {isColumnsCollapsed ? (
              <>
                <Maximize2 className="w-3.5 h-3.5 text-violet-800" />
                <span>Expand</span>
              </>
            ) : (
              <>
                <Minimize2 className="w-3.5 h-3.5 text-amber-800" />
                <span>Collapse</span>
              </>
            )}
          </button>

          <div className="inline-flex rounded-xl p-1 bg-[#F2EFF9] border border-[#E2DCF0] text-xs font-semibold">
            <button
              type="button"
              onClick={() => applyPreset('collapsed')}
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                activePreset === 'collapsed'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Compact view showing Diagnosis, Medication, and Row Actions"
            >
              Collapsed
            </button>
            <button
              type="button"
              onClick={() => applyPreset('default')}
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                activePreset === 'default'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Expanded full Master Register view"
            >
              Expanded
            </button>
            <button
              type="button"
              onClick={() => applyPreset('urology')}
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                activePreset === 'urology'
                  ? 'bg-[#E1F7FC] text-[#2B5378] shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Uro / IPSS
            </button>
            <button
              type="button"
              onClick={() => applyPreset('all')}
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                activePreset === 'all'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Columns
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowColumnToggles(!showColumnToggles)}
            className={`px-3 py-2 text-xs font-medium rounded-xl border flex items-center gap-1.5 transition-colors cursor-pointer ${
              showColumnToggles
                ? 'bg-[#EDE9FE] border-[#C4B5FD] text-violet-900'
                : 'bg-white border-[#DFD8F0] text-slate-700 hover:bg-[#F7F5FC]'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Columns</span>
            <ChevronDown className="w-3.5 h-3.5 opacity-60" />
          </button>

          {activeMonthData && (
            <button
              onClick={() => exportMonthToCsv(activeMonthData.monthLabel, activeMonthData.dates.flatMap((d) => d.consultations))}
              className="px-3 py-2 text-xs font-medium rounded-xl bg-[#E1F7FC] hover:bg-[#CBEFF8] text-[#28527A] border border-[#A9CFF7] transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Download CSV for this month"
            >
              <Download className="w-3.5 h-3.5 text-[#3B6B98]" />
              <span>CSV ({activeMonthData.monthLabel})</span>
            </button>
          )}

          <button
            onClick={() => exportOpdToExcel(consultations)}
            className="px-3.5 py-2 text-xs font-bold rounded-xl bg-[#D1FAE5] hover:bg-[#A7F3D0] text-emerald-950 border border-[#6EE7B7] transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
            title="Download full multi-sheet Excel file with month tabs and date headings"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-800" />
            <span>Export Workbook (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* Column Visibility Panel */}
      {showColumnToggles && (
        <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl text-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-800">
              Toggle Specific EMR Columns:
            </span>
            <span className="text-[11px] text-slate-500">
              (Note: The downloaded Excel file automatically includes ALL EMR columns across all month sheets)
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 text-[11px]">
            {Object.entries(visibleColumns).map(([key, isVis]) => (
              <label key={key} className="flex items-center gap-1.5 cursor-pointer select-none text-slate-700 hover:text-slate-900">
                <input
                  type="checkbox"
                  checked={isVis}
                  onChange={(e) =>
                    setVisibleColumns((prev) => ({
                      ...prev,
                      [key]: e.target.checked,
                    }))
                  }
                  className="rounded text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5"
                />
                <span className="capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Excel Sheet Navigation Bar (Pastel Lavender-Sky Bar) */}
      <div className="bg-gradient-to-r from-[#F3F0FA] via-[#EDF6FE] to-[#ECFBF5] text-slate-800 p-3.5 rounded-2xl border border-[#DAD3EC] space-y-2.5 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3 px-1 pb-2 border-b border-[#DFD8F0]">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-violet-700" />
            <span className="text-xs font-bold text-slate-800">
              Workbook Sheet Selector
            </span>
            <span className="text-[11px] text-slate-600">
              · Filter by Year &amp; Month Sheet
            </span>
          </div>

          <div className="text-[11px] text-violet-900 font-semibold font-mono tabular-nums">
            {selectedYearKey === 'ALL' ? 'All Years' : `Year ${selectedYearKey}`} ·{' '}
            {displayedMonthGroups.length} Active Sheet{displayedMonthGroups.length === 1 ? '' : 's'}
          </div>
        </div>

        {/* Row 1: Separate Year Selector Buttons */}
        <div className="flex items-center gap-2 px-1 overflow-x-auto no-scrollbar">
          <span className="text-[11px] font-semibold text-slate-600 shrink-0 mr-1">
            Year:
          </span>

          <button
            type="button"
            onClick={() => {
              setSelectedYearKey('ALL');
              setSelectedMonthKey('ALL');
            }}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
              selectedYearKey === 'ALL'
                ? 'bg-[#DDD6FE] text-violet-950 border border-[#C4B5FD] shadow-2xs'
                : 'bg-white/85 text-slate-700 border border-[#DFD8F0] hover:bg-white'
            }`}
          >
            <span>All Years</span>
            <span className="text-[10px] font-mono tabular-nums opacity-85">
              ({filteredConsultations.length})
            </span>
          </button>

          {availableYears.map((yr) => (
            <button
              key={yr.yearKey}
              type="button"
              onClick={() => {
                setSelectedYearKey(yr.yearKey);
                setSelectedMonthKey('ALL');
              }}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                selectedYearKey === yr.yearKey
                  ? 'bg-[#DDD6FE] text-violet-950 border border-[#C4B5FD] shadow-2xs'
                  : 'bg-white/85 text-slate-700 border border-[#DFD8F0] hover:bg-white'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 text-violet-700" />
              <span className="font-mono">{yr.yearLabel}</span>
              <span className="text-[10px] font-mono tabular-nums opacity-85">
                ({yr.count})
              </span>
            </button>
          ))}
        </div>

        {/* Row 2: Month Selector Buttons under Selected Year */}
        <div className="flex items-center gap-1.5 pt-2 border-t border-[#DFD8F0] px-1 overflow-x-auto no-scrollbar">
          <span className="text-[11px] font-semibold text-slate-600 shrink-0 mr-1">
            {selectedYearKey === 'ALL' ? 'Months:' : `${selectedYearKey} Months:`}
          </span>

          <button
            type="button"
            onClick={() => setSelectedMonthKey('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
              selectedMonthKey === 'ALL'
                ? 'bg-[#E1F7FC] text-[#244B70] border border-[#A9CFF7] shadow-2xs'
                : 'bg-white/85 text-slate-700 border border-[#DFD8F0] hover:bg-white'
            }`}
          >
            <span>
              {selectedYearKey === 'ALL'
                ? 'All Months (Combined)'
                : `All ${selectedYearKey} Months`}
            </span>
            <span className="text-[10px] font-mono tabular-nums opacity-85">
              ({activeYearTotalCount})
            </span>
          </button>

          {monthsUnderSelectedYear.map((m) => {
            const isSelected = selectedMonthKey === m.monthKey;
            const hasRecords = m.count > 0;
            return (
              <button
                key={m.monthKey}
                type="button"
                onClick={() => setSelectedMonthKey(m.monthKey)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                  isSelected
                    ? 'bg-[#E1F7FC] text-[#244B70] border border-[#A9CFF7] shadow-2xs'
                    : hasRecords
                    ? 'bg-white text-slate-900 hover:bg-[#F3F0FA] border border-[#C4B5FD]'
                    : 'bg-white/60 text-slate-500 hover:bg-white border border-[#E5E0F0]'
                }`}
              >
                <Calendar className="w-3.5 h-3.5 text-violet-700" />
                <span>{selectedYearKey === 'ALL' ? m.monthLabel : m.shortLabel}</span>
                <span
                  className={`text-[10px] font-mono tabular-nums ${
                    isSelected
                      ? 'text-[#244B70] font-bold'
                      : hasRecords
                      ? 'text-violet-800 font-bold'
                      : 'text-slate-400'
                  }`}
                >
                  ({m.count})
                </span>
              </button>
            );
          })}

          {/* Dedicated IPD Admissions & Discharges Register Sheet Tab */}
          <button
            type="button"
            onClick={() => setSelectedMonthKey('IPD_REGISTER')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
              selectedMonthKey === 'IPD_REGISTER'
                ? 'bg-teal-100 text-teal-950 border border-teal-400 shadow-2xs'
                : 'bg-teal-50/70 text-teal-900 border border-teal-200 hover:bg-teal-100'
            }`}
          >
            <BedDouble className="w-3.5 h-3.5 text-teal-700" />
            <span>IPD Register</span>
            <span className="text-[10px] font-mono tabular-nums opacity-85">
              ({ipdPatients.length})
            </span>
          </button>

          {/* Dedicated Prescriptions Register Sheet Tab */}
          <button
            type="button"
            onClick={() => setSelectedMonthKey('PRESCRIPTIONS')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
              selectedMonthKey === 'PRESCRIPTIONS' || selectedMonthKey === 'PRESCRIPTIONS_RX'
                ? 'bg-[#FCE7F3] text-pink-950 border border-[#F9A8D4] shadow-2xs'
                : 'bg-[#FDF2F8] text-pink-900 border border-[#FBCFE8] hover:bg-[#FCE7F3]'
            }`}
          >
            <Pill className="w-3.5 h-3.5 text-pink-700" />
            <span>Prescriptions Register</span>
            <span className="text-[10px] font-mono tabular-nums opacity-85">
              ({allPrescriptions.length})
            </span>
          </button>
        </div>
      </div>

      {/* Main Content Area: IPD Register Sheet OR Excel Grid grouped by Date OR Prescriptions Register */}
      {selectedMonthKey === 'IPD_REGISTER' ? (
        renderIpdRegisterSection(true)
      ) : consultations.length === 0 && ipdPatients.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E2DCF0] p-12 text-center space-y-3">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-[#E1F7FC] text-[#3B6B98] flex items-center justify-center">
            <FileSpreadsheet className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-slate-800">Your Master Register is Ready</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Click <strong>&quot;New Entry&quot;</strong> at the top to record an OPD patient or OT note manually, or admit a patient in the IPD section.
          </p>
        </div>
      ) : selectedMonthKey === 'PRESCRIPTIONS' ? (
        /* DEDICATED PRESCRIPTIONS REGISTER SHEET VIEW IN PASTEL PALETTE */
        <div className="bg-white rounded-2xl border border-[#E2DCF0] shadow-2xs overflow-hidden">
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-[#FDF2F8] via-[#F5F3FF] to-[#EFF6FF] text-slate-800 px-6 py-4 border-b border-[#E2DCF0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="px-2.5 py-0.5 rounded bg-[#FCE7F3] border border-[#F9A8D4] text-pink-950 font-mono text-xs font-bold uppercase">
                  Sheet
                </span>
                <h2 className="text-lg font-bold tracking-tight text-slate-900 flex items-center gap-2">
                  <Pill className="w-5 h-5 text-pink-700" />
                  <span>PRESCRIPTIONS REGISTER (Rx)</span>
                </h2>
              </div>
              <p className="text-xs text-slate-600 mt-1">
                All prescribed medications organized under distinct headings: <strong># &bull; Medicine &bull; Dosage &bull; When &bull; Frequency &bull; Duration &bull; Notes</strong>
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="px-3 py-1 rounded-xl bg-white border border-[#FBCFE8] text-pink-900 font-mono font-semibold">
                {allPrescriptions.length} Meds Prescribed
              </span>
            </div>
          </div>

          {/* Prescriptions Table matching user screenshot layout */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#f0f3fa] text-[#2b3a67] font-semibold border-b border-[#dde3f0] uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-3 w-12 text-center border-r border-[#dde3f0]">#</th>
                  <th className="py-3 px-3 min-w-[200px] border-r border-[#dde3f0]">Medicine</th>
                  <th className="py-3 px-3 min-w-[130px] border-r border-[#dde3f0]">Dosage</th>
                  <th className="py-3 px-3 min-w-[140px] border-r border-[#dde3f0]">When</th>
                  <th className="py-3 px-3 min-w-[130px] border-r border-[#dde3f0]">Frequency</th>
                  <th className="py-3 px-3 min-w-[110px] border-r border-[#dde3f0]">Duration</th>
                  <th className="py-3 px-3 min-w-[220px] border-r border-[#dde3f0]">Notes</th>
                  <th className="py-3 px-3 min-w-[160px] border-r border-[#dde3f0]">Patient Name</th>
                  <th className="py-3 px-3 min-w-[110px] border-r border-[#dde3f0]">Date</th>
                  <th className="py-3 px-3 min-w-[120px] border-r border-[#dde3f0]">OPD / UHID</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {allPrescriptions.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-10 text-center text-slate-400">
                      No prescriptions found matching the search criteria.
                    </td>
                  </tr>
                ) : (
                  allPrescriptions.map((item) => (
                    <tr key={item.rxIndex} className="hover:bg-indigo-50/20 transition-colors">
                      <td className="py-3 px-3 font-bold text-slate-400 text-center border-r border-slate-100">
                        {item.rxIndex}
                      </td>
                      <td className="py-3 px-3 font-bold text-slate-900 border-r border-slate-100">
                        {item.medicine}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-700 border-r border-slate-100 whitespace-nowrap">
                        {item.dosage}
                      </td>
                      <td className="py-3 px-3 text-slate-600 border-r border-slate-100 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium text-[11px]">
                          {item.when}
                        </span>
                      </td>
                      <td className="py-3 px-3 border-r border-slate-100 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-900 font-semibold text-[11px]">
                          {item.frequency}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-700 border-r border-slate-100 whitespace-nowrap">
                        {item.duration}
                      </td>
                      <td className="py-3 px-3 text-slate-600 text-xs border-r border-slate-100 italic">
                        {item.notes}
                      </td>
                      <td className="py-3 px-3 border-r border-slate-100">
                        <button
                          type="button"
                          onClick={() => onViewPatientTimeline(item.consultation.patientName)}
                          className="font-semibold text-emerald-800 hover:underline hover:text-emerald-950 text-left flex items-center gap-1"
                        >
                          <span>
                            {formatPatientNameWithSalutation(
                              item.consultation.salutation,
                              item.consultation.patientName
                            )}
                          </span>
                          <ExternalLink className="w-3 h-3 opacity-60" />
                        </button>
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-600 border-r border-slate-100 whitespace-nowrap">
                        {item.consultation.date}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-600 border-r border-slate-100 whitespace-nowrap">
                        {cleanExplicitOpdNo(item.consultation.opdNo) || '-'}
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {(() => {
                            const historyCount = getPatientHistoryCount(
                              item.consultation,
                              allConsultations || consultations
                            );
                            const hasPreviousRecords = historyCount > 1;
                            return (
                              <button
                                type="button"
                                disabled={!hasPreviousRecords}
                                onClick={() => {
                                  if (hasPreviousRecords) onConsolidatedHistory(item.consultation);
                                }}
                                className={`px-2 py-1 text-[11px] font-semibold rounded border flex items-center gap-1 transition-colors ${
                                  hasPreviousRecords
                                    ? 'text-teal-700 hover:bg-teal-50 border-teal-200 cursor-pointer'
                                    : 'text-slate-400 bg-slate-100 border-slate-200 opacity-60 cursor-not-allowed'
                                }`}
                                title={
                                  hasPreviousRecords
                                    ? `View & Print Consolidated Case History (${historyCount} Consultations in A4 Print Format)`
                                    : 'No previous consultation records found for this patient'
                                }
                              >
                                <Layers className={`w-3 h-3 ${hasPreviousRecords ? 'text-teal-600' : 'text-slate-400'}`} />
                                <span>
                                  Consolidated History{hasPreviousRecords ? ` (${historyCount})` : ''}
                                </span>
                              </button>
                            );
                          })()}
                          <button
                            type="button"
                            onClick={() => onAddInvestigation?.(item.consultation)}
                            className="px-2 py-1 text-[11px] font-semibold text-sky-800 bg-sky-50/70 hover:bg-sky-100 rounded border border-sky-300 flex items-center gap-1 transition-colors cursor-pointer"
                            title="Add Investigation pictures (Lab Reports & Imaging Studies)"
                          >
                            <FlaskConical className="w-3 h-3 text-sky-700" />
                            <span>Add Investigation</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onPrintConsultation(item.consultation)}
                            className="px-2 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50 rounded border border-indigo-200 flex items-center gap-1 transition-colors cursor-pointer"
                            title="Print A4 Hospital Case Sheet"
                          >
                            <Printer className="w-3 h-3" />
                            <span>Print</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onAddOtNotes?.(item.consultation)}
                            className={`px-2 py-1 text-[11px] font-semibold rounded border flex items-center gap-1 transition-colors cursor-pointer ${
                              hasOtNotesData(item.consultation)
                                ? 'text-amber-950 bg-[#FEF3C7] hover:bg-[#FDE68A] border-amber-300'
                                : 'text-amber-900 bg-[#FFFBEB] hover:bg-[#FEF3C7] border-amber-200'
                            }`}
                            title={
                              hasOtNotesData(item.consultation)
                                ? 'View / Edit Operation Theatre (OT) Notes for this patient'
                                : 'Add Operation Theatre (OT) Notes into this patient record'
                            }
                          >
                            <Scissors className="w-3 h-3 text-amber-800" />
                            <span>{hasOtNotesData(item.consultation) ? 'OT Notes' : 'Add OT Notes'}</span>
                          </button>
                          {onAdmitPatient && (
                            <button
                              type="button"
                              onClick={() => onAdmitPatient(item.consultation)}
                              className="px-2 py-1 text-[11px] font-semibold text-teal-900 bg-teal-50 hover:bg-teal-700 hover:text-white rounded border border-teal-300 flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                              title="Admit patient and send data handoff to UroWard IPD"
                            >
                              <BedDouble className="w-3 h-3" />
                              <span>Admit</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              exportOpdSheetsToPdf([item.consultation], {
                                allConsultations: allConsultations || consultations,
                              })
                            }
                            className="px-2 py-1 text-[11px] font-semibold text-sky-700 hover:bg-sky-50 rounded border border-sky-200 flex items-center gap-1 transition-colors cursor-pointer"
                            title="Export A4 Hospital Case Sheet as PDF"
                          >
                            <Download className="w-3 h-3" />
                            <span>Export PDF</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onEditConsultation(item.consultation)}
                            className="px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50 rounded border border-emerald-200 flex items-center gap-1 transition-colors"
                            title="Edit consultation entry"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteConsultation(item.consultation.id)}
                            className="px-2 py-1 text-[11px] font-semibold text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded border border-rose-200 flex items-center gap-1 transition-colors"
                            title="Delete consultation entry"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
                {/* Visual Add Medicine row matching the screenshot prompt */}
                <tr className="bg-slate-50/60 border-t-2 border-indigo-100">
                  <td className="py-3 px-3 font-bold text-slate-400 text-center border-r border-slate-200">
                    {allPrescriptions.length + 1}
                  </td>
                  <td colSpan={10} className="py-3 px-3">
                    <button
                      type="button"
                      onClick={() => onAddNewForDate(new Date().toISOString().split('T')[0])}
                      className="text-slate-400 hover:text-indigo-700 font-medium text-xs flex items-center gap-1.5 py-1 px-2 rounded hover:bg-indigo-50 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Add Medicine / New Prescription</span>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : displayedMonthGroups.length === 0 && filteredIpdPatients.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
            <Calendar className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">
            No Consultations Logged for{' '}
            {selectedMonthKey !== 'ALL'
              ? getMonthInfo(`${selectedMonthKey}-01`).monthLabel
              : `Year ${selectedYearKey}`}
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            You can add a new patient consultation directly to this sheet or scan a handwritten OPD page.
          </p>
          <div className="pt-1">
            <button
              type="button"
              onClick={() =>
                onAddNewForDate(
                  selectedMonthKey !== 'ALL'
                    ? `${selectedMonthKey}-01`
                    : selectedYearKey !== 'ALL'
                    ? `${selectedYearKey}-01-01`
                    : new Date().toISOString().split('T')[0]
                )
              }
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>
                Add Consultation to{' '}
                {selectedMonthKey !== 'ALL'
                  ? getMonthInfo(`${selectedMonthKey}-01`).monthLabel
                  : `Year ${selectedYearKey}`}
              </span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredIpdPatients.length > 0 && renderIpdRegisterSection(false)}
          {displayedMonthGroups.map(
            (monthGroup) => (
              <div
                key={monthGroup.monthKey}
                className="bg-white rounded-2xl border border-[#DFD8F0] shadow-2xs overflow-hidden"
              >
                {/* Month Sheet Title Banner (Pastel Lavender-Sky-Sage Banner) */}
                <div className="bg-gradient-to-r from-[#F3EEFF] via-[#EDF6FF] to-[#ECFBF5] text-slate-800 px-6 py-4 border-b border-[#DFD8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs font-mono font-bold text-violet-800">
                        Monthly Sheet ·
                      </span>
                      <h2 className="text-base sm:text-lg font-bold tracking-tight text-slate-900">
                        {monthGroup.monthLabel}
                      </h2>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5 tabular-nums">
                      {monthGroup.dates.length} consultation {monthGroup.dates.length === 1 ? 'date' : 'dates'} · {monthGroup.totalConsultations} total {monthGroup.totalConsultations === 1 ? 'patient' : 'patients'} registered
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => exportMonthToCsv(monthGroup.monthLabel, monthGroup.dates.flatMap((d) => d.consultations))}
                      className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-white hover:bg-[#F3F0FA] text-slate-800 border border-[#C4B5FD] transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                    >
                      <Download className="w-3.5 h-3.5 text-violet-700" />
                      <span>Export {monthGroup.monthLabel} CSV</span>
                    </button>
                  </div>
                </div>

                {/* Date Headings & Consultations Table */}
                <div className="divide-y divide-[#E8E2F4]">
                  {monthGroup.dates.map((dateGroup) => {
                    const isCollapsed = collapsedDates[dateGroup.date];

                    return (
                      <div key={dateGroup.date} className="bg-white">
                        {/* Prominent DATE SECTION HEADING ROW */}
                        <div
                          onClick={() => toggleDateCollapse(dateGroup.date)}
                          className="px-6 py-3 bg-[#F7F5FC] hover:bg-[#F0ECF9] cursor-pointer flex items-center justify-between border-y border-[#E6E0F2] transition-colors select-none"
                        >
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              className="text-slate-500 hover:text-slate-800"
                            >
                              {isCollapsed ? (
                                <ChevronRight className="w-4 h-4" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </button>
                            <div className="flex items-center gap-2">
                              <Calendar className="w-3.5 h-3.5 text-violet-700" />
                              <span className="text-xs font-bold text-slate-900">
                                {dateGroup.displayDate}
                              </span>
                              <span className="text-xs text-slate-500 font-mono tabular-nums">
                                ({dateGroup.date})
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2.5">
                            <span className="text-xs font-semibold text-slate-700 font-mono tabular-nums">
                              {dateGroup.consultations.length} {dateGroup.consultations.length === 1 ? 'Patient' : 'Patients'}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                applyPreset(isColumnsCollapsed ? 'default' : 'collapsed');
                              }}
                              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border flex items-center gap-1 cursor-pointer transition-colors ${
                                isColumnsCollapsed
                                  ? 'text-violet-950 bg-[#EDE9FE] border-[#C4B5FD] hover:bg-[#DDD6FE]'
                                  : 'text-amber-950 bg-[#FEF3C7] border-[#FCD34D] hover:bg-[#FDE68A]'
                              }`}
                              title={
                                isColumnsCollapsed
                                  ? 'Expand to open all columns of the Master Register'
                                  : 'Collapse columns to show Diagnosis, Medication & Row Actions'
                              }
                            >
                              {isColumnsCollapsed ? (
                                <>
                                  <Maximize2 className="w-3 h-3 text-violet-800" />
                                  <span>Expand</span>
                                </>
                              ) : (
                                <>
                                  <Minimize2 className="w-3 h-3 text-amber-800" />
                                  <span>Collapse</span>
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onAddNewForDate(dateGroup.date);
                              }}
                              className="px-2.5 py-1 text-[11px] font-semibold text-emerald-950 bg-[#D1FAE5] border border-[#6EE7B7] hover:bg-[#A7F3D0] rounded-lg flex items-center gap-1 cursor-pointer"
                              title="Add consultation for this specific date"
                            >
                              <Plus className="w-3 h-3 text-emerald-800" />
                              <span>Add to Date</span>
                            </button>
                          </div>
                        </div>

                        {/* Consultations Table for this Date */}
                        {!isCollapsed && (
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className="bg-slate-50/90 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                                  <th className="py-2.5 px-3 w-10">#</th>
                                  {visibleColumns.opdNo && <th className="py-2.5 px-3">OPD / UHID</th>}
                                  {visibleColumns.time && <th className="py-2.5 px-3">Time</th>}
                                  {visibleColumns.patientName && <th className="py-2.5 px-3">Patient Name</th>}
                                  {visibleColumns.phone && <th className="py-2.5 px-3">Phone</th>}
                                  {visibleColumns.gender && <th className="py-2.5 px-3">Gender</th>}
                                  {visibleColumns.ageDob && <th className="py-2.5 px-3">Age / DOB</th>}
                                  {visibleColumns.language && <th className="py-2.5 px-3">Language</th>}
                                  {visibleColumns.city && <th className="py-2.5 px-3">City</th>}
                                  {visibleColumns.address && <th className="py-2.5 px-3">Address</th>}
                                  {visibleColumns.pin && <th className="py-2.5 px-3">PIN</th>}
                                  {visibleColumns.bp && <th className="py-2.5 px-3">BP (mmHg)</th>}
                                  {visibleColumns.pulse && <th className="py-2.5 px-3">Pulse</th>}
                                  {visibleColumns.temp && <th className="py-2.5 px-3">Temp</th>}
                                  {visibleColumns.height && <th className="py-2.5 px-3">Height</th>}
                                  {visibleColumns.weight && <th className="py-2.5 px-3">Weight</th>}
                                  {visibleColumns.bmi && <th className="py-2.5 px-3">BMI</th>}
                                  {visibleColumns.spo2 && <th className="py-2.5 px-3">SPO2</th>}
                                  {visibleColumns.complaints && <th className="py-2.5 px-3 min-w-[200px]">Complaints</th>}
                                  {/* Case Sheet History */}
                                  {visibleColumns.burning && <th className="py-2.5 px-3">Burning</th>}
                                  {visibleColumns.fever && <th className="py-2.5 px-3">Fever</th>}
                                  {visibleColumns.hematuria && <th className="py-2.5 px-3">Hematuria</th>}
                                  {visibleColumns.prevCalculi && <th className="py-2.5 px-3">Prev Calculi</th>}
                                  {visibleColumns.prevSurgery && <th className="py-2.5 px-3">Prev Surgery</th>}
                                  {visibleColumns.constipation && <th className="py-2.5 px-3">Constipation</th>}
                                  {/* IPSS (F U N P I S S Table) */}
                                  {visibleColumns.ipssScore && (
                                    <th className="py-2.5 px-3 min-w-[300px]">
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-bold text-amber-900">IPSS</span>
                                        <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-mono text-[10px] tracking-widest font-black">
                                          F U N P I S S
                                        </span>
                                      </div>
                                    </th>
                                  )}
                                  {/* Exams */}
                                  {visibleColumns.systemicExam && (
                                    <th className="py-2.5 px-3 min-w-[170px]">
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-bold text-slate-800">Systemic Exam</span>
                                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[9px] font-semibold">
                                          Abdomen &bull; P/A
                                        </span>
                                      </div>
                                    </th>
                                  )}
                                  {visibleColumns.genitalExam && (
                                    <th className="py-2.5 px-3 min-w-[200px]">
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-bold text-purple-950">Genital Exam</span>
                                        <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-900 font-mono text-[9px] font-bold">
                                          Genitals &bull; Testes
                                        </span>
                                      </div>
                                    </th>
                                  )}
                                  {visibleColumns.perRectalExam && (
                                    <th className="py-2.5 px-3 min-w-[190px]">
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-bold text-rose-950">PR Exam</span>
                                        <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-900 font-mono text-[9px] font-bold">
                                          Per Rectal &bull; DRE
                                        </span>
                                      </div>
                                    </th>
                                  )}
                                  {visibleColumns.pastMedication && <th className="py-2.5 px-3">Past Medication</th>}
                                  {visibleColumns.labTestsAndImaging && (
                                    <th className="py-2.5 px-3 min-w-[280px]">
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-bold text-sky-950">Lab Tests &amp; Imaging</span>
                                        <span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-900 font-mono text-[9px] font-bold tracking-tight">
                                          Date &bull; Values &bull; Reports
                                        </span>
                                      </div>
                                    </th>
                                  )}
                                  {visibleColumns.diagnosis && <th className="py-2.5 px-3 min-w-[180px]">Diagnosis</th>}
                                  {visibleColumns.testsRequested && <th className="py-2.5 px-3 min-w-[150px]">Tests Requested</th>}
                                  {visibleColumns.testsByWhen && <th className="py-2.5 px-3">By When</th>}
                                  {visibleColumns.prescriptions && (
                                    <th className="py-2.5 px-3 min-w-[340px]">
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-bold text-indigo-950">Medication (Rx)</span>
                                        <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-900 font-mono text-[9px] font-bold tracking-tight">
                                          Medicine &bull; Dosage &bull; When &bull; Freq &bull; Duration &bull; Notes
                                        </span>
                                      </div>
                                    </th>
                                  )}
                                  {visibleColumns.dietExercise && <th className="py-2.5 px-3">Diet &amp; Exercise</th>}
                                  {visibleColumns.admissionAdvice && <th className="py-2.5 px-3">Admission Advice</th>}
                                  {visibleColumns.assessmentPlan && <th className="py-2.5 px-3 min-w-[160px]">Assessment/Plan</th>}
                                  {visibleColumns.advice && <th className="py-2.5 px-3 min-w-[140px]">Advice</th>}
                                  {visibleColumns.nextVisit && <th className="py-2.5 px-3 min-w-[120px]">Next Visit</th>}
                                  {visibleColumns.referredTo && <th className="py-2.5 px-3 min-w-[140px]">Referred To</th>}
                                  {visibleColumns.doctor && <th className="py-2.5 px-3">Doctor</th>}
                                  <th className="py-2.5 px-3 text-right">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 text-slate-700">
                                {dateGroup.consultations.map((c, rowIdx) => {
                                  const isRepeatPatient = repeatPatientNamesInMonth.has(c.patientName.trim().toLowerCase());
                                  const v = c.vitals || {};
                                  const h = c.historyChecklist || {};
                                  const ip = c.ipss || {};
                                  const ref = c.referredTo || {};

                                  const ipssSummary = [
                                    ip.frequency ? `Freq: ${ip.frequency}` : '',
                                    ip.urgency ? `Urgency: ${ip.urgency}` : '',
                                    ip.nocturia ? `Nocturia: ${ip.nocturia}` : '',
                                    ip.poorStream ? `Poor Stream: ${ip.poorStream}` : '',
                                    ip.incompleteEvacuation ? `Incomplete: ${ip.incompleteEvacuation}` : '',
                                    ip.hesitancy ? `Hesitancy: ${ip.hesitancy}` : '',
                                    ip.qualityOfLife ? `QoL: ${ip.qualityOfLife}` : '',
                                  ].filter(Boolean).join(' | ');

                                  return (
                                    <tr
                                      key={c.id || rowIdx}
                                      className="hover:bg-teal-50/40 transition-colors group"
                                    >
                                      <td className="py-3 px-3 font-mono text-slate-400 text-[11px]">
                                        {rowIdx + 1}
                                      </td>

                                      {visibleColumns.opdNo && (
                                        <td className="py-3 px-3 font-mono font-medium text-slate-800 whitespace-nowrap">
                                          {cleanExplicitOpdNo(c.opdNo) || '-'}
                                        </td>
                                      )}

                                      {visibleColumns.time && (
                                        <td className="py-3 px-3 text-slate-500 whitespace-nowrap">
                                          {c.time || '-'}
                                        </td>
                                      )}

                                      {visibleColumns.patientName && (
                                        <td className="py-3 px-3 font-bold text-slate-900">
                                          <div className="space-y-1">
                                            <div className="flex items-center gap-1.5 flex-wrap whitespace-nowrap">
                                              <button
                                                onClick={() => onViewPatientTimeline(c.patientName)}
                                                className="text-slate-900 hover:text-emerald-700 underline decoration-slate-300 hover:decoration-emerald-500 font-bold transition-colors text-left cursor-pointer"
                                                title="Click to view all OPD, IPD & OT visits for this patient"
                                              >
                                                {formatPatientNameWithSalutation(c.salutation, c.patientName)}
                                              </button>
                                              {!visibleColumns.ageDob && (c.age || c.gender) && (
                                                <span className="text-[11px] font-semibold text-slate-600">
                                                  ({c.age ? `${c.age}Y` : ''}{c.age && c.gender ? '/' : ''}{c.gender || ''})
                                                </span>
                                              )}
                                              {hasOtNotesData(c) && (
                                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#FEF3C7] text-amber-950 border border-amber-300 inline-flex items-center gap-1">
                                                  <Scissors className="w-2.5 h-2.5 text-amber-800" />
                                                  <span>OT</span>
                                                </span>
                                              )}
                                              {isRepeatPatient && (
                                                <span
                                                  className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-800 border border-blue-200 cursor-pointer"
                                                  onClick={() => onViewPatientTimeline(c.patientName)}
                                                  title="This patient visited multiple times in this month under different date headings!"
                                                >
                                                  Repeat Visit
                                                </span>
                                              )}
                                            </div>
                                            {/* Inline IPD Admission / Discharge Strip & Quick Buttons under Patient Name */}
                                            {(() => {
                                              const matchedIpdList = findMatchingIpdRecordsForPatient(
                                                c,
                                                ipdPatients
                                              );
                                              if (matchedIpdList.length === 0) return null;
                                              const latestIpd = matchedIpdList[0];
                                              const dischDate =
                                                latestIpd.dischargeDate ||
                                                latestIpd.dischargeSummary?.dischargeDate ||
                                                '';
                                              return (
                                                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                                                  <span
                                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold border inline-flex items-center gap-1 ${
                                                      latestIpd.status === 'admitted'
                                                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                                        : 'bg-amber-50 text-amber-900 border-amber-300'
                                                    }`}
                                                  >
                                                    <BedDouble className="w-2.5 h-2.5" />
                                                    <span>
                                                      {latestIpd.status === 'admitted'
                                                        ? `IPD Admitted · ${formatDisplayDate(latestIpd.admissionDate)}`
                                                        : `IPD Discharged${dischDate ? ` · ${formatDisplayDate(dischDate)}` : ''}`}
                                                    </span>
                                                  </span>
                                                  {onOpenIpdChart && (
                                                    <button
                                                      type="button"
                                                      onClick={() => onOpenIpdChart(latestIpd)}
                                                      className="px-1.5 py-0.5 rounded text-[10px] font-semibold text-teal-800 bg-white hover:bg-teal-50 border border-teal-200 cursor-pointer"
                                                    >
                                                      IPD Chart
                                                    </button>
                                                  )}
                                                  {onPrintDischargeSummary &&
                                                    (latestIpd.status === 'discharged' ||
                                                      Boolean(latestIpd.dischargeSummary)) && (
                                                      <button
                                                        type="button"
                                                        onClick={() =>
                                                          onPrintDischargeSummary(latestIpd)
                                                        }
                                                        className="px-1.5 py-0.5 rounded text-[10px] font-semibold text-violet-900 bg-violet-50 hover:bg-violet-100 border border-violet-200 inline-flex items-center gap-0.5 cursor-pointer"
                                                      >
                                                        <Printer className="w-2.5 h-2.5" />
                                                        <span>Discharge Summary</span>
                                                      </button>
                                                    )}
                                                </div>
                                              );
                                            })()}
                                          </div>
                                        </td>
                                      )}

                                      {visibleColumns.phone && (
                                        <td className="py-3 px-3 text-slate-600 font-mono text-[11px] whitespace-nowrap">
                                          {c.phoneNumber || c.contactNumber || '-'}
                                        </td>
                                      )}

                                      {visibleColumns.gender && (
                                        <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                                          {c.gender || '-'}
                                        </td>
                                      )}

                                      {visibleColumns.ageDob && (
                                        <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                                          {c.age || '-'} {c.dob ? `(${c.dob})` : ''}
                                        </td>
                                      )}

                                      {visibleColumns.language && (
                                        <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                                          {c.preferredLanguage || 'English'}
                                        </td>
                                      )}

                                      {visibleColumns.city && (
                                        <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                                          {c.city || '-'}
                                        </td>
                                      )}

                                      {visibleColumns.address && (
                                        <td className="py-3 px-3 text-slate-600 min-w-[150px]">
                                          {c.address || c.addressOrCity || '-'}
                                        </td>
                                      )}

                                      {visibleColumns.pin && (
                                        <td className="py-3 px-3 text-slate-600 font-mono text-[11px] whitespace-nowrap">
                                          {c.pin || '-'}
                                        </td>
                                      )}

                                      {/* Vitals */}
                                      {visibleColumns.bp && (
                                        <td className="py-3 px-3 font-mono text-[11px] font-medium text-slate-900 whitespace-nowrap">
                                          {v.bp ? `${v.bp} mmHg` : '-'}
                                        </td>
                                      )}

                                      {visibleColumns.pulse && (
                                        <td className="py-3 px-3 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                                          {v.pulse ? `${v.pulse} bpm` : '-'}
                                        </td>
                                      )}

                                      {visibleColumns.temp && (
                                        <td className="py-3 px-3 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                                          {v.temp ? `${v.temp} °F` : '-'}
                                        </td>
                                      )}

                                      {visibleColumns.height && (
                                        <td className="py-3 px-3 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                                          {v.height ? `${v.height} cm` : '-'}
                                        </td>
                                      )}

                                      {visibleColumns.weight && (
                                        <td className="py-3 px-3 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                                          {v.weight ? `${v.weight} kg` : '-'}
                                        </td>
                                      )}

                                      {visibleColumns.bmi && (
                                        <td className="py-3 px-3 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                                          {v.bmi || '-'}
                                        </td>
                                      )}

                                      {visibleColumns.spo2 && (
                                        <td className="py-3 px-3 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                                          {v.spo2 ? `${v.spo2}%` : '-'}
                                        </td>
                                      )}

                                      {/* Complaints */}
                                      {visibleColumns.complaints && (
                                        <td className="py-3 px-3 text-slate-800 text-xs">
                                          {c.complaints || c.chiefComplaints || '-'}
                                        </td>
                                      )}

                                      {/* Case Sheet History Checklist */}
                                      {visibleColumns.burning && (
                                        <td className="py-3 px-3 whitespace-nowrap">
                                          <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${h.burning === 'Yes' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>
                                            {h.burning || '-'}
                                          </span>
                                        </td>
                                      )}

                                      {visibleColumns.fever && (
                                        <td className="py-3 px-3 whitespace-nowrap">
                                          <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${h.fever === 'Yes' ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-600'}`}>
                                            {h.fever || '-'}
                                          </span>
                                        </td>
                                      )}

                                      {visibleColumns.hematuria && (
                                        <td className="py-3 px-3 whitespace-nowrap">
                                          <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${h.hematuria === 'Yes' ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-600'}`}>
                                            {h.hematuria || '-'}
                                          </span>
                                        </td>
                                      )}

                                      {visibleColumns.prevCalculi && (
                                        <td className="py-3 px-3 whitespace-nowrap">
                                          <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${h.previousRenalCalculi === 'Yes' ? 'bg-purple-100 text-purple-800' : 'bg-slate-100 text-slate-600'}`}>
                                            {h.previousRenalCalculi || '-'}
                                          </span>
                                        </td>
                                      )}

                                      {visibleColumns.prevSurgery && (
                                        <td className="py-3 px-3 whitespace-nowrap">
                                          {h.previousSurgery || '-'}
                                        </td>
                                      )}

                                      {visibleColumns.constipation && (
                                        <td className="py-3 px-3 whitespace-nowrap">
                                          {h.constipation || '-'}
                                        </td>
                                      )}

                                      {/* IPSS [F U N P I S S] Table */}
                                      {visibleColumns.ipssScore && (
                                        <td className="py-2 px-3 text-slate-700 text-[11px]">
                                          {ip.frequency || ip.urgency || ip.nocturia || ip.poorFlow || ip.poorStream || ip.intermittency || ip.straining || ip.incompleteEvacuation ? (
                                            <div className="bg-amber-50/70 border border-amber-200/90 rounded-lg p-2 min-w-[270px] shadow-2xs">
                                              <div className="flex items-center justify-between border-b border-amber-200/60 pb-1 mb-1.5 text-[10px] font-bold text-amber-900">
                                                <span className="tracking-wide">IPSS • F U N P I S S</span>
                                                {ip.qualityOfLife && (
                                                  <span className="text-amber-800 font-medium">QoL: {ip.qualityOfLife}</span>
                                                )}
                                              </div>
                                              <div className="grid grid-cols-2 gap-x-2 text-[11px] leading-tight">
                                                {/* Left Column: F, U, N */}
                                                <div className="space-y-1">
                                                  <div className="flex items-center justify-between gap-1">
                                                    <span className="text-slate-600 flex items-center gap-1">
                                                      <span className="w-3.5 h-3.5 rounded bg-amber-200 text-amber-900 inline-flex items-center justify-center font-bold text-[9px]">F</span>
                                                      <span>Freq:</span>
                                                    </span>
                                                    <span className="font-semibold text-slate-800 text-right truncate max-w-[70px]">{ip.frequency || '-'}</span>
                                                  </div>
                                                  <div className="flex items-center justify-between gap-1">
                                                    <span className="text-slate-600 flex items-center gap-1">
                                                      <span className="w-3.5 h-3.5 rounded bg-amber-200 text-amber-900 inline-flex items-center justify-center font-bold text-[9px]">U</span>
                                                      <span>Urgency:</span>
                                                    </span>
                                                    <span className={`font-semibold ${ip.urgency === 'Yes' ? 'text-amber-900' : 'text-slate-700'}`}>{ip.urgency || '-'}</span>
                                                  </div>
                                                  <div className="flex items-center justify-between gap-1">
                                                    <span className="text-slate-600 flex items-center gap-1">
                                                      <span className="w-3.5 h-3.5 rounded bg-amber-200 text-amber-900 inline-flex items-center justify-center font-bold text-[9px]">N</span>
                                                      <span>Nocturia:</span>
                                                    </span>
                                                    <span className="font-semibold text-slate-800 text-right truncate max-w-[70px]">{ip.nocturia || '-'}</span>
                                                  </div>
                                                </div>
                                                {/* Right Column: P, I, S, S */}
                                                <div className="space-y-1 border-l border-amber-200/80 pl-2">
                                                  <div className="flex items-center justify-between gap-1">
                                                    <span className="text-slate-600 flex items-center gap-1">
                                                      <span className="w-3.5 h-3.5 rounded bg-amber-200 text-amber-900 inline-flex items-center justify-center font-bold text-[9px]">P</span>
                                                      <span>Poor flow:</span>
                                                    </span>
                                                    <span className={`font-semibold ${(ip.poorFlow || ip.poorStream) === 'Yes' ? 'text-amber-900' : 'text-slate-700'}`}>{ip.poorFlow || ip.poorStream || '-'}</span>
                                                  </div>
                                                  <div className="flex items-center justify-between gap-1">
                                                    <span className="text-slate-600 flex items-center gap-1">
                                                      <span className="w-3.5 h-3.5 rounded bg-amber-200 text-amber-900 inline-flex items-center justify-center font-bold text-[9px]">I</span>
                                                      <span>Intermit:</span>
                                                    </span>
                                                    <span className={`font-semibold ${ip.intermittency === 'Yes' ? 'text-amber-900' : 'text-slate-700'}`}>{ip.intermittency || '-'}</span>
                                                  </div>
                                                  <div className="flex items-center justify-between gap-1">
                                                    <span className="text-slate-600 flex items-center gap-1">
                                                      <span className="w-3.5 h-3.5 rounded bg-amber-200 text-amber-900 inline-flex items-center justify-center font-bold text-[9px]">S</span>
                                                      <span>Straining:</span>
                                                    </span>
                                                    <span className={`font-semibold ${ip.straining === 'Yes' ? 'text-amber-900' : 'text-slate-700'}`}>{ip.straining || '-'}</span>
                                                  </div>
                                                  <div className="flex items-center justify-between gap-1">
                                                    <span className="text-slate-600 flex items-center gap-1">
                                                      <span className="w-3.5 h-3.5 rounded bg-amber-200 text-amber-900 inline-flex items-center justify-center font-bold text-[9px]">S</span>
                                                      <span>Incomplete:</span>
                                                    </span>
                                                    <span className={`font-semibold ${ip.incompleteEvacuation === 'Yes' ? 'text-amber-900' : 'text-slate-700'}`}>{ip.incompleteEvacuation || '-'}</span>
                                                  </div>
                                                </div>
                                              </div>
                                            </div>
                                          ) : (
                                            <span className="text-slate-400">-</span>
                                          )}
                                        </td>
                                      )}

                                      {/* Exams */}
                                      {visibleColumns.systemicExam && (
                                        <td className="py-2.5 px-3 text-[11px] min-w-[170px]">
                                          {c.systemicExamination || c.examinationNotes ? (
                                            <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 shadow-2xs">
                                              <div className="flex items-center justify-between border-b border-slate-200 pb-1 mb-1 text-[10px] font-bold text-slate-700">
                                                <span>Abdomen &bull; P/A</span>
                                                <span className="text-[9px] px-1 rounded bg-slate-200/80 text-slate-800">Systemic</span>
                                              </div>
                                              <p className="font-medium text-slate-800 leading-snug">{c.systemicExamination || c.examinationNotes}</p>
                                            </div>
                                          ) : (
                                            <span className="text-slate-400 text-xs">-</span>
                                          )}
                                        </td>
                                      )}

                                      {visibleColumns.genitalExam && (
                                        <td className="py-2.5 px-3 text-[11px] min-w-[200px]">
                                          {c.genitalExamination ? (
                                            <div className="bg-purple-50/70 border border-purple-200/90 rounded-lg p-2 text-slate-800 shadow-2xs">
                                              <div className="flex items-center justify-between border-b border-purple-200/60 pb-1 mb-1 text-[10px] font-bold text-purple-900">
                                                <span>Genital Exam</span>
                                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-200 text-purple-950 font-semibold">Genitals</span>
                                              </div>
                                              <p className="font-semibold text-slate-900 leading-snug">{c.genitalExamination}</p>
                                            </div>
                                          ) : (
                                            <span className="text-slate-400 text-xs">-</span>
                                          )}
                                        </td>
                                      )}

                                      {visibleColumns.perRectalExam && (
                                        <td className="py-2.5 px-3 text-[11px] min-w-[190px]">
                                          {c.perRectalExam ? (
                                            <div className="bg-rose-50/70 border border-rose-200/90 rounded-lg p-2 text-slate-800 shadow-2xs">
                                              <div className="flex items-center justify-between border-b border-rose-200/60 pb-1 mb-1 text-[10px] font-bold text-rose-900">
                                                <span>PR Exam (DRE)</span>
                                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-rose-200 text-rose-950 font-semibold">PR Column</span>
                                              </div>
                                              <p className="font-semibold text-slate-900 leading-snug">{c.perRectalExam}</p>
                                            </div>
                                          ) : (
                                            <span className="text-slate-400 text-xs">-</span>
                                          )}
                                        </td>
                                      )}

                                      {visibleColumns.pastMedication && (
                                        <td className="py-3 px-3 text-slate-600 text-[11px]">
                                          {c.pastMedication || '-'}
                                        </td>
                                      )}

                                      {visibleColumns.labTestsAndImaging && (
                                        <td className="py-2.5 px-3 text-[11px] min-w-[320px]">
                                          {(() => {
                                            const invTable = buildDateWiseInvestigationTable(
                                              c,
                                              allConsultations || consultations
                                            );
                                            const hasTable = invTable.rows.length > 0;
                                            const hasAnyLab =
                                              hasTable ||
                                              Boolean(c.labTestsAndImaging && c.labTestsAndImaging.trim());

                                            if (!hasAnyLab) {
                                              return (
                                                <div className="flex items-center gap-2">
                                                  <span className="text-slate-400">-</span>
                                                  <button
                                                    type="button"
                                                    onClick={() => onAddInvestigation?.(c)}
                                                    className="px-2 py-0.5 rounded bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 text-[10px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                                                    title="Upload pictures of investigations to extract values & imaging impressions"
                                                  >
                                                    <FlaskConical className="w-3 h-3" />
                                                    <span>+ Add Investigation</span>
                                                  </button>
                                                </div>
                                              );
                                            }

                                            return (
                                              <div className="bg-sky-50/70 border border-sky-200/90 rounded-lg p-2 text-slate-800 shadow-2xs space-y-1.5">
                                                <div className="flex items-center justify-between border-b border-sky-200/60 pb-1 text-[10px] font-bold text-sky-900 gap-2">
                                                  <span className="flex items-center gap-1">
                                                    <Activity className="w-3 h-3 text-sky-700" />
                                                    <span>Lab Tests &amp; Imaging</span>
                                                  </span>
                                                  <button
                                                    type="button"
                                                    onClick={() => onAddInvestigation?.(c)}
                                                    className="px-1.5 py-0.5 rounded bg-sky-600 hover:bg-sky-700 text-white text-[9.5px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                                                    title="Add Investigation pictures (Lab Reports & Imaging)"
                                                  >
                                                    <FlaskConical className="w-2.5 h-2.5" />
                                                    <span>+ Add Investigation</span>
                                                  </button>
                                                </div>
                                                {hasTable ? (
                                                  <DateWiseInvestigationTable
                                                    consultation={c}
                                                    allConsultations={allConsultations || consultations}
                                                    compact
                                                  />
                                                ) : (
                                                  <p className="text-slate-800 text-[11px] leading-relaxed font-medium break-words">
                                                    {c.labTestsAndImaging}
                                                  </p>
                                                )}
                                              </div>
                                            );
                                          })()}
                                        </td>
                                      )}

                                      {/* Diagnosis */}
                                      {visibleColumns.diagnosis && (
                                        <td className="py-3 px-3">
                                          <span className="font-semibold text-emerald-950 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                            {c.diagnosis || 'General Consultation'}
                                          </span>
                                        </td>
                                      )}

                                      {/* Tests Requested */}
                                      {visibleColumns.testsRequested && (
                                        <td className="py-3 px-3 text-slate-700 text-[11px]">
                                          {c.testsRequested || c.investigationsAdvised || '-'}
                                        </td>
                                      )}

                                      {visibleColumns.testsByWhen && (
                                        <td className="py-3 px-3 text-slate-600 text-[11px] whitespace-nowrap">
                                          {c.testsRequestedByWhen || '-'}
                                        </td>
                                      )}

                                      {/* Prescriptions / Medication Table matching EMR: Medicine | Dosage | When | Frequency | Duration | Notes */}
                                      {visibleColumns.prescriptions && (
                                        <td className="py-2.5 px-3 text-slate-700 min-w-[340px]">
                                          {c.prescriptions && c.prescriptions.length > 0 ? (
                                            <div className="border border-indigo-200/90 rounded-lg overflow-hidden bg-white shadow-2xs">
                                              <table className="w-full text-left text-[11px] border-collapse">
                                                <thead>
                                                  <tr className="bg-[#f0f3fa] text-[#2b3a67] font-bold border-b border-[#dde3f0] text-[10px]">
                                                    <th className="py-1 px-1.5 w-6 text-center border-r border-[#dde3f0]">#</th>
                                                    <th className="py-1 px-2 border-r border-[#dde3f0]">Medicine</th>
                                                    <th className="py-1 px-1.5 border-r border-[#dde3f0]">Dosage</th>
                                                    <th className="py-1 px-1.5 border-r border-[#dde3f0]">When</th>
                                                    <th className="py-1 px-1.5 border-r border-[#dde3f0]">Frequency</th>
                                                    <th className="py-1 px-1.5 border-r border-[#dde3f0]">Duration</th>
                                                    <th className="py-1 px-2">Notes</th>
                                                  </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                  {c.prescriptions.map((rx, rxIdx) => (
                                                    <tr key={rxIdx} className="hover:bg-indigo-50/20">
                                                      <td className="py-1 px-1.5 font-bold text-slate-400 text-center border-r border-slate-100">{rxIdx + 1}</td>
                                                      <td className="py-1 px-2 font-semibold text-slate-900 border-r border-slate-100">{rx.medicine || rx.drugName || '-'}</td>
                                                      <td className="py-1 px-1.5 font-mono text-slate-700 border-r border-slate-100 whitespace-nowrap">{rx.dosage || rx.dosageStrength || '-'}</td>
                                                      <td className="py-1 px-1.5 text-slate-600 border-r border-slate-100 whitespace-nowrap">{rx.when || rx.timing || '-'}</td>
                                                      <td className="py-1 px-1.5 font-semibold text-indigo-900 border-r border-slate-100 whitespace-nowrap">{rx.frequency || '-'}</td>
                                                      <td className="py-1 px-1.5 text-slate-600 border-r border-slate-100 whitespace-nowrap">{rx.duration || '-'}</td>
                                                      <td className="py-1 px-2 text-slate-500 text-[10px] italic">{rx.notes || rx.instructions || '-'}</td>
                                                    </tr>
                                                  ))}
                                                </tbody>
                                              </table>
                                            </div>
                                          ) : hasOtNotesData(c) && c.otNotes ? (
                                            <div className="bg-[#FFFBEB] border border-amber-200 rounded-lg px-2.5 py-1.5 text-[11px] text-amber-950 space-y-0.5">
                                              {c.otNotes.procedureName && (
                                                <div className="font-bold flex items-center gap-1">
                                                  <Scissors className="w-3 h-3 text-amber-800 shrink-0" />
                                                  <span>Procedure: {c.otNotes.procedureName}</span>
                                                </div>
                                              )}
                                              {c.otNotes.postOpOrders ? (
                                                <div className="text-slate-700 line-clamp-2">
                                                  Post-Op Rx: {c.otNotes.postOpOrders}
                                                </div>
                                              ) : c.otNotes.catheterOrStentDetails ? (
                                                <div className="text-slate-700 line-clamp-1">
                                                  Catheter/Stent: {c.otNotes.catheterOrStentDetails}
                                                </div>
                                              ) : null}
                                            </div>
                                          ) : (
                                            <span className="text-slate-400 text-xs italic">-</span>
                                          )}
                                        </td>
                                      )}

                                      {visibleColumns.dietExercise && (
                                        <td className="py-3 px-3 text-slate-600 text-[11px]">
                                          {c.dietAndExercise || '-'}
                                        </td>
                                      )}

                                      {visibleColumns.admissionAdvice && (
                                        <td className="py-3 px-3 whitespace-nowrap text-[11px]">
                                          {c.admissionAdvice || 'No'}
                                        </td>
                                      )}

                                      {visibleColumns.assessmentPlan && (
                                        <td className="py-3 px-3 text-slate-700 text-[11px]">
                                          {c.assessmentPlan || '-'}
                                        </td>
                                      )}

                                      {visibleColumns.advice && (
                                        <td className="py-3 px-3 text-slate-600 text-[11px]">
                                          {c.advice || c.adviceAndDiet || '-'}
                                        </td>
                                      )}

                                      {visibleColumns.nextVisit && (
                                        <td className="py-3 px-3 text-rose-800 font-medium text-[11px] whitespace-nowrap">
                                          {c.nextVisit || c.followUpDate || '-'}
                                        </td>
                                      )}

                                      {visibleColumns.referredTo && (
                                        <td className="py-3 px-3 text-slate-600 text-[11px]">
                                          {ref.doctorName ? `${ref.doctorName} (${ref.speciality || ''})` : '-'}
                                        </td>
                                      )}

                                      {visibleColumns.doctor && (
                                        <td className="py-3 px-3 text-slate-600 text-[11px] whitespace-nowrap">
                                          {c.doctorName || '-'}
                                        </td>
                                      )}

                                      {/* Actions */}
                                      <td className="py-3 px-3 text-right whitespace-nowrap">
                                        <div className="flex items-center justify-end gap-1.5">
                                          {(() => {
                                            const opdHistoryCount = getPatientHistoryCount(
                                              c,
                                              allConsultations || consultations
                                            );
                                            const ipdHistoryCount = findMatchingIpdRecordsForPatient(
                                              c,
                                              ipdPatients
                                            ).length;
                                            const historyCount = opdHistoryCount + ipdHistoryCount;
                                            const hasPreviousRecords = historyCount > 1;
                                            return (
                                              <button
                                                type="button"
                                                disabled={!hasPreviousRecords}
                                                onClick={() => {
                                                  if (hasPreviousRecords) onConsolidatedHistory(c);
                                                }}
                                                className={`px-2 py-1 text-[11px] font-semibold rounded border inline-flex items-center gap-1 transition-colors shadow-2xs ${
                                                  hasPreviousRecords
                                                    ? 'text-teal-700 hover:text-teal-900 hover:bg-teal-50 border-teal-200 hover:border-teal-300 cursor-pointer'
                                                    : 'text-slate-400 bg-slate-100 border-slate-200 opacity-60 cursor-not-allowed'
                                                }`}
                                                title={
                                                  hasPreviousRecords
                                                    ? `View & Print Consolidated Case History (${historyCount} OPD/OT/IPD records in A4 Print Format)`
                                                    : 'No previous consultation or IPD records found for this patient'
                                                }
                                              >
                                                <Layers className={`w-3 h-3 ${hasPreviousRecords ? 'text-teal-600' : 'text-slate-400'}`} />
                                                <span>
                                                  Consolidated History{hasPreviousRecords ? ` (${historyCount})` : ''}
                                                </span>
                                              </button>
                                            );
                                          })()}
                                          <button
                                            type="button"
                                            onClick={() => onAddInvestigation?.(c)}
                                            className="px-2 py-1 text-[11px] font-semibold text-sky-800 bg-sky-50/80 hover:text-sky-950 hover:bg-sky-100 rounded border border-sky-300 hover:border-sky-400 inline-flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
                                            title="Add Investigation pictures (Lab Reports & Imaging Studies)"
                                          >
                                            <FlaskConical className="w-3 h-3 text-sky-700" />
                                            <span>Add Investigation</span>
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => onPrintConsultation(c)}
                                            className="px-2 py-1 text-[11px] font-semibold text-indigo-700 hover:text-indigo-900 hover:bg-indigo-50 rounded border border-indigo-200 hover:border-indigo-300 inline-flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
                                            title="Print A4 Hospital Case Sheet"
                                          >
                                            <Printer className="w-3 h-3 text-indigo-600" />
                                            <span>Print</span>
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => onAddOtNotes?.(c)}
                                            className={`px-2 py-1 text-[11px] font-semibold rounded border inline-flex items-center gap-1 transition-colors shadow-2xs cursor-pointer ${
                                              hasOtNotesData(c)
                                                ? 'text-amber-950 bg-[#FEF3C7] hover:bg-[#FDE68A] border-amber-300'
                                                : 'text-amber-900 bg-[#FFFBEB] hover:bg-[#FEF3C7] border-amber-200 hover:border-amber-300'
                                            }`}
                                            title={
                                              hasOtNotesData(c)
                                                ? 'View / Edit Operation Theatre (OT) Notes for this patient'
                                                : 'Add Operation Theatre (OT) Notes into this patient record'
                                            }
                                          >
                                            <Scissors className="w-3 h-3 text-amber-800" />
                                            <span>{hasOtNotesData(c) ? 'OT Notes' : 'Add OT Notes'}</span>
                                          </button>
                                          {onAdmitPatient && (
                                            <button
                                              type="button"
                                              onClick={() => onAdmitPatient(c)}
                                              className="px-2 py-1 text-[11px] font-semibold text-teal-900 bg-teal-50 hover:bg-teal-700 hover:text-white rounded border border-teal-300 inline-flex items-center gap-1 transition-colors shadow-2xs cursor-pointer whitespace-nowrap"
                                              title="Admit patient and send data handoff to UroWard IPD"
                                            >
                                              <BedDouble className="w-3 h-3" />
                                              <span>Admit</span>
                                            </button>
                                          )}
                                          <button
                                            type="button"
                                            onClick={() =>
                                              exportOpdSheetsToPdf([c], {
                                                allConsultations: allConsultations || consultations,
                                              })
                                            }
                                            className="px-2 py-1 text-[11px] font-semibold text-sky-700 hover:text-sky-900 hover:bg-sky-50 rounded border border-sky-200 hover:border-sky-300 inline-flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
                                            title="Export A4 Hospital Case Sheet as PDF"
                                          >
                                            <Download className="w-3 h-3 text-sky-600" />
                                            <span>Export PDF</span>
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => onEditConsultation(c)}
                                            className="px-2 py-1 text-[11px] font-semibold text-slate-700 hover:text-emerald-700 hover:bg-emerald-50 rounded border border-slate-200 hover:border-emerald-300 inline-flex items-center gap-1 transition-colors shadow-2xs"
                                            title="Edit consultation details"
                                          >
                                            <Edit3 className="w-3 h-3 text-emerald-600" />
                                            <span>Edit</span>
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => onDeleteConsultation(c.id)}
                                            className="px-2 py-1 text-[11px] font-semibold text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded border border-rose-200 hover:border-rose-300 inline-flex items-center gap-1 transition-colors shadow-2xs"
                                            title="Delete consultation entry"
                                          >
                                            <Trash2 className="w-3 h-3 text-rose-500" />
                                            <span>Delete</span>
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
};
