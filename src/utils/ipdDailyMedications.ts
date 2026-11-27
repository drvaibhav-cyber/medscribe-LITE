import {
  IpdMedicationAdminLog,
  IpdMedicationOrder,
  IpdPatientRecord,
  IpdWardTreatmentItem,
} from '../types/ipd';

export const DAILY_MED_SLOT_PREFIX = 'Daily · Day ';

export type DailyMedDecision = 'confirmed' | 'held';

export interface ResolvedDailyMedicationRow {
  id: string;
  medicationId: string;
  medicine: string;
  dosage: string;
  route: string;
  frequency: string;
  when: string;
  notes: string;
  startDate: string;
  dayNumber: number;
  status: 'confirmed' | 'held' | 'charted';
}

export interface ResolvedDailyMedicationList {
  source: 'confirmed' | 'chart';
  items: ResolvedDailyMedicationRow[];
}

function parseIsoToUtcMs(iso?: string): number | null {
  if (!iso) return null;
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/**
 * Computes inclusive medication day number (Day 1 on startDate, Day 2 on next day, etc.).
 * Uses UTC midnight math to prevent DST / timezone off-by-one drift.
 */
export function computeMedicationDayNumber(
  startDate?: string,
  targetDate?: string,
  fallbackStartDate?: string
): number {
  const startMs = parseIsoToUtcMs(startDate) ?? parseIsoToUtcMs(fallbackStartDate);
  const targetMs = parseIsoToUtcMs(targetDate);
  if (startMs === null || targetMs === null) return 1;
  const diffDays = Math.floor((targetMs - startMs) / 86_400_000);
  return Math.max(1, diffDays + 1);
}

/**
 * Shifts a YYYY-MM-DD date string by deltaDays (+1 for next day, -1 for previous day).
 */
export function shiftIsoDate(isoDate: string, deltaDays: number): string {
  const ms = parseIsoToUtcMs(isoDate);
  const base = ms !== null ? new Date(ms) : new Date();
  const shifted = new Date(base.getTime() + deltaDays * 86_400_000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isDailyConfirmedMedLog(log: IpdMedicationAdminLog): boolean {
  return typeof log.timeSlot === 'string' && log.timeSlot.startsWith(DAILY_MED_SLOT_PREFIX);
}

export function parseDayNumberFromLog(
  log: IpdMedicationAdminLog,
  medOrder?: IpdMedicationOrder,
  fallbackStartDate?: string
): number {
  if (medOrder?.startDate) {
    return computeMedicationDayNumber(medOrder.startDate, log.date, fallbackStartDate);
  }
  const match = (log.timeSlot || '').match(/Day\s+(\d+)/i);
  if (match) {
    const parsed = parseInt(match[1], 10);
    if (Number.isFinite(parsed) && parsed >= 1) return parsed;
  }
  return computeMedicationDayNumber(fallbackStartDate, log.date, fallbackStartDate);
}

export function encodeDailyMedRemarks(
  frequency?: string,
  when?: string,
  notes?: string
): string {
  const f = (frequency || '').replace(/\|/g, '/').trim();
  const w = (when || '').replace(/\|/g, '/').trim();
  const n = (notes || '').replace(/\|/g, '/').trim();
  return `${f} | ${w} | ${n}`.slice(0, 195);
}

export function decodeDailyMedRemarks(
  remarks?: string,
  fallbackOrder?: IpdMedicationOrder
): { frequency: string; when: string; notes: string } {
  const raw = (remarks || '').trim();
  if (raw.includes('|')) {
    const parts = raw.split('|').map((p) => p.trim());
    return {
      frequency: parts[0] || fallbackOrder?.frequency || '',
      when: parts[1] || fallbackOrder?.when || '',
      notes: parts.slice(2).join(' · ') || fallbackOrder?.notes || '',
    };
  }
  return {
    frequency: fallbackOrder?.frequency || '',
    when: fallbackOrder?.when || '',
    notes: raw || fallbackOrder?.notes || '',
  };
}

/**
 * Extracts a map of { [medicationId]: 'confirmed' | 'held' } from saved daily logs for a given date.
 */
export function getSavedDecisionsForDate(
  medicationLogs: IpdMedicationAdminLog[] | undefined,
  dateKey: string
): Record<string, DailyMedDecision> {
  const map: Record<string, DailyMedDecision> = {};
  const logs = (medicationLogs || [])
    .filter((l) => l.date === dateKey && isDailyConfirmedMedLog(l) && Boolean(l.medicationId))
    .sort((a, b) => (a.loggedAt || 0) - (b.loggedAt || 0));
  for (const log of logs) {
    map[log.medicationId] = log.status === 'held' ? 'held' : 'confirmed';
  }
  return map;
}

/**
 * Returns the saved medication IDs for a given date in their exact confirmation / repeat order
 * (1st confirmed first, newly confirmed or repeated below).
 */
export function getSavedOrderedMedIdsForDate(
  medicationLogs: IpdMedicationAdminLog[] | undefined,
  dateKey: string
): string[] {
  const logs = (medicationLogs || [])
    .filter((l) => l.date === dateKey && isDailyConfirmedMedLog(l) && Boolean(l.medicationId))
    .sort((a, b) => (a.loggedAt || 0) - (b.loggedAt || 0));
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const log of logs) {
    if (!seen.has(log.medicationId)) {
      seen.add(log.medicationId);
      ordered.push(log.medicationId);
    }
  }
  return ordered;
}

/**
 * Builds a single Firestore-rules-compatible IpdMedicationAdminLog entry for a specific date.
 */
export function buildSingleDailyMedLogForDate(
  dateKey: string,
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
  decision: DailyMedDecision,
  fallbackStartDate: string | undefined,
  doctorName: string,
  loggedAt: number
): IpdMedicationAdminLog {
  const dayNum = computeMedicationDayNumber(row.startDate, dateKey, fallbackStartDate);
  const safeMedId = (row.medicationId || 'med').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 36);
  const id = `dmed-${dateKey}-${safeMedId}`.slice(0, 78);

  return {
    id,
    medicationId: row.medicationId,
    medicineName: row.medicine,
    dosage: row.dosage || '',
    route: row.route || 'Oral (PO)',
    date: dateKey,
    timeSlot: `${DAILY_MED_SLOT_PREFIX}${dayNum}`,
    status: decision === 'confirmed' ? 'given' : 'held',
    givenBy: doctorName || '',
    remarks: encodeDailyMedRemarks(row.frequency, row.when, row.notes),
    loggedAt,
  };
}

/**
 * Builds Firestore-rules-compatible IpdMedicationAdminLog entries for a specific date's confirmed/held list.
 * Preserves the exact confirmation/repeat order (`orderedMedIds`) so earlier confirmed medications stay
 * at the top and newly confirmed or repeated medications list below.
 */
export function buildDailyMedLogsForDate(
  dateKey: string,
  medications: IpdMedicationOrder[],
  decisions: Record<string, DailyMedDecision>,
  fallbackStartDate: string | undefined,
  doctorName: string,
  orderedMedIds?: string[],
  baseTimestamp?: number
): IpdMedicationAdminLog[] {
  const now = baseTimestamp ?? Date.now();
  const medById = new Map<string, IpdMedicationOrder>();
  for (const m of medications) {
    medById.set(m.id, m);
  }

  const orderedMeds: IpdMedicationOrder[] = [];
  const seen = new Set<string>();

  for (const id of orderedMedIds || []) {
    const med = medById.get(id);
    if (med && decisions[med.id] && !seen.has(med.id)) {
      seen.add(med.id);
      orderedMeds.push(med);
    }
  }
  for (const med of medications) {
    if (decisions[med.id] && !seen.has(med.id)) {
      seen.add(med.id);
      orderedMeds.push(med);
    }
  }

  return orderedMeds.map((med, idx) =>
    buildSingleDailyMedLogForDate(
      dateKey,
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
      decisions[med.id],
      fallbackStartDate,
      doctorName,
      now + idx
    )
  );
}

/**
 * Copies a single individual medication row onto `nextDateKey` as Confirmed,
 * appending it BELOW any medications already confirmed on `nextDateKey`.
 */
export function appendRepeatedMedicationLogForNextDay(
  existingLogs: IpdMedicationAdminLog[],
  sourceRow: {
    medicationId: string;
    medicine: string;
    dosage?: string;
    route?: string;
    frequency?: string;
    when?: string;
    notes?: string;
    startDate?: string;
  },
  nextDateKey: string,
  fallbackStartDate: string | undefined,
  doctorName: string
): { logs: IpdMedicationAdminLog[]; alreadyConfirmed: boolean } {
  const nextDayLogs = existingLogs
    .filter((l) => l.date === nextDateKey && isDailyConfirmedMedLog(l))
    .sort((a, b) => (a.loggedAt || 0) - (b.loggedAt || 0));

  const alreadyConfirmed = nextDayLogs.some(
    (l) => l.medicationId === sourceRow.medicationId && l.status === 'given'
  );
  if (alreadyConfirmed) {
    return { logs: existingLogs, alreadyConfirmed: true };
  }

  const maxLoggedAt = nextDayLogs.reduce((mx, l) => Math.max(mx, l.loggedAt || 0), 0);
  const nextTimestamp = Math.max(Date.now(), maxLoggedAt + 1);
  const newLog = buildSingleDailyMedLogForDate(
    nextDateKey,
    sourceRow,
    'confirmed',
    fallbackStartDate,
    doctorName,
    nextTimestamp
  );

  // Keep all logs for other dates + existing nextDayLogs (replacing any held copy of this med), appending newLog at the end
  const otherDateLogs = existingLogs.filter(
    (l) => !(l.date === nextDateKey && isDailyConfirmedMedLog(l))
  );
  const keptNextDayLogs = nextDayLogs.filter((l) => l.medicationId !== sourceRow.medicationId);
  const merged = [...keptNextDayLogs, newLog, ...otherDateLogs].slice(0, 150);

  return { logs: merged, alreadyConfirmed: false };
}

/**
 * Copies all confirmed medications from a source day onto `nextDateKey` in order,
 * preserving any already-confirmed medications on `nextDateKey` at the top and
 * appending newly repeated medications below them.
 */
export function repeatAllConfirmedMedicationsToNextDay(
  existingLogs: IpdMedicationAdminLog[],
  sourceRows: Array<{
    medicationId: string;
    medicine: string;
    dosage?: string;
    route?: string;
    frequency?: string;
    when?: string;
    notes?: string;
    startDate?: string;
  }>,
  nextDateKey: string,
  fallbackStartDate: string | undefined,
  doctorName: string
): { logs: IpdMedicationAdminLog[]; addedCount: number } {
  const nextDayLogs = existingLogs
    .filter((l) => l.date === nextDateKey && isDailyConfirmedMedLog(l))
    .sort((a, b) => (a.loggedAt || 0) - (b.loggedAt || 0));

  const existingConfirmedIds = new Set(
    nextDayLogs.filter((l) => l.status === 'given').map((l) => l.medicationId)
  );
  const toAppend = sourceRows.filter((r) => !existingConfirmedIds.has(r.medicationId));

  if (toAppend.length === 0) {
    return { logs: existingLogs, addedCount: 0 };
  }

  const maxLoggedAt = nextDayLogs.reduce((mx, l) => Math.max(mx, l.loggedAt || 0), 0);
  const baseTs = Math.max(Date.now(), maxLoggedAt + 1);
  const appendingIds = new Set(toAppend.map((r) => r.medicationId));

  const newLogs = toAppend.map((row, idx) =>
    buildSingleDailyMedLogForDate(
      nextDateKey,
      row,
      'confirmed',
      fallbackStartDate,
      doctorName,
      baseTs + idx
    )
  );

  const otherDateLogs = existingLogs.filter(
    (l) => !(l.date === nextDateKey && isDailyConfirmedMedLog(l))
  );
  const keptNextDayLogs = nextDayLogs.filter((l) => !appendingIds.has(l.medicationId));
  const merged = [...keptNextDayLogs, ...newLogs, ...otherDateLogs].slice(0, 150);

  return { logs: merged, addedCount: newLogs.length };
}

/**
 * Returns unique YYYY-MM-DD dates in chronological ascending order (POD 0 -> POD 1 -> POD 2...)
 * that have saved daily confirmed/held medication tables.
 */
export function getSavedDailyMedicationDates(patient: IpdPatientRecord): string[] {
  const dates = new Set<string>();
  for (const log of patient.medicationLogs || []) {
    if (log.date && isDailyConfirmedMedLog(log)) {
      dates.add(log.date);
    }
  }
  return Array.from(dates).sort((a, b) => a.localeCompare(b));
}

/**
 * Resolves the medication table for a specific date:
 * - If daily confirmed/held entries exist for dateKey, returns those in exact confirmation/repeat
 *   order (oldest first, newly confirmed/repeated below; Confirmed first, Held after) with Med Day.
 * - Otherwise falls back to active medications charted on dateKey (with computed Med Day).
 */
export function getResolvedDailyMedicationsForDate(
  patient: IpdPatientRecord,
  dateKey: string
): ResolvedDailyMedicationList {
  const orderById = new Map<string, IpdMedicationOrder>();
  for (const m of patient.medications || []) {
    orderById.set(m.id, m);
  }
  const fallbackStart = patient.surgeryDate || patient.admissionDate || dateKey;

  const dailyLogsForDate = (patient.medicationLogs || [])
    .filter((l) => l.date === dateKey && isDailyConfirmedMedLog(l))
    .sort((a, b) => (a.loggedAt || 0) - (b.loggedAt || 0));

  if (dailyLogsForDate.length > 0) {
    const rows: ResolvedDailyMedicationRow[] = dailyLogsForDate.map((log) => {
      const order = orderById.get(log.medicationId);
      const decoded = decodeDailyMedRemarks(log.remarks, order);
      const dayNumber = parseDayNumberFromLog(log, order, fallbackStart);
      return {
        id: log.id,
        medicationId: log.medicationId,
        medicine: order?.medicine || log.medicineName,
        dosage: order?.dosage || log.dosage || '',
        route: order?.route || log.route || 'Oral (PO)',
        frequency: decoded.frequency,
        when: decoded.when,
        notes: decoded.notes,
        startDate: order?.startDate || fallbackStart,
        dayNumber,
        status: log.status === 'held' ? 'held' : 'confirmed',
      };
    });

    // Confirmed items first, Held items after — preserving ascending confirmation/repeat order within each
    rows.sort((a, b) => {
      if (a.status === b.status) return 0;
      return a.status === 'confirmed' ? -1 : 1;
    });

    return { source: 'confirmed', items: rows };
  }

  // Fallback: active orders on dateKey from medication chart
  const activeOrders = (patient.medications || []).filter((m) => {
    const started = !m.startDate || m.startDate <= dateKey;
    const notStoppedBefore = !m.stopDate || m.stopDate >= dateKey;
    return started && notStoppedBefore;
  });

  const rows: ResolvedDailyMedicationRow[] = activeOrders.map((med) => ({
    id: med.id,
    medicationId: med.id,
    medicine: med.medicine,
    dosage: med.dosage || '',
    route: med.route || 'Oral (PO)',
    frequency: med.frequency || '',
    when: med.when || '',
    notes: med.notes || '',
    startDate: med.startDate || fallbackStart,
    dayNumber: computeMedicationDayNumber(med.startDate, dateKey, fallbackStart),
    status: med.status === 'held' ? 'held' : 'charted',
  }));

  return { source: 'chart', items: rows };
}

/**
 * Formats a concise clinical summary of confirmed/held medications for syncing into a date's Daily Progress note.
 */
export function buildDailyMedicationSyncNoteText(
  rows: ResolvedDailyMedicationRow[]
): string {
  const confirmed = rows.filter((r) => r.status === 'confirmed');
  const held = rows.filter((r) => r.status === 'held');
  const lines: string[] = [];

  if (confirmed.length > 0) {
    lines.push('Confirmed Medications for Today:');
    confirmed.forEach((r) => {
      const freqPart = [r.route, r.frequency, r.when].filter(Boolean).join(' · ');
      lines.push(
        `• ${r.medicine}${r.dosage ? ` ${r.dosage}` : ''}${freqPart ? ` (${freqPart})` : ''} — Day ${r.dayNumber} [Confirmed]`
      );
    });
  }

  if (held.length > 0) {
    lines.push('Medications Held:');
    held.forEach((r) => {
      lines.push(`• ${r.medicine}${r.dosage ? ` ${r.dosage}` : ''} — Day ${r.dayNumber} [Held]`);
    });
  }

  return lines.join('\n').slice(0, 1900);
}

function normalizeMedDedupeKey(medicine: string): string {
  return medicine
    .replace(/\s*\((?:IV|Oral\s*\(PO\)|PO|IM|SC|Topical|Other)\)\s*$/i, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function stripTrailingRouteFromLegacyName(name: string): string {
  return name.replace(/\s*\((?:IV|Oral\s*\(PO\)|PO|IM|SC|Topical|Other)\)\s*$/i, '').trim();
}

/**
 * Compiles a deduplicated Treatment Given in Ward table for the Discharge Summary:
 * - Lists every unique medication that was actually given/confirmed (never repeating a medication).
 * - Calculates how many distinct days each medication was given (e.g. "1 Day", "3 Days").
 * - Falls back cleanly to non-held chart orders if no daily confirmations have been logged yet.
 */
export function summarizeWardMedicationsGiven(
  patient: IpdPatientRecord,
  referenceEndDate?: string
): IpdWardTreatmentItem[] {
  const orderById = new Map<string, IpdMedicationOrder>();
  for (const m of patient.medications || []) {
    orderById.set(m.id, m);
  }

  const givenLogs = (patient.medicationLogs || []).filter((l) => l.status === 'given');

  if (givenLogs.length > 0) {
    interface AggregatedMed {
      medicine: string;
      dosage: string;
      route: string;
      frequency: string;
      notes: string;
      dates: Set<string>;
      earliestDate: string;
    }

    const byKey = new Map<string, AggregatedMed>();

    for (const log of givenLogs) {
      const order = orderById.get(log.medicationId);
      const rawMed = order?.medicine || stripTrailingRouteFromLegacyName(log.medicineName || '');
      const medicine = rawMed.trim();
      if (!medicine) continue;

      const key = normalizeMedDedupeKey(medicine);
      const decoded = decodeDailyMedRemarks(log.remarks, order);
      const dosage = (order?.dosage || log.dosage || '').trim();
      const route = (order?.route || log.route || 'Oral (PO)').trim();
      const frequency = decoded.frequency.trim();
      const notes = (decoded.notes || decoded.when || '').trim();
      const dateVal = (log.date || '').trim();

      const existing = byKey.get(key);
      if (existing) {
        if (dateVal) {
          existing.dates.add(dateVal);
          if (!existing.earliestDate || dateVal < existing.earliestDate) {
            existing.earliestDate = dateVal;
          }
        }
        if (!existing.dosage && dosage) existing.dosage = dosage;
        if (!existing.route && route) existing.route = route;
        if (!existing.frequency && frequency) existing.frequency = frequency;
        if (!existing.notes && notes) existing.notes = notes;
      } else {
        const dates = new Set<string>();
        if (dateVal) dates.add(dateVal);
        byKey.set(key, {
          medicine,
          dosage,
          route,
          frequency,
          notes,
          dates,
          earliestDate: dateVal || '9999-12-31',
        });
      }
    }

    return Array.from(byKey.values())
      .sort((a, b) => a.earliestDate.localeCompare(b.earliestDate))
      .map((agg) => {
        const dayCount = Math.max(1, agg.dates.size);
        return {
          medicine: agg.medicine,
          dosage: agg.dosage,
          route: agg.route || 'Oral (PO)',
          frequency: agg.frequency,
          durationOrDates: dayCount === 1 ? '1 Day' : `${dayCount} Days`,
          notes: agg.notes,
        };
      });
  }

  // Fallback when no daily medication logs have been confirmed yet
  const fallbackEnd =
    referenceEndDate ||
    patient.dischargeDate ||
    new Date().toISOString().slice(0, 10);
  const seen = new Set<string>();
  const items: IpdWardTreatmentItem[] = [];

  for (const m of patient.medications || []) {
    if (m.status === 'held') continue;
    const medName = (m.medicine || '').trim();
    if (!medName) continue;
    const key = normalizeMedDedupeKey(medName);
    if (seen.has(key)) continue;
    seen.add(key);

    const endTarget = m.stopDate || fallbackEnd;
    const dayCount = computeMedicationDayNumber(
      m.startDate,
      endTarget,
      patient.surgeryDate || patient.admissionDate || fallbackEnd
    );

    items.push({
      medicine: medName,
      dosage: (m.dosage || '').trim(),
      route: (m.route || 'Oral (PO)').trim(),
      frequency: (m.frequency || '').trim(),
      durationOrDates: dayCount === 1 ? '1 Day' : `${dayCount} Days`,
      notes: (m.notes || m.when || '').trim(),
    });
  }

  return items;
}

