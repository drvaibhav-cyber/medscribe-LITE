import { InvestigationItem, OtNotes, PrescriptionItem } from './opd';

export type IpdStatus = 'admitted' | 'discharged';

export type BuiltinSurgicalProtocolId =
  | 'laparoscopic-nephrectomy'
  | 'open-nephrectomy'
  | 'pcnl'
  | 'turp'
  | 'ursl';

export type SurgicalProtocolId = BuiltinSurgicalProtocolId | (string & {});

export interface IpdDailyVitals {
  bp?: string;
  pulse?: string;
  temp?: string;
  spo2?: string;
  respRate?: string;
  painScore?: string;
  intakeMl?: string;
  urineOutputMl?: string;
  drainOutputMl?: string;
  drainCharacter?: string;
}

export interface IpdDailyNote {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // e.g. "08:30 AM"
  podLabel?: string; // e.g. "POD 1" or "Day 2"
  vitals: IpdDailyVitals;
  subjective: string; // Symptoms, pain, oral intake, bowel/flatus, urinary symptoms
  objective: string; // Exam, wound/dressing, catheter/drain/CBI findings
  assessmentPlan: string; // Clinical impression & day's orders/plan
  authorName?: string;
  createdAt: number;
}

export interface IpdMedicationOrder {
  id: string;
  medicine: string;
  dosage: string;
  route: string; // IV, Oral (PO), IM, SC, Topical, Nebulisation
  frequency: string; // 1-0-1 (BD), 1-1-1 (TDS), Q8H, OD, HS, SOS, STAT
  when?: string; // After food (p/c), Before food (a/c), Bedtime (HS), etc.
  startDate: string; // YYYY-MM-DD
  stopDate?: string; // YYYY-MM-DD or review date
  status: 'active' | 'held' | 'stopped';
  notes?: string;
}

export interface IpdMedicationAdminLog {
  id: string;
  medicationId: string;
  medicineName: string;
  dosage?: string;
  route?: string;
  date: string; // YYYY-MM-DD
  timeSlot: string; // Morning, Afternoon, Evening, Night, STAT, or exact time
  status: 'given' | 'held' | 'missed';
  givenBy?: string;
  remarks?: string;
  loggedAt: number;
}

export interface IpdSurgicalProtocolProgress {
  protocolId: SurgicalProtocolId;
  surgeryDate?: string; // YYYY-MM-DD (POD 0)
  checkedItemIds: string[];
  fieldValues: Record<string, string>;
  deviationsNote?: string;
  startedAt: number;
  updatedAt: number;
}

export interface IpdWardTreatmentItem {
  medicine: string;
  dosage: string;
  route: string;
  frequency: string;
  durationOrDates: string;
  notes?: string;
}

export interface IpdDischargeSummary {
  finalDiagnosis: string;
  procedurePerformed: string;
  chiefComplaintsAndHistory: string;
  examinationOnAdmission?: string;
  hospitalCourse: string;
  keyInvestigations: string;
  otNotesSummary?: string;
  treatmentGivenInWard?: IpdWardTreatmentItem[];
  conditionAtDischarge: string;
  dischargeMedications: PrescriptionItem[];
  dietAndActivityAdvice: string;
  redFlagWarnings: string;
  stentOrTubePlan: string;
  followUpPlan: string;
  authorizedBy: string;
  dischargeDate: string; // YYYY-MM-DD
  generatedAt: number;
}

export interface IpdPatientRecord {
  id: string;
  doctorId?: string;
  doctorName?: string;
  department?: string;
  hospitalName?: string;

  ipdNo: string; // IPD / Admission Registration No
  uhid?: string; // Optional UHID / OPD No
  salutation?: string;
  patientName: string;
  age: string;
  gender: 'Male' | 'Female' | 'Other' | 'M' | 'F' | 'Unspecified';
  phoneNumber?: string;
  address?: string;

  wardOrBed: string; // e.g. "Surgical Ward · Bed 4"
  admissionDate: string; // YYYY-MM-DD
  surgeryDate?: string; // YYYY-MM-DD
  dischargeDate?: string; // YYYY-MM-DD
  status: IpdStatus;

  admittingDiagnosis: string;
  clinicalSummary?: string;
  comorbidities?: string;
  allergies?: string;
  attendingConsultant?: string;

  dailyNotes: IpdDailyNote[];
  medications: IpdMedicationOrder[];
  medicationLogs: IpdMedicationAdminLog[];

  labTestsAndImaging?: string;
  investigationRecords: InvestigationItem[];

  otNotes?: OtNotes;
  otProcedures?: OtNotes[];

  surgicalProtocol?: IpdSurgicalProtocolProgress;
  dischargeMedications?: PrescriptionItem[];
  dischargeSummary?: IpdDischargeSummary;

  linkedOpdConsultationId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface IpdSyncQueueItem {
  patientId: string;
  action: 'upsert' | 'delete';
  queuedAt: number;
}
