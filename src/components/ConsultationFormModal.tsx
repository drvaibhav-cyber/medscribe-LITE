import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Check,
  Plus,
  Trash2,
  User,
  HeartPulse,
  Pill,
  ClipboardList,
  Activity,
  UserCheck,
  FlaskConical,
  AlertCircle,
  Scissors,
  Building2,
  LayoutGrid,
  RotateCcw,
  FileText,
  Phone,
  Calendar,
  Printer,
  Upload,
  Image as ImageIcon,
} from 'lucide-react';
import { Consultation, OtNotes, PrescriptionItem } from '../types/opd';
import { DoctorAccount } from '../types/doctor';
import {
  createEmptyOtNotes,
  getConsultationOtProcedures,
  hasOpdClinicalData,
  hasOtNotesData,
  normalizeOtNotes,
  UROLOGY_OT_TEMPLATES,
} from '../utils/otNotesUtils';
import { getMonthInfo } from '../utils/excelExporter';
import { FieldSuggestionsBar, MedicinePresetsBar, GlobalFieldDatalists } from './FieldSuggestionsBar';
import { findMedicinePreset } from '../utils/fieldSuggestions';
import {
  applyMedicationGroupToPrescriptions,
  findMasterMedicationByName,
  MedicationGroup,
  MedicineMasterStore,
} from '../utils/medicineMaster';
import { ManualInvestigationModal } from './ManualInvestigationModal';
import { A4PrintModal } from './A4PrintModal';
import { DateWiseInvestigationTable } from './DateWiseInvestigationTable';
import { MedScribeLogo } from './MedScribeLogo';
import {
  buildDateWiseInvestigationTable,
  cleanChiefComplaintsText,
  cleanExplicitOpdNo,
  deduplicateClinicalText,
  deduplicatePlanAndAdviceFields,
  formatInvestigationItemsToText,
  getInvestigationItemsForConsultation,
  hasIpssData,
  parseLabTestsAndImagingToItems,
  sanitizeLabTestsAndImagingText,
  sanitizeSalutationAndPatientName,
} from '../utils/investigationUtils';

type FormSectionTab = 'all' | 'patient' | 'vitals' | 'history' | 'exams' | 'rx' | 'plan' | 'ot';

interface ConsultationFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  consultationToEdit?: Consultation | null;
  defaultDate?: string;
  initialTab?: 'patient' | 'vitals' | 'history' | 'exams' | 'rx' | 'plan' | 'ot';
  existingConsultations?: Consultation[];
  onSave: (consultation: Consultation) => void;
  onDelete?: (id: string) => void;
  doctorUid?: string | null;
  currentDoctor?: DoctorAccount | null;
  onOpenMedicineMaster?: () => void;
}

export const ConsultationFormModal: React.FC<ConsultationFormModalProps> = ({
  isOpen,
  onClose,
  consultationToEdit,
  defaultDate,
  initialTab = 'patient',
  existingConsultations = [],
  onSave,
  onDelete,
  doctorUid,
  currentDoctor,
  onOpenMedicineMaster,
}) => {
  // Separate form mode: 'ot' opens the dedicated standalone OT Notes Form; otherwise opens the OPD Consultation Form (without OT Notes)
  const [isOtFormMode, setIsOtFormMode] = useState<boolean>(initialTab === 'ot');
  const [activeTab, setActiveTab] = useState<FormSectionTab>(
    initialTab === 'ot' ? 'ot' : 'all'
  );
  const [isInvestigationModalOpen, setIsInvestigationModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [showWrittenLabsEditor, setShowWrittenLabsEditor] = useState(false);
  const [otProceduresList, setOtProceduresList] = useState<OtNotes[]>([createEmptyOtNotes()]);
  const [activeOtProcIndex, setActiveOtProcIndex] = useState<number>(0);
  const [showManualIpssTable, setShowManualIpssTable] = useState<boolean>(false);
  const [otDiagramStatusMsg, setOtDiagramStatusMsg] = useState<string | null>(null);
  const [formValidationError, setFormValidationError] = useState<string | null>(null);
  const otDiagramFileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<Partial<Consultation>>({
    date: defaultDate || new Date().toISOString().split('T')[0],
    opdNo: '',
    time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    salutation: 'Mr.',
    patientName: '',
    phoneNumber: '',
    gender: 'M',
    age: '',
    dob: '',
    preferredLanguage: 'English',
    city: '',
    address: '',
    pin: '',
    vitals: {},
    complaints: '',
    historyChecklist: {
      burning: 'No',
      fever: 'No',
      hematuria: 'No',
      previousRenalCalculi: 'No',
      previousSurgery: 'No',
      constipation: 'No',
    },
    ipss: {},
    systemicExamination: '',
    genitalExamination: '',
    perRectalExam: '',
    pastMedication: '',
    additionalHistory: '',
    labTestsAndImaging: '',
    diagnosis: '',
    testsRequested: '',
    testsRequestedByWhen: '',
    prescriptions: [
      { medicine: '', dosage: '', when: 'After food (p/c)', frequency: '1-0-1 (BD)', duration: '', notes: '' },
    ],
    dietAndExercise: '',
    admissionAdvice: 'No',
    assessmentPlan: '',
    advice: '',
    nextVisit: '',
    referredTo: { doctorName: '', speciality: '', phoneNo: '', email: '' },
    otNotes: createEmptyOtNotes(),
    doctorName: currentDoctor?.fullName || '',
    department: currentDoctor?.department || '',
  });

  useEffect(() => {
    if (isOpen) {
      const openAsOt =
        initialTab === 'ot' ||
        Boolean(
          consultationToEdit &&
            hasOtNotesData(consultationToEdit) &&
            !hasOpdClinicalData(consultationToEdit)
        );
      setIsOtFormMode(openAsOt);
      setActiveTab(openAsOt ? 'ot' : initialTab === 'patient' ? 'all' : initialTab);
      setShowManualIpssTable(false);
      setFormValidationError(null);
    }
  }, [isOpen, initialTab, consultationToEdit]);

  useEffect(() => {
    if (consultationToEdit) {
      const sanitizedLabs = sanitizeLabTestsAndImagingText(
        consultationToEdit.labTestsAndImaging,
        consultationToEdit.pastMedication
      );
      const dedupedPlan = deduplicatePlanAndAdviceFields(
        consultationToEdit.assessmentPlan,
        consultationToEdit.advice,
        consultationToEdit.nextVisit || consultationToEdit.followUpDate
      );
      const dedupedComplaints = cleanChiefComplaintsText(
        consultationToEdit.complaints || consultationToEdit.chiefComplaints
      );
      const { salutation: cleanSal, patientName: cleanPtName } =
        sanitizeSalutationAndPatientName(
          consultationToEdit.salutation,
          consultationToEdit.patientName
        );
      const existingProcs = getConsultationOtProcedures(consultationToEdit);
      const initialProcs =
        existingProcs.length > 0
          ? existingProcs
          : [normalizeOtNotes(consultationToEdit.otNotes, consultationToEdit.date)];
      const latestIdx = initialProcs.length - 1;
      setOtProceduresList(initialProcs);
      setActiveOtProcIndex(latestIdx);

      setFormData({
        ...consultationToEdit,
        date: consultationToEdit.date || defaultDate || new Date().toISOString().split('T')[0],
        opdNo: cleanExplicitOpdNo(consultationToEdit.opdNo) || '',
        time: consultationToEdit.time || '',
        salutation: (cleanSal || consultationToEdit.salutation || 'Mr.') as any,
        patientName: cleanPtName || consultationToEdit.patientName || '',
        phoneNumber: consultationToEdit.phoneNumber || consultationToEdit.contactNumber || '',
        gender: (consultationToEdit.gender || 'M') as any,
        age: consultationToEdit.age || '',
        dob: consultationToEdit.dob || '',
        preferredLanguage: consultationToEdit.preferredLanguage || 'English',
        city: consultationToEdit.city || '',
        address: consultationToEdit.address || consultationToEdit.addressOrCity || '',
        pin: consultationToEdit.pin || '',
        complaints: dedupedComplaints || '',
        chiefComplaints: dedupedComplaints || '',
        systemicExamination: consultationToEdit.systemicExamination || consultationToEdit.examinationNotes || '',
        genitalExamination: consultationToEdit.genitalExamination || '',
        perRectalExam: consultationToEdit.perRectalExam || '',
        labTestsAndImaging: sanitizedLabs.labTestsAndImaging || '',
        pastMedication: sanitizedLabs.pastMedication || '',
        diagnosis: consultationToEdit.diagnosis || '',
        testsRequested: consultationToEdit.testsRequested || consultationToEdit.investigationsAdvised || '',
        testsRequestedByWhen: consultationToEdit.testsRequestedByWhen || '',
        dietAndExercise: consultationToEdit.dietAndExercise || '',
        admissionAdvice: consultationToEdit.admissionAdvice || 'No',
        assessmentPlan: dedupedPlan.assessmentPlan || '',
        advice: dedupedPlan.advice || '',
        nextVisit: dedupedPlan.nextVisit || '',
        doctorName: consultationToEdit.doctorName || currentDoctor?.fullName || '',
        historyChecklist: consultationToEdit.historyChecklist || {},
        ipss: consultationToEdit.ipss || {},
        vitals: consultationToEdit.vitals || {},
        referredTo: consultationToEdit.referredTo || {},
        prescriptions: consultationToEdit.prescriptions || [],
        otNotes: initialProcs[latestIdx],
        otProcedures: existingProcs,
      });
    } else {
      const freshOt = createEmptyOtNotes(defaultDate || new Date().toISOString().split('T')[0]);
      setOtProceduresList([freshOt]);
      setActiveOtProcIndex(0);
      setFormData({
        date: defaultDate || new Date().toISOString().split('T')[0],
        opdNo: '',
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        salutation: 'Mr.',
        patientName: '',
        phoneNumber: '',
        gender: 'M',
        age: '',
        dob: '',
        preferredLanguage: 'English',
        city: '',
        address: '',
        pin: '',
        vitals: {},
        complaints: '',
        historyChecklist: {
          burning: 'No',
          fever: 'No',
          hematuria: 'No',
          previousRenalCalculi: 'No',
          previousSurgery: 'No',
          constipation: 'No',
        },
        ipss: {},
        systemicExamination: '',
        genitalExamination: '',
        perRectalExam: '',
        pastMedication: '',
        additionalHistory: '',
        labTestsAndImaging: '',
        diagnosis: '',
        testsRequested: '',
        testsRequestedByWhen: '',
        prescriptions: [
          { medicine: '', dosage: '', when: 'After food (p/c)', frequency: '1-0-1 (BD)', duration: '', notes: '' },
        ],
        dietAndExercise: '',
        admissionAdvice: 'No',
        assessmentPlan: '',
        advice: '',
        nextVisit: '',
        referredTo: { doctorName: '', speciality: '', phoneNo: '', email: '' },
        otNotes: freshOt,
        otProcedures: [],
        doctorName: currentDoctor?.fullName || '',
        department: currentDoctor?.department || '',
      });
    }
  }, [consultationToEdit, defaultDate, isOpen, currentDoctor]);

  if (!isOpen) return null;

  const updateVitals = (key: keyof Consultation['vitals'], val: string) => {
    setFormData((prev) => ({
      ...prev,
      vitals: {
        ...(prev.vitals || {}),
        [key]: val,
      },
    }));
  };

  const updateHistoryChecklist = (key: keyof Consultation['historyChecklist'], val: any) => {
    setFormData((prev) => ({
      ...prev,
      historyChecklist: {
        ...(prev.historyChecklist || {}),
        [key]: val,
      },
    }));
  };

  const updateIpss = (key: keyof Consultation['ipss'], val: any) => {
    setFormData((prev) => {
      const nextIpss: Consultation['ipss'] = {
        ...(prev.ipss || {}),
        [key]: val,
      };
      if (key === 'poorFlow') {
        nextIpss.poorStream = val;
      } else if (key === 'poorStream') {
        nextIpss.poorFlow = val;
      }
      return {
        ...prev,
        ipss: nextIpss,
      };
    });
  };

  const updateReferredTo = (key: keyof NonNullable<Consultation['referredTo']>, val: string) => {
    setFormData((prev) => ({
      ...prev,
      referredTo: {
        ...(prev.referredTo || {}),
        [key]: val,
      },
    }));
  };

  const updateOtNotes = (key: keyof OtNotes, val: string) => {
    setFormData((prev) => {
      const updatedCurrent: OtNotes = {
        ...createEmptyOtNotes(),
        ...(prev.otNotes || {}),
        [key]: val,
      };
      setOtProceduresList((prevList) => {
        const nextList = [...prevList];
        const safeIdx = Math.min(activeOtProcIndex, Math.max(0, nextList.length - 1));
        nextList[safeIdx] = updatedCurrent;
        return nextList;
      });
      return {
        ...prev,
        // Keep the record date synced to the surgery date when in the dedicated OT Notes form
        date:
          key === 'surgeryDate' && val
            ? val
            : prev.date,
        otNotes: updatedCurrent,
      };
    });
  };

  const handleSelectOtProcedureSlot = (index: number) => {
    const targetProc = otProceduresList[index];
    if (!targetProc) return;
    setActiveOtProcIndex(index);
    setFormData((prev) => ({
      ...prev,
      otNotes: targetProc,
    }));
  };

  const handleAddNewOtProcedureSlot = () => {
    const newProc = createEmptyOtNotes(
      new Date().toISOString().split('T')[0],
      formData.doctorName || currentDoctor?.fullName || '',
      formData.otNotes?.hospitalName || currentDoctor?.hospitalName || ''
    );
    const nextList = [...otProceduresList, newProc];
    const newIdx = nextList.length - 1;
    setOtProceduresList(nextList);
    setActiveOtProcIndex(newIdx);
    setFormData((prev) => ({
      ...prev,
      otNotes: newProc,
    }));
  };

  const handleRemoveOtProcedureSlot = (index: number) => {
    if (otProceduresList.length <= 1) {
      const empty = createEmptyOtNotes();
      setOtProceduresList([empty]);
      setActiveOtProcIndex(0);
      setFormData((prev) => ({ ...prev, otNotes: empty }));
      return;
    }
    const nextList = otProceduresList.filter((_, idx) => idx !== index);
    const nextIdx = Math.min(activeOtProcIndex, nextList.length - 1);
    setOtProceduresList(nextList);
    setActiveOtProcIndex(nextIdx);
    setFormData((prev) => ({
      ...prev,
      otNotes: nextList[nextIdx],
    }));
  };

  const applyOtTemplate = (templateId: string) => {
    const found = UROLOGY_OT_TEMPLATES.find((t) => t.id === templateId);
    if (!found) return;
    const { id: _id, label: _label, shortTag: _shortTag, fields: _fields, ...templateOtFields } = found;
    setFormData((prev) => {
      const currentOt = prev.otNotes || createEmptyOtNotes();
      const updatedCurrent: OtNotes = {
        ...currentOt,
        surgeryDate: currentOt.surgeryDate || prev.date || new Date().toISOString().split('T')[0],
        surgeonName: currentOt.surgeonName || prev.doctorName || '',
        ...templateOtFields,
      };
      setOtProceduresList((prevList) => {
        const nextList = [...prevList];
        const safeIdx = Math.min(activeOtProcIndex, Math.max(0, nextList.length - 1));
        nextList[safeIdx] = updatedCurrent;
        return nextList;
      });
      return {
        ...prev,
        diagnosis:
          prev.diagnosis && prev.diagnosis !== 'General Consultation'
            ? prev.diagnosis
            : found.postOpDiagnosis || found.preOpDiagnosis || prev.diagnosis,
        otNotes: updatedCurrent,
      };
    });
  };

  const updateOtHandDrawnDiagrams = (nextDiagrams: string[]) => {
    const cleanDiagrams = nextDiagrams
      .filter((d) => typeof d === 'string' && d.startsWith('data:image/') && d.length <= 42000)
      .slice(0, 1);
    setFormData((prev) => {
      const updatedCurrent: OtNotes = {
        ...createEmptyOtNotes(),
        ...(prev.otNotes || {}),
        handDrawnDiagrams: cleanDiagrams,
        hasHandDrawnDiagram: cleanDiagrams.length > 0,
      };
      setOtProceduresList((prevList) => {
        const nextList = [...prevList];
        const safeIdx = Math.min(activeOtProcIndex, Math.max(0, nextList.length - 1));
        nextList[safeIdx] = updatedCurrent;
        return nextList;
      });
      return {
        ...prev,
        otNotes: updatedCurrent,
      };
    });
  };

  const handleUploadOtHandDrawnDiagramFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file || !file.type.startsWith('image/')) return;
    const rawDataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
    if (!rawDataUrl) return;
    // Compress diagram locally via browser canvas so it stays lightweight (~10-30 KB) in localStorage
    const compressedDataUrl = await new Promise<string>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 480;
        const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(rawDataUrl.length <= 42000 ? rawDataUrl : '');
          return;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        let out = canvas.toDataURL('image/jpeg', 0.65);
        if (out.length > 42000) {
          out = canvas.toDataURL('image/jpeg', 0.45);
        }
        resolve(out.length <= 42000 ? out : '');
      };
      img.onerror = () => resolve('');
      img.src = rawDataUrl;
    });
    if (compressedDataUrl && compressedDataUrl.startsWith('data:image/')) {
      updateOtHandDrawnDiagrams([compressedDataUrl]);
      setOtDiagramStatusMsg(
        `Attached operative diagram locally (~${Math.max(
          1,
          Math.round((compressedDataUrl.length * 0.75) / 1024)
        )} KB)`
      );
    }
  };

  const updateRx = (idx: number, fields: Partial<PrescriptionItem>) => {
    setFormData((prev) => {
      const rx = [...(prev.prescriptions || [])];
      const current = rx[idx] || ({} as PrescriptionItem);
      const updated = { ...current, ...fields };

      if (fields.medicine !== undefined) {
        const masterMed = findMasterMedicationByName(
          fields.medicine,
          current.dosage || current.dosageStrength,
          doctorUid
        );
        if (masterMed) {
          if (!(current.dosage || '').trim() && masterMed.dosage) {
            updated.dosage = masterMed.dosage;
            updated.dosageStrength = masterMed.dosage;
          }
          if ((!current.when || current.when === 'After food (p/c)') && masterMed.when) {
            updated.when = masterMed.when;
            updated.timing = masterMed.when;
          }
          if ((!current.frequency || current.frequency === '1-0-1 (BD)') && masterMed.frequency) {
            updated.frequency = masterMed.frequency;
          }
          if ((!current.duration || current.duration === '5 Days') && masterMed.duration) {
            updated.duration = masterMed.duration;
          }
          if (!(current.notes || current.instructions || '').trim() && masterMed.notes) {
            updated.notes = masterMed.notes;
            updated.instructions = masterMed.notes;
          }
        } else {
          const preset = findMedicinePreset(fields.medicine);
          if (preset && !(current.dosage || '').trim()) {
            updated.dosage = preset.dosage;
            updated.dosageStrength = preset.dosage;
            updated.when = preset.when || updated.when;
            updated.timing = preset.when || updated.timing;
            updated.frequency = preset.frequency || updated.frequency;
            updated.duration = preset.duration || updated.duration;
            if (!updated.notes && preset.notes) {
              updated.notes = preset.notes;
              updated.instructions = preset.notes;
            }
          }
        }
      }

      rx[idx] = updated;
      return { ...prev, prescriptions: rx };
    });
  };

  const addRx = () => {
    setFormData((prev) => ({
      ...prev,
      prescriptions: [
        ...(prev.prescriptions || []),
        { medicine: '', dosage: '', when: 'After food (p/c)', frequency: '1-0-1 (BD)', duration: '', notes: '' },
      ],
    }));
  };

  const addRxPreset = (presetItem: PrescriptionItem) => {
    setFormData((prev) => {
      const existing = [...(prev.prescriptions || [])];
      if (existing.length === 1 && !(existing[0].medicine || '').trim()) {
        return { ...prev, prescriptions: [presetItem] };
      }
      return { ...prev, prescriptions: [...existing, presetItem] };
    });
  };

  const handleApplyMedicationGroup = (group: MedicationGroup, store: MedicineMasterStore) => {
    setFormData((prev) => {
      const { prescriptions } = applyMedicationGroupToPrescriptions(
        prev.prescriptions,
        group,
        store
      );
      return { ...prev, prescriptions };
    });
  };

  const removeRx = (idx: number) => {
    setFormData((prev) => ({
      ...prev,
      prescriptions: (prev.prescriptions || []).filter((_, i) => i !== idx),
    }));
  };

  const buildLiveConsultationObject = (): Consultation => {
    const sanitizedLabs = sanitizeLabTestsAndImagingText(
      formData.labTestsAndImaging,
      formData.pastMedication
    );
    const dedupedPlan = deduplicatePlanAndAdviceFields(
      formData.assessmentPlan,
      formData.advice,
      formData.nextVisit
    );
    const dedupedComplaints = cleanChiefComplaintsText(
      formData.complaints || formData.chiefComplaints || ''
    );

    const { salutation: cleanSal, patientName: cleanPtName } =
      sanitizeSalutationAndPatientName(formData.salutation, formData.patientName);

    // Sync active OT procedure into otProceduresList and filter valid procedures
    const mergedProcsList = [...otProceduresList];
    const safeActiveIdx = Math.min(activeOtProcIndex, Math.max(0, mergedProcsList.length - 1));
    if (formData.otNotes) {
      mergedProcsList[safeActiveIdx] = formData.otNotes;
    }
    const validOtProcedures = mergedProcsList
      .filter((p) => hasOtNotesData(p))
      .map((p) => ({
        ...normalizeOtNotes(p, formData.date),
        surgeryDate: p.surgeryDate || formData.date || '',
      }))
      .sort((a, b) => (a.surgeryDate || '').localeCompare(b.surgeryDate || ''));

    const latestValidOt =
      validOtProcedures.length > 0
        ? validOtProcedures[validOtProcedures.length - 1]
        : undefined;

    if (isOtFormMode) {
      const effectiveSurgeryDate =
        latestValidOt?.surgeryDate ||
        formData.otNotes?.surgeryDate ||
        formData.date ||
        new Date().toISOString().split('T')[0];

      const otFallbackDiag =
        latestValidOt?.postOpDiagnosis ||
        latestValidOt?.preOpDiagnosis ||
        (latestValidOt?.procedureName ? `Operated: ${latestValidOt.procedureName}` : '') ||
        formData.diagnosis ||
        'Operative Procedure';

      return {
        id: consultationToEdit?.id || `ot-${Date.now()}`,
        opdNo: cleanExplicitOpdNo(formData.opdNo),
        date: effectiveSurgeryDate,
        time: formData.otNotes?.surgeryTime || formData.time || '',
        salutation: (cleanSal || formData.salutation) as any,
        patientName: (cleanPtName || formData.patientName || '').trim(),
        phoneNumber: formData.phoneNumber || '',
        contactNumber: formData.phoneNumber || '',
        gender: formData.gender as any,
        age: formData.age || '',
        dob: formData.dob || '',
        preferredLanguage: formData.preferredLanguage || 'English',
        city: formData.city || '',
        address: formData.address || '',
        addressOrCity: [formData.city, formData.address].filter(Boolean).join(', '),
        pin: formData.pin || '',
        vitals: {},
        complaints: '',
        chiefComplaints: '',
        historyChecklist: {
          previousSurgery: 'Yes',
        },
        history: '',
        pastMedication: '',
        additionalHistory: '',
        ipss: {},
        systemicExamination: '',
        genitalExamination: '',
        perRectalExam: '',
        examinationNotes: '',
        labTestsAndImaging: '',
        investigationRecords: formData.investigationRecords || [],
        diagnosis: deduplicateClinicalText(otFallbackDiag),
        testsRequested: '',
        testsRequestedByWhen: '',
        prescriptions: [],
        dietAndExercise: '',
        admissionAdvice: 'Yes',
        assessmentPlan: '',
        advice: '',
        adviceAndDiet: '',
        nextVisit: '',
        followUpDate: '',
        referredTo: formData.referredTo || {},
        otNotes: latestValidOt
          ? { ...latestValidOt, surgeryDate: effectiveSurgeryDate }
          : {
              ...normalizeOtNotes(formData.otNotes, effectiveSurgeryDate),
              surgeryDate: effectiveSurgeryDate,
            },
        otProcedures:
          validOtProcedures.length > 0
            ? validOtProcedures.map((p, idx) =>
                idx === validOtProcedures.length - 1
                  ? { ...p, surgeryDate: effectiveSurgeryDate }
                  : p
              )
            : [
                {
                  ...normalizeOtNotes(formData.otNotes, effectiveSurgeryDate),
                  surgeryDate: effectiveSurgeryDate,
                },
              ],
        doctorName: formData.doctorName || currentDoctor?.fullName || '',
        department: formData.department || currentDoctor?.department || '',
        createdAt: consultationToEdit?.createdAt || Date.now(),
        updatedAt: Date.now(),
      };
    }

    return {
      id: consultationToEdit?.id || `emr-${Date.now()}`,
      opdNo: cleanExplicitOpdNo(formData.opdNo),
      date: formData.date || new Date().toISOString().split('T')[0],
      time: formData.time || '',
      salutation: (cleanSal || formData.salutation) as any,
      patientName: (cleanPtName || formData.patientName || '').trim(),
      phoneNumber: formData.phoneNumber || '',
      contactNumber: formData.phoneNumber || '',
      gender: formData.gender as any,
      age: formData.age || '',
      dob: formData.dob || '',
      preferredLanguage: formData.preferredLanguage || 'English',
      city: formData.city || '',
      address: formData.address || '',
      addressOrCity: [formData.city, formData.address].filter(Boolean).join(', '),
      pin: formData.pin || '',
      vitals: formData.vitals || {},
      complaints: dedupedComplaints,
      chiefComplaints: dedupedComplaints,
      historyChecklist: formData.historyChecklist || {},
      history: deduplicateClinicalText(formData.additionalHistory || formData.history || ''),
      pastMedication: sanitizedLabs.pastMedication,
      additionalHistory: deduplicateClinicalText(formData.additionalHistory || ''),
      ipss: formData.ipss || {},
      systemicExamination: formData.systemicExamination || '',
      genitalExamination: formData.genitalExamination || '',
      perRectalExam: formData.perRectalExam || '',
      examinationNotes: formData.systemicExamination || '',
      labTestsAndImaging: sanitizedLabs.labTestsAndImaging,
      investigationRecords: formData.investigationRecords || [],
      diagnosis: deduplicateClinicalText(formData.diagnosis || 'General Consultation'),
      testsRequested: deduplicateClinicalText(formData.testsRequested || ''),
      testsRequestedByWhen: formData.testsRequestedByWhen || '',
      prescriptions: formData.prescriptions || [],
      dietAndExercise: deduplicateClinicalText(formData.dietAndExercise || ''),
      admissionAdvice: formData.admissionAdvice || 'No',
      assessmentPlan: dedupedPlan.assessmentPlan,
      advice: dedupedPlan.advice,
      adviceAndDiet: [deduplicateClinicalText(formData.dietAndExercise || ''), dedupedPlan.advice]
        .filter(Boolean)
        .join('. '),
      nextVisit: dedupedPlan.nextVisit,
      followUpDate: dedupedPlan.nextVisit,
      referredTo: formData.referredTo || {},
      // OPD Patient Consultation form never creates OT notes directly
      otNotes: consultationToEdit?.id ? consultationToEdit.otNotes : undefined,
      otProcedures: consultationToEdit?.id ? consultationToEdit.otProcedures : undefined,
      doctorName: formData.doctorName || currentDoctor?.fullName || '',
      department: formData.department || currentDoctor?.department || '',
      createdAt: consultationToEdit?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.patientName?.trim() || !formData.date) {
      setFormValidationError('Patient name and date are required before saving.');
      return;
    }
    setFormValidationError(null);

    const finalConsultation = buildLiveConsultationObject();
    onSave(finalConsultation);
    onClose();
  };

  const effectiveHeaderDate = isOtFormMode
    ? formData.otNotes?.surgeryDate || formData.date || ''
    : formData.date || '';
  const { monthLabel } = getMonthInfo(effectiveHeaderDate);

  // Shared large input & textarea styling with signature pastel borders & focus rings
  const largeInputClass =
    'w-full px-4 py-3 text-sm sm:text-[15px] bg-white/95 border border-[#D8DDF0] rounded-xl text-[#2D2A3E] placeholder:text-[#948DA6] shadow-2xs focus:bg-white focus:border-[#A78BFA] focus:ring-4 focus:ring-[#EDE9FE]/80 outline-none transition-all';
  const largeTextareaClass =
    'w-full px-4 py-3 text-sm sm:text-[15px] leading-relaxed bg-white/95 border border-[#D8DDF0] rounded-xl text-[#2D2A3E] placeholder:text-[#948DA6] shadow-2xs focus:bg-white focus:border-[#A78BFA] focus:ring-4 focus:ring-[#EDE9FE]/80 outline-none transition-all resize-y';

  const renderFieldLabelColumn = (
    title: string,
    subtitle?: string,
    onClear?: () => void
  ) => (
    <div className="lg:w-56 xl:w-64 shrink-0 flex lg:flex-col items-center lg:items-end justify-between lg:justify-start lg:text-right pt-1.5 pr-1 gap-2">
      <div>
        <label className="block text-sm font-extrabold text-[#3B2E68] leading-snug">
          {title}
        </label>
        {subtitle && (
          <span className="block text-[11px] font-medium text-[#7A728F] mt-0.5">
            {subtitle}
          </span>
        )}
      </div>
      {onClear && (
        <div className="flex items-center gap-1.5 text-[#7A728F] mt-1">
          <button
            type="button"
            onClick={onClear}
            className="p-1.5 rounded-lg bg-[#FFF5F7] hover:bg-[#FFE4E6] text-[#9F1239] border border-[#FECDD3] transition-colors cursor-pointer"
            title={`Clear ${title}`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );

  const displayGenderLabel =
    formData.gender === 'F' ? 'Female' : formData.gender === 'Other' ? 'Other' : 'Male';
  const displayPatientHeaderName = formData.patientName?.trim()
    ? `${formData.salutation ? `${formData.salutation} ` : ''}${formData.patientName.trim()}`
    : isOtFormMode
    ? consultationToEdit?.id
      ? 'Edit Operation Theatre (OT) Notes'
      : 'New Operation Theatre (OT) Notes'
    : consultationToEdit?.id
    ? 'Edit Patient Case Sheet'
    : 'New Patient Consultation';

  // OPD Consultation Form has NO OT Notes tab; Separate OT Notes Form shows only OT Notes
  const navItems: {
    id: FormSectionTab;
    shortLabel: string;
    fullLabel: string;
    icon: React.ReactNode;
    isOt?: boolean;
  }[] = isOtFormMode
    ? [
        {
          id: 'ot',
          shortLabel: 'OT Notes',
          fullLabel: 'Operation Theatre (OT) & Freelance Surgical Notes Form',
          icon: <Scissors className="w-4 h-4" />,
          isOt: true,
        },
      ]
    : [
        {
          id: 'all',
          shortLabel: 'Full Sheet',
          fullLabel: 'All Fields (Full Sheet)',
          icon: <LayoutGrid className="w-4 h-4" />,
        },
        {
          id: 'patient',
          shortLabel: 'Patient',
          fullLabel: '1. Patient Registration',
          icon: <User className="w-4 h-4" />,
        },
        {
          id: 'vitals',
          shortLabel: 'Vitals',
          fullLabel: '2. Vitals & Complaints',
          icon: <HeartPulse className="w-4 h-4" />,
        },
        {
          id: 'history',
          shortLabel: 'IPSS & History',
          fullLabel: '3. IPSS & Negative History',
          icon: <ClipboardList className="w-4 h-4" />,
        },
        {
          id: 'exams',
          shortLabel: 'Exams/Labs',
          fullLabel: '4. Examinations & Labs',
          icon: <Activity className="w-4 h-4" />,
        },
        {
          id: 'rx',
          shortLabel: 'Rx & Diag',
          fullLabel: '5. Diagnosis & Rx',
          icon: <Pill className="w-4 h-4" />,
        },
        {
          id: 'plan',
          shortLabel: 'Plan',
          fullLabel: '6. Plan & Referral',
          icon: <UserCheck className="w-4 h-4" />,
        },
      ];

  const showSection = (sec: Exclude<FormSectionTab, 'all'>) => {
    if (isOtFormMode) {
      return sec === 'ot';
    }
    if (sec === 'ot') {
      return false;
    }
    return activeTab === 'all' || activeTab === sec;
  };

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-[#FBF9FD] via-[#F4F8FA] to-[#F3FBF7] flex flex-col w-screen h-screen overflow-hidden">
      {/* FULL-PAGE TOP PATIENT BANNER (matching clean full-page clinical reference in signature pastel theme) */}
      <div className="px-4 sm:px-6 py-3 bg-gradient-to-r from-[#F4F1FA] via-[#E1F7FC]/80 to-[#EBFBF3]/85 border-b border-[#D6DDF8] flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-2xs">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-white/90 border border-[#D6DDF8] text-[#4C3F91] flex items-center justify-center shrink-0 shadow-2xs">
            <MedScribeLogo className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-base sm:text-lg font-extrabold text-[#2D2A3E] truncate">
                {displayPatientHeaderName}
                {(formData.age || formData.gender) && (
                  <span className="font-bold text-[#5B4D9D] ml-1.5">
                    ({formData.age ? `${formData.age}, ` : ''}
                    {displayGenderLabel})
                  </span>
                )}
              </h2>
              {isOtFormMode && (
                <span className="px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 border border-teal-200 text-[11px] font-semibold flex items-center gap-1">
                  <Scissors className="w-3 h-3 text-teal-700" />
                  <span>OT Register Entry</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-[#6B6380] mt-0.5 flex-wrap">
              {formData.opdNo && (
                <>
                  <span className="font-mono font-semibold text-[#3B2E68]">{formData.opdNo}</span>
                  <span>|</span>
                </>
              )}
              <span className="font-mono text-[#4B445E] flex items-center gap-1">
                <Phone className="w-3 h-3 text-[#7C6EE6]" />
                {formData.phoneNumber || 'Phone not entered'}
              </span>
              <span>|</span>
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3 text-[#2E8BC0]" />
                {isOtFormMode ? 'Surgery Date:' : 'Visit Date:'}{' '}
                <strong className="text-[#2D2A3E]">{effectiveHeaderDate}</strong>
              </span>
              <span className="hidden md:inline">|</span>
              <span className="hidden md:inline">
                Excel Register: <strong className="text-[#2E7D5B]">[{monthLabel}]</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Right Top Toolbar Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setIsInvestigationModalOpen(true)}
            className="px-4 py-2 rounded-xl bg-[#EDE9FE] hover:bg-[#DDD6FE] text-[#4C1D95] border border-[#C4B5FD] text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Manually enter lab reports & imaging studies"
          >
            <FlaskConical className="w-4 h-4 text-[#6D28D9]" />
            <span className="hidden sm:inline">Add Investigation</span>
          </button>

          <button
            type="button"
            onClick={() => setIsPrintModalOpen(true)}
            className="px-4 py-2 rounded-xl bg-[#FEF3C7] hover:bg-[#FDE68A] text-amber-950 border border-[#FCD34D] text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
            title="Preview and Print Prescription & Case Sheet"
          >
            <Printer className="w-4 h-4 text-amber-800" />
            <span>Preview / Print</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl border border-[#D8DDF0] bg-white/90 hover:bg-[#FFE4E6] text-[#4B445E] hover:text-rose-900 hover:border-rose-300 text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
            title="Close workspace"
          >
            <X className="w-4 h-4" />
            <span>Close</span>
          </button>
        </div>
      </div>

      {/* Top Section Tabs Bar in Pastel Palette */}
      <div className="px-4 sm:px-6 py-2 bg-[#F6F3FB] border-b border-[#E3DCF2] flex items-center gap-1.5 overflow-x-auto text-xs sm:text-sm shrink-0 no-scrollbar">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`px-3.5 py-2 rounded-xl font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer border ${
                isActive
                  ? item.isOt
                    ? 'bg-[#FEF3C7] text-amber-950 border-[#FCD34D] shadow-2xs'
                    : item.id === 'all'
                    ? 'bg-[#E1F7FC] text-[#1E4D5C] border-[#A9CFF7] shadow-2xs'
                    : 'bg-[#DDD6FE] text-violet-950 border-[#C4B5FD] shadow-2xs'
                  : item.isOt && hasOtNotesData(formData.otNotes)
                  ? 'bg-[#FFFBEB] text-amber-900 border-amber-200 hover:bg-[#FEF3C7]/70'
                  : 'bg-white/60 text-[#6B647B] border-transparent hover:bg-white hover:text-[#2D2A3E]'
              }`}
            >
              {item.icon}
              <span>{item.fullLabel}</span>
              {item.isOt && hasOtNotesData(formData.otNotes) && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-300/80 text-amber-950 text-[10px] font-extrabold">
                  Active
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* MAIN FULL-PAGE WORKSPACE: Left Pastel Icon Navigation Rail + Right Large Scrollable Clinical Form */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Vertical Navigation Rail in Pastel Lavender-Cream */}
        <aside className="hidden md:flex w-20 lg:w-24 bg-[#F9F7FD] border-r border-[#E3DCF2] flex-col items-center py-4 gap-2 shrink-0 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-16 lg:w-20 py-2.5 px-1.5 rounded-xl flex flex-col items-center justify-center gap-1 text-[11px] font-bold transition-all cursor-pointer border ${
                  isActive
                    ? item.isOt
                      ? 'bg-[#FEF3C7] text-amber-950 border-[#FCD34D] shadow-2xs'
                      : item.id === 'all'
                      ? 'bg-[#E1F7FC] text-[#1E4D5C] border-[#A9CFF7] shadow-2xs'
                      : 'bg-[#DDD6FE] text-violet-950 border-[#C4B5FD] shadow-2xs'
                    : 'bg-transparent text-[#6B647B] border-transparent hover:bg-white/90 hover:text-[#2D2A3E]'
                }`}
              >
                {item.icon}
                <span className="text-center leading-tight">{item.shortLabel}</span>
              </button>
            );
          })}
        </aside>

        {/* Full-Page Scrollable Clinical & OT Form Body */}
        <form
          onSubmit={handleSubmit}
          className="flex-1 flex flex-col min-w-0 overflow-hidden bg-gradient-to-br from-[#F7F4FC] via-[#FDFBF9] to-[#EFFAFC]"
        >
          <div className="flex-1 overflow-y-auto px-4 sm:px-8 lg:px-12 py-6 space-y-6">
            <div className="max-w-[1440px] mx-auto space-y-6">
              {/* SECTION 1: Patient Registration & Visit Details */}
              {showSection('patient') && (
                <div className="bg-gradient-to-br from-[#FDFCFE] via-white to-[#F7F4FC] rounded-2xl border border-[#E3DCF2] p-5 sm:p-6 shadow-2xs space-y-5">
                  <div className="flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-8">
                    {renderFieldLabelColumn('Patient & Visit Details', 'Demographics, Age, Sex & Phone')}
                    <div className="flex-1 space-y-4">
                      {/* Row 1: Salutation, Patient Name, Age, Gender, Phone */}
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5">
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-bold text-slate-600 mb-1.5">
                            Salutation
                          </label>
                          <select
                            value={formData.salutation || 'Mr.'}
                            onChange={(e) => setFormData({ ...formData, salutation: e.target.value })}
                            className={largeInputClass}
                          >
                            <option value="Mr.">Mr.</option>
                            <option value="Ms.">Ms.</option>
                            <option value="Mrs.">Mrs.</option>
                            <option value="Dr.">Dr.</option>
                            <option value="Master">Master</option>
                          </select>
                        </div>
                        <div className="sm:col-span-4">
                          <label className="block text-xs font-bold text-slate-700 mb-1.5">
                            Patient Name *
                          </label>
                          <input
                            type="text"
                            required
                            value={formData.patientName || ''}
                            placeholder="Enter Patient Name"
                            onChange={(e) => setFormData({ ...formData, patientName: e.target.value })}
                            className={`${largeInputClass} font-bold text-slate-900`}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-bold text-slate-600 mb-1.5">
                            Age
                          </label>
                          <input
                            type="text"
                            value={formData.age || ''}
                            placeholder="e.g. 58 Y"
                            onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                            className={largeInputClass}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-bold text-slate-600 mb-1.5">
                            Gender *
                          </label>
                          <div className="flex rounded-xl border border-[#D8DDF0] overflow-hidden bg-white h-[46px]">
                            {(['M', 'F', 'Other'] as const).map((g) => (
                              <button
                                key={g}
                                type="button"
                                onClick={() => setFormData({ ...formData, gender: g })}
                                className={`flex-1 text-center text-sm font-bold transition-colors cursor-pointer ${
                                  formData.gender === g
                                    ? 'bg-[#DDD6FE] text-violet-950'
                                    : 'bg-white text-slate-700 hover:bg-[#F6F3FB]'
                                }`}
                              >
                                {g}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-bold text-slate-600 mb-1.5">
                            Phone Number
                          </label>
                          <input
                            type="text"
                            value={formData.phoneNumber || ''}
                            placeholder="9823044120"
                            onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                            className={`${largeInputClass} font-mono`}
                          />
                        </div>
                      </div>

                      {/* Row 2: Consultation Date, UHID/OPD No, Time, City, Address */}
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5">
                        <div className="sm:col-span-3">
                          <label className="block text-xs font-bold text-slate-600 mb-1.5">
                            Consultation Date *
                          </label>
                          <input
                            type="date"
                            required
                            value={formData.date || ''}
                            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                            className={`${largeInputClass} font-semibold`}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-bold text-slate-600 mb-1.5">
                            OPD / UHID No.
                          </label>
                          <input
                            type="text"
                            value={formData.opdNo || ''}
                            placeholder="Optional"
                            onChange={(e) => setFormData({ ...formData, opdNo: e.target.value })}
                            className={`${largeInputClass} font-mono`}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-bold text-slate-600 mb-1.5">
                            Visit Time
                          </label>
                          <input
                            type="text"
                            value={formData.time || ''}
                            placeholder="10:15 AM"
                            onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                            className={largeInputClass}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-bold text-slate-600 mb-1.5">
                            City
                          </label>
                          <input
                            type="text"
                            list="suggest-city"
                            value={formData.city || ''}
                            placeholder="City"
                            onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                            className={largeInputClass}
                          />
                        </div>
                        <div className="sm:col-span-3">
                          <label className="block text-xs font-bold text-slate-600 mb-1.5">
                            Address / PIN
                          </label>
                          <input
                            type="text"
                            value={formData.address || ''}
                            placeholder="Address"
                            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                            className={largeInputClass}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 2: Vitals & Complaints (Pastel Sky-Mint Card) */}
              {showSection('vitals') && (
                <div className="bg-gradient-to-br from-[#FBFDFF] via-white to-[#F2FBF9] rounded-2xl border border-[#CBE4F9] p-5 sm:p-6 shadow-2xs space-y-6">
                  {/* Vitals Strip Row */}
                  <div className="flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-8">
                    {renderFieldLabelColumn('Vitals', 'BP, Pulse, SpO2, Weight, BMI')}
                    <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1">BP (mmHg)</label>
                        <input
                          type="text"
                          list="suggest-bp"
                          value={formData.vitals?.bp || ''}
                          placeholder="130/80"
                          onChange={(e) => updateVitals('bp', e.target.value)}
                          className={`${largeInputClass} font-mono`}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1">Pulse (bpm)</label>
                        <input
                          type="text"
                          list="suggest-pulse"
                          value={formData.vitals?.pulse || ''}
                          placeholder="78"
                          onChange={(e) => updateVitals('pulse', e.target.value)}
                          className={`${largeInputClass} font-mono`}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1">Temp</label>
                        <input
                          type="text"
                          list="suggest-temp"
                          value={formData.vitals?.temp || ''}
                          placeholder="98.4 F"
                          onChange={(e) => updateVitals('temp', e.target.value)}
                          className={`${largeInputClass} font-mono`}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1">SpO2 (%)</label>
                        <input
                          type="text"
                          list="suggest-spo2"
                          value={formData.vitals?.spo2 || ''}
                          placeholder="98%"
                          onChange={(e) => updateVitals('spo2', e.target.value)}
                          className={`${largeInputClass} font-mono`}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1">Height (cm)</label>
                        <input
                          type="text"
                          value={formData.vitals?.height || ''}
                          placeholder="cm"
                          onChange={(e) => updateVitals('height', e.target.value)}
                          className={`${largeInputClass} font-mono`}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1">Weight (kg)</label>
                        <input
                          type="text"
                          value={formData.vitals?.weight || ''}
                          placeholder="kg"
                          onChange={(e) => updateVitals('weight', e.target.value)}
                          className={`${largeInputClass} font-mono`}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1">Waist (cm)</label>
                        <input
                          type="text"
                          value={formData.vitals?.waist || ''}
                          placeholder="cm"
                          onChange={(e) => updateVitals('waist', e.target.value)}
                          className={`${largeInputClass} font-mono`}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1">Hip (cm)</label>
                        <input
                          type="text"
                          value={formData.vitals?.hip || ''}
                          placeholder="cm"
                          onChange={(e) => updateVitals('hip', e.target.value)}
                          className={`${largeInputClass} font-mono`}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-5 flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-8">
                    {renderFieldLabelColumn('Complaints', 'Chief presenting complaints', () =>
                      setFormData({ ...formData, complaints: '', chiefComplaints: '' })
                    )}
                    <div className="flex-1 space-y-2">
                      <textarea
                        rows={3}
                        value={formData.complaints || formData.chiefComplaints || ''}
                        placeholder="Complaints... (e.g. Increased urinary frequency, weak stream, nocturia x 3-4 times/night)"
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            complaints: e.target.value,
                            chiefComplaints: e.target.value,
                          })
                        }
                        className={largeTextareaClass}
                      />
                      <FieldSuggestionsBar
                        field="complaints"
                        currentValue={formData.complaints || formData.chiefComplaints || ''}
                        onSelect={(val) =>
                          setFormData({ ...formData, complaints: val, chiefComplaints: val })
                        }
                        mode="append-semi"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 3: IPSS Table & Negative History Checklist */}
              {showSection('history') && (
                <div className="bg-gradient-to-br from-[#FCFBF9] via-white to-[#F6F3FB] rounded-2xl border border-[#E3DCF2] p-5 sm:p-6 shadow-2xs space-y-6">
                  <div className="flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-8">
                    {renderFieldLabelColumn('IPSS & Case Sheet', 'IPSS (F U N P I S S) & Negative History')}
                    <div className="flex-1 space-y-5">
                      {/* IPSS Clinical Table — Shown only when IPSS is recorded or expanded */}
                      {!(hasIpssData(formData) || showManualIpssTable) ? (
                        <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                          <span className="font-semibold text-slate-600">
                            IPSS Score (F U N P I S S):{' '}
                            <span className="font-normal text-slate-500">Not included on OPD sheet</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowManualIpssTable(true)}
                            className="px-3 py-1.5 text-xs font-bold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg cursor-pointer transition-colors"
                          >
                            + Add IPSS Table
                          </button>
                        </div>
                      ) : (
                      <div className="p-4 sm:p-5 bg-amber-50/60 border border-amber-300/80 rounded-2xl space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-200/90 pb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-black text-amber-950 uppercase tracking-wide">
                                IPSS Clinical Table
                              </h4>
                              <span className="px-2.5 py-0.5 rounded bg-amber-200 text-amber-900 font-mono text-xs font-black tracking-widest">
                                F U N P I S S
                              </span>
                            </div>
                            <p className="text-xs text-amber-800">
                              Left (F, U, N) &bull; Right (P, I, S, S)
                            </p>
                          </div>

                          <div className="flex items-center gap-2 self-start sm:self-auto">
                            <button
                              type="button"
                              onClick={() => {
                                setFormData((prev) => ({
                                  ...prev,
                                  ipss: {
                                    ...prev.ipss,
                                    frequency: 'No',
                                    urgency: 'No',
                                    nocturia: '0-1 time',
                                    poorFlow: 'No',
                                    poorStream: 'No',
                                    intermittency: 'No',
                                    straining: 'No',
                                    incompleteEvacuation: 'No',
                                  },
                                }));
                              }}
                              className="px-3 py-1.5 text-xs font-bold bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 rounded-lg cursor-pointer"
                            >
                              All Normal / No
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setFormData((prev) => ({
                                  ...prev,
                                  ipss: {
                                    ...prev.ipss,
                                    frequency: 'Yes (< 2 hrs)',
                                    urgency: 'Yes',
                                    nocturia: '3 - 4 times',
                                    poorFlow: 'Yes',
                                    poorStream: 'Yes',
                                    intermittency: 'Yes',
                                    straining: 'Yes',
                                    incompleteEvacuation: 'Yes',
                                  },
                                }));
                              }}
                              className="px-3 py-1.5 text-xs font-bold bg-amber-600 text-white hover:bg-amber-700 rounded-lg shadow-2xs cursor-pointer"
                            >
                              Preset BPH (+)
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setFormData((prev) => ({ ...prev, ipss: {} }));
                                setShowManualIpssTable(false);
                              }}
                              className="px-2.5 py-1.5 text-xs font-semibold bg-white border border-slate-200 text-slate-600 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 rounded-lg cursor-pointer"
                            >
                              {hasIpssData(formData) ? 'Remove' : 'Hide'}
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Left Column: F, U, N */}
                          <div className="space-y-3 p-4 bg-white rounded-xl border border-amber-200 shadow-2xs">
                            <div className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5 border-b border-amber-100 pb-1.5">
                              <span className="w-5 h-5 rounded bg-amber-200 text-amber-950 inline-flex items-center justify-center font-bold text-xs">
                                1
                              </span>
                              <span>Left Section &bull; F U N</span>
                            </div>

                            {/* [F] - Frequency */}
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <label className="text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-1.5">
                                  <span className="w-5 h-5 rounded bg-amber-100 border border-amber-300 text-amber-900 inline-flex items-center justify-center font-black text-xs">
                                    F
                                  </span>
                                  <span>Frequency</span>
                                </label>
                                <div className="flex gap-1">
                                  {['Yes', 'No'].map((opt) => (
                                    <button
                                      key={opt}
                                      type="button"
                                      onClick={() => updateIpss('frequency', opt)}
                                      className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                                        formData.ipss?.frequency === opt
                                          ? 'bg-amber-600 text-white shadow-2xs'
                                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                      }`}
                                    >
                                      {opt}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <input
                                type="text"
                                value={formData.ipss?.frequency || ''}
                                placeholder="Value e.g. Yes / < 2h"
                                onChange={(e) => updateIpss('frequency', e.target.value)}
                                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none"
                              />
                            </div>

                            {/* [U] - Urgency */}
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <label className="text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-1.5">
                                  <span className="w-5 h-5 rounded bg-amber-100 border border-amber-300 text-amber-900 inline-flex items-center justify-center font-black text-xs">
                                    U
                                  </span>
                                  <span>Urgency</span>
                                </label>
                                <div className="flex gap-1">
                                  {['Yes', 'No', 'Night Only'].map((opt) => (
                                    <button
                                      key={opt}
                                      type="button"
                                      onClick={() => updateIpss('urgency', opt)}
                                      className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                                        formData.ipss?.urgency === opt
                                          ? 'bg-amber-600 text-white shadow-2xs'
                                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                      }`}
                                    >
                                      {opt}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <input
                                type="text"
                                value={formData.ipss?.urgency || ''}
                                placeholder="Value e.g. Yes / Moderate"
                                onChange={(e) => updateIpss('urgency', e.target.value)}
                                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none"
                              />
                            </div>

                            {/* [N] - Nocturia */}
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <label className="text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-1.5">
                                  <span className="w-5 h-5 rounded bg-amber-100 border border-amber-300 text-amber-900 inline-flex items-center justify-center font-black text-xs">
                                    N
                                  </span>
                                  <span>Nocturia</span>
                                </label>
                                <div className="flex gap-1">
                                  {['1-2x', '3-4x', '5+x'].map((opt) => (
                                    <button
                                      key={opt}
                                      type="button"
                                      onClick={() => updateIpss('nocturia', opt)}
                                      className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                                        formData.ipss?.nocturia === opt
                                          ? 'bg-amber-600 text-white shadow-2xs'
                                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                      }`}
                                    >
                                      {opt}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <input
                                type="text"
                                value={formData.ipss?.nocturia || ''}
                                placeholder="Value e.g. 3-4 times / night"
                                onChange={(e) => updateIpss('nocturia', e.target.value)}
                                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none"
                              />
                            </div>
                          </div>

                          {/* Right Column: P, I, S, S */}
                          <div className="space-y-3 p-4 bg-white rounded-xl border border-amber-200 shadow-2xs">
                            <div className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5 border-b border-amber-100 pb-1.5">
                              <span className="w-5 h-5 rounded bg-amber-200 text-amber-950 inline-flex items-center justify-center font-bold text-xs">
                                2
                              </span>
                              <span>Right Section &bull; P I S S</span>
                            </div>

                            {/* [P] - Poor flow */}
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <label className="text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-1.5">
                                  <span className="w-5 h-5 rounded bg-amber-100 border border-amber-300 text-amber-900 inline-flex items-center justify-center font-black text-xs">
                                    P
                                  </span>
                                  <span>Poor flow (Weak stream)</span>
                                </label>
                                <div className="flex gap-1">
                                  {['Yes', 'No'].map((opt) => (
                                    <button
                                      key={opt}
                                      type="button"
                                      onClick={() => updateIpss('poorFlow', opt)}
                                      className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                                        (formData.ipss?.poorFlow || formData.ipss?.poorStream) === opt
                                          ? 'bg-amber-600 text-white shadow-2xs'
                                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                      }`}
                                    >
                                      {opt}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <input
                                type="text"
                                value={formData.ipss?.poorFlow || formData.ipss?.poorStream || ''}
                                placeholder="Value e.g. Yes / Weak stream"
                                onChange={(e) => updateIpss('poorFlow', e.target.value)}
                                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none"
                              />
                            </div>

                            {/* [I] - Intermittency */}
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <label className="text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-1.5">
                                  <span className="w-5 h-5 rounded bg-amber-100 border border-amber-300 text-amber-900 inline-flex items-center justify-center font-black text-xs">
                                    I
                                  </span>
                                  <span>Intermittency</span>
                                </label>
                                <div className="flex gap-1">
                                  {['Yes', 'No'].map((opt) => (
                                    <button
                                      key={opt}
                                      type="button"
                                      onClick={() => updateIpss('intermittency', opt)}
                                      className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                                        formData.ipss?.intermittency === opt
                                          ? 'bg-amber-600 text-white shadow-2xs'
                                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                      }`}
                                    >
                                      {opt}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <input
                                type="text"
                                value={formData.ipss?.intermittency || ''}
                                placeholder="Value e.g. Yes / Stops and starts"
                                onChange={(e) => updateIpss('intermittency', e.target.value)}
                                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none"
                              />
                            </div>

                            {/* [S] - Straining */}
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <label className="text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-1.5">
                                  <span className="w-5 h-5 rounded bg-amber-100 border border-amber-300 text-amber-900 inline-flex items-center justify-center font-black text-xs">
                                    S
                                  </span>
                                  <span>Straining</span>
                                </label>
                                <div className="flex gap-1">
                                  {['Yes', 'No'].map((opt) => (
                                    <button
                                      key={opt}
                                      type="button"
                                      onClick={() => updateIpss('straining', opt)}
                                      className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                                        formData.ipss?.straining === opt
                                          ? 'bg-amber-600 text-white shadow-2xs'
                                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                      }`}
                                    >
                                      {opt}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <input
                                type="text"
                                value={formData.ipss?.straining || ''}
                                placeholder="Value e.g. Yes / Straining present"
                                onChange={(e) => updateIpss('straining', e.target.value)}
                                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none"
                              />
                            </div>

                            {/* [S] - Sense of incomplete evacuation */}
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <label className="text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-1.5">
                                  <span className="w-5 h-5 rounded bg-amber-100 border border-amber-300 text-amber-900 inline-flex items-center justify-center font-black text-xs">
                                    S
                                  </span>
                                  <span>Incomplete Evacuation</span>
                                </label>
                                <div className="flex gap-1">
                                  {['Yes', 'No'].map((opt) => (
                                    <button
                                      key={opt}
                                      type="button"
                                      onClick={() => updateIpss('incompleteEvacuation', opt)}
                                      className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                                        formData.ipss?.incompleteEvacuation === opt
                                          ? 'bg-amber-600 text-white shadow-2xs'
                                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                      }`}
                                    >
                                      {opt}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <input
                                type="text"
                                value={formData.ipss?.incompleteEvacuation || ''}
                                placeholder="Value e.g. Yes / Sensation of residual urine"
                                onChange={(e) => updateIpss('incompleteEvacuation', e.target.value)}
                                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-amber-200">
                          <label className="block text-xs font-bold text-slate-800 mb-1.5">
                            Quality of Life (QoL) due to urinary symptoms:
                          </label>
                          <input
                            type="text"
                            value={formData.ipss?.qualityOfLife || ''}
                            placeholder="e.g. Unhappy (Score 4/6), Mostly Dissatisfied, Mixed"
                            onChange={(e) => updateIpss('qualityOfLife', e.target.value)}
                            className={largeInputClass}
                          />
                        </div>
                      </div>
                      )}

                      {/* Negative History / Clinical History Checklist in Pastel Mint-Lavender */}
                      <div className="p-4 bg-[#F4FBF8] border border-[#C6EFE0] rounded-xl space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-extrabold text-[#115E59] uppercase tracking-wider">
                            Negative / Clinical History Checklist
                          </h4>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 text-sm">
                          {(
                            [
                              { key: 'burning', label: 'Burning micturition' },
                              { key: 'fever', label: 'Fever' },
                              { key: 'hematuria', label: 'Hematuria' },
                              { key: 'previousRenalCalculi', label: 'Previous Renal Calculi?' },
                              { key: 'previousSurgery', label: 'Previous Surgery?' },
                            ] as const
                          ).map((item) => (
                            <div
                              key={item.key}
                              className="flex items-center justify-between px-3.5 py-2.5 bg-white rounded-xl border border-[#D5EAE2]"
                            >
                              <span className="font-semibold text-slate-700 text-xs sm:text-sm">
                                {item.label}
                              </span>
                              <div className="flex gap-1.5">
                                {(['Yes', 'No'] as const).map((opt) => (
                                  <button
                                    key={opt}
                                    type="button"
                                    onClick={() => updateHistoryChecklist(item.key, opt)}
                                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer border ${
                                      formData.historyChecklist?.[item.key] === opt
                                        ? 'bg-[#D1FAE5] text-[#065F46] border-[#6EE7B7]'
                                        : 'bg-[#F6F4FB] text-slate-600 border-transparent hover:bg-[#EDE9FE]'
                                    }`}
                                  >
                                    {opt}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}

                          {/* Constipation */}
                          <div className="flex items-center justify-between px-3.5 py-2.5 bg-white rounded-xl border border-[#D5EAE2]">
                            <span className="font-semibold text-slate-700 text-xs sm:text-sm">
                              Constipation?
                            </span>
                            <div className="flex gap-1">
                              {(['Yes', 'No', 'hard stools / on laxative'] as const).map((opt) => (
                                <button
                                  key={opt}
                                  type="button"
                                  onClick={() => updateHistoryChecklist('constipation', opt)}
                                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer border ${
                                    formData.historyChecklist?.constipation === opt
                                      ? 'bg-[#D1FAE5] text-[#065F46] border-[#6EE7B7]'
                                      : 'bg-[#F6F4FB] text-slate-600 border-transparent hover:bg-[#EDE9FE]'
                                  }`}
                                >
                                  {opt === 'hard stools / on laxative' ? 'Hard Stools' : opt}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 4: Examinations, Past Medication, History & Lab Tests and Imaging */}
              {showSection('exams') && (
                <div className="bg-gradient-to-br from-[#FDFCFE] via-white to-[#F4FBFF] rounded-2xl border border-[#E3DCF2] p-5 sm:p-6 shadow-2xs space-y-6">
                  {/* Systemic Examination */}
                  <div className="flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-8">
                    {renderFieldLabelColumn(
                      'Systemic Examination',
                      'Abdomen (P/A), CVS, RS, CNS',
                      () =>
                        setFormData({
                          ...formData,
                          systemicExamination: '',
                          examinationNotes: '',
                        })
                    )}
                    <div className="flex-1 space-y-2">
                      <textarea
                        rows={3}
                        value={formData.systemicExamination || formData.examinationNotes || ''}
                        placeholder="Systemic Examination... (e.g. P/A: Soft, non-tender. Bladder non-palpable. Chest: Clear.)"
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            systemicExamination: e.target.value,
                            examinationNotes: e.target.value,
                          })
                        }
                        className={largeTextareaClass}
                      />
                      <FieldSuggestionsBar
                        field="systemicExamination"
                        currentValue={
                          formData.systemicExamination || formData.examinationNotes || ''
                        }
                        onSelect={(val) =>
                          setFormData({
                            ...formData,
                            systemicExamination: val,
                            examinationNotes: val,
                          })
                        }
                        mode="append-semi"
                      />
                    </div>
                  </div>

                  {/* Genital Examination */}
                  <div className="border-t border-slate-100 pt-5 flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-8">
                    {renderFieldLabelColumn(
                      'Genital Examination',
                      'External genitalia, Testes, Scrotum, Meatus',
                      () => setFormData({ ...formData, genitalExamination: '' })
                    )}
                    <div className="flex-1 space-y-2">
                      <textarea
                        rows={3}
                        value={formData.genitalExamination || ''}
                        placeholder="Genital Examination... (e.g. External genitalia normal, bilateral testes normal, no hydrocele/varicocele)"
                        onChange={(e) =>
                          setFormData({ ...formData, genitalExamination: e.target.value })
                        }
                        className={largeTextareaClass}
                      />
                      <FieldSuggestionsBar
                        field="genitalExamination"
                        currentValue={formData.genitalExamination || ''}
                        onSelect={(val) =>
                          setFormData({ ...formData, genitalExamination: val })
                        }
                        mode="append-semi"
                      />
                    </div>
                  </div>

                  {/* Per Rectal Exam */}
                  <div className="border-t border-slate-100 pt-5 flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-8">
                    {renderFieldLabelColumn(
                      'Per Rectal Exam',
                      'DRE, Prostate grade, consistency, mucosa',
                      () => setFormData({ ...formData, perRectalExam: '' })
                    )}
                    <div className="flex-1 space-y-2">
                      <textarea
                        rows={3}
                        value={formData.perRectalExam || ''}
                        placeholder="Per Rectal Exam (DRE)... (e.g. Grade II benign enlargement, firm, smooth, non-tender, median sulcus felt, rectal mucosa free)"
                        onChange={(e) =>
                          setFormData({ ...formData, perRectalExam: e.target.value })
                        }
                        className={largeTextareaClass}
                      />
                      <FieldSuggestionsBar
                        field="perRectalExam"
                        currentValue={formData.perRectalExam || ''}
                        onSelect={(val) => setFormData({ ...formData, perRectalExam: val })}
                        mode="append-semi"
                      />
                    </div>
                  </div>

                  {/* Past Medication / Comorbidities */}
                  <div className="border-t border-slate-100 pt-5 flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-8">
                    {renderFieldLabelColumn(
                      'Past Medication',
                      'Comorbidities (DM, HTN) & Past Surgeries',
                      () => setFormData({ ...formData, pastMedication: '' })
                    )}
                    <div className="flex-1 space-y-2">
                      <textarea
                        rows={3}
                        value={formData.pastMedication || ''}
                        placeholder="Past Medications, Comorbidities & Past Surgeries... (e.g. K/C/O HTN on Tab Telmisartan 40mg OD; Operated case of Right URSL)"
                        onChange={(e) =>
                          setFormData({ ...formData, pastMedication: e.target.value })
                        }
                        className={largeTextareaClass}
                      />
                      <FieldSuggestionsBar
                        field="pastMedication"
                        currentValue={formData.pastMedication || ''}
                        onSelect={(val) => setFormData({ ...formData, pastMedication: val })}
                        mode="append-semi"
                      />
                    </div>
                  </div>

                  {/* Lab Tests and Imaging */}
                  <div className="border-t border-slate-100 pt-5 flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-8">
                    {renderFieldLabelColumn(
                      'Lab Tests and Imaging',
                      'Date-wise blood/urine reports & USG/CT',
                      () =>
                        setFormData({
                          ...formData,
                          labTestsAndImaging: '',
                          investigationRecords: [],
                        })
                    )}
                    <div className="flex-1 space-y-3">
                      {(() => {
                        const draftConsultation = {
                          ...formData,
                          id: consultationToEdit?.id || 'draft-form',
                          date: formData.date || new Date().toISOString().split('T')[0],
                          patientName: formData.patientName || 'Patient',
                          diagnosis: formData.diagnosis || '',
                          vitals: formData.vitals || {},
                          prescriptions: formData.prescriptions || [],
                          createdAt: Date.now(),
                        } as Consultation;
                        const hasInvTable =
                          buildDateWiseInvestigationTable(
                            draftConsultation,
                            existingConsultations
                          ).rows.length > 0;
                        const updateDraftLabText = (nextText: string) => {
                          const parsed = parseLabTestsAndImagingToItems(
                            nextText,
                            draftConsultation.date
                          );
                          setFormData({
                            ...formData,
                            labTestsAndImaging: nextText,
                            investigationRecords: parsed,
                          });
                        };
                        const handleRemoveParamOnDate = (
                          isoDate: string,
                          parameterName: string
                        ) => {
                          const currentItems =
                            getInvestigationItemsForConsultation(draftConsultation);
                          const filtered = currentItems.filter(
                            (it) =>
                              !(
                                it.reportDate === isoDate &&
                                it.parameterName === parameterName
                              )
                          );
                          setFormData({
                            ...formData,
                            labTestsAndImaging: formatInvestigationItemsToText(filtered),
                            investigationRecords: filtered,
                          });
                        };

                        return (
                          <div className="space-y-3">
                            <div className="flex items-center justify-end gap-2 flex-wrap">
                              {hasInvTable && (
                                <button
                                  type="button"
                                  onClick={() => setShowWrittenLabsEditor((prev) => !prev)}
                                  className="px-3 py-1.5 rounded-xl bg-white hover:bg-sky-50 text-sky-900 border border-sky-300 text-xs font-bold transition-colors cursor-pointer"
                                >
                                  {showWrittenLabsEditor
                                    ? 'Hide Raw Text Editor'
                                    : 'Edit Raw Investigation Text'}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setIsInvestigationModalOpen(true)}
                                className="px-3.5 py-1.5 rounded-xl bg-[#E1F7FC] hover:bg-[#CBEPF8] text-[#1E4D5C] border border-[#A9CFF7] text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                              >
                                <FlaskConical className="w-3.5 h-3.5 text-[#387589]" />
                                <span>+ Add Investigation (Scan Photo)</span>
                              </button>
                            </div>

                            {hasInvTable && (
                              <DateWiseInvestigationTable
                                consultation={draftConsultation}
                                allConsultations={existingConsultations}
                                defaultCollapsed={false}
                                onRemoveParameterOnDate={handleRemoveParamOnDate}
                              />
                            )}

                            {(!hasInvTable || showWrittenLabsEditor) && (
                              <>
                                <textarea
                                  rows={4}
                                  value={formData.labTestsAndImaging || ''}
                                  placeholder="Lab Tests and Imaging... (e.g. 22/11: Sr. PSA - 3.4, Urine Routine - Normal, USG - 120/180cc PVR, Prostate 37.2cc with ML | 08/11: Hb - 14.79, Creat - 0.96, HbA1c - 5.7)"
                                  onChange={(e) => updateDraftLabText(e.target.value)}
                                  className={largeTextareaClass}
                                />
                                <FieldSuggestionsBar
                                  field="labTestsAndImaging"
                                  currentValue={formData.labTestsAndImaging || ''}
                                  onSelect={(val) => updateDraftLabText(val)}
                                  mode="append-semi"
                                />
                              </>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 5: Diagnosis, Advised Investigations & Prescriptions (Rx) */}
              {showSection('rx') && (
                <div className="bg-gradient-to-br from-[#FCFDFD] via-white to-[#FDF4F8] rounded-2xl border border-[#E3DCF2] p-5 sm:p-6 shadow-2xs space-y-6">
                  {/* Diagnosis Row */}
                  <div className="flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-8">
                    {renderFieldLabelColumn(
                      'Diagnosis',
                      'Primary & secondary clinical diagnosis',
                      () => setFormData({ ...formData, diagnosis: '' })
                    )}
                    <div className="flex-1 space-y-2">
                      <input
                        type="text"
                        list="suggest-diagnosis"
                        required
                        value={formData.diagnosis || ''}
                        placeholder="Diagnosis... (e.g. Benign Prostatic Hyperplasia (BPH) with LUTS / UTI with CPPS)"
                        onChange={(e) => setFormData({ ...formData, diagnosis: e.target.value })}
                        className={`${largeInputClass} font-bold text-[#065F46] bg-[#F2FCF7] border-[#86EFAC]`}
                      />
                      <FieldSuggestionsBar
                        field="diagnosis"
                        currentValue={formData.diagnosis || ''}
                        onSelect={(val) => setFormData({ ...formData, diagnosis: val })}
                        mode="append-semi"
                      />
                    </div>
                  </div>

                  {/* Advised Investigations & By When */}
                  <div className="border-t border-slate-100 pt-5 flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-8">
                    {renderFieldLabelColumn(
                      'Tests Requested',
                      'Advised Investigations & By When',
                      () =>
                        setFormData({
                          ...formData,
                          testsRequested: '',
                          investigationsAdvised: '',
                          testsRequestedByWhen: '',
                        })
                    )}
                    <div className="flex-1 space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5">
                        <div className="sm:col-span-9">
                          <input
                            type="text"
                            list="suggest-testsRequested"
                            value={formData.testsRequested || formData.investigationsAdvised || ''}
                            placeholder="Advised Investigations (e.g. Serum PSA, Urine R/M & C/S, USG KUB with PVR, Uroflowmetry)"
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                testsRequested: e.target.value,
                                investigationsAdvised: e.target.value,
                              })
                            }
                            className={largeInputClass}
                          />
                        </div>
                        <div className="sm:col-span-3">
                          <input
                            type="text"
                            list="suggest-testsRequestedByWhen"
                            value={formData.testsRequestedByWhen || ''}
                            placeholder="By When (e.g. Next Visit)"
                            onChange={(e) =>
                              setFormData({ ...formData, testsRequestedByWhen: e.target.value })
                            }
                            className={largeInputClass}
                          />
                        </div>
                      </div>
                      <FieldSuggestionsBar
                        field="testsRequested"
                        currentValue={
                          formData.testsRequested || formData.investigationsAdvised || ''
                        }
                        onSelect={(val) =>
                          setFormData({
                            ...formData,
                            testsRequested: val,
                            investigationsAdvised: val,
                          })
                        }
                        mode="append-comma"
                      />
                    </div>
                  </div>

                  {/* Prescriptions (Rx) Table */}
                  <div className="border-t border-slate-100 pt-5 flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-8">
                    {renderFieldLabelColumn(
                      'Prescriptions (Rx)',
                      'Medicine, Dosage, Timing, Frequency & Duration'
                    )}
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className="text-xs font-semibold text-slate-500">
                          Click a preset medicine below or add rows manually:
                        </span>
                        <button
                          type="button"
                          onClick={addRx}
                          className="text-xs sm:text-sm text-[#3730A3] bg-[#EEF2FF] border border-[#C7D2FE] px-3.5 py-1.5 rounded-xl font-bold flex items-center gap-1.5 hover:bg-[#E0E7FF] transition-colors cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                          Add Medicine Row
                        </button>
                      </div>

                      <MedicinePresetsBar
                        onAddMedicinePreset={addRxPreset}
                        onApplyMedicationGroup={handleApplyMedicationGroup}
                        onOpenMedicineMaster={onOpenMedicineMaster}
                        doctorUid={doctorUid}
                      />

                      <div className="hidden sm:grid sm:grid-cols-12 gap-2.5 px-4 py-2.5 bg-gradient-to-r from-[#EDE9FE] via-[#E1F7FC] to-[#FCE7F3]/75 text-[#2D2A3E] rounded-xl font-bold text-xs border border-[#D6DDF8]">
                        <div className="col-span-1 text-center">#</div>
                        <div className="col-span-3">Medicine</div>
                        <div className="col-span-2">Dosage</div>
                        <div className="col-span-2">When</div>
                        <div className="col-span-1">Frequency</div>
                        <div className="col-span-1">Duration</div>
                        <div className="col-span-2">Notes</div>
                      </div>

                      <div className="space-y-2.5">
                        {(formData.prescriptions || []).map((rx, idx) => (
                          <div
                            key={idx}
                            className="p-3 bg-[#FAF8FE] border border-[#E3DCF2] rounded-xl grid grid-cols-1 sm:grid-cols-12 gap-2.5 text-sm items-center hover:border-[#C4B5FD] transition-colors"
                          >
                            <div className="sm:col-span-1 font-bold text-slate-400 text-center">
                              {idx + 1}
                            </div>
                            <div className="sm:col-span-3">
                              <label className="text-xs text-slate-500 block mb-1 font-medium sm:hidden">
                                Medicine
                              </label>
                              <input
                                type="text"
                                list="suggest-medicine"
                                placeholder="Medicine Name"
                                value={rx.medicine || rx.drugName || ''}
                                onChange={(e) =>
                                  updateRx(idx, {
                                    medicine: e.target.value,
                                    drugName: e.target.value,
                                  })
                                }
                                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="text-xs text-slate-500 block mb-1 font-medium sm:hidden">
                                Dosage
                              </label>
                              <input
                                type="text"
                                list="suggest-dosage"
                                placeholder="e.g. 0.4mg / 5mg"
                                value={rx.dosage || rx.dosageStrength || ''}
                                onChange={(e) =>
                                  updateRx(idx, {
                                    dosage: e.target.value,
                                    dosageStrength: e.target.value,
                                  })
                                }
                                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="text-xs text-slate-500 block mb-1 font-medium sm:hidden">
                                When
                              </label>
                              <input
                                type="text"
                                list="suggest-when"
                                placeholder="After food / HS"
                                value={rx.when || rx.timing || ''}
                                onChange={(e) =>
                                  updateRx(idx, {
                                    when: e.target.value,
                                    timing: e.target.value,
                                  })
                                }
                                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                              />
                            </div>
                            <div className="sm:col-span-1">
                              <label className="text-xs text-slate-500 block mb-1 font-medium sm:hidden">
                                Frequency
                              </label>
                              <input
                                type="text"
                                list="suggest-frequency"
                                placeholder="1-0-1"
                                value={rx.frequency || ''}
                                onChange={(e) => updateRx(idx, { frequency: e.target.value })}
                                className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                              />
                            </div>
                            <div className="sm:col-span-1">
                              <label className="text-xs text-slate-500 block mb-1 font-medium sm:hidden">
                                Duration
                              </label>
                              <input
                                type="text"
                                list="suggest-duration"
                                placeholder="1 Month"
                                value={rx.duration || ''}
                                onChange={(e) => updateRx(idx, { duration: e.target.value })}
                                className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                              />
                            </div>
                            <div className="sm:col-span-2 flex items-center gap-1.5">
                              <input
                                type="text"
                                list="suggest-rxNotes"
                                placeholder="Notes"
                                value={rx.notes || rx.instructions || ''}
                                onChange={(e) =>
                                  updateRx(idx, {
                                    notes: e.target.value,
                                    instructions: e.target.value,
                                  })
                                }
                                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                              />
                              <button
                                type="button"
                                onClick={() => removeRx(idx)}
                                className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg shrink-0 cursor-pointer"
                                title="Remove medicine row"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 6: Plan, Advice, Diet, Follow-Up & Referral */}
              {showSection('plan') && (
                <div className="bg-gradient-to-br from-[#FBFDFF] via-white to-[#F4FBF8] rounded-2xl border border-[#D5EAE2] p-5 sm:p-6 shadow-2xs space-y-6">
                  {/* Assessment / Plan */}
                  <div className="flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-8">
                    {renderFieldLabelColumn(
                      'Assessment / Plan',
                      'Surgical or medical plan of care',
                      () => setFormData({ ...formData, assessmentPlan: '' })
                    )}
                    <div className="flex-1 space-y-2">
                      <textarea
                        rows={3}
                        value={formData.assessmentPlan || ''}
                        placeholder="Assessment / Plan... (e.g. Initiate medical management for BPH; Review with Uroflowmetry & PSA; Plan Cystoscopy / TURP)"
                        onChange={(e) =>
                          setFormData({ ...formData, assessmentPlan: e.target.value })
                        }
                        className={largeTextareaClass}
                      />
                      <FieldSuggestionsBar
                        field="assessmentPlan"
                        currentValue={formData.assessmentPlan || ''}
                        onSelect={(val) => setFormData({ ...formData, assessmentPlan: val })}
                        mode="append-semi"
                      />
                    </div>
                  </div>

                  {/* Advice */}
                  <div className="border-t border-slate-100 pt-5 flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-8">
                    {renderFieldLabelColumn('Advice', 'Clinical instructions for patient', () =>
                      setFormData({ ...formData, advice: '' })
                    )}
                    <div className="flex-1 space-y-2">
                      <textarea
                        rows={3}
                        value={formData.advice || formData.adviceAndDiet || ''}
                        placeholder="Advice... (e.g. Plenty of oral fluids 2.5–3 L/day, sitz bath twice daily, avoid straining)"
                        onChange={(e) => setFormData({ ...formData, advice: e.target.value })}
                        className={largeTextareaClass}
                      />
                      <FieldSuggestionsBar
                        field="advice"
                        currentValue={formData.advice || formData.adviceAndDiet || ''}
                        onSelect={(val) => setFormData({ ...formData, advice: val })}
                        mode="append-semi"
                      />
                    </div>
                  </div>

                  {/* Diet and Exercise */}
                  <div className="border-t border-slate-100 pt-5 flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-8">
                    {renderFieldLabelColumn(
                      'Diet and Exercise',
                      'Fluid intake & lifestyle instructions',
                      () => setFormData({ ...formData, dietAndExercise: '' })
                    )}
                    <div className="flex-1 space-y-2">
                      <textarea
                        rows={2}
                        value={formData.dietAndExercise || ''}
                        placeholder="Diet and Exercise... (e.g. Restrict fluids after 7 PM, low-salt diet, avoid caffeine/alcohol)"
                        onChange={(e) =>
                          setFormData({ ...formData, dietAndExercise: e.target.value })
                        }
                        className={largeTextareaClass}
                      />
                      <FieldSuggestionsBar
                        field="dietAndExercise"
                        currentValue={formData.dietAndExercise || ''}
                        onSelect={(val) => setFormData({ ...formData, dietAndExercise: val })}
                        mode="append-semi"
                      />
                    </div>
                  </div>

                  {/* Next Visit, Admission Advice & Treating Doctor */}
                  <div className="border-t border-slate-100 pt-5 flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-8">
                    {renderFieldLabelColumn(
                      'Follow-Up & Referral',
                      'Next Visit, Admission & Referred To'
                    )}
                    <div className="flex-1 space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                        <div className="sm:col-span-5">
                          <label className="block text-xs font-bold text-slate-600 mb-1.5">
                            Next Visit / Follow-Up
                          </label>
                          <input
                            type="text"
                            list="suggest-nextVisit"
                            value={formData.nextVisit || formData.followUpDate || ''}
                            placeholder="e.g. After 15 Days / 1 Month"
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                nextVisit: e.target.value,
                                followUpDate: e.target.value,
                              })
                            }
                            className={largeInputClass}
                          />
                          <FieldSuggestionsBar
                            field="nextVisit"
                            currentValue={formData.nextVisit || formData.followUpDate || ''}
                            onSelect={(val) =>
                              setFormData({
                                ...formData,
                                nextVisit: val,
                                followUpDate: val,
                              })
                            }
                            mode="replace"
                          />
                        </div>
                        <div className="sm:col-span-3">
                          <label className="block text-xs font-bold text-slate-600 mb-1.5">
                            Admission Advised?
                          </label>
                          <div className="flex gap-2 h-[46px]">
                            {(['Yes', 'No'] as const).map((opt) => (
                              <button
                                key={opt}
                                type="button"
                                onClick={() =>
                                  setFormData({ ...formData, admissionAdvice: opt })
                                }
                                className={`flex-1 rounded-xl text-sm font-bold border transition-colors cursor-pointer ${
                                  formData.admissionAdvice === opt
                                    ? 'bg-[#D1FAE5] text-[#065F46] border-[#6EE7B7]'
                                    : 'bg-white text-slate-700 border-[#D8DDF0] hover:bg-[#F6F3FB]'
                                }`}
                              >
                                {opt}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="sm:col-span-4">
                          <label className="block text-xs font-bold text-slate-600 mb-1.5">
                            Treating Doctor
                          </label>
                          <input
                            type="text"
                            list="suggest-doctorName"
                            value={formData.doctorName || ''}
                            placeholder="Attending Physician"
                            onChange={(e) =>
                              setFormData({ ...formData, doctorName: e.target.value })
                            }
                            className={largeInputClass}
                          />
                        </div>
                      </div>

                      {/* Referred To */}
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2">
                        <input
                          type="text"
                          list="suggest-referredDoctor"
                          placeholder="Referred To: Dr. Name"
                          value={formData.referredTo?.doctorName || ''}
                          onChange={(e) => updateReferredTo('doctorName', e.target.value)}
                          className={largeInputClass}
                        />
                        <input
                          type="text"
                          list="suggest-referredSpeciality"
                          placeholder="Speciality (e.g. Nephrology)"
                          value={formData.referredTo?.speciality || ''}
                          onChange={(e) => updateReferredTo('speciality', e.target.value)}
                          className={largeInputClass}
                        />
                        <input
                          type="text"
                          placeholder="Referral Phone No"
                          value={formData.referredTo?.phoneNo || ''}
                          onChange={(e) => updateReferredTo('phoneNo', e.target.value)}
                          className={largeInputClass}
                        />
                        <input
                          type="email"
                          placeholder="Referral Email"
                          value={formData.referredTo?.email || ''}
                          onChange={(e) => updateReferredTo('email', e.target.value)}
                          className={largeInputClass}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 7: Operation Theatre (OT) Notes — Unified OPD Pastel Surgical Record */}
              {showSection('ot') && (
                <div className="bg-white rounded-2xl border border-[#DDD6FE] shadow-2xs overflow-hidden divide-y divide-[#EFEBF9]">
                  {/* Pastel Surgical Sheet Header Bar with MedScribe Logo */}
                  <div className="px-5 sm:px-7 py-4 bg-gradient-to-r from-[#FFFBEB] via-[#F6F3FF] to-[#F0F8FF] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <MedScribeLogo variant="icon" size="sm" />
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm sm:text-base font-bold text-slate-900">
                            Operation Theatre (OT) Operative Note
                          </h3>
                          <span className="text-xs font-mono font-semibold text-amber-800">
                            · Surgical Record
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5">
                          Record operative findings, apply 1-click urology templates, and attach
                          surgical diagrams locally.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">

                      {(hasOtNotesData(formData.otNotes) || otProceduresList.length > 1) && (
                        <button
                          type="button"
                          onClick={handleAddNewOtProcedureSlot}
                          className="px-3 py-2 rounded-xl bg-[#FEF3C7] hover:bg-[#FDE68A] text-amber-950 border border-[#FCD34D] text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                          title="Add another surgical procedure to this patient's record"
                        >
                          <Plus className="w-3.5 h-3.5 text-amber-800" />
                          <span>Add Procedure</span>
                        </button>
                      )}

                      {hasOtNotesData(formData.otNotes) && (
                        <button
                          type="button"
                          onClick={() => handleRemoveOtProcedureSlot(activeOtProcIndex)}
                          className="px-3 py-2 rounded-xl bg-[#FFF1F2] hover:bg-[#FFE4E6] text-rose-800 border border-[#FECDD3] text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap"
                        >
                          {otProceduresList.length > 1 ? 'Remove' : 'Clear'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Quick 1-Click Urology OT Templates Bar */}
                  <div className="px-5 sm:px-7 py-3 bg-[#FFFBEB]/60 flex flex-wrap items-center gap-2">
                    <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-950 mr-1 whitespace-nowrap">
                      <Scissors className="w-3.5 h-3.5 text-amber-800" />
                      <span>1-Click Urology Templates:</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {UROLOGY_OT_TEMPLATES.map((tpl) => (
                        <button
                          key={tpl.id}
                          type="button"
                          onClick={() => applyOtTemplate(tpl.id)}
                          className="px-2.5 py-1 rounded-lg border border-[#FDE68A] bg-white hover:bg-[#FEF3C7] hover:border-[#FCD34D] text-[11px] font-semibold text-amber-950 transition-colors cursor-pointer whitespace-nowrap"
                          title={`Auto-fill ${tpl.label} findings, steps & post-op orders`}
                        >
                          + {tpl.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Multi-Procedure Switcher Bar when patient has multiple OT procedures */}
                  {otProceduresList.length > 1 && (
                    <div className="px-5 sm:px-7 py-2.5 bg-slate-50/50 flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-violet-800 mr-1">
                        Procedures ({otProceduresList.length}):
                      </span>
                      {otProceduresList.map((proc, pIdx) => {
                        const isCurrent = pIdx === activeOtProcIndex;
                        const procTitle = (proc.procedureName || '').trim() || 'New Procedure';
                        const procDate = proc.surgeryDate || formData.date || '';
                        return (
                          <button
                            key={proc.id || pIdx}
                            type="button"
                            onClick={() => handleSelectOtProcedureSlot(pIdx)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border ${
                              isCurrent
                                ? 'bg-violet-700 text-white border-violet-700 shadow-2xs'
                                : 'bg-white hover:bg-[#F6F3FF] text-slate-700 border-[#DFD8F0]'
                            }`}
                          >
                            <span className="truncate max-w-[220px]">
                              #{pIdx + 1}: {procDate ? `${procDate} — ` : ''}
                              {procTitle}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Form Fields Body */}
                  <div className="p-5 sm:p-7 space-y-6">
                    {/* Patient Identity */}
                    <div className="flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-8 pb-6 border-b border-slate-100">
                      {renderFieldLabelColumn(
                        'Patient Identity',
                        'Demographics (auto-links to existing OPD patient history)'
                      )}
                      <div className="flex-1">
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5">
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                              Salutation
                            </label>
                            <select
                              value={formData.salutation || 'Mr.'}
                              onChange={(e) =>
                                setFormData({ ...formData, salutation: e.target.value })
                              }
                              className={largeInputClass}
                            >
                              <option value="Mr.">Mr.</option>
                              <option value="Ms.">Ms.</option>
                              <option value="Mrs.">Mrs.</option>
                              <option value="Dr.">Dr.</option>
                              <option value="Master">Master</option>
                            </select>
                          </div>
                          <div className="sm:col-span-4">
                            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                              Patient Name *
                            </label>
                            <input
                              type="text"
                              required
                              list="ot-existing-patients-list"
                              value={formData.patientName || ''}
                              onChange={(e) => {
                                const typedName = e.target.value;
                                const match = existingConsultations.find(
                                  (ex) =>
                                    (ex.patientName || '').trim().toLowerCase() ===
                                    typedName.trim().toLowerCase()
                                );
                                if (match) {
                                  setFormData((prev) => ({
                                    ...prev,
                                    patientName: typedName,
                                    salutation: match.salutation || prev.salutation,
                                    age: prev.age || match.age || '',
                                    gender: match.gender || prev.gender || 'M',
                                    phoneNumber: prev.phoneNumber || match.phoneNumber || '',
                                    opdNo: prev.opdNo || cleanExplicitOpdNo(match.opdNo) || '',
                                  }));
                                } else {
                                  setFormData({ ...formData, patientName: typedName });
                                }
                              }}
                              placeholder="Type or select OPD patient"
                              className={`${largeInputClass} font-semibold text-slate-900`}
                            />
                            <datalist id="ot-existing-patients-list">
                              {Array.from(
                                new Set(
                                  existingConsultations
                                    .map((c) => (c.patientName || '').trim())
                                    .filter(Boolean)
                                )
                              ).map((pName) => (
                                <option key={pName} value={pName} />
                              ))}
                            </datalist>
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                              Age
                            </label>
                            <input
                              type="text"
                              value={formData.age || ''}
                              onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                              placeholder="e.g. 64 Y"
                              className={largeInputClass}
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                              Sex
                            </label>
                            <select
                              value={formData.gender || 'M'}
                              onChange={(e) =>
                                setFormData({ ...formData, gender: e.target.value as any })
                              }
                              className={`${largeInputClass} font-medium`}
                            >
                              <option value="M">Male (M)</option>
                              <option value="F">Female (F)</option>
                              <option value="Other">Other</option>
                            </select>
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                              OPD / UHID No.
                            </label>
                            <input
                              type="text"
                              value={formData.opdNo || ''}
                              onChange={(e) => setFormData({ ...formData, opdNo: e.target.value })}
                              placeholder="Optional"
                              className={`${largeInputClass} font-mono`}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* OT Row 1: Surgery Date, Time & Hospital / Freelance Centre */}
                    <div className="flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-8">
                      {renderFieldLabelColumn(
                        'Surgery Date & Centre',
                        'Date, time & surgical centre'
                      )}
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-12 gap-3.5">
                        <div className="sm:col-span-3">
                          <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                            Date of Surgery
                          </label>
                          <input
                            type="date"
                            value={formData.otNotes?.surgeryDate || formData.date || ''}
                            onChange={(e) => updateOtNotes('surgeryDate', e.target.value)}
                            className={`${largeInputClass} font-medium`}
                          />
                        </div>
                        <div className="sm:col-span-3">
                          <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                            Time / Duration
                          </label>
                          <input
                            type="text"
                            value={formData.otNotes?.surgeryTime || ''}
                            onChange={(e) => updateOtNotes('surgeryTime', e.target.value)}
                            placeholder="e.g. 10:30 AM (45 mins)"
                            className={largeInputClass}
                          />
                        </div>
                        <div className="sm:col-span-6">
                          <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-slate-500" />
                            <span>Hospital / Surgical Centre</span>
                          </label>
                          <input
                            type="text"
                            value={formData.otNotes?.hospitalName || ''}
                            onChange={(e) => updateOtNotes('hospitalName', e.target.value)}
                            placeholder="e.g. Shatayu Hospital / City Superspeciality Hospital"
                            className={largeInputClass}
                          />
                        </div>
                      </div>
                    </div>

                    {/* OT Row 2: Procedure Done, Quick Templates & Pre/Post-Op Diagnosis */}
                    <div className="border-t border-slate-100 pt-6 flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-8">
                      {renderFieldLabelColumn(
                        'Procedure & Diagnosis',
                        'Operation performed, quick templates & pre/post-op diagnosis',
                        () => {
                          updateOtNotes('procedureName', '');
                          updateOtNotes('preOpDiagnosis', '');
                          updateOtNotes('postOpDiagnosis', '');
                        }
                      )}
                      <div className="flex-1 space-y-3.5">
                        <div>
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                            <label className="text-xs font-semibold text-slate-800">
                              Operation / Procedure Performed *
                            </label>
                            <select
                              value=""
                              onChange={(e) => {
                                if (e.target.value) applyOtTemplate(e.target.value);
                              }}
                              className="px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-white text-xs font-medium text-slate-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                              title="Auto-fill procedure steps, findings, and post-op orders from a standard Urology OT template"
                            >
                              <option value="">Insert Urology OT Template...</option>
                              {UROLOGY_OT_TEMPLATES.map((tpl) => (
                                <option key={tpl.id} value={tpl.id}>
                                  {tpl.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <input
                            type="text"
                            value={formData.otNotes?.procedureName || ''}
                            onChange={(e) => updateOtNotes('procedureName', e.target.value)}
                            placeholder="e.g. Right URSL + Holmium Laser Lithotripsy + 5Fr DJ Stenting"
                            className={`${largeInputClass} font-semibold text-slate-900 border-slate-300 focus:border-teal-600`}
                          />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                              Pre-Operative Diagnosis
                            </label>
                            <input
                              type="text"
                              value={formData.otNotes?.preOpDiagnosis || formData.diagnosis || ''}
                              onChange={(e) => updateOtNotes('preOpDiagnosis', e.target.value)}
                              placeholder="e.g. Right Lower Ureteric Calculus (9 mm)"
                              className={largeInputClass}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                              Post-Operative Diagnosis
                            </label>
                            <input
                              type="text"
                              value={formData.otNotes?.postOpDiagnosis || ''}
                              onChange={(e) => updateOtNotes('postOpDiagnosis', e.target.value)}
                              placeholder="e.g. Right Lower Ureteric Calculus — Cleared"
                              className={largeInputClass}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* OT Row 3: Operating Team, Anaesthesia & Position */}
                    <div className="border-t border-slate-100 pt-6 flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-8">
                      {renderFieldLabelColumn(
                        'OT Team & Anaesthesia',
                        'Surgeon, assistant, anaesthetist, anaesthesia & position'
                      )}
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3.5">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                            Operating Surgeon
                          </label>
                          <input
                            type="text"
                            value={formData.otNotes?.surgeonName || formData.doctorName || ''}
                            onChange={(e) => updateOtNotes('surgeonName', e.target.value)}
                            placeholder="Operating Surgeon"
                            className={largeInputClass}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                            Assistant
                          </label>
                          <input
                            type="text"
                            value={formData.otNotes?.assistantName || ''}
                            onChange={(e) => updateOtNotes('assistantName', e.target.value)}
                            placeholder="Assistant Name"
                            className={largeInputClass}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                            Anaesthetist
                          </label>
                          <input
                            type="text"
                            value={formData.otNotes?.anaesthetistName || ''}
                            onChange={(e) => updateOtNotes('anaesthetistName', e.target.value)}
                            placeholder="Dr. Anaesthetist"
                            className={largeInputClass}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                            Anaesthesia
                          </label>
                          <input
                            type="text"
                            value={formData.otNotes?.anaesthesiaType || ''}
                            onChange={(e) => updateOtNotes('anaesthesiaType', e.target.value)}
                            placeholder="Spinal (SA) / GA / Local"
                            className={largeInputClass}
                          />
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {['Spinal (SA)', 'GA', 'Local', 'Epidural'].map((opt) => (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => updateOtNotes('anaesthesiaType', opt)}
                                className={`px-2 py-0.5 rounded-md text-[10.5px] font-semibold border transition-colors cursor-pointer ${
                                  (formData.otNotes?.anaesthesiaType || '').trim().toLowerCase() ===
                                  opt.toLowerCase()
                                    ? 'bg-violet-700 text-white border-violet-700'
                                    : 'bg-[#FAF8F5] hover:bg-[#EFEBF9] text-slate-700 border-[#DFD8F0]'
                                }`}
                              >
                                {opt}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                            Position
                          </label>
                          <input
                            type="text"
                            value={formData.otNotes?.patientPosition || ''}
                            onChange={(e) => updateOtNotes('patientPosition', e.target.value)}
                            placeholder="Lithotomy / Prone / Supine"
                            className={largeInputClass}
                          />
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {['Lithotomy', 'Supine', 'Prone', 'Flank'].map((opt) => (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => updateOtNotes('patientPosition', opt)}
                                className={`px-2 py-0.5 rounded-md text-[10.5px] font-semibold border transition-colors cursor-pointer ${
                                  (formData.otNotes?.patientPosition || '').trim().toLowerCase() ===
                                  opt.toLowerCase()
                                    ? 'bg-violet-700 text-white border-violet-700'
                                    : 'bg-[#FAF8F5] hover:bg-[#EFEBF9] text-slate-700 border-[#DFD8F0]'
                                }`}
                              >
                                {opt}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* OT Row 4: Intra-Operative Findings */}
                    <div className="border-t border-[#EFEBF9] pt-6 flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-8">
                      {renderFieldLabelColumn(
                        'Intra-Op Findings',
                        'Cystoscopy / ureteroscopy / anatomical findings',
                        () => updateOtNotes('operativeFindings', '')
                      )}
                      <div className="flex-1 space-y-1.5">
                        <textarea
                          rows={3}
                          value={formData.otNotes?.operativeFindings || ''}
                          onChange={(e) => updateOtNotes('operativeFindings', e.target.value)}
                          placeholder="e.g. Anterior urethra normal, prostate ~65g with kissing lateral lobes & median lobe, bilateral UO normal..."
                          className={largeTextareaClass}
                        />
                      </div>
                    </div>

                    {/* OT Row 5: Operative Steps / Procedure Notes */}
                    <div className="border-t border-[#EFEBF9] pt-6 flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-8">
                      {renderFieldLabelColumn(
                        'Operative Steps',
                        'Step-by-step surgical procedure notes',
                        () => updateOtNotes('operativeSteps', '')
                      )}
                      <div className="flex-1 space-y-1.5">
                        <textarea
                          rows={6}
                          value={formData.otNotes?.operativeSteps || ''}
                          onChange={(e) => updateOtNotes('operativeSteps', e.target.value)}
                          placeholder="Detailed step-by-step operative notes..."
                          className={largeTextareaClass}
                        />
                      </div>
                    </div>

                    {/* OT Row 5B: Hand-Drawn Surgical Sketch */}
                    <div className="border-t border-slate-100 pt-6 flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-8">
                      {renderFieldLabelColumn(
                        'Surgical Sketch',
                        'Clean ink diagram (~5–8 KB) preserving pen strokes without shadows',
                        formData.otNotes?.handDrawnDiagrams?.length
                          ? () => updateOtHandDrawnDiagrams([])
                          : undefined
                      )}
                      <div className="flex-1">
                        <div className="p-4 rounded-xl bg-slate-50/70 border border-slate-200 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                              <ImageIcon className="w-4 h-4 text-slate-500" />
                              <span>Hand-Drawn Operative Diagram</span>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                ref={otDiagramFileInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  handleUploadOtHandDrawnDiagramFiles(e.target.files);
                                  e.target.value = '';
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => otDiagramFileInputRef.current?.click()}
                                className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                              >
                                <Upload className="w-3.5 h-3.5" />
                                <span>Upload Sketch</span>
                              </button>
                            </div>
                          </div>

                          {otDiagramStatusMsg && (
                            <p className="text-[11px] font-medium text-teal-800 bg-teal-50 border border-teal-200 rounded-lg px-2.5 py-1.5">
                              {otDiagramStatusMsg}
                            </p>
                          )}

                          {Array.isArray(formData.otNotes?.handDrawnDiagrams) &&
                          formData.otNotes!.handDrawnDiagrams!.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                              {formData.otNotes!.handDrawnDiagrams!.slice(0, 1).map((diagUrl, dIdx) => {
                                const approxKb = Math.max(
                                  1,
                                  Math.round((diagUrl.length * 0.75) / 1024)
                                );
                                return (
                                  <div
                                    key={dIdx}
                                    className="relative rounded-xl border border-slate-200 bg-white p-2.5 flex flex-col gap-1.5"
                                  >
                                    <div className="flex items-center justify-between text-[11px] font-medium text-slate-600 px-1">
                                      <span>Operative Sketch (~{approxKb} KB)</span>
                                      <button
                                        type="button"
                                        onClick={() => updateOtHandDrawnDiagrams([])}
                                        className="text-slate-400 hover:text-rose-600 cursor-pointer"
                                        title="Remove diagram"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                    <img
                                      src={diagUrl}
                                      alt="OT Hand-Drawn Diagram"
                                      className="w-full h-48 object-contain rounded-lg bg-white border border-slate-100 p-1"
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-xs text-slate-500">
                              No diagram attached. Upload a surgical sketch image from your computer to include it on the printed OT sheet.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* OT Row 6: Foley / DJ Stent / Drain / Blood Loss / Specimen */}
                    <div className="border-t border-slate-100 pt-6 flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-8">
                      {renderFieldLabelColumn(
                        'Stent, Catheter & Specimen',
                        'Foley, DJ stent, blood loss & HPE/stone specimen'
                      )}
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                            Catheter / DJ Stent / Drain
                          </label>
                          <input
                            type="text"
                            value={formData.otNotes?.catheterOrStentDetails || ''}
                            onChange={(e) => updateOtNotes('catheterOrStentDetails', e.target.value)}
                            placeholder="e.g. 5Fr/26cm DJ Stent; 16Fr Foley"
                            className={largeInputClass}
                          />
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="block text-xs font-semibold text-slate-600">
                              Blood Loss &amp; Complications
                            </label>
                            <button
                              type="button"
                              onClick={() =>
                                updateOtNotes('estimatedBloodLoss', 'Minimal (< 30 ml), Uneventful')
                              }
                              className="text-[10.5px] font-semibold text-violet-700 hover:underline cursor-pointer"
                            >
                              + Minimal &amp; Uneventful
                            </button>
                          </div>
                          <input
                            type="text"
                            value={formData.otNotes?.estimatedBloodLoss || ''}
                            onChange={(e) => updateOtNotes('estimatedBloodLoss', e.target.value)}
                            placeholder="e.g. Minimal (< 30 ml), Uneventful"
                            className={largeInputClass}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                            Specimen Sent
                          </label>
                          <input
                            type="text"
                            value={formData.otNotes?.specimenSent || ''}
                            onChange={(e) => updateOtNotes('specimenSent', e.target.value)}
                            placeholder="e.g. Prostatic chips for HPE"
                            className={largeInputClass}
                          />
                        </div>
                      </div>
                    </div>

                    {/* OT Row 7: Post-Operative Orders & Freelance Remarks */}
                    <div className="border-t border-[#EFEBF9] pt-6 flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-8">
                      {renderFieldLabelColumn(
                        'Post-Op Orders & Remarks',
                        'Ward orders, implants & surgical notes',
                        () => {
                          updateOtNotes('postOpOrders', '');
                          updateOtNotes('freelanceNotes', '');
                        }
                      )}
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="p-3.5 rounded-xl bg-[#F2FBF7] border border-[#BEEAD8] space-y-1.5">
                          <label className="block text-xs font-bold text-emerald-950">
                            Post-Operative Orders &amp; Ward Advice
                          </label>
                          <textarea
                            rows={4}
                            value={formData.otNotes?.postOpOrders || ''}
                            onChange={(e) => updateOtNotes('postOpOrders', e.target.value)}
                            placeholder="e.g. NBM for 4 hrs, IV fluids, IV antibiotics, continuous bladder irrigation..."
                            className={largeTextareaClass}
                          />
                        </div>
                        <div className="p-3.5 rounded-xl bg-[#FAF8F5] border border-[#E6E0F0] space-y-1.5">
                          <label className="block text-xs font-bold text-slate-800">
                            Implants / Consumables &amp; Remarks
                          </label>
                          <textarea
                            rows={4}
                            value={formData.otNotes?.freelanceNotes || ''}
                            onChange={(e) => updateOtNotes('freelanceNotes', e.target.value)}
                            placeholder="e.g. Stent / laser fiber lot details, referring doctor, or freelance notes..."
                            className={largeTextareaClass}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Global Datalist Autocomplete Options */}
              <GlobalFieldDatalists refreshKey={activeTab} />
            </div>
          </div>

          {/* FULL-WIDTH PINNED BOTTOM ACTION BAR IN PASTEL PALETTE */}
          <div className="px-4 sm:px-8 py-3.5 bg-gradient-to-r from-[#F4F1FA] via-[#FDFBF9] to-[#EBFBF3] border-t border-[#D6DDF8] flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-xs">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs sm:text-sm text-[#6B647B]">
                Date: <strong className="text-[#2D2A3E]">{formData.date}</strong> &bull; Sheet:{' '}
                <strong className="text-[#4B6385]">[{monthLabel}]</strong>
              </span>

              {consultationToEdit && onDelete && (
                <button
                  type="button"
                  onClick={() => {
                    onDelete(consultationToEdit.id);
                    onClose();
                  }}
                  className="px-3.5 py-2 text-xs sm:text-sm font-semibold text-[#9F1239] bg-[#FFF1F2] hover:bg-[#FFE4E6] rounded-xl border border-[#FECDD3] flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Delete this consultation entry"
                >
                  <Trash2 className="w-4 h-4 text-rose-500" />
                  <span>Delete Entry</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              {/* Preferred Language Selector */}
              <select
                value={formData.preferredLanguage || 'English'}
                onChange={(e) =>
                  setFormData({ ...formData, preferredLanguage: e.target.value })
                }
                className="px-3 py-2 text-xs sm:text-sm font-semibold text-[#3B2E68] bg-white/95 border border-[#D6DDF8] rounded-xl outline-none focus:border-[#A78BFA]"
                title="Preferred Patient Instructions Language"
              >
                <option value="English">English</option>
                <option value="Hindi">Hindi</option>
                <option value="Marathi">Marathi</option>
                <option value="Punjabi">Punjabi</option>
                <option value="Bengali">Bengali</option>
                <option value="Tamil">Tamil</option>
                <option value="Other">Other</option>
              </select>

              <button
                type="button"
                onClick={() => setIsInvestigationModalOpen(true)}
                className="px-4 py-2.5 text-xs sm:text-sm font-bold rounded-xl border border-[#C4B5FD] bg-[#EDE9FE] hover:bg-[#DDD6FE] text-violet-950 flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Manually enter lab reports & imaging studies"
              >
                <FlaskConical className="w-4 h-4 text-violet-700" />
                <span>Add Investigation</span>
              </button>

              <button
                type="button"
                onClick={() => setIsPrintModalOpen(true)}
                className="px-4 py-2.5 text-xs sm:text-sm font-bold rounded-xl border border-[#FCD34D] bg-[#FEF3C7] hover:bg-[#FDE68A] text-amber-950 flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                title="Preview and Print Prescription & Case Sheet"
              >
                <Printer className="w-4 h-4 text-amber-800" />
                <span>Preview / Print</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 text-xs sm:text-sm font-semibold text-[#6B647B] hover:text-[#2D2A3E] hover:bg-white/80 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>

              {formValidationError && (
                <div className="px-3 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                  <span>{formValidationError}</span>
                </div>
              )}

              <button
                type="submit"
                className="px-6 py-2.5 bg-[#D1FAE5] hover:bg-[#A7F3D0] text-[#065F46] border border-[#6EE7B7] font-extrabold text-xs sm:text-sm rounded-xl shadow-xs flex items-center gap-2 transition-all cursor-pointer"
              >
                <Check className="w-4 h-4 text-[#059669]" />
                <span>
                  {isOtFormMode
                    ? consultationToEdit?.id
                      ? 'Save / Update OT Notes'
                      : 'Save OT Notes Entry'
                    : consultationToEdit?.id
                    ? 'Save / Update Consultation'
                    : 'Save Consultation'}
                </span>
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Manual Investigation Entry Modal */}
      <ManualInvestigationModal
        isOpen={isInvestigationModalOpen}
        onClose={() => setIsInvestigationModalOpen(false)}
        consultation={
          {
            ...formData,
            id: consultationToEdit?.id || 'draft-form',
            date: formData.date || new Date().toISOString().split('T')[0],
            patientName: formData.patientName || 'Patient',
            diagnosis: formData.diagnosis || '',
            vitals: formData.vitals || {},
            prescriptions: formData.prescriptions || [],
            createdAt: Date.now(),
          } as Consultation
        }
        allConsultations={existingConsultations}
        onApplyInvestigations={(updated) => {
          setFormData((prev) => ({
            ...prev,
            labTestsAndImaging: updated.labTestsAndImaging,
            investigationRecords: updated.investigationRecords,
          }));
        }}
      />

      {/* A4 Prescription & Case Sheet Print Preview Modal */}
      <A4PrintModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        consultation={isPrintModalOpen ? buildLiveConsultationObject() : null}
        allConsultations={existingConsultations}
        initialMode="single"
        initialDocType={isOtFormMode ? 'ot' : 'opd'}
        currentDoctor={currentDoctor}
        onEditConsultation={() => setIsPrintModalOpen(false)}
      />
    </div>
  );
};
