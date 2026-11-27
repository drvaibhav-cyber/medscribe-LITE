import { Consultation, PrescriptionItem } from '../types/opd';
import { getRuntimeActiveDoctor } from '../types/doctor';

export interface MasterMedicationItem {
  id: string;
  medicine: string;
  dosage: string;
  when: string;
  frequency: string;
  duration: string;
  notes: string;
  source: 'manual' | 'prescription' | 'default';
  createdAt: number;
  updatedAt: number;
}

export interface MedicationGroup {
  id: string;
  name: string;
  description?: string;
  medicationIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface MedicineMasterStore {
  medications: MasterMedicationItem[];
  groups: MedicationGroup[];
  updatedAt: number;
}

export interface ExtractedPrescriptionCandidate {
  key: string;
  medicine: string;
  dosage: string;
  when: string;
  frequency: string;
  duration: string;
  notes: string;
  usageCount: number;
  alreadyInMaster: boolean;
  existingMasterId?: string;
}

const STORAGE_KEY_PREFIX = 'medscribe_medicine_master_v1_';
export const MEDICINE_MASTER_CHANGED_EVENT = 'medscribe:medicine-master-changed';

function getSafeUid(doctorUid?: string | null): string {
  const cleaned = String(doctorUid || 'default')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 80);
  if (!cleaned || /^_+$/.test(cleaned)) return 'default';
  return cleaned;
}

function getStorageKey(doctorUid?: string | null): string {
  return `${STORAGE_KEY_PREFIX}${getSafeUid(doctorUid)}`;
}

export function normalizeMedicationLookupKey(medicine?: string, dosage?: string): string {
  const med = String(medicine || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  const dos = String(dosage || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return `${med}::${dos}`;
}

export function createDefaultMedicineMasterStore(): MedicineMasterStore {
  const now = Date.now();
  const medications: MasterMedicationItem[] = [
    {
      id: 'med-default-pyridium',
      medicine: 'Tab Pyridium',
      dosage: '200 mg',
      when: 'After food (p/c)',
      frequency: '1-0-1 (BD)',
      duration: '3 Days',
      notes: 'Will have red/orange urine',
      source: 'default',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'med-default-niftas',
      medicine: 'Tab Niftas (Nitrofurantoin)',
      dosage: '100 mg',
      when: 'After food (p/c)',
      frequency: '1-0-1 (BD)',
      duration: '5 Days',
      notes: 'Take strictly after meals',
      source: 'default',
      createdAt: now + 1,
      updatedAt: now + 1,
    },
    {
      id: 'med-default-cital',
      medicine: 'Syp Cital',
      dosage: '15 ml',
      when: 'After food (p/c)',
      frequency: '1-1-1 (TDS)',
      duration: '15 Days',
      notes: 'Mix with half glass of water',
      source: 'default',
      createdAt: now + 2,
      updatedAt: now + 2,
    },
    {
      id: 'med-default-veltam',
      medicine: 'Tab Veltam',
      dosage: '0.4 mg',
      when: 'Bedtime (HS)',
      frequency: '0-0-1 (HS)',
      duration: '1 Month',
      notes: 'May cause mild dizziness on standing (postural hypotension)',
      source: 'default',
      createdAt: now + 3,
      updatedAt: now + 3,
    },
    {
      id: 'med-default-cipro',
      medicine: 'Tab Ciprofloxacin',
      dosage: '500 mg',
      when: 'After food (p/c)',
      frequency: '1-0-1 (BD)',
      duration: '14 Days',
      notes: 'Complete full course; avoid dairy right before/after dose',
      source: 'default',
      createdAt: now + 4,
      updatedAt: now + 4,
    },
    {
      id: 'med-default-bactrim',
      medicine: 'Tab Bactrim DS',
      dosage: '160/800 mg',
      when: 'After food (p/c)',
      frequency: '1-0-1 (BD)',
      duration: '7 Days',
      notes: 'Maintain good oral hydration',
      source: 'default',
      createdAt: now + 5,
      updatedAt: now + 5,
    },
  ];

  const groups: MedicationGroup[] = [
    {
      id: 'grp-default-uti',
      name: 'UTI',
      description: 'Uncomplicated lower urinary tract infection protocol',
      medicationIds: [
        'med-default-niftas',
        'med-default-pyridium',
        'med-default-cital',
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'grp-default-prostatitis',
      name: 'Prostatitis',
      description: 'Acute / chronic bacterial prostatitis & LUTS relief',
      medicationIds: [
        'med-default-cipro',
        'med-default-veltam',
        'med-default-pyridium',
      ],
      createdAt: now + 1,
      updatedAt: now + 1,
    },
  ];

  return {
    medications,
    groups,
    updatedAt: now,
  };
}

function sanitizeMedicationItem(raw: any, idx: number): MasterMedicationItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const medicine = String(raw.medicine || raw.drugName || '').trim().slice(0, 150);
  if (!medicine) return null;
  const now = Date.now();
  const src =
    raw.source === 'manual' || raw.source === 'prescription' || raw.source === 'default'
      ? raw.source
      : 'manual';
  return {
    id: String(raw.id || `med-${now}-${idx}`).trim().slice(0, 100) || `med-${now}-${idx}`,
    medicine,
    dosage: String(raw.dosage || raw.dosageStrength || '').trim().slice(0, 80),
    when: String(raw.when || raw.timing || '').trim().slice(0, 80),
    frequency: String(raw.frequency || '').trim().slice(0, 60),
    duration: String(raw.duration || '').trim().slice(0, 60),
    notes: String(raw.notes || raw.instructions || '').trim().slice(0, 250),
    source: src,
    createdAt: typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : now,
  };
}

function sanitizeMedicationGroup(
  raw: any,
  idx: number,
  validMedIds: Set<string>
): MedicationGroup | null {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.name || '').trim().slice(0, 80);
  if (!name) return null;
  const now = Date.now();
  const rawIds = Array.isArray(raw.medicationIds) ? raw.medicationIds : [];
  const dedupedIds: string[] = [];
  const seen = new Set<string>();
  for (const idVal of rawIds) {
    const id = String(idVal || '').trim();
    if (id && validMedIds.has(id) && !seen.has(id)) {
      seen.add(id);
      dedupedIds.push(id);
    }
  }
  return {
    id: String(raw.id || `grp-${now}-${idx}`).trim().slice(0, 100) || `grp-${now}-${idx}`,
    name,
    description: String(raw.description || '').trim().slice(0, 200),
    medicationIds: dedupedIds,
    createdAt: typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : now,
  };
}

export function sanitizeMedicineMasterStore(raw: any): MedicineMasterStore {
  if (!raw || typeof raw !== 'object') {
    return createDefaultMedicineMasterStore();
  }
  const rawMeds = Array.isArray(raw.medications) ? raw.medications : [];
  const medications: MasterMedicationItem[] = [];
  const seenIds = new Set<string>();
  rawMeds.slice(0, 500).forEach((item: any, idx: number) => {
    const clean = sanitizeMedicationItem(item, idx);
    if (clean && !seenIds.has(clean.id)) {
      seenIds.add(clean.id);
      medications.push(clean);
    }
  });

  const validMedIds = new Set(medications.map((m) => m.id));
  const rawGroups = Array.isArray(raw.groups) ? raw.groups : [];
  const groups: MedicationGroup[] = [];
  const seenGroupIds = new Set<string>();
  rawGroups.slice(0, 100).forEach((g: any, idx: number) => {
    const clean = sanitizeMedicationGroup(g, idx, validMedIds);
    if (clean && !seenGroupIds.has(clean.id)) {
      seenGroupIds.add(clean.id);
      groups.push(clean);
    }
  });

  return {
    medications,
    groups,
    updatedAt:
      typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt)
        ? raw.updatedAt
        : Date.now(),
  };
}

export function getActiveDoctorUidFromStorage(): string {
  const active = getRuntimeActiveDoctor();
  if (active?.uid) return getSafeUid(active.uid);
  return 'default';
}

export function loadMedicineMasterStore(doctorUid?: string | null): MedicineMasterStore {
  const effectiveUid = doctorUid || getActiveDoctorUidFromStorage();
  try {
    const key = getStorageKey(effectiveUid);
    const raw = localStorage.getItem(key);
    if (!raw) {
      const initial = createDefaultMedicineMasterStore();
      localStorage.setItem(key, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw);
    return sanitizeMedicineMasterStore(parsed);
  } catch {
    return createDefaultMedicineMasterStore();
  }
}

export function notifyMedicineMasterChanged(): void {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(MEDICINE_MASTER_CHANGED_EVENT));
    }
  } catch {
    // ignore
  }
}

export function saveMedicineMasterStoreLocal(
  store: MedicineMasterStore,
  doctorUid?: string | null
): MedicineMasterStore {
  const effectiveUid = doctorUid || getActiveDoctorUidFromStorage();
  const clean = sanitizeMedicineMasterStore({ ...store, updatedAt: Date.now() });
  try {
    localStorage.setItem(getStorageKey(effectiveUid), JSON.stringify(clean));
    notifyMedicineMasterChanged();
  } catch (e) {
    console.error('Failed to save medicine master locally:', e);
  }
  return clean;
}

export async function syncMedicineMasterToServer(
  store: MedicineMasterStore,
  doctorUid?: string | null
): Promise<MedicineMasterStore> {
  const effectiveUid = getSafeUid(doctorUid || getActiveDoctorUidFromStorage());
  const clean = saveMedicineMasterStoreLocal(store, effectiveUid);
  try {
    await fetch(`/api/medicine-master/${encodeURIComponent(effectiveUid)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(clean),
    });
  } catch {
    // non-fatal offline fallback
  }
  return clean;
}

export async function fetchMedicineMasterFromServer(
  doctorUid?: string | null
): Promise<MedicineMasterStore> {
  const effectiveUid = getSafeUid(doctorUid || getActiveDoctorUidFromStorage());
  const local = loadMedicineMasterStore(effectiveUid);
  try {
    const res = await fetch(`/api/medicine-master/${encodeURIComponent(effectiveUid)}`);
    if (!res.ok) return local;
    const json = await res.json();
    if (json?.success && json?.store) {
      const remote = sanitizeMedicineMasterStore(json.store);
      if (remote.updatedAt > local.updatedAt || (local.medications.length === 0 && remote.medications.length > 0)) {
        return saveMedicineMasterStoreLocal(remote, effectiveUid);
      }
    }
  } catch {
    // ignore network failure
  }
  return local;
}

/**
 * Matches a typed medicine name (and optional dosage) against the Master Medication List.
 * Supports exact match first, then prefix/normalized match without form prefixes like "Tab"/"Cap".
 */
export function findMasterMedicationByName(
  medicineName?: string,
  dosage?: string,
  doctorUid?: string | null
): MasterMedicationItem | undefined {
  const cleanName = String(medicineName || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!cleanName || cleanName.length < 2) return undefined;

  const store = loadMedicineMasterStore(doctorUid);
  const meds = store.medications || [];
  if (meds.length === 0) return undefined;

  const cleanDosage = String(dosage || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (cleanDosage) {
    const exactBoth = meds.find(
      (m) =>
        m.medicine.trim().toLowerCase().replace(/\s+/g, ' ') === cleanName &&
        m.dosage.trim().toLowerCase().replace(/\s+/g, ' ') === cleanDosage
    );
    if (exactBoth) return exactBoth;
  }

  const exactName = meds.find(
    (m) => m.medicine.trim().toLowerCase().replace(/\s+/g, ' ') === cleanName
  );
  if (exactName) return exactName;

  const stripForm = (s: string) =>
    s
      .replace(/^(?:tab\.?|tablet|cap\.?|capsule|syp\.?|syrup|inj\.?|injection|sach\.?|sachet)\s+/i, '')
      .trim();

  const strippedTyped = stripForm(cleanName);
  if (strippedTyped.length >= 3) {
    return meds.find((m) => stripForm(m.medicine.trim().toLowerCase()) === strippedTyped);
  }
  return undefined;
}

export function masterMedicationToPrescriptionItem(med: MasterMedicationItem): PrescriptionItem {
  return {
    medicine: med.medicine,
    drugName: med.medicine,
    dosage: med.dosage,
    dosageStrength: med.dosage,
    when: med.when,
    timing: med.when,
    frequency: med.frequency,
    duration: med.duration,
    notes: med.notes,
    instructions: med.notes,
  };
}

export function getGroupMedications(
  group: MedicationGroup,
  store: MedicineMasterStore
): MasterMedicationItem[] {
  const medMap = new Map(store.medications.map((m) => [m.id, m]));
  return group.medicationIds
    .map((id) => medMap.get(id))
    .filter((m): m is MasterMedicationItem => Boolean(m));
}

/**
 * Merges a selected Medication Group's prescriptions into an existing Rx list,
 * skipping medications already present and replacing an initial blank row if empty.
 */
export function applyMedicationGroupToPrescriptions(
  existingRx: PrescriptionItem[] | undefined,
  group: MedicationGroup,
  store: MedicineMasterStore
): { prescriptions: PrescriptionItem[]; addedCount: number; skippedCount: number } {
  const groupMeds = getGroupMedications(group, store);
  const base = Array.isArray(existingRx) ? [...existingRx] : [];
  const hasOnlyBlankRow =
    base.length === 1 && !(base[0]?.medicine || base[0]?.drugName || '').trim();
  const working = hasOnlyBlankRow ? [] : base;

  const existingKeys = new Set(
    working
      .map((rx) => (rx.medicine || rx.drugName || '').trim().toLowerCase().replace(/\s+/g, ' '))
      .filter(Boolean)
  );

  let addedCount = 0;
  let skippedCount = 0;
  for (const med of groupMeds) {
    const key = med.medicine.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!key) continue;
    if (existingKeys.has(key)) {
      skippedCount++;
      continue;
    }
    existingKeys.add(key);
    working.push(masterMedicationToPrescriptionItem(med));
    addedCount++;
  }

  return {
    prescriptions: working.length > 0 ? working : base,
    addedCount,
    skippedCount,
  };
}

/**
 * Scans consultations to extract all unique medications written in prescriptions
 * so the doctor can pull them into the Master Medication List with 1 click.
 */
export function extractUniqueMedicationsFromConsultations(
  consultations: Consultation[],
  existingMaster: MasterMedicationItem[]
): ExtractedPrescriptionCandidate[] {
  const masterMap = new Map<string, MasterMedicationItem>();
  for (const m of existingMaster) {
    masterMap.set(normalizeMedicationLookupKey(m.medicine, m.dosage), m);
    // Also index by name alone for fallback match if dosage varies or is empty
    const nameKey = normalizeMedicationLookupKey(m.medicine, '');
    if (!masterMap.has(nameKey)) {
      masterMap.set(nameKey, m);
    }
  }

  const candidateMap = new Map<string, ExtractedPrescriptionCandidate>();

  for (const c of consultations || []) {
    for (const rx of c.prescriptions || []) {
      const medName = String(rx.medicine || rx.drugName || '').trim();
      if (!medName) continue;
      const dosage = String(rx.dosage || rx.dosageStrength || '').trim();
      const when = String(rx.when || rx.timing || '').trim();
      const frequency = String(rx.frequency || '').trim();
      const duration = String(rx.duration || '').trim();
      const notes = String(rx.notes || rx.instructions || '').trim();

      const key = normalizeMedicationLookupKey(medName, dosage);
      const exactMatch = masterMap.get(key) || (!dosage ? masterMap.get(normalizeMedicationLookupKey(medName, '')) : undefined);

      const prev = candidateMap.get(key);
      if (prev) {
        prev.usageCount += 1;
        if (!prev.when && when) prev.when = when;
        if (!prev.frequency && frequency) prev.frequency = frequency;
        if (!prev.duration && duration) prev.duration = duration;
        if (!prev.notes && notes) prev.notes = notes;
      } else {
        candidateMap.set(key, {
          key,
          medicine: medName,
          dosage,
          when,
          frequency,
          duration,
          notes,
          usageCount: 1,
          alreadyInMaster: Boolean(exactMatch),
          existingMasterId: exactMatch?.id,
        });
      }
    }
  }

  return Array.from(candidateMap.values()).sort((a, b) => {
    if (a.alreadyInMaster !== b.alreadyInMaster) {
      return a.alreadyInMaster ? 1 : -1;
    }
    if (b.usageCount !== a.usageCount) return b.usageCount - a.usageCount;
    return a.medicine.localeCompare(b.medicine);
  });
}
