import { Consultation, PrescriptionItem } from '../types/opd';

export type SuggestionFieldKey =
  | 'city'
  | 'bp'
  | 'pulse'
  | 'temp'
  | 'spo2'
  | 'complaints'
  | 'ipssFrequency'
  | 'ipssUrgency'
  | 'ipssNocturia'
  | 'ipssPoorFlow'
  | 'ipssIntermittency'
  | 'ipssStraining'
  | 'ipssIncompleteEvac'
  | 'ipssQol'
  | 'systemicExamination'
  | 'genitalExamination'
  | 'perRectalExam'
  | 'pastMedication'
  | 'labTestsAndImaging'
  | 'diagnosis'
  | 'testsRequested'
  | 'testsRequestedByWhen'
  | 'medicine'
  | 'dosage'
  | 'when'
  | 'frequency'
  | 'duration'
  | 'rxNotes'
  | 'dietAndExercise'
  | 'assessmentPlan'
  | 'advice'
  | 'nextVisit'
  | 'doctorName'
  | 'referredDoctor'
  | 'referredSpeciality';

export interface SuggestionEntry {
  value: string;
  count: number;
  lastUsed: number;
}

export interface RememberedMedicinePreset {
  medicine: string;
  dosage: string;
  when: string;
  frequency: string;
  duration: string;
  notes: string;
  count: number;
  lastUsed: number;
}

interface SuggestionStoreData {
  fields: Partial<Record<SuggestionFieldKey, SuggestionEntry[]>>;
  medicinePresets: RememberedMedicinePreset[];
}

const SUGGESTIONS_STORAGE_KEY = 'medscribe_field_suggestions_v1';

/**
 * Default clinical suggestions seeded for Urology & General OPD
 */
const DEFAULT_FIELD_SUGGESTIONS: Record<SuggestionFieldKey, string[]> = {
  city: [],
  bp: ['120/80', '130/80', '138/86', '140/90', '110/70', '126/82'],
  pulse: ['72', '76', '80', '84', '68', '88'],
  temp: ['98.4 F', '98.6 F', 'Afebrile', '99.2 F'],
  spo2: ['98%', '99%', '97%', '96%'],
  complaints: [
    'Follow-up: c/o Burning — on medication, good relief; LUTS low / minimal',
    'LUTS - increased frequency, weak stream, nocturia',
    'Burning micturition',
    'Left flank pain radiating to groin',
    'Right flank pain',
    'Difficulty in voiding / poor urinary stream',
    'Nocturia x 3-4 times/night',
    'Urgency and urge incontinence',
    'Hematuria (painless gross hematuria)',
    'Left scrotal pain and swelling',
    'Perimenopausal urinary urgency',
  ],
  ipssFrequency: ['No', 'Yes', 'Yes (< 2 hrs)', 'More than half the time'],
  ipssUrgency: ['No', 'Yes', 'Night Only', 'Moderate'],
  ipssNocturia: ['0-1x', '1-2x', '2-3x', '3-4x', '4-5x'],
  ipssPoorFlow: ['No', 'Yes', 'Weak stream', 'Thin stream'],
  ipssIntermittency: ['No', 'Yes', 'Stops and starts'],
  ipssStraining: ['No', 'Yes'],
  ipssIncompleteEvac: ['No', 'Yes', 'Sense of residual urine'],
  ipssQol: ['Unhappy (4/6)', 'Mostly Dissatisfied (3/6)', 'Mixed (2/6)', 'Pleased (1/6)', 'Terrible (5/6)'],
  systemicExamination: [
    'Per Abdomen: Soft, non-tender (NT)',
    'Bladder non-palpable (np)',
    'Bilateral flanks non-tender (NT)',
    'CVS: S1 S2 normal, Chest: Clear',
    'Suprapubic tenderness present',
  ],
  genitalExamination: [
    'Left testis hard and tender upto inguinal region; Right testis normal',
    'B/L testes normal in size, position, and consistency',
    'Right testis normal',
    'External urethral meatus normal, no phimosis',
    'Mild left varicocele noted on standing',
  ],
  perRectalExam: [
    'Very tight anal opening, could not do',
    'Grade II BPH, firm, smooth, non-tender, mucosa free',
    'Grade I BPH, firm, non-tender, median sulcus preserved',
    'Grade III prostatomegaly, firm, smooth, upper border reachable',
    'Anal sphincter tone normal, prostate not enlarged',
  ],
  pastMedication: [
    'K/C/O HTN on Tab Telmisartan 40mg OD',
    'K/C/O T2DM on OHA',
    'S/P TURP',
    'Tab Veltam 0.4mg HS',
    'Tab Silodosin 8mg HS',
    'No known comorbidities',
  ],
  labTestsAndImaging: [
    'CBC: Hb 13.0, TLC 9700',
    'Urine R/M: Pus cells 26/hpf, Bacteria +',
    'Urine R/M: Normal (W/N)',
    'S. Creatinine: 0.8 mg/dL',
    'HbA1c: 7.5%',
    'USG KUB: 14.7mm calculus',
    'USG KUB with PVR: Prostate 42cc, PVR 65ml',
    'S. PSA: 1.8 ng/mL',
  ],
  diagnosis: [
    'Benign Prostatic Hyperplasia (BPH) with LUTS',
    'S/P TURP - LUTS; Left acute epididymo-orchitis',
    'Recurrent UTI / Overactive Bladder (OAB)',
    'Left Ureteric Calculus (VUJ)',
    'Right Renal Calculus',
    'Acute Cystitis / Lower UTI',
    'Urethral Stricture Disease',
  ],
  testsRequested: [
    'CBC, KFT, Urine R/M, Urine C/S',
    'USG (KUB / A+P) with PVR',
    'Uroflowmetry (UFM)',
    'B/L Inguino-Scrotal USG Doppler',
    'Serum PSA (Total)',
    'NCCT KUB',
    'HbA1c, Random Blood Sugar',
  ],
  testsRequestedByWhen: ['Today / Stat', '3 Days', '5 Days', '1 Week', '2 Weeks', 'Next Visit'],
  medicine: [
    'Tab Veltam',
    'Tab Soliten',
    'Tab Mirago',
    'Tab Pymidim',
    'Syp Cital',
    'Tab Doxy',
    'Inj Magnex Forte',
    'Inj Pan',
    'Inj Tramadol',
    'Tab Silodal D8',
    'Tab Nitrofurantoin (Niftas)',
    'Tab Cefixime (Zifi)',
    'Tab Zerodol-SP',
  ],
  dosage: ['0.4mg', '0.2mg', '5mg', '50mg', '200mg', '15ml', '100mg', '1.5g', '40mg', '8mg/0.5mg', '625mg', '500mg'],
  when: ['After food (p/c)', 'Bedtime (HS)', 'Before food (a/c)', 'IV / Injection', 'With plenty of water'],
  frequency: ['0-0-1 (HS)', '0-1-0 (OD Afternoon)', '1-0-1 (BD)', '1-0-0 (OD)', '1-1-1 (TDS)', 'SOS'],
  duration: ['1 Month', '15 Days', '7 Days', '5 Days', '3 Days', '10 Days'],
  rxNotes: [
    'Take at bedtime',
    'Dissolve in 1 glass of water',
    'Before breakfast',
    'IV slow infusion',
    'SOS for severe pain',
  ],
  dietAndExercise: [
    'Plenty of oral fluids (2.5 - 3L/day)',
    'Restrict fluids after 7 PM, avoid caffeine/tea at night',
    'Low salt, low oxalate diet',
    'Sitz bath twice daily',
  ],
  assessmentPlan: [
    'Plan for cystoscopy + urethral dilatation',
    'Admit in ward (Emergency)',
    'Scrotal support & bed rest',
    'Explained about Cystoscopy + BNI / Urethral dilatation',
    'Medical management for LUTS; review with USG & UFM reports',
    'Trial without catheter (TWOC) after 5 days',
  ],
  advice: [
    'To review after 1 month',
    'Scrotal support',
    'Do not postpone urination; practice double voiding',
    'Plenty of oral fluids; maintain perineal hygiene',
    'Review with lab and USG reports',
  ],
  nextVisit: ['To review after 1 month', 'After 5 Days', 'After 7 Days', 'After 15 Days', 'After 1 Month', 'With Reports', 'SOS'],
  doctorName: [],
  referredDoctor: ['Cardiology On-Call', 'Nephrology On-Call', 'Gynaecology Dept'],
  referredSpeciality: ['Cardiology', 'Gynaecology', 'Nephrology', 'General Medicine', 'Endocrinology'],
};

const DEFAULT_MEDICINE_PRESETS: RememberedMedicinePreset[] = [
  {
    medicine: 'Tab Veltam',
    dosage: '0.4mg',
    when: 'Bedtime (HS)',
    frequency: '0-0-1 (HS)',
    duration: '1 Month',
    notes: 'Alpha-blocker for LUTS',
    count: 5,
    lastUsed: 1,
  },
  {
    medicine: 'Tab Soliten',
    dosage: '5mg',
    when: 'After food (p/c)',
    frequency: '0-1-0 (OD Afternoon)',
    duration: '1 Month',
    notes: 'Solifenacin 5mg',
    count: 5,
    lastUsed: 1,
  },
  {
    medicine: 'Tab Mirago',
    dosage: '50mg',
    when: 'After food (p/c)',
    frequency: '1-0-0 (OD)',
    duration: '1 Month',
    notes: 'Mirabegron',
    count: 5,
    lastUsed: 1,
  },
  {
    medicine: 'Tab Pymidim',
    dosage: '200mg',
    when: 'After food (p/c)',
    frequency: '1-0-1 (BD)',
    duration: '15 Days',
    notes: '',
    count: 4,
    lastUsed: 1,
  },
  {
    medicine: 'Syp Cital',
    dosage: '15ml',
    when: 'After food (p/c)',
    frequency: '1-1-1 (TDS)',
    duration: '7 Days',
    notes: 'With 1 glass of water',
    count: 4,
    lastUsed: 1,
  },
  {
    medicine: 'Tab Doxy',
    dosage: '100mg',
    when: 'After food (p/c)',
    frequency: '1-0-1 (BD)',
    duration: '7 Days',
    notes: '',
    count: 4,
    lastUsed: 1,
  },
  {
    medicine: 'Inj Magnex Forte',
    dosage: '1.5g',
    when: 'IV / Injection',
    frequency: '1-0-1 (BD)',
    duration: '3 Days',
    notes: 'IV after test dose',
    count: 3,
    lastUsed: 1,
  },
  {
    medicine: 'Inj Pan',
    dosage: '40mg',
    when: 'Before food (a/c)',
    frequency: '1-0-0 (OD)',
    duration: '3 Days',
    notes: 'IV',
    count: 3,
    lastUsed: 1,
  },
];

function isCleanValue(val?: string | number | null): boolean {
  if (val === undefined || val === null) return false;
  const s = String(val).trim();
  if (s.length < 2) return false;
  const lower = s.toLowerCase();
  if (
    [
      '-',
      '--',
      '—',
      'none',
      'nil',
      'n/a',
      'na',
      'unspecified',
      'unknown',
      'not mentioned',
      'not recorded',
      'not noted',
      'not stated',
      'not explicitly noted',
      'not explicitly stated',
      'not explicitly mentioned',
      'general consultation',
      'opd patient',
    ].includes(lower)
  ) {
    return false;
  }
  if (/^(?:not|none)\s+(?:explicitly\s+)?(?:stated|noted|mentioned|recorded)/i.test(lower)) {
    return false;
  }
  return true;
}

export function loadSuggestionStore(): SuggestionStoreData {
  try {
    const raw = localStorage.getItem(SUGGESTIONS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return {
          fields: parsed.fields || {},
          medicinePresets: Array.isArray(parsed.medicinePresets)
            ? parsed.medicinePresets
            : [...DEFAULT_MEDICINE_PRESETS],
        };
      }
    }
  } catch (e) {
    console.error('Failed to load field suggestions:', e);
  }

  // Initialize with defaults
  const fields: Partial<Record<SuggestionFieldKey, SuggestionEntry[]>> = {};
  (Object.keys(DEFAULT_FIELD_SUGGESTIONS) as SuggestionFieldKey[]).forEach((key) => {
    fields[key] = DEFAULT_FIELD_SUGGESTIONS[key].map((val, idx) => ({
      value: val,
      count: Math.max(1, 5 - Math.floor(idx / 2)),
      lastUsed: Date.now() - idx * 1000,
    }));
  });

  return {
    fields,
    medicinePresets: [...DEFAULT_MEDICINE_PRESETS],
  };
}

export function saveSuggestionStore(store: SuggestionStoreData): void {
  try {
    localStorage.setItem(SUGGESTIONS_STORAGE_KEY, JSON.stringify(store));
  } catch (e) {
    console.error('Failed to save field suggestions:', e);
  }
}

/**
 * Records a single value into a field's suggestion history
 */
function addValueToStore(
  store: SuggestionStoreData,
  field: SuggestionFieldKey,
  rawVal?: string | number | null,
  increment = 1
): void {
  if (!isCleanValue(rawVal)) return;
  const val = String(rawVal).trim();
  const list = store.fields[field] ? [...store.fields[field]!] : [];
  const existingIdx = list.findIndex((item) => item.value.toLowerCase() === val.toLowerCase());
  if (existingIdx >= 0) {
    list[existingIdx] = {
      value: val, // Keep latest casing
      count: list[existingIdx].count + increment,
      lastUsed: Date.now(),
    };
  } else {
    list.push({
      value: val,
      count: increment,
      lastUsed: Date.now(),
    });
  }
  // Sort by highest usage count first, then most recently used
  list.sort((a, b) => (b.count !== a.count ? b.count - a.count : b.lastUsed - a.lastUsed));
  store.fields[field] = list.slice(0, 40);
}

/**
 * Records a multi-item clinical narrative (both individual semicolon-separated phrases and full text)
 */
function addNarrativeToStore(
  store: SuggestionStoreData,
  field: SuggestionFieldKey,
  rawText?: string | null,
  increment = 1
): void {
  if (!isCleanValue(rawText)) return;
  const full = String(rawText).trim();
  if (full.length <= 120) {
    addValueToStore(store, field, full, increment);
  }
  const parts = full
    .split(/;|\||\r?\n/)
    .map((p) => p.trim())
    .filter((p) => isCleanValue(p) && p.length >= 3 && p.length <= 100);
  for (const part of parts) {
    addValueToStore(store, field, part, increment);
  }
}

/**
 * Records a single field usage immediately (e.g., on blur or quick-save)
 */
export function recordFieldUsage(field: SuggestionFieldKey, value?: string | number | null): void {
  if (!isCleanValue(value)) return;
  const store = loadSuggestionStore();
  addValueToStore(store, field, value, 1);
  saveSuggestionStore(store);
}

/**
 * Removes a suggestion item from a field's memory
 */
export function removeFieldSuggestion(field: SuggestionFieldKey, valueToRemove: string): void {
  const store = loadSuggestionStore();
  const list = store.fields[field] || [];
  store.fields[field] = list.filter(
    (item) => item.value.toLowerCase() !== valueToRemove.trim().toLowerCase()
  );
  saveSuggestionStore(store);
}

/**
 * Learns all field values and medicine presets from a Consultation object
 */
export function learnFromConsultation(c: Consultation, increment = 2): void {
  const store = loadSuggestionStore();
  learnConsultationIntoStore(store, c, increment);
  saveSuggestionStore(store);
}

/**
 * Batch-learns from an array of consultations (e.g. initial or OCR batch)
 */
export function learnFromConsultations(consultations: Consultation[], increment = 1): void {
  if (!Array.isArray(consultations) || consultations.length === 0) return;
  const store = loadSuggestionStore();
  for (const c of consultations) {
    learnConsultationIntoStore(store, c, increment);
  }
  saveSuggestionStore(store);
}

function learnConsultationIntoStore(
  store: SuggestionStoreData,
  c: Consultation,
  increment: number
): void {
  if (!c) return;
  addValueToStore(store, 'city', c.city, increment);
  if (c.vitals) {
    addValueToStore(store, 'bp', c.vitals.bp, increment);
    addValueToStore(store, 'pulse', c.vitals.pulse, increment);
    addValueToStore(store, 'temp', c.vitals.temp, increment);
    addValueToStore(store, 'spo2', c.vitals.spo2, increment);
  }
  addNarrativeToStore(store, 'complaints', c.complaints || c.chiefComplaints, increment);

  if (c.ipss) {
    addValueToStore(store, 'ipssFrequency', c.ipss.frequency, increment);
    addValueToStore(store, 'ipssUrgency', c.ipss.urgency, increment);
    addValueToStore(store, 'ipssNocturia', c.ipss.nocturia, increment);
    addValueToStore(store, 'ipssPoorFlow', c.ipss.poorFlow || c.ipss.poorStream, increment);
    addValueToStore(store, 'ipssIntermittency', c.ipss.intermittency, increment);
    addValueToStore(store, 'ipssStraining', c.ipss.straining, increment);
    addValueToStore(store, 'ipssIncompleteEvac', c.ipss.incompleteEvacuation, increment);
    addValueToStore(store, 'ipssQol', c.ipss.qualityOfLife, increment);
  }

  addNarrativeToStore(
    store,
    'systemicExamination',
    c.systemicExamination || c.examinationNotes,
    increment
  );
  addNarrativeToStore(store, 'genitalExamination', c.genitalExamination, increment);
  addNarrativeToStore(store, 'perRectalExam', c.perRectalExam, increment);
  addNarrativeToStore(store, 'pastMedication', c.pastMedication, increment);
  addNarrativeToStore(store, 'pastMedication', c.additionalHistory || c.history, increment);
  addNarrativeToStore(store, 'labTestsAndImaging', c.labTestsAndImaging, increment);
  addNarrativeToStore(store, 'diagnosis', c.diagnosis, increment);
  addNarrativeToStore(
    store,
    'testsRequested',
    c.testsRequested || c.investigationsAdvised,
    increment
  );
  addValueToStore(store, 'testsRequestedByWhen', c.testsRequestedByWhen, increment);
  addNarrativeToStore(store, 'dietAndExercise', c.dietAndExercise, increment);
  addNarrativeToStore(store, 'assessmentPlan', c.assessmentPlan, increment);
  addNarrativeToStore(store, 'advice', c.advice || c.adviceAndDiet, increment);
  addValueToStore(store, 'nextVisit', c.nextVisit || c.followUpDate, increment);
  addValueToStore(store, 'doctorName', c.doctorName, increment);

  if (c.referredTo) {
    addValueToStore(store, 'referredDoctor', c.referredTo.doctorName, increment);
    addValueToStore(store, 'referredSpeciality', c.referredTo.speciality, increment);
  }

  if (Array.isArray(c.prescriptions)) {
    for (const rx of c.prescriptions) {
      const med = (rx.medicine || rx.drugName || '').trim();
      if (!isCleanValue(med)) continue;
      const dosage = (rx.dosage || rx.dosageStrength || '').trim();
      const when = (rx.when || rx.timing || '').trim();
      const frequency = (rx.frequency || '').trim();
      const duration = (rx.duration || '').trim();
      const notes = (rx.notes || rx.instructions || '').trim();

      addValueToStore(store, 'medicine', med, increment);
      addValueToStore(store, 'dosage', dosage, increment);
      addValueToStore(store, 'when', when, increment);
      addValueToStore(store, 'frequency', frequency, increment);
      addValueToStore(store, 'duration', duration, increment);
      addValueToStore(store, 'rxNotes', notes, increment);

      // Save full medicine preset
      const presetIdx = store.medicinePresets.findIndex(
        (p) => p.medicine.toLowerCase() === med.toLowerCase()
      );
      if (presetIdx >= 0) {
        const existing = store.medicinePresets[presetIdx];
        store.medicinePresets[presetIdx] = {
          medicine: med,
          dosage: dosage || existing.dosage,
          when: when || existing.when,
          frequency: frequency || existing.frequency,
          duration: duration || existing.duration,
          notes: notes || existing.notes,
          count: existing.count + increment,
          lastUsed: Date.now(),
        };
      } else {
        store.medicinePresets.push({
          medicine: med,
          dosage,
          when: when || 'After food (p/c)',
          frequency: frequency || '1-0-1 (BD)',
          duration: duration || '5 Days',
          notes,
          count: increment,
          lastUsed: Date.now(),
        });
      }
    }
    store.medicinePresets.sort((a, b) =>
      b.count !== a.count ? b.count - a.count : b.lastUsed - a.lastUsed
    );
    store.medicinePresets = store.medicinePresets.slice(0, 30);
  }
}

/**
 * Returns ranked suggestion strings for a given field
 */
export function getFieldSuggestions(
  field: SuggestionFieldKey,
  filterQuery?: string,
  limit = 10
): string[] {
  const store = loadSuggestionStore();
  const entries = store.fields[field] || [];
  const q = (filterQuery || '').trim().toLowerCase();

  let values = entries.map((e) => e.value);
  if (q && q.length >= 1) {
    // Match against the last segment if user is typing a semicolon/comma separated list
    const lastSegment = q.split(/[;,|]/).pop()?.trim() || '';
    if (lastSegment.length >= 1) {
      const startsWith = values.filter(
        (v) =>
          v.toLowerCase().startsWith(lastSegment) &&
          v.toLowerCase() !== lastSegment
      );
      const contains = values.filter(
        (v) =>
          !v.toLowerCase().startsWith(lastSegment) &&
          v.toLowerCase().includes(lastSegment) &&
          v.toLowerCase() !== lastSegment
      );
      if (startsWith.length + contains.length > 0) {
        values = [...startsWith, ...contains];
      }
    }
  }
  return values.slice(0, limit);
}

/**
 * Returns top remembered Medicine Presets (with dosage, timing, frequency, duration)
 */
export function getRememberedMedicinePresets(limit = 12): RememberedMedicinePreset[] {
  const store = loadSuggestionStore();
  return (store.medicinePresets || []).slice(0, limit);
}

/**
 * Finds a remembered medicine preset by medicine name
 */
export function findMedicinePreset(medicineName?: string): RememberedMedicinePreset | undefined {
  if (!medicineName) return undefined;
  const clean = medicineName.trim().toLowerCase();
  if (!clean) return undefined;
  const store = loadSuggestionStore();
  return store.medicinePresets.find((p) => p.medicine.toLowerCase() === clean);
}

/**
 * Appends or replaces a suggestion into a multi-value string field
 */
export function applySuggestionToValue(
  currentValue: string | undefined,
  suggestion: string,
  mode: 'replace' | 'append-semi' | 'append-comma' = 'append-semi'
): string {
  const cur = (currentValue || '').trim();
  if (!cur || mode === 'replace') return suggestion;

  const sep = mode === 'append-comma' ? ', ' : '; ';
  const parts = cur
    .split(/[;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.some((p) => p.toLowerCase() === suggestion.toLowerCase())) {
    return cur;
  }
  const cleanCur = cur.replace(/[;,\s]+$/, '');
  return `${cleanCur}${sep}${suggestion}`;
}
