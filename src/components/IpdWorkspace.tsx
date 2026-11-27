import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Search,
  X,
  BedDouble,
  ClipboardList,
  Pill,
  FlaskConical,
  Scissors,
  ShieldCheck,
  FileText,
  Download,
  RefreshCw,
  Wifi,
  WifiOff,
  Edit3,
  Trash2,
  Check,
  Calendar,
  UserPlus,
  Clock,
  Activity,
  Printer,
  BookOpen,
  Stethoscope,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  PauseCircle,
  Save,
  CheckCircle2,
  LogOut,
  Copy,
} from 'lucide-react';
import {
  IpdDailyNote,
  IpdDischargeSummary,
  IpdMedicationAdminLog,
  IpdMedicationOrder,
  IpdPatientRecord,
  IpdSurgicalProtocolProgress,
} from '../types/ipd';
import { Consultation, InvestigationItem, OtNotes, PrescriptionItem } from '../types/opd';
import { DoctorAccount } from '../types/doctor';
import { formatDisplayDate } from '../utils/excelExporter';
import {
  formatDailyProgressPodLabel,
  formatPodLabel,
  getEffectiveSurgicalProtocols,
  getProtocolCompletionStats,
  getSurgicalProtocolById,
  isBuiltinProtocolId,
  SurgicalProtocolTemplate,
} from '../utils/surgicalProtocols';
import { getConsultationOtProcedures, hasOtNotesData } from '../utils/otNotesUtils';
import {
  applyMedicationGroupToPrescriptions,
  findMasterMedicationByName,
  MedicationGroup,
  MedicineMasterStore,
} from '../utils/medicineMaster';
import {
  exportIpdDischargeSummaryPdf,
  exportIpdPatientReviewPdf,
} from '../utils/ipdPdfExporter';
import { MedScribeLogo } from './MedScribeLogo';
import {
  IpdSurgicalProtocolPanel,
  ProtocolDailySyncAction,
} from './IpdSurgicalProtocolPanel';
import { IpdSurgicalProtocolsLibraryView } from './IpdSurgicalProtocolsLibraryView';
import { IpdDischargeSummaryModal } from './IpdDischargeSummaryModal';
import { IpdDailyNotePrintModal } from './IpdDailyNotePrintModal';
import { IpdMedicationPrintModal } from './IpdMedicationPrintModal';
import { FormattedClinicalNote } from './FormattedClinicalNote';
import {
  IpdOtNotesEditor,
  IpdOtNotesRegisterView,
  ipdPatientToOtConsultation,
} from './IpdOtNotesPanel';
import { ManualInvestigationModal } from './ManualInvestigationModal';
import { DateWiseInvestigationTable } from './DateWiseInvestigationTable';
import { GlobalFieldDatalists, MedicinePresetsBar } from './FieldSuggestionsBar';
import {
  buildMasterRegisterPatientDirectory,
  compileAdmissionNotesFromOpd,
  consolidateDailyNotesForDate,
  getNormalizedDailyNotesForPatient,
  isDischargeProtocolDailyNote,
  MasterRegisterDirectoryPatient,
  normalizeClinicalPatientName,
  redistributeProtocolDailyNotesByPod,
  syncOtPostOpMedicationsToIpd,
  syncOtPostOpNotesToDailyTimeline,
  syncProtocolActionToDailyNotes,
  syncProtocolMedicationsToIpd,
} from '../utils/ipdClinicalSync';
import {
  appendRepeatedMedicationLogForNextDay,
  buildDailyMedLogsForDate,
  computeMedicationDayNumber,
  DailyMedDecision,
  getResolvedDailyMedicationsForDate,
  getSavedDailyMedicationDates,
  getSavedDecisionsForDate,
  getSavedOrderedMedIdsForDate,
  isDailyConfirmedMedLog,
  repeatAllConfirmedMedicationsToNextDay,
  ResolvedDailyMedicationRow,
  shiftIsoDate,
} from '../utils/ipdDailyMedications';

export type IpdChartTab =
  | 'admission'
  | 'progress'
  | 'medications'
  | 'investigations'
  | 'ot'
  | 'protocol'
  | 'discharge-meds'
  | 'discharge';

interface IpdWorkspaceProps {
  patients: IpdPatientRecord[];
  consultations: Consultation[];
  doctor: DoctorAccount | null;
  isOnline: boolean;
  pendingSyncCount: number;
  isSyncing: boolean;
  onForceSync: () => void;
  onUpsertPatient: (patient: IpdPatientRecord) => void;
  onDeletePatient: (patientId: string) => void;
  onOpenMedicineMaster: () => void;
  onOpenOtPrintPreview: (consultation: Consultation, mode: 'single' | 'consolidated') => void;
  onToast: (msg: string) => void;
  focusedPatientId?: string | null;
  focusedChartTab?: IpdChartTab | null;
  pendingAdmitSeedConsultation?: Consultation | null;
  onClearNavigationIntent?: () => void;
  customProtocols?: SurgicalProtocolTemplate[];
  deletedProtocolIds?: string[];
  onSaveCustomProtocol?: (protocol: SurgicalProtocolTemplate) => void;
  onDeleteCustomProtocol?: (protocolId: string) => void;
  onRestoreBuiltinProtocols?: () => void;
}

type IpdMainMode = 'ward' | 'ot-register' | 'protocols';

function ipdPatientToInvestigationConsultation(patient: IpdPatientRecord): Consultation {
  const base = ipdPatientToOtConsultation(patient);
  return {
    ...base,
    date: patient.admissionDate || base.date,
    investigationRecords: patient.investigationRecords || [],
    labTestsAndImaging: patient.labTestsAndImaging || '',
  };
}

function getTodayIso(): string {
  return new Date().toISOString().split('T')[0];
}

function getCurrentTimeHHMM(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function parseIsoDateToUtcMs(dateStr?: string): number | null {
  if (!dateStr) return null;
  const parts = dateStr.trim().split('-');
  if (parts.length !== 3) return null;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return Date.UTC(y, m - 1, d);
}

function computeAdmissionDayNumber(admissionDate?: string, referenceDate?: string): number | null {
  const admMs = parseIsoDateToUtcMs(admissionDate);
  if (admMs === null) return null;
  const refMs = parseIsoDateToUtcMs(referenceDate || getTodayIso());
  if (refMs === null) return null;
  const diffDays = Math.floor((refMs - admMs) / 86400000);
  if (diffDays < 0) return null;
  return diffDays + 1;
}

function getPatientCensusMeta(p: IpdPatientRecord) {
  const otProcedures = getConsultationOtProcedures(p as any);
  const otProcedureNames = Array.from(
    new Set(
      [
        ...otProcedures.map((proc) => (proc.procedureName || '').trim()),
        (p.otNotes?.procedureName || '').trim(),
      ].filter(Boolean)
    )
  );
  const effectiveSurgeryDate =
    p.surgicalProtocol?.surgeryDate ||
    p.surgeryDate ||
    p.otNotes?.surgeryDate ||
    otProcedures.find((proc) => proc.surgeryDate)?.surgeryDate ||
    '';
  const podLabel = formatPodLabel(effectiveSurgeryDate);
  const hasOt = otProcedureNames.length > 0 || Boolean(effectiveSurgeryDate);
  const dischargeRefDate =
    p.status === 'discharged'
      ? p.dischargeDate || p.dischargeSummary?.dischargeDate || undefined
      : undefined;
  const admissionDay = computeAdmissionDayNumber(p.admissionDate, dischargeRefDate);
  return {
    otProcedures,
    otProcedureNames,
    otProcedureSummary: otProcedureNames.join(' + '),
    effectiveSurgeryDate,
    podLabel,
    hasOt,
    admissionDay,
    dischargeRefDate,
  };
}

export const IpdWorkspace: React.FC<IpdWorkspaceProps> = ({
  patients,
  consultations,
  doctor,
  isOnline,
  pendingSyncCount,
  isSyncing,
  onForceSync,
  onUpsertPatient,
  onDeletePatient,
  onOpenMedicineMaster,
  onOpenOtPrintPreview,
  onToast,
  focusedPatientId,
  focusedChartTab,
  pendingAdmitSeedConsultation,
  onClearNavigationIntent,
  customProtocols = [],
  deletedProtocolIds = [],
  onSaveCustomProtocol,
  onDeleteCustomProtocol,
  onRestoreBuiltinProtocols,
}) => {
  const [mainMode, setMainMode] = useState<IpdMainMode>('ward');
  const effectiveProtocols = useMemo(
    () => getEffectiveSurgicalProtocols(customProtocols, new Set(deletedProtocolIds)),
    [customProtocols, deletedProtocolIds]
  );
  const customProtocolIdSet = useMemo(
    () => new Set(customProtocols.map((p) => p.id)),
    [customProtocols]
  );
  const hasDeletedBuiltins = useMemo(
    () => deletedProtocolIds.some((id) => isBuiltinProtocolId(id)),
    [deletedProtocolIds]
  );
  const [statusFilter, setStatusFilter] = useState<'admitted' | 'discharged' | 'all'>('admitted');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(
    () => focusedPatientId || null
  );
  const [activeChartTab, setActiveChartTab] = useState<IpdChartTab>(
    focusedChartTab || 'admission'
  );

  // Modals & confirmations
  const [isAdmitModalOpen, setIsAdmitModalOpen] = useState(false);
  const [editingAdmissionPatient, setEditingAdmissionPatient] =
    useState<IpdPatientRecord | null>(null);
  const [admitSeedConsultation, setAdmitSeedConsultation] = useState<Consultation | null>(null);
  const [admissionNoteDraft, setAdmissionNoteDraft] = useState('');
  const [isEditingAdmissionNote, setIsEditingAdmissionNote] = useState(false);
  const [isDischargeModalOpen, setIsDischargeModalOpen] = useState(false);
  const [dischargeModalInitialView, setDischargeModalInitialView] = useState<'edit' | 'review'>(
    'edit'
  );
  const openDischargeModal = (mode: 'edit' | 'review' = 'edit') => {
    setDischargeModalInitialView(mode);
    setIsDischargeModalOpen(true);
  };
  const [isInvestigationModalOpen, setIsInvestigationModalOpen] = useState(false);
  const [confirmDeletePatientId, setConfirmDeletePatientId] = useState<string | null>(null);
  const [confirmDeleteListPatientId, setConfirmDeleteListPatientId] = useState<string | null>(null);
  const [confirmDeleteNoteId, setConfirmDeleteNoteId] = useState<string | null>(null);
  const [confirmDeleteDayKey, setConfirmDeleteDayKey] = useState<string | null>(null);
  const [expandedManageDayKey, setExpandedManageDayKey] = useState<string | null>(null);
  const [printPreviewDateKey, setPrintPreviewDateKey] = useState<string | null>(null);
  const [printPreviewIsDischarge, setPrintPreviewIsDischarge] = useState(false);
  const [medPrintPreviewState, setMedPrintPreviewState] = useState<{
    dateKey: string;
    overrideItems?: ResolvedDailyMedicationRow[];
  } | null>(null);

  // Respond to external navigation intent (e.g., Open IPD Chart or Admit from Master Register / Quick List)
  useEffect(() => {
    if (focusedPatientId) {
      const target = patients.find((p) => p.id === focusedPatientId);
      if (target) {
        setMainMode('ward');
        setSelectedPatientId(target.id);
        if (target.status === 'discharged') {
          setStatusFilter('all');
        }
        if (focusedChartTab) {
          setActiveChartTab(focusedChartTab);
        }
      }
      onClearNavigationIntent?.();
    }
  }, [focusedPatientId, focusedChartTab, patients, onClearNavigationIntent]);

  useEffect(() => {
    if (pendingAdmitSeedConsultation) {
      setMainMode('ward');
      setEditingAdmissionPatient(null);
      setAdmitSeedConsultation(pendingAdmitSeedConsultation);
      setIsAdmitModalOpen(true);
      onClearNavigationIntent?.();
    }
  }, [pendingAdmitSeedConsultation, onClearNavigationIntent]);

  // Daily progress form state
  const [noteDate, setNoteDate] = useState(getTodayIso);
  const [noteTime, setNoteTime] = useState(getCurrentTimeHHMM);
  const [noteBp, setNoteBp] = useState('');
  const [notePulse, setNotePulse] = useState('');
  const [noteTemp, setNoteTemp] = useState('');
  const [noteSpo2, setNoteSpo2] = useState('');
  const [noteUrineOutput, setNoteUrineOutput] = useState('');
  const [noteDrainOutput, setNoteDrainOutput] = useState('');
  const [noteIntakeOutput, setNoteIntakeOutput] = useState('');
  const [noteSubjective, setNoteSubjective] = useState('');
  const [noteObjective, setNoteObjective] = useState('');
  const [noteAssessmentPlan, setNoteAssessmentPlan] = useState('');

  // Medication order form state
  const [medName, setMedName] = useState('');
  const [medDosage, setMedDosage] = useState('');
  const [medRoute, setMedRoute] = useState<IpdMedicationOrder['route']>('Oral (PO)');
  const [medFrequency, setMedFrequency] = useState('1-0-1 (BD)');
  const [medWhen, setMedWhen] = useState('After food (p/c)');
  const [medStartDate, setMedStartDate] = useState(getTodayIso);
  const [medNotes, setMedNotes] = useState('');
  const [marDate, setMarDate] = useState(getTodayIso);
  const [dailyMedDecisions, setDailyMedDecisions] = useState<Record<string, DailyMedDecision>>({});
  const [dailyMedOrder, setDailyMedOrder] = useState<string[]>([]);
  const [confirmDeleteMedDayKey, setConfirmDeleteMedDayKey] = useState<string | null>(null);
  const [dischargeTargetPatient, setDischargeTargetPatient] = useState<IpdPatientRecord | null>(
    null
  );
  const [dischargeDateDraft, setDischargeDateDraft] = useState(getTodayIso);

  const admittedCount = useMemo(
    () => patients.filter((p) => p.status === 'admitted').length,
    [patients]
  );
  const dischargedCount = useMemo(
    () => patients.filter((p) => p.status === 'discharged').length,
    [patients]
  );
  const otPatientsCount = useMemo(
    () => patients.filter((p) => hasOtNotesData(p as any)).length,
    [patients]
  );

  const filteredPatients = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return patients.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (!q) return true;
      const otNames = getConsultationOtProcedures(p as any)
        .map((proc) => proc.procedureName)
        .filter(Boolean);
      const hay = [
        p.patientName,
        p.ipdNo,
        p.uhid,
        p.wardOrBed,
        p.admittingDiagnosis,
        p.otNotes?.procedureName,
        ...otNames,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [patients, statusFilter, searchQuery]);

  const selectedPatient = useMemo(() => {
    if (!selectedPatientId) {
      return null;
    }
    return patients.find((p) => p.id === selectedPatientId) || null;
  }, [patients, selectedPatientId]);

  // Compile structured Admission Notes from all matching OPD records for the selected IPD patient
  const compiledAdmissionNotes = useMemo(() => {
    if (!selectedPatient) return null;
    return compileAdmissionNotesFromOpd(selectedPatient, consultations);
  }, [selectedPatient, consultations]);

  // Reset inline admission note editor draft whenever the selected patient changes
  useEffect(() => {
    setAdmissionNoteDraft(selectedPatient?.clinicalSummary || '');
    setIsEditingAdmissionNote(false);
  }, [selectedPatient?.id, selectedPatient?.clinicalSummary]);

  const updateSelectedPatient = (
    updater: (prev: IpdPatientRecord) => IpdPatientRecord,
    toastText?: string
  ) => {
    if (!selectedPatient) return;
    const next = {
      ...updater(selectedPatient),
      updatedAt: Date.now(),
    };
    onUpsertPatient(next);
    if (toastText) onToast(toastText);
  };

  const handleSaveAdmissionNoteText = () => {
    if (!selectedPatient) return;
    updateSelectedPatient(
      (prev) => ({
        ...prev,
        clinicalSummary: admissionNoteDraft.trim().slice(0, 2950) || undefined,
      }),
      'Admission notes saved'
    );
    setIsEditingAdmissionNote(false);
  };

  const openQuickDischargeDialog = (patient: IpdPatientRecord) => {
    setDischargeTargetPatient(patient);
    setDischargeDateDraft(
      patient.dischargeDate || patient.dischargeSummary?.dischargeDate || getTodayIso()
    );
  };

  const handleConfirmQuickDischarge = () => {
    if (!dischargeTargetPatient) return;
    const chosenDate = dischargeDateDraft || getTodayIso();
    const updated: IpdPatientRecord = {
      ...dischargeTargetPatient,
      status: 'discharged',
      dischargeDate: chosenDate,
      dischargeSummary: dischargeTargetPatient.dischargeSummary
        ? {
            ...dischargeTargetPatient.dischargeSummary,
            dischargeDate: chosenDate,
          }
        : dischargeTargetPatient.dischargeSummary,
      updatedAt: Date.now(),
    };
    onUpsertPatient(updated);
    onToast(
      `Discharged ${updated.patientName} (${formatDisplayDate(chosenDate)}) — moved to Discharged & marked in Master Register`
    );
    setDischargeTargetPatient(null);
  };

  const handleRefreshAdmissionNotesFromOpd = () => {
    if (!selectedPatient || !compiledAdmissionNotes) return;
    if (compiledAdmissionNotes.matchedOpdVisits.length === 0) {
      onToast('No matching OPD records found for this patient.');
      return;
    }
    const existingInvKeys = new Set(
      (selectedPatient.investigationRecords || []).map(
        (i) =>
          `${(i.reportDate || '').trim()}|${(i.parameterName || '').trim().toLowerCase()}|${(i.valueOrImpression || '').trim().toLowerCase()}`
      )
    );
    const mergedInvestigations = [...(selectedPatient.investigationRecords || [])];
    for (const inv of compiledAdmissionNotes.mergedInvestigations) {
      const k = `${(inv.reportDate || '').trim()}|${(inv.parameterName || '').trim().toLowerCase()}|${(inv.valueOrImpression || '').trim().toLowerCase()}`;
      if (!existingInvKeys.has(k)) {
        existingInvKeys.add(k);
        mergedInvestigations.push(inv);
      }
    }
    const nextSummary = compiledAdmissionNotes.formattedAdmissionSummaryText;
    updateSelectedPatient(
      (prev) => ({
        ...prev,
        clinicalSummary: nextSummary || prev.clinicalSummary,
        admittingDiagnosis: prev.admittingDiagnosis || compiledAdmissionNotes.latestDiagnosis,
        comorbidities: prev.comorbidities || compiledAdmissionNotes.compiledComorbidities || undefined,
        investigationRecords: mergedInvestigations,
        labTestsAndImaging: prev.labTestsAndImaging || compiledAdmissionNotes.labTestsAndImaging || undefined,
        linkedOpdConsultationId:
          prev.linkedOpdConsultationId || compiledAdmissionNotes.latestVisit?.id || undefined,
      }),
      `Synced Admission Notes from ${compiledAdmissionNotes.matchedOpdVisits.length} OPD visit(s)`
    );
    setAdmissionNoteDraft(nextSummary);
    setIsEditingAdmissionNote(false);
  };

  // --- Daily Note handlers ---
  const handleAddDailyNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) return;
    const hasNarrative =
      noteSubjective.trim() ||
      noteObjective.trim() ||
      noteAssessmentPlan.trim() ||
      noteBp.trim() ||
      notePulse.trim() ||
      noteTemp.trim() ||
      noteSpo2.trim() ||
      noteUrineOutput.trim() ||
      noteDrainOutput.trim();
    if (!hasNarrative) {
      onToast('Enter at least vitals or a clinical progress note before saving.');
      return;
    }

    const podLabelText = formatDailyProgressPodLabel(
      formatPodLabel(
        selectedPatient.surgicalProtocol?.surgeryDate ||
          selectedPatient.surgeryDate ||
          selectedPatient.otNotes?.surgeryDate,
        noteDate
      )
    );

    const newNote: IpdDailyNote = {
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date: noteDate || getTodayIso(),
      time: noteTime || getCurrentTimeHHMM(),
      podLabel: podLabelText || undefined,
      vitals: {
        bp: noteBp.trim() || undefined,
        pulse: notePulse.trim() || undefined,
        temp: noteTemp.trim() || undefined,
        spo2: noteSpo2.trim() || undefined,
        urineOutputMl: noteUrineOutput.trim() || undefined,
        drainOutputMl: noteDrainOutput.trim() || undefined,
        intakeMl: noteIntakeOutput.trim() || undefined,
      },
      subjective: noteSubjective.trim(),
      objective: noteObjective.trim(),
      assessmentPlan: noteAssessmentPlan.trim(),
      authorName: doctor?.fullName || selectedPatient.attendingConsultant || '',
      createdAt: Date.now(),
    };

    updateSelectedPatient(
      (prev) => ({
        ...prev,
        dailyNotes: [newNote, ...(prev.dailyNotes || [])],
      }),
      `Daily progress note saved for ${selectedPatient.patientName}`
    );

    setNoteBp('');
    setNotePulse('');
    setNoteTemp('');
    setNoteSpo2('');
    setNoteUrineOutput('');
    setNoteDrainOutput('');
    setNoteIntakeOutput('');
    setNoteSubjective('');
    setNoteObjective('');
    setNoteAssessmentPlan('');
    setNoteTime(getCurrentTimeHHMM());
  };

  const handleDeleteDailyNote = (noteId: string) => {
    setConfirmDeleteNoteId(null);
    updateSelectedPatient(
      (prev) => ({
        ...prev,
        dailyNotes: getNormalizedDailyNotesForPatient(prev).filter((n) => n.id !== noteId),
      }),
      'Deleted daily progress note'
    );
  };

  const handleDeleteDailyNotesForDate = (dateKey: string) => {
    setConfirmDeleteDayKey(null);
    updateSelectedPatient(
      (prev) => ({
        ...prev,
        dailyNotes: getNormalizedDailyNotesForPatient(prev).filter(
          (n) => !((n.date || getTodayIso()) === dateKey && !isDischargeProtocolDailyNote(n))
        ),
      }),
      `Deleted daily progress notes for ${formatDisplayDate(dateKey)}`
    );
  };

  // --- Medication Order & MAR handlers ---
  const handleMedNameChange = (val: string) => {
    setMedName(val);
    const matched = findMasterMedicationByName(val, medDosage, doctor?.uid);
    if (matched) {
      if (!medDosage && matched.dosage) setMedDosage(matched.dosage);
      if (matched.frequency) setMedFrequency(matched.frequency);
      if (matched.when) setMedWhen(matched.when);
      if (!medNotes && matched.notes) setMedNotes(matched.notes);
    }
  };

  const handleAddMedicationOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient || !medName.trim()) return;
    const master = findMasterMedicationByName(medName, medDosage, doctor?.uid);
    const order: IpdMedicationOrder = {
      id: `med-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      medicine: medName.trim(),
      dosage: medDosage.trim() || master?.dosage || '',
      route: medRoute,
      frequency: medFrequency.trim() || master?.frequency || '1-0-1 (BD)',
      when: medWhen.trim() || master?.when || '',
      startDate: medStartDate || getTodayIso(),
      status: 'active',
      notes: medNotes.trim() || master?.notes || '',
    };
    updateSelectedPatient(
      (prev) => ({
        ...prev,
        medications: [...(prev.medications || []), order],
      }),
      `Added ${order.medicine} to medication chart`
    );
    setMedName('');
    setMedDosage('');
    setMedNotes('');
  };

  const handleAddPresetToIpdMeds = (preset: PrescriptionItem) => {
    if (!selectedPatient) return;
    const name = (preset.medicine || preset.drugName || '').trim();
    if (!name) return;
    const inferredRoute: IpdMedicationOrder['route'] = /^inj\.?\s/i.test(name)
      ? 'IV'
      : 'Oral (PO)';
    const order: IpdMedicationOrder = {
      id: `med-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      medicine: name,
      dosage: preset.dosage || preset.dosageStrength || '',
      route: inferredRoute,
      frequency: preset.frequency || '1-0-1 (BD)',
      when: preset.when || preset.timing || '',
      startDate: getTodayIso(),
      status: 'active',
      notes: preset.notes || preset.instructions || '',
    };
    updateSelectedPatient(
      (prev) => ({
        ...prev,
        medications: [...(prev.medications || []), order],
      }),
      `Added ${name} from Medicine Master`
    );
  };

  const handleApplyMedicationGroupToIpd = (
    group: MedicationGroup,
    store: MedicineMasterStore
  ) => {
    if (!selectedPatient) return;
    const { prescriptions: rxItems } = applyMedicationGroupToPrescriptions([], group, store);
    if (rxItems.length === 0) return;
    const now = Date.now();
    const today = getTodayIso();
    const newOrders: IpdMedicationOrder[] = rxItems.map((rx: PrescriptionItem, idx: number) => {
      const name = rx.medicine || rx.drugName || '';
      return {
        id: `med-${now}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
        medicine: name,
        dosage: rx.dosage || rx.dosageStrength || '',
        route: /^inj\.?\s/i.test(name) ? 'IV' : 'Oral (PO)',
        frequency: rx.frequency || '1-0-1 (BD)',
        when: rx.when || rx.timing || '',
        startDate: today,
        status: 'active',
        notes: rx.notes || rx.instructions || '',
      };
    });
    updateSelectedPatient(
      (prev) => ({
        ...prev,
        medications: [...(prev.medications || []), ...newOrders],
      }),
      `Applied "${group.name}" group (${newOrders.length} medicines)`
    );
  };

  const handleToggleMedStatus = (
    medId: string,
    nextStatus: IpdMedicationOrder['status']
  ) => {
    updateSelectedPatient((prev) => ({
      ...prev,
      medications: (prev.medications || []).map((m) =>
        m.id === medId
          ? {
              ...m,
              status: nextStatus,
              stopDate: nextStatus === 'stopped' ? getTodayIso() : undefined,
            }
          : m
      ),
    }));
  };

  // Hydrate staged daily medication decisions & confirmation order whenever patient or selected date changes
  useEffect(() => {
    if (!selectedPatient) {
      setDailyMedDecisions({});
      setDailyMedOrder([]);
      return;
    }
    const targetDate = marDate || getTodayIso();
    setDailyMedDecisions(getSavedDecisionsForDate(selectedPatient.medicationLogs, targetDate));
    setDailyMedOrder(getSavedOrderedMedIdsForDate(selectedPatient.medicationLogs, targetDate));
  }, [selectedPatient?.id, marDate, selectedPatient?.medicationLogs]);

  const savedDecisionsForMarDate = useMemo(() => {
    if (!selectedPatient) return {} as Record<string, DailyMedDecision>;
    return getSavedDecisionsForDate(selectedPatient.medicationLogs, marDate || getTodayIso());
  }, [selectedPatient, marDate]);

  const hasUnsavedDailyMedChanges = useMemo(() => {
    const activeMedIds = new Set((selectedPatient?.medications || []).map((m) => m.id));
    const currentEntries = Object.entries(dailyMedDecisions).filter(([id]) => activeMedIds.has(id));
    const savedEntries = Object.entries(savedDecisionsForMarDate).filter(([id]) =>
      activeMedIds.has(id)
    );
    if (currentEntries.length !== savedEntries.length) return true;
    for (const [id, val] of currentEntries) {
      if (savedDecisionsForMarDate[id] !== val) return true;
    }
    return false;
  }, [dailyMedDecisions, savedDecisionsForMarDate, selectedPatient?.medications]);

  const handleSetDailyMedDecision = (medId: string, decision: DailyMedDecision) => {
    const isRemoving = dailyMedDecisions[medId] === decision;
    setDailyMedDecisions((prev) => {
      const next = { ...prev };
      if (next[medId] === decision) {
        delete next[medId];
      } else {
        next[medId] = decision;
      }
      return next;
    });
    setDailyMedOrder((prev) => {
      if (isRemoving) {
        return prev.filter((id) => id !== medId);
      }
      return prev.includes(medId) ? prev : [...prev, medId];
    });
  };

  const handleRemoveStagedDailyMed = (medId: string) => {
    setDailyMedDecisions((prev) => {
      const next = { ...prev };
      delete next[medId];
      return next;
    });
    setDailyMedOrder((prev) => prev.filter((id) => id !== medId));
  };

  const handleConfirmAllActiveMedsForDate = () => {
    if (!selectedPatient) return;
    const next: Record<string, DailyMedDecision> = { ...dailyMedDecisions };
    const newlyAddedIds: string[] = [];
    for (const med of selectedPatient.medications || []) {
      if (med.status !== 'stopped') {
        if (!next[med.id]) {
          newlyAddedIds.push(med.id);
        }
        next[med.id] = 'confirmed';
      }
    }
    setDailyMedDecisions(next);
    if (newlyAddedIds.length > 0) {
      setDailyMedOrder((prev) => [
        ...prev,
        ...newlyAddedIds.filter((id) => !prev.includes(id)),
      ]);
    }
  };

  const handleDeleteMedicationOrder = (medId: string) => {
    setDailyMedDecisions((prev) => {
      if (!(medId in prev)) return prev;
      const next = { ...prev };
      delete next[medId];
      return next;
    });
    setDailyMedOrder((prev) => prev.filter((id) => id !== medId));
    updateSelectedPatient(
      (prev) => ({
        ...prev,
        medications: (prev.medications || []).filter((m) => m.id !== medId),
      }),
      'Removed medication order'
    );
  };

  const handleSaveAndSyncDailyMedications = () => {
    if (!selectedPatient) return;
    const targetDate = marDate || getTodayIso();
    const fallbackStart = selectedPatient.surgeryDate || selectedPatient.admissionDate || targetDate;
    const doctorDisplayName = doctor?.fullName || selectedPatient.attendingConsultant || '';

    const newDailyLogs = buildDailyMedLogsForDate(
      targetDate,
      selectedPatient.medications || [],
      dailyMedDecisions,
      fallbackStart,
      doctorDisplayName,
      dailyMedOrder
    );

    const confirmedCount = newDailyLogs.filter((l) => l.status === 'given').length;
    const heldCount = newDailyLogs.filter((l) => l.status === 'held').length;

    updateSelectedPatient(
      (prev) => {
        const keptLogs = (prev.medicationLogs || []).filter(
          (l) => !(l.date === targetDate && isDailyConfirmedMedLog(l))
        );
        const nextMedicationLogs = [...newDailyLogs, ...keptLogs].slice(0, 150);

        const nextDailyNotes = (prev.dailyNotes || []).filter(
          (n) => n.id !== `med-sync-${targetDate}`
        );

        return {
          ...prev,
          medicationLogs: nextMedicationLogs,
          dailyNotes: nextDailyNotes,
        };
      },
      newDailyLogs.length === 0
        ? `Cleared saved medication list for ${formatDisplayDate(targetDate)}`
        : `Saved & synced Medication List for ${formatDisplayDate(targetDate)} (${confirmedCount} confirmed${heldCount > 0 ? `, ${heldCount} held` : ''})`
    );
  };

  const handleDeleteSavedMedicationDay = (dateKey: string) => {
    setConfirmDeleteMedDayKey(null);
    updateSelectedPatient(
      (prev) => ({
        ...prev,
        medicationLogs: (prev.medicationLogs || []).filter(
          (l) => !(l.date === dateKey && isDailyConfirmedMedLog(l))
        ),
        dailyNotes: (prev.dailyNotes || []).filter((n) => n.id !== `med-sync-${dateKey}`),
      }),
      `Removed saved medication list for ${formatDisplayDate(dateKey)}`
    );
  };

  const handleRepeatSingleMedicationToNextDay = (
    sourceDateKey: string,
    row: {
      medicationId: string;
      medicine: string;
      dosage?: string;
      route?: string;
      frequency?: string;
      when?: string;
      notes?: string;
      startDate?: string;
    },
    isFromActiveDate = false
  ) => {
    if (!selectedPatient) return;
    const activeDate = marDate || getTodayIso();
    const nextDateKey = shiftIsoDate(sourceDateKey, 1);
    const fallbackStart =
      selectedPatient.surgeryDate || selectedPatient.admissionDate || sourceDateKey;
    const doctorDisplayName = doctor?.fullName || selectedPatient.attendingConsultant || '';

    const matchingOrder = (selectedPatient.medications || []).find(
      (m) => m.id === row.medicationId
    );
    const repeatPayload = matchingOrder
      ? {
          medicationId: matchingOrder.id,
          medicine: matchingOrder.medicine,
          dosage: matchingOrder.dosage,
          route: matchingOrder.route,
          frequency: matchingOrder.frequency,
          when: matchingOrder.when,
          notes: matchingOrder.notes,
          startDate: matchingOrder.startDate || row.startDate,
        }
      : row;

    let alreadyConfirmed = false;
    updateSelectedPatient(
      (prev) => {
        let baseLogs = [...(prev.medicationLogs || [])];

        // Preserve unsaved staged edits on activeDate if activeDate is either sourceDateKey or nextDateKey
        if (hasUnsavedDailyMedChanges && (isFromActiveDate || nextDateKey === activeDate)) {
          const stagedLogs = buildDailyMedLogsForDate(
            activeDate,
            prev.medications || [],
            dailyMedDecisions,
            fallbackStart,
            doctorDisplayName,
            dailyMedOrder
          );
          baseLogs = [
            ...stagedLogs,
            ...baseLogs.filter((l) => !(l.date === activeDate && isDailyConfirmedMedLog(l))),
          ];
        }

        const result = appendRepeatedMedicationLogForNextDay(
          baseLogs,
          repeatPayload,
          nextDateKey,
          fallbackStart,
          doctorDisplayName
        );
        alreadyConfirmed = result.alreadyConfirmed;

        return {
          ...prev,
          medicationLogs: result.logs,
          dailyNotes: (prev.dailyNotes || []).filter(
            (n) => n.id !== `med-sync-${nextDateKey}` && n.id !== `med-sync-${sourceDateKey}`
          ),
        };
      },
      alreadyConfirmed
        ? `${repeatPayload.medicine} is already on ${formatDisplayDate(nextDateKey)}`
        : `Copied ${repeatPayload.medicine} to ${formatDisplayDate(nextDateKey)}`
    );
  };

  const handleRepeatMedicationsToNextDay = (
    sourceDateKey: string,
    useStagedDecisions = false
  ) => {
    if (!selectedPatient) return;
    const activeDate = marDate || getTodayIso();
    const nextDateKey = shiftIsoDate(sourceDateKey, 1);
    const fallbackStart =
      selectedPatient.surgeryDate || selectedPatient.admissionDate || sourceDateKey;
    const doctorDisplayName = doctor?.fullName || selectedPatient.attendingConsultant || '';

    const activeMedById = new Map<string, IpdMedicationOrder>();
    for (const m of selectedPatient.medications || []) {
      if (m.status !== 'stopped') {
        activeMedById.set(m.id, m);
      }
    }

    const orderedSourceRows: Array<{
      medicationId: string;
      medicine: string;
      dosage?: string;
      route?: string;
      frequency?: string;
      when?: string;
      notes?: string;
      startDate?: string;
    }> = [];

    if (useStagedDecisions) {
      const seen = new Set<string>();
      const pushIfConfirmed = (medId: string) => {
        if (seen.has(medId) || dailyMedDecisions[medId] !== 'confirmed') return;
        const med = activeMedById.get(medId);
        if (!med) return;
        seen.add(medId);
        orderedSourceRows.push({
          medicationId: med.id,
          medicine: med.medicine,
          dosage: med.dosage,
          route: med.route,
          frequency: med.frequency,
          when: med.when,
          notes: med.notes,
          startDate: med.startDate,
        });
      };
      for (const id of dailyMedOrder) pushIfConfirmed(id);
      for (const med of selectedPatient.medications || []) pushIfConfirmed(med.id);
    } else {
      const resolved = getResolvedDailyMedicationsForDate(selectedPatient, sourceDateKey);
      for (const item of resolved.items) {
        if (item.status !== 'confirmed') continue;
        const order = activeMedById.get(item.medicationId);
        if (selectedPatient.medications.some((m) => m.id === item.medicationId && m.status === 'stopped')) {
          continue;
        }
        orderedSourceRows.push(
          order
            ? {
                medicationId: order.id,
                medicine: order.medicine,
                dosage: order.dosage,
                route: order.route,
                frequency: order.frequency,
                when: order.when,
                notes: order.notes,
                startDate: order.startDate,
              }
            : item
        );
      }
    }

    if (orderedSourceRows.length === 0) {
      onToast('No confirmed medications on this date to copy to the next day.');
      return;
    }

    let addedCount = 0;
    updateSelectedPatient(
      (prev) => {
        let baseLogs = [...(prev.medicationLogs || [])];

        if (hasUnsavedDailyMedChanges && (useStagedDecisions || nextDateKey === activeDate)) {
          const stagedLogs = buildDailyMedLogsForDate(
            activeDate,
            prev.medications || [],
            dailyMedDecisions,
            fallbackStart,
            doctorDisplayName,
            dailyMedOrder
          );
          baseLogs = [
            ...stagedLogs,
            ...baseLogs.filter((l) => !(l.date === activeDate && isDailyConfirmedMedLog(l))),
          ];
        }

        const result = repeatAllConfirmedMedicationsToNextDay(
          baseLogs,
          orderedSourceRows,
          nextDateKey,
          fallbackStart,
          doctorDisplayName
        );
        addedCount = result.addedCount;

        return {
          ...prev,
          medicationLogs: result.logs,
          dailyNotes: (prev.dailyNotes || []).filter(
            (n) => n.id !== `med-sync-${nextDateKey}` && n.id !== `med-sync-${sourceDateKey}`
          ),
        };
      },
      addedCount === 0
        ? `All confirmed medications are already on ${formatDisplayDate(nextDateKey)}`
        : `Copied ${addedCount} medication${addedCount === 1 ? '' : 's'} to ${formatDisplayDate(nextDateKey)}`
    );

    setMarDate(nextDateKey);
  };

  // --- OT Notes update handler (syncs Post-Op Instructions into Daily Progress + Post-Op Meds into Medication Log) ---
  const handleUpdateOtProcedures = (procedures: OtNotes[]) => {
    const latest = procedures.length > 0 ? procedures[procedures.length - 1] : undefined;
    updateSelectedPatient((prev) => {
      const nextDailyNotes = syncOtPostOpNotesToDailyTimeline(
        prev.dailyNotes || [],
        procedures,
        doctor?.fullName || prev.attendingConsultant
      );
      const nextMedications = syncOtPostOpMedicationsToIpd(
        prev.medications || [],
        procedures,
        doctor?.uid || prev.doctorId
      );
      return {
        ...prev,
        otProcedures: procedures.length > 0 ? procedures : undefined,
        otNotes: latest,
        surgeryDate: prev.surgeryDate || latest?.surgeryDate || undefined,
        dailyNotes: nextDailyNotes,
        medications: nextMedications,
      };
    });
  };

  // --- Manual 1-click Post-Op Orders -> Medication Log sync (for existing OT records) ---
  const handleSyncPostOpMedsToLog = () => {
    if (!selectedPatient) return;
    const procs = getConsultationOtProcedures(selectedPatient as any);
    if (procs.length === 0) return;
    const beforeCount = (selectedPatient.medications || []).length;
    const nextMedications = syncOtPostOpMedicationsToIpd(
      selectedPatient.medications || [],
      procs,
      doctor?.uid || selectedPatient.doctorId
    );
    const addedCount = Math.max(0, nextMedications.length - beforeCount);
    updateSelectedPatient(
      (prev) => ({
        ...prev,
        medications: nextMedications,
      }),
      addedCount > 0
        ? `Populated ${addedCount} medication${addedCount === 1 ? '' : 's'} from Post-Op Orders into Medication Log`
        : 'Medication Log is already up to date with Post-Op Orders'
    );
  };

  // --- OT Notes delete from IPD OT Register (syncs with Daily Progress, Medication Log & OPD OT Register) ---
  const handleDeleteOtProcedureForPatient = (
    patientId: string,
    procIndex: number,
    proc: OtNotes
  ) => {
    const target = patients.find((p) => p.id === patientId);
    if (!target) return;
    const existingProcs = getConsultationOtProcedures(target as any);
    const nextProcs = existingProcs.filter((p, idx) =>
      proc.id && p.id ? p.id !== proc.id : idx !== procIndex
    );
    const nextLatest = nextProcs.length > 0 ? nextProcs[nextProcs.length - 1] : undefined;
    const nextDailyNotes = syncOtPostOpNotesToDailyTimeline(
      target.dailyNotes || [],
      nextProcs,
      doctor?.fullName || target.attendingConsultant
    );
    const nextMedications = syncOtPostOpMedicationsToIpd(
      target.medications || [],
      nextProcs,
      doctor?.uid || target.doctorId
    );
    onUpsertPatient({
      ...target,
      otProcedures: nextProcs.length > 0 ? nextProcs : undefined,
      otNotes: nextLatest,
      dailyNotes: nextDailyNotes,
      medications: nextMedications,
      updatedAt: Date.now(),
    });
    onToast(
      `Deleted OT procedure "${proc.procedureName || 'OT Note'}" for ${target.patientName} (synced with Daily Progress, Med Log & OPD OT Register)`
    );
  };

  const handleDeleteAllOtForPatient = (patientId: string) => {
    const target = patients.find((p) => p.id === patientId);
    if (!target) return;
    const nextDailyNotes = syncOtPostOpNotesToDailyTimeline(
      target.dailyNotes || [],
      [],
      doctor?.fullName || target.attendingConsultant
    );
    const nextMedications = syncOtPostOpMedicationsToIpd(
      target.medications || [],
      [],
      doctor?.uid || target.doctorId
    );
    onUpsertPatient({
      ...target,
      otProcedures: undefined,
      otNotes: undefined,
      dailyNotes: nextDailyNotes,
      medications: nextMedications,
      updatedAt: Date.now(),
    });
    onToast(
      `Deleted OT notes for ${target.patientName} (synced with Daily Progress, Med Log & OPD OT Register)`
    );
  };

  // --- Surgical Protocol update handler (auto-syncs checked items/fields into Daily Progress Notes & Medication Log) ---
  const handleUpdateProtocol = (
    nextProtocol: IpdSurgicalProtocolProgress | undefined,
    updatedSurgeryDate?: string,
    syncAction?: ProtocolDailySyncAction
  ) => {
    updateSelectedPatient(
      (prev) => {
        const effectiveSurgeryDate =
          updatedSurgeryDate ||
          nextProtocol?.surgeryDate ||
          prev.surgeryDate ||
          prev.otNotes?.surgeryDate;
        const tpl = nextProtocol ? getSurgicalProtocolById(nextProtocol.protocolId) : null;
        const nextDailyNotes =
          nextProtocol && syncAction
            ? syncProtocolActionToDailyNotes(
                { ...prev, surgeryDate: effectiveSurgeryDate },
                nextProtocol,
                syncAction,
                doctor?.fullName || prev.attendingConsultant
              )
            : updatedSurgeryDate && updatedSurgeryDate !== prev.surgeryDate
            ? redistributeProtocolDailyNotesByPod(prev.dailyNotes || [], {
                surgeryDate: effectiveSurgeryDate,
                admissionDate: prev.admissionDate,
                dischargeDate: prev.dischargeDate || prev.dischargeSummary?.dischargeDate,
                stages: tpl?.stages,
              })
            : prev.dailyNotes || [];
        const nextMedications = syncProtocolMedicationsToIpd(
          prev.medications || [],
          nextProtocol,
          effectiveSurgeryDate,
          doctor?.uid || prev.doctorId
        );
        return {
          ...prev,
          surgicalProtocol: nextProtocol,
          surgeryDate: updatedSurgeryDate || prev.surgeryDate,
          dailyNotes: nextDailyNotes,
          medications: nextMedications,
        };
      },
      syncAction?.type === 'toggle-item' && syncAction.checked
        ? `Updated ${syncAction.stageTag} in Daily Progress Notes`
        : undefined
    );
  };

  // --- Discharge Medications handlers (synced with Discharge Summary) ---
  const selectedDischargeMeds = useMemo<PrescriptionItem[]>(() => {
    if (!selectedPatient) return [];
    if (Array.isArray(selectedPatient.dischargeMedications)) {
      return selectedPatient.dischargeMedications;
    }
    return selectedPatient.dischargeSummary?.dischargeMedications || [];
  }, [selectedPatient]);

  const updateDischargeMedicationsList = (
    updater: (current: PrescriptionItem[]) => PrescriptionItem[],
    toastMsg?: string
  ) => {
    updateSelectedPatient((prev) => {
      const current = Array.isArray(prev.dischargeMedications)
        ? prev.dischargeMedications
        : prev.dischargeSummary?.dischargeMedications || [];
      const nextMeds = updater(current);
      return {
        ...prev,
        dischargeMedications: nextMeds,
        ...(prev.dischargeSummary
          ? {
              dischargeSummary: {
                ...prev.dischargeSummary,
                dischargeMedications: nextMeds,
              },
            }
          : {}),
      };
    }, toastMsg);
  };

  const handleAddDischargeMedRow = () => {
    updateDischargeMedicationsList((curr) => [
      ...curr,
      {
        medicine: '',
        drugName: '',
        dosage: '',
        dosageStrength: '',
        when: 'After food (p/c)',
        timing: 'After food (p/c)',
        frequency: '1-0-1 (BD)',
        duration: '5 Days',
        notes: '',
        instructions: '',
      },
    ]);
  };

  const handleUpdateDischargeMedRow = (idx: number, patch: Partial<PrescriptionItem>) => {
    updateDischargeMedicationsList((curr) => {
      const next = [...curr];
      const cur = next[idx] || {
        medicine: '',
        dosage: '',
        when: 'After food (p/c)',
        frequency: '1-0-1 (BD)',
        duration: '5 Days',
        notes: '',
      };
      const updated: PrescriptionItem = { ...cur, ...patch };
      if (patch.medicine !== undefined) {
        updated.drugName = patch.medicine;
        const master = findMasterMedicationByName(patch.medicine, cur.dosage, doctor?.uid);
        if (master) {
          if (!cur.dosage && master.dosage) {
            updated.dosage = master.dosage;
            updated.dosageStrength = master.dosage;
          }
          if (!cur.when && master.when) {
            updated.when = master.when;
            updated.timing = master.when;
          }
          if (!cur.frequency && master.frequency) updated.frequency = master.frequency;
          if (!cur.duration && master.duration) updated.duration = master.duration;
          if (!cur.notes && master.notes) {
            updated.notes = master.notes;
            updated.instructions = master.notes;
          }
        }
      }
      if (patch.dosage !== undefined) updated.dosageStrength = patch.dosage;
      if (patch.when !== undefined) updated.timing = patch.when;
      if (patch.notes !== undefined) updated.instructions = patch.notes;
      next[idx] = updated;
      return next;
    });
  };

  const handleRemoveDischargeMedRow = (idx: number) => {
    updateDischargeMedicationsList(
      (curr) => curr.filter((_, i) => i !== idx),
      'Removed discharge medication'
    );
  };

  const handleApplyDischargeMedGroup = (
    group: MedicationGroup,
    store: MedicineMasterStore
  ) => {
    updateDischargeMedicationsList((curr) => {
      const { prescriptions } = applyMedicationGroupToPrescriptions(curr, group, store);
      return prescriptions;
    }, `Applied "${group.name}" to Discharge Medications`);
  };

  const handlePullActiveWardMedsToDischarge = () => {
    if (!selectedPatient) return;
    const activeWard = (selectedPatient.medications || []).filter(
      (m) => m.status === 'active' && m.medicine.trim()
    );
    if (activeWard.length === 0) {
      onToast('No active inpatient medications found to import');
      return;
    }
    let addedCount = 0;
    updateDischargeMedicationsList((curr) => {
      const existingKeys = new Set(
        curr.map((r) => (r.medicine || r.drugName || '').trim().toLowerCase())
      );
      const additions: PrescriptionItem[] = [];
      for (const m of activeWard) {
        const key = m.medicine.trim().toLowerCase();
        if (existingKeys.has(key)) continue;
        existingKeys.add(key);
        const master = findMasterMedicationByName(m.medicine, m.dosage, doctor?.uid);
        const noteText = m.notes || master?.notes || '';
        const whenVal = m.when || master?.when || 'After food (p/c)';
        additions.push({
          medicine: m.medicine,
          drugName: m.medicine,
          dosage: m.dosage || master?.dosage || '',
          dosageStrength: m.dosage || master?.dosage || '',
          when: whenVal,
          timing: whenVal,
          frequency: m.frequency || master?.frequency || '1-0-1 (BD)',
          duration: master?.duration || '5 Days',
          notes: noteText,
          instructions: noteText,
        });
      }
      addedCount = additions.length;
      return [...curr, ...additions];
    });
    onToast(
      addedCount > 0
        ? `Imported ${addedCount} active ward medication${addedCount === 1 ? '' : 's'} into Discharge Medications`
        : 'All active ward medications are already in Discharge Medications'
    );
  };

  // --- Discharge Summary save handler ---
  const handleSaveDischargeSummary = (
    summary: IpdDischargeSummary,
    markAsDischarged: boolean
  ) => {
    updateSelectedPatient(
      (prev) => ({
        ...prev,
        dischargeMedications: summary.dischargeMedications || prev.dischargeMedications || [],
        dischargeSummary: summary,
        dischargeDate: summary.dischargeDate || prev.dischargeDate,
        status: markAsDischarged ? 'discharged' : prev.status,
      }),
      markAsDischarged
        ? `Discharge summary saved and ${selectedPatient?.patientName} marked as Discharged`
        : `Discharge summary saved for ${selectedPatient?.patientName}`
    );
  };

  // --- Investigation handlers ---
  const handleApplyInvestigations = (updatedFields: {
    investigationRecords: InvestigationItem[];
    labTestsAndImaging: string;
  }) => {
    updateSelectedPatient(
      (prev) => ({
        ...prev,
        investigationRecords: updatedFields.investigationRecords,
        labTestsAndImaging: updatedFields.labTestsAndImaging,
      }),
      `Updated investigations for ${selectedPatient?.patientName}`
    );
    setIsInvestigationModalOpen(false);
  };

  const handleRemoveInvestigationParam = (isoDate: string, parameterName: string) => {
    if (!selectedPatient) return;
    const nextRecords = (selectedPatient.investigationRecords || []).filter(
      (r) =>
        !(
          r.reportDate === isoDate &&
          (r.parameterName || '').toLowerCase() === parameterName.toLowerCase()
        )
    );
    updateSelectedPatient(
      (prev) => ({
        ...prev,
        investigationRecords: nextRecords,
      }),
      `Removed ${parameterName} (${formatDisplayDate(isoDate)})`
    );
  };

  const selectedProtoStats = useMemo(() => {
    if (!selectedPatient?.surgicalProtocol) return null;
    const tpl =
      effectiveProtocols.find((p) => p.id === selectedPatient.surgicalProtocol?.protocolId) ||
      getSurgicalProtocolById(selectedPatient.surgicalProtocol.protocolId);
    if (!tpl) return null;
    return {
      tpl,
      stats: getProtocolCompletionStats(
        selectedPatient.surgicalProtocol.protocolId,
        selectedPatient.surgicalProtocol.checkedItemIds
      ),
    };
  }, [selectedPatient?.surgicalProtocol, effectiveProtocols]);

  const selectedPodLabel = useMemo(() => {
    if (!selectedPatient) return '';
    const sDate =
      selectedPatient.surgicalProtocol?.surgeryDate ||
      selectedPatient.surgeryDate ||
      selectedPatient.otNotes?.surgeryDate;
    return formatPodLabel(sDate);
  }, [selectedPatient]);

  const activeMedsCount = useMemo(
    () => (selectedPatient?.medications || []).filter((m) => m.status === 'active').length,
    [selectedPatient]
  );

  const selectedOtCount = useMemo(
    () => (selectedPatient ? getConsultationOtProcedures(selectedPatient as any).length : 0),
    [selectedPatient]
  );

  return (
    <div className="max-w-[1480px] mx-auto px-4 sm:px-6 lg:px-8 py-5 space-y-5">
      <GlobalFieldDatalists />

      {/* Top IPD Workspace Hero Bar — Unified OPD Pastel Gradient & MedScribe Logo */}
      <div className="relative overflow-hidden flex flex-wrap items-center justify-between gap-3 bg-gradient-to-br from-[#F3EEFF] via-[#EDF6FF] to-[#EBFBF3] rounded-2xl border border-[#DDD6FE] px-4 sm:px-5 py-3.5 shadow-2xs">
        <div className="flex flex-wrap items-center gap-3.5">
          <div className="flex items-center gap-2.5">
            <MedScribeLogo variant="icon" size="sm" />
            <div>
              <h1 className="text-base font-bold text-slate-900 leading-tight">
                IPD Ward Management &amp; Surgical Care
              </h1>
              <p className="text-xs text-slate-600 tabular-nums">
                <strong className="text-violet-900 font-mono">{admittedCount}</strong> Admitted ·{' '}
                <strong className="text-slate-800 font-mono">{dischargedCount}</strong> Discharged ·{' '}
                <strong className="text-amber-900 font-mono">{otPatientsCount}</strong> With OT Notes
              </p>
            </div>
          </div>

          <div className="h-7 w-px bg-[#DDD6FE] hidden sm:block" />

          {/* Mode Switcher: Ward Census vs IPD OT Notes Register vs Surgical Protocols */}
          <div className="inline-flex flex-wrap items-center p-1 rounded-xl bg-[#EFEBF9]/90 border border-[#DDD6FE] gap-0.5">
            <button
              type="button"
              onClick={() => {
                setMainMode('ward');
                setSelectedPatientId(null);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                mainMode === 'ward'
                  ? 'bg-white text-violet-950 border border-[#DDD6FE] shadow-2xs'
                  : 'text-slate-600 hover:text-violet-950'
              }`}
            >
              <ClipboardList className="w-3.5 h-3.5 text-violet-700" />
              <span>Ward Census &amp; Charts</span>
            </button>
            <button
              type="button"
              onClick={() => setMainMode('ot-register')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                mainMode === 'ot-register'
                  ? 'bg-[#FEF3C7] text-amber-950 border border-[#FCD34D] shadow-2xs'
                  : 'text-slate-600 hover:text-amber-950'
              }`}
            >
              <Scissors className="w-3.5 h-3.5 text-amber-800" />
              <span>IPD OT Notes Register ({otPatientsCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setMainMode('protocols')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                mainMode === 'protocols'
                  ? 'bg-[#E0F2FE] text-sky-950 border border-[#7DD3FC] shadow-2xs'
                  : 'text-slate-600 hover:text-sky-950'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-sky-700" />
              <span>Surgical Protocols ({effectiveProtocols.length})</span>
            </button>
          </div>
        </div>

        {/* Right Controls: Local Storage Sync + Admit Patient */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Local Storage Status */}
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-[#DFD8F0] bg-white/80 text-xs">
            {isOnline ? (
              <Wifi className="w-3.5 h-3.5 text-emerald-700" />
            ) : (
              <WifiOff className="w-3.5 h-3.5 text-amber-700" />
            )}
            <span className="font-medium text-slate-700 tabular-nums">
              {!isOnline
                ? `Offline (${pendingSyncCount} queued)`
                : isSyncing
                ? 'Saving locally...'
                : pendingSyncCount > 0
                ? `${pendingSyncCount} pending save`
                : 'Local Saved'}
            </span>
            <button
              type="button"
              onClick={onForceSync}
              disabled={isSyncing || !isOnline}
              title="Save IPD records to local disk now"
              className="p-1 rounded-lg hover:bg-[#EFEBF9] text-slate-600 disabled:opacity-40 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setEditingAdmissionPatient(null);
              setIsAdmitModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-violet-700 hover:bg-violet-800 shadow-2xs transition-colors cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Admit Patient</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {mainMode === 'ot-register' ? (
        <IpdOtNotesRegisterView
          patients={patients}
          onSelectPatientForOt={(patientId) => {
            setSelectedPatientId(patientId);
            setActiveChartTab('ot');
            setMainMode('ward');
          }}
          onOpenA4PrintPreview={onOpenOtPrintPreview}
          onDeleteOtProcedure={handleDeleteOtProcedureForPatient}
          onDeleteAllPatientOt={handleDeleteAllOtForPatient}
        />
      ) : mainMode === 'protocols' ? (
        <IpdSurgicalProtocolsLibraryView
          protocols={effectiveProtocols}
          customProtocolIds={customProtocolIdSet}
          patients={patients}
          doctorUid={doctor?.uid}
          hasDeletedBuiltins={hasDeletedBuiltins}
          onSaveProtocol={(proto) => onSaveCustomProtocol?.(proto)}
          onDeleteProtocol={(protocolId) => onDeleteCustomProtocol?.(protocolId)}
          onRestoreBuiltinProtocols={() => onRestoreBuiltinProtocols?.()}
        />
      ) : (
        <div className="flex flex-col lg:flex-row lg:items-start gap-5">
          {/* Ward Census Panel — Full-page table by default; smoothly shrinks to left sidebar when a patient is clicked */}
          <aside
            className={`bg-white rounded-2xl border border-[#E6E0F0] shadow-2xs overflow-hidden shrink-0 transition-[width,max-width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
              selectedPatient ? 'w-full lg:w-[310px] xl:w-[340px]' : 'w-full'
            }`}
          >
            {selectedPatient ? (
              /* Shrunk Sidebar Header (matches split master-detail view) */
              <div className="p-3 border-b border-[#E6E0F0] bg-[#FDFBF9] space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPatientId(null);
                      setConfirmDeletePatientId(null);
                      setConfirmDeleteListPatientId(null);
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-violet-800 hover:text-violet-950 transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>All Ward Patients</span>
                  </button>
                  <span className="text-[11px] text-slate-500 tabular-nums">
                    {filteredPatients.length} shown
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-1 p-0.5 rounded-xl bg-[#F2EFF9] border border-[#E2DCF0]">
                  {(
                    [
                      { key: 'admitted', label: `Admitted (${admittedCount})` },
                      { key: 'discharged', label: `Disch. (${dischargedCount})` },
                      { key: 'all', label: `All (${patients.length})` },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setStatusFilter(tab.key)}
                      className={`py-1.5 px-1 rounded-lg text-[11px] font-semibold tabular-nums transition-colors cursor-pointer ${
                        statusFilter === tab.key
                          ? 'bg-white text-violet-950 shadow-2xs'
                          : 'text-slate-600 hover:text-violet-950'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-violet-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter name, IPD No, bed..."
                    className="w-full pl-8 pr-7 py-1.5 text-xs bg-[#F6F4FB] border border-[#DFD8F0] rounded-xl focus:bg-white focus:border-violet-400 outline-none transition-all"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ) : (
              /* Full-Page Ward Census Toolbar */
              <div className="px-4 py-3 border-b border-[#E6E0F0] bg-[#FDFBF9] flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="inline-flex items-center gap-1 p-0.5 rounded-xl bg-[#F2EFF9] border border-[#E2DCF0]">
                    {(
                      [
                        { key: 'admitted', label: `Admitted (${admittedCount})` },
                        { key: 'discharged', label: `Discharged (${dischargedCount})` },
                        { key: 'all', label: `All (${patients.length})` },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setStatusFilter(tab.key)}
                        className={`py-1.5 px-3 rounded-lg text-xs font-semibold tabular-nums transition-colors cursor-pointer whitespace-nowrap ${
                          statusFilter === tab.key
                            ? 'bg-white text-violet-950 shadow-2xs'
                            : 'text-slate-600 hover:text-violet-950'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs text-slate-500 tabular-nums">
                    {filteredPatients.length} patient{filteredPatients.length === 1 ? '' : 's'} ·
                    Click any row to open chart
                  </span>
                </div>

                <div className="relative w-full sm:w-80">
                  <Search className="w-3.5 h-3.5 text-violet-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter name, IPD No, bed, diagnosis, OT..."
                    className="w-full pl-8 pr-7 py-1.5 text-xs bg-[#F6F4FB] border border-[#DFD8F0] rounded-xl focus:bg-white focus:border-violet-400 outline-none transition-all"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Ward Census Body: Compact Sidebar List when patient is open, Full-Page Census Table when none selected */}
            {selectedPatient ? (
              <div className="divide-y divide-slate-100 max-h-[68vh] overflow-y-auto">
                {filteredPatients.length === 0 ? (
                  <div className="p-6 text-center space-y-2">
                    <BedDouble className="w-7 h-7 text-slate-300 mx-auto" />
                    <p className="text-xs font-semibold text-slate-700">
                      No {statusFilter === 'all' ? '' : statusFilter} IPD patients
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingAdmissionPatient(null);
                        setIsAdmitModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:underline cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Admit a patient</span>
                    </button>
                  </div>
                ) : (
                  filteredPatients.map((p) => {
                    const isSelected = selectedPatient?.id === p.id;
                    const census = getPatientCensusMeta(p);
                    const isConfirmingListDelete = confirmDeleteListPatientId === p.id;

                    const isDischarged = p.status === 'discharged';
                    return (
                      <div
                        key={p.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setSelectedPatientId(p.id);
                          setConfirmDeletePatientId(null);
                          setConfirmDeleteNoteId(null);
                          setConfirmDeleteDayKey(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedPatientId(p.id);
                            setConfirmDeletePatientId(null);
                          }
                        }}
                        className={`w-full text-left px-3.5 py-3 transition-colors cursor-pointer border-l-4 ${
                          isSelected
                            ? isDischarged
                              ? 'bg-[#FFEED6] ring-1 ring-inset ring-amber-400 border-l-amber-600'
                              : 'bg-[#F3EEFF]/90 ring-1 ring-inset ring-violet-400/60 border-l-violet-600'
                            : isDischarged
                            ? 'bg-[#FFF4E5]/85 hover:bg-[#FFEAD0]/90 border-l-amber-500'
                            : 'bg-white hover:bg-[#FAF8F5] border-l-transparent'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-900 truncate flex items-center gap-1.5">
                              <span className="truncate">
                                {p.salutation ? `${p.salutation} ` : ''}
                                {p.patientName}
                              </span>
                              {isDischarged && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-100 border border-amber-300 text-[9.5px] font-bold text-amber-900 shrink-0">
                                  Discharged
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums truncate">
                              {p.wardOrBed || 'Ward TBD'} · {p.age || '—'}/{p.gender}
                              {p.ipdNo ? ` · ${p.ipdNo}` : ''}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <div
                              className={`text-[11px] font-semibold tabular-nums ${
                                p.status === 'admitted' ? 'text-violet-800' : 'text-amber-800'
                              }`}
                            >
                              {census.podLabel ||
                                (census.admissionDay !== null
                                  ? `Day ${census.admissionDay}`
                                  : p.status === 'admitted'
                                  ? 'Admitted'
                                  : 'Discharged')}
                            </div>
                            {p.status === 'admitted' && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openQuickDischargeDialog(p);
                                }}
                                title={`Discharge ${p.patientName}`}
                                aria-label={`Discharge ${p.patientName}`}
                                className="p-1 rounded-md text-amber-700 hover:text-amber-950 hover:bg-amber-100/80 transition-colors cursor-pointer"
                              >
                                <LogOut className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDeleteListPatientId(
                                  isConfirmingListDelete ? null : p.id
                                );
                              }}
                              title={`Delete ${p.patientName} from IPD list`}
                              aria-label={`Delete ${p.patientName} from IPD list`}
                              className="p-1 rounded-md text-slate-400 hover:text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="text-[11px] text-slate-700 mt-1 line-clamp-1">
                          {p.admittingDiagnosis || 'Diagnosis pending'}
                        </div>

                        {isConfirmingListDelete && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="mt-2 pt-2 border-t border-rose-200 flex items-center justify-between gap-2 bg-rose-50/90 -mx-1 px-2 py-1.5 rounded-lg"
                          >
                            <span className="text-[11px] font-semibold text-rose-800">
                              Delete IPD patient?
                            </span>
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setConfirmDeleteListPatientId(null);
                                  if (selectedPatientId === p.id) {
                                    setSelectedPatientId(null);
                                  }
                                  onDeletePatient(p.id);
                                }}
                                className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold cursor-pointer"
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteListPatientId(null)}
                                className="px-1.5 py-0.5 text-[11px] font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            ) : patients.length === 0 ? (
              <div className="p-12 text-center space-y-3 ipd-table-reveal">
                <MedScribeLogo variant="icon" size="md" className="mx-auto" />
                <h2 className="text-base font-bold text-slate-900">
                  Start Your In-Patient Department (IPD) Ward Chart
                </h2>
                <p className="text-xs text-slate-600 max-w-md mx-auto">
                  Admit inpatients directly or pull demographics from your OPD register. Track daily
                  SOAP progress notes, log inpatient medications, follow urology post-operative
                  protocols, record OT notes, and generate formal discharge summaries.
                </p>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingAdmissionPatient(null);
                      setIsAdmitModalOpen(true);
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-violet-700 hover:bg-violet-800 shadow-2xs transition-colors cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Admit First IPD Patient</span>
                  </button>
                </div>
              </div>
            ) : filteredPatients.length === 0 ? (
              <div className="p-10 text-center space-y-2.5 ipd-table-reveal">
                <BedDouble className="w-8 h-8 text-violet-300 mx-auto" />
                <p className="text-sm font-semibold text-slate-700">
                  No {statusFilter === 'all' ? '' : statusFilter} IPD patients found
                </p>
                <div className="flex items-center justify-center gap-3 pt-1">
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="text-xs font-semibold text-slate-600 hover:text-slate-900 underline cursor-pointer"
                    >
                      Clear search
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setEditingAdmissionPatient(null);
                      setIsAdmitModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700 hover:underline cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Admit a patient</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Full-Page Ward Census Table */
              <div className="overflow-x-auto ipd-table-reveal">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#E6E0F0] bg-[#F6F3FF]/80 text-[11px] font-bold uppercase tracking-wider text-violet-950/75">
                      <th className="py-3 px-4">Patient &amp; Bed</th>
                      <th className="py-3 px-3 whitespace-nowrap">Age / Sex</th>
                      <th className="py-3 px-3">Diagnosis</th>
                      <th className="py-3 px-3">OT Procedure</th>
                      <th className="py-3 px-3 whitespace-nowrap">POD / Admission Date</th>
                      <th className="py-3 px-3 whitespace-nowrap">Admission Day</th>
                      <th className="py-3 px-4 text-right whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0ECF8] text-xs">
                    {filteredPatients.map((p) => {
                      const census = getPatientCensusMeta(p);
                      const isConfirmingListDelete = confirmDeleteListPatientId === p.id;
                      const isDischarged = p.status === 'discharged';

                      return (
                        <tr
                          key={p.id}
                          tabIndex={0}
                          onClick={() => {
                            setSelectedPatientId(p.id);
                            setConfirmDeletePatientId(null);
                            setConfirmDeleteListPatientId(null);
                            setConfirmDeleteNoteId(null);
                            setConfirmDeleteDayKey(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSelectedPatientId(p.id);
                              setConfirmDeletePatientId(null);
                            }
                          }}
                          className={`group transition-colors cursor-pointer focus:outline-none border-l-4 ${
                            isDischarged
                              ? 'bg-[#FFF4E5]/85 hover:bg-[#FFEAD0]/90 focus:bg-[#FFEAD0] border-l-amber-500'
                              : 'bg-white hover:bg-[#F6F3FF]/60 focus:bg-[#F3EEFF]/70 border-l-transparent'
                          }`}
                        >
                          {/* Patient & Bed */}
                          <td className="py-3.5 px-4 align-top">
                            <div className="font-bold text-slate-900 group-hover:text-violet-900">
                              {p.salutation ? `${p.salutation} ` : ''}
                              {p.patientName}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums flex flex-wrap items-center gap-x-1.5">
                              <span>{p.wardOrBed || 'Bed TBD'}</span>
                              {p.ipdNo && (
                                <>
                                  <span>·</span>
                                  <span>{p.ipdNo}</span>
                                </>
                              )}
                              <span>·</span>
                              <span
                                className={
                                  p.status === 'admitted'
                                    ? 'font-semibold text-emerald-700'
                                    : 'inline-flex items-center px-1.5 py-0.2 rounded bg-amber-100 border border-amber-300 font-bold text-amber-900 text-[10px]'
                                }
                              >
                                {p.status === 'admitted' ? 'Admitted' : 'Discharged'}
                              </span>
                            </div>
                          </td>

                          {/* Age / Sex */}
                          <td className="py-3.5 px-3 align-top whitespace-nowrap tabular-nums">
                            <div className="font-semibold text-slate-800">
                              {p.age ? `${p.age} yrs` : '—'} / {p.gender || '—'}
                            </div>
                          </td>

                          {/* Diagnosis */}
                          <td className="py-3.5 px-3 align-top max-w-[260px]">
                            <div className="text-slate-800 font-medium line-clamp-2">
                              {p.admittingDiagnosis || (
                                <span className="text-slate-400 italic font-normal">
                                  Diagnosis pending
                                </span>
                              )}
                            </div>
                            {p.allergies && (
                              <div className="text-[11px] text-rose-700 font-semibold mt-0.5 truncate">
                                Allergy: {p.allergies}
                              </div>
                            )}
                          </td>

                          {/* OT Procedure */}
                          <td className="py-3.5 px-3 align-top max-w-[240px]">
                            {census.otProcedureSummary ? (
                              <div className="flex items-start gap-1.5">
                                <Scissors className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                                <span className="font-semibold text-slate-800 line-clamp-2">
                                  {census.otProcedureSummary}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400">No OT procedure</span>
                            )}
                          </td>

                          {/* POD (if OT done) OR Admission Date (if no OT done) */}
                          <td className="py-3.5 px-3 align-top whitespace-nowrap tabular-nums">
                            {census.hasOt && census.podLabel ? (
                              <div>
                                <div className="font-bold text-violet-800">{census.podLabel}</div>
                                {census.effectiveSurgeryDate && (
                                  <div className="text-[11px] text-slate-500 mt-0.5">
                                    OT: {formatDisplayDate(census.effectiveSurgeryDate)}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div>
                                <div className="font-semibold text-slate-800">
                                  {p.admissionDate ? formatDisplayDate(p.admissionDate) : '—'}
                                </div>
                                <div className="text-[11px] text-slate-500 mt-0.5">
                                  {census.hasOt ? 'OT scheduled' : 'Admission Date'}
                                </div>
                              </div>
                            )}
                          </td>

                          {/* Day of Admission */}
                          <td className="py-3.5 px-3 align-top whitespace-nowrap tabular-nums">
                            <div className="font-bold text-slate-900">
                              {census.admissionDay !== null ? `Day ${census.admissionDay}` : '—'}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {p.status === 'discharged' && census.dischargeRefDate
                                ? `Disch: ${formatDisplayDate(census.dischargeRefDate)}`
                                : p.admissionDate
                                ? `Adm: ${formatDisplayDate(p.admissionDate)}`
                                : 'Stay duration'}
                            </div>
                          </td>

                          {/* Summary & Actions */}
                          <td
                            className="py-3.5 px-4 align-top text-right whitespace-nowrap"
                            onClick={(e) => {
                              if (isConfirmingListDelete) e.stopPropagation();
                            }}
                          >
                            {isConfirmingListDelete ? (
                              <div className="inline-flex items-center gap-1.5 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1">
                                <span className="text-[11px] font-semibold text-rose-800">
                                  Delete?
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmDeleteListPatientId(null);
                                    onDeletePatient(p.id);
                                  }}
                                  className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold cursor-pointer"
                                >
                                  Confirm
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmDeleteListPatientId(null);
                                  }}
                                  className="px-1.5 py-0.5 text-[11px] font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="inline-flex items-center justify-end gap-2">
                                {p.status === 'admitted' && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openQuickDischargeDialog(p);
                                    }}
                                    title={`Discharge ${p.patientName} & mark discharge date in Master Register`}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-amber-950 bg-[#FFF3E0] hover:bg-[#FFE0B2] border border-[#FDBA74] transition-colors cursor-pointer"
                                  >
                                    <LogOut className="w-3 h-3 text-amber-800" />
                                    <span>Discharge</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmDeleteListPatientId(p.id);
                                  }}
                                  title={`Delete ${p.patientName} from IPD list`}
                                  aria-label={`Delete ${p.patientName} from IPD list`}
                                  className="p-1.5 rounded-md text-slate-400 hover:text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-violet-700 group-hover:translate-x-0.5 transition-transform" />
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </aside>

          {/* Right Patient Chart Workspace — Smoothly reveals when a patient is clicked */}
          {selectedPatient && (
            <section
              key={selectedPatient.id}
              className="flex-1 min-w-0 space-y-4 ipd-chart-reveal"
            >
              {/* Patient Summary Header */}
              <div className="bg-white rounded-2xl border border-[#E6E0F0] shadow-2xs overflow-hidden">
                <div className="p-4 sm:p-5 bg-gradient-to-r from-[#F6F3FF]/70 via-[#FDFBF9] to-[#F0F8FF]/60 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-bold text-slate-900">
                          {selectedPatient.salutation ? `${selectedPatient.salutation} ` : ''}
                          {selectedPatient.patientName}
                        </h2>
                        <span className="text-xs font-semibold text-slate-600 tabular-nums">
                          {selectedPatient.age ? `${selectedPatient.age} yrs` : 'Age —'} /{' '}
                          {selectedPatient.gender}
                        </span>
                        <span
                          className={`text-xs font-bold ${
                            selectedPatient.status === 'admitted'
                              ? 'text-emerald-700'
                              : 'text-slate-500'
                          }`}
                        >
                          · {selectedPatient.status === 'admitted' ? 'Admitted' : 'Discharged'}
                        </span>
                        {selectedPodLabel && (
                          <span className="text-xs font-bold text-violet-800 tabular-nums">
                            · {selectedPodLabel}
                          </span>
                        )}
                      {(() => {
                        const dayNum = computeAdmissionDayNumber(
                          selectedPatient.admissionDate,
                          selectedPatient.status === 'discharged'
                            ? selectedPatient.dischargeDate ||
                                selectedPatient.dischargeSummary?.dischargeDate
                            : undefined
                        );
                        return dayNum !== null ? (
                          <span className="text-xs font-semibold text-slate-600 tabular-nums">
                            · Day {dayNum}
                          </span>
                        ) : null;
                      })()}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 tabular-nums">
                      <span>
                        <strong className="text-slate-700">Bed:</strong>{' '}
                        {selectedPatient.wardOrBed || '—'}
                      </span>
                      {selectedPatient.ipdNo && (
                        <span>
                          <strong className="text-slate-700">IPD No:</strong>{' '}
                          {selectedPatient.ipdNo}
                        </span>
                      )}
                      <span>
                        <strong className="text-slate-700">Admitted:</strong>{' '}
                        {formatDisplayDate(selectedPatient.admissionDate)}
                      </span>
                        {(selectedPatient.dischargeDate ||
                          selectedPatient.dischargeSummary?.dischargeDate) && (
                          <span>
                            <strong className="text-slate-700">Discharged:</strong>{' '}
                            {formatDisplayDate(
                              selectedPatient.dischargeDate ||
                                selectedPatient.dischargeSummary?.dischargeDate ||
                                ''
                            )}
                          </span>
                        )}
                        {(selectedPatient.surgeryDate || selectedPatient.otNotes?.surgeryDate) && (
                          <span>
                            <strong className="text-slate-700">Surgery:</strong>{' '}
                            {formatDisplayDate(
                              selectedPatient.surgeryDate ||
                                selectedPatient.otNotes?.surgeryDate ||
                                ''
                            )}
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-slate-800 pt-0.5">
                        <span className="font-semibold text-slate-500 uppercase text-[10px] mr-1.5">
                          Diagnosis:
                        </span>
                        <span className="font-semibold">
                          {selectedPatient.admittingDiagnosis || 'Not specified'}
                        </span>
                        {selectedPatient.allergies && (
                          <span className="ml-3 text-rose-700 font-semibold">
                            Allergies: {selectedPatient.allergies}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Quick Action Buttons — OPD Pastel Palette */}
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingAdmissionPatient(selectedPatient);
                          setIsAdmitModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-800 bg-white hover:bg-[#F6F3FF] border border-[#DFD8F0] transition-colors cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-violet-700" />
                        <span>Edit Admission</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveChartTab('protocol')}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-sky-950 bg-[#E0F2FE] hover:bg-[#BAE6FD] border border-[#7DD3FC] transition-colors cursor-pointer"
                      >
                        <ShieldCheck className="w-3.5 h-3.5 text-sky-800" />
                        <span>
                          Surgical Protocol
                          {selectedProtoStats ? ` (${selectedProtoStats.stats.percent}%)` : ''}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => openDischargeModal('edit')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-violet-950 bg-[#DDD6FE] hover:bg-[#C4B5FD] border border-[#C4B5FD] transition-colors cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5 text-violet-800" />
                        <span>Generate Discharge Summary</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          exportIpdPatientReviewPdf(selectedPatient, doctor);
                          onToast(`Exported IPD review PDF for ${selectedPatient.patientName}`);
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-emerald-950 bg-[#EBFBF3] hover:bg-[#D1FAE5] border border-[#6EE7B7] transition-colors cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5 text-emerald-800" />
                        <span>Export PDF</span>
                      </button>

                      {selectedPatient.status === 'admitted' ? (
                        <button
                          type="button"
                          onClick={() => openQuickDischargeDialog(selectedPatient)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-amber-950 bg-[#FFF3E0] hover:bg-[#FFE0B2] border border-[#FDBA74] transition-colors cursor-pointer"
                          title="Discharge patient, shift to Discharged list, and mark discharge date in Master Register"
                        >
                          <LogOut className="w-3.5 h-3.5 text-amber-800" />
                          <span>Discharge Patient</span>
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold text-amber-950 bg-[#FFF3E0] border border-[#FDBA74]">
                          <CheckCircle2 className="w-3.5 h-3.5 text-amber-700" />
                          <span>
                            Discharged
                            {(selectedPatient.dischargeDate ||
                              selectedPatient.dischargeSummary?.dischargeDate)
                              ? ` · ${formatDisplayDate(
                                  selectedPatient.dischargeDate ||
                                    selectedPatient.dischargeSummary?.dischargeDate ||
                                    ''
                                )}`
                              : ''}
                          </span>
                        </span>
                      )}

                      {confirmDeletePatientId === selectedPatient.id ? (
                        <div className="inline-flex items-center gap-1 bg-rose-50 border border-rose-200 rounded-xl px-2 py-1">
                          <span className="text-[11px] font-semibold text-rose-800">
                            Delete IPD patient?
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const idToDel = selectedPatient.id;
                              setConfirmDeletePatientId(null);
                              setSelectedPatientId(null);
                              onDeletePatient(idToDel);
                            }}
                            className="px-2 py-0.5 rounded-lg bg-rose-600 text-white text-[11px] font-bold hover:bg-rose-700 cursor-pointer"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeletePatientId(null)}
                            className="px-1.5 py-0.5 text-[11px] text-slate-600 hover:text-slate-900 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeletePatientId(selectedPatient.id)}
                          title="Delete IPD Patient Record"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-rose-800 bg-[#FFF1F2] hover:bg-[#FFE4E6] border border-[#FECDD3] transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Chart Section Tabs — Unified OPD Pastel Segmented Strip */}
                <div className="px-4 py-2.5 bg-white border-t border-[#E6E0F0]">
                  <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-[#F4F1FA] border border-[#E3DDF2]">
                    {(
                      [
                        {
                          id: 'admission',
                          label: 'Admission Notes',
                          count:
                            compiledAdmissionNotes &&
                            compiledAdmissionNotes.matchedOpdVisits.length > 0
                              ? `${compiledAdmissionNotes.matchedOpdVisits.length} OPD`
                              : undefined,
                          icon: BookOpen,
                        },
                        {
                          id: 'progress',
                          label: 'Daily Progress',
                          count: (selectedPatient.dailyNotes || []).length,
                          icon: Activity,
                        },
                        {
                          id: 'medications',
                          label: 'Medication Log',
                          count: activeMedsCount,
                          icon: Pill,
                        },
                        {
                          id: 'investigations',
                          label: 'Investigations',
                          count: (selectedPatient.investigationRecords || []).length,
                          icon: FlaskConical,
                        },
                        {
                          id: 'ot',
                          label: 'OT Notes',
                          count: selectedOtCount,
                          icon: Scissors,
                        },
                        {
                          id: 'protocol',
                          label: 'Surgical Protocol',
                          count: selectedProtoStats
                            ? `${selectedProtoStats.stats.percent}%`
                            : undefined,
                          icon: ShieldCheck,
                        },
                        {
                          id: 'discharge-meds',
                          label: 'Discharge Medications',
                          count: selectedDischargeMeds.filter((m) =>
                            (m.medicine || m.drugName || '').trim()
                          ).length,
                          icon: Pill,
                        },
                        {
                          id: 'discharge',
                          label: 'Discharge Summary',
                          count: selectedPatient.dischargeSummary ? 'Saved' : undefined,
                          icon: FileText,
                        },
                      ] as const
                    ).map((tab) => {
                      const Icon = tab.icon;
                      const isActive = activeChartTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setActiveChartTab(tab.id)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                            isActive
                              ? 'bg-violet-700 text-white shadow-2xs'
                              : 'text-slate-600 hover:text-violet-950 hover:bg-white/80'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          <span>{tab.label}</span>
                          {tab.count !== undefined && (
                            <span
                              className={`text-[11px] tabular-nums ${
                                isActive ? 'text-violet-100' : 'text-slate-400'
                              }`}
                            >
                              ({tab.count})
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

                {/* TAB 0: ADMISSION NOTES (OPD SUMMARY + LATEST EXAM + BRIEF HISTORY + LATEST IPSS) */}
                {activeChartTab === 'admission' && compiledAdmissionNotes && (
                  <div className="space-y-4">
                    {/* Admission Clinical Summary Card */}
                    <div className="bg-white rounded-2xl border border-[#E6E0F0] p-4 sm:p-5 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#EFEBF9]">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                            <BookOpen className="w-4 h-4 text-violet-700" />
                            <span>Admission Notes &amp; Pre-Admission OPD Summary</span>
                          </h3>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {compiledAdmissionNotes.matchedOpdVisits.length > 0
                              ? `Linked to ${compiledAdmissionNotes.matchedOpdVisits.length} OPD consultation record${compiledAdmissionNotes.matchedOpdVisits.length === 1 ? '' : 's'} (Latest: ${formatDisplayDate(compiledAdmissionNotes.latestVisit!.date)}).`
                              : 'No matching OPD records found in Master Register. Document admission clinical summary below.'}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {compiledAdmissionNotes.matchedOpdVisits.length > 0 && (
                            <button
                              type="button"
                              onClick={handleRefreshAdmissionNotesFromOpd}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-sky-950 bg-[#E0F2FE] hover:bg-[#BAE6FD] border border-[#7DD3FC] transition-colors cursor-pointer"
                            >
                              <RefreshCw className="w-3.5 h-3.5 text-sky-800" />
                              <span>Sync from OPD Records</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              if (isEditingAdmissionNote) {
                                handleSaveAdmissionNoteText();
                              } else {
                                setAdmissionNoteDraft(
                                  selectedPatient.clinicalSummary ||
                                    compiledAdmissionNotes.formattedAdmissionSummaryText ||
                                    ''
                                );
                                setIsEditingAdmissionNote(true);
                              }
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-violet-950 bg-[#EDE9FE] hover:bg-[#DDD6FE] border border-[#C4B5FD] transition-colors cursor-pointer"
                          >
                            {isEditingAdmissionNote ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-700" />
                                <span>Save Admission Note</span>
                              </>
                            ) : (
                              <>
                                <Edit3 className="w-3.5 h-3.5 text-violet-800" />
                                <span>Edit Admission Note</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Key Admission Metadata Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50/70 rounded-lg p-3 border border-slate-200/70 text-xs">
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Admitting Diagnosis
                          </div>
                          <div className="font-bold text-slate-900 mt-0.5">
                            {selectedPatient.admittingDiagnosis ||
                              compiledAdmissionNotes.latestDiagnosis ||
                              'Not specified'}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Comorbidities / Past History
                          </div>
                          <div className="font-medium text-slate-800 mt-0.5">
                            {selectedPatient.comorbidities ||
                              compiledAdmissionNotes.compiledComorbidities ||
                              'None documented'}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Drug Allergies
                          </div>
                          <div
                            className={`font-semibold mt-0.5 ${
                              selectedPatient.allergies ? 'text-rose-700' : 'text-slate-700'
                            }`}
                          >
                            {selectedPatient.allergies || 'NKDA / Not reported'}
                          </div>
                        </div>
                      </div>

                      {/* Editable or Formatted Admission Note */}
                      {isEditingAdmissionNote ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-slate-700">
                              Admission Clinical Note (Saved on IPD Chart)
                            </label>
                          </div>
                          <textarea
                            rows={6}
                            value={admissionNoteDraft}
                            onChange={(e) => setAdmissionNoteDraft(e.target.value)}
                            placeholder="Document presenting complaints, brief history, examination findings, and plan for admission..."
                            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg outline-none focus:border-teal-600 resize-y leading-relaxed"
                          />
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setAdmissionNoteDraft(selectedPatient.clinicalSummary || '');
                                setIsEditingAdmissionNote(false);
                              }}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={handleSaveAdmissionNoteText}
                              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Save Note</span>
                            </button>
                          </div>
                        </div>
                      ) : selectedPatient.clinicalSummary ? (
                        <div className="rounded-lg border border-slate-200/90 border-l-4 border-l-teal-600 bg-slate-50/40 px-3.5 py-3">
                          <div className="text-[11px] font-extrabold uppercase tracking-wider text-teal-900 mb-1.5">
                            Recorded Admission Clinical Summary
                          </div>
                          <FormattedClinicalNote text={selectedPatient.clinicalSummary} />
                        </div>
                      ) : compiledAdmissionNotes.formattedAdmissionSummaryText ? (
                        <div className="rounded-lg border border-dashed border-teal-300 bg-teal-50/40 px-3.5 py-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-[11px] font-extrabold uppercase tracking-wider text-teal-900">
                              Auto-Compiled Preview from OPD Records
                            </div>
                            <button
                              type="button"
                              onClick={handleRefreshAdmissionNotesFromOpd}
                              className="text-[11px] font-bold text-teal-800 hover:underline cursor-pointer"
                            >
                              Save to Admission Note
                            </button>
                          </div>
                          <FormattedClinicalNote
                            text={compiledAdmissionNotes.formattedAdmissionSummaryText}
                          />
                        </div>
                      ) : (
                        <div className="p-5 text-center border border-dashed border-slate-200 rounded-lg text-xs text-slate-500">
                          No admission summary recorded yet. Click{' '}
                          <strong className="text-slate-700">Edit Admission Note</strong> to add
                          clinical findings or dictate admission notes.
                        </div>
                      )}
                    </div>

                    {/* Latest OPD Visit: Examination, Vitals & Related Clinical Details */}
                    {compiledAdmissionNotes.matchedOpdVisits.length > 0 && (
                      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
                          <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                            <Stethoscope className="w-4 h-4 text-sky-700" />
                            <span>
                              Latest OPD Examination &amp; Clinical Findings
                              {compiledAdmissionNotes.latestExamination
                                ? ` (${formatDisplayDate(compiledAdmissionNotes.latestExamination.visitDate)})`
                                : compiledAdmissionNotes.latestVisit
                                ? ` (${formatDisplayDate(compiledAdmissionNotes.latestVisit.date)})`
                                : ''}
                            </span>
                          </h4>
                          <span className="text-[11px] font-semibold text-slate-500">
                            Pulled from latest OPD record
                          </span>
                        </div>

                        {/* Latest Vitals */}
                        {compiledAdmissionNotes.latestVitals && (
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200/80 text-xs tabular-nums">
                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                              Vitals ({formatDisplayDate(compiledAdmissionNotes.latestVitalsDate)}):
                            </span>
                            {compiledAdmissionNotes.latestVitals.bp && (
                              <span>
                                <strong className="text-slate-600">BP:</strong>{' '}
                                {compiledAdmissionNotes.latestVitals.bp}
                              </span>
                            )}
                            {compiledAdmissionNotes.latestVitals.pulse && (
                              <span>
                                <strong className="text-slate-600">PR:</strong>{' '}
                                {compiledAdmissionNotes.latestVitals.pulse}
                              </span>
                            )}
                            {compiledAdmissionNotes.latestVitals.temp && (
                              <span>
                                <strong className="text-slate-600">Temp:</strong>{' '}
                                {compiledAdmissionNotes.latestVitals.temp}
                              </span>
                            )}
                            {compiledAdmissionNotes.latestVitals.spo2 && (
                              <span>
                                <strong className="text-slate-600">SpO2:</strong>{' '}
                                {compiledAdmissionNotes.latestVitals.spo2}
                              </span>
                            )}
                            {compiledAdmissionNotes.latestVitals.weight && (
                              <span>
                                <strong className="text-slate-600">Wt:</strong>{' '}
                                {compiledAdmissionNotes.latestVitals.weight}
                              </span>
                            )}
                            {compiledAdmissionNotes.latestVitals.bmi && (
                              <span>
                                <strong className="text-slate-600">BMI:</strong>{' '}
                                {compiledAdmissionNotes.latestVitals.bmi}
                              </span>
                            )}
                            {compiledAdmissionNotes.latestVitals.randomBloodSugar && (
                              <span>
                                <strong className="text-slate-600">RBS:</strong>{' '}
                                {compiledAdmissionNotes.latestVitals.randomBloodSugar}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Complaints, Checklist & History */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                          <div className="rounded-lg border border-slate-200/80 bg-slate-50/40 p-3 space-y-2">
                            <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-800 border-b border-slate-200/80 pb-1">
                              Presenting Complaints &amp; History
                            </div>
                            {compiledAdmissionNotes.latestComplaints ? (
                              <div>
                                <div className="font-bold text-slate-900">Chief Complaints</div>
                                <p className="text-slate-800 whitespace-pre-wrap mt-0.5">
                                  {compiledAdmissionNotes.latestComplaints}
                                </p>
                              </div>
                            ) : (
                              <p className="text-slate-400 italic">No chief complaints recorded.</p>
                            )}
                            {compiledAdmissionNotes.latestHistoryText && (
                              <div>
                                <div className="font-bold text-slate-900">History Details</div>
                                <p className="text-slate-800 whitespace-pre-wrap mt-0.5">
                                  {compiledAdmissionNotes.latestHistoryText}
                                </p>
                              </div>
                            )}
                            {compiledAdmissionNotes.historyChecklistFlags.length > 0 && (
                              <div>
                                <div className="font-bold text-slate-900 mb-1">
                                  Positive Clinical History Flags
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {compiledAdmissionNotes.historyChecklistFlags.map((flag, i) => (
                                    <span
                                      key={i}
                                      className="px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-900 font-semibold text-[11px]"
                                    >
                                      {flag}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {compiledAdmissionNotes.pastMedication && (
                              <div>
                                <div className="font-bold text-slate-900">Past Medication / Procedures</div>
                                <p className="text-slate-800 mt-0.5">
                                  {compiledAdmissionNotes.pastMedication}
                                </p>
                              </div>
                            )}
                          </div>

                          {/* Latest Visit Examination */}
                          <div className="rounded-lg border border-sky-200/80 bg-sky-50/25 p-3 space-y-2">
                            <div className="text-[11px] font-extrabold uppercase tracking-wider text-sky-900 border-b border-sky-200/80 pb-1">
                              Physical &amp; Urological Examination
                              {compiledAdmissionNotes.latestExamination && (
                                <span className="ml-1.5 font-mono text-[10px] font-semibold text-sky-700">
                                  ({formatDisplayDate(compiledAdmissionNotes.latestExamination.visitDate)})
                                </span>
                              )}
                            </div>
                            {compiledAdmissionNotes.latestExamination ? (
                              <div className="space-y-2">
                                {compiledAdmissionNotes.latestExamination.systemicExamination && (
                                  <div>
                                    <div className="font-bold text-slate-900">
                                      Systemic Examination
                                    </div>
                                    <p className="text-slate-800 whitespace-pre-wrap mt-0.5">
                                      {compiledAdmissionNotes.latestExamination.systemicExamination}
                                    </p>
                                  </div>
                                )}
                                {compiledAdmissionNotes.latestExamination.genitalExamination && (
                                  <div>
                                    <div className="font-bold text-slate-900">
                                      Local / Genital Examination
                                    </div>
                                    <p className="text-slate-800 whitespace-pre-wrap mt-0.5">
                                      {compiledAdmissionNotes.latestExamination.genitalExamination}
                                    </p>
                                  </div>
                                )}
                                {compiledAdmissionNotes.latestExamination.perRectalExam && (
                                  <div>
                                    <div className="font-bold text-slate-900">
                                      Per-Rectal (DRE) Examination
                                    </div>
                                    <p className="text-slate-800 whitespace-pre-wrap mt-0.5">
                                      {compiledAdmissionNotes.latestExamination.perRectalExam}
                                    </p>
                                  </div>
                                )}
                                {compiledAdmissionNotes.latestExamination.examinationNotes && (
                                  <div>
                                    <div className="font-bold text-slate-900">
                                      Additional Examination Notes
                                    </div>
                                    <p className="text-slate-800 whitespace-pre-wrap mt-0.5">
                                      {compiledAdmissionNotes.latestExamination.examinationNotes}
                                    </p>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <p className="text-slate-500 italic">
                                No physical examination notes recorded on prior OPD visits.
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Latest OPD Prescriptions Preview */}
                        {compiledAdmissionNotes.latestPrescriptions.length > 0 && (
                          <div className="rounded-lg border border-slate-200/80 bg-white p-3 space-y-1.5 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700">
                                Pre-Admission OPD Medications (Latest Visit)
                              </span>
                              <button
                                type="button"
                                onClick={() => setActiveChartTab('medications')}
                                className="text-[11px] font-semibold text-teal-700 hover:underline cursor-pointer"
                              >
                                Open IPD Medication Log →
                              </button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                              {compiledAdmissionNotes.latestPrescriptions.map((rx, idx) => (
                                <div
                                  key={idx}
                                  className="px-2.5 py-1.5 rounded bg-slate-50 border border-slate-200/70 text-slate-800"
                                >
                                  <span className="font-bold text-slate-900">
                                    {idx + 1}. {rx.medicine || rx.drugName}
                                    {rx.dosage ? ` ${rx.dosage}` : ''}
                                  </span>
                                  {(rx.frequency || rx.duration) && (
                                    <span className="text-slate-600 ml-1">
                                      — {[rx.frequency, rx.duration].filter(Boolean).join(' · ')}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Latest IPSS Score Table (when available from any OPD visit) */}
                    {compiledAdmissionNotes.latestIpss && (
                      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
                          <h4 className="text-sm font-bold text-slate-900">
                            Latest IPSS Score Table
                          </h4>
                          <span className="text-xs font-mono font-semibold text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded">
                            Recorded on {formatDisplayDate(compiledAdmissionNotes.latestIpss.visitDate)}
                          </span>
                        </div>
                        <div className="overflow-x-auto rounded-lg border border-slate-200">
                          <table className="w-full text-xs border-collapse">
                            <thead>
                              <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                                <th className="py-2 px-2.5 text-left font-bold">Frequency (F)</th>
                                <th className="py-2 px-2.5 text-left font-bold">Urgency (U)</th>
                                <th className="py-2 px-2.5 text-left font-bold">Nocturia (N)</th>
                                <th className="py-2 px-2.5 text-left font-bold">Poor Flow (P)</th>
                                <th className="py-2 px-2.5 text-left font-bold">Intermittency (I)</th>
                                <th className="py-2 px-2.5 text-left font-bold">Straining (S)</th>
                                <th className="py-2 px-2.5 text-left font-bold">SOIE</th>
                                <th className="py-2 px-2.5 text-center font-extrabold bg-teal-50 text-teal-900">
                                  Total
                                </th>
                                <th className="py-2 px-2.5 text-center font-extrabold bg-teal-50 text-teal-900">
                                  QoL
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="bg-white text-slate-900 font-semibold">
                                <td className="py-2 px-2.5 border-r border-slate-100">
                                  {compiledAdmissionNotes.latestIpss.frequency || '—'}
                                </td>
                                <td className="py-2 px-2.5 border-r border-slate-100">
                                  {compiledAdmissionNotes.latestIpss.urgency || '—'}
                                </td>
                                <td className="py-2 px-2.5 border-r border-slate-100">
                                  {compiledAdmissionNotes.latestIpss.nocturia || '—'}
                                </td>
                                <td className="py-2 px-2.5 border-r border-slate-100">
                                  {compiledAdmissionNotes.latestIpss.poorFlow || '—'}
                                </td>
                                <td className="py-2 px-2.5 border-r border-slate-100">
                                  {compiledAdmissionNotes.latestIpss.intermittency || '—'}
                                </td>
                                <td className="py-2 px-2.5 border-r border-slate-100">
                                  {compiledAdmissionNotes.latestIpss.straining || '—'}
                                </td>
                                <td className="py-2 px-2.5 border-r border-slate-100">
                                  {compiledAdmissionNotes.latestIpss.incompleteEvacuation || '—'}
                                </td>
                                <td className="py-2 px-2.5 text-center font-extrabold text-teal-900 bg-teal-50/50 border-r border-slate-100 tabular-nums">
                                  {compiledAdmissionNotes.latestIpss.scoreTotal || '—'}
                                </td>
                                <td className="py-2 px-2.5 text-center font-extrabold text-teal-900 bg-teal-50/50 tabular-nums">
                                  {compiledAdmissionNotes.latestIpss.qualityOfLife || '—'}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                        {(compiledAdmissionNotes.latestIpss.hesitancy ||
                          compiledAdmissionNotes.latestIpss.secondVoid ||
                          compiledAdmissionNotes.latestIpss.postVoidDribble) && (
                          <div className="flex flex-wrap gap-4 text-xs text-slate-700 pt-1">
                            {compiledAdmissionNotes.latestIpss.hesitancy && (
                              <span>
                                <strong>Hesitancy:</strong>{' '}
                                {compiledAdmissionNotes.latestIpss.hesitancy}
                              </span>
                            )}
                            {compiledAdmissionNotes.latestIpss.secondVoid && (
                              <span>
                                <strong>Second Void:</strong>{' '}
                                {compiledAdmissionNotes.latestIpss.secondVoid}
                              </span>
                            )}
                            {compiledAdmissionNotes.latestIpss.postVoidDribble && (
                              <span>
                                <strong>Post-Void Dribble:</strong>{' '}
                                {compiledAdmissionNotes.latestIpss.postVoidDribble}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Brief History Across OPD Visits (especially valuable when multiple visits exist) */}
                    {compiledAdmissionNotes.briefVisitHistory.length > 0 && (
                      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
                          <h4 className="text-sm font-bold text-slate-900">
                            Brief OPD Visit History ({compiledAdmissionNotes.briefVisitHistory.length}{' '}
                            {compiledAdmissionNotes.briefVisitHistory.length === 1
                              ? 'Visit'
                              : 'Visits'}
                            )
                          </h4>
                          {compiledAdmissionNotes.briefVisitHistory.length > 1 && (
                            <span className="text-[11px] font-semibold text-slate-500">
                              Chronological summary (latest first)
                            </span>
                          )}
                        </div>
                        <div className="divide-y divide-slate-100">
                          {compiledAdmissionNotes.briefVisitHistory.map((visit, idx) => (
                            <div key={visit.id} className="py-2.5 first:pt-0 last:pb-0 text-xs">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold text-slate-900">
                                    {formatDisplayDate(visit.date)}
                                  </span>
                                  {idx === 0 && (
                                    <span className="px-1.5 py-0.5 rounded bg-teal-50 border border-teal-200 text-teal-800 text-[10px] font-bold">
                                      Latest Visit
                                    </span>
                                  )}
                                  {visit.hasExam && (
                                    <span className="px-1.5 py-0.5 rounded bg-sky-50 border border-sky-200 text-sky-800 text-[10px] font-semibold">
                                      Exam
                                    </span>
                                  )}
                                  {visit.hasIpss && (
                                    <span className="px-1.5 py-0.5 rounded bg-violet-50 border border-violet-200 text-violet-800 text-[10px] font-semibold">
                                      IPSS
                                    </span>
                                  )}
                                </div>
                                {visit.diagnosis && (
                                  <span className="font-bold text-slate-800">
                                    {visit.diagnosis}
                                  </span>
                                )}
                              </div>
                              {visit.complaints && (
                                <div className="text-slate-700 mt-1">
                                  <strong className="text-slate-800">Complaints:</strong>{' '}
                                  {visit.complaints}
                                </div>
                              )}
                              {visit.assessmentPlan && (
                                <div className="text-slate-700 mt-0.5">
                                  <strong className="text-slate-800">Plan:</strong>{' '}
                                  {visit.assessmentPlan}
                                </div>
                              )}
                              {visit.medicationsSummary && (
                                <div className="text-slate-500 mt-0.5">
                                  <strong className="text-slate-600">Rx:</strong>{' '}
                                  {visit.medicationsSummary}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 1: DAILY PROGRESS NOTES */}
                {activeChartTab === 'progress' && (
                  <div className="space-y-4">
                    <form
                      onSubmit={handleAddDailyNote}
                      className="bg-white rounded-xl border border-slate-200 p-4 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-bold text-slate-900">
                          Add Daily Progress Note &amp; Vitals
                        </h3>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1.5 text-xs text-slate-600">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <input
                              type="date"
                              value={noteDate}
                              onChange={(e) => setNoteDate(e.target.value)}
                              className="px-2 py-1 text-xs border border-slate-200 rounded-lg bg-slate-50 font-mono"
                            />
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-slate-600">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <input
                              type="time"
                              value={noteTime}
                              onChange={(e) => setNoteTime(e.target.value)}
                              className="px-2 py-1 text-xs border border-slate-200 rounded-lg bg-slate-50 font-mono"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Compact Vitals & Output Strip */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                        <input
                          type="text"
                          value={noteBp}
                          onChange={(e) => setNoteBp(e.target.value)}
                          placeholder="BP (120/80)"
                          className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-teal-500"
                        />
                        <input
                          type="text"
                          value={notePulse}
                          onChange={(e) => setNotePulse(e.target.value)}
                          placeholder="Pulse (bpm)"
                          className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-teal-500"
                        />
                        <input
                          type="text"
                          value={noteTemp}
                          onChange={(e) => setNoteTemp(e.target.value)}
                          placeholder="Temp (°F)"
                          className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-teal-500"
                        />
                        <input
                          type="text"
                          value={noteSpo2}
                          onChange={(e) => setNoteSpo2(e.target.value)}
                          placeholder="SpO2 (%)"
                          className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-teal-500"
                        />
                        <input
                          type="text"
                          value={noteUrineOutput}
                          onChange={(e) => setNoteUrineOutput(e.target.value)}
                          placeholder="Urine Output"
                          className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-teal-500"
                        />
                        <input
                          type="text"
                          value={noteDrainOutput}
                          onChange={(e) => setNoteDrainOutput(e.target.value)}
                          placeholder="Drain Output"
                          className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-teal-500"
                        />
                        <input
                          type="text"
                          value={noteIntakeOutput}
                          onChange={(e) => setNoteIntakeOutput(e.target.value)}
                          placeholder="I/O Balance"
                          className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-teal-500"
                        />
                      </div>

                      {/* SOAP Textareas */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="text-[11px] font-semibold text-slate-700">
                              Subjective / Complaints
                            </label>
                          </div>
                          <textarea
                            rows={3}
                            value={noteSubjective}
                            onChange={(e) => setNoteSubjective(e.target.value)}
                            placeholder="Pain score, oral intake, flatus/stool, hematuria..."
                            className="w-full px-2.5 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-teal-500 resize-y"
                          />
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="text-[11px] font-semibold text-slate-700">
                              Objective / Examination
                            </label>
                          </div>
                          <textarea
                            rows={3}
                            value={noteObjective}
                            onChange={(e) => setNoteObjective(e.target.value)}
                            placeholder="Afebrile, P/A soft NT, wound dry, catheter draining clear..."
                            className="w-full px-2.5 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-teal-500 resize-y"
                          />
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="text-[11px] font-semibold text-slate-700">
                              Assessment &amp; Plan
                            </label>
                          </div>
                          <textarea
                            rows={3}
                            value={noteAssessmentPlan}
                            onChange={(e) => setNoteAssessmentPlan(e.target.value)}
                            placeholder="Continue IV antibiotics, ambulate, plan drain/catheter removal..."
                            className="w-full px-2.5 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-teal-500 resize-y"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <button
                          type="submit"
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Save Daily Note</span>
                        </button>
                      </div>
                    </form>

                    {/* Cohesive, Non-Repetitive Daily Progress Timeline */}
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                      <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                          Daily Progress Timeline
                        </h3>
                        <div className="flex items-center gap-2.5 flex-wrap">
                          {selectedPatient.otNotes?.postOpOrders && (
                            <button
                              type="button"
                              onClick={handleSyncPostOpMedsToLog}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-teal-50 hover:bg-teal-100 border border-teal-200 text-[11px] font-bold text-teal-900 cursor-pointer"
                              title="Extract medications from OT Post-Op Orders into the Medication Log"
                            >
                              <Pill className="w-3 h-3 text-teal-700" />
                              <span>Sync Post-Op Meds</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setActiveChartTab('medications')}
                            className="text-[11px] font-semibold text-teal-800 hover:underline cursor-pointer"
                          >
                            Medication Log
                          </button>
                          <span className="text-slate-300">|</span>
                          <button
                            type="button"
                            onClick={() => setActiveChartTab('protocol')}
                            className="text-[11px] font-semibold text-violet-800 hover:underline cursor-pointer"
                          >
                            Surgical Protocol
                          </button>
                        </div>
                      </div>

                      {(() => {
                        const sortedNotes = getNormalizedDailyNotesForPatient(selectedPatient);
                        const notesByDate = new Map<string, IpdDailyNote[]>();
                        const dischargeNotesByDate = new Map<string, IpdDailyNote[]>();

                        for (const note of sortedNotes) {
                          const dKey = note.date || getTodayIso();
                          if (isDischargeProtocolDailyNote(note)) {
                            const dList = dischargeNotesByDate.get(dKey) || [];
                            dList.push(note);
                            dischargeNotesByDate.set(dKey, dList);
                          } else {
                            const list = notesByDate.get(dKey) || [];
                            list.push(note);
                            notesByDate.set(dKey, list);
                          }
                        }
                        // Ensure dates with synced daily medication lists also appear in Daily Progress Timeline
                        for (const medDateKey of getSavedDailyMedicationDates(selectedPatient)) {
                          if (!notesByDate.has(medDateKey)) {
                            notesByDate.set(medDateKey, []);
                          }
                        }

                        const allTimelineDates = Array.from(
                          new Set([...notesByDate.keys(), ...dischargeNotesByDate.keys()])
                        ).sort((a, b) => a.localeCompare(b));

                        if (allTimelineDates.length === 0) {
                          return (
                            <div className="p-8 text-center text-xs text-slate-500">
                              No daily progress notes recorded yet. Add today&apos;s ward round note
                              above, check off items in Surgical Protocol, confirm medications in
                              Medication Log, or add OT Notes to populate this timeline.
                            </div>
                          );
                        }

                        return (
                          <div className="divide-y divide-slate-200">
                            {allTimelineDates.map((dateKey) => {
                              const dayNotes = notesByDate.get(dateKey);
                              const dischargeDayNotes = dischargeNotesByDate.get(dateKey);
                              const resolvedMeds = getResolvedDailyMedicationsForDate(
                                selectedPatient,
                                dateKey
                              );
                              const consolidated = dayNotes
                                ? consolidateDailyNotesForDate(
                                    dayNotes,
                                    resolvedMeds.items.length > 0
                                  )
                                : null;
                              const dayPod = dayNotes
                                ? formatDailyProgressPodLabel(
                                    dayNotes.find((dn) => dn.podLabel)?.podLabel,
                                    selectedPatient.surgeryDate,
                                    dateKey
                                  )
                                : '';
                              const isManagingEntries = expandedManageDayKey === dateKey;
                              const dischargeConsolidated = dischargeDayNotes
                                ? consolidateDailyNotesForDate(dischargeDayNotes, false)
                                : null;

                              return (
                                <React.Fragment key={dateKey}>
                                  {dayNotes && consolidated && (
                                    <div className="px-4 py-4 space-y-3">
                                      {/* Date Header */}
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex flex-wrap items-center gap-2 text-xs">
                                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                          <span className="font-bold text-slate-900 font-mono tabular-nums">
                                            {formatDisplayDate(dateKey)}
                                          </span>
                                          {dayPod && (
                                            <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200/90 text-[11px] font-bold text-slate-800 tracking-wide">
                                              {dayPod}
                                            </span>
                                          )}
                                          {resolvedMeds.items.length > 0 && (
                                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600">
                                              <Pill className="w-3 h-3 text-slate-400" />
                                              <span>
                                                {resolvedMeds.items.length} med
                                                {resolvedMeds.items.length === 1 ? '' : 's'}
                                              </span>
                                            </span>
                                          )}
                                          {consolidated.authors.length > 0 && (
                                            <span className="text-slate-400">
                                              · {consolidated.authors.join(', ')}
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setPrintPreviewIsDischarge(false);
                                              setPrintPreviewDateKey(dateKey);
                                            }}
                                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#F6F3FF] hover:bg-[#ECE5FF] border border-[#DDD4F2] text-[11px] font-semibold text-violet-900 transition-colors cursor-pointer"
                                            title={`Preview & print clinical notes for ${formatDisplayDate(dateKey)}`}
                                          >
                                            <Printer className="w-3 h-3" />
                                            <span>Preview / Print</span>
                                          </button>
                                      {dayNotes.length > 1 && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setExpandedManageDayKey(
                                              isManagingEntries ? null : dateKey
                                            )
                                          }
                                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-50 hover:bg-slate-100 border border-slate-200 text-[11px] font-semibold text-slate-600 cursor-pointer"
                                          title="Manage or delete individual entries for this date"
                                        >
                                          <span>
                                            {isManagingEntries
                                              ? 'Hide Entries'
                                              : `Entries (${dayNotes.length})`}
                                          </span>
                                        </button>
                                      )}
                                      {dayNotes.length === 1 &&
                                        (confirmDeleteNoteId === dayNotes[0].id ? (
                                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 border border-rose-200 text-[11px]">
                                            <span className="font-semibold text-rose-800">
                                              Delete note?
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                handleDeleteDailyNote(dayNotes[0].id)
                                              }
                                              className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer"
                                            >
                                              Confirm
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => setConfirmDeleteNoteId(null)}
                                              className="px-1.5 py-0.5 text-slate-600 hover:text-slate-900 cursor-pointer"
                                            >
                                              Cancel
                                            </button>
                                          </div>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setConfirmDeleteDayKey(null);
                                              setConfirmDeleteNoteId(dayNotes[0].id);
                                            }}
                                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 text-[11px] font-semibold text-slate-600 hover:text-rose-700 cursor-pointer"
                                            title="Delete daily progress note"
                                          >
                                            <Trash2 className="w-3 h-3" />
                                            <span>Delete</span>
                                          </button>
                                        ))}
                                      {dayNotes.length > 1 &&
                                        (confirmDeleteDayKey === dateKey ? (
                                          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-rose-50 border border-rose-200 text-[11px]">
                                            <span className="font-semibold text-rose-800">
                                              Delete all {dayNotes.length} notes?
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                handleDeleteDailyNotesForDate(dateKey)
                                              }
                                              className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer"
                                            >
                                              Confirm
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => setConfirmDeleteDayKey(null)}
                                              className="px-1.5 py-0.5 text-slate-600 hover:text-slate-900 cursor-pointer"
                                            >
                                              Cancel
                                            </button>
                                          </div>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setConfirmDeleteNoteId(null);
                                              setConfirmDeleteDayKey(dateKey);
                                            }}
                                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-rose-50/70 hover:bg-rose-100 border border-rose-200 text-[11px] font-semibold text-rose-700 cursor-pointer"
                                            title={`Delete all progress notes on ${formatDisplayDate(dateKey)}`}
                                          >
                                            <Trash2 className="w-3 h-3" />
                                            <span>Delete Day</span>
                                          </button>
                                        ))}
                                    </div>
                                  </div>

                                  {/* Optional Expanded Individual Entry Controls (when multiple notes exist on this date) */}
                                  {isManagingEntries && dayNotes.length > 1 && (
                                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
                                      <div className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">
                                        Individual Saved Entries for {formatDisplayDate(dateKey)}
                                      </div>
                                      {dayNotes.map((n) => {
                                        const sourceLabel = n.id.startsWith('ot-postop-')
                                          ? 'OT Post-Op Orders'
                                          : n.id.startsWith('protocol-daily-')
                                          ? 'Surgical Protocol Progress'
                                          : n.id.startsWith('med-sync-')
                                          ? 'Medication Sync'
                                          : 'Ward Round Note';
                                        return (
                                          <div
                                            key={n.id}
                                            className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-white border border-slate-200/80 text-xs"
                                          >
                                            <div className="flex items-center gap-2 min-w-0">
                                              <span className="font-mono text-[11px] text-slate-500">
                                                {n.time || '—'}
                                              </span>
                                              <span className="font-semibold text-slate-800 truncate">
                                                {sourceLabel}
                                              </span>
                                            </div>
                                            {confirmDeleteNoteId === n.id ? (
                                              <div className="inline-flex items-center gap-1 text-[11px]">
                                                <button
                                                  type="button"
                                                  onClick={() => handleDeleteDailyNote(n.id)}
                                                  className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer"
                                                >
                                                  Confirm
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => setConfirmDeleteNoteId(null)}
                                                  className="px-1.5 py-0.5 text-slate-600 cursor-pointer"
                                                >
                                                  Cancel
                                                </button>
                                              </div>
                                            ) : (
                                              <button
                                                type="button"
                                                onClick={() => setConfirmDeleteNoteId(n.id)}
                                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold text-rose-700 hover:bg-rose-50 cursor-pointer"
                                              >
                                                <Trash2 className="w-3 h-3" />
                                                <span>Delete</span>
                                              </button>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}

                                  {/* Consolidated Vitals & I/O Strip */}
                                  {consolidated.vitalsEntries.length > 0 && (
                                    <div className="space-y-1.5">
                                      {consolidated.vitalsEntries.map((ve) => (
                                        <div
                                          key={ve.noteId}
                                          className="text-xs font-mono tabular-nums text-slate-700 bg-slate-50 border border-slate-200/80 rounded-md px-3 py-1.5 flex flex-wrap items-center gap-x-2 gap-y-1"
                                        >
                                          {ve.time && (
                                            <span className="font-bold text-slate-500">
                                              {ve.time}
                                            </span>
                                          )}
                                          <span>{ve.items.join('  ·  ')}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {/* Unified Clinical Progress Card for this Date */}
                                  {(consolidated.combinedSubjective ||
                                    consolidated.combinedObjective ||
                                    consolidated.combinedAssessmentPlan) && (
                                    <div className="rounded-lg border border-slate-200/85 bg-slate-50/25 divide-y divide-slate-200/75">
                                      {consolidated.combinedSubjective && (
                                        <div className="px-4 py-3">
                                          <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                                            Clinical Context
                                          </div>
                                          <FormattedClinicalNote
                                            text={consolidated.combinedSubjective}
                                            omitRedundantHeading={dayPod}
                                          />
                                        </div>
                                      )}
                                      {consolidated.combinedObjective && (
                                        <div className="px-4 py-3">
                                          <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                                            Examination &amp; Monitoring
                                          </div>
                                          <FormattedClinicalNote
                                            text={consolidated.combinedObjective}
                                            omitRedundantHeading={dayPod}
                                          />
                                        </div>
                                      )}
                                      {consolidated.combinedAssessmentPlan && (
                                        <div className="px-4 py-3">
                                          <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                                            Instructions &amp; Plan
                                          </div>
                                          <FormattedClinicalNote
                                            text={consolidated.combinedAssessmentPlan}
                                            omitRedundantHeading={dayPod}
                                          />
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* If this date only has confirmed medications and no clinical progress notes yet */}
                                  {!consolidated.combinedSubjective &&
                                    !consolidated.combinedObjective &&
                                    !consolidated.combinedAssessmentPlan &&
                                    consolidated.vitalsEntries.length === 0 &&
                                    resolvedMeds.items.length > 0 && (
                                      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200/80 text-xs text-slate-600">
                                        <span className="flex items-center gap-1.5">
                                          <Pill className="w-3.5 h-3.5 text-violet-700" />
                                          <span>
                                            {resolvedMeds.items.length} medication
                                            {resolvedMeds.items.length === 1 ? '' : 's'} charted for{' '}
                                            {formatDisplayDate(dateKey)} (included automatically in
                                            Print / PDF).
                                          </span>
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setMarDate(dateKey);
                                            setActiveChartTab('medications');
                                          }}
                                          className="text-[11px] font-semibold text-violet-800 hover:underline cursor-pointer"
                                        >
                                          View in Medication Log
                                        </button>
                                      </div>
                                    )}
                                    </div>
                                  )}

                                  {/* Dedicated Discharge Protocol Section (separate from that day's POD orders) */}
                                  {dischargeDayNotes &&
                                    dischargeConsolidated &&
                                    (dischargeConsolidated.combinedSubjective ||
                                      dischargeConsolidated.combinedObjective ||
                                      dischargeConsolidated.combinedAssessmentPlan) && (
                                      <div className="px-4 py-4 space-y-3 bg-emerald-50/15">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                          <div className="flex flex-wrap items-center gap-2 text-xs">
                                            <LogOut className="w-3.5 h-3.5 text-emerald-700" />
                                            <span className="font-bold text-slate-900">
                                              Discharge on{' '}
                                              <span className="font-mono tabular-nums">
                                                {formatDisplayDate(dateKey)}
                                              </span>
                                            </span>
                                            <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200/90 text-[11px] font-bold text-emerald-800 tracking-wide">
                                              Discharge
                                            </span>
                                            {dischargeConsolidated.authors.length > 0 && (
                                              <span className="text-slate-400">
                                                · {dischargeConsolidated.authors.join(', ')}
                                              </span>
                                            )}
                                          </div>

                                          <div className="flex items-center gap-2 flex-wrap">
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setPrintPreviewIsDischarge(true);
                                                setPrintPreviewDateKey(dateKey);
                                              }}
                                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#F6F3FF] hover:bg-[#ECE5FF] border border-[#DDD4F2] text-[11px] font-semibold text-violet-900 transition-colors cursor-pointer"
                                              title={`Preview & print Discharge protocol notes for ${formatDisplayDate(dateKey)}`}
                                            >
                                              <Printer className="w-3 h-3" />
                                              <span>Preview / Print</span>
                                            </button>
                                            {confirmDeleteNoteId === dischargeDayNotes[0].id ? (
                                              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 border border-rose-200 text-[11px]">
                                                <span className="font-semibold text-rose-800">
                                                  Delete discharge note?
                                                </span>
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    handleDeleteDailyNote(dischargeDayNotes[0].id)
                                                  }
                                                  className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer"
                                                >
                                                  Confirm
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => setConfirmDeleteNoteId(null)}
                                                  className="px-1.5 py-0.5 text-slate-600 hover:text-slate-900 cursor-pointer"
                                                >
                                                  Cancel
                                                </button>
                                              </div>
                                            ) : (
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setConfirmDeleteDayKey(null);
                                                  setConfirmDeleteNoteId(dischargeDayNotes[0].id);
                                                }}
                                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 text-[11px] font-semibold text-slate-600 hover:text-rose-700 cursor-pointer"
                                                title="Delete discharge protocol entry"
                                              >
                                                <Trash2 className="w-3 h-3" />
                                                <span>Delete</span>
                                              </button>
                                            )}
                                          </div>
                                        </div>

                                        <div className="rounded-lg border border-slate-200/85 bg-white divide-y divide-slate-200/75">
                                          {dischargeConsolidated.combinedSubjective && (
                                            <div className="px-4 py-3">
                                              <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                                                Clinical Context
                                              </div>
                                              <FormattedClinicalNote
                                                text={dischargeConsolidated.combinedSubjective}
                                                omitRedundantHeading="Discharge"
                                              />
                                            </div>
                                          )}
                                          {dischargeConsolidated.combinedObjective && (
                                            <div className="px-4 py-3">
                                              <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                                                Examination &amp; Monitoring
                                              </div>
                                              <FormattedClinicalNote
                                                text={dischargeConsolidated.combinedObjective}
                                                omitRedundantHeading="Discharge"
                                              />
                                            </div>
                                          )}
                                          {dischargeConsolidated.combinedAssessmentPlan && (
                                            <div className="px-4 py-3">
                                              <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                                                Instructions &amp; Plan
                                              </div>
                                              <FormattedClinicalNote
                                                text={dischargeConsolidated.combinedAssessmentPlan}
                                                omitRedundantHeading="Discharge"
                                              />
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                </React.Fragment>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* TAB 2: MEDICATION CHART & DAILY CONFIRMED MEDICATION LISTS */}
                {activeChartTab === 'medications' && (
                  <div className="space-y-4">
                    {/* Add Medication Order Form + Medicine Master Groups */}
                    <div className="bg-white rounded-2xl border border-[#E6E0F0] shadow-xs p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-[#EFEAFE] text-violet-700 flex items-center justify-center">
                            <Pill className="w-4 h-4" />
                          </div>
                          <h3 className="text-sm font-bold text-slate-900">
                            Inpatient Medication Orders
                          </h3>
                        </div>
                        <div className="flex flex-wrap items-center gap-2.5">
                          {selectedPatient.otNotes?.postOpOrders && (
                            <button
                              type="button"
                              onClick={handleSyncPostOpMedsToLog}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#EBFBF3] hover:bg-[#DCFCE7] border border-[#A7F3D0] text-xs font-bold text-emerald-900 cursor-pointer"
                            >
                              <RefreshCw className="w-3 h-3 text-emerald-700" />
                              <span>Sync from OT Post-Op Orders</span>
                            </button>
                          )}
                          <span className="text-xs text-slate-500">
                            Auto-fills Master List notes (e.g. Tab Pyridium)
                          </span>
                        </div>
                      </div>

                      <MedicinePresetsBar
                        onAddMedicinePreset={handleAddPresetToIpdMeds}
                        onApplyMedicationGroup={handleApplyMedicationGroupToIpd}
                        onOpenMedicineMaster={onOpenMedicineMaster}
                        doctorUid={doctor?.uid}
                      />

                      <form
                        onSubmit={handleAddMedicationOrder}
                        className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 pt-2 border-t border-slate-100"
                      >
                        <div className="sm:col-span-4">
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Medicine Name *
                          </label>
                          <input
                            type="text"
                            list="suggest-medicine"
                            value={medName}
                            onChange={(e) => handleMedNameChange(e.target.value)}
                            placeholder="e.g., Inj Ceftriaxone 1g / Tab Pyridium"
                            required
                            className="w-full px-2.5 py-1.5 text-xs border border-[#DFD8EC] rounded-lg outline-none focus:border-violet-500"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Dosage
                          </label>
                          <input
                            type="text"
                            list="suggest-dosage"
                            value={medDosage}
                            onChange={(e) => setMedDosage(e.target.value)}
                            placeholder="1g / 200mg"
                            className="w-full px-2.5 py-1.5 text-xs border border-[#DFD8EC] rounded-lg outline-none focus:border-violet-500"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Route
                          </label>
                          <select
                            value={medRoute}
                            onChange={(e) =>
                              setMedRoute(e.target.value as IpdMedicationOrder['route'])
                            }
                            className="w-full px-2 py-1.5 text-xs border border-[#DFD8EC] rounded-lg bg-white outline-none focus:border-violet-500"
                          >
                            <option value="IV">IV</option>
                            <option value="Oral (PO)">Oral (PO)</option>
                            <option value="IM">IM</option>
                            <option value="SC">SC</option>
                            <option value="Topical">Topical</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Frequency
                          </label>
                          <input
                            type="text"
                            list="suggest-frequency"
                            value={medFrequency}
                            onChange={(e) => setMedFrequency(e.target.value)}
                            placeholder="BD / TDS / OD"
                            className="w-full px-2.5 py-1.5 text-xs border border-[#DFD8EC] rounded-lg outline-none focus:border-violet-500"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Start Date
                          </label>
                          <input
                            type="date"
                            value={medStartDate}
                            onChange={(e) => setMedStartDate(e.target.value)}
                            className="w-full px-2 py-1.5 text-xs border border-[#DFD8EC] rounded-lg font-mono"
                          />
                        </div>

                        <div className="sm:col-span-4">
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Timing / When
                          </label>
                          <input
                            type="text"
                            value={medWhen}
                            onChange={(e) => setMedWhen(e.target.value)}
                            placeholder="After food / Slow IV / HS"
                            className="w-full px-2.5 py-1.5 text-xs border border-[#DFD8EC] rounded-lg outline-none focus:border-violet-500"
                          />
                        </div>
                        <div className="sm:col-span-6">
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-[11px] font-semibold text-slate-600">
                              Clinical Note / Patient Counselling
                            </label>
                          </div>
                          <input
                            type="text"
                            value={medNotes}
                            onChange={(e) => setMedNotes(e.target.value)}
                            placeholder="e.g., Dilute in 100ml NS / May cause red-orange urine"
                            className="w-full px-2.5 py-1.5 text-xs border border-[#DFD8EC] rounded-lg outline-none focus:border-violet-500"
                          />
                        </div>
                        <div className="sm:col-span-2 flex items-end">
                          <button
                            type="submit"
                            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-violet-700 hover:bg-violet-800 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add Med</span>
                          </button>
                        </div>
                      </form>
                    </div>

                    {/* Medication Chart — Confirm / Hold / Delete per medication for selected date */}
                    {(() => {
                      const activeDate = marDate || getTodayIso();
                      const activeDatePod = formatPodLabel(selectedPatient.surgeryDate, activeDate);
                      const fallbackStart =
                        selectedPatient.surgeryDate || selectedPatient.admissionDate || activeDate;

                      const orderIndexMap = new Map<string, number>();
                      dailyMedOrder.forEach((id, idx) => orderIndexMap.set(id, idx));

                      const stagedRows = (selectedPatient.medications || [])
                        .filter((med) => Boolean(dailyMedDecisions[med.id]))
                        .map((med, chartIdx) => ({
                          med,
                          decision: dailyMedDecisions[med.id],
                          dayNumber: computeMedicationDayNumber(
                            med.startDate,
                            activeDate,
                            fallbackStart
                          ),
                          orderIdx: orderIndexMap.has(med.id)
                            ? orderIndexMap.get(med.id)!
                            : 10000 + chartIdx,
                        }))
                        .sort((a, b) => {
                          if (a.decision !== b.decision) {
                            return a.decision === 'confirmed' ? -1 : 1;
                          }
                          return a.orderIdx - b.orderIdx;
                        });
                      const confirmedStagedCount = stagedRows.filter(
                        (r) => r.decision === 'confirmed'
                      ).length;
                      const heldStagedCount = stagedRows.filter(
                        (r) => r.decision === 'held'
                      ).length;
                      const isSavedForActiveDate =
                        Object.keys(savedDecisionsForMarDate).length > 0 &&
                        !hasUnsavedDailyMedChanges;

                      const chronologicalMedDates = Array.from(
                        new Set([...getSavedDailyMedicationDates(selectedPatient), activeDate])
                      ).sort((a, b) => a.localeCompare(b));

                      const isMedConfirmedOnDate = (targetDateKey: string, medId: string) => {
                        if (targetDateKey === activeDate) {
                          return dailyMedDecisions[medId] === 'confirmed';
                        }
                        return (
                          getSavedDecisionsForDate(selectedPatient.medicationLogs, targetDateKey)[
                            medId
                          ] === 'confirmed'
                        );
                      };

                      return (
                        <>
                          <div className="bg-white rounded-2xl border border-[#E6E0F0] shadow-xs overflow-hidden">
                            <div className="px-4 py-3 bg-[#F6F3FF]/80 border-b border-[#E6E0F0] flex flex-wrap items-center justify-between gap-2.5">
                              <div>
                                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                                  <span>
                                    Medication Chart ({(selectedPatient.medications || []).length})
                                  </span>
                                  {activeDatePod && (
                                    <span className="px-2 py-0.5 rounded bg-violet-100 text-violet-900 text-[10.5px] font-bold normal-case">
                                      {activeDatePod}
                                    </span>
                                  )}
                                </h3>
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                  Confirm or hold medications to build the Medication List for{' '}
                                  <span className="font-semibold text-slate-700">
                                    {formatDisplayDate(activeDate)}
                                  </span>
                                </p>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                <div className="inline-flex items-center rounded-lg border border-[#DDD4F2] bg-white overflow-hidden">
                                  <button
                                    type="button"
                                    onClick={() => setMarDate(shiftIsoDate(activeDate, -1))}
                                    className="px-2 py-1.5 text-slate-600 hover:bg-[#F6F3FF] hover:text-violet-800 cursor-pointer"
                                    title="Previous day"
                                  >
                                    <ChevronLeft className="w-3.5 h-3.5" />
                                  </button>
                                  <input
                                    type="date"
                                    value={activeDate}
                                    onChange={(e) => setMarDate(e.target.value || getTodayIso())}
                                    className="px-2 py-1 text-xs font-mono font-semibold text-slate-800 outline-none border-x border-[#EAE4F5]"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setMarDate(shiftIsoDate(activeDate, 1))}
                                    className="px-2 py-1.5 text-slate-600 hover:bg-[#F6F3FF] hover:text-violet-800 cursor-pointer"
                                    title="Next day"
                                  >
                                    <ChevronRight className="w-3.5 h-3.5" />
                                  </button>
                                </div>

                                {activeDate !== getTodayIso() && (
                                  <button
                                    type="button"
                                    onClick={() => setMarDate(getTodayIso())}
                                    className="px-2 py-1.5 rounded-lg border border-[#DDD4F2] bg-white hover:bg-[#F6F3FF] text-[11px] font-semibold text-violet-800 cursor-pointer"
                                  >
                                    Today
                                  </button>
                                )}

                                {(selectedPatient.medications || []).some(
                                  (m) => m.status !== 'stopped'
                                ) && (
                                  <button
                                    type="button"
                                    onClick={handleConfirmAllActiveMedsForDate}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#EBFBF3] hover:bg-[#DCFCE7] border border-[#A7F3D0] text-[11px] font-bold text-emerald-900 cursor-pointer"
                                  >
                                    <Check className="w-3 h-3" />
                                    <span>Confirm All</span>
                                  </button>
                                )}
                              </div>
                            </div>

                            {(selectedPatient.medications || []).length === 0 ? (
                              <div className="p-8 text-center text-xs text-slate-500">
                                No inpatient medications ordered yet. Add above, pick a Medication
                                Group, or sync from OT Post-Op Orders.
                              </div>
                            ) : (
                              <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs border-collapse min-w-[600px]">
                                  <thead>
                                    <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-600 font-semibold">
                                      <th className="py-2 px-3">Medicine &amp; Notes</th>
                                      <th className="py-2 px-3">Route / Freq</th>
                                      <th className="py-2 px-3 text-right">
                                        Action ({formatDisplayDate(activeDate)})
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {(selectedPatient.medications || []).map((med) => {
                                      const decision = dailyMedDecisions[med.id];
                                      return (
                                        <tr
                                          key={med.id}
                                          className={
                                            decision === 'confirmed'
                                              ? 'bg-emerald-50/35'
                                              : decision === 'held'
                                              ? 'bg-amber-50/35'
                                              : med.status === 'stopped'
                                              ? 'opacity-60 bg-slate-50/40'
                                              : 'hover:bg-slate-50/60'
                                          }
                                        >
                                          <td className="py-2.5 px-3">
                                            <div className="font-bold text-slate-900">
                                              {med.medicine}
                                              {med.dosage ? ` — ${med.dosage}` : ''}
                                            </div>
                                            <div className="text-[11px] text-slate-500">
                                              Started {formatDisplayDate(med.startDate)}
                                              {med.when ? ` · ${med.when}` : ''}
                                            </div>
                                            {med.notes && (
                                              <div className="text-[11px] text-teal-800 mt-0.5">
                                                Note: {med.notes}
                                              </div>
                                            )}
                                          </td>
                                          <td className="py-2.5 px-3 text-slate-700">
                                            <div className="font-semibold">{med.route}</div>
                                            <div className="text-[11px] text-slate-500">
                                              {med.frequency}
                                            </div>
                                          </td>
                                          <td className="py-2.5 px-3">
                                            <div className="flex items-center justify-end gap-1.5">
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  handleSetDailyMedDecision(med.id, 'confirmed')
                                                }
                                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold border transition-colors cursor-pointer ${
                                                  decision === 'confirmed'
                                                    ? 'bg-emerald-600 text-white border-emerald-700 shadow-2xs'
                                                    : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-emerald-200'
                                                }`}
                                              >
                                                <Check className="w-3 h-3" />
                                                <span>
                                                  {decision === 'confirmed'
                                                    ? 'Confirmed'
                                                    : 'Confirm'}
                                                </span>
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  handleSetDailyMedDecision(med.id, 'held')
                                                }
                                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold border transition-colors cursor-pointer ${
                                                  decision === 'held'
                                                    ? 'bg-amber-500 text-white border-amber-600 shadow-2xs'
                                                    : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-200'
                                                }`}
                                              >
                                                <PauseCircle className="w-3 h-3" />
                                                <span>{decision === 'held' ? 'Held' : 'Hold'}</span>
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  handleDeleteMedicationOrder(med.id)
                                                }
                                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 cursor-pointer"
                                                title="Delete medication order"
                                              >
                                                <Trash2 className="w-3 h-3" />
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

                          {/* Chronological Daily Medication Tables (POD 0 -> POD 1 -> POD 2...) */}
                          <div className="space-y-3">
                            {chronologicalMedDates.map((dateKey) => {
                              const nextDateKey = shiftIsoDate(dateKey, 1);

                              if (dateKey === activeDate) {
                                return (
                                  <div
                                    key={dateKey}
                                    className="bg-white rounded-2xl border-2 border-[#DDD4F2] shadow-xs overflow-hidden"
                                  >
                                    <div className="px-4 py-3 bg-[#F6F3FF] border-b border-[#E6E0F0] flex flex-wrap items-center justify-between gap-2.5">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <Calendar className="w-4 h-4 text-violet-700 shrink-0" />
                                        <h3 className="text-xs sm:text-sm font-extrabold text-slate-900">
                                          Medication List for {formatDisplayDate(activeDate)}
                                        </h3>
                                        {activeDatePod && (
                                          <span className="px-2 py-0.5 rounded bg-white border border-[#DDD4F2] text-[10.5px] font-bold text-violet-800">
                                            {activeDatePod}
                                          </span>
                                        )}
                                        {confirmedStagedCount > 0 && (
                                          <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-[10.5px] font-bold text-emerald-800">
                                            {confirmedStagedCount} Confirmed
                                          </span>
                                        )}
                                        {heldStagedCount > 0 && (
                                          <span className="px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-[10.5px] font-bold text-amber-800">
                                            {heldStagedCount} Held
                                          </span>
                                        )}
                                      </div>

                                      <div className="flex items-center gap-2 flex-wrap">
                                        {isSavedForActiveDate && (
                                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                            Saved
                                          </span>
                                        )}
                                        {hasUnsavedDailyMedChanges && (
                                          <span className="text-[11px] font-semibold text-amber-700">
                                            Unsaved changes
                                          </span>
                                        )}
                                        {stagedRows.length > 0 && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setMedPrintPreviewState({
                                                dateKey: activeDate,
                                                overrideItems: stagedRows.map(
                                                  ({ med, decision, dayNumber }) => ({
                                                    id: med.id,
                                                    medicationId: med.id,
                                                    medicine: med.medicine,
                                                    dosage: med.dosage || '',
                                                    route: med.route || 'Oral (PO)',
                                                    frequency: med.frequency || '',
                                                    when: med.when || '',
                                                    notes: med.notes || '',
                                                    startDate: med.startDate || fallbackStart,
                                                    dayNumber,
                                                    status: decision,
                                                  })
                                                ),
                                              })
                                            }
                                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white hover:bg-[#ECE5FF] border border-[#DDD4F2] text-xs font-semibold text-violet-900 transition-colors cursor-pointer"
                                            title={`Preview & print Medication Chart for ${formatDisplayDate(activeDate)}`}
                                          >
                                            <Printer className="w-3.5 h-3.5" />
                                            <span>Preview / Print</span>
                                          </button>
                                        )}
                                        {confirmedStagedCount > 0 && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleRepeatMedicationsToNextDay(activeDate, true)
                                            }
                                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#EBFBF3] hover:bg-[#DCFCE7] border border-[#A7F3D0] text-xs font-bold text-emerald-900 transition-colors cursor-pointer"
                                            title={`Copy all ${confirmedStagedCount} confirmed medications to ${formatDisplayDate(nextDateKey)}`}
                                          >
                                            <Copy className="w-3.5 h-3.5" />
                                            <span>Repeat All to Next Day</span>
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          onClick={handleSaveAndSyncDailyMedications}
                                          disabled={
                                            stagedRows.length === 0 &&
                                            Object.keys(savedDecisionsForMarDate).length === 0
                                          }
                                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-violet-700 hover:bg-violet-800 disabled:opacity-45 shadow-xs transition-colors cursor-pointer"
                                        >
                                          <Save className="w-3.5 h-3.5" />
                                          <span>Save &amp; Sync to Daily Log</span>
                                        </button>
                                      </div>
                                    </div>

                                    {stagedRows.length === 0 ? (
                                      <div className="p-6 text-center space-y-2">
                                        <p className="text-xs text-slate-500">
                                          Click{' '}
                                          <span className="font-bold text-emerald-800">Confirm</span>{' '}
                                          or <span className="font-bold text-amber-800">Hold</span>{' '}
                                          against medications above to build the Medication List for{' '}
                                          <span className="font-semibold text-slate-700">
                                            {formatDisplayDate(activeDate)}
                                          </span>
                                          , then click{' '}
                                          <span className="font-bold text-violet-800">
                                            Save &amp; Sync to Daily Log
                                          </span>
                                          .
                                        </p>
                                      </div>
                                    ) : (
                                      <div className="overflow-x-auto">
                                        <table className="w-full text-left text-xs border-collapse min-w-[680px]">
                                          <thead>
                                            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                                              <th className="py-2 px-3">Medicine &amp; Notes</th>
                                              <th className="py-2 px-3">Route / Freq</th>
                                              <th className="py-2 px-3">Med Day</th>
                                              <th className="py-2 px-3">Status</th>
                                              <th className="py-2 px-3">Next Day</th>
                                              <th className="py-2 px-3 text-right">Remove</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-slate-100">
                                            {stagedRows.map(({ med, decision, dayNumber }) => {
                                              const alreadyRepeated = isMedConfirmedOnDate(
                                                nextDateKey,
                                                med.id
                                              );
                                              return (
                                                <tr
                                                  key={med.id}
                                                  className={
                                                    decision === 'held'
                                                      ? 'bg-amber-50/35'
                                                      : 'hover:bg-slate-50/60'
                                                  }
                                                >
                                                  <td className="py-2 px-3">
                                                    <div className="font-bold text-slate-900">
                                                      {med.medicine}
                                                      {med.dosage ? ` — ${med.dosage}` : ''}
                                                    </div>
                                                    {(med.when || med.notes) && (
                                                      <div className="text-[11px] text-slate-500">
                                                        {[med.when, med.notes]
                                                          .filter(Boolean)
                                                          .join(' · ')}
                                                      </div>
                                                    )}
                                                  </td>
                                                  <td className="py-2 px-3 text-slate-700">
                                                    <div className="font-semibold">{med.route}</div>
                                                    <div className="text-[11px] text-slate-500">
                                                      {med.frequency}
                                                    </div>
                                                  </td>
                                                  <td className="py-2 px-3 whitespace-nowrap">
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded bg-[#F6F3FF] border border-[#DDD4F2] font-mono font-bold text-[11px] text-violet-900">
                                                      Day {dayNumber}
                                                    </span>
                                                  </td>
                                                  <td className="py-2 px-3 whitespace-nowrap">
                                                    {decision === 'confirmed' ? (
                                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-bold uppercase">
                                                        <Check className="w-3 h-3" />
                                                        Confirmed
                                                      </span>
                                                    ) : (
                                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-bold uppercase">
                                                        <PauseCircle className="w-3 h-3" />
                                                        Held
                                                      </span>
                                                    )}
                                                  </td>
                                                  <td className="py-2 px-3 whitespace-nowrap">
                                                    {decision === 'confirmed' ? (
                                                      alreadyRepeated ? (
                                                        <span
                                                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 text-[11px] font-semibold"
                                                          title={`Already copied to ${formatDisplayDate(nextDateKey)}`}
                                                        >
                                                          <Check className="w-3 h-3 text-emerald-600" />
                                                          Repeated
                                                        </span>
                                                      ) : (
                                                        <button
                                                          type="button"
                                                          onClick={() =>
                                                            handleRepeatSingleMedicationToNextDay(
                                                              activeDate,
                                                              {
                                                                medicationId: med.id,
                                                                medicine: med.medicine,
                                                                dosage: med.dosage,
                                                                route: med.route,
                                                                frequency: med.frequency,
                                                                when: med.when,
                                                                notes: med.notes,
                                                                startDate: med.startDate,
                                                              },
                                                              true
                                                            )
                                                          }
                                                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#EBFBF3] hover:bg-[#DCFCE7] text-emerald-900 border border-[#A7F3D0] text-[11px] font-bold transition-colors cursor-pointer"
                                                          title={`Copy ${med.medicine} to ${formatDisplayDate(nextDateKey)}`}
                                                        >
                                                          <Copy className="w-3 h-3" />
                                                          <span>Repeat</span>
                                                        </button>
                                                      )
                                                    ) : (
                                                      <span className="text-slate-300">—</span>
                                                    )}
                                                  </td>
                                                  <td className="py-2 px-3 text-right">
                                                    <button
                                                      type="button"
                                                      onClick={() =>
                                                        handleRemoveStagedDailyMed(med.id)
                                                      }
                                                      className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                                                      title="Remove from this date's list"
                                                    >
                                                      <X className="w-3.5 h-3.5" />
                                                    </button>
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
                              }

                              const dayResolved = getResolvedDailyMedicationsForDate(
                                selectedPatient,
                                dateKey
                              );
                              const dayPod = formatPodLabel(
                                selectedPatient.surgeryDate,
                                dateKey
                              );
                              const dayConfirmedCount = dayResolved.items.filter(
                                (r) => r.status === 'confirmed'
                              ).length;
                              const dayHeldCount = dayResolved.items.filter(
                                (r) => r.status === 'held'
                              ).length;

                              return (
                                <div
                                  key={dateKey}
                                  className="bg-white rounded-xl border border-[#E6E0F0] shadow-2xs overflow-hidden"
                                >
                                  <div className="px-3.5 py-2.5 bg-[#FAF8FF] border-b border-[#EAE4F5] flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex flex-wrap items-center gap-2 text-xs">
                                      <Calendar className="w-3.5 h-3.5 text-violet-700" />
                                      <span className="font-bold text-slate-900">
                                        Medication List for {formatDisplayDate(dateKey)}
                                      </span>
                                      {dayPod && (
                                        <span className="px-1.5 py-0.5 rounded bg-violet-50 border border-violet-200 text-[10px] font-bold text-violet-800">
                                          {dayPod}
                                        </span>
                                      )}
                                      <span className="text-[11px] font-semibold text-emerald-700">
                                        {dayConfirmedCount} Confirmed
                                        {dayHeldCount > 0 ? ` · ${dayHeldCount} Held` : ''}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setMedPrintPreviewState({
                                            dateKey,
                                          })
                                        }
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#F6F3FF] hover:bg-[#ECE5FF] border border-[#DDD4F2] text-[11px] font-semibold text-violet-900 cursor-pointer"
                                        title={`Preview & print Medication Chart for ${formatDisplayDate(dateKey)}`}
                                      >
                                        <Printer className="w-3 h-3" />
                                        <span>Preview / Print</span>
                                      </button>
                                      {dayConfirmedCount > 0 && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleRepeatMedicationsToNextDay(dateKey, false)
                                          }
                                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#EBFBF3] hover:bg-[#DCFCE7] border border-[#A7F3D0] text-[11px] font-bold text-emerald-900 cursor-pointer"
                                          title={`Copy all ${dayConfirmedCount} confirmed medications to ${formatDisplayDate(nextDateKey)}`}
                                        >
                                          <Copy className="w-3 h-3" />
                                          <span>Repeat All to Next Day</span>
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => setMarDate(dateKey)}
                                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white hover:bg-[#F6F3FF] border border-[#DDD4F2] text-[11px] font-semibold text-violet-800 cursor-pointer"
                                      >
                                        <Edit3 className="w-3 h-3" />
                                        <span>Edit</span>
                                      </button>
                                      {confirmDeleteMedDayKey === dateKey ? (
                                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 border border-rose-200 text-[11px]">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleDeleteSavedMedicationDay(dateKey)
                                            }
                                            className="px-1.5 py-0.5 rounded bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer"
                                          >
                                            Confirm
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setConfirmDeleteMedDayKey(null)}
                                            className="px-1 text-slate-600 hover:text-slate-900 cursor-pointer"
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => setConfirmDeleteMedDayKey(dateKey)}
                                          className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                                          title={`Remove saved medication list for ${formatDisplayDate(dateKey)}`}
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  <div className="overflow-x-auto">
                                    <table className="w-full text-left text-[11.5px] border-collapse min-w-[600px]">
                                      <thead>
                                        <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold">
                                          <th className="py-1.5 px-3">Medicine &amp; Notes</th>
                                          <th className="py-1.5 px-3">Route / Freq</th>
                                          <th className="py-1.5 px-3">Med Day</th>
                                          <th className="py-1.5 px-3">Status</th>
                                          <th className="py-1.5 px-3">Next Day</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {dayResolved.items.map((item) => {
                                          const alreadyRepeated = isMedConfirmedOnDate(
                                            nextDateKey,
                                            item.medicationId
                                          );
                                          return (
                                            <tr
                                              key={item.id}
                                              className={
                                                item.status === 'held'
                                                  ? 'bg-amber-50/35 text-slate-500'
                                                  : 'hover:bg-slate-50/50'
                                              }
                                            >
                                              <td className="py-1.5 px-3">
                                                <div className="font-semibold text-slate-900">
                                                  {item.medicine}
                                                  {item.dosage ? ` — ${item.dosage}` : ''}
                                                </div>
                                                {(item.when || item.notes) && (
                                                  <div className="text-[10.5px] text-slate-500">
                                                    {[item.when, item.notes]
                                                      .filter(Boolean)
                                                      .join(' · ')}
                                                  </div>
                                                )}
                                              </td>
                                              <td className="py-1.5 px-3 text-slate-700">
                                                <span className="font-semibold">{item.route}</span>
                                                {item.frequency ? ` · ${item.frequency}` : ''}
                                              </td>
                                              <td className="py-1.5 px-3 font-mono font-bold text-violet-800 whitespace-nowrap">
                                                Day {item.dayNumber}
                                              </td>
                                              <td className="py-1.5 px-3 whitespace-nowrap">
                                                {item.status === 'confirmed' ? (
                                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-bold uppercase">
                                                    <Check className="w-2.5 h-2.5" />
                                                    Confirmed
                                                  </span>
                                                ) : (
                                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold uppercase">
                                                    Held
                                                  </span>
                                                )}
                                              </td>
                                              <td className="py-1.5 px-3 whitespace-nowrap">
                                                {item.status === 'confirmed' ? (
                                                  alreadyRepeated ? (
                                                    <span
                                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 text-[10.5px] font-semibold"
                                                      title={`Already copied to ${formatDisplayDate(nextDateKey)}`}
                                                    >
                                                      <Check className="w-2.5 h-2.5 text-emerald-600" />
                                                      Repeated
                                                    </span>
                                                  ) : (
                                                    <button
                                                      type="button"
                                                      onClick={() =>
                                                        handleRepeatSingleMedicationToNextDay(
                                                          dateKey,
                                                          item,
                                                          false
                                                        )
                                                      }
                                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#EBFBF3] hover:bg-[#DCFCE7] text-emerald-900 border border-[#A7F3D0] text-[10.5px] font-bold transition-colors cursor-pointer"
                                                      title={`Copy ${item.medicine} to ${formatDisplayDate(nextDateKey)}`}
                                                    >
                                                      <Copy className="w-2.5 h-2.5" />
                                                      <span>Repeat</span>
                                                    </button>
                                                  )
                                                ) : (
                                                  <span className="text-slate-300">—</span>
                                                )}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}

                {/* TAB 3: INVESTIGATIONS */}
                {activeChartTab === 'investigations' && (
                  <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">
                          Patient Investigations (Labs &amp; Imaging)
                        </h3>
                        <p className="text-xs text-slate-500">
                          Add date-wise laboratory values and USG / CT / X-ray KUB imaging findings manually.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsInvestigationModalOpen(true)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 cursor-pointer"
                      >
                        <FlaskConical className="w-3.5 h-3.5" />
                        <span>Add Investigation Parameters</span>
                      </button>
                    </div>

                    <DateWiseInvestigationTable
                      consultation={ipdPatientToInvestigationConsultation(selectedPatient)}
                      allConsultations={[]}
                      onRemoveParameterOnDate={handleRemoveInvestigationParam}
                    />

                    <div className="space-y-1 pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-slate-700">
                          Written Lab &amp; Imaging Summary Notes
                        </label>
                      </div>
                      <textarea
                        rows={3}
                        value={selectedPatient.labTestsAndImaging || ''}
                        onChange={(e) =>
                          updateSelectedPatient((prev) => ({
                            ...prev,
                            labTestsAndImaging: e.target.value,
                          }))
                        }
                        placeholder="Consolidated lab values, post-op Hb/Creatinine, USG/CT/KUB impressions..."
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-teal-500 resize-y"
                      />
                    </div>
                  </div>
                )}

                {/* TAB 4: OT NOTES (OPD-PARITY) */}
                {activeChartTab === 'ot' && (
                  <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <IpdOtNotesEditor
                      patient={selectedPatient}
                      doctor={doctor}
                      onUpdateOtProcedures={handleUpdateOtProcedures}
                      onOpenA4PrintPreview={onOpenOtPrintPreview}
                    />
                  </div>
                )}

                {/* TAB 5: SURGICAL PROTOCOL TRACKER */}
                {activeChartTab === 'protocol' && (
                  <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <IpdSurgicalProtocolPanel
                      patient={selectedPatient}
                      availableProtocols={effectiveProtocols}
                      customProtocols={customProtocols}
                      doctorUid={doctor?.uid}
                      onSaveCustomProtocol={onSaveCustomProtocol}
                      onDeleteCustomProtocol={onDeleteCustomProtocol}
                      onUpdateProtocol={handleUpdateProtocol}
                    />
                  </div>
                )}

                {/* TAB 6: DISCHARGE MEDICATIONS (AFTER SURGICAL PROTOCOL) */}
                {activeChartTab === 'discharge-meds' && (
                  <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                          <Pill className="w-4 h-4 text-teal-700" />
                          <span>Discharge Medications (Take-Home Rx)</span>
                        </h3>
                        <p className="text-xs text-slate-600 mt-0.5">
                          Prepare the patient&apos;s discharge prescription here — automatically
                          syncs into the Discharge Summary and printable PDF.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={handlePullActiveWardMedsToDischarge}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Import Active Ward Meds</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleAddDischargeMedRow}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-indigo-700 hover:bg-indigo-800 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add Medicine</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveChartTab('discharge')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>Go to Discharge Summary</span>
                        </button>
                      </div>
                    </div>

                    <MedicinePresetsBar
                      onAddMedicinePreset={(preset) =>
                        updateDischargeMedicationsList(
                          (curr) => [...curr, preset],
                          `Added ${preset.medicine} to Discharge Medications`
                        )
                      }
                      onApplyMedicationGroup={handleApplyDischargeMedGroup}
                      onOpenMedicineMaster={onOpenMedicineMaster}
                      doctorUid={doctor?.uid}
                    />

                    {selectedDischargeMeds.length === 0 ? (
                      <div className="p-8 text-center border border-dashed border-slate-200 rounded-xl space-y-3 bg-slate-50/50">
                        <Pill className="w-7 h-7 text-slate-300 mx-auto" />
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-slate-700">
                            No discharge medications added yet
                          </p>
                          <p className="text-xs text-slate-500">
                            Click a preset group above, import active inpatient medications, or add
                            medicines manually.
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={handlePullActiveWardMedsToDischarge}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-teal-800 bg-white border border-teal-200 hover:bg-teal-50 cursor-pointer"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Import Active Ward Meds ({activeMedsCount})</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleAddDischargeMedRow}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-indigo-700 hover:bg-indigo-800 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add Medicine</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        <div className="hidden md:grid md:grid-cols-12 gap-2 px-3 text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                          <div className="md:col-span-3">Medicine</div>
                          <div className="md:col-span-2">Dosage</div>
                          <div className="md:col-span-2">Frequency</div>
                          <div className="md:col-span-2">Timing</div>
                          <div className="md:col-span-1">Duration</div>
                          <div className="md:col-span-2">Notes / Instructions</div>
                        </div>
                        {selectedDischargeMeds.map((rx, idx) => (
                          <div
                            key={idx}
                            className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center p-2.5 rounded-xl border border-slate-200 bg-slate-50/60"
                          >
                            <div className="md:col-span-3 flex items-center gap-1.5">
                              <span className="text-[11px] font-mono font-bold text-slate-400 w-5 shrink-0">
                                {idx + 1}.
                              </span>
                              <input
                                list="suggest-medicine"
                                placeholder="Medicine name"
                                value={rx.medicine || rx.drugName || ''}
                                onChange={(e) =>
                                  handleUpdateDischargeMedRow(idx, { medicine: e.target.value })
                                }
                                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white font-semibold text-slate-900 focus:border-teal-500 outline-none"
                              />
                            </div>
                            <input
                              list="suggest-dosage"
                              placeholder="Dosage (e.g. 500 mg)"
                              value={rx.dosage || rx.dosageStrength || ''}
                              onChange={(e) =>
                                handleUpdateDischargeMedRow(idx, { dosage: e.target.value })
                              }
                              className="md:col-span-2 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-900 focus:border-teal-500 outline-none"
                            />
                            <input
                              list="suggest-frequency"
                              placeholder="Frequency (1-0-1)"
                              value={rx.frequency || ''}
                              onChange={(e) =>
                                handleUpdateDischargeMedRow(idx, { frequency: e.target.value })
                              }
                              className="md:col-span-2 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-900 focus:border-teal-500 outline-none"
                            />
                            <input
                              list="suggest-when"
                              placeholder="Timing (After food)"
                              value={rx.when || rx.timing || ''}
                              onChange={(e) =>
                                handleUpdateDischargeMedRow(idx, { when: e.target.value })
                              }
                              className="md:col-span-2 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-900 focus:border-teal-500 outline-none"
                            />
                            <input
                              list="suggest-duration"
                              placeholder="5 Days"
                              value={rx.duration || ''}
                              onChange={(e) =>
                                handleUpdateDischargeMedRow(idx, { duration: e.target.value })
                              }
                              className="md:col-span-1 px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-900 focus:border-teal-500 outline-none"
                            />
                            <div className="md:col-span-2 flex items-center gap-1.5">
                              <input
                                list="suggest-rxNotes"
                                placeholder="Instructions / notes"
                                value={rx.notes || rx.instructions || ''}
                                onChange={(e) =>
                                  handleUpdateDischargeMedRow(idx, { notes: e.target.value })
                                }
                                className="flex-1 min-w-0 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-900 focus:border-teal-500 outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => handleRemoveDischargeMedRow(idx)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer shrink-0"
                                title="Remove discharge medicine"
                                aria-label="Remove discharge medicine"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 7: DISCHARGE SUMMARY */}
                {activeChartTab === 'discharge' && (
                  <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">
                          IPD Discharge Summary
                        </h3>
                        <p className="text-xs text-slate-600">
                          Auto-compiles hospital course (clubbed by POD &amp; protocol heading), OT
                          notes, investigations, discharge medications, protocol advice, and urgent
                          warning signs.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openDischargeModal('edit')}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold text-white bg-violet-700 hover:bg-violet-800 cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>
                            {selectedPatient.dischargeSummary
                              ? 'Edit Discharge Summary'
                              : 'Generate Discharge Summary'}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openDischargeModal('review')}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5 text-indigo-700" />
                          <span>Print &amp; Review</span>
                        </button>
                        {selectedPatient.dischargeSummary && (
                          <button
                            type="button"
                            onClick={() => {
                              exportIpdDischargeSummaryPdf(selectedPatient, doctor);
                              onToast('Exported Discharge Summary PDF');
                            }}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Export Discharge PDF</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {selectedPatient.dischargeSummary ? (
                      <div className="border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4 bg-white text-xs">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pb-3 border-b border-slate-200 bg-slate-50/70 -mx-4 -mt-4 sm:-mx-5 sm:-mt-5 px-4 sm:px-5 pt-4 rounded-t-xl">
                          <div>
                            <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                              Discharge Date
                            </div>
                            <div className="font-bold text-slate-900 font-mono mt-0.5">
                              {formatDisplayDate(selectedPatient.dischargeSummary.dischargeDate)}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                              Condition at Discharge
                            </div>
                            <div className="font-semibold text-slate-900 mt-0.5">
                              {selectedPatient.dischargeSummary.conditionAtDischarge || 'Stable'}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                              Follow-up Plan
                            </div>
                            <div className="font-semibold text-slate-900 mt-0.5">
                              {selectedPatient.dischargeSummary.followUpPlan || '—'}
                            </div>
                          </div>
                        </div>

                        {/* 1. Diagnosis */}
                        <div>
                          <div className="bg-teal-50/90 border-l-4 border-teal-700 px-2.5 py-1 rounded-r text-[11px] font-extrabold uppercase tracking-wider text-slate-900">
                            Diagnosis
                          </div>
                          <div className="font-semibold text-slate-900 mt-1.5 px-1 whitespace-pre-wrap">
                            {selectedPatient.dischargeSummary.finalDiagnosis}
                          </div>
                        </div>

                        {/* 2. Procedure Performed with Date */}
                        {selectedPatient.dischargeSummary.procedurePerformed && (
                          <div>
                            <div className="bg-teal-50/90 border-l-4 border-teal-700 px-2.5 py-1 rounded-r text-[11px] font-extrabold uppercase tracking-wider text-slate-900">
                              Procedure Performed with Date
                            </div>
                            <div className="font-semibold text-slate-800 mt-1.5 px-1 whitespace-pre-wrap">
                              {selectedPatient.dischargeSummary.procedurePerformed}
                            </div>
                          </div>
                        )}

                        {/* 3. Presenting History */}
                        {selectedPatient.dischargeSummary.chiefComplaintsAndHistory && (
                          <div>
                            <div className="bg-teal-50/90 border-l-4 border-teal-700 px-2.5 py-1 rounded-r text-[11px] font-extrabold uppercase tracking-wider text-slate-900">
                              Presenting History
                            </div>
                            <div className="mt-2 px-1">
                              <FormattedClinicalNote
                                text={selectedPatient.dischargeSummary.chiefComplaintsAndHistory}
                                variant="discharge"
                                accent="teal"
                              />
                            </div>
                          </div>
                        )}

                        {/* 4. Examination on IPD */}
                        {selectedPatient.dischargeSummary.examinationOnAdmission && (
                          <div>
                            <div className="bg-teal-50/90 border-l-4 border-teal-700 px-2.5 py-1 rounded-r text-[11px] font-extrabold uppercase tracking-wider text-slate-900">
                              Examination on IPD
                            </div>
                            <div className="mt-2 px-1">
                              <FormattedClinicalNote
                                text={selectedPatient.dischargeSummary.examinationOnAdmission}
                                variant="discharge"
                                accent="teal"
                              />
                            </div>
                          </div>
                        )}

                        {/* 5. Investigations */}
                        {selectedPatient.dischargeSummary.keyInvestigations && (
                          <div>
                            <div className="bg-teal-50/90 border-l-4 border-teal-700 px-2.5 py-1 rounded-r text-[11px] font-extrabold uppercase tracking-wider text-slate-900">
                              Investigations
                            </div>
                            <div className="mt-2 px-1 font-mono text-[11px]">
                              <FormattedClinicalNote
                                text={selectedPatient.dischargeSummary.keyInvestigations}
                                variant="discharge"
                                compact
                                accent="sky"
                              />
                            </div>
                          </div>
                        )}

                        {/* 6. Course in Ward */}
                        {selectedPatient.dischargeSummary.hospitalCourse && (
                          <div>
                            <div className="bg-teal-50/90 border-l-4 border-teal-700 px-2.5 py-1 rounded-r text-[11px] font-extrabold uppercase tracking-wider text-slate-900">
                              Course in Ward
                            </div>
                            <p className="mt-2 px-1 text-slate-800 whitespace-pre-wrap leading-relaxed">
                              {selectedPatient.dischargeSummary.hospitalCourse}
                            </p>
                          </div>
                        )}

                        {/* 7. OT Notes */}
                        {selectedPatient.dischargeSummary.otNotesSummary && (
                          <div>
                            <div className="bg-teal-50/90 border-l-4 border-teal-700 px-2.5 py-1 rounded-r text-[11px] font-extrabold uppercase tracking-wider text-slate-900">
                              OT Notes
                            </div>
                            <div className="mt-2 px-1">
                              <FormattedClinicalNote
                                text={selectedPatient.dischargeSummary.otNotesSummary}
                                variant="discharge"
                                accent="indigo"
                              />
                            </div>
                          </div>
                        )}

                        {/* 8. Treatment Given in Ward Table */}
                        {(selectedPatient.dischargeSummary.treatmentGivenInWard || []).filter((t) =>
                          Boolean((t.medicine || '').trim())
                        ).length > 0 && (
                          <div>
                            <div className="bg-teal-50/90 border-l-4 border-teal-700 px-2.5 py-1 rounded-r text-[11px] font-extrabold uppercase tracking-wider text-slate-900 mb-2">
                              Treatment Given in Ward (
                              {
                                (selectedPatient.dischargeSummary.treatmentGivenInWard || []).filter(
                                  (t) => Boolean((t.medicine || '').trim())
                                ).length
                              }
                              )
                            </div>
                            <div className="border border-slate-200 rounded-lg overflow-x-auto">
                              <table className="w-full text-left border-collapse text-[11.5px]">
                                <thead>
                                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                                    <th className="py-1.5 px-2.5 w-8 text-center">#</th>
                                    <th className="py-1.5 px-2.5">Medicine &amp; Strength</th>
                                    <th className="py-1.5 px-2.5">Route</th>
                                    <th className="py-1.5 px-2.5">Frequency</th>
                                    <th className="py-1.5 px-2.5">Duration / Dates</th>
                                    <th className="py-1.5 px-2.5">Remarks</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(selectedPatient.dischargeSummary.treatmentGivenInWard || [])
                                    .filter((t) => Boolean((t.medicine || '').trim()))
                                    .map((item, idx) => (
                                      <tr
                                        key={idx}
                                        className="border-b border-slate-100 last:border-b-0"
                                      >
                                        <td className="py-1.5 px-2.5 text-center text-slate-400 font-mono">
                                          {idx + 1}
                                        </td>
                                        <td className="py-1.5 px-2.5 font-bold text-slate-900">
                                          {item.medicine}
                                          {item.dosage ? (
                                            <span className="font-normal text-slate-600">
                                              {' '}
                                              ({item.dosage})
                                            </span>
                                          ) : null}
                                        </td>
                                        <td className="py-1.5 px-2.5 text-slate-800">
                                          {item.route || '—'}
                                        </td>
                                        <td className="py-1.5 px-2.5 text-slate-800">
                                          {item.frequency || '—'}
                                        </td>
                                        <td className="py-1.5 px-2.5 text-slate-700">
                                          {item.durationOrDates || '—'}
                                        </td>
                                        <td className="py-1.5 px-2.5 text-slate-600">
                                          {item.notes || '—'}
                                        </td>
                                      </tr>
                                    ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* 9. Condition on Discharge */}
                        {selectedPatient.dischargeSummary.conditionAtDischarge && (
                          <div>
                            <div className="bg-teal-50/90 border-l-4 border-teal-700 px-2.5 py-1 rounded-r text-[11px] font-extrabold uppercase tracking-wider text-slate-900">
                              Condition on Discharge
                            </div>
                            <div className="text-slate-800 mt-1.5 px-1 whitespace-pre-wrap">
                              {selectedPatient.dischargeSummary.conditionAtDischarge}
                            </div>
                          </div>
                        )}

                        {/* 10. Discharge Medications Table */}
                        {selectedPatient.dischargeSummary.dischargeMedications.length > 0 && (
                          <div>
                            <div className="bg-teal-50/90 border-l-4 border-teal-700 px-2.5 py-1 rounded-r text-[11px] font-extrabold uppercase tracking-wider text-slate-900 mb-2">
                              Discharge Medications (
                              {selectedPatient.dischargeSummary.dischargeMedications.length})
                            </div>
                            <div className="border border-slate-200 rounded-lg overflow-x-auto">
                              <table className="w-full text-left border-collapse text-[11.5px]">
                                <thead>
                                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                                    <th className="py-1.5 px-2.5 w-8 text-center">#</th>
                                    <th className="py-1.5 px-2.5">Medicine &amp; Strength</th>
                                    <th className="py-1.5 px-2.5">Frequency</th>
                                    <th className="py-1.5 px-2.5">Timing</th>
                                    <th className="py-1.5 px-2.5">Duration</th>
                                    <th className="py-1.5 px-2.5">Notes</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {selectedPatient.dischargeSummary.dischargeMedications.map(
                                    (m, idx) => (
                                      <tr
                                        key={idx}
                                        className="border-b border-slate-100 last:border-b-0"
                                      >
                                        <td className="py-1.5 px-2.5 text-center text-slate-400 font-mono">
                                          {idx + 1}
                                        </td>
                                        <td className="py-1.5 px-2.5 font-bold text-slate-900">
                                          {m.medicine || m.drugName}
                                          {m.dosage ? (
                                            <span className="font-normal text-slate-600">
                                              {' '}
                                              ({m.dosage})
                                            </span>
                                          ) : null}
                                        </td>
                                        <td className="py-1.5 px-2.5 text-slate-800">
                                          {m.frequency || '—'}
                                        </td>
                                        <td className="py-1.5 px-2.5 text-slate-700">
                                          {m.when || m.timing || '—'}
                                        </td>
                                        <td className="py-1.5 px-2.5 text-slate-800">
                                          {m.duration || '—'}
                                        </td>
                                        <td className="py-1.5 px-2.5 text-slate-600">
                                          {m.notes || m.instructions || '—'}
                                        </td>
                                      </tr>
                                    )
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* 11. Diet, Wound & Activity Advice */}
                        {selectedPatient.dischargeSummary.dietAndActivityAdvice && (
                          <div>
                            <div className="bg-teal-50/90 border-l-4 border-teal-700 px-2.5 py-1 rounded-r text-[11px] font-extrabold uppercase tracking-wider text-slate-900">
                              Diet, Wound &amp; Activity Advice
                            </div>
                            <div className="mt-2 px-1">
                              <FormattedClinicalNote
                                text={selectedPatient.dischargeSummary.dietAndActivityAdvice}
                                variant="discharge"
                                accent="teal"
                              />
                            </div>
                          </div>
                        )}

                        {/* 12. Urgent Return Warnings (Red Flags) */}
                        {selectedPatient.dischargeSummary.redFlagWarnings && (
                          <div className="border border-rose-200 bg-rose-50/50 rounded-lg p-3">
                            <div className="text-[11px] font-extrabold uppercase tracking-wider text-rose-900">
                              Urgent Return Warnings (Red Flags)
                            </div>
                            <div className="mt-1.5 text-rose-950 whitespace-pre-wrap">
                              {selectedPatient.dischargeSummary.redFlagWarnings}
                            </div>
                          </div>
                        )}

                        {/* 13. DJ Stent / Catheter / Drain & HPE Plan */}
                        {selectedPatient.dischargeSummary.stentOrTubePlan && (
                          <div>
                            <div className="bg-teal-50/90 border-l-4 border-teal-700 px-2.5 py-1 rounded-r text-[11px] font-extrabold uppercase tracking-wider text-slate-900">
                              DJ Stent / Catheter / Drain &amp; HPE Plan
                            </div>
                            <div className="mt-2 px-1">
                              <FormattedClinicalNote
                                text={selectedPatient.dischargeSummary.stentOrTubePlan}
                                variant="discharge"
                                accent="indigo"
                              />
                            </div>
                          </div>
                        )}

                        {/* 14. Follow-Up Plan */}
                        {selectedPatient.dischargeSummary.followUpPlan && (
                          <div>
                            <div className="bg-teal-50/90 border-l-4 border-teal-700 px-2.5 py-1 rounded-r text-[11px] font-extrabold uppercase tracking-wider text-slate-900">
                              Follow-Up Plan
                            </div>
                            <div className="mt-2 px-1">
                              <FormattedClinicalNote
                                text={selectedPatient.dischargeSummary.followUpPlan}
                                variant="discharge"
                                accent="teal"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-8 text-center border border-dashed border-slate-200 rounded-xl text-xs text-slate-500">
                        No discharge summary generated yet. Click{' '}
                        <strong className="text-slate-700">Generate Discharge Summary</strong> to
                        compile from this patient&apos;s IPD chart, OT notes, surgical protocol, and
                        discharge medications.
                      </div>
                    )}
                  </div>
                )}
            </section>
          )}
        </div>
      )}

      {/* Admit / Edit IPD Patient Modal */}
      {isAdmitModalOpen && (
        <AdmitIpdPatientModal
          existingPatient={editingAdmissionPatient}
          seedConsultation={admitSeedConsultation}
          consultations={consultations}
          ipdPatients={patients}
          doctor={doctor}
          onClose={() => {
            setIsAdmitModalOpen(false);
            setEditingAdmissionPatient(null);
            setAdmitSeedConsultation(null);
          }}
          onSave={(record) => {
            onUpsertPatient(record);
            setSelectedPatientId(record.id);
            setActiveChartTab('admission');
            setIsAdmitModalOpen(false);
            setEditingAdmissionPatient(null);
            setAdmitSeedConsultation(null);
            onToast(
              editingAdmissionPatient
                ? `Updated IPD details for ${record.patientName}`
                : `Admitted ${record.patientName} to ${record.wardOrBed || 'IPD Ward'}`
            );
          }}
        />
      )}

      {/* Discharge Summary Modal */}
      {selectedPatient && isDischargeModalOpen && (
        <IpdDischargeSummaryModal
          isOpen={isDischargeModalOpen}
          onClose={() => setIsDischargeModalOpen(false)}
          patient={selectedPatient}
          doctor={doctor}
          availableProtocols={effectiveProtocols}
          initialView={dischargeModalInitialView}
          onSaveDischargeSummary={handleSaveDischargeSummary}
          onOpenMedicineMaster={onOpenMedicineMaster}
        />
      )}

      {/* Manual Investigation Parameter Entry Modal */}
      {selectedPatient && isInvestigationModalOpen && (
        <ManualInvestigationModal
          isOpen={isInvestigationModalOpen}
          onClose={() => setIsInvestigationModalOpen(false)}
          consultation={ipdPatientToInvestigationConsultation(selectedPatient)}
          allConsultations={[]}
          onApplyInvestigations={handleApplyInvestigations}
        />
      )}

      {/* Single-Day Daily Clinical Note Print & Preview Modal (includes that day's Medications) */}
      {selectedPatient && printPreviewDateKey && (
        <IpdDailyNotePrintModal
          patient={selectedPatient}
          dateKey={printPreviewDateKey}
          isDischargeSection={printPreviewIsDischarge}
          dayNotes={getNormalizedDailyNotesForPatient(selectedPatient)
            .filter(
              (n) =>
                (n.date || getTodayIso()) === printPreviewDateKey &&
                (printPreviewIsDischarge
                  ? isDischargeProtocolDailyNote(n)
                  : !isDischargeProtocolDailyNote(n))
            )
            .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))}
          medsForDate={(selectedPatient.medications || []).filter((m) => {
            const started = !m.startDate || m.startDate <= printPreviewDateKey;
            const notStoppedBefore = !m.stopDate || m.stopDate >= printPreviewDateKey;
            return started && notStoppedBefore;
          })}
          activeDoctor={doctor}
          onClose={() => {
            setPrintPreviewDateKey(null);
            setPrintPreviewIsDischarge(false);
          }}
        />
      )}

      {/* Standalone Daily Medication Chart Print & Preview Modal */}
      {selectedPatient && medPrintPreviewState && (
        <IpdMedicationPrintModal
          patient={selectedPatient}
          dateKey={medPrintPreviewState.dateKey}
          overrideItems={medPrintPreviewState.overrideItems}
          activeDoctor={doctor}
          onClose={() => setMedPrintPreviewState(null)}
        />
      )}

      {/* Discharge Patient Confirmation Modal */}
      {dischargeTargetPatient && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setDischargeTargetPatient(null)}
        >
          <div
            className="bg-white rounded-2xl border border-[#E6E0F0] shadow-2xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 bg-gradient-to-r from-[#FFF7ED] via-[#FFFBF5] to-[#F6F3FF] border-b border-[#F3E5D0] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#FFE0B2] border border-[#FDBA74] text-amber-900 flex items-center justify-center shrink-0">
                  <LogOut className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Discharge Patient</h3>
                  <p className="text-[11px] text-slate-600">
                    {dischargeTargetPatient.salutation
                      ? `${dischargeTargetPatient.salutation} `
                      : ''}
                    {dischargeTargetPatient.patientName} ·{' '}
                    {dischargeTargetPatient.wardOrBed || 'Ward'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDischargeTargetPatient(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white/80 cursor-pointer"
                aria-label="Close discharge dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="rounded-xl bg-[#FAF8F5] border border-[#E6E0F0] p-3 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Admitted Date</span>
                  <span className="font-semibold text-slate-900 font-mono">
                    {formatDisplayDate(dischargeTargetPatient.admissionDate)}
                  </span>
                </div>
                {dischargeTargetPatient.admittingDiagnosis && (
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-slate-500 shrink-0">Diagnosis</span>
                    <span className="font-semibold text-slate-800 text-right">
                      {dischargeTargetPatient.admittingDiagnosis}
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  Discharge Date
                </label>
                <input
                  type="date"
                  value={dischargeDateDraft}
                  onChange={(e) => setDischargeDateDraft(e.target.value || getTodayIso())}
                  className="w-full px-3 py-2 text-xs font-mono font-semibold text-slate-900 border border-[#DFD8EC] rounded-xl outline-none focus:border-amber-500"
                />
              </div>

              <p className="text-[11.5px] text-slate-600 leading-relaxed">
                Confirming will shift this patient from <strong>Admitted</strong> to{' '}
                <strong>Discharged</strong>, highlight their row in <strong>All Patients</strong>,
                and mark the discharge date on their admission record in the{' '}
                <strong>Master Register</strong>.
              </p>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setDischargeTargetPatient(null)}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmQuickDischarge}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 shadow-xs transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Confirm Discharge</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface AdmitIpdPatientModalProps {
  existingPatient: IpdPatientRecord | null;
  seedConsultation?: Consultation | null;
  consultations: Consultation[];
  ipdPatients: IpdPatientRecord[];
  doctor: DoctorAccount | null;
  onClose: () => void;
  onSave: (record: IpdPatientRecord) => void;
}

const AdmitIpdPatientModal: React.FC<AdmitIpdPatientModalProps> = ({
  existingPatient,
  seedConsultation,
  consultations,
  ipdPatients,
  doctor,
  onClose,
  onSave,
}) => {
  const [salutation, setSalutation] = useState<IpdPatientRecord['salutation']>(
    existingPatient?.salutation || ''
  );
  const [patientName, setPatientName] = useState(existingPatient?.patientName || '');
  const [age, setAge] = useState(existingPatient?.age || '');
  const [gender, setGender] = useState<IpdPatientRecord['gender']>(
    existingPatient?.gender || 'M'
  );
  const [ipdNo, setIpdNo] = useState(existingPatient?.ipdNo || '');
  const [uhid, setUhid] = useState(existingPatient?.uhid || '');
  const [wardOrBed, setWardOrBed] = useState(existingPatient?.wardOrBed || '');
  const [admissionDate, setAdmissionDate] = useState(
    existingPatient?.admissionDate || getTodayIso()
  );
  const [dischargeDate, setDischargeDate] = useState(
    existingPatient?.dischargeDate || existingPatient?.dischargeSummary?.dischargeDate || ''
  );
  const [surgeryDate, setSurgeryDate] = useState(existingPatient?.surgeryDate || '');
  const [status, setStatus] = useState<IpdPatientRecord['status']>(
    existingPatient?.status || 'admitted'
  );
  const [phoneNumber, setPhoneNumber] = useState(existingPatient?.phoneNumber || '');
  const [address, setAddress] = useState(existingPatient?.address || '');
  const [hospitalName, setHospitalName] = useState(
    existingPatient?.hospitalName || doctor?.hospitalName || ''
  );
  const [attendingConsultant, setAttendingConsultant] = useState(
    existingPatient?.attendingConsultant || doctor?.fullName || ''
  );
  const [admittingDiagnosis, setAdmittingDiagnosis] = useState(
    existingPatient?.admittingDiagnosis || ''
  );
  const [comorbidities, setComorbidities] = useState(existingPatient?.comorbidities || '');
  const [allergies, setAllergies] = useState(existingPatient?.allergies || '');
  const [clinicalSummary, setClinicalSummary] = useState(existingPatient?.clinicalSummary || '');
  const [importedInvestigations, setImportedInvestigations] = useState<InvestigationItem[]>(
    existingPatient?.investigationRecords || []
  );
  const [importedLabText, setImportedLabText] = useState(
    existingPatient?.labTestsAndImaging || ''
  );
  const [importedFromOpdId, setImportedFromOpdId] = useState<string>(
    existingPatient?.linkedOpdConsultationId || ''
  );
  const [masterSearchQuery, setMasterSearchQuery] = useState('');
  const [selectedDirectoryKey, setSelectedDirectoryKey] = useState('');
  const [autoFillBadgeText, setAutoFillBadgeText] = useState('');

  // Unified Master Register directory (OPD + OT + prior IPD records)
  const masterDirectory = useMemo(
    () => buildMasterRegisterPatientDirectory(consultations, ipdPatients),
    [consultations, ipdPatients]
  );

  const filteredMasterDirectory = useMemo(() => {
    const q = masterSearchQuery.trim().toLowerCase();
    if (!q) return masterDirectory.slice(0, 40);
    return masterDirectory
      .filter((entry) => {
        const hay = [
          entry.patientName,
          entry.uhid,
          entry.phoneNumber,
          entry.latestDiagnosis,
          entry.address,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 30);
  }, [masterDirectory, masterSearchQuery]);

  // Detect live match while typing Patient Name or UHID so doctor gets 1-click auto-fill
  const inlineMasterMatch = useMemo(() => {
    if (existingPatient || selectedDirectoryKey) return null;
    const cleanTypedName = normalizeClinicalPatientName(patientName);
    const cleanTypedUhid = uhid.trim().replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    if (cleanTypedName.length < 3 && cleanTypedUhid.length < 3) return null;
    return (
      masterDirectory.find((entry) => {
        if (
          cleanTypedUhid.length >= 3 &&
          entry.uhid &&
          entry.uhid.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() === cleanTypedUhid
        ) {
          return true;
        }
        if (
          cleanTypedName.length >= 3 &&
          normalizeClinicalPatientName(entry.patientName) === cleanTypedName
        ) {
          return true;
        }
        return false;
      }) || null
    );
  }, [existingPatient, selectedDirectoryKey, patientName, uhid, masterDirectory]);

  const applyMasterDirectoryEntry = (entry: MasterRegisterDirectoryPatient) => {
    setSelectedDirectoryKey(entry.key);
    setSalutation((entry.salutation as any) || '');
    setPatientName(entry.patientName || '');
    setAge(entry.age || '');
    setGender(entry.gender || 'M');
    setUhid(entry.uhid || '');
    setPhoneNumber(entry.phoneNumber || '');
    setAddress(entry.address || '');

    const compiled = compileAdmissionNotesFromOpd(
      {
        linkedOpdConsultationId: entry.latestConsultation?.id,
        patientName: entry.patientName,
        uhid: entry.uhid,
        age: entry.age,
        gender: entry.gender,
      },
      consultations
    );

    setImportedFromOpdId(compiled.latestVisit?.id || entry.latestConsultation?.id || '');
    setAdmittingDiagnosis(
      compiled.latestDiagnosis ||
        entry.latestDiagnosis ||
        entry.latestIpdRecord?.admittingDiagnosis ||
        ''
    );
    setComorbidities(
      entry.comorbidities ||
        compiled.compiledComorbidities ||
        entry.latestIpdRecord?.comorbidities ||
        ''
    );
    setAllergies(entry.allergies || entry.latestIpdRecord?.allergies || '');
    setClinicalSummary(
      compiled.formattedAdmissionSummaryText ||
        entry.latestIpdRecord?.clinicalSummary ||
        ''
    );

    if (compiled.mergedInvestigations.length > 0) {
      setImportedInvestigations(compiled.mergedInvestigations);
    } else if (entry.latestIpdRecord?.investigationRecords?.length) {
      setImportedInvestigations(entry.latestIpdRecord.investigationRecords);
    }
    if (compiled.labTestsAndImaging) {
      setImportedLabText(compiled.labTestsAndImaging);
    } else if (entry.latestIpdRecord?.labTestsAndImaging) {
      setImportedLabText(entry.latestIpdRecord.labTestsAndImaging);
    }

    const parts: string[] = [];
    if (compiled.matchedOpdVisits.length > 0) {
      parts.push(
        `${compiled.matchedOpdVisits.length} OPD visit${compiled.matchedOpdVisits.length === 1 ? '' : 's'}`
      );
    }
    if (compiled.latestExamination) parts.push('Latest Exam');
    if (compiled.latestIpss) parts.push('Latest IPSS');
    if (compiled.mergedInvestigations.length > 0) {
      parts.push(`${compiled.mergedInvestigations.length} Investigations`);
    }
    if (entry.ipdCount > 0) {
      parts.push(`${entry.ipdCount} Prior IPD`);
    }
    setAutoFillBadgeText(
      parts.length > 0
        ? `Auto-populated from Master Register: ${parts.join(' · ')}`
        : 'Auto-populated demographics from Master Register'
    );
  };

  // Pre-populate when opened directly from an OPD / Master Register row ("Admit to IPD")
  useEffect(() => {
    if (existingPatient || !seedConsultation) return;
    const matchInDir = masterDirectory.find(
      (e) =>
        e.latestConsultation?.id === seedConsultation.id ||
        normalizeClinicalPatientName(e.patientName) ===
          normalizeClinicalPatientName(seedConsultation.patientName)
    );
    if (matchInDir) {
      applyMasterDirectoryEntry(matchInDir);
    } else {
      const compiled = compileAdmissionNotesFromOpd(
        {
          linkedOpdConsultationId: seedConsultation.id,
          patientName: seedConsultation.patientName,
          uhid: seedConsultation.opdNo,
          age: seedConsultation.age,
          gender: seedConsultation.gender,
        },
        consultations
      );
      setImportedFromOpdId(seedConsultation.id);
      setSalutation((seedConsultation.salutation as any) || '');
      setPatientName(seedConsultation.patientName || '');
      setAge(seedConsultation.age || '');
      setGender((seedConsultation.gender as any) || 'M');
      setUhid(seedConsultation.opdNo || '');
      setPhoneNumber(seedConsultation.phoneNumber || seedConsultation.contactNumber || '');
      setAddress(seedConsultation.address || seedConsultation.city || '');
      setAdmittingDiagnosis(compiled.latestDiagnosis || seedConsultation.diagnosis || '');
      setComorbidities(compiled.compiledComorbidities || '');
      setClinicalSummary(compiled.formattedAdmissionSummaryText || '');
      if (compiled.mergedInvestigations.length > 0) {
        setImportedInvestigations(compiled.mergedInvestigations);
      }
      if (compiled.labTestsAndImaging) {
        setImportedLabText(compiled.labTestsAndImaging);
      }
      setAutoFillBadgeText(
        `Auto-populated from Master Register (${compiled.matchedOpdVisits.length || 1} OPD record)`
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedConsultation?.id]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientName.trim()) return;
    const now = Date.now();
    const effectiveDischargeDate =
      status === 'discharged' ? dischargeDate || getTodayIso() : dischargeDate || undefined;
    const record: IpdPatientRecord = {
      ...(existingPatient || {
        id: `ipd-${now}-${Math.random().toString(36).slice(2, 6)}`,
        dailyNotes: [],
        medications: [],
        medicationLogs: [],
        createdAt: now,
      }),
      salutation,
      patientName: patientName.trim(),
      age: age.trim(),
      gender,
      ipdNo: ipdNo.trim(),
      uhid: uhid.trim() || undefined,
      wardOrBed: wardOrBed.trim() || 'General Ward',
      admissionDate: admissionDate || getTodayIso(),
      dischargeDate: effectiveDischargeDate,
      surgeryDate: surgeryDate || undefined,
      status,
      phoneNumber: phoneNumber.trim() || undefined,
      address: address.trim() || undefined,
      hospitalName: hospitalName.trim() || undefined,
      attendingConsultant: attendingConsultant.trim() || doctor?.fullName || undefined,
      admittingDiagnosis: admittingDiagnosis.trim(),
      comorbidities: comorbidities.trim() || undefined,
      allergies: allergies.trim() || undefined,
      clinicalSummary: clinicalSummary.trim().slice(0, 2950) || undefined,
      investigationRecords: importedInvestigations,
      labTestsAndImaging: importedLabText || undefined,
      linkedOpdConsultationId: importedFromOpdId || undefined,
      doctorId: doctor?.uid || existingPatient?.doctorId,
      doctorName: doctor?.fullName || existingPatient?.doctorName,
      department: doctor?.department || existingPatient?.department,
      updatedAt: now,
    };
    onSave(record);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {existingPatient ? 'Edit IPD Admission Details' : 'Admit New IPD Patient'}
            </h2>
            <p className="text-xs text-slate-500">
              Search and auto-populate from your Patient Master Register (OPD + IPD + OT) or enter
              a new patient manually.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4">
          {!existingPatient && masterDirectory.length > 0 && (
            <div className="p-3 rounded-xl bg-teal-50/70 border border-teal-200 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-[11px] font-extrabold text-teal-900 flex items-center gap-1.5">
                  <Search className="w-3.5 h-3.5 text-teal-700" />
                  <span>Auto-Populate from Patient Master Register ({masterDirectory.length} patients)</span>
                </label>
                {selectedDirectoryKey && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDirectoryKey('');
                      setAutoFillBadgeText('');
                    }}
                    className="text-[10px] font-semibold text-teal-800 hover:underline cursor-pointer"
                  >
                    Clear selection
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                <div className="sm:col-span-5 relative">
                  <Search className="w-3.5 h-3.5 text-teal-600 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={masterSearchQuery}
                    onChange={(e) => setMasterSearchQuery(e.target.value)}
                    placeholder="Filter by name, UHID, phone..."
                    className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-white border border-teal-200 rounded-lg outline-none focus:border-teal-500"
                  />
                </div>
                <div className="sm:col-span-7">
                  <select
                    value={selectedDirectoryKey}
                    onChange={(e) => {
                      const entry = masterDirectory.find((x) => x.key === e.target.value);
                      if (entry) applyMasterDirectoryEntry(entry);
                    }}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-teal-200 rounded-lg outline-none focus:border-teal-500"
                  >
                    <option value="">-- Select patient from Master Register --</option>
                    {filteredMasterDirectory.map((entry) => {
                      const counts = [
                        entry.opdCount > 0 ? `${entry.opdCount} OPD` : '',
                        entry.otCount > 0 ? `${entry.otCount} OT` : '',
                        entry.ipdCount > 0 ? `${entry.ipdCount} IPD` : '',
                        entry.hasIpss ? 'IPSS' : '',
                      ]
                        .filter(Boolean)
                        .join('/');
                      return (
                        <option key={entry.key} value={entry.key}>
                          {entry.patientName} ({entry.age || '—'}/{entry.gender})
                          {entry.uhid ? ` [${entry.uhid}]` : ''} —{' '}
                          {entry.latestDiagnosis || 'Clinical Record'}
                          {counts ? ` (${counts})` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              {autoFillBadgeText && (
                <div className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                  <span>{autoFillBadgeText}</span>
                </div>
              )}
            </div>
          )}

          {inlineMasterMatch && (
            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="text-amber-900">
                <strong>Master Register match found:</strong> {inlineMasterMatch.patientName} (
                {inlineMasterMatch.age || '—'}/{inlineMasterMatch.gender})
                {inlineMasterMatch.opdCount > 0 ? ` · ${inlineMasterMatch.opdCount} OPD` : ''}
                {inlineMasterMatch.ipdCount > 0 ? ` · ${inlineMasterMatch.ipdCount} IPD` : ''}
                {inlineMasterMatch.hasIpss ? ' · IPSS available' : ''}
              </div>
              <button
                type="button"
                onClick={() => applyMasterDirectoryEntry(inlineMasterMatch)}
                className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] cursor-pointer"
              >
                Auto-Fill All Fields
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Title</label>
              <select
                value={salutation || ''}
                onChange={(e) => setSalutation(e.target.value as any)}
                className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
              >
                <option value="">—</option>
                <option value="Mr.">Mr.</option>
                <option value="Mrs.">Mrs.</option>
                <option value="Ms.">Ms.</option>
                <option value="Master">Master</option>
                <option value="Baby">Baby</option>
                <option value="Dr.">Dr.</option>
              </select>
            </div>
            <div className="sm:col-span-6">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Patient Name *
              </label>
              <input
                type="text"
                required
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                placeholder="Full patient name"
                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-teal-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Age</label>
              <input
                type="text"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="58"
                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-teal-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Sex</label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as any)}
                className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
              >
                <option value="M">M</option>
                <option value="F">F</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="sm:col-span-4">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Ward / Room / Bed *
              </label>
              <input
                type="text"
                required
                value={wardOrBed}
                onChange={(e) => setWardOrBed(e.target.value)}
                placeholder="e.g., Surgical Ward - Bed 4 / Room 302"
                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-teal-500"
              />
            </div>
            <div className="sm:col-span-4">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                IPD Number
              </label>
              <input
                type="text"
                value={ipdNo}
                onChange={(e) => setIpdNo(e.target.value)}
                placeholder="IPD-2026-041"
                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-teal-500"
              />
            </div>
            <div className="sm:col-span-4">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                UHID / OPD No
              </label>
              <input
                type="text"
                value={uhid}
                onChange={(e) => setUhid(e.target.value)}
                placeholder="Optional UHID"
                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-teal-500"
              />
            </div>

            <div className="sm:col-span-4">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Admission Date *
              </label>
              <input
                type="date"
                required
                value={admissionDate}
                onChange={(e) => setAdmissionDate(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg font-mono"
              />
            </div>
            <div className="sm:col-span-4">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Surgery Date (POD 0)
              </label>
              <input
                type="date"
                value={surgeryDate}
                onChange={(e) => setSurgeryDate(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg font-mono"
              />
            </div>
            <div className="sm:col-span-4">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => {
                  const next = e.target.value as IpdPatientRecord['status'];
                  setStatus(next);
                  if (next === 'discharged' && !dischargeDate) {
                    setDischargeDate(getTodayIso());
                  }
                }}
                className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
              >
                <option value="admitted">Admitted</option>
                <option value="discharged">Discharged</option>
              </select>
            </div>

            {status === 'discharged' && (
              <div className="sm:col-span-4">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Discharge Date
                </label>
                <input
                  type="date"
                  value={dischargeDate}
                  onChange={(e) => setDischargeDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg font-mono"
                />
              </div>
            )}

            <div className="sm:col-span-4">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Phone</label>
              <input
                type="text"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="Mobile number"
                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-teal-500"
              />
            </div>
            <div className="sm:col-span-4">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Hospital Name
              </label>
              <input
                type="text"
                value={hospitalName}
                onChange={(e) => setHospitalName(e.target.value)}
                placeholder="Hospital name"
                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-teal-500"
              />
            </div>
            <div className="sm:col-span-4">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Attending Consultant
              </label>
              <input
                type="text"
                value={attendingConsultant}
                onChange={(e) => setAttendingConsultant(e.target.value)}
                placeholder="Consultant name"
                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-teal-500"
              />
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-slate-700">
                  Admitting Diagnosis *
                </label>
              </div>
              <input
                type="text"
                required
                value={admittingDiagnosis}
                onChange={(e) => setAdmittingDiagnosis(e.target.value)}
                placeholder="e.g., Left lower ureteric calculus 14mm with HDN / BPH with AUR"
                className="w-full px-2.5 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-teal-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-slate-700">Comorbidities</label>
                </div>
                <input
                  type="text"
                  value={comorbidities}
                  onChange={(e) => setComorbidities(e.target.value)}
                  placeholder="DM, HTN, IHD, CKD, Antiplatelets..."
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-teal-500"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-slate-700">Drug Allergies</label>
                </div>
                <input
                  type="text"
                  value={allergies}
                  onChange={(e) => setAllergies(e.target.value)}
                  placeholder="NKDA or specify allergies"
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-teal-500"
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-slate-700">
                  Presenting Complaints &amp; Clinical Summary
                </label>
              </div>
              <textarea
                rows={3}
                value={clinicalSummary}
                onChange={(e) => setClinicalSummary(e.target.value)}
                placeholder="Brief admission summary, indication for surgery / admission..."
                className="w-full px-2.5 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-teal-500 resize-y"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{existingPatient ? 'Save Changes' : 'Admit Patient'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
