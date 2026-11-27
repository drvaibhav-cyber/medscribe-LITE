import React, { useMemo, useState } from 'react';
import {
  Scissors,
  Plus,
  Trash2,
  Printer,
  Check,
  Search,
  X,
  ChevronDown,
  ChevronUp,
  Download,
  Edit3,
  FilePlus2,
  Calendar,
  Building2,
  Users,
  ClipboardList,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';
import { IpdPatientRecord } from '../types/ipd';
import { Consultation, OtNotes } from '../types/opd';
import { DoctorAccount } from '../types/doctor';
import {
  createEmptyOtNotes,
  getConsultationOtProcedures,
  hasOtNotesData,
  UROLOGY_OT_TEMPLATES,
} from '../utils/otNotesUtils';
import { formatDisplayDate } from '../utils/excelExporter';
import { exportOpdSheetsToPdf } from '../utils/pdfExporter';
import { MedScribeLogo } from './MedScribeLogo';

const ANAESTHESIA_QUICK_OPTIONS = ['Spinal (SA)', 'GA', 'Local', 'Epidural', 'Sedation'] as const;
const POSITION_QUICK_OPTIONS = ['Lithotomy', 'Supine', 'Prone', 'Flank', 'Modified Valdivia'] as const;

export function ipdPatientToOtConsultation(
  patient: IpdPatientRecord,
  specificOt?: OtNotes
): Consultation {
  const procs = getConsultationOtProcedures(patient as any);
  const primary = specificOt || patient.otNotes || procs[0];
  return {
    id: patient.id,
    opdNo: patient.ipdNo || patient.uhid || '',
    date: primary?.surgeryDate || patient.surgeryDate || patient.admissionDate,
    salutation: patient.salutation || '',
    patientName: patient.patientName,
    phoneNumber: patient.phoneNumber || '',
    gender: patient.gender,
    age: patient.age,
    address: patient.address || '',
    vitals: {},
    complaints: patient.clinicalSummary || '',
    historyChecklist: {},
    ipss: {},
    diagnosis: primary?.postOpDiagnosis || primary?.preOpDiagnosis || patient.admittingDiagnosis,
    prescriptions: [],
    otNotes: primary,
    otProcedures: procs,
    doctorId: patient.doctorId,
    doctorName: patient.doctorName || patient.attendingConsultant,
    department: patient.department,
    createdAt: patient.createdAt,
    updatedAt: patient.updatedAt,
  };
}

interface IpdOtNotesEditorProps {
  patient: IpdPatientRecord;
  doctor?: DoctorAccount | null;
  onUpdateOtProcedures: (procedures: OtNotes[]) => void;
  onOpenA4PrintPreview: (consultation: Consultation, mode: 'single' | 'consolidated') => void;
}

const inputBaseClass =
  'w-full px-3 py-2 text-xs border border-[#DFD8F0] rounded-xl bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-300/30 transition-all';

const textareaBaseClass =
  'w-full px-3.5 py-2.5 text-xs leading-relaxed border border-[#DFD8F0] rounded-xl bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-300/30 transition-all';

export const IpdOtNotesEditor: React.FC<IpdOtNotesEditorProps> = ({
  patient,
  doctor,
  onUpdateOtProcedures,
  onOpenA4PrintPreview,
}) => {
  const existingProcs = useMemo(() => {
    const list = getConsultationOtProcedures(patient as any);
    return list;
  }, [patient]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [confirmDeleteProc, setConfirmDeleteProc] = useState(false);
  const [showTemplatesDrawer, setShowTemplatesDrawer] = useState(false);
  const [savedToast, setSavedToast] = useState<string | null>(null);

  const safeIndex = Math.min(activeIndex, Math.max(0, existingProcs.length - 1));
  const currentOt: OtNotes | null = existingProcs[safeIndex] || null;

  const commitProcs = (nextList: OtNotes[], newIndex?: number) => {
    onUpdateOtProcedures(nextList);
    if (typeof newIndex === 'number') setActiveIndex(newIndex);
  };

  const handleAddProcedure = (initialPatch?: Partial<OtNotes>) => {
    const today = new Date().toISOString().split('T')[0];
    const created: OtNotes = {
      ...createEmptyOtNotes(),
      id: `ot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      surgeryDate: patient.surgeryDate || today,
      hospitalName: patient.hospitalName || doctor?.hospitalName || '',
      surgeonName: doctor?.fullName || patient.attendingConsultant || '',
      preOpDiagnosis: patient.admittingDiagnosis || '',
      ...initialPatch,
    };
    const nextList = [...existingProcs, created];
    commitProcs(nextList, nextList.length - 1);
  };

  const handleApplyTemplate = (tpl: (typeof UROLOGY_OT_TEMPLATES)[number]) => {
    if (!currentOt) {
      handleAddProcedure({
        procedureName: tpl.procedureName,
        anaesthesiaType: tpl.anaesthesiaType,
        patientPosition: tpl.patientPosition,
        operativeFindings: tpl.operativeFindings,
        operativeSteps: tpl.operativeSteps,
        intraOpComplications: tpl.intraOpComplications,
        estimatedBloodLoss: tpl.estimatedBloodLoss,
        catheterOrStentDetails: tpl.catheterOrStentDetails,
        drainDetails: tpl.drainDetails,
        specimenSent: tpl.specimenSent,
        postOpOrders: tpl.postOpOrders,
      });
      setShowTemplatesDrawer(false);
      setSavedToast(`Created OT Note from ${tpl.label} template`);
      setTimeout(() => setSavedToast(null), 2400);
      return;
    }
    const nextList = existingProcs.map((p, idx) =>
      idx === safeIndex
        ? {
            ...p,
            procedureName: tpl.procedureName,
            anaesthesiaType: tpl.anaesthesiaType || p.anaesthesiaType,
            patientPosition: tpl.patientPosition || p.patientPosition,
            operativeFindings: tpl.operativeFindings || p.operativeFindings,
            operativeSteps: tpl.operativeSteps || p.operativeSteps,
            intraOpComplications: tpl.intraOpComplications || p.intraOpComplications,
            estimatedBloodLoss: tpl.estimatedBloodLoss || p.estimatedBloodLoss,
            catheterOrStentDetails: tpl.catheterOrStentDetails || p.catheterOrStentDetails,
            drainDetails: tpl.drainDetails || p.drainDetails,
            specimenSent: tpl.specimenSent || p.specimenSent,
            postOpOrders: tpl.postOpOrders || p.postOpOrders,
          }
        : p
    );
    commitProcs(nextList);
    setShowTemplatesDrawer(false);
    setSavedToast(`Applied ${tpl.label} template`);
    setTimeout(() => setSavedToast(null), 2400);
  };

  const updateCurrentOt = (patch: Partial<OtNotes>) => {
    if (!currentOt) return;
    const nextList = existingProcs.map((p, idx) =>
      idx === safeIndex ? { ...p, ...patch } : p
    );
    commitProcs(nextList);
  };

  const removeCurrentOt = () => {
    if (existingProcs.length === 0) return;
    const removedName = currentOt?.procedureName || 'OT Note';
    const nextList = existingProcs.filter((_, idx) => idx !== safeIndex);
    setConfirmDeleteProc(false);
    commitProcs(nextList, Math.max(0, safeIndex - 1));
    setSavedToast(`Deleted "${removedName}" — synced across Daily Progress & OPD OT Register`);
    setTimeout(() => setSavedToast(null), 3200);
  };

  return (
    <div className="space-y-4">
      {/* Surgical Sheet Header Banner — Unified OPD Pastel Gradient + MedScribe Logo */}
      <div className="rounded-2xl border border-[#DDD6FE] bg-gradient-to-r from-[#FFFBEB] via-[#F6F3FF] to-[#F0F8FF] p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <MedScribeLogo variant="icon" size="sm" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-slate-900">
                  Operation Theatre (OT) Notes &amp; Procedures
                </h3>
                {existingProcs.length > 0 && (
                  <span className="text-xs font-mono font-semibold text-violet-800 tabular-nums">
                    · {existingProcs.length} Procedure{existingProcs.length === 1 ? '' : 's'}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                Enter operative notes manually or apply urology templates. Post-op orders
                automatically sync to Daily Progress, Medication Log &amp; OPD OT Register.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleAddProcedure()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-violet-700 hover:bg-violet-800 text-white text-xs font-bold shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add OT Procedure</span>
            </button>

            {currentOt && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    onOpenA4PrintPreview(
                      ipdPatientToOtConsultation(patient, currentOt),
                      existingProcs.length > 1 ? 'consolidated' : 'single'
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#FCD34D] text-amber-950 bg-[#FEF3C7] hover:bg-[#FDE68A] text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Printer className="w-3.5 h-3.5 text-amber-800" />
                  <span>Preview &amp; Print</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    exportOpdSheetsToPdf([ipdPatientToOtConsultation(patient, currentOt)], {
                      docType: 'ot',
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#DFD8F0] bg-white/90 hover:bg-white text-slate-800 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                  title="Download A4 OT Notes PDF"
                >
                  <Download className="w-3.5 h-3.5 text-violet-700" />
                  <span>PDF</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {savedToast && (
        <div className="p-3 rounded-xl bg-[#EBFBF3] border border-[#6EE7B7] text-xs text-emerald-900 font-semibold flex items-center gap-2">
          <Check className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
          <span>{savedToast}</span>
        </div>
      )}

      {/* Multi-Procedure Switcher + Templates Toggle + Delete */}
      {existingProcs.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2.5 bg-white rounded-xl border border-[#E6E0F0] px-3.5 py-2.5">
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[#F4F1FA] border border-[#E3DDF2] rounded-xl">
            {existingProcs.map((proc, idx) => (
              <button
                key={proc.id || idx}
                type="button"
                onClick={() => {
                  setActiveIndex(idx);
                  setConfirmDeleteProc(false);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  idx === safeIndex
                    ? 'bg-violet-700 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-violet-950 hover:bg-white/70'
                }`}
              >
                <span className="font-mono mr-1 opacity-80">#{idx + 1}</span>
                <span>{proc.procedureName || 'Untitled Procedure'}</span>
                {proc.surgeryDate ? (
                  <span
                    className={`ml-1.5 font-mono text-[11px] ${
                      idx === safeIndex ? 'text-violet-100' : 'text-slate-500'
                    }`}
                  >
                    ({formatDisplayDate(proc.surgeryDate)})
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowTemplatesDrawer((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                showTemplatesDrawer
                  ? 'bg-[#FEF3C7] border-[#FCD34D] text-amber-950'
                  : 'bg-[#FFFBEB] hover:bg-[#FEF3C7] border-[#FDE68A] text-amber-950'
              }`}
            >
              <Scissors className="w-3.5 h-3.5 text-amber-800" />
              <span>Urology Templates</span>
              {showTemplatesDrawer ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>

            {confirmDeleteProc ? (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-rose-50 border border-rose-200 text-xs">
                <span className="font-semibold text-rose-800">Delete &amp; sync removal?</span>
                <button
                  type="button"
                  onClick={removeCurrentOt}
                  className="px-2 py-0.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteProc(false)}
                  className="px-2 py-0.5 rounded-lg text-slate-600 hover:text-slate-900 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDeleteProc(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#FFF1F2] hover:bg-[#FFE4E6] border border-[#FECDD3] text-xs font-semibold text-rose-800 cursor-pointer whitespace-nowrap transition-colors"
                title="Delete this OT procedure (also removes from Daily Progress & OPD OT Register)"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete OT</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Collapsible 1-Click Urology Templates Strip when editing an OT note */}
      {currentOt && showTemplatesDrawer && (
        <div className="bg-[#FFFBEB]/80 rounded-2xl border border-[#FDE68A] p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-bold text-amber-950">
                1-Click Urology Operative Templates
              </h4>
              <p className="text-[11px] text-amber-900/75">
                Auto-populates procedure name, anaesthesia, position, standard steps, stent details &amp;
                post-op orders for the active tab.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowTemplatesDrawer(false)}
              className="p-1 rounded-lg text-amber-800 hover:bg-amber-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {UROLOGY_OT_TEMPLATES.map((tpl) => (
              <button
                key={tpl.label}
                type="button"
                onClick={() => handleApplyTemplate(tpl)}
                className="px-3 py-1.5 rounded-xl border border-[#FCD34D] bg-white hover:bg-[#FEF3C7] text-xs font-semibold text-amber-950 transition-colors cursor-pointer whitespace-nowrap"
              >
                + {tpl.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Empty State Launchpad vs Structured Operative Form */}
      {!currentOt ? (
        <div className="space-y-4">
          <div className="bg-[#FFFBEB] rounded-2xl border border-[#FDE68A] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-[#FEF3C7] border border-[#FDE68A] text-amber-800 flex items-center justify-center shrink-0">
                <FilePlus2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">New Structured OT Procedure</h4>
                <p className="text-xs text-slate-700 mt-1 leading-relaxed max-w-xl">
                  Open a clean operative record with quick anaesthesia &amp; position chips,
                  automatic Daily Progress &amp; Medication Log sync, and A4 OT sheet printing.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleAddProcedure()}
              className="py-2.5 px-4 rounded-xl bg-[#FEF3C7] hover:bg-[#FDE68A] text-amber-950 border border-[#FCD34D] font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5 text-amber-800" />
              <span>Add Blank OT Note</span>
              <ArrowRight className="w-3.5 h-3.5 text-amber-800" />
            </button>
          </div>

          {/* 1-Click Urology OT Templates Grid */}
          <div className="bg-white rounded-2xl border border-[#E6E0F0] p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                  Or Start Instantly from a Urology OT Template
                </h4>
                <p className="text-[11px] text-slate-500">
                  Pre-fills standard operative steps, findings, stent/catheter details &amp; post-op
                  orders in one click.
                </p>
              </div>
              <Scissors className="w-4 h-4 text-amber-700 shrink-0" />
            </div>
            <div className="flex flex-wrap gap-2">
              {UROLOGY_OT_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.label}
                  type="button"
                  onClick={() => handleApplyTemplate(tpl)}
                  className="px-3 py-1.5 rounded-xl border border-[#DFD8F0] bg-[#FAF8F5] hover:bg-[#FEF3C7] hover:border-[#FCD34D] text-xs font-semibold text-slate-800 hover:text-amber-950 transition-colors cursor-pointer whitespace-nowrap"
                >
                  + {tpl.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* SECTION 01: Procedure & Surgical Schedule */}
          <section className="bg-white rounded-2xl border border-[#E6E0F0] overflow-hidden">
            <div className="px-4 sm:px-5 py-3 bg-[#F6F3FF]/65 border-b border-[#E6E0F0] flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-violet-800">01.</span>
                <Calendar className="w-3.5 h-3.5 text-violet-700" />
                <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                  Procedure, Diagnosis &amp; Surgical Schedule
                </h4>
              </div>
              <span className="text-[11px] text-slate-500">
                Appears in Discharge Summary Procedure Performed &amp; OT Register
              </span>
            </div>

            <div className="p-4 sm:p-5 space-y-4">
              {/* Prominent Procedure Performed Field */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-bold text-slate-800">
                    Operation / Procedure Performed
                  </label>
                </div>
                <input
                  type="text"
                  value={currentOt.procedureName || ''}
                  onChange={(e) => updateCurrentOt({ procedureName: e.target.value })}
                  placeholder="e.g. Bipolar TURP / Right URSL + Holmium Laser Lithotripsy + DJ Stenting"
                  className={`${inputBaseClass} font-bold text-slate-900 bg-[#FDFBF9] focus:bg-white py-2.5`}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-600">Surgery Date</label>
                  <input
                    type="date"
                    value={currentOt.surgeryDate || ''}
                    onChange={(e) => updateCurrentOt({ surgeryDate: e.target.value })}
                    className={`${inputBaseClass} font-mono tabular-nums`}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-600">
                    Time / Duration
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 10:00 AM (45 min)"
                    value={currentOt.surgeryTime || ''}
                    onChange={(e) => updateCurrentOt({ surgeryTime: e.target.value })}
                    className={inputBaseClass}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-[11px] font-semibold text-slate-600 flex items-center gap-1">
                    <Building2 className="w-3 h-3 text-violet-600" />
                    <span>Hospital / OT Centre</span>
                  </label>
                  <input
                    type="text"
                    value={currentOt.hospitalName || ''}
                    onChange={(e) => updateCurrentOt({ hospitalName: e.target.value })}
                    placeholder="Hospital or surgical centre name"
                    className={inputBaseClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-600">
                    Pre-Op Diagnosis
                  </label>
                  <input
                    type="text"
                    value={currentOt.preOpDiagnosis || ''}
                    onChange={(e) => updateCurrentOt({ preOpDiagnosis: e.target.value })}
                    placeholder="e.g. Right Lower Ureteric Calculus (9 mm)"
                    className={inputBaseClass}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-600">
                    Post-Op Diagnosis
                  </label>
                  <input
                    type="text"
                    value={currentOt.postOpDiagnosis || ''}
                    onChange={(e) => updateCurrentOt({ postOpDiagnosis: e.target.value })}
                    placeholder="e.g. Complete stone clearance with DJ stent in situ"
                    className={inputBaseClass}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 02: Surgical Team, Anaesthesia & Position */}
          <section className="bg-white rounded-2xl border border-[#E6E0F0] overflow-hidden">
            <div className="px-4 sm:px-5 py-3 bg-[#F0F8FF]/70 border-b border-[#E6E0F0] flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-sky-900">02.</span>
                <Users className="w-3.5 h-3.5 text-sky-700" />
                <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                  Surgical Team, Anaesthesia &amp; Position
                </h4>
              </div>
            </div>

            <div className="p-4 sm:p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-600">
                    Operating Surgeon
                  </label>
                  <input
                    type="text"
                    value={currentOt.surgeonName || ''}
                    onChange={(e) => updateCurrentOt({ surgeonName: e.target.value })}
                    className={inputBaseClass}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-600">Assistant</label>
                  <input
                    type="text"
                    value={currentOt.assistantName || ''}
                    onChange={(e) => updateCurrentOt({ assistantName: e.target.value })}
                    placeholder="Assistant surgeon"
                    className={inputBaseClass}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-600">Anaesthetist</label>
                  <input
                    type="text"
                    value={currentOt.anaesthetistName || ''}
                    onChange={(e) => updateCurrentOt({ anaesthetistName: e.target.value })}
                    placeholder="Anaesthetist name"
                    className={inputBaseClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-slate-600">
                    Type of Anaesthesia
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Spinal (SA) / General Anaesthesia (GA)"
                    value={currentOt.anaesthesiaType || ''}
                    onChange={(e) => updateCurrentOt({ anaesthesiaType: e.target.value })}
                    className={inputBaseClass}
                  />
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {ANAESTHESIA_QUICK_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => updateCurrentOt({ anaesthesiaType: opt })}
                        className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                          (currentOt.anaesthesiaType || '').trim().toLowerCase() ===
                          opt.toLowerCase()
                            ? 'bg-violet-700 text-white border-violet-700'
                            : 'bg-[#FAF8F5] hover:bg-[#EFEBF9] text-slate-700 border-[#DFD8F0]'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-slate-600">
                    Patient Position
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Lithotomy / Prone / Flank"
                    value={currentOt.patientPosition || ''}
                    onChange={(e) => updateCurrentOt({ patientPosition: e.target.value })}
                    className={inputBaseClass}
                  />
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {POSITION_QUICK_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => updateCurrentOt({ patientPosition: opt })}
                        className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                          (currentOt.patientPosition || '').trim().toLowerCase() ===
                          opt.toLowerCase()
                            ? 'bg-violet-700 text-white border-violet-700'
                            : 'bg-[#FAF8F5] hover:bg-[#EFEBF9] text-slate-700 border-[#DFD8F0]'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 03: Intra-Operative Findings & Operative Steps */}
          <section className="bg-white rounded-2xl border border-[#E6E0F0] overflow-hidden">
            <div className="px-4 sm:px-5 py-3 bg-[#FFFBEB]/75 border-b border-[#E6E0F0] flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-amber-900">03.</span>
                <Scissors className="w-3.5 h-3.5 text-amber-800" />
                <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                  Intra-Operative Findings &amp; Operative Steps
                </h4>
              </div>
              <span className="text-[11px] text-slate-500">
                Document operative findings &amp; step-by-step surgical details
              </span>
            </div>

            <div className="p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800">
                    Intra-Operative Findings
                  </label>
                </div>
                <textarea
                  rows={5}
                  value={currentOt.operativeFindings || ''}
                  onChange={(e) => updateCurrentOt({ operativeFindings: e.target.value })}
                  placeholder="Cystoscopy / ureteroscopy / anatomical findings, stone size & location, mucosal status..."
                  className={textareaBaseClass}
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800">
                    Step-by-Step Operative Procedure
                  </label>
                </div>
                <textarea
                  rows={5}
                  value={currentOt.operativeSteps || ''}
                  onChange={(e) => updateCurrentOt({ operativeSteps: e.target.value })}
                  placeholder="Detailed operative steps, instrumentation, laser / fragmentation, hemostasis & closure..."
                  className={textareaBaseClass}
                />
              </div>
            </div>
          </section>

          {/* SECTION 04: Stent, Catheter, Drain, HPE Specimen & Safety */}
          <section className="bg-white rounded-2xl border border-[#E6E0F0] overflow-hidden">
            <div className="px-4 sm:px-5 py-3 bg-[#F6F3FF]/55 border-b border-[#E6E0F0] flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-violet-800">04.</span>
                <ShieldCheck className="w-3.5 h-3.5 text-violet-700" />
                <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                  DJ Stent, Catheter, Drain, HPE Specimen &amp; Safety
                </h4>
              </div>
              <span className="text-[11px] text-slate-500">
                DJ Stent &amp; HPE Sample auto-populate into Discharge Summary
              </span>
            </div>

            <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-700">
                  DJ Stent / Catheter Details
                </label>
                <input
                  type="text"
                  value={currentOt.catheterOrStentDetails || ''}
                  onChange={(e) => updateCurrentOt({ catheterOrStentDetails: e.target.value })}
                  placeholder="e.g. Left 5Fr 26cm DJ Stent in situ; 16Fr Foley"
                  className={inputBaseClass}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-700">
                  HPE / Stone Specimen Sent
                </label>
                <input
                  type="text"
                  value={currentOt.specimenSent || ''}
                  onChange={(e) => updateCurrentOt({ specimenSent: e.target.value })}
                  placeholder="e.g. Prostatic chips for HPE / Stone for analysis"
                  className={inputBaseClass}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-700">Drain Details</label>
                <input
                  type="text"
                  value={currentOt.drainDetails || ''}
                  onChange={(e) => updateCurrentOt({ drainDetails: e.target.value })}
                  placeholder="e.g. 16Fr abdominal drain / Nil"
                  className={inputBaseClass}
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-slate-700">
                    Estimated Blood Loss
                  </label>
                  <button
                    type="button"
                    onClick={() => updateCurrentOt({ estimatedBloodLoss: 'Minimal (< 30 mL)' })}
                    className="text-[10.5px] font-semibold text-violet-700 hover:underline cursor-pointer"
                  >
                    + Minimal
                  </button>
                </div>
                <input
                  type="text"
                  value={currentOt.estimatedBloodLoss || ''}
                  onChange={(e) => updateCurrentOt({ estimatedBloodLoss: e.target.value })}
                  placeholder="e.g. Minimal (< 30 mL)"
                  className={inputBaseClass}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-700">
                  Implants / Consumables
                </label>
                <input
                  type="text"
                  value={currentOt.implantsOrConsumables || ''}
                  onChange={(e) => updateCurrentOt({ implantsOrConsumables: e.target.value })}
                  placeholder="Stent batch / laser fiber / clips"
                  className={inputBaseClass}
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-slate-700">
                    Intra-Op Complications
                  </label>
                  <button
                    type="button"
                    onClick={() => updateCurrentOt({ intraOpComplications: 'Nil / Uneventful' })}
                    className="text-[10.5px] font-semibold text-violet-700 hover:underline cursor-pointer"
                  >
                    + Uneventful
                  </button>
                </div>
                <input
                  type="text"
                  value={currentOt.intraOpComplications || ''}
                  onChange={(e) => updateCurrentOt({ intraOpComplications: e.target.value })}
                  placeholder="e.g. Nil / Uneventful"
                  className={inputBaseClass}
                />
              </div>
            </div>
          </section>

          {/* SECTION 05: Post-Operative Orders (Auto-Syncs to Daily Progress & Medication Log) */}
          <section className="bg-[#F2FBF7] rounded-2xl border border-[#BEEAD8] overflow-hidden">
            <div className="px-4 sm:px-5 py-3 bg-[#E6F8F0] border-b border-[#BEEAD8] flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-emerald-900">05.</span>
                <ClipboardList className="w-3.5 h-3.5 text-emerald-800" />
                <h4 className="text-xs sm:text-sm font-bold text-emerald-950">
                  Post-Operative Orders &amp; Ward Instructions
                </h4>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium text-emerald-800">
                  Auto-syncs to Daily Progress &amp; Medication Log
                </span>
              </div>
            </div>

            <div className="p-4 sm:p-5">
              <textarea
                rows={3}
                value={currentOt.postOpOrders || ''}
                onChange={(e) => updateCurrentOt({ postOpOrders: e.target.value })}
                placeholder="e.g. NBM for 4 hrs, IV fluids RL/DNS, Inj. Ceftriaxone 1g IV BD, Inj. Paracetamol 1g IV SOS, monitor vitals & urine output..."
                className="w-full px-3.5 py-2.5 text-xs leading-relaxed border border-[#A7E3CA] rounded-xl bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-300/30 transition-all"
              />
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

interface IpdOtNotesRegisterViewProps {
  patients: IpdPatientRecord[];
  onSelectPatientForOt: (patientId: string) => void;
  onOpenA4PrintPreview: (consultation: Consultation, mode: 'single' | 'consolidated') => void;
  onDeleteOtProcedure?: (patientId: string, procIndex: number, proc: OtNotes) => void;
  onDeleteAllPatientOt?: (patientId: string) => void;
}

/**
 * Full IPD Operation Theatre (OT) Register listing matching OPD's OtNotesQuickListView:
 * searchable table of all IPD surgical patients, expandable multi-procedure history,
 * direct Edit, Preview & Print A4 OT Notes, Export PDF, and synced Delete.
 */
export const IpdOtNotesRegisterView: React.FC<IpdOtNotesRegisterViewProps> = ({
  patients,
  onSelectPatientForOt,
  onOpenA4PrintPreview,
  onDeleteOtProcedure,
  onDeleteAllPatientOt,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [filterMode, setFilterMode] = useState<'with-ot' | 'all-ipd'>('with-ot');
  const [targetPatientId, setTargetPatientId] = useState<string>(
    () => patients.find((p) => p.status === 'admitted')?.id || patients[0]?.id || ''
  );
  const [confirmDeletePatientOtId, setConfirmDeletePatientOtId] = useState<string | null>(null);
  const [confirmDeleteSubProcKey, setConfirmDeleteSubProcKey] = useState<string | null>(null);

  const rows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return patients
      .filter((p) => {
        const hasOt = hasOtNotesData(p as any);
        if (filterMode === 'with-ot' && !hasOt) return false;
        if (!q) return true;
        const procs = getConsultationOtProcedures(p as any);
        const hay = [
          p.patientName,
          p.ipdNo,
          p.wardOrBed,
          p.admittingDiagnosis,
          ...procs.map((o) => `${o.procedureName} ${o.hospitalName} ${o.surgeryDate}`),
        ]
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) =>
        (b.otNotes?.surgeryDate || b.surgeryDate || b.admissionDate || '').localeCompare(
          a.otNotes?.surgeryDate || a.surgeryDate || a.admissionDate || ''
        )
      );
  }, [patients, searchQuery, filterMode]);

  const totalOtCount = useMemo(
    () => patients.filter((p) => hasOtNotesData(p as any)).length,
    [patients]
  );

  return (
    <div className="space-y-4">
      {/* OPD-Parity OT Action Bar inside IPD OT Register */}
      <div className="bg-white rounded-2xl border border-[#E6E0F0] p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1 p-1 bg-[#F2EFF9] border border-[#E2DCF0] rounded-xl">
            <button
              type="button"
              onClick={() => setFilterMode('with-ot')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                filterMode === 'with-ot'
                  ? 'bg-[#FEF3C7] text-amber-950 border border-[#FCD34D] shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              OT Notes Recorded ({totalOtCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('all-ipd')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                filterMode === 'all-ipd'
                  ? 'bg-white text-violet-950 border border-[#DDD6FE] shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All IPD Patients ({patients.length})
            </button>
          </div>

          {patients.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pl-2 border-l border-[#E6E0F0]">
              <select
                value={targetPatientId}
                onChange={(e) => setTargetPatientId(e.target.value)}
                aria-label="Target IPD patient for OT Note"
                className="px-3 py-1.5 text-xs bg-[#FAF8F5] border border-[#DFD8F0] rounded-xl font-semibold text-slate-800 max-w-[210px] focus:outline-none focus:border-violet-400"
              >
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.patientName} ({p.wardOrBed || 'Ward'})
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => {
                  const id = targetPatientId || patients[0]?.id;
                  if (id) onSelectPatientForOt(id);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-violet-700 hover:bg-violet-800 text-white text-xs font-bold cursor-pointer whitespace-nowrap transition-colors shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add OT Note</span>
              </button>
            </div>
          )}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 text-violet-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search patient, procedure, hospital..."
            className="w-full pl-8 pr-8 py-2 text-xs bg-[#F6F4FB] hover:bg-[#F0ECF9] focus:bg-white border border-[#DFD8F0] focus:border-violet-400 rounded-xl outline-none transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="p-10 text-center bg-white rounded-2xl border border-[#E6E0F0] space-y-3">
          <MedScribeLogo variant="icon" size="md" className="mx-auto" />
          <div className="text-sm font-bold text-slate-800">No IPD OT Notes found</div>
          <p className="text-xs text-slate-600 max-w-md mx-auto">
            Select an IPD patient above or open any ward patient&apos;s OT Notes tab to enter
            surgical operative notes.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-[#E6E0F0] overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse min-w-[780px]">
            <thead>
              <tr className="bg-[#F6F3FF]/80 border-b border-[#E6E0F0] text-violet-950/75 font-bold">
                <th className="py-3 px-4">Surgery Date</th>
                <th className="py-3 px-3">Patient &amp; IPD No</th>
                <th className="py-3 px-3">Procedure Done</th>
                <th className="py-3 px-3">Hospital / Surgeon</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0ECF8]">
              {rows.map((p) => {
                const procs = getConsultationOtProcedures(p as any);
                const latest = procs[procs.length - 1];
                const isExpanded = Boolean(expandedIds[p.id]);
                const asConsultation = ipdPatientToOtConsultation(p, latest);

                return (
                  <React.Fragment key={p.id}>
                    <tr className="hover:bg-[#F6F3FF]/50 transition-colors">
                      <td className="py-3.5 px-4 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        {formatDisplayDate(latest?.surgeryDate || p.surgeryDate || p.admissionDate)}
                      </td>
                      <td className="py-3.5 px-3">
                        <div className="font-bold text-slate-900">{p.patientName}</div>
                        <div className="text-[11px] text-slate-500 tabular-nums">
                          {p.age || '—'} / {p.gender} · {p.ipdNo || 'IPD'} · {p.wardOrBed || 'Ward'}
                        </div>
                      </td>
                      <td className="py-3.5 px-3">
                        <div className="font-semibold text-slate-900">
                          {latest?.procedureName || 'No procedure recorded yet'}
                        </div>
                        {procs.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedIds((prev) => ({ ...prev, [p.id]: !prev[p.id] }))
                            }
                            className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-violet-700 hover:underline cursor-pointer"
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-3 h-3" />
                            ) : (
                              <ChevronDown className="w-3 h-3" />
                            )}
                            <span>{procs.length} procedures recorded</span>
                          </button>
                        )}
                      </td>
                      <td className="py-3.5 px-3 text-slate-700">
                        <div>{latest?.hospitalName || p.hospitalName || '—'}</div>
                        <div className="text-[11px] text-slate-500">
                          {latest?.surgeonName || p.attendingConsultant || '—'}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onSelectPatientForOt(p.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-[#DFD8F0] bg-[#FAF8F5] hover:bg-[#EFEBF9] text-violet-950 font-semibold cursor-pointer transition-colors"
                          >
                            <Edit3 className="w-3 h-3 text-violet-700" />
                            <span>Edit OT</span>
                          </button>
                          {latest && (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  onOpenA4PrintPreview(
                                    asConsultation,
                                    procs.length > 1 ? 'consolidated' : 'single'
                                  )
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-[#FCD34D] bg-[#FEF3C7] hover:bg-[#FDE68A] text-amber-950 font-semibold cursor-pointer transition-colors"
                              >
                                <Printer className="w-3 h-3 text-amber-800" />
                                <span>Preview &amp; Print</span>
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  exportOpdSheetsToPdf([asConsultation], { docType: 'ot' })
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-[#DFD8F0] bg-white hover:bg-[#F6F3FF] text-slate-700 font-semibold cursor-pointer transition-colors"
                                title="Export OT Notes PDF"
                              >
                                <Download className="w-3 h-3 text-violet-700" />
                                <span>PDF</span>
                              </button>
                              {onDeleteAllPatientOt &&
                                (confirmDeletePatientOtId === p.id ? (
                                  <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xl bg-rose-50 border border-rose-200">
                                    <span className="text-[11px] font-semibold text-rose-800">
                                      Delete OT?
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setConfirmDeletePatientOtId(null);
                                        onDeleteAllPatientOt(p.id);
                                      }}
                                      className="px-2 py-0.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold cursor-pointer"
                                    >
                                      Confirm
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeletePatientOtId(null)}
                                      className="px-1.5 py-0.5 text-[11px] text-slate-600 hover:text-slate-900 cursor-pointer"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setConfirmDeleteSubProcKey(null);
                                      setConfirmDeletePatientOtId(p.id);
                                    }}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#FFF1F2] hover:bg-[#FFE4E6] border border-[#FECDD3] text-rose-800 font-semibold cursor-pointer transition-colors"
                                    title="Delete OT notes for this patient (syncs with Daily Progress & OPD OT Register)"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    <span>Delete</span>
                                  </button>
                                ))}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isExpanded && procs.length > 1 && (
                      <tr className="bg-[#FAF8F5]">
                        <td colSpan={5} className="px-6 py-3">
                          <div className="space-y-1.5">
                            {procs.map((pr, idx) => {
                              const subKey = `${p.id}::${pr.id || idx}`;
                              return (
                                <div
                                  key={pr.id || idx}
                                  className="flex items-center justify-between gap-3 text-xs py-1.5 border-b border-[#E6E0F0] last:border-b-0"
                                >
                                  <div>
                                    <span className="font-mono text-slate-500 mr-2">
                                      {formatDisplayDate(pr.surgeryDate || '')}
                                    </span>
                                    <span className="font-semibold text-slate-900">
                                      {pr.procedureName || `Procedure ${idx + 1}`}
                                    </span>
                                    {pr.catheterOrStentDetails && (
                                      <span className="text-slate-600 ml-2">
                                        · {pr.catheterOrStentDetails}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onOpenA4PrintPreview(
                                          ipdPatientToOtConsultation(p, pr),
                                          'single'
                                        )
                                      }
                                      className="text-violet-700 hover:underline font-semibold cursor-pointer"
                                    >
                                      Print This OT
                                    </button>
                                    {onDeleteOtProcedure &&
                                      (confirmDeleteSubProcKey === subKey ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-rose-50 border border-rose-200">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setConfirmDeleteSubProcKey(null);
                                              onDeleteOtProcedure(p.id, idx, pr);
                                            }}
                                            className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[10px] font-bold hover:bg-rose-700 cursor-pointer"
                                          >
                                            Confirm
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setConfirmDeleteSubProcKey(null)}
                                            className="px-1 text-[10px] text-slate-600 hover:text-slate-900 cursor-pointer"
                                          >
                                            Cancel
                                          </button>
                                        </span>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setConfirmDeletePatientOtId(null);
                                            setConfirmDeleteSubProcKey(subKey);
                                          }}
                                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#FFF1F2] hover:bg-[#FFE4E6] border border-[#FECDD3] text-rose-800 text-[11px] font-semibold cursor-pointer"
                                          title="Delete this OT procedure (syncs with Daily Progress & OPD OT Register)"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                          <span>Delete</span>
                                        </button>
                                      ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
