import { IpdPatientRecord, IpdSyncQueueItem } from '../types/ipd';

const IPD_STORAGE_PREFIX = 'medscribe_ipd_patients_v1_';
const IPD_DELETED_PREFIX = 'medscribe_ipd_deleted_ids_v1_';
const IPD_QUEUE_PREFIX = 'medscribe_ipd_sync_queue_v1_';

function safeUid(doctorUid?: string | null): string {
  const cleaned = String(doctorUid || 'default')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 80);
  if (!cleaned || /^_+$/.test(cleaned)) return 'default';
  return cleaned;
}

export function getIpdStorageKey(doctorUid?: string | null): string {
  return `${IPD_STORAGE_PREFIX}${safeUid(doctorUid)}`;
}

export function getIpdDeletedIdsKey(doctorUid?: string | null): string {
  return `${IPD_DELETED_PREFIX}${safeUid(doctorUid)}`;
}

export function getIpdSyncQueueKey(doctorUid?: string | null): string {
  return `${IPD_QUEUE_PREFIX}${safeUid(doctorUid)}`;
}

export function loadIpdPatientsLocal(doctorUid?: string | null): IpdPatientRecord[] {
  try {
    const raw = localStorage.getItem(getIpdStorageKey(doctorUid));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === 'object' && item.id)
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'admitted' ? -1 : 1;
        return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
      });
  } catch (err) {
    console.error('Failed to read IPD records from localStorage:', err);
    return [];
  }
}

export function saveIpdPatientsLocal(
  patients: IpdPatientRecord[],
  doctorUid?: string | null
): void {
  try {
    localStorage.setItem(getIpdStorageKey(doctorUid), JSON.stringify(patients));
  } catch (err) {
    console.error('Failed to persist IPD records locally:', err);
  }
}

export function loadIpdDeletedIds(doctorUid?: string | null): Set<string> {
  try {
    const raw = localStorage.getItem(getIpdDeletedIdsKey(doctorUid));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.map((id) => String(id))) : new Set();
  } catch {
    return new Set();
  }
}

export function markIpdPatientDeletedLocal(
  patientId: string,
  doctorUid?: string | null
): void {
  try {
    const existing = loadIpdDeletedIds(doctorUid);
    existing.add(patientId);
    localStorage.setItem(getIpdDeletedIdsKey(doctorUid), JSON.stringify(Array.from(existing)));
  } catch {
    // ignore
  }
}

export function loadIpdSyncQueue(doctorUid?: string | null): IpdSyncQueueItem[] {
  try {
    const raw = localStorage.getItem(getIpdSyncQueueKey(doctorUid));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function enqueueIpdSyncAction(
  patientId: string,
  action: 'upsert' | 'delete',
  doctorUid?: string | null
): IpdSyncQueueItem[] {
  const queue = loadIpdSyncQueue(doctorUid).filter((q) => q.patientId !== patientId);
  queue.push({ patientId, action, queuedAt: Date.now() });
  try {
    localStorage.setItem(getIpdSyncQueueKey(doctorUid), JSON.stringify(queue));
  } catch {
    // ignore
  }
  return queue;
}

export function removeIpdSyncQueueItem(
  patientId: string,
  doctorUid?: string | null
): IpdSyncQueueItem[] {
  const next = loadIpdSyncQueue(doctorUid).filter((q) => q.patientId !== patientId);
  try {
    localStorage.setItem(getIpdSyncQueueKey(doctorUid), JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export function clearIpdSyncQueue(doctorUid?: string | null): void {
  try {
    localStorage.removeItem(getIpdSyncQueueKey(doctorUid));
  } catch {
    // ignore
  }
}

export async function syncIpdPatientsToLocalServer(
  patients: IpdPatientRecord[],
  doctorUid?: string | null
): Promise<boolean> {
  const uid = safeUid(doctorUid);
  try {
    const resp = await fetch(`/api/ipd-storage/${encodeURIComponent(uid)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patients,
        updatedAt: Date.now(),
      }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

export async function fetchIpdPatientsFromLocalServer(
  doctorUid?: string | null
): Promise<IpdPatientRecord[] | null> {
  const uid = safeUid(doctorUid);
  try {
    const resp = await fetch(`/api/ipd-storage/${encodeURIComponent(uid)}`);
    if (!resp.ok) return null;
    const json = await resp.json();
    if (json?.success && Array.isArray(json.patients)) {
      return json.patients as IpdPatientRecord[];
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Merges local and remote IPD patient lists using newest `updatedAt` timestamp per ID,
 * respecting tombstoned (deleted) patient IDs.
 */
export function mergeIpdPatientLists(
  localList: IpdPatientRecord[],
  remoteList: IpdPatientRecord[],
  deletedIds: Set<string>
): IpdPatientRecord[] {
  const map = new Map<string, IpdPatientRecord>();

  for (const item of remoteList) {
    if (!item?.id || deletedIds.has(item.id)) continue;
    map.set(item.id, item);
  }

  for (const item of localList) {
    if (!item?.id || deletedIds.has(item.id)) continue;
    const existing = map.get(item.id);
    if (!existing || (item.updatedAt || 0) >= (existing.updatedAt || 0)) {
      map.set(item.id, item);
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.status !== b.status) return a.status === 'admitted' ? -1 : 1;
    return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
  });
}

export function clearAllLocalIpdStorageForDoctor(doctorUid?: string | null): void {
  try {
    localStorage.removeItem(getIpdStorageKey(doctorUid));
    localStorage.removeItem(getIpdDeletedIdsKey(doctorUid));
    localStorage.removeItem(getIpdSyncQueueKey(doctorUid));
  } catch {
    // ignore
  }
}
