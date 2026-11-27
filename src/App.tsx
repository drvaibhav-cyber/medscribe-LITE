/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Header } from './components/Header';
import { Sidebar, MonthNavItem, YearNavItem } from './components/Sidebar';
import { IpdWorkspace, IpdChartTab } from './components/IpdWorkspace';
import { IpdDischargeSummaryModal } from './components/IpdDischargeSummaryModal';
import { ExcelWorkbookView } from './components/ExcelWorkbookView';
import { ClinicalCommandCenter } from './components/ClinicalCommandCenter';
import { ConsultationsQuickListView } from './components/ConsultationsQuickListView';
import { OtNotesQuickListView } from './components/OtNotesQuickListView';
import { PatientTimelineModal } from './components/PatientTimelineModal';
import { ConsultationFormModal } from './components/ConsultationFormModal';
import { MedicalDictionaryModal } from './components/MedicalDictionaryModal';
import { MedicineMasterModal } from './components/MedicineMasterModal';
import { DeleteConfirmModal } from './components/DeleteConfirmModal';
import { A4PrintModal } from './components/A4PrintModal';
import { AnalyticsPanel } from './components/AnalyticsPanel';
import {
  DoctorAuthPage,
  deleteRegisteredDoctorProfile,
} from './components/DoctorAuthPage';
import { DoctorProfileModal } from './components/DoctorProfileModal';
import { ManualInvestigationModal } from './components/ManualInvestigationModal';
import { LocalStorageSetupModal } from './components/LocalStorageSetupModal';
import { Consultation } from './types/opd';
import { IpdDischargeSummary, IpdPatientRecord } from './types/ipd';
import { exportIpdDischargeSummaryPdf } from './utils/ipdPdfExporter';
import {
  clearAllLocalIpdStorageForDoctor,
  enqueueIpdSyncAction,
  fetchIpdPatientsFromLocalServer,
  loadIpdDeletedIds,
  loadIpdPatientsLocal,
  loadIpdSyncQueue,
  markIpdPatientDeletedLocal,
  mergeIpdPatientLists,
  removeIpdSyncQueueItem,
  saveIpdPatientsLocal,
  syncIpdPatientsToLocalServer,
} from './utils/ipdStorage';
import {
  buildStandaloneOpdOtConsultationFromIpd,
  doesOpdConsultationMatchIpdOt,
  findMatchingAdmittedIpdPatient,
  findRemovedOtProcedures,
  getIpdPatientOtPrefix,
  serializeOtProceduresForCompare,
} from './utils/ipdClinicalSync';
import {
  exportOpdToExcel,
  getMonthInfo,
  formatDisplayDate,
  groupConsultationsByMonthAndDate,
} from './utils/excelExporter';
import { learnFromConsultation, learnFromConsultations, recordFieldUsage } from './utils/fieldSuggestions';
import { fetchMedicineMasterFromServer } from './utils/medicineMaster';
import {
  cleanChiefComplaintsText,
  cleanExplicitOpdNo,
  deduplicateClinicalText,
  deduplicatePlanAndAdviceFields,
  expandClinicalShorthands,
  mergeInvestigationsIntoConsultation,
  sanitizeAndEnrichConsultationFields,
  sanitizeLabTestsAndImagingText,
  sanitizeSalutationAndPatientName,
} from './utils/investigationUtils';
import {
  expandSeparateOpdAndOtEntries,
  findMatchingPatientIndexForBatchItem,
  findSameDateSameTypeMatchIndex,
  getConsultationOtProcedures,
  hasOpdClinicalData,
  hasOtNotesData,
  normalizeOtNotes,
} from './utils/otNotesUtils';
import {
  DoctorLocalStorageConfig,
  getDoctorLocalStorageConfig,
  syncDoctorDataToLocalFileSystem,
  importConsultationsFromLocalJsonFile,
} from './utils/localFileSystemStorage';
import {
  DoctorAccount,
  sanitizeConsultationDocId,
  setRuntimeActiveDoctor,
} from './types/doctor';
import {
  SurgicalProtocolTemplate,
  getSurgicalProtocolById,
  loadCustomSurgicalProtocolsLocal,
  saveCustomSurgicalProtocolsLocal,
  setRuntimeCustomSurgicalProtocols,
  mergeCustomSurgicalProtocols,
  fetchCustomProtocolsFromLocalServer,
  syncCustomProtocolsToLocalServer,
  loadDeletedCustomProtocolIds,
  markCustomProtocolDeleted,
  clearCustomProtocolDeleted,
  restoreDeletedBuiltinProtocolsLocal,
} from './utils/surgicalProtocols';
import { CheckCircle2 } from 'lucide-react';

const DOCTOR_STORAGE_PREFIX = 'medscribe_opd_consultations_v2_';
const DOCTOR_DELETED_IDS_PREFIX = 'medscribe_opd_deleted_ids_v1_';

function purgeLegacyDemoAndLoginMemory(): void {
  try {
    localStorage.removeItem('medscribe_active_doctor_v1');
    localStorage.removeItem('medscribe_opd_consultations_v1');
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.includes('demo-dr-vaibhav')) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));

    const rawDocs = localStorage.getItem('medscribe_registered_doctors_v1');
    if (rawDocs) {
      const parsed = JSON.parse(rawDocs);
      if (Array.isArray(parsed)) {
        const cleaned = parsed.filter((d: any) => d && d.uid && d.uid !== 'demo-dr-vaibhav');
        if (cleaned.length !== parsed.length) {
          localStorage.setItem('medscribe_registered_doctors_v1', JSON.stringify(cleaned));
        }
      }
    }
  } catch {
    // ignore storage cleanup errors
  }
}

export function getDoctorConsultationsStorageKey(doctorUid: string): string {
  const safeUid = (doctorUid || 'anonymous').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${DOCTOR_STORAGE_PREFIX}${safeUid}`;
}

export function getDoctorDeletedIdsStorageKey(doctorUid: string): string {
  const safeUid = (doctorUid || 'anonymous').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${DOCTOR_DELETED_IDS_PREFIX}${safeUid}`;
}

function loadDeletedIdsForDoctor(doctorUid?: string | null): Set<string> {
  if (!doctorUid) return new Set();
  try {
    const raw = localStorage.getItem(getDoctorDeletedIdsStorageKey(doctorUid));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return new Set(parsed.map((id) => String(id)));
    }
  } catch (e) {
    console.error('Error loading deleted consultation IDs:', e);
  }
  return new Set();
}

function addDeletedIdsForDoctor(doctorUid: string | undefined | null, ids: string[]): Set<string> {
  const existing = loadDeletedIdsForDoctor(doctorUid);
  for (const id of ids) {
    if (!id) continue;
    existing.add(id);
    existing.add(sanitizeConsultationDocId(id));
  }
  if (doctorUid) {
    try {
      localStorage.setItem(
        getDoctorDeletedIdsStorageKey(doctorUid),
        JSON.stringify(Array.from(existing))
      );
    } catch (e) {
      console.error('Error saving deleted consultation IDs:', e);
    }
  }
  return existing;
}

function removeDeletedIdsForDoctor(doctorUid: string | undefined | null, ids: string[]): void {
  if (!doctorUid || ids.length === 0) return;
  const existing = loadDeletedIdsForDoctor(doctorUid);
  let changed = false;
  for (const id of ids) {
    if (!id) continue;
    const sanitized = sanitizeConsultationDocId(id);
    if (existing.delete(id)) changed = true;
    if (existing.delete(sanitized)) changed = true;
    if (existing.delete(`${id}__all_ot`)) changed = true;
  }
  if (changed) {
    try {
      localStorage.setItem(
        getDoctorDeletedIdsStorageKey(doctorUid),
        JSON.stringify(Array.from(existing))
      );
    } catch (e) {
      console.error('Error updating deleted consultation IDs:', e);
    }
  }
}

function isConsultationIdDeleted(id: string | undefined, deletedSet: Set<string>): boolean {
  if (!id || deletedSet.size === 0) return false;
  if (deletedSet.has(id) || deletedSet.has(sanitizeConsultationDocId(id))) return true;
  if (id.includes('-ot-')) {
    const baseId = id.split('-ot-')[0];
    if (deletedSet.has(`${baseId}__all_ot`)) return true;
  }
  return false;
}

function sanitizeShorthandInText(val?: string): string {
  if (!val) return '';
  return expandClinicalShorthands(val);
}

function sanitizeConsultationShorthand(rawConsultation: Consultation): Consultation {
  const c = sanitizeAndEnrichConsultationFields(rawConsultation);
  const rawComplaints = sanitizeShorthandInText(c.complaints || c.chiefComplaints);
  const dedupedComplaints = cleanChiefComplaintsText(rawComplaints);

  const combinedRawPastMed = deduplicateClinicalText(
    [
      sanitizeShorthandInText(c.pastMedication),
      sanitizeShorthandInText(c.additionalHistory),
      sanitizeShorthandInText(c.history),
    ]
      .filter(Boolean)
      .join('; '),
    '; '
  );

  const sanitizedLabs = sanitizeLabTestsAndImagingText(
    sanitizeShorthandInText(c.labTestsAndImaging),
    combinedRawPastMed
  );

  const dedupedPlan = deduplicatePlanAndAdviceFields(
    sanitizeShorthandInText(c.assessmentPlan),
    sanitizeShorthandInText(c.advice),
    sanitizeShorthandInText(c.nextVisit || c.followUpDate)
  );

  const { salutation: cleanSalutation, patientName: cleanPatientName } =
    sanitizeSalutationAndPatientName(c.salutation, c.patientName);

  return sanitizeAndEnrichConsultationFields({
    ...c,
    opdNo: cleanExplicitOpdNo(c.opdNo),
    salutation: (cleanSalutation || c.salutation || '') as any,
    patientName: cleanPatientName || c.patientName,
    complaints: dedupedComplaints,
    chiefComplaints: dedupedComplaints,
    systemicExamination: deduplicateClinicalText(sanitizeShorthandInText(c.systemicExamination)),
    genitalExamination: deduplicateClinicalText(sanitizeShorthandInText(c.genitalExamination)),
    perRectalExam: deduplicateClinicalText(sanitizeShorthandInText(c.perRectalExam)),
    pastMedication: deduplicateClinicalText(sanitizedLabs.pastMedication, '; '),
    additionalHistory: '',
    history: '',
    labTestsAndImaging: sanitizedLabs.labTestsAndImaging,
    diagnosis: deduplicateClinicalText(sanitizeShorthandInText(c.diagnosis), ' / '),
    testsRequested: deduplicateClinicalText(sanitizeShorthandInText(c.testsRequested), ', '),
    assessmentPlan: dedupedPlan.assessmentPlan,
    advice: dedupedPlan.advice,
    nextVisit: dedupedPlan.nextVisit,
    otNotes: hasOtNotesData(c.otNotes) ? normalizeOtNotes(c.otNotes) : undefined,
  });
}

function loadConsultationsForDoctor(doctor: DoctorAccount | null): Consultation[] {
  if (!doctor || !doctor.uid) return [];
  const storageKey = getDoctorConsultationsStorageKey(doctor.uid);
  const deletedSet = loadDeletedIdsForDoctor(doctor.uid);

  try {
    const saved = localStorage.getItem(storageKey);
    if (saved !== null) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return expandSeparateOpdAndOtEntries(
          parsed
            .filter(
              (c: Consultation) =>
                (!c.doctorId || c.doctorId === doctor.uid) &&
                !isConsultationIdDeleted(c.id, deletedSet)
            )
            .map((c: Consultation) =>
              sanitizeConsultationShorthand({
                ...c,
                doctorId: doctor.uid,
                doctorName: c.doctorName || doctor.fullName,
              })
            )
        ).filter((c) => !isConsultationIdDeleted(c.id, deletedSet));
      }
    }

    // Brand-new or distinct doctor account: start with an empty personal patient register
    localStorage.setItem(storageKey, JSON.stringify([]));
    return [];
  } catch (e) {
    console.error('Error loading doctor-specific consultations:', e);
    return [];
  }
}

export default function App() {
  // Purge any legacy demo records or persisted login session on startup
  useEffect(() => {
    purgeLegacyDemoAndLoginMemory();
  }, []);

  // Doctor Auth state (strictly in-memory per session — zero login memory across reloads)
  const [currentDoctor, setCurrentDoctor] = useState<DoctorAccount | null>(null);
  const [authViewMode, setAuthViewMode] = useState<'login' | 'register' | null>(null);

  const [consultations, setConsultations] = useState<Consultation[]>(() =>
    loadConsultationsForDoctor(currentDoctor)
  );

  // Top-level department switcher: OPD Section (current screen) vs IPD Section
  const [activeSection, setActiveSection] = useState<'opd' | 'ipd'>('opd');

  // IPD (In-Patient Department) records + offline/online auto-sync state
  const [ipdPatients, setIpdPatients] = useState<IpdPatientRecord[]>(() =>
    loadIpdPatientsLocal(currentDoctor?.uid)
  );
  const ipdPatientsRef = useRef<IpdPatientRecord[]>(ipdPatients);
  useEffect(() => {
    ipdPatientsRef.current = ipdPatients;
  }, [ipdPatients]);

  // Custom Surgical Protocol Templates (persisted locally + Express disk mirror)
  const [deletedProtocolIds, setDeletedProtocolIds] = useState<string[]>(() =>
    Array.from(loadDeletedCustomProtocolIds(currentDoctor?.uid))
  );
  const [customSurgicalProtocols, setCustomSurgicalProtocols] = useState<
    SurgicalProtocolTemplate[]
  >(() => {
    const initialDeleted = loadDeletedCustomProtocolIds(currentDoctor?.uid);
    const initial = loadCustomSurgicalProtocolsLocal(currentDoctor?.uid);
    setRuntimeCustomSurgicalProtocols(initial, initialDeleted);
    return initial;
  });
  const customProtocolsRef = useRef<SurgicalProtocolTemplate[]>(customSurgicalProtocols);
  useEffect(() => {
    customProtocolsRef.current = customSurgicalProtocols;
    setRuntimeCustomSurgicalProtocols(customSurgicalProtocols, new Set(deletedProtocolIds));
  }, [customSurgicalProtocols, deletedProtocolIds]);

  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [pendingIpdSyncCount, setPendingIpdSyncCount] = useState<number>(() =>
    loadIpdSyncQueue(currentDoctor?.uid).length
  );
  const [isIpdSyncing, setIsIpdSyncing] = useState(false);

  // Modal visibility states
  const [isDictionaryOpen, setIsDictionaryOpen] = useState(false);
  const [isMedicineMasterOpen, setIsMedicineMasterOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formInitialTab, setFormInitialTab] = useState<
    'patient' | 'vitals' | 'history' | 'exams' | 'rx' | 'plan' | 'ot'
  >('patient');
  const [isTimelineOpen, setIsTimelineOpen] = useState(false);
  const [isDoctorProfileOpen, setIsDoctorProfileOpen] = useState(false);

  // Local Computer File System Storage state & 1st-login prompt
  const [localStorageConfig, setLocalStorageConfig] = useState<DoctorLocalStorageConfig>(() =>
    getDoctorLocalStorageConfig(currentDoctor)
  );
  const [isLocalStorageModalOpen, setIsLocalStorageModalOpen] = useState(false);
  const [isFirstLoginStoragePrompt, setIsFirstLoginStoragePrompt] = useState(false);

  // Active items for editing/viewing/deleting/printing
  const [consultationToEdit, setConsultationToEdit] = useState<Consultation | null>(null);
  const [consultationToDelete, setConsultationToDelete] = useState<Consultation | null>(null);
  const [consultationToPrint, setConsultationToPrint] = useState<Consultation | null>(null);
  const [consultationForInvestigation, setConsultationForInvestigation] = useState<Consultation | null>(null);
  const [printModalMode, setPrintModalMode] = useState<'single' | 'consolidated'>('single');
  const [printModalDocType, setPrintModalDocType] = useState<'opd' | 'ot'>('opd');
  const [defaultDateForNew, setDefaultDateForNew] = useState<string | undefined>(undefined);
  const [focusedDate, setFocusedDate] = useState<string | null>(null);
  const [selectedPatientForTimeline, setSelectedPatientForTimeline] = useState<string | null>(null);

  // Cross-section IPD navigation & global printable Discharge Summary review modal
  const [focusedIpdPatientId, setFocusedIpdPatientId] = useState<string | null>(null);
  const [focusedIpdChartTab, setFocusedIpdChartTab] = useState<IpdChartTab | null>(null);
  const [pendingAdmitSeedConsultation, setPendingAdmitSeedConsultation] =
    useState<Consultation | null>(null);
  const [ipdPatientForDischargePrint, setIpdPatientForDischargePrint] =
    useState<IpdPatientRecord | null>(null);

  // Toast notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Header search bar query (filters by patient name or OPD number)
  const [headerSearchQuery, setHeaderSearchQuery] = useState('');

  // Toggleable Analytics Panel state (hidden by default, opens only when clicked) & interactive diagnosis filter
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
  const [selectedDiagnosisFilter, setSelectedDiagnosisFilter] = useState<string | null>(null);

  // Left-Hand Control Sidebar state & active Year / Month sheet
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [selectedYearKey, setSelectedYearKey] = useState<string>('ALL');
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>('ALL');

  // Workspace View Mode — 'desk' by default (privacy mode), 'consultations' for quick patient list, 'ot' for OT Register, 'register' for detailed multi-sheet register
  const [activeWorkspaceView, setActiveWorkspaceView] = useState<
    'desk' | 'consultations' | 'ot' | 'register'
  >('desk');
  const isPatientListOpen = activeWorkspaceView !== 'desk';
  const setIsPatientListOpen = (
    openOrUpdater: boolean | ((prev: boolean) => boolean)
  ) => {
    setActiveWorkspaceView((prevView) => {
      const prevOpen = prevView !== 'desk';
      const nextOpen =
        typeof openOrUpdater === 'function' ? openOrUpdater(prevOpen) : openOrUpdater;
      return nextOpen ? 'register' : 'desk';
    });
  };

  // Sync per-doctor Master Medication List & Groups from local backend JSON on login/switch
  useEffect(() => {
    if (!currentDoctor?.uid) return;
    fetchMedicineMasterFromServer(currentDoctor.uid).catch(() => {});
  }, [currentDoctor?.uid]);

  // IPD Local Disk Mirror Sync Queue Flush
  const flushIpdSyncQueue = useCallback(
    async (explicitPatients?: IpdPatientRecord[]) => {
      if (!currentDoctor?.uid) return;
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;

      const doctorUid = currentDoctor.uid;
      const queue = loadIpdSyncQueue(doctorUid);
      const currentList = explicitPatients || ipdPatientsRef.current;

      if (queue.length === 0 && !explicitPatients) {
        return;
      }

      setIsIpdSyncing(true);
      try {
        await syncIpdPatientsToLocalServer(currentList, doctorUid);
        for (const item of queue) {
          removeIpdSyncQueueItem(item.patientId, doctorUid);
        }
      } catch (err) {
        console.warn('IPD local disk mirror sync deferred:', err);
      } finally {
        setPendingIpdSyncCount(loadIpdSyncQueue(doctorUid).length);
        setIsIpdSyncing(false);
      }
    },
    [currentDoctor]
  );

  // Track browser online / offline connectivity and auto-sync IPD queue when reconnected
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      flushIpdSyncQueue().catch(() => {});
    };
    const handleOffline = () => {
      setIsOnline(false);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [flushIpdSyncQueue]);

  // Load IPD records from localStorage + local server mirror whenever doctor changes
  useEffect(() => {
    if (!currentDoctor?.uid) {
      setIpdPatients([]);
      setPendingIpdSyncCount(0);
      return;
    }
    const localList = loadIpdPatientsLocal(currentDoctor.uid);
    setIpdPatients(localList);
    setPendingIpdSyncCount(loadIpdSyncQueue(currentDoctor.uid).length);

    let cancelled = false;
    fetchIpdPatientsFromLocalServer(currentDoctor.uid)
      .then((serverList) => {
        if (cancelled || !serverList) return;
        const deletedIds = loadIpdDeletedIds(currentDoctor.uid);
        setIpdPatients((prev) => {
          const merged = mergeIpdPatientLists(prev, serverList, deletedIds);
          saveIpdPatientsLocal(merged, currentDoctor.uid);
          return merged;
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [currentDoctor?.uid]);

  // Load & sync Custom Surgical Protocols (localStorage + Express local disk mirror)
  useEffect(() => {
    const uid = currentDoctor?.uid;
    const deletedSet = loadDeletedCustomProtocolIds(uid);
    const localList = loadCustomSurgicalProtocolsLocal(uid);
    setDeletedProtocolIds(Array.from(deletedSet));
    setCustomSurgicalProtocols(localList);
    setRuntimeCustomSurgicalProtocols(localList, deletedSet);
    if (!uid) return;

    let cancelled = false;
    fetchCustomProtocolsFromLocalServer(uid).then((serverList) => {
      if (cancelled || !serverList) return;
      const deletedIds = loadDeletedCustomProtocolIds(uid);
      setCustomSurgicalProtocols((prev) => {
        const merged = mergeCustomSurgicalProtocols(prev, serverList, deletedIds);
        saveCustomSurgicalProtocolsLocal(merged, uid);
        setRuntimeCustomSurgicalProtocols(merged, deletedIds);
        return merged;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [currentDoctor?.uid]);

  // Sync OT notes added, edited, OR deleted in IPD into the OPD OT Notes List & Master Register per existing rules
  const syncIpdOtNotesToOpdRegister = useCallback(
    (patient: IpdPatientRecord, previousRecord?: IpdPatientRecord) => {
      if (!currentDoctor?.uid) return;
      const prevProcs = getConsultationOtProcedures(previousRecord as any).filter((ot) =>
        hasOtNotesData(ot)
      );
      const validProcs = getConsultationOtProcedures(patient as any).filter((ot) =>
        hasOtNotesData(ot)
      );
      const removedProcs = findRemovedOtProcedures(prevProcs, validProcs);

      if (validProcs.length === 0 && removedProcs.length === 0) return;

      const candidates = validProcs.map((proc) =>
        sanitizeConsultationShorthand(
          buildStandaloneOpdOtConsultationFromIpd(patient, proc, currentDoctor)
        )
      );

      if (candidates.length > 0) {
        removeDeletedIdsForDoctor(
          currentDoctor.uid,
          candidates.map((c) => c.id)
        );
      }

      setConsultations((prev) => {
        let updated = [...prev];
        const removedDocIds = new Set<string>();

        // 1. Propagate any OT procedures deleted in IPD -> remove from OPD OT list & Master Register
        if (removedProcs.length > 0) {
          const remainingAfterDelete: Consultation[] = [];
          for (const c of updated) {
            const matchedRemoved = removedProcs.some((rp) =>
              doesOpdConsultationMatchIpdOt(c, patient, rp)
            );
            if (!matchedRemoved) {
              remainingAfterDelete.push(c);
              continue;
            }
            if (!hasOpdClinicalData(c) || c.id.startsWith('ot-') || c.id.includes('-ot-')) {
              removedDocIds.add(c.id);
              removedDocIds.add(sanitizeConsultationDocId(c.id));
              if (c.id.startsWith('ot-')) {
                removedDocIds.add(`${c.id}__all_ot`);
              }
            } else {
              // Combined OPD+OT record: preserve the OPD consultation and strip the removed OT procedure(s)
              const remainingOtProcs = getConsultationOtProcedures(c).filter(
                (cp) => !removedProcs.some((rp) => doesOpdConsultationMatchIpdOt({ ...c, otNotes: cp, otProcedures: [cp] }, patient, rp))
              );
              const cleaned: Consultation = {
                ...c,
                otNotes:
                  remainingOtProcs.length > 0
                    ? remainingOtProcs[remainingOtProcs.length - 1]
                    : undefined,
                otProcedures: remainingOtProcs.length > 0 ? remainingOtProcs : undefined,
                updatedAt: Date.now(),
              };
              remainingAfterDelete.push(cleaned);
            }
          }
          updated = remainingAfterDelete;

          if (removedDocIds.size > 0) {
            addDeletedIdsForDoctor(currentDoctor.uid, Array.from(removedDocIds));
          }
        }

        // 2. Upsert any active / newly added / edited IPD OT procedures into OPD OT list & Master Register
        for (const rawCandidate of candidates) {
          let candidate = rawCandidate;

          // Backfill missing demographics from any pre-existing OPD visit of this patient
          // so Consolidated History links OPD consultations and IPD-originated OT notes together.
          const demoIdx = findMatchingPatientIndexForBatchItem(candidate, updated);
          if (demoIdx >= 0) {
            const ex = updated[demoIdx];
            candidate = {
              ...candidate,
              salutation: candidate.salutation || ex.salutation,
              age: candidate.age || ex.age,
              gender: candidate.gender || ex.gender,
              opdNo: candidate.opdNo || ex.opdNo,
              phoneNumber: candidate.phoneNumber || ex.phoneNumber,
              contactNumber: candidate.contactNumber || ex.contactNumber || ex.phoneNumber,
              city: candidate.city || ex.city,
              address: candidate.address || ex.address,
            };
          }

          const procId = candidate.otNotes?.id;
          let existingIdx = updated.findIndex(
            (c) =>
              c.id === candidate.id ||
              (procId &&
                hasOtNotesData(c) &&
                !hasOpdClinicalData(c) &&
                c.otNotes?.id === procId)
          );
          if (existingIdx < 0) {
            existingIdx = findSameDateSameTypeMatchIndex(candidate, updated);
          }

          if (existingIdx >= 0) {
            const existing = updated[existingIdx];
            const merged = sanitizeConsultationShorthand({
              ...existing,
              date: candidate.date || existing.date,
              diagnosis: candidate.diagnosis || existing.diagnosis,
              otNotes: candidate.otNotes,
              otProcedures: candidate.otProcedures,
              updatedAt: Date.now(),
            });
            updated[existingIdx] = merged;
          } else {
            updated.unshift(candidate);
          }
        }

        return expandSeparateOpdAndOtEntries(updated);
      });
    },
    [currentDoctor]
  );

  const handleUpsertIpdPatient = useCallback(
    (patient: IpdPatientRecord, options?: { skipOpdOtSync?: boolean }) => {
      if (!currentDoctor?.uid) return;
      const prev = ipdPatientsRef.current;
      const previousRecord = prev.find((p) => p.id === patient.id);

      const enriched: IpdPatientRecord = {
        ...patient,
        doctorId: currentDoctor.uid,
        doctorName: patient.doctorName || currentDoctor.fullName,
        department: patient.department || currentDoctor.department,
        updatedAt: Date.now(),
      };

      const exists = Boolean(previousRecord);
      const nextList = (
        exists
          ? prev.map((p) => (p.id === enriched.id ? enriched : p))
          : [enriched, ...prev]
      ).sort((a, b) => {
        if (a.status !== b.status) return a.status === 'admitted' ? -1 : 1;
        return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
      });

      ipdPatientsRef.current = nextList;
      setIpdPatients(nextList);
      saveIpdPatientsLocal(nextList, currentDoctor.uid);
      const q = enqueueIpdSyncAction(enriched.id, 'upsert', currentDoctor.uid);
      setPendingIpdSyncCount(q.length);

      if (typeof navigator === 'undefined' || navigator.onLine) {
        flushIpdSyncQueue(nextList).catch(() => {});
      }

      // If OT notes were added, modified, or deleted inside IPD, mirror them into the OPD OT list & Master Register
      if (!options?.skipOpdOtSync) {
        const prevOtSerialized = serializeOtProceduresForCompare(previousRecord);
        const nextOtSerialized = serializeOtProceduresForCompare(enriched);
        if (nextOtSerialized !== prevOtSerialized) {
          syncIpdOtNotesToOpdRegister(enriched, previousRecord);
        }
      }
    },
    [currentDoctor, flushIpdSyncQueue, syncIpdOtNotesToOpdRegister]
  );

  // OPD OT notes are intentionally kept completely independent of IPD ward records:
  // adding or editing OT notes in OPD never creates or modifies any IPD patient chart.

  const handleDeleteIpdPatient = useCallback(
    (patientId: string) => {
      if (!currentDoctor?.uid) return;
      const removedPatient = ipdPatientsRef.current.find((p) => p.id === patientId);
      const nextList = ipdPatientsRef.current.filter((p) => p.id !== patientId);
      ipdPatientsRef.current = nextList;
      setIpdPatients(nextList);
      saveIpdPatientsLocal(nextList, currentDoctor.uid);
      markIpdPatientDeletedLocal(patientId, currentDoctor.uid);
      const q = enqueueIpdSyncAction(patientId, 'delete', currentDoctor.uid);
      setPendingIpdSyncCount(q.length);

      // Also clean up any IPD-originated OT entries (`ot-ipd-<patientId>-*`) synced to OPD Register
      const ipdOtPrefix = getIpdPatientOtPrefix(patientId);
      setConsultations((prev) => {
        const toRemove = prev.filter((c) => c.id.startsWith(ipdOtPrefix));
        if (toRemove.length === 0) return prev;
        const removedIds = toRemove.map((c) => c.id);
        addDeletedIdsForDoctor(currentDoctor.uid, removedIds);
        return prev.filter((c) => !c.id.startsWith(ipdOtPrefix));
      });

      showToast(
        removedPatient
          ? `Deleted IPD patient ${removedPatient.patientName} & synced removal`
          : 'Deleted IPD patient record'
      );

      if (typeof navigator === 'undefined' || navigator.onLine) {
        flushIpdSyncQueue(nextList).catch(() => {});
      }
    },
    [currentDoctor, flushIpdSyncQueue]
  );

  const admittedIpdCount = useMemo(
    () => ipdPatients.filter((p) => p.status === 'admitted').length,
    [ipdPatients]
  );

  // Persist to doctor-specific localStorage whenever consultations change (stripping heavy base64 images to prevent QuotaExceededError / UI freezes)
  useEffect(() => {
    if (!currentDoctor?.uid) return;
    try {
      const storageKey = getDoctorConsultationsStorageKey(currentDoctor.uid);
      const lightweightForStorage = consultations.map(
        ({ sourceImages: _si, sourceImageThumbnail, ...rest }) => ({
          ...rest,
          sourceImageThumbnail:
            sourceImageThumbnail && sourceImageThumbnail.length < 30000
              ? sourceImageThumbnail
              : undefined,
        })
      );
      localStorage.setItem(storageKey, JSON.stringify(lightweightForStorage));
    } catch (e) {
      console.error('Error saving consultations:', e);
    }
  }, [consultations, currentDoctor?.uid]);

  // Load Local Computer Storage config for the active doctor & prompt on 1st login if not yet configured
  useEffect(() => {
    if (!currentDoctor?.uid) return;
    const cfg = getDoctorLocalStorageConfig(currentDoctor);
    setLocalStorageConfig(cfg);
    if (!cfg.promptCompleted) {
      setIsFirstLoginStoragePrompt(true);
      setIsLocalStorageModalOpen(true);
    }
  }, [currentDoctor?.uid]);

  // Automatically mirror consultations to Local Computer File System whenever consultations change and local storage is enabled
  useEffect(() => {
    if (!currentDoctor?.uid) return;
    const cfg = getDoctorLocalStorageConfig(currentDoctor);
    if (!cfg.enabled) return;
    const timer = setTimeout(() => {
      syncDoctorDataToLocalFileSystem(currentDoctor, consultations, {
        forceDownload: false,
      })
        .then((res) => {
          setLocalStorageConfig(res.updatedConfig);
        })
        .catch((err) => {
          console.warn('Background local computer file sync warning:', err);
        });
    }, 600);
    return () => clearTimeout(timer);
  }, [consultations, currentDoctor?.uid]);

  // Seed suggestion memory from the active doctor's consultations
  useEffect(() => {
    if (consultations.length > 0) {
      learnFromConsultations(consultations, 1);
    }
  }, [currentDoctor?.uid, consultations]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  }, []);

  const handleSaveCustomSurgicalProtocol = useCallback(
    (protocol: SurgicalProtocolTemplate) => {
      const uid = currentDoctor?.uid;
      clearCustomProtocolDeleted(protocol.id, uid);
      const deletedIds = loadDeletedCustomProtocolIds(uid);
      setDeletedProtocolIds(Array.from(deletedIds));
      const next = mergeCustomSurgicalProtocols(
        [protocol],
        customProtocolsRef.current,
        deletedIds
      );
      customProtocolsRef.current = next;
      setCustomSurgicalProtocols(next);
      setRuntimeCustomSurgicalProtocols(next, deletedIds);
      saveCustomSurgicalProtocolsLocal(next, uid);
      if (uid) {
        syncCustomProtocolsToLocalServer(uid, next).catch(() => {});
      }
      showToast(`Saved surgical protocol: ${protocol.name}`);
    },
    [currentDoctor, showToast]
  );

  const handleDeleteCustomSurgicalProtocol = useCallback(
    (protocolId: string) => {
      const uid = currentDoctor?.uid;
      const existingBeforeDelete =
        customProtocolsRef.current.find((p) => p.id === protocolId) ||
        getSurgicalProtocolById(protocolId);
      markCustomProtocolDeleted(protocolId, uid);
      const deletedIds = loadDeletedCustomProtocolIds(uid);
      setDeletedProtocolIds(Array.from(deletedIds));
      const next = customProtocolsRef.current.filter((p) => p.id !== protocolId);
      customProtocolsRef.current = next;
      setCustomSurgicalProtocols(next);
      setRuntimeCustomSurgicalProtocols(next, deletedIds);
      saveCustomSurgicalProtocolsLocal(next, uid);
      if (uid) {
        syncCustomProtocolsToLocalServer(uid, next).catch(() => {});
      }
      showToast(
        `Removed protocol${existingBeforeDelete ? `: ${existingBeforeDelete.name}` : ''}`
      );
    },
    [currentDoctor, showToast]
  );

  const handleRestoreBuiltinProtocols = useCallback(() => {
    const uid = currentDoctor?.uid;
    const nextDeleted = restoreDeletedBuiltinProtocolsLocal(uid);
    setDeletedProtocolIds(Array.from(nextDeleted));
    setRuntimeCustomSurgicalProtocols(customProtocolsRef.current, nextDeleted);
    showToast('Restored default surgical protocols');
  }, [currentDoctor?.uid, showToast]);

  // Manual save or edit
  const handleSaveConsultation = (rawItem: Consultation) => {
    const item = sanitizeConsultationShorthand({
      ...rawItem,
      doctorId: currentDoctor?.uid,
      doctorName: currentDoctor?.fullName || rawItem.doctorName,
      department: currentDoctor?.department || rawItem.department,
    });
    learnFromConsultation(item, 2);
    if (item.date) {
      setFocusedDate(item.date);
    }

    let toastMsg = '';

    setConsultations((prev) => {
      const mergedInv = mergeInvestigationsIntoConsultation(
        item,
        item.investigationRecords || [],
        prev
      );
      const itemProcs = getConsultationOtProcedures(item);
      const latestOt = itemProcs.length > 0 ? itemProcs[itemProcs.length - 1] : undefined;
      const effectiveDate =
        latestOt?.surgeryDate && hasOtNotesData(item)
          ? latestOt.surgeryDate
          : item.date;

      let enrichedItem: Consultation = {
        ...item,
        date: effectiveDate,
        diagnosis:
          item.diagnosis ||
          latestOt?.postOpDiagnosis ||
          latestOt?.preOpDiagnosis ||
          (latestOt?.procedureName ? `Operated: ${latestOt.procedureName}` : ''),
        otNotes: latestOt,
        otProcedures: itemProcs.length > 0 ? itemProcs : undefined,
        investigationRecords: mergedInv.investigationRecords,
        labTestsAndImaging: mergedInv.labTestsAndImaging,
      };

      const idx = prev.findIndex((c) => c.id === enrichedItem.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = enrichedItem;
        return expandSeparateOpdAndOtEntries(copy);
      }

      // If creating a new entry (including a new OT entry under its surgery date) and a previous record of that patient exists,
      // backfill any missing patient demographics so Consolidated History links all their OPD visits and OT notes.
      const existingMatchIdx = findMatchingPatientIndexForBatchItem(enrichedItem, prev);
      if (existingMatchIdx >= 0) {
        const ex = prev[existingMatchIdx];
        enrichedItem = {
          ...enrichedItem,
          salutation: enrichedItem.salutation || ex.salutation,
          age: enrichedItem.age || ex.age,
          gender: enrichedItem.gender || ex.gender,
          opdNo: enrichedItem.opdNo || ex.opdNo,
          phoneNumber: enrichedItem.phoneNumber || ex.phoneNumber,
          contactNumber: enrichedItem.contactNumber || ex.contactNumber || ex.phoneNumber,
          city: enrichedItem.city || ex.city,
          address: enrichedItem.address || ex.address,
        };
        if (hasOtNotesData(enrichedItem)) {
          const procName = enrichedItem.otNotes?.procedureName || 'OT Notes';
          toastMsg = `Saved new OT entry (${procName}) under ${formatDisplayDate(
            enrichedItem.date
          )} and linked to ${ex.patientName}'s Consolidated History`;
        }
      }

      return expandSeparateOpdAndOtEntries([enrichedItem, ...prev]);
    });

    const { monthLabel } = getMonthInfo(item.date);
    showToast(
      toastMsg ||
        `Saved consultation for ${item.patientName} in sheet [${monthLabel}] under Date [${formatDisplayDate(item.date)}]`
    );
  };

  // Permanently delete a consultation/OT record across Master Register, Consultations list, OT Notes list, and localStorage
  const executePermanentDelete = (id: string) => {
    const found = consultations.find((c) => c.id === id);
    const idsToDelete = new Set<string>([id, sanitizeConsultationDocId(id)]);
    const parentsToResave: Consultation[] = [];

    // 1. Only cascade-delete `${id}-ot-*` split entries when deleting a standalone OT record itself;
    // deleting an OPD consultation deletes ONLY the OPD row and preserves separate OT Notes rows.
    const isStandaloneOtRecord =
      !found || !hasOpdClinicalData(found) || id.startsWith('ot-') || id.includes('-ot-');
    if (isStandaloneOtRecord) {
      consultations.forEach((c) => {
        if (c.id.startsWith(`${id}-ot-`)) {
          idsToDelete.add(c.id);
          idsToDelete.add(sanitizeConsultationDocId(c.id));
        }
      });
    }

    // 2. If `id` is a split OT record (`${baseId}-ot-${procId}`), clean up or remove its base parent
    if (id.includes('-ot-')) {
      const baseId = id.split('-ot-')[0];
      const baseRecord = consultations.find((c) => c.id === baseId);
      if (!baseRecord) {
        idsToDelete.add(`${baseId}__all_ot`);
        if (baseId.startsWith('ot-')) {
          idsToDelete.add(baseId);
          idsToDelete.add(sanitizeConsultationDocId(baseId));
        }
      } else if (!hasOpdClinicalData(baseRecord) || baseId.startsWith('ot-')) {
        // Base record was an empty shell / standalone OT remnant -> delete it completely
        idsToDelete.add(baseId);
        idsToDelete.add(sanitizeConsultationDocId(baseId));
        idsToDelete.add(`${baseId}__all_ot`);
      } else {
        // Base record is a real OPD consultation -> strip any embedded OT notes and re-save so it never respawns the deleted OT row
        idsToDelete.add(`${baseId}__all_ot`);
        const cleanedParent: Consultation = {
          ...baseRecord,
          otNotes: undefined,
          otProcedures: undefined,
          updatedAt: Date.now(),
        };
        parentsToResave.push(cleanedParent);
      }
    } else if (found && (!hasOpdClinicalData(found) || id.startsWith('ot-'))) {
      idsToDelete.add(`${id}__all_ot`);
    }

    const updatedDeletedSet = addDeletedIdsForDoctor(
      currentDoctor?.uid,
      Array.from(idsToDelete)
    );

    setConsultations((prev) =>
      prev
        .filter((c) => !isConsultationIdDeleted(c.id, updatedDeletedSet))
        .map((c) => {
          const updatedParent = parentsToResave.find((p) => p.id === c.id);
          return updatedParent || c;
        })
    );

    // Deleting an OPD OT note does not alter IPD ward records.
    return { found, syncedDeletedIpdNames: [] as string[] };
  };

  // Delete consultation request - triggers clinical confirmation modal
  const handleDeleteConsultation = (id: string) => {
    const found = consultations.find((c) => c.id === id);
    if (found) {
      setConsultationToDelete(found);
    } else {
      executePermanentDelete(id);
      showToast('Record removed from Master Register, Consultations, and OT Notes.');
    }
  };

  // Confirmed permanent delete
  const handleConfirmDelete = (id: string) => {
    const { found, syncedDeletedIpdNames } = executePermanentDelete(id);
    setConsultationToDelete(null);
    const ipdSuffix =
      syncedDeletedIpdNames.length > 0
        ? ` & synced removal to IPD ward (${syncedDeletedIpdNames.join(', ')})`
        : '';
    if (found) {
      showToast(
        `Deleted record for ${found.patientName} (${formatDisplayDate(
          found.date
        )}) from Master Register, Consultations & OT Notes${ipdSuffix}.`
      );
    } else {
      showToast(`Record removed from Master Register, Consultations, and OT Notes${ipdSuffix}.`);
    }
  };

  // Filter consultations by patient name, OPD number, or selected diagnosis from Analytics panel
  const filteredConsultations = useMemo(() => {
    const q = headerSearchQuery.trim().toLowerCase();
    const diagFilter = selectedDiagnosisFilter?.trim().toLowerCase() || '';
    if (!q && !diagFilter) return consultations;
    return consultations.filter((c) => {
      const matchesSearch =
        !q ||
        (c.patientName || '').toLowerCase().includes(q) ||
        (c.opdNo || '').toLowerCase().includes(q);
      const matchesDiag =
        !diagFilter || (c.diagnosis || '').toLowerCase().includes(diagFilter);
      return matchesSearch && matchesDiag;
    });
  }, [consultations, headerSearchQuery, selectedDiagnosisFilter]);

  // Quick stats, Year items, & Month items for Left Sidebar
  const distinctMonths = new Set(filteredConsultations.map((c) => getMonthInfo(c.date).monthKey)).size;
  const distinctDates = new Set(filteredConsultations.map((c) => c.date)).size;
  const totalOpdConsultationsCount = useMemo(
    () => consultations.filter((c) => hasOpdClinicalData(c) || !hasOtNotesData(c)).length,
    [consultations]
  );
  const totalOtCount = useMemo(
    () => consultations.filter((c) => hasOtNotesData(c)).length,
    [consultations]
  );

  const yearNavItems: YearNavItem[] = useMemo(() => {
    const yearCounts = new Map<string, number>();
    ['2026', '2025', '2024'].forEach((yr) => yearCounts.set(yr, 0));
    filteredConsultations.forEach((c) => {
      const { year } = getMonthInfo(c.date);
      const yKey = String(year);
      yearCounts.set(yKey, (yearCounts.get(yKey) || 0) + 1);
    });
    return Array.from(yearCounts.entries())
      .map(([yearKey, count]) => ({
        yearKey,
        yearLabel: yearKey,
        count,
      }))
      .sort((a, b) => b.yearKey.localeCompare(a.yearKey));
  }, [filteredConsultations]);

  const monthNavItems: MonthNavItem[] = useMemo(() => {
    const grouped = groupConsultationsByMonthAndDate(filteredConsultations);
    if (selectedYearKey === 'ALL') {
      return grouped.map((m) => ({
        monthKey: m.monthKey,
        monthLabel: m.monthLabel,
        shortLabel: m.monthLabel,
        yearKey: String(m.year),
        count: m.totalConsultations,
      }));
    }

    const yearNum = parseInt(selectedYearKey, 10) || new Date().getFullYear();
    const countMap = new Map<string, number>();
    grouped.forEach((m) => {
      countMap.set(m.monthKey, m.totalConsultations);
    });

    const items: MonthNavItem[] = [];
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
      items.push({
        monthKey: mKey,
        monthLabel,
        shortLabel,
        yearKey: String(yearNum),
        count: countMap.get(mKey) || 0,
      });
    }
    return items;
  }, [filteredConsultations, selectedYearKey]);

  const handleSelectYear = (yearKey: string) => {
    setSelectedYearKey(yearKey);
    setSelectedMonthKey('ALL');
  };

  const handleDoctorAuthenticated = (doctor: DoctorAccount) => {
    setRuntimeActiveDoctor(doctor);
    setCurrentDoctor(doctor);
    setAuthViewMode(null);
    const doctorConsultations = loadConsultationsForDoctor(doctor);
    setConsultations(doctorConsultations);
    setHeaderSearchQuery('');
    setSelectedDiagnosisFilter(null);
    setSelectedYearKey('ALL');
    setSelectedMonthKey('ALL');
    setActiveWorkspaceView('desk');
    setFocusedDate(null);
    setConsultationToPrint(null);
    setConsultationToEdit(null);
    setConsultationForInvestigation(null);
    const cfg = getDoctorLocalStorageConfig(doctor);
    setLocalStorageConfig(cfg);
    if (!cfg.promptCompleted) {
      setIsFirstLoginStoragePrompt(true);
      setIsLocalStorageModalOpen(true);
    }
    recordFieldUsage('doctorName', doctor.fullName);
    showToast(`Signed in as ${doctor.fullName} (${doctor.speciality})`);
  };

  const handleLogoutDoctor = () => {
    setRuntimeActiveDoctor(null);
    setCurrentDoctor(null);
    setConsultations([]);
    setIpdPatients([]);
    setPendingIpdSyncCount(0);
    setActiveSection('opd');
    setHeaderSearchQuery('');
    setSelectedDiagnosisFilter(null);
    setConsultationToPrint(null);
    setConsultationToEdit(null);
    setConsultationForInvestigation(null);
    setAuthViewMode('login');
  };

  // Show Doctor Login / Registration page when not signed in or when explicitly requested
  if (!currentDoctor || authViewMode !== null) {
    return (
      <DoctorAuthPage
        initialMode={authViewMode || 'login'}
        onAuthenticated={handleDoctorAuthenticated}
        onCancel={currentDoctor ? () => setAuthViewMode(null) : undefined}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#2D2A3E] flex font-sans">
      {/* Left-Hand Margin Sidebar for OPD App Controls & Buttons (shown in OPD Section) */}
      {activeSection === 'opd' && (
        <Sidebar
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
          isMobileOpen={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
          currentDoctor={currentDoctor}
          onOpenDoctorProfile={() => setIsDoctorProfileOpen(true)}
          onOpenManualEntry={() => {
            setConsultationToEdit(null);
            setDefaultDateForNew(undefined);
            setFormInitialTab('patient');
            setIsFormOpen(true);
          }}
          onOpenNewOtEntry={() => {
            setConsultationToEdit(null);
            setDefaultDateForNew(undefined);
            setFormInitialTab('ot');
            setIsFormOpen(true);
          }}
          otCount={totalOtCount}
          isAnalyticsOpen={isAnalyticsOpen}
          onToggleAnalytics={() => setIsAnalyticsOpen((prev) => !prev)}
          onOpenDictionary={() => setIsDictionaryOpen(true)}
          onOpenMedicineMaster={() => setIsMedicineMasterOpen(true)}
          onExportExcel={() => exportOpdToExcel(filteredConsultations)}
          onOpenAuthPage={(mode) => setAuthViewMode(mode)}
          onLogoutDoctor={handleLogoutDoctor}
          yearItems={yearNavItems}
          selectedYearKey={selectedYearKey}
          onSelectYearKey={handleSelectYear}
          monthItems={monthNavItems}
          selectedMonthKey={selectedMonthKey}
          onSelectMonthKey={setSelectedMonthKey}
          totalConsultationsCount={totalOpdConsultationsCount}
          isPatientListOpen={isPatientListOpen}
          onTogglePatientList={(open) =>
            setIsPatientListOpen((prev) => (open !== undefined ? open : !prev))
          }
          activeWorkspaceView={activeWorkspaceView}
          onChangeWorkspaceView={setActiveWorkspaceView}
        />
      )}

      {/* Right Main Content Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar with OPD Section / IPD Section Switcher */}
        <Header
          activeSection={activeSection}
          onChangeSection={setActiveSection}
          admittedIpdCount={admittedIpdCount}
          consultations={filteredConsultations}
          totalConsultationsCount={totalOpdConsultationsCount}
          monthsCount={distinctMonths}
          datesCount={distinctDates}
          searchQuery={headerSearchQuery}
          onSearchChange={setHeaderSearchQuery}
          currentDoctor={currentDoctor}
          onOpenDoctorProfile={() => setIsDoctorProfileOpen(true)}
          onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
          onOpenManualEntry={() => {
            setConsultationToEdit(null);
            setDefaultDateForNew(undefined);
            setFormInitialTab('patient');
            setIsFormOpen(true);
          }}
          onOpenNewOtEntry={() => {
            setConsultationToEdit(null);
            setDefaultDateForNew(undefined);
            setFormInitialTab('ot');
            setIsFormOpen(true);
          }}
          isPatientListOpen={isPatientListOpen}
          onTogglePatientList={(open) =>
            setIsPatientListOpen((prev) => (open !== undefined ? open : !prev))
          }
          activeWorkspaceView={activeWorkspaceView}
          onChangeWorkspaceView={setActiveWorkspaceView}
        />

        {/* Toggleable Analytics Panel at the Top (OPD only, hidden by default) */}
        {activeSection === 'opd' && isAnalyticsOpen && (
          <AnalyticsPanel
            consultations={consultations}
            isOpen={isAnalyticsOpen}
            onToggle={() => setIsAnalyticsOpen((prev) => !prev)}
            selectedDiagnosisFilter={selectedDiagnosisFilter}
            onSelectDiagnosisFilter={(diag) => {
              setSelectedDiagnosisFilter(diag);
              if (diag && activeWorkspaceView === 'desk') {
                setActiveWorkspaceView('consultations');
              }
            }}
          />
        )}

        {/* Toast Notification */}
        {toastMessage && (
          <div className="fixed bottom-5 right-5 z-50 bg-[#FDFBF9] text-[#2D2A3E] px-4 py-3 rounded-xl shadow-xl border-2 border-[#A9CFF7] flex items-center gap-3 text-xs animate-in slide-in-from-bottom-3 duration-200">
            <CheckCircle2 className="w-4 h-4 text-[#059669] shrink-0" />
            <span className="font-semibold">{toastMessage}</span>
            {activeSection === 'opd' && activeWorkspaceView === 'desk' && (
              <button
                type="button"
                onClick={() => setActiveWorkspaceView('consultations')}
                className="ml-2 px-2.5 py-1 rounded-lg bg-[#E0F2FE] hover:bg-[#BAE6FD] text-sky-950 border border-[#7DD3FC] font-bold text-[11px] transition-colors cursor-pointer whitespace-nowrap"
              >
                Open Consultations
              </button>
            )}
            <button
              onClick={() => setToastMessage(null)}
              className="text-[#6B647B] hover:text-[#2D2A3E] ml-1 text-xs"
            >
              &times;
            </button>
          </div>
        )}

        {/* Workspace Main Content: IPD Section OR OPD Section */}
        <main className="flex-1">
          {activeSection === 'ipd' ? (
            <IpdWorkspace
              patients={ipdPatients}
              consultations={consultations}
              doctor={currentDoctor}
              isOnline={isOnline}
              pendingSyncCount={pendingIpdSyncCount}
              isSyncing={isIpdSyncing}
              onForceSync={() => {
                flushIpdSyncQueue(ipdPatientsRef.current).then(() => {
                  showToast('IPD records saved to local backup');
                });
              }}
              onUpsertPatient={handleUpsertIpdPatient}
              onDeletePatient={handleDeleteIpdPatient}
              onOpenMedicineMaster={() => setIsMedicineMasterOpen(true)}
              onOpenOtPrintPreview={(otConsultation, mode) => {
                setPrintModalMode(mode);
                setPrintModalDocType('ot');
                setConsultationToPrint(otConsultation);
              }}
              onToast={showToast}
              focusedPatientId={focusedIpdPatientId}
              focusedChartTab={focusedIpdChartTab}
              pendingAdmitSeedConsultation={pendingAdmitSeedConsultation}
              onClearNavigationIntent={() => {
                setFocusedIpdPatientId(null);
                setFocusedIpdChartTab(null);
                setPendingAdmitSeedConsultation(null);
              }}
              customProtocols={customSurgicalProtocols}
              deletedProtocolIds={deletedProtocolIds}
              onSaveCustomProtocol={handleSaveCustomSurgicalProtocol}
              onDeleteCustomProtocol={handleDeleteCustomSurgicalProtocol}
              onRestoreBuiltinProtocols={handleRestoreBuiltinProtocols}
            />
          ) : activeWorkspaceView === 'desk' ? (
            <ClinicalCommandCenter
              currentDoctor={currentDoctor}
              totalConsultationsCount={totalOpdConsultationsCount}
              otCount={totalOtCount}
              monthsCount={distinctMonths}
              datesCount={distinctDates}
              yearItems={yearNavItems}
              monthItems={monthNavItems}
              onOpenManualEntry={(dateStr) => {
                setConsultationToEdit(null);
                setDefaultDateForNew(dateStr);
                setFormInitialTab('patient');
                setIsFormOpen(true);
              }}
              onOpenNewOtEntry={(dateStr) => {
                setConsultationToEdit(null);
                setDefaultDateForNew(dateStr);
                setFormInitialTab('ot');
                setIsFormOpen(true);
              }}
              onOpenConsultationsList={() => {
                setActiveWorkspaceView('consultations');
              }}
              onOpenOtList={() => {
                setActiveWorkspaceView('ot');
              }}
              onOpenPatientRegister={(options) => {
                if (options?.yearKey !== undefined) {
                  setSelectedYearKey(options.yearKey);
                }
                if (options?.monthKey !== undefined) {
                  setSelectedMonthKey(options.monthKey);
                }
                if (options?.searchQuery !== undefined) {
                  setHeaderSearchQuery(options.searchQuery);
                }
                setActiveWorkspaceView('register');
              }}
              onToggleAnalytics={() => setIsAnalyticsOpen((prev) => !prev)}
              isAnalyticsOpen={isAnalyticsOpen}
              onOpenDictionary={() => setIsDictionaryOpen(true)}
              onExportExcel={() => exportOpdToExcel(filteredConsultations)}
              onOpenDoctorProfile={() => setIsDoctorProfileOpen(true)}
            />
          ) : activeWorkspaceView === 'consultations' ? (
            <ConsultationsQuickListView
              consultations={filteredConsultations}
              allConsultations={consultations}
              ipdPatients={ipdPatients}
              selectedYearKey={selectedYearKey}
              onSelectYearKey={handleSelectYear}
              selectedMonthKey={selectedMonthKey}
              onSelectMonthKey={setSelectedMonthKey}
              onOpenNotes={(c, mode = 'single', docType = 'opd') => {
                setPrintModalMode(mode);
                setPrintModalDocType(docType);
                setConsultationToPrint(c);
              }}
              onEditConsultation={(c, tab = 'patient') => {
                setConsultationToEdit(c);
                setFormInitialTab(tab);
                setIsFormOpen(true);
              }}
              onDeleteConsultation={handleDeleteConsultation}
              onAdmitPatient={(c) => {
                const existingAdmitted = findMatchingAdmittedIpdPatient(c, ipdPatientsRef.current);
                if (existingAdmitted) {
                  setFocusedIpdPatientId(existingAdmitted.id);
                  setFocusedIpdChartTab('admission');
                  setActiveSection('ipd');
                  showToast(`${existingAdmitted.patientName} is already admitted — opened IPD chart`);
                } else {
                  setPendingAdmitSeedConsultation(c);
                  setActiveSection('ipd');
                }
              }}
              onOpenIpdChart={(ipdPatient) => {
                setFocusedIpdPatientId(ipdPatient.id);
                setFocusedIpdChartTab('admission');
                setActiveSection('ipd');
              }}
              onPrintDischargeSummary={(ipdPatient) => {
                setIpdPatientForDischargePrint(ipdPatient);
              }}
              onExportDischargePdf={(ipdPatient) => {
                exportIpdDischargeSummaryPdf(ipdPatient, currentDoctor);
                showToast(`Exported Discharge Summary PDF for ${ipdPatient.patientName}`);
              }}
              onOpenDetailedRegister={() => setActiveWorkspaceView('register')}
              onBackToDesk={() => setActiveWorkspaceView('desk')}
              onAddNewConsultation={() => {
                setConsultationToEdit(null);
                setDefaultDateForNew(undefined);
                setFormInitialTab('patient');
                setIsFormOpen(true);
              }}
            />
          ) : activeWorkspaceView === 'ot' ? (
            <OtNotesQuickListView
              consultations={filteredConsultations}
              allConsultations={consultations}
              selectedYearKey={selectedYearKey}
              onSelectYearKey={handleSelectYear}
              selectedMonthKey={selectedMonthKey}
              onSelectMonthKey={setSelectedMonthKey}
              onOpenOtNotesPreview={(c, mode = 'single') => {
                setPrintModalMode(mode);
                setPrintModalDocType('ot');
                setConsultationToPrint(c);
              }}
              onEditOtNotes={(c) => {
                if (!hasOtNotesData(c)) {
                  const todayIso = new Date().toISOString().split('T')[0];
                  setConsultationToEdit({
                    id: '',
                    date: todayIso,
                    salutation: c.salutation,
                    patientName: c.patientName,
                    age: c.age,
                    gender: c.gender,
                    opdNo: c.opdNo,
                    phoneNumber: c.phoneNumber,
                    contactNumber: c.contactNumber || c.phoneNumber,
                    city: c.city,
                    address: c.address,
                    vitals: {},
                    historyChecklist: {},
                    ipss: {},
                    complaints: '',
                    diagnosis: '',
                    prescriptions: [],
                    createdAt: Date.now(),
                  });
                } else {
                  setConsultationToEdit(c);
                }
                setFormInitialTab('ot');
                setIsFormOpen(true);
              }}
              onDeleteConsultation={handleDeleteConsultation}
              onAddNewOtPatient={() => {
                setConsultationToEdit(null);
                setDefaultDateForNew(undefined);
                setFormInitialTab('ot');
                setIsFormOpen(true);
              }}
              onOpenConsultationsList={() => setActiveWorkspaceView('consultations')}
              onOpenDetailedRegister={() => setActiveWorkspaceView('register')}
              onBackToDesk={() => setActiveWorkspaceView('desk')}
            />
          ) : (
            <ExcelWorkbookView
              consultations={filteredConsultations}
              allConsultations={consultations}
              ipdPatients={ipdPatients}
              focusedDate={focusedDate}
              selectedYearKey={selectedYearKey}
              onSelectYearKey={handleSelectYear}
              selectedMonthKey={selectedMonthKey}
              onSelectMonthKey={setSelectedMonthKey}
              onHidePatientList={() => setActiveWorkspaceView('desk')}
              onEditConsultation={(c) => {
                setConsultationToEdit(c);
                setFormInitialTab('patient');
                setIsFormOpen(true);
              }}
              onDeleteConsultation={handleDeleteConsultation}
              onPrintConsultation={(c) => {
                setPrintModalMode('single');
                setPrintModalDocType(!hasOpdClinicalData(c) && hasOtNotesData(c) ? 'ot' : 'opd');
                setConsultationToPrint(c);
              }}
              onConsolidatedHistory={(c) => {
                setPrintModalMode('consolidated');
                setPrintModalDocType('opd');
                setConsultationToPrint(c);
              }}
              onAddInvestigation={(c) => {
                setConsultationForInvestigation(c);
              }}
              onAddOtNotes={(c) => {
                if (!hasOtNotesData(c)) {
                  const todayIso = new Date().toISOString().split('T')[0];
                  setConsultationToEdit({
                    id: '',
                    date: todayIso,
                    salutation: c.salutation,
                    patientName: c.patientName,
                    age: c.age,
                    gender: c.gender,
                    opdNo: c.opdNo,
                    phoneNumber: c.phoneNumber,
                    contactNumber: c.contactNumber || c.phoneNumber,
                    city: c.city,
                    address: c.address,
                    vitals: {},
                    historyChecklist: {},
                    ipss: {},
                    complaints: '',
                    diagnosis: '',
                    prescriptions: [],
                    createdAt: Date.now(),
                  });
                } else {
                  setConsultationToEdit(c);
                }
                setFormInitialTab('ot');
                setIsFormOpen(true);
              }}
              onAdmitPatient={(c) => {
                const existingAdmitted = findMatchingAdmittedIpdPatient(c, ipdPatientsRef.current);
                if (existingAdmitted) {
                  setFocusedIpdPatientId(existingAdmitted.id);
                  setFocusedIpdChartTab('admission');
                  setActiveSection('ipd');
                  showToast(`${existingAdmitted.patientName} is already admitted — opened IPD chart`);
                } else {
                  setPendingAdmitSeedConsultation(c);
                  setActiveSection('ipd');
                }
              }}
              onOpenIpdChart={(ipdPatient) => {
                setFocusedIpdPatientId(ipdPatient.id);
                setFocusedIpdChartTab('admission');
                setActiveSection('ipd');
              }}
              onPrintDischargeSummary={(ipdPatient) => {
                setIpdPatientForDischargePrint(ipdPatient);
              }}
              onExportDischargePdf={(ipdPatient) => {
                exportIpdDischargeSummaryPdf(ipdPatient, currentDoctor);
                showToast(`Exported Discharge Summary PDF for ${ipdPatient.patientName}`);
              }}
              onViewPatientTimeline={(pName) => {
                setSelectedPatientForTimeline(pName);
                setIsTimelineOpen(true);
              }}
              onAddNewForDate={(dateStr) => {
                setConsultationToEdit(null);
                setDefaultDateForNew(dateStr);
                setFormInitialTab('patient');
                setIsFormOpen(true);
              }}
            />
          )}
        </main>

        {/* Subtle Clinical Footer */}
        <footer className="bg-[#FDFBF9] border-t border-[#E8E2DC] py-3.5 text-center text-xs text-[#6B647B]">
          <p>
            MedScribe OPD &bull; Clinical Consultation Desk &amp; Multi-Sheet Patient Register
          </p>
        </footer>
      </div>

      {/* Modals */}
      <PatientTimelineModal
        isOpen={isTimelineOpen}
        onClose={() => setIsTimelineOpen(false)}
        patientName={selectedPatientForTimeline}
        consultations={consultations}
        ipdPatients={ipdPatients}
        onEditConsultation={(c) => {
          setConsultationToEdit(c);
          setFormInitialTab('patient');
          setIsFormOpen(true);
        }}
        onDeleteConsultation={handleDeleteConsultation}
        onOpenIpdChart={(ipdPatient) => {
          setFocusedIpdPatientId(ipdPatient.id);
          setFocusedIpdChartTab('admission');
          setActiveSection('ipd');
        }}
        onPrintDischargeSummary={(ipdPatient) => {
          setIpdPatientForDischargePrint(ipdPatient);
        }}
      />

      <ConsultationFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        consultationToEdit={consultationToEdit}
        defaultDate={defaultDateForNew}
        initialTab={formInitialTab}
        existingConsultations={consultations}
        onSave={handleSaveConsultation}
        onDelete={handleDeleteConsultation}
        doctorUid={currentDoctor?.uid}
        currentDoctor={currentDoctor}
        onOpenMedicineMaster={() => setIsMedicineMasterOpen(true)}
      />

      <MedicalDictionaryModal
        isOpen={isDictionaryOpen}
        onClose={() => setIsDictionaryOpen(false)}
      />

      <MedicineMasterModal
        isOpen={isMedicineMasterOpen}
        onClose={() => setIsMedicineMasterOpen(false)}
        doctorUid={currentDoctor?.uid}
        consultations={consultations}
        onToast={showToast}
      />

      {/* Delete Consultation Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={!!consultationToDelete}
        onClose={() => setConsultationToDelete(null)}
        consultation={consultationToDelete}
        onConfirmDelete={handleConfirmDelete}
      />

      {/* A4 Hospital Case Sheet Print Preview Modal */}
      <A4PrintModal
        isOpen={!!consultationToPrint}
        onClose={() => setConsultationToPrint(null)}
        consultation={consultationToPrint}
        allConsultations={consultations}
        ipdPatients={ipdPatients}
        initialMode={printModalMode}
        initialDocType={printModalDocType}
        currentDoctor={currentDoctor}
        onEditConsultation={(c) => {
          setConsultationToEdit(c);
          setFormInitialTab(printModalDocType === 'ot' ? 'ot' : 'patient');
          setIsFormOpen(true);
        }}
      />

      {/* Global Printable IPD Discharge Summary Modal (accessible from Master Register, Quick List & Timeline) */}
      {ipdPatientForDischargePrint && (
        <IpdDischargeSummaryModal
          isOpen={!!ipdPatientForDischargePrint}
          onClose={() => setIpdPatientForDischargePrint(null)}
          patient={ipdPatientForDischargePrint}
          doctor={currentDoctor}
          initialView="review"
          onSaveDischargeSummary={(summary: IpdDischargeSummary, markDischarged: boolean) => {
            const updated: IpdPatientRecord = {
              ...ipdPatientForDischargePrint,
              dischargeSummary: summary,
              status: markDischarged ? 'discharged' : ipdPatientForDischargePrint.status,
              dischargeDate: markDischarged
                ? summary.dischargeDate || new Date().toISOString().split('T')[0]
                : ipdPatientForDischargePrint.dischargeDate || summary.dischargeDate,
              updatedAt: Date.now(),
            };
            handleUpsertIpdPatient(updated);
            setIpdPatientForDischargePrint(updated);
            showToast(
              markDischarged
                ? `Discharge Summary saved & ${updated.patientName} marked discharged (${formatDisplayDate(updated.dischargeDate || '')})`
                : `Discharge Summary saved for ${updated.patientName}`
            );
          }}
          onOpenMedicineMaster={() => setIsMedicineMasterOpen(true)}
        />
      )}

      {/* Manual Investigation Entry Modal (triggered from patient row or Lab Tests & Imaging cell) */}
      {consultationForInvestigation && (
        <ManualInvestigationModal
          isOpen={!!consultationForInvestigation}
          onClose={() => setConsultationForInvestigation(null)}
          consultation={consultationForInvestigation}
          allConsultations={consultations}
          onApplyInvestigations={(updatedFields) => {
            const updatedConsultation: Consultation = {
              ...consultationForInvestigation,
              labTestsAndImaging: updatedFields.labTestsAndImaging,
              investigationRecords: updatedFields.investigationRecords,
              updatedAt: Date.now(),
            };
            handleSaveConsultation(updatedConsultation);
            setConsultationForInvestigation(null);
            showToast(
              `Updated investigations & date-wise table for ${updatedConsultation.patientName}`
            );
          }}
        />
      )}

      {/* Doctor Profile & Edit Credentials Modal */}
      <DoctorProfileModal
        isOpen={isDoctorProfileOpen}
        onClose={() => setIsDoctorProfileOpen(false)}
        doctor={currentDoctor}
        localStorageConfig={localStorageConfig}
        consultationsCount={consultations.length}
        onOpenLocalStorageSetup={() => {
          setIsFirstLoginStoragePrompt(false);
          setIsLocalStorageModalOpen(true);
        }}
        onSyncLocalComputerNow={async () => {
          if (!currentDoctor) return;
          const res = await syncDoctorDataToLocalFileSystem(currentDoctor, consultations, {
            forceDownload: true,
          });
          setLocalStorageConfig(res.updatedConfig);
          showToast(
            `Saved ${res.fileNames.join(' & ')} (${consultations.length} records) to ${res.updatedConfig.folderPathDisplay}`
          );
        }}
        onImportFromLocalComputerFile={async (file) => {
          if (!currentDoctor) return;
          try {
            const imported = await importConsultationsFromLocalJsonFile(file, currentDoctor);
            setConsultations((prev) => {
              const map = new Map<string, Consultation>();
              prev.forEach((c) => map.set(c.id, c));
              imported.forEach((c) => map.set(c.id, sanitizeConsultationShorthand(c)));
              return Array.from(map.values()).sort((a, b) =>
                (b.date || '').localeCompare(a.date || '')
              );
            });
            showToast(
              `Restored ${imported.length} consultation record${
                imported.length === 1 ? '' : 's'
              } from computer file "${file.name}"`
            );
          } catch (err: any) {
            showToast(err?.message || 'Failed to load computer backup file.');
          }
        }}
        onUpdateDoctor={(updatedDoc) => {
          setRuntimeActiveDoctor(updatedDoc);
          setCurrentDoctor(updatedDoc);
          recordFieldUsage('doctorName', updatedDoc.fullName);
          showToast(`Updated profile for ${updatedDoc.fullName} (${updatedDoc.registrationNo})`);
        }}
        onDownloadExcelBackup={() => {
          exportOpdToExcel(consultations);
          showToast(`Downloaded Excel backup (${consultations.length} records)`);
        }}
        onDownloadJsonBackup={async () => {
          if (!currentDoctor) return;
          const res = await syncDoctorDataToLocalFileSystem(currentDoctor, consultations, {
            forceDownload: true,
          });
          setLocalStorageConfig(res.updatedConfig);
          showToast(`Downloaded full backup (${res.fileNames.join(' & ')})`);
        }}
        onDeleteDoctorAccount={async () => {
          if (!currentDoctor) return;
          const deletedDocName = currentDoctor.fullName;
          const doctorUid = currentDoctor.uid;

          // 1. Remove doctor's isolated consultations, IPD records & local file system config from browser storage
          try {
            localStorage.removeItem(getDoctorConsultationsStorageKey(doctorUid));
            localStorage.removeItem(getDoctorDeletedIdsStorageKey(doctorUid));
            clearAllLocalIpdStorageForDoctor(doctorUid);
            const safeUid = (doctorUid || 'anonymous').replace(/[^a-zA-Z0-9_-]/g, '_');
            localStorage.removeItem(`medscribe_local_fs_config_v1_${safeUid}`);
            localStorage.removeItem(`medscribe_medicine_master_v1_${safeUid}`);
          } catch (e) {
            console.error('Failed to clear local storage keys for deleted doctor:', e);
          }

          // 2. Remove doctor profile from local registered doctors directory
          deleteRegisteredDoctorProfile(doctorUid);

          // 3. Reset app state and return to login/registration page
          setRuntimeActiveDoctor(null);
          setIsDoctorProfileOpen(false);
          setCurrentDoctor(null);
          setConsultations([]);
          setIpdPatients([]);
          setPendingIpdSyncCount(0);
          setActiveSection('opd');
          setHeaderSearchQuery('');
          setSelectedDiagnosisFilter(null);
          setConsultationToPrint(null);
          setConsultationToEdit(null);
          setConsultationForInvestigation(null);
          setAuthViewMode('login');
          showToast(`Deleted doctor profile and all local records for ${deletedDocName}`);
        }}
      />

      {/* Local Computer File System Storage Setup & 1st-Login Prompt Modal */}
      <LocalStorageSetupModal
        isOpen={isLocalStorageModalOpen}
        isFirstLogin={isFirstLoginStoragePrompt}
        doctor={currentDoctor}
        consultations={consultations}
        onClose={() => {
          setIsLocalStorageModalOpen(false);
          setIsFirstLoginStoragePrompt(false);
          if (currentDoctor) {
            setLocalStorageConfig(getDoctorLocalStorageConfig(currentDoctor));
          }
        }}
        onConfigUpdated={(updatedCfg, message) => {
          setLocalStorageConfig(updatedCfg);
          setIsLocalStorageModalOpen(false);
          setIsFirstLoginStoragePrompt(false);
          if (message) {
            showToast(message);
          }
        }}
        onImportConsultations={(restoredList) => {
          if (!currentDoctor) return;
          setConsultations((prev) => {
            const map = new Map<string, Consultation>();
            prev.forEach((c) => map.set(c.id, c));
            restoredList.forEach((c) => map.set(c.id, sanitizeConsultationShorthand(c)));
            return Array.from(map.values()).sort((a, b) =>
              (b.date || '').localeCompare(a.date || '')
            );
          });
        }}
      />
    </div>
  );
}
