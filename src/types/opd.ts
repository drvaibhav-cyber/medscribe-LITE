export interface PrescriptionItem {
  medicine: string; // Medicine name
  dosage: string; // e.g. 500mg, 0.4mg, 625mg
  when: string; // After food (p/c), Before food (a/c), Bedtime (HS), With meals
  frequency: string; // 1-0-1 (BD), 1-1-1 (TDS), 1-0-0 (OD), SOS, HS
  duration: string; // e.g. 5 days, 14 days, 1 month
  notes?: string; // Special notes / instructions

  // Aliases for compatibility
  drugName?: string;
  form?: string;
  dosageStrength?: string;
  timing?: string;
  instructions?: string;
}

export interface PatientVitals {
  bp?: string; // e.g. 130/80 mmHg
  pulse?: string; // bpm
  temp?: string; // e.g. 98.6 F
  height?: string; // cm
  weight?: string; // kg
  bmi?: string;
  waist?: string; // cm
  hip?: string; // cm
  waistHipRatio?: string; // Waist/Hip
  spo2?: string; // %
  randomBloodSugar?: string;
  otherVitals?: string;
}

export interface ClinicalHistoryChecklist {
  burning?: 'Yes' | 'No' | '';
  fever?: 'Yes' | 'No' | '';
  hematuria?: 'Yes' | 'No' | '';
  previousRenalCalculi?: 'Yes' | 'No' | '';
  previousSurgery?: 'Yes' | 'No' | '';
  constipation?: 'Yes' | 'No' | 'hard stools / on laxative' | '';
}

export interface IPSSScore {
  // F U N P I S S Clinical Shorthand Table (from Doctor's clinic notes)
  // Left Column:
  frequency?: string; // [F] Frequency (urinate < every 2 hours / Yes / No / value)
  urgency?: string; // [U] Urgency (Yes / No / Only at Night / value)
  nocturia?: string; // [N] Nocturia (times per night / Yes / No / count e.g. 3-4x)
  // Right Column:
  poorFlow?: string; // [P] Poor flow (Yes / No / value)
  poorStream?: string; // [P] Poor stream (alias for poorFlow)
  intermittency?: string; // [I] Intermittency (Yes / No / value)
  straining?: string; // [S] Straining (Yes / No / value)
  incompleteEvacuation?: string; // [S] Sense of incomplete evacuation (Yes / No / value)

  // Additional Clinical Details
  scoreTotal?: string | number;
  qualityOfLife?: string; // Feel about urinary condition rest of life
  hesitancy?: string;
  secondVoid?: string;
  postVoidDribble?: string;
}

export interface ReferralDetails {
  doctorName?: string;
  speciality?: string;
  phoneNo?: string;
  email?: string;
}

export interface OtNotes {
  id?: string; // Unique ID for multi-procedure tracking on a patient record
  surgeryDate?: string; // YYYY-MM-DD (Date of surgery)
  surgeryTime?: string; // e.g. "10:30 AM" or duration
  hospitalName?: string; // Hospital / Nursing Home / Freelance Centre
  procedureName?: string; // Procedure Done e.g. "Bipolar TURP", "Right URSL + DJ Stenting", "Left PCNL"
  preOpDiagnosis?: string; // Pre-operative Diagnosis / Indication
  postOpDiagnosis?: string; // Post-operative Diagnosis
  surgeonName?: string; // Operating Surgeon
  assistantName?: string; // Assistant Surgeon / Inviting Consultant
  anaesthetistName?: string; // Anaesthetist Name
  anaesthesiaType?: string; // e.g. "Spinal Anaesthesia (SA)", "General Anaesthesia (GA)", "Local"
  patientPosition?: string; // e.g. "Lithotomy position", "Prone position", "Supine position"
  operativeFindings?: string; // Intra-operative findings
  operativeSteps?: string; // Detailed Operative Steps / Procedure Description
  intraOpComplications?: string; // e.g. "Nil / Uneventful"
  estimatedBloodLoss?: string; // e.g. "Minimal (< 50 ml)"
  catheterOrStentDetails?: string; // e.g. "20Fr 3-way Foley catheter with continuous irrigation", "5Fr 26cm DJ Stent"
  drainDetails?: string; // e.g. "Nil" or "14Fr Romovac drain in situ"
  specimenSent?: string; // e.g. "Prostatic chips sent for HPE", "Stone sent for FTIR analysis"
  postOpOrders?: string; // Post-operative instructions & IV medications
  implantsOrConsumables?: string; // Laser / DJ Stent / Mesh / Consumables used
  freelanceNotes?: string; // Freelance hospital reference / remarks
  handDrawnDiagrams?: string[]; // Ultra-low-storage clean vector/ink data URL (~3-8 KB) of the single hand-drawn surgical diagram kept as-is
  hasHandDrawnDiagram?: boolean; // Whether a hand-drawn anatomical/surgical diagram was detected on the OT sheet
  handDrawnDiagramBox2d?: number[]; // [ymin, xmin, ymax, xmax] in 0..1000 normalized coordinates around the hand-drawn diagram
  handDrawnDiagramPageIndex?: number; // Which page index (0 or 1) contains the hand-drawn diagram
}

export interface InvestigationItem {
  id?: string;
  reportDate: string; // YYYY-MM-DD
  displayDate: string; // DD/MM/YY or DD/MM/YYYY
  category: 'lab' | 'imaging';
  panelOrStudy?: string; // e.g. 'CBC', 'KFT', 'Urine R/M', 'USG KUB'
  parameterName: string; // Standardized name e.g. 'Hb (Hemoglobin)', 'Serum Creatinine', 'USG KUB / Abdomen & Pelvis'
  valueOrImpression: string; // e.g. '13.2 g/dL' or 'Prostate 42cc, PVR 65ml, 6mm R renal calculus'
  referenceRange?: string;
  flag?: 'Normal' | 'High' | 'Low' | 'Abnormal' | string;
}

export interface Consultation {
  id: string;
  opdNo: string; // UHID / OPD Slip No
  date: string; // YYYY-MM-DD
  rawDateText?: string;
  time?: string;

  // 1. Patient Registration / Demographics (from EMR Add New Patient)
  salutation?: string; // Mr., Ms., Mrs., Dr., Master
  patientName: string;
  phoneNumber?: string;
  contactNumber?: string; // alias
  gender: 'Male' | 'Female' | 'Other' | 'M' | 'F' | 'Unspecified';
  age: string;
  dob?: string;
  preferredLanguage?: string;
  city?: string;
  address?: string;
  addressOrCity?: string; // alias
  pin?: string;

  // 2. Vitals & Anthropometry (from EMR 1st Visit / Vitals)
  vitals: PatientVitals;

  // 3. Complaints
  complaints: string;
  chiefComplaints?: string; // alias

  // 4. Clinical History (from Case Sheet -> history)
  historyChecklist: ClinicalHistoryChecklist;
  history?: string; // general history notes / k/c/o
  pastMedication?: string;
  additionalHistory?: string;

  // 5. IPSS (International Prostatic Symptoms Score)
  ipss: IPSSScore;

  // 6. Examination
  systemicExamination?: string;
  genitalExamination?: string;
  perRectalExam?: string; // Per Rectal Exam (DRE)
  examinationNotes?: string; // alias

  // 7. Investigations & Diagnosis
  labTestsAndImaging?: string;
  investigationRecords?: InvestigationItem[];
  diagnosis: string;
  testsRequested?: string;
  testsRequestedByWhen?: string; // e.g. "3 Days", "1 Week"
  investigationsAdvised?: string; // alias

  // 8. Prescriptions (Rx)
  prescriptions: PrescriptionItem[];
  prescriptionsSummaryText?: string;

  // 9. Plan, Advice & Referrals
  dietAndExercise?: string;
  admissionAdvice?: 'Yes' | 'No' | '';
  assessmentPlan?: string;
  advice?: string;
  adviceAndDiet?: string; // alias
  nextVisit?: string; // No of Days/Weeks/Months or Date
  followUpDate?: string; // alias
  referredTo?: ReferralDetails;
  otNotes?: OtNotes; // 10. Operation Theatre (OT) & Freelance Surgery Notes (primary / latest procedure)
  otProcedures?: OtNotes[]; // All OT procedures recorded for this patient record (chronological / multi-procedure history)
  doctorId?: string;
  doctorName?: string;
  department?: string;

  // Meta & OCR Audit
  transcriptionConfidence?: number;
  handwritingLegibility?: 'Good' | 'Moderate' | 'Challenging' | 'Severely Cursive';
  flagsOrUncertainties?: string;
  rawTranscriptionText?: string;
  sourceImageThumbnail?: string;
  sourcePageIndices?: number[]; // Indices of uploaded pages (e.g. [0, 1] for Front & Back of Patient 1)
  sourceImages?: string[]; // Data URLs of Front & Back pages belonging to this consultation
  createdAt: number;
  updatedAt?: number;
}

export interface MonthData {
  monthKey: string;
  monthLabel: string;
  year: number;
  monthIndex: number;
  dates: {
    date: string;
    displayDate: string;
    consultations: Consultation[];
  }[];
  totalConsultations: number;
}

export interface OcrTranscriptionResult {
  pageSummary: string;
  clinicOrDoctorHeader?: string;
  overallHandwritingLegibility?: 'Good' | 'Moderate' | 'Challenging' | 'Severely Cursive';
  groupingMode?: 'pairs' | 'single-page' | 'all-in-one' | 'case-capsule';
  isCaseCapsule?: boolean;
  consultations: Omit<Consultation, 'id' | 'createdAt'>[];
}
