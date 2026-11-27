import React, { useState } from 'react';
import {
  Stethoscope,
  ShieldCheck,
  Building2,
  Award,
  Phone,
  Mail,
  Lock,
  LogIn,
  UserPlus,
  CheckCircle2,
  AlertCircle,
  MapPin,
  FileBadge,
} from 'lucide-react';
import { DoctorAccount } from '../types/doctor';
import { MedScribeLogo } from './MedScribeLogo';

interface StoredLocalDoctor extends DoctorAccount {
  passwordHash: string;
}

const LOCAL_DOCTORS_STORAGE_KEY = 'medscribe_registered_doctors_v1';

export function loadRegisteredDoctors(): StoredLocalDoctor[] {
  try {
    const raw = localStorage.getItem(LOCAL_DOCTORS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return [];
    const cleaned = parsed.filter(
      (d: StoredLocalDoctor) => d && d.uid && d.uid !== 'demo-dr-vaibhav'
    );
    if (cleaned.length !== parsed.length) {
      localStorage.setItem(LOCAL_DOCTORS_STORAGE_KEY, JSON.stringify(cleaned));
    }
    return cleaned;
  } catch {
    return [];
  }
}

export function saveRegisteredDoctors(list: StoredLocalDoctor[]) {
  try {
    localStorage.setItem(LOCAL_DOCTORS_STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    console.error('Failed to persist local doctor directory:', e);
  }
}

export function updateRegisteredDoctorProfile(
  updatedDoctor: DoctorAccount,
  newPassword?: string
): DoctorAccount {
  const list = loadRegisteredDoctors();
  const existingIdx = list.findIndex((d) => d.uid === updatedDoctor.uid);
  if (existingIdx >= 0) {
    const existing = list[existingIdx];
    const merged: StoredLocalDoctor = {
      ...existing,
      ...updatedDoctor,
      passwordHash: newPassword && newPassword.trim().length >= 4 ? newPassword.trim() : existing.passwordHash,
    };
    const nextList = [...list];
    nextList[existingIdx] = merged;
    saveRegisteredDoctors(nextList);
    return merged;
  } else {
    const added: StoredLocalDoctor = {
      ...updatedDoctor,
      passwordHash: newPassword && newPassword.trim().length >= 4 ? newPassword.trim() : '',
    };
    saveRegisteredDoctors([added, ...list]);
    return added;
  }
}

export function deleteRegisteredDoctorProfile(doctorUid: string): void {
  try {
    const raw = localStorage.getItem(LOCAL_DOCTORS_STORAGE_KEY);
    const list: StoredLocalDoctor[] = raw ? JSON.parse(raw) : [];
    const filtered = (Array.isArray(list) ? list : []).filter(
      (d) => d.uid !== doctorUid && d.uid !== 'demo-dr-vaibhav'
    );
    localStorage.setItem(LOCAL_DOCTORS_STORAGE_KEY, JSON.stringify(filtered));
  } catch (e) {
    console.error('Failed to delete doctor from local directory:', e);
  }
}

interface DoctorAuthPageProps {
  initialMode?: 'login' | 'register';
  onAuthenticated: (doctor: DoctorAccount) => void;
  onCancel?: () => void;
}

export const DoctorAuthPage: React.FC<DoctorAuthPageProps> = ({
  initialMode = 'login',
  onAuthenticated,
  onCancel,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>(() =>
    initialMode === 'login' && loadRegisteredDoctors().length === 0 ? 'register' : initialMode
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  // Login Form State (never pre-filled)
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register Form State
  const [fullName, setFullName] = useState('');
  const [qualification, setQualification] = useState('');
  const [speciality, setSpeciality] = useState('');
  const [registrationNo, setRegistrationNo] = useState('');
  const [hospitalName, setHospitalName] = useState('');
  const [department, setDepartment] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [clinicAddress, setClinicAddress] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Handle Credentials Login
  const handleCredentialLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setStatusBanner(null);

    const cleanId = loginIdentifier.trim().toLowerCase();
    const cleanPass = loginPassword.trim();

    if (!cleanId || !cleanPass) {
      setErrorMessage('Please enter your registered Email / Medical Registration No. and Password.');
      return;
    }

    const doctors = loadRegisteredDoctors();
    const matched = doctors.find(
      (d) =>
        d.email.trim().toLowerCase() === cleanId ||
        d.registrationNo.trim().toLowerCase() === cleanId ||
        d.fullName.trim().toLowerCase() === cleanId
    );

    if (!matched) {
      setErrorMessage(
        'No doctor account found matching that Email or Medical Council Registration No. Please register a local doctor account first.'
      );
      return;
    }

    if (matched.passwordHash !== cleanPass) {
      setErrorMessage('Invalid clinic password. Please verify your credentials and try again.');
      return;
    }

    onAuthenticated(matched);
  };

  // Handle Doctor Registration Form Submit
  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setStatusBanner(null);

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
    if (!email.trim() || !email.includes('@')) {
      setErrorMessage('Please enter a valid official email address.');
      return;
    }
    if (!phone.trim() || phone.trim().length < 5) {
      setErrorMessage('Please enter a valid contact phone number.');
      return;
    }
    if (!password || password.length < 4) {
      setErrorMessage('Please choose a password with at least 4 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please re-enter your confirmation password.');
      return;
    }

    const doctors = loadRegisteredDoctors();
    const duplicate = doctors.find(
      (d) =>
        d.email.trim().toLowerCase() === email.trim().toLowerCase() ||
        d.registrationNo.trim().toLowerCase() === registrationNo.trim().toLowerCase()
    );

    const newUid =
      duplicate?.uid || `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const newDoctor: StoredLocalDoctor = {
      uid: newUid,
      fullName: normalizedName.slice(0, 100),
      qualification: (qualification.trim() || 'MBBS, MS').slice(0, 120),
      speciality: (speciality.trim() || 'Consultant Physician').slice(0, 100),
      registrationNo: registrationNo.trim().slice(0, 60),
      hospitalName: (hospitalName.trim() || 'Medical Clinic').slice(0, 150),
      department: (department.trim() || 'Clinical Department').slice(0, 100),
      email: email.trim().slice(0, 150),
      phone: phone.trim().slice(0, 30),
      clinicAddress: clinicAddress.trim().slice(0, 250),
      passwordHash: password,
      authMode: 'local',
    };

    if (!duplicate) {
      const doctorStorageKey = `medscribe_opd_consultations_v2_${newUid.replace(
        /[^a-zA-Z0-9_-]/g,
        '_'
      )}`;
      try {
        localStorage.setItem(doctorStorageKey, JSON.stringify([]));
      } catch (err) {
        console.error('Failed to initialize isolated doctor patient storage:', err);
      }
    }

    const updatedList = duplicate
      ? doctors.map((d) => (d.uid === duplicate.uid ? newDoctor : d))
      : [newDoctor, ...doctors];

    saveRegisteredDoctors(updatedList);
    onAuthenticated(newDoctor);
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-slate-900 flex flex-col justify-between font-sans">
      {/* Top Clinical Brand Bar with MedScribe Logo */}
      <header className="bg-[#FDFBF9] border-b border-[#E5DFEE] px-6 py-3.5">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-6">
          <MedScribeLogo variant="horizontal" size="md" subtitleText="Local OPD & IPD EMR" />

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setErrorMessage(null);
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                mode === 'login'
                  ? 'bg-[#DDD6FE] text-violet-950 border border-[#C4B5FD]'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-[#F3F0FA]'
              }`}
            >
              Doctor Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setErrorMessage(null);
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                mode === 'register'
                  ? 'bg-[#D1FAE5] text-emerald-950 border border-[#6EE7B7]'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-[#F3F0FA]'
              }`}
            >
              Doctor Registration
            </button>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-700 bg-[#F3F0FA] hover:bg-[#E7E2F6] border border-[#DFD8F0] transition-colors whitespace-nowrap cursor-pointer"
              >
                Back to Clinical Desk
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Split Portal in Pastel Theme */}
      <main className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-12 bg-white border border-[#E2DCF0] rounded-2xl shadow-xs overflow-hidden items-stretch">
          {/* Left Column: MedScribe Logo Showcase & Registered Doctors Quick Access */}
          <div className="lg:col-span-5 bg-gradient-to-br from-[#F3EEFF] via-[#EDF6FF] to-[#E9FBF3] text-slate-800 p-6 sm:p-8 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-[#E2DCF0]">
            <div className="space-y-6">
              {/* Centered Stacked MedScribe Logo Showcase */}
              <div className="bg-white/95 border border-[#DFD8F0] rounded-2xl p-5 flex flex-col items-center justify-center shadow-2xs">
                <MedScribeLogo variant="stacked" size="xl" subtitleText="Local OPD & IPD EMR" />
              </div>

              <div>
                <div className="inline-flex items-center gap-2 text-xs text-violet-800 font-semibold mb-1.5">
                  <Stethoscope className="w-4 h-4 text-teal-700" />
                  <span>Physician Portal · Local OPD &amp; IPD EMR</span>
                </div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 leading-tight">
                  {mode === 'login'
                    ? 'Physician Portal Sign In'
                    : 'New Doctor Registration'}
                </h1>
                <p className="text-xs sm:text-sm text-slate-700 mt-2 leading-relaxed">
                  {mode === 'login'
                    ? 'Access your local OPD consultation workspace, OT notes register, IPD ward charts, monthly Excel consultation sheets, and A4 hospital prescription printing.'
                    : 'Register your medical council credentials, speciality, and hospital department to personalize prescriptions, OT sheets, and local OPD registers.'}
                </p>
              </div>

              <div className="space-y-2.5 pt-3 border-t border-[#DFD8F0] text-xs text-slate-700">
                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
                  <span>
                    Verified Medical Council Registration No. &amp; qualification stamped on A4 printouts
                  </span>
                </div>
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-violet-700 shrink-0 mt-0.5" />
                  <span>
                    Smart field-level memory for your most prescribed medicines and diagnoses
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-6 mt-6 border-t border-[#DFD8F0] text-[11px] text-slate-600 leading-relaxed">
              Sign in with your registered credentials each session. All patient records stay private on this device.
            </div>
          </div>

          {/* Right Column: Login or Registration Form */}
          <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-between bg-[#FFFDFB]">
            <div>
              {/* Mode Switch Tabs */}
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#F3F0FA] border border-[#E4DFF3] rounded-xl mb-6">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setErrorMessage(null);
                  }}
                  className={`py-2 px-4 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                    mode === 'login'
                      ? 'bg-[#DDD6FE] text-violet-950 border border-[#C4B5FD] shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <LogIn className="w-3.5 h-3.5 text-violet-800" />
                  <span>Doctor Login</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setErrorMessage(null);
                  }}
                  className={`py-2 px-4 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                    mode === 'register'
                      ? 'bg-[#D1FAE5] text-emerald-950 border border-[#6EE7B7] shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <UserPlus className="w-3.5 h-3.5 text-emerald-800" />
                  <span>Register New Doctor</span>
                </button>
              </div>

              {errorMessage && (
                <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {statusBanner && (
                <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{statusBanner}</span>
                </div>
              )}

              {mode === 'login' ? (
                /* ================= DOCTOR LOGIN FORM ================= */
                <div className="space-y-5">
                  <form onSubmit={handleCredentialLogin} autoComplete="off" className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Doctor Email or Medical Council Registration No.
                      </label>
                      <div className="relative flex items-center">
                        <Mail className="w-4 h-4 text-violet-500 absolute left-3 pointer-events-none" />
                        <input
                          type="text"
                          value={loginIdentifier}
                          onChange={(e) => setLoginIdentifier(e.target.value)}
                          placeholder="doctor@clinic.com or Medical Reg. No."
                          autoComplete="off"
                          className="w-full pl-9 pr-3 py-2.5 text-xs bg-[#F7F5FC] focus:bg-white border border-[#DFD8F0] focus:border-violet-400 rounded-xl outline-none transition-colors"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-semibold text-slate-700">
                          Clinic Password / PIN
                        </label>
                      </div>
                      <div className="relative flex items-center">
                        <Lock className="w-4 h-4 text-violet-500 absolute left-3 pointer-events-none" />
                        <input
                          type="password"
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          placeholder="Enter password"
                          autoComplete="new-password"
                          className="w-full pl-9 pr-3 py-2.5 text-xs bg-[#F7F5FC] focus:bg-white border border-[#DFD8F0] focus:border-violet-400 rounded-xl outline-none transition-colors"
                          required
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full py-2.5 px-4 bg-[#DDD6FE] hover:bg-[#C4B5FD] text-violet-950 border border-[#C4B5FD] text-xs font-bold rounded-xl shadow-2xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <LogIn className="w-4 h-4 text-violet-800" />
                      <span>Sign In to MedScribe Clinical Desk</span>
                    </button>
                  </form>

                  <div className="pt-3 text-center">
                    <p className="text-xs text-slate-600">
                      New consultant joining the department?{' '}
                      <button
                        type="button"
                        onClick={() => {
                          setMode('register');
                          setErrorMessage(null);
                        }}
                        className="font-bold text-violet-800 hover:underline cursor-pointer"
                      >
                        Register Doctor Account
                      </button>
                    </p>
                  </div>
                </div>
              ) : (
                /* ================= DOCTOR REGISTRATION FORM ================= */
                <form onSubmit={handleRegisterSubmit} autoComplete="off" className="space-y-3.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Doctor Full Name *
                      </label>
                      <div className="relative flex items-center">
                        <Stethoscope className="w-3.5 h-3.5 text-violet-500 absolute left-3 pointer-events-none" />
                        <input
                          type="text"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="Dr. Full Name"
                          maxLength={100}
                          className="w-full pl-8 pr-3 py-2 text-xs bg-[#F7F5FC] focus:bg-white border border-[#DFD8F0] focus:border-violet-400 rounded-lg outline-none font-semibold"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Medical Council Reg. No. *
                      </label>
                      <div className="relative flex items-center">
                        <FileBadge className="w-3.5 h-3.5 text-violet-500 absolute left-3 pointer-events-none" />
                        <input
                          type="text"
                          value={registrationNo}
                          onChange={(e) => setRegistrationNo(e.target.value)}
                          placeholder="e.g. REG/2024/12345"
                          maxLength={60}
                          className="w-full pl-8 pr-3 py-2 text-xs bg-[#F7F5FC] focus:bg-white border border-[#DFD8F0] focus:border-violet-400 rounded-lg outline-none font-mono"
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
                        <Award className="w-3.5 h-3.5 text-violet-500 absolute left-3 pointer-events-none" />
                        <input
                          type="text"
                          value={qualification}
                          onChange={(e) => setQualification(e.target.value)}
                          placeholder="e.g. MBBS, MS, MCh"
                          maxLength={120}
                          className="w-full pl-8 pr-3 py-2 text-xs bg-[#F7F5FC] focus:bg-white border border-[#DFD8F0] focus:border-violet-400 rounded-lg outline-none"
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
                        placeholder="e.g. Consultant Surgeon / Physician"
                        maxLength={100}
                        className="w-full px-3 py-2 text-xs bg-[#F7F5FC] focus:bg-white border border-[#DFD8F0] focus:border-violet-400 rounded-lg outline-none"
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
                        <Building2 className="w-3.5 h-3.5 text-violet-500 absolute left-3 pointer-events-none" />
                        <input
                          type="text"
                          value={hospitalName}
                          onChange={(e) => setHospitalName(e.target.value)}
                          placeholder="Hospital or Clinic Name"
                          maxLength={150}
                          className="w-full pl-8 pr-3 py-2 text-xs bg-[#F7F5FC] focus:bg-white border border-[#DFD8F0] focus:border-violet-400 rounded-lg outline-none"
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
                        className="w-full px-3 py-2 text-xs bg-[#F7F5FC] focus:bg-white border border-[#DFD8F0] focus:border-violet-400 rounded-lg outline-none"
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
                        <Mail className="w-3.5 h-3.5 text-violet-500 absolute left-3 pointer-events-none" />
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="doctor@clinic.com"
                          maxLength={150}
                          className="w-full pl-8 pr-3 py-2 text-xs bg-[#F7F5FC] focus:bg-white border border-[#DFD8F0] focus:border-violet-400 rounded-lg outline-none"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Phone / Mobile Number *
                      </label>
                      <div className="relative flex items-center">
                        <Phone className="w-3.5 h-3.5 text-violet-500 absolute left-3 pointer-events-none" />
                        <input
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="+91 90000 00000"
                          maxLength={30}
                          className="w-full pl-8 pr-3 py-2 text-xs bg-[#F7F5FC] focus:bg-white border border-[#DFD8F0] focus:border-violet-400 rounded-lg outline-none font-mono"
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
                      <MapPin className="w-3.5 h-3.5 text-violet-500 absolute left-3 pointer-events-none" />
                      <input
                        type="text"
                        value={clinicAddress}
                        onChange={(e) => setClinicAddress(e.target.value)}
                        placeholder="Clinic / Hospital Street Address, City"
                        maxLength={250}
                        className="w-full pl-8 pr-3 py-2 text-xs bg-[#F7F5FC] focus:bg-white border border-[#DFD8F0] focus:border-violet-400 rounded-lg outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Create Password *
                      </label>
                      <div className="relative flex items-center">
                        <Lock className="w-3.5 h-3.5 text-violet-500 absolute left-3 pointer-events-none" />
                        <input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Min 4 characters"
                          className="w-full pl-8 pr-3 py-2 text-xs bg-[#F7F5FC] focus:bg-white border border-[#DFD8F0] focus:border-violet-400 rounded-lg outline-none"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Confirm Password *
                      </label>
                      <div className="relative flex items-center">
                        <Lock className="w-3.5 h-3.5 text-violet-500 absolute left-3 pointer-events-none" />
                        <input
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Confirm password"
                          className="w-full pl-8 pr-3 py-2 text-xs bg-[#F7F5FC] focus:bg-white border border-[#DFD8F0] focus:border-violet-400 rounded-lg outline-none"
                          required
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 flex flex-col sm:flex-row items-center gap-2.5">
                    <button
                      type="submit"
                      className="w-full py-2.5 px-4 bg-[#D1FAE5] hover:bg-[#A7F3D0] text-emerald-950 border border-[#6EE7B7] text-xs font-bold rounded-xl shadow-2xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <UserPlus className="w-4 h-4 text-emerald-800" />
                      <span>Complete Doctor Registration</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </main>

      <footer className="bg-[#FDFBF9] border-t border-[#E5DFEE] py-3.5 text-center text-xs text-slate-500">
        MedScribe · Local OPD, OT &amp; IPD EMR · 100% On-Device Storage
      </footer>
    </div>
  );
};
