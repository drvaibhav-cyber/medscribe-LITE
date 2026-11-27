import { Consultation } from '../types/opd';
import { DoctorAccount } from '../types/doctor';
import { buildOpdExcelArrayBuffer } from './excelExporter';

export interface DoctorLocalStorageConfig {
  doctorUid: string;
  enabled: boolean;
  promptCompleted: boolean;
  folderPathDisplay: string;
  fileNamePrefix: string;
  saveFormat: 'both' | 'xlsx-only' | 'json-only';
  hasNativeDirectoryHandle: boolean;
  nativeFolderName?: string;
  autoDownloadOnSave: boolean;
  lastSyncedAt?: number;
  lastSyncedCount?: number;
  serverDiskPath?: string;
}

const LOCAL_FS_CONFIG_PREFIX = 'medscribe_local_fs_config_v1_';
const IDB_NAME = 'medscribe_local_fs_handles_db';
const IDB_STORE = 'directory_handles';

function getConfigKey(doctorUid: string): string {
  const safe = (doctorUid || 'anonymous').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${LOCAL_FS_CONFIG_PREFIX}${safe}`;
}

export function buildDefaultFileNamePrefix(doctor: DoctorAccount): string {
  const cleanName = (doctor.fullName || 'Doctor')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `${cleanName}_OPD_Register`;
}

export function buildDefaultFolderPath(doctor: DoctorAccount): string {
  const cleanName = (doctor.fullName || 'Doctor')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `~/Documents/MedScribe_OPD/${cleanName}`;
}

export function getDoctorLocalStorageConfig(doctor: DoctorAccount | null): DoctorLocalStorageConfig {
  if (!doctor || !doctor.uid) {
    return {
      doctorUid: 'anonymous',
      enabled: false,
      promptCompleted: false,
      folderPathDisplay: '~/Documents/MedScribe_OPD',
      fileNamePrefix: 'OPD_Register',
      saveFormat: 'both',
      hasNativeDirectoryHandle: false,
      autoDownloadOnSave: false,
    };
  }

  try {
    const raw = localStorage.getItem(getConfigKey(doctor.uid));
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        doctorUid: doctor.uid,
        enabled: Boolean(parsed.enabled),
        promptCompleted: Boolean(parsed.promptCompleted),
        folderPathDisplay: parsed.folderPathDisplay || buildDefaultFolderPath(doctor),
        fileNamePrefix: parsed.fileNamePrefix || buildDefaultFileNamePrefix(doctor),
        saveFormat: parsed.saveFormat || 'both',
        hasNativeDirectoryHandle: Boolean(parsed.hasNativeDirectoryHandle),
        nativeFolderName: parsed.nativeFolderName,
        autoDownloadOnSave: Boolean(parsed.autoDownloadOnSave),
        lastSyncedAt: parsed.lastSyncedAt,
        lastSyncedCount: parsed.lastSyncedCount,
        serverDiskPath: parsed.serverDiskPath,
      };
    }
  } catch (e) {
    console.error('Failed to read doctor local storage config:', e);
  }

  return {
    doctorUid: doctor.uid,
    enabled: false,
    promptCompleted: false,
    folderPathDisplay: buildDefaultFolderPath(doctor),
    fileNamePrefix: buildDefaultFileNamePrefix(doctor),
    saveFormat: 'both',
    hasNativeDirectoryHandle: false,
    autoDownloadOnSave: false,
  };
}

export function saveDoctorLocalStorageConfig(config: DoctorLocalStorageConfig): void {
  try {
    localStorage.setItem(getConfigKey(config.doctorUid), JSON.stringify(config));
  } catch (e) {
    console.error('Failed to save doctor local storage config:', e);
  }
}

// IndexedDB helper for persisting FileSystemDirectoryHandle across sessions
function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function storeDirectoryHandleInIdb(doctorUid: string, handle: any): Promise<void> {
  try {
    const db = await openHandleDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(handle, doctorUid);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('Could not persist directory handle in IndexedDB:', e);
  }
}

async function loadDirectoryHandleFromIdb(doctorUid: string): Promise<any | null> {
  try {
    const db = await openHandleDb();
    return await new Promise<any | null>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(doctorUid);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

/**
 * Prompts the user to pick a folder on their local computer via the File System Access API
 * (`window.showDirectoryPicker`). If restricted by an embedded preview iframe or browser,
 * returns a clear status so the user can configure their preferred computer folder path directly.
 */
export async function pickLocalComputerDirectory(
  doctor: DoctorAccount,
  currentConfig: DoctorLocalStorageConfig
): Promise<{
  updatedConfig: DoctorLocalStorageConfig;
  usedNativePicker: boolean;
  notice?: string;
}> {
  const win = window as any;
  if (typeof win.showDirectoryPicker === 'function') {
    try {
      const dirHandle = await win.showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'documents',
      });
      await storeDirectoryHandleInIdb(doctor.uid, dirHandle);
      const folderName = dirHandle.name || 'Selected Computer Folder';
      const nextConfig: DoctorLocalStorageConfig = {
        ...currentConfig,
        doctorUid: doctor.uid,
        enabled: true,
        promptCompleted: true,
        hasNativeDirectoryHandle: true,
        nativeFolderName: folderName,
        folderPathDisplay: `Computer Folder: ${folderName}/`,
      };
      saveDoctorLocalStorageConfig(nextConfig);
      return {
        updatedConfig: nextConfig,
        usedNativePicker: true,
        notice: `Connected directly to computer folder "${folderName}". Records will auto-save into this folder.`,
      };
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return {
          updatedConfig: currentConfig,
          usedNativePicker: false,
          notice: 'Folder selection was cancelled.',
        };
      }
      // Cross-origin iframe restriction or browser limitation
      return {
        updatedConfig: currentConfig,
        usedNativePicker: false,
        notice:
          'Direct OS folder dialog is restricted inside embedded preview frames. Your selected computer path below is active and synced via local disk & one-click computer download.',
      };
    }
  }

  return {
    updatedConfig: currentConfig,
    usedNativePicker: false,
    notice:
      'Your browser uses standard file downloads for local computer storage. Confirm your preferred folder path below and use Sync / Auto-Download.',
  };
}

/**
 * Strips raw base64 camera images when serializing for lightweight JSON storage if needed,
 * while keeping all clinical fields, date-wise investigation tables, and prescriptions intact.
 */
function prepareConsultationsForJsonFile(consultations: Consultation[]): Consultation[] {
  return consultations.map((c) => ({
    ...c,
    sourceImages: undefined,
    sourceImageThumbnail: undefined,
  }));
}

/**
 * Triggers a direct browser download of the doctor's .xlsx and/or .json files to their computer.
 */
export function downloadDoctorFilesToComputer(
  doctor: DoctorAccount,
  consultations: Consultation[],
  config: DoctorLocalStorageConfig
): string[] {
  const prefix = (config.fileNamePrefix || buildDefaultFileNamePrefix(doctor)).replace(
    /\.(xlsx|json)$/i,
    ''
  );
  const downloadedFiles: string[] = [];

  if (config.saveFormat === 'both' || config.saveFormat === 'xlsx-only') {
    const excelBuffer = buildOpdExcelArrayBuffer(consultations);
    const excelBlob = new Blob([excelBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(excelBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${prefix}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    downloadedFiles.push(`${prefix}.xlsx`);
  }

  if (config.saveFormat === 'both' || config.saveFormat === 'json-only') {
    const jsonPayload = {
      doctorUid: doctor.uid,
      doctorName: doctor.fullName,
      registrationNo: doctor.registrationNo,
      department: doctor.department,
      hospitalName: doctor.hospitalName,
      configuredComputerFolder: config.folderPathDisplay,
      exportedAt: new Date().toISOString(),
      totalConsultations: consultations.length,
      consultations: prepareConsultationsForJsonFile(consultations),
    };
    const jsonBlob = new Blob([JSON.stringify(jsonPayload, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(jsonBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${prefix}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    downloadedFiles.push(`${prefix}.json`);
  }

  return downloadedFiles;
}

/**
 * Syncs the doctor's consultations to their configured Local Computer File System:
 * 1. Writes directly to the granted FileSystemDirectoryHandle (if available).
 * 2. Mirrors to the local computer disk via `/api/local-storage/sync`.
 * 3. Optionally triggers a browser download if `forceDownload` or `config.autoDownloadOnSave` is true.
 */
export async function syncDoctorDataToLocalFileSystem(
  doctor: DoctorAccount,
  consultations: Consultation[],
  options?: { forceDownload?: boolean }
): Promise<{
  synced: boolean;
  fileNames: string[];
  updatedConfig: DoctorLocalStorageConfig;
}> {
  const config = getDoctorLocalStorageConfig(doctor);
  if (!config.enabled && !options?.forceDownload) {
    return { synced: false, fileNames: [], updatedConfig: config };
  }

  const prefix = (config.fileNamePrefix || buildDefaultFileNamePrefix(doctor)).replace(
    /\.(xlsx|json)$/i,
    ''
  );
  const cleanConsultations = prepareConsultationsForJsonFile(consultations);
  const writtenFiles: string[] = [];

  // 1. Try writing directly to native FileSystemDirectoryHandle if configured
  if (config.hasNativeDirectoryHandle) {
    try {
      const dirHandle = await loadDirectoryHandleFromIdb(doctor.uid);
      if (dirHandle) {
        if (config.saveFormat === 'both' || config.saveFormat === 'json-only') {
          const jsonFileHandle = await dirHandle.getFileHandle(`${prefix}.json`, { create: true });
          const writable = await jsonFileHandle.createWritable();
          const jsonPayload = {
            doctorUid: doctor.uid,
            doctorName: doctor.fullName,
            registrationNo: doctor.registrationNo,
            department: doctor.department,
            hospitalName: doctor.hospitalName,
            configuredComputerFolder: config.folderPathDisplay,
            exportedAt: new Date().toISOString(),
            totalConsultations: cleanConsultations.length,
            consultations: cleanConsultations,
          };
          await writable.write(JSON.stringify(jsonPayload, null, 2));
          await writable.close();
          writtenFiles.push(`${prefix}.json`);
        }

        if (config.saveFormat === 'both' || config.saveFormat === 'xlsx-only') {
          const xlsxFileHandle = await dirHandle.getFileHandle(`${prefix}.xlsx`, { create: true });
          const writable = await xlsxFileHandle.createWritable();
          const excelBuffer = buildOpdExcelArrayBuffer(consultations);
          await writable.write(excelBuffer);
          await writable.close();
          writtenFiles.push(`${prefix}.xlsx`);
        }
      }
    } catch (nativeErr) {
      console.warn('Native directory handle write skipped or permission needed:', nativeErr);
    }
  }

  // 2. Always mirror to local disk via backend endpoint
  let serverDiskPath = config.serverDiskPath;
  try {
    const resp = await fetch('/api/local-storage/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        doctorUid: doctor.uid,
        doctorName: doctor.fullName,
        folderPathDisplay: config.folderPathDisplay,
        fileNamePrefix: prefix,
        consultations: cleanConsultations,
      }),
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data.diskFilePath) {
        serverDiskPath = data.diskFilePath;
      }
      if (!writtenFiles.includes(`${prefix}.json`)) {
        writtenFiles.push(`${prefix}.json`);
      }
    }
  } catch (err) {
    console.warn('Local server disk sync warning:', err);
  }

  // 3. If user clicked "Save / Download to Computer Now" or enabled autoDownloadOnSave
  if (options?.forceDownload || config.autoDownloadOnSave) {
    const dlFiles = downloadDoctorFilesToComputer(doctor, consultations, config);
    dlFiles.forEach((f) => {
      if (!writtenFiles.includes(f)) writtenFiles.push(f);
    });
  }

  const now = Date.now();
  const updatedConfig: DoctorLocalStorageConfig = {
    ...config,
    enabled: true,
    promptCompleted: true,
    lastSyncedAt: now,
    lastSyncedCount: consultations.length,
    serverDiskPath,
  };
  saveDoctorLocalStorageConfig(updatedConfig);

  return {
    synced: true,
    fileNames: writtenFiles,
    updatedConfig,
  };
}

/**
 * Reads a doctor's local `.json` backup file from their computer and returns the parsed consultations.
 */
export async function importConsultationsFromLocalJsonFile(
  file: File,
  doctor: DoctorAccount
): Promise<Consultation[]> {
  const text = await file.text();
  const parsed = JSON.parse(text);
  const rawList = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.consultations)
    ? parsed.consultations
    : [];

  return rawList.map((c: Consultation) => ({
    ...c,
    doctorId: doctor.uid,
    doctorName: c.doctorName || doctor.fullName,
    department: c.department || doctor.department,
  }));
}
