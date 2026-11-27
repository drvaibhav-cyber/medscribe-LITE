export interface DoctorAccount {
  uid: string;
  fullName: string;
  qualification: string;
  speciality: string;
  registrationNo: string;
  hospitalName: string;
  department: string;
  email: string;
  phone: string;
  clinicAddress: string;
  authMode?: 'local';
}

// In-memory only active doctor session (never persisted to localStorage)
let runtimeActiveDoctor: DoctorAccount | null = null;

export function getRuntimeActiveDoctor(): DoctorAccount | null {
  return runtimeActiveDoctor;
}

export function setRuntimeActiveDoctor(doctor: DoctorAccount | null): void {
  runtimeActiveDoctor = doctor;
}

export function sanitizeConsultationDocId(rawId?: string): string {
  const cleaned = String(rawId || `c-${Date.now()}`)
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
  return cleaned || `c-${Date.now()}`;
}
