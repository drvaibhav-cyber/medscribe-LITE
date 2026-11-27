import React, { useState, useEffect, useRef } from 'react';
import {
  HardDrive,
  FolderOpen,
  FileSpreadsheet,
  FileJson,
  CheckCircle2,
  Database,
  Download,
  Upload,
  X,
  Info,
} from 'lucide-react';
import { DoctorAccount } from '../types/doctor';
import { Consultation } from '../types/opd';
import { MedScribeLogo } from './MedScribeLogo';
import {
  DoctorLocalStorageConfig,
  getDoctorLocalStorageConfig,
  saveDoctorLocalStorageConfig,
  pickLocalComputerDirectory,
  syncDoctorDataToLocalFileSystem,
  buildDefaultFolderPath,
  buildDefaultFileNamePrefix,
  importConsultationsFromLocalJsonFile,
} from '../utils/localFileSystemStorage';

interface LocalStorageSetupModalProps {
  isOpen: boolean;
  isFirstLogin?: boolean;
  doctor: DoctorAccount | null;
  consultations: Consultation[];
  onClose: () => void;
  onConfigUpdated: (config: DoctorLocalStorageConfig, message?: string) => void;
  onImportConsultations?: (imported: Consultation[]) => void;
}

export const LocalStorageSetupModal: React.FC<LocalStorageSetupModalProps> = ({
  isOpen,
  isFirstLogin = false,
  doctor,
  consultations,
  onClose,
  onConfigUpdated,
  onImportConsultations,
}) => {
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const [config, setConfig] = useState<DoctorLocalStorageConfig>(() =>
    getDoctorLocalStorageConfig(doctor)
  );
  const [folderPath, setFolderPath] = useState(config.folderPathDisplay);
  const [fileNamePrefix, setFileNamePrefix] = useState(config.fileNamePrefix);
  const [saveFormat, setSaveFormat] = useState<'both' | 'xlsx-only' | 'json-only'>(
    config.saveFormat
  );
  const [autoDownloadOnSave, setAutoDownloadOnSave] = useState(config.autoDownloadOnSave);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    if (isOpen && doctor) {
      const current = getDoctorLocalStorageConfig(doctor);
      setConfig(current);
      setFolderPath(current.folderPathDisplay || buildDefaultFolderPath(doctor));
      setFileNamePrefix(current.fileNamePrefix || buildDefaultFileNamePrefix(doctor));
      setSaveFormat(current.saveFormat || 'both');
      setAutoDownloadOnSave(Boolean(current.autoDownloadOnSave));
      setStatusNotice(null);
    }
  }, [isOpen, doctor]);

  if (!isOpen || !doctor) return null;

  const cleanDocSlug = (doctor.fullName || 'Doctor')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const pathPresets = [
    {
      label: 'Documents Folder',
      path: `~/Documents/MedScribe_OPD/${cleanDocSlug}`,
    },
    {
      label: 'Desktop Folder',
      path: `~/Desktop/OPD_Records/${cleanDocSlug}`,
    },
    {
      label: 'Downloads Folder',
      path: `~/Downloads/MedScribe_OPD/${cleanDocSlug}`,
    },
  ];

  const handleBrowseComputerFolder = async () => {
    setStatusNotice(null);
    const draftConfig: DoctorLocalStorageConfig = {
      ...config,
      doctorUid: doctor.uid,
      folderPathDisplay: folderPath.trim() || buildDefaultFolderPath(doctor),
      fileNamePrefix: fileNamePrefix.trim() || buildDefaultFileNamePrefix(doctor),
      saveFormat,
      autoDownloadOnSave,
    };
    const res = await pickLocalComputerDirectory(doctor, draftConfig);
    setConfig(res.updatedConfig);
    setFolderPath(res.updatedConfig.folderPathDisplay);
    if (res.notice) {
      setStatusNotice(res.notice);
    }
  };

  const handleSaveAndSync = async (triggerComputerDownload = false) => {
    setIsSyncing(true);
    setStatusNotice(null);
    try {
      const nextConfig: DoctorLocalStorageConfig = {
        ...config,
        doctorUid: doctor.uid,
        enabled: true,
        promptCompleted: true,
        folderPathDisplay: folderPath.trim() || buildDefaultFolderPath(doctor),
        fileNamePrefix:
          fileNamePrefix
            .trim()
            .replace(/\.(xlsx|json)$/i, '') || buildDefaultFileNamePrefix(doctor),
        saveFormat,
        autoDownloadOnSave,
      };
      saveDoctorLocalStorageConfig(nextConfig);

      const syncRes = await syncDoctorDataToLocalFileSystem(doctor, consultations, {
        forceDownload: triggerComputerDownload,
      });

      onConfigUpdated(
        syncRes.updatedConfig,
        `Local computer storage configured at "${syncRes.updatedConfig.folderPathDisplay}" (${syncRes.fileNames.join(', ') || 'Synced'})`
      );
      onClose();
    } catch (err: any) {
      setStatusNotice(err?.message || 'Could not complete local storage sync.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSkipForNow = () => {
    const skippedConfig: DoctorLocalStorageConfig = {
      ...config,
      doctorUid: doctor.uid,
      promptCompleted: true,
      folderPathDisplay: folderPath.trim() || buildDefaultFolderPath(doctor),
      fileNamePrefix: fileNamePrefix.trim() || buildDefaultFileNamePrefix(doctor),
      saveFormat,
      autoDownloadOnSave,
    };
    saveDoctorLocalStorageConfig(skippedConfig);
    onConfigUpdated(skippedConfig);
    onClose();
  };

  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imported = await importConsultationsFromLocalJsonFile(file, doctor);
      if (onImportConsultations) {
        onImportConsultations(imported);
      }
      setStatusNotice(
        `Loaded ${imported.length} consultation record${imported.length === 1 ? '' : 's'} from "${file.name}".`
      );
    } catch {
      setStatusNotice('Invalid JSON backup file. Please select a valid MedScribe OPD .json file.');
    } finally {
      if (importFileInputRef.current) importFileInputRef.current.value = '';
    }
  };

  const cleanPrefix = (fileNamePrefix.trim() || buildDefaultFileNamePrefix(doctor)).replace(
    /\.(xlsx|json)$/i,
    ''
  );

  return (
    <div className="fixed inset-0 z-[80] bg-[#2E2A3B]/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div
        className="bg-[#FDFBF9] border border-[#E6E0D8] rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="bg-gradient-to-r from-[#F4F1FA] via-[#E1F7FC] to-[#EBFBF3] border-b border-[#D6DDF8] text-[#1E3A5F] px-6 py-5 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <MedScribeLogo variant="icon" size="sm" />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-[#2D2A3E]">
                  {isFirstLogin
                    ? 'Welcome! Choose Where to Store Data on Your Computer'
                    : 'Local Computer File System Storage Settings'}
                </h2>
                {isFirstLogin && (
                  <span className="px-2 py-0.5 rounded-md bg-[#FEF3C7] border border-[#FDE68A] text-[#92400E] text-[10px] font-bold uppercase tracking-wider">
                    1st Login Setup
                  </span>
                )}
              </div>
              <p className="text-xs text-[#4B6385] mt-0.5">
                Saves <strong className="text-[#2D2A3E]">{doctor.fullName}</strong>&apos;s patient records locally on your computer alongside Browser local storage.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSkipForNow}
            className="p-1.5 rounded-lg text-[#4B6385] hover:text-[#1E3A5F] hover:bg-white/80 transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Dual Local Storage Overview Banner */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="p-3 rounded-xl bg-teal-50/80 border border-teal-200 flex items-start gap-2.5">
              <HardDrive className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-bold text-teal-950">1. Local Computer Folder</div>
                <div className="text-[11px] text-teal-800/80 leading-snug">
                  Saves <code>.xlsx</code> &amp; <code>.json</code> directly to your chosen folder
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 flex items-start gap-2.5">
              <Database className="w-4 h-4 text-slate-700 shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-bold text-slate-900">2. Browser Local Storage</div>
                <div className="text-[11px] text-slate-600 leading-snug">
                  Instant isolated workspace per doctor — 100% offline &amp; free
                </div>
              </div>
            </div>
          </div>

          {statusNotice && (
            <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 text-sky-900 text-xs flex items-start gap-2">
              <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
              <span>{statusNotice}</span>
            </div>
          )}

          {/* Step 1: Folder Location on Computer */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                1. Where on your computer do you want to store your OPD files?
              </label>
              <button
                type="button"
                onClick={handleBrowseComputerFolder}
                className="px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>Browse Computer Folder...</span>
              </button>
            </div>

            {/* Quick Preset Locations */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-slate-500 font-medium">Quick Locations:</span>
              {pathPresets.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setFolderPath(preset.path)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                    folderPath === preset.path
                      ? 'bg-teal-50 border-teal-500 text-teal-800'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-7">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Local Computer Folder Path
                </label>
                <input
                  type="text"
                  value={folderPath}
                  onChange={(e) => setFolderPath(e.target.value)}
                  placeholder="~/Documents/MedScribe_OPD/Dr_Name"
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-50 focus:bg-white border border-slate-300 focus:border-teal-600 rounded-xl outline-none"
                />
              </div>

              <div className="sm:col-span-5">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Register File Name Prefix
                </label>
                <input
                  type="text"
                  value={fileNamePrefix}
                  onChange={(e) => setFileNamePrefix(e.target.value)}
                  placeholder="Clinic_OPD_Register"
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-50 focus:bg-white border border-slate-300 focus:border-teal-600 rounded-xl outline-none"
                />
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-900 text-slate-200 font-mono text-[11px] flex items-center justify-between gap-2">
              <div className="truncate">
                <span className="text-teal-400 font-bold">Target Path: </span>
                <span>
                  {folderPath.replace(/\/+$/, '')}/{cleanPrefix}
                  {saveFormat === 'both'
                    ? '.xlsx & .json'
                    : saveFormat === 'xlsx-only'
                    ? '.xlsx'
                    : '.json'}
                </span>
              </div>
              {config.hasNativeDirectoryHandle && (
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-sans font-bold shrink-0">
                  OS Folder Linked
                </span>
              )}
            </div>
          </div>

          {/* Step 2: File Format Selection */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
              2. File Format to Save on Computer
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => setSaveFormat('both')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  saveFormat === 'both'
                    ? 'bg-teal-50/90 border-teal-600 ring-1 ring-teal-600'
                    : 'bg-white border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900">
                  <HardDrive className="w-3.5 h-3.5 text-teal-600" />
                  <span>Excel (.xlsx) + JSON</span>
                </div>
                <p className="text-[11px] text-slate-600 mt-1 leading-snug">
                  Multi-sheet Excel Workbook + restorable JSON data file (Recommended)
                </p>
              </button>

              <button
                type="button"
                onClick={() => setSaveFormat('xlsx-only')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  saveFormat === 'xlsx-only'
                    ? 'bg-teal-50/90 border-teal-600 ring-1 ring-teal-600'
                    : 'bg-white border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Excel (.xlsx) Only</span>
                </div>
                <p className="text-[11px] text-slate-600 mt-1 leading-snug">
                  Stores the multi-sheet monthly OPD Excel file on your computer
                </p>
              </button>

              <button
                type="button"
                onClick={() => setSaveFormat('json-only')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  saveFormat === 'json-only'
                    ? 'bg-teal-50/90 border-teal-600 ring-1 ring-teal-600'
                    : 'bg-white border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900">
                  <FileJson className="w-3.5 h-3.5 text-sky-600" />
                  <span>JSON Backup Only</span>
                </div>
                <p className="text-[11px] text-slate-600 mt-1 leading-snug">
                  Compact structured clinical data file for fast backup &amp; restore
                </p>
              </button>
            </div>
          </div>

          {/* Step 3: Automatic Download / Restore Controls */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoDownloadOnSave}
                onChange={(e) => setAutoDownloadOnSave(e.target.checked)}
                className="mt-0.5 rounded text-teal-600 focus:ring-teal-500"
              />
              <div>
                <span className="text-xs font-bold text-slate-800 block">
                  Also trigger automatic browser file download on every new/edited consultation
                </span>
                <span className="text-[11px] text-slate-500 leading-snug block">
                  Useful if your browser blocks direct background folder access; otherwise you can sync or download with 1 click anytime from your Doctor Profile.
                </span>
              </div>
            </label>

            <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSaveAndSync(true)}
                  disabled={isSyncing}
                  className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-teal-700" />
                  <span>Save &amp; Download to Computer Now</span>
                </button>

                <input
                  ref={importFileInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={handleImportFileChange}
                />
                <button
                  type="button"
                  onClick={() => importFileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-sky-700" />
                  <span>Load from Computer (.json)</span>
                </button>
              </div>

              <span className="text-[11px] text-slate-500">
                You can view or change this anytime in <strong>Doctor Profile</strong>.
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-[#FAF8F5] border-t border-[#E6E0D8] flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleSkipForNow}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-[#6B647B] hover:bg-white transition-colors cursor-pointer"
          >
            {isFirstLogin ? 'Skip for Now (Set Later in Profile)' : 'Cancel'}
          </button>

          <button
            type="button"
            onClick={() => handleSaveAndSync(false)}
            disabled={isSyncing}
            className="px-5 py-2.5 rounded-xl bg-[#D1FAE5] hover:bg-[#A7F3D0] text-[#065F46] border border-[#6EE7B7] text-xs font-bold shadow-xs flex items-center gap-2 transition-colors cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4 text-[#059669]" />
            <span>
              {isSyncing
                ? 'Saving Local Storage...'
                : 'Confirm Local Computer Storage Location'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
