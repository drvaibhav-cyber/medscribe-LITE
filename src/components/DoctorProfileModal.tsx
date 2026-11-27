import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Stethoscope,
  FileBadge,
  Award,
  Building2,
  Mail,
  Phone,
  MapPin,
  Edit3,
  CheckCircle2,
  AlertCircle,
  Lock,
  ShieldCheck,
  Save,
  UserCheck,
  HardDrive,
  FolderOpen,
  Download,
  Upload,
  Trash2,
  AlertTriangle,
  FileSpreadsheet,
  FileJson,
} from 'lucide-react';
import { DoctorAccount } from '../types/doctor';
import { updateRegisteredDoctorProfile } from './DoctorAuthPage';
import { DoctorLocalStorageConfig } from '../utils/localFileSystemStorage';
import { MedScribeLogo } from './MedScribeLogo';

interface DoctorProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  doctor: DoctorAccount | null;
  onUpdateDoctor: (updated: DoctorAccount) => void;
  initialEditing?: boolean;
  localStorageConfig?: DoctorLocalStorageConfig;
  consultationsCount?: number;
  onOpenLocalStorageSetup?: () => void;
  onSyncLocalComputerNow?: () => void;
  onImportFromLocalComputerFile?: (file: File) => void;
  onDownloadExcelBackup?: () => void;
  onDownloadJsonBackup?: () => void;
  onDeleteDoctorAccount?: () => Promise<void>;
}

export const DoctorProfileModal: React.FC<DoctorProfileModalProps> = ({
  isOpen,
  onClose,
  doctor,
  onUpdateDoctor,
  initialEditing = false,
  localStorageConfig,
  consultationsCount = 0,
  onOpenLocalStorageSetup,
  onSyncLocalComputerNow,
  onImportFromLocalComputerFile,
  onDownloadExcelBackup,
  onDownloadJsonBackup,
  onDeleteDoctorAccount,
}) => {
  const [isEditing, setIsEditing] = useState(initialEditing);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [backupChoice, setBackupChoice] = useState<'keep-backup' | 'no-backup'>('keep-backup');
  const [hasDownloadedBackup, setHasDownloadedBackup] = useState(false);
  const [confirmDeleteChecked, setConfirmDeleteChecked] = useState(false);
  const [isDeletingProfile, setIsDeletingProfile] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);

  // Editable form state matching "Register New Doctor" fields
  const [fullName, setFullName] = useState('');
  const [registrationNo, setRegistrationNo] = useState('');
  const [qualification, setQualification] = useState('');
  const [speciality, setSpeciality] = useState('');
  const [hospitalName, setHospitalName] = useState('');
  const [department, setDepartment] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [clinicAddress, setClinicAddress] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    if (isOpen && doctor) {
      setIsEditing(initialEditing);
      setShowDeleteConfirm(false);
      setBackupChoice('keep-backup');
      setHasDownloadedBackup(false);
      setConfirmDeleteChecked(false);
      setIsDeletingProfile(false);
      setErrorMessage(null);
      setSuccessMessage(null);
      setFullName(doctor.fullName || '');
      setRegistrationNo(doctor.registrationNo || '');
      setQualification(doctor.qualification || '');
      setSpeciality(doctor.speciality || '');
      setHospitalName(doctor.hospitalName || '');
      setDepartment(doctor.department || '');
      setEmail(doctor.email || '');
      setPhone(doctor.phone || '');
      setClinicAddress(doctor.clinicAddress || '');
      setNewPassword('');
      setConfirmPassword('');
    }
  }, [isOpen, doctor, initialEditing]);

  if (!isOpen || !doctor) return null;

  const resetFormFromDoctor = () => {
    setFullName(doctor.fullName || '');
    setRegistrationNo(doctor.registrationNo || '');
    setQualification(doctor.qualification || '');
    setSpeciality(doctor.speciality || '');
    setHospitalName(doctor.hospitalName || '');
    setDepartment(doctor.department || '');
    setEmail(doctor.email || '');
    setPhone(doctor.phone || '');
    setClinicAddress(doctor.clinicAddress || '');
    setNewPassword('');
    setConfirmPassword('');
    setErrorMessage(null);
  };

  const handleSaveChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const normalizedName = fullName.trim().startsWith('Dr.')
      ? fullName.trim()
      : `Dr. ${fullName.trim()}`;

    if (normalizedName.length < 5) {
      setErrorMessage('Please enter your full clinical name (e.g., Dr. Full Name).');
      return;
    }
    if (!registrationNo.trim() || registrationNo.trim().length < 2) {
      setErrorMessage('Please enter your Medical Council Registration Number.');
      return;
    }
    if (!qualification.trim()) {
      setErrorMessage('Please enter your qualifications / degrees.');
      return;
    }
    if (!speciality.trim()) {
      setErrorMessage('Please enter your clinical speciality.');
      return;
    }
    if (!hospitalName.trim()) {
      setErrorMessage('Please enter your hospital or clinic name.');
      return;
    }
    if (!department.trim()) {
      setErrorMessage('Please enter your department.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setErrorMessage('Please enter a valid official email address.');
      return;
    }
    if (!phone.trim() || phone.trim().length < 5) {
      setErrorMessage('Please enter a valid contact phone number.');
      return;
    }
    if (newPassword.trim().length > 0) {
      if (newPassword.trim().length < 4) {
        setErrorMessage('New password must be at least 4 characters long.');
        return;
      }
      if (newPassword !== confirmPassword) {
        setErrorMessage('New password and confirmation password do not match.');
        return;
      }
    }

    const updatedProfile: DoctorAccount = {
      ...doctor,
      fullName: normalizedName.slice(0, 100),
      registrationNo: registrationNo.trim().slice(0, 60),
      qualification: qualification.trim().slice(0, 120),
      speciality: speciality.trim().slice(0, 100),
      hospitalName: hospitalName.trim().slice(0, 150),
      department: department.trim().slice(0, 100),
      email: email.trim().slice(0, 150),
      phone: phone.trim().slice(0, 30),
      clinicAddress: clinicAddress.trim().slice(0, 250),
    };

    setIsSaving(true);
    try {
      // Persist to local registered doctors directory
      const savedLocal = updateRegisteredDoctorProfile(
        updatedProfile,
        newPassword.trim() || undefined
      );

      onUpdateDoctor(savedLocal);
      setIsEditing(false);
      setNewPassword('');
      setConfirmPassword('');
      setSuccessMessage('Doctor profile updated and synced across OPD Register & A4 Printouts.');
    } catch (err: any) {
      console.error('Failed to update doctor profile:', err);
      setErrorMessage('Failed to save profile changes. Please check your fields and try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#2E2A3B]/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div
        className="bg-[#FDFBF9] border border-[#E6E0D8] rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Clinical Header Banner */}
        <div className="bg-gradient-to-r from-[#F4F1FA] via-[#E1F7FC] to-[#EBFBF3] border-b border-[#D6DDF8] text-[#1E3A5F] px-6 py-5 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <MedScribeLogo variant="icon" size="sm" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold tracking-tight text-[#2D2A3E] truncate">
                  {doctor.fullName}
                </h2>
                <span className="px-2 py-0.5 rounded-md bg-white/90 border border-[#A9CFF7] text-[#1E4D5C] font-mono text-[11px] font-semibold">
                  {doctor.registrationNo}
                </span>
              </div>
              <p className="text-xs text-[#4B6385] mt-0.5 truncate">
                {doctor.speciality} · {doctor.hospitalName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            {onDownloadExcelBackup && (
              <button
                type="button"
                onClick={onDownloadExcelBackup}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white/95 hover:bg-[#EBFBF3] text-emerald-950 border border-[#A7F3D0] shadow-2xs transition-colors cursor-pointer"
                title="Download your multi-sheet OPD & OT Excel register (.xlsx)"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                <span>Export Excel (.xlsx)</span>
              </button>
            )}

            {!isEditing ? (
              <button
                type="button"
                onClick={() => {
                  setIsEditing(true);
                  setSuccessMessage(null);
                  setErrorMessage(null);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-[#E1F7FC] hover:bg-[#CBEPF8] text-[#1E4D5C] border border-[#A9CFF7] shadow-2xs transition-colors cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit Profile</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  resetFormFromDoctor();
                  setIsEditing(false);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white hover:bg-[#FAF8F5] text-[#4B6385] border border-[#D6DDF8] transition-colors cursor-pointer"
              >
                <span>Cancel Edit</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-[#4B6385] hover:text-[#1E3A5F] hover:bg-white/80 transition-colors"
              title="Close Doctor Profile"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body Content */}
        <div className="p-6 max-h-[80vh] overflow-y-auto">
          {errorMessage && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{successMessage}</span>
            </div>
          )}

          {!isEditing ? (
            /* ================= VIEW DOCTOR PROFILE MODE ================= */
            <div className="space-y-5">
              {/* Credentials & Qualifications Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    <Stethoscope className="w-3.5 h-3.5 text-teal-600" />
                    <span>Doctor Full Name</span>
                  </div>
                  <div className="text-sm font-bold text-slate-900 mt-1">
                    {doctor.fullName}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    <FileBadge className="w-3.5 h-3.5 text-teal-600" />
                    <span>Medical Council Reg. No.</span>
                  </div>
                  <div className="text-sm font-mono font-bold text-slate-900 mt-1">
                    {doctor.registrationNo}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    <Award className="w-3.5 h-3.5 text-teal-600" />
                    <span>Qualifications / Degrees</span>
                  </div>
                  <div className="text-xs font-semibold text-slate-800 mt-1">
                    {doctor.qualification}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    <UserCheck className="w-3.5 h-3.5 text-teal-600" />
                    <span>Clinical Speciality</span>
                  </div>
                  <div className="text-xs font-semibold text-slate-800 mt-1">
                    {doctor.speciality}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    <Building2 className="w-3.5 h-3.5 text-teal-600" />
                    <span>Hospital / Clinic Name</span>
                  </div>
                  <div className="text-xs font-semibold text-slate-800 mt-1">
                    {doctor.hospitalName}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
                    <span>Department</span>
                  </div>
                  <div className="text-xs font-semibold text-slate-800 mt-1">
                    {doctor.department}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    <Mail className="w-3.5 h-3.5 text-teal-600" />
                    <span>Official Email Address</span>
                  </div>
                  <div className="text-xs font-medium text-slate-800 mt-1 break-all">
                    {doctor.email}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    <Phone className="w-3.5 h-3.5 text-teal-600" />
                    <span>Phone / Mobile Number</span>
                  </div>
                  <div className="text-xs font-mono font-semibold text-slate-800 mt-1">
                    {doctor.phone}
                  </div>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <MapPin className="w-3.5 h-3.5 text-teal-600" />
                  <span>Clinic / Hospital Address</span>
                </div>
                <div className="text-xs font-medium text-slate-800 mt-1">
                  {doctor.clinicAddress ? doctor.clinicAddress : 'Not specified'}
                </div>
              </div>

              {/* A4 Prescription Header Stamp Preview */}
              <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-teal-700 mb-1">
                    A4 Case Sheet &amp; Prescription Header Stamp
                  </div>
                  <div className="text-xs font-black text-slate-900 uppercase">
                    {doctor.department}
                  </div>
                  <div className="text-xs font-bold text-slate-800 mt-0.5">
                    {doctor.fullName} — <span className="font-normal text-slate-600">{doctor.qualification}</span>
                  </div>
                  <div className="text-[11px] text-slate-600">
                    {doctor.speciality} · Reg. No: <span className="font-mono font-semibold">{doctor.registrationNo}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(true);
                    setSuccessMessage(null);
                    setErrorMessage(null);
                  }}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-teal-700 hover:bg-teal-800 text-white shadow-xs transition-colors shrink-0 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit Fields</span>
                </button>
              </div>

              {/* Local Computer File System Storage Section */}
              <div className="rounded-xl border border-[#D6DDF8] bg-gradient-to-r from-[#F4F1FA] via-[#E1F7FC]/75 to-[#EBFBF3]/70 text-[#2D2A3E] p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-white border border-[#A9CFF7] flex items-center justify-center text-[#387589] shrink-0">
                      <HardDrive className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-[#2D2A3E]">
                          Local Computer File System Storage
                        </span>
                        {localStorageConfig?.enabled ? (
                          <span className="px-2 py-0.5 rounded-md bg-[#EBFBF3] border border-[#A7F3D0] text-[#065F46] text-[10px] font-bold">
                            Active {localStorageConfig.hasNativeDirectoryHandle ? '· Direct OS Folder' : '· Local Disk & Computer'}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-[#FEF3C7] border border-[#FDE68A] text-[#92400E] text-[10px] font-bold">
                            Browser Storage Only
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#4B6385] mt-0.5">
                        Stores your OPD patient register on your computer alongside Browser local storage
                      </p>
                    </div>
                  </div>

                  {onOpenLocalStorageSetup && (
                    <button
                      type="button"
                      onClick={onOpenLocalStorageSetup}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-white hover:bg-[#E1F7FC] text-[#1E4D5C] border border-[#A9CFF7] transition-colors cursor-pointer"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>
                        {localStorageConfig?.enabled
                          ? 'Change Computer Folder / Settings'
                          : 'Set Up Computer Storage'}
                      </span>
                    </button>
                  )}
                </div>

                {localStorageConfig && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    <div className="p-2.5 rounded-lg bg-white/90 border border-[#D6DDF8]">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[#6B647B]">
                        Computer Storage Location
                      </div>
                      <div className="text-xs font-mono text-[#1E4D5C] mt-0.5 break-all">
                        {localStorageConfig.folderPathDisplay || 'Not configured'}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-white/90 border border-[#D6DDF8]">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[#6B647B]">
                        Saved Computer Files ({consultationsCount} records)
                      </div>
                      <div className="text-xs font-mono text-[#2D2A3E] mt-0.5 break-all">
                        {localStorageConfig.fileNamePrefix}
                        {localStorageConfig.saveFormat === 'both'
                          ? '.xlsx & .json'
                          : localStorageConfig.saveFormat === 'xlsx-only'
                          ? '.xlsx'
                          : '.json'}
                      </div>
                      {localStorageConfig.lastSyncedAt && (
                        <div className="text-[10px] text-[#059669] mt-0.5 font-semibold">
                          Last saved: {new Date(localStorageConfig.lastSyncedAt).toLocaleString()}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {onDownloadExcelBackup && (
                    <button
                      type="button"
                      onClick={onDownloadExcelBackup}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white hover:bg-[#EBFBF3] text-emerald-950 border border-[#A7F3D0] shadow-2xs transition-colors cursor-pointer"
                      title="Download full multi-sheet Excel register (.xlsx)"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-emerald-700 shrink-0" />
                      <span>Export Excel (.xlsx) ({consultationsCount})</span>
                    </button>
                  )}

                  {onSyncLocalComputerNow && (
                    <button
                      type="button"
                      onClick={onSyncLocalComputerNow}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white hover:bg-[#EBFBF3] text-[#115E59] border border-[#A7F3D0] transition-colors cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Save / Download to Computer Now</span>
                    </button>
                  )}

                  {onImportFromLocalComputerFile && (
                    <>
                      <input
                        ref={restoreInputRef}
                        type="file"
                        accept=".json,application/json"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            onImportFromLocalComputerFile(file);
                            e.target.value = '';
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => restoreInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white hover:bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] transition-colors cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5 text-amber-600" />
                        <span>Load Backup from Computer (.json)</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* ================= EDIT DOCTOR PROFILE FORM (SAME FIELDS AS NEW REGISTER SECTION) ================= */
            <form onSubmit={handleSaveChanges} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Doctor Full Name *
                  </label>
                  <div className="relative flex items-center">
                    <Stethoscope className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Dr. Full Name"
                      maxLength={100}
                      className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 focus:bg-white border border-slate-300 focus:border-teal-600 rounded-lg outline-none font-semibold"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Medical Council Reg. No. *
                  </label>
                  <div className="relative flex items-center">
                    <FileBadge className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
                    <input
                      type="text"
                      value={registrationNo}
                      onChange={(e) => setRegistrationNo(e.target.value)}
                      placeholder="e.g. REG/2024/12345"
                      maxLength={60}
                      className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 focus:bg-white border border-slate-300 focus:border-teal-600 rounded-lg outline-none font-mono"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Qualifications / Degrees *
                  </label>
                  <div className="relative flex items-center">
                    <Award className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
                    <input
                      type="text"
                      value={qualification}
                      onChange={(e) => setQualification(e.target.value)}
                      placeholder="MBBS, MS, MCh (Urology)"
                      maxLength={120}
                      className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 focus:bg-white border border-slate-300 focus:border-teal-600 rounded-lg outline-none"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Clinical Speciality *
                  </label>
                  <input
                    type="text"
                    value={speciality}
                    onChange={(e) => setSpeciality(e.target.value)}
                    placeholder="Consultant Urologist & Andrologist"
                    maxLength={100}
                    className="w-full px-3 py-2 text-xs bg-slate-50 focus:bg-white border border-slate-300 focus:border-teal-600 rounded-lg outline-none"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Hospital / Clinic Name *
                  </label>
                  <div className="relative flex items-center">
                    <Building2 className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
                    <input
                      type="text"
                      value={hospitalName}
                      onChange={(e) => setHospitalName(e.target.value)}
                      placeholder="Hospital or Clinic Name"
                      maxLength={150}
                      className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 focus:bg-white border border-slate-300 focus:border-teal-600 rounded-lg outline-none"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Department *
                  </label>
                  <input
                    type="text"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="e.g. Department of Urology"
                    maxLength={100}
                    className="w-full px-3 py-2 text-xs bg-slate-50 focus:bg-white border border-slate-300 focus:border-teal-600 rounded-lg outline-none"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Official Email Address *
                  </label>
                  <div className="relative flex items-center">
                    <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="doctor@clinic.com"
                      maxLength={150}
                      className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 focus:bg-white border border-slate-300 focus:border-teal-600 rounded-lg outline-none"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Phone / Mobile Number *
                  </label>
                  <div className="relative flex items-center">
                    <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+91 90000 00000"
                      maxLength={30}
                      className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 focus:bg-white border border-slate-300 focus:border-teal-600 rounded-lg outline-none font-mono"
                      required
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Clinic / Hospital Address (Optional)
                </label>
                <div className="relative flex items-center">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
                  <input
                    type="text"
                    value={clinicAddress}
                    onChange={(e) => setClinicAddress(e.target.value)}
                    placeholder="Clinic / Hospital Street Address, City"
                    maxLength={250}
                    className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 focus:bg-white border border-slate-300 focus:border-teal-600 rounded-lg outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-200/80">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Change Password (Optional)
                  </label>
                  <div className="relative flex items-center">
                    <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Leave blank to keep current"
                      className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 focus:bg-white border border-slate-300 focus:border-teal-600 rounded-lg outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Confirm New Password
                  </label>
                  <div className="relative flex items-center">
                    <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                      className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 focus:bg-white border border-slate-300 focus:border-teal-600 rounded-lg outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-2.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteConfirm(true);
                    setErrorMessage(null);
                    setSuccessMessage(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Doctor Profile &amp; All Records</span>
                </button>

                <div className="flex items-center gap-2.5 ml-auto">
                  <button
                    type="button"
                    onClick={() => {
                      resetFormFromDoctor();
                      setShowDeleteConfirm(false);
                      setIsEditing(false);
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving || isDeletingProfile}
                    className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold bg-teal-700 hover:bg-teal-800 text-white shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{isSaving ? 'Saving Profile...' : 'Save Profile Changes'}</span>
                  </button>
                </div>
              </div>

              {/* Delete Doctor Profile & All Records Confirmation Box */}
              {showDeleteConfirm && (
                <div className="mt-4 rounded-2xl border-2 border-rose-300 bg-rose-50/90 p-4 space-y-4 animate-in fade-in duration-150">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-rose-950">
                        Delete Doctor Profile &amp; All Patient Records?
                      </h3>
                      <p className="text-xs text-rose-800 mt-0.5 leading-relaxed">
                        This action will permanently delete the profile for{' '}
                        <strong>{doctor.fullName}</strong> ({doctor.registrationNo}) along with{' '}
                        <strong>
                          all {consultationsCount} patient consultation record
                          {consultationsCount === 1 ? '' : 's'}
                        </strong>{' '}
                        stored locally in this browser and local workspace.
                      </p>
                    </div>
                  </div>

                  {/* Step 1: Ask if they want to keep a backup before deleting */}
                  <div className="rounded-xl bg-white border border-rose-200 p-3.5 space-y-3">
                    <div className="text-xs font-bold text-slate-900">
                      1. Do you want to keep a backup of your {consultationsCount} patient record
                      {consultationsCount === 1 ? '' : 's'} before deleting?
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <label
                        className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                          backupChoice === 'keep-backup'
                            ? 'border-teal-600 bg-teal-50/70 text-teal-950 font-semibold'
                            : 'border-slate-200 bg-slate-50 text-slate-700'
                        }`}
                      >
                        <input
                          type="radio"
                          name="deleteBackupChoice"
                          checked={backupChoice === 'keep-backup'}
                          onChange={() => setBackupChoice('keep-backup')}
                          className="mt-0.5 accent-teal-600"
                        />
                        <div>
                          <div>Yes, keep a backup on my computer first</div>
                          <div className="text-[11px] font-normal text-slate-500 mt-0.5">
                            Download Excel (.xlsx) or JSON backup before erasing
                          </div>
                        </div>
                      </label>

                      <label
                        className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                          backupChoice === 'no-backup'
                            ? 'border-rose-600 bg-rose-50/70 text-rose-950 font-semibold'
                            : 'border-slate-200 bg-slate-50 text-slate-700'
                        }`}
                      >
                        <input
                          type="radio"
                          name="deleteBackupChoice"
                          checked={backupChoice === 'no-backup'}
                          onChange={() => setBackupChoice('no-backup')}
                          className="mt-0.5 accent-rose-600"
                        />
                        <div>
                          <div>No backup needed — delete everything</div>
                          <div className="text-[11px] font-normal text-slate-500 mt-0.5">
                            Erase profile &amp; all records without saving a copy
                          </div>
                        </div>
                      </label>
                    </div>

                    {backupChoice === 'keep-backup' && (
                      <div className="pt-1 flex flex-wrap items-center gap-2">
                        {onDownloadExcelBackup && (
                          <button
                            type="button"
                            onClick={() => {
                              onDownloadExcelBackup();
                              setHasDownloadedBackup(true);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs transition-colors cursor-pointer"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                            <span>Download Excel Backup (.xlsx)</span>
                          </button>
                        )}
                        {onDownloadJsonBackup && (
                          <button
                            type="button"
                            onClick={() => {
                              onDownloadJsonBackup();
                              setHasDownloadedBackup(true);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-900 text-white shadow-xs transition-colors cursor-pointer"
                          >
                            <FileJson className="w-3.5 h-3.5 text-teal-300" />
                            <span>Download Full Backup (.json + .xlsx)</span>
                          </button>
                        )}
                        {hasDownloadedBackup && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Backup downloaded to your computer</span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Step 2: Final Confirmation Checkbox */}
                  <label className="flex items-start gap-2.5 p-3 rounded-xl bg-white border border-rose-200 text-xs text-rose-950 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={confirmDeleteChecked}
                      onChange={(e) => setConfirmDeleteChecked(e.target.checked)}
                      className="mt-0.5 accent-rose-600 w-4 h-4 rounded"
                    />
                    <span>
                      I confirm that I want to permanently delete the doctor profile for{' '}
                      <strong>{doctor.fullName}</strong> and erase all{' '}
                      <strong>{consultationsCount}</strong> patient records. This action cannot be
                      undone.
                    </span>
                  </label>

                  <div className="flex items-center justify-end gap-2.5 pt-1">
                    <button
                      type="button"
                      disabled={isDeletingProfile}
                      onClick={() => {
                        setShowDeleteConfirm(false);
                        setConfirmDeleteChecked(false);
                      }}
                      className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 transition-colors cursor-pointer"
                    >
                      Keep My Profile
                    </button>
                    <button
                      type="button"
                      disabled={
                        !confirmDeleteChecked ||
                        isDeletingProfile ||
                        (backupChoice === 'keep-backup' &&
                          consultationsCount > 0 &&
                          !hasDownloadedBackup)
                      }
                      onClick={async () => {
                        if (!onDeleteDoctorAccount) return;
                        setIsDeletingProfile(true);
                        setErrorMessage(null);
                        try {
                          await onDeleteDoctorAccount();
                        } catch (err: any) {
                          console.error('Failed to delete doctor profile:', err);
                          setErrorMessage(
                            err?.message || 'Failed to delete doctor profile. Please try again.'
                          );
                          setIsDeletingProfile(false);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>
                        {isDeletingProfile
                          ? 'Deleting Profile & Records...'
                          : backupChoice === 'keep-backup' &&
                            consultationsCount > 0 &&
                            !hasDownloadedBackup
                          ? 'Download Backup Above First to Delete'
                          : 'Confirm & Permanently Delete Profile'}
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </form>
          )}
        </div>

        {/* Footer when in View Mode */}
        {!isEditing && (
          <div className="bg-slate-50 border-t border-slate-200 px-6 py-3.5 flex items-center justify-between">
            <span className="text-[11px] text-slate-500">
              Click <strong>Edit Profile</strong> to update any doctor registration fields.
            </span>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
