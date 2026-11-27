import { Consultation, OtNotes, PrescriptionItem } from '../types/opd';
import {
  cleanExplicitOpdNo,
  formatPatientNameWithSalutation,
} from './investigationUtils';
import {
  getConsultationOtProcedures,
  getPatientConsolidatedTimelineEntries,
  hasOtNotesData,
} from './otNotesUtils';

export const UROWARD_IPD_URL =
  'https://ais-dev-rxkxj6qgh6jirww364i2ar-959911536779.asia-southeast1.run.app/';

export type UroWardProtocolId =
  | ''
  | 'turp_protocol'
  | 'pcnl_protocol'
  | 'ursl_protocol'
  | 'lap_nephrectomy_protocol'
  | 'open_nephrectomy_protocol';

export const UROWARD_PROTOCOL_OPTIONS: { value: UroWardProtocolId; label: string }[] = [
  { value: '', label: 'Auto-detect from Procedure Name' },
  { value: 'turp_protocol', label: 'TURP Protocol' },
  { value: 'pcnl_protocol', label: 'PCNL Protocol' },
  { value: 'ursl_protocol', label: 'URSL Protocol' },
  { value: 'lap_nephrectomy_protocol', label: 'Laparoscopic Nephrectomy Protocol' },
  { value: 'open_nephrectomy_protocol', label: 'Open Nephrectomy Protocol' },
];

export interface UroWardMedicationPayload {
  name: string;
  medicine: string;
  dosage: string;
  frequency: string;
  timing: string;
  duration: string;
  notes: string;
}

export interface UroWardHandoffRecord {
  patientName: string;
  uhid?: string;
  age: string;
  sex: 'Male' | 'Female' | 'Other';
  bedNumber?: string;
  ward?: string;
  bloodGroup?: string;
  diagnosis: string;
  comorbidities?: string;
  allergies?: string;
  doctorName?: string;
  surgeryDate?: string;
  protocolId?: UroWardProtocolId;
  procedureName: string;
  anesthesiaType?: string;
  surgeon?: string;
  assistant?: string;
  durationMins?: string;
  bloodLossMl?: string;
  preOpDiagnosis?: string;
  postOpDiagnosis?: string;
  otFindings?: string;
  otSteps?: string;
  implantsAndDrains?: string;
  postOpOrders?: string;
  medications?: UroWardMedicationPayload[];
}

export interface UroWardHandoffPayload {
  sourceApp: 'MedScribe Pro';
  exportedAt: string;
  patient: {
    fullName: string;
    uhid: string;
    age: string;
    sex: 'Male' | 'Female' | 'Other';
    bedNumber: string;
    ward: string;
    bloodGroup: string;
    diagnosis: string;
    comorbidities: string;
    allergies: string;
    attendingDoctor: string;
    surgeryDate: string;
  };
  protocolId: UroWardProtocolId;
  otNote: {
    procedureName: string;
    surgeryDate: string;
    anesthesiaType: string;
    surgeon: string;
    assistant: string;
    durationMins: string;
    bloodLossMl: string;
    preOpDiagnosis: string;
    postOpDiagnosis: string;
    findings: string;
    procedureSteps: string;
    implantsAndDrains: string;
    postOpOrders: string;
  };
  postOpOrders: string;
  medications: UroWardMedicationPayload[];
}

const LAST_WARD_STORAGE_KEY = 'medscribe_uroward_last_ward_v1';

export function getSavedDefaultWard(): string {
  try {
    const saved = localStorage.getItem(LAST_WARD_STORAGE_KEY);
    if (saved && saved.trim()) return saved.trim();
  } catch {
    // ignore
  }
  return 'Urology Surgical Ward A';
}

export function saveDefaultWard(ward: string): void {
  try {
    if (ward.trim()) {
      localStorage.setItem(LAST_WARD_STORAGE_KEY, ward.trim());
    }
  } catch {
    // ignore
  }
}

export function normalizeSexForUroWard(
  gender?: Consultation['gender'] | string
): 'Male' | 'Female' | 'Other' {
  const g = String(gender || '').trim().toLowerCase();
  if (g === 'f' || g === 'female') return 'Female';
  if (g === 'other' || g === 'o') return 'Other';
  return 'Male';
}

export function detectProtocolFromProcedure(procedureName?: string): UroWardProtocolId {
  const p = String(procedureName || '').toLowerCase();
  if (!p) return '';
  if (/\bturp\b|transurethral resection of prostate/i.test(p)) return 'turp_protocol';
  if (/\bpcnl\b|percutaneous nephrolithotomy/i.test(p)) return 'pcnl_protocol';
  if (/\bursl?\b|\brirs\b|ureteroscopy|ureteroscopic/i.test(p)) return 'ursl_protocol';
  if (/lap(?:aroscopic)?.*nephrectomy|robotic.*nephrectomy/i.test(p)) {
    return 'lap_nephrectomy_protocol';
  }
  if (/nephrectomy/i.test(p)) return 'open_nephrectomy_protocol';
  return '';
}

function mapPrescriptionsToUroWardMeds(
  prescriptions?: PrescriptionItem[]
): UroWardMedicationPayload[] {
  if (!Array.isArray(prescriptions)) return [];
  return prescriptions
    .map((rx) => {
      const medName = String(rx.medicine || rx.drugName || '').trim();
      if (!medName) return null;
      return {
        name: medName,
        medicine: medName,
        dosage: String(rx.dosage || rx.dosageStrength || '').trim(),
        frequency: String(rx.frequency || '').trim(),
        timing: String(rx.when || rx.timing || '').trim(),
        duration: String(rx.duration || '').trim(),
        notes: String(rx.notes || rx.instructions || '').trim(),
      };
    })
    .filter((m): m is UroWardMedicationPayload => m !== null);
}

function findLatestOtNoteForConsultation(
  consultation: Consultation,
  allConsultations: Consultation[] = []
): OtNotes | null {
  const ownProcs = getConsultationOtProcedures(consultation);
  if (ownProcs.length > 0) {
    return ownProcs[ownProcs.length - 1];
  }
  if (hasOtNotesData(consultation) && consultation.otNotes) {
    return consultation.otNotes;
  }
  if (allConsultations.length > 0) {
    const timeline = getPatientConsolidatedTimelineEntries(
      consultation,
      allConsultations,
      'latest-first'
    );
    const latestOtEntry = timeline.find((e) => e.kind === 'ot' && e.otNotes);
    if (latestOtEntry?.otNotes) {
      return latestOtEntry.otNotes;
    }
  }
  return null;
}

function extractNumericText(raw?: string): string {
  const str = String(raw || '').trim();
  if (!str) return '';
  const match = str.match(/\d+(?:\.\d+)?/);
  return match ? match[0] : str;
}

/**
 * Converts a MedScribe Pro Consultation (+ linked OT note if available across the patient's timeline)
 * into a pre-filled UroWardHandoffRecord ready for review or direct handoff.
 */
export function buildUroWardRecordFromConsultation(
  consultation: Consultation,
  allConsultations: Consultation[] = [],
  activeDoctorName?: string
): { record: UroWardHandoffRecord; linkedOtFound: boolean } {
  const latestOt = findLatestOtNoteForConsultation(consultation, allConsultations);
  const fullName = formatPatientNameWithSalutation(
    consultation.salutation,
    consultation.patientName
  );
  const cleanAge = String(consultation.age || '')
    .trim()
    .replace(/\s*(yrs?|years?|y)$/i, '');

  const comorbidityParts = [
    String(consultation.history || '').trim(),
    String(consultation.additionalHistory || '').trim(),
  ].filter(Boolean);
  const uniqueComorbidities = Array.from(new Set(comorbidityParts)).join('; ');

  const implantsParts = [
    String(latestOt?.catheterOrStentDetails || '').trim(),
    String(latestOt?.drainDetails || '').trim(),
    String(latestOt?.implantsOrConsumables || '').trim(),
  ].filter(Boolean);

  const primaryDiagnosis =
    String(consultation.diagnosis || '').trim() ||
    String(latestOt?.postOpDiagnosis || latestOt?.preOpDiagnosis || '').trim();

  const procedureName = String(latestOt?.procedureName || '').trim();
  const attendingDoctor =
    String(consultation.doctorName || '').trim() || String(activeDoctorName || '').trim();

  const postOpOrders =
    String(latestOt?.postOpOrders || '').trim() ||
    [consultation.assessmentPlan, consultation.advice]
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .join('\n');

  const todayIso = new Date().toISOString().slice(0, 10);
  const surgeryDate = String(latestOt?.surgeryDate || '').trim() || todayIso;

  const record: UroWardHandoffRecord = {
    patientName: fullName || consultation.patientName || 'Patient',
    uhid: cleanExplicitOpdNo(consultation.opdNo) || '',
    age: cleanAge,
    sex: normalizeSexForUroWard(consultation.gender),
    bedNumber: '',
    ward: getSavedDefaultWard(),
    bloodGroup: 'Pending',
    diagnosis: primaryDiagnosis,
    comorbidities: uniqueComorbidities,
    allergies: 'No known drug allergies',
    doctorName: attendingDoctor,
    surgeryDate,
    protocolId: detectProtocolFromProcedure(procedureName),
    procedureName,
    anesthesiaType: String(latestOt?.anaesthesiaType || '').trim() || 'Spinal',
    surgeon: String(latestOt?.surgeonName || '').trim() || attendingDoctor,
    assistant: String(latestOt?.assistantName || '').trim(),
    durationMins: extractNumericText(latestOt?.surgeryTime),
    bloodLossMl: extractNumericText(latestOt?.estimatedBloodLoss),
    preOpDiagnosis: String(latestOt?.preOpDiagnosis || '').trim() || primaryDiagnosis,
    postOpDiagnosis: String(latestOt?.postOpDiagnosis || '').trim() || primaryDiagnosis,
    otFindings: String(latestOt?.operativeFindings || '').trim(),
    otSteps: String(latestOt?.operativeSteps || '').trim(),
    implantsAndDrains: implantsParts.join('; '),
    postOpOrders,
    medications: mapPrescriptionsToUroWardMeds(consultation.prescriptions),
  };

  return { record, linkedOtFound: Boolean(latestOt) };
}

export function buildUroWardHandoffPayload(
  record: UroWardHandoffRecord
): UroWardHandoffPayload {
  const defaultDate = record.surgeryDate || new Date().toISOString().slice(0, 10);
  return {
    sourceApp: 'MedScribe Pro',
    exportedAt: new Date().toISOString(),
    patient: {
      fullName: record.patientName,
      uhid: record.uhid || '',
      age: record.age,
      sex: record.sex || 'Male',
      bedNumber: record.bedNumber || '',
      ward: record.ward || 'Urology Surgical Ward A',
      bloodGroup: record.bloodGroup || 'Pending',
      diagnosis: record.diagnosis,
      comorbidities: record.comorbidities || '',
      allergies: record.allergies || 'No known drug allergies',
      attendingDoctor: record.doctorName || '',
      surgeryDate: defaultDate,
    },
    protocolId: record.protocolId || '',
    otNote: {
      procedureName: record.procedureName,
      surgeryDate: defaultDate,
      anesthesiaType: record.anesthesiaType || 'Spinal',
      surgeon: record.surgeon || record.doctorName || '',
      assistant: record.assistant || '',
      durationMins: String(record.durationMins || ''),
      bloodLossMl: String(record.bloodLossMl || ''),
      preOpDiagnosis: record.preOpDiagnosis || record.diagnosis,
      postOpDiagnosis: record.postOpDiagnosis || record.diagnosis,
      findings: record.otFindings || '',
      procedureSteps: record.otSteps || '',
      implantsAndDrains: record.implantsAndDrains || '',
      postOpOrders: record.postOpOrders || '',
    },
    postOpOrders: record.postOpOrders || '',
    medications: record.medications || [],
  };
}

/**
 * UTF-8 safe Base64URL encoding in URL hash (# keeps PHI out of server logs).
 */
export function encodeUroWardHandoffPayload(payload: UroWardHandoffPayload): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let bin = '';
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function buildUroWardHandoffUrl(record: UroWardHandoffRecord): string {
  const payload = buildUroWardHandoffPayload(record);
  const encoded = encodeUroWardHandoffPayload(payload);
  return `${UROWARD_IPD_URL}#medscribe_handoff=${encoded}`;
}

/**
 * Builds the UroWard IPD handoff URL and opens it safely in a new browser tab
 * via a transient anchor click (no window.open dependency), returning the URL.
 */
export function admitPatientToUroWard(record: UroWardHandoffRecord): string {
  const handoffUrl = buildUroWardHandoffUrl(record);
  if (typeof document !== 'undefined') {
    const anchor = document.createElement('a');
    anchor.href = handoffUrl;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }
  return handoffUrl;
}
