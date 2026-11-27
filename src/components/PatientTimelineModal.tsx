import React from 'react';
import {
  X,
  Calendar,
  Clock,
  Edit3,
  Trash2,
  BedDouble,
  Printer,
  Stethoscope,
  Scissors,
} from 'lucide-react';
import { Consultation } from '../types/opd';
import { IpdPatientRecord } from '../types/ipd';
import {
  formatDisplayDate,
  getMonthInfo,
  formatVitalsSummary,
  formatPrescriptionsSummary,
} from '../utils/excelExporter';
import { hasOtNotesData } from '../utils/otNotesUtils';
import {
  findMatchingIpdRecordsForPatient,
  normalizeClinicalPatientName,
} from '../utils/ipdClinicalSync';
import { MedScribeLogo } from './MedScribeLogo';

interface PatientTimelineModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientName: string | null;
  consultations: Consultation[];
  ipdPatients?: IpdPatientRecord[];
  onEditConsultation: (c: Consultation) => void;
  onDeleteConsultation?: (id: string) => void;
  onOpenIpdChart?: (patient: IpdPatientRecord) => void;
  onPrintDischargeSummary?: (patient: IpdPatientRecord) => void;
}

export const PatientTimelineModal: React.FC<PatientTimelineModalProps> = ({
  isOpen,
  onClose,
  patientName,
  consultations,
  ipdPatients = [],
  onEditConsultation,
  onDeleteConsultation,
  onOpenIpdChart,
  onPrintDischargeSummary,
}) => {
  if (!isOpen || !patientName) return null;

  const targetNorm = normalizeClinicalPatientName(patientName);

  // Filter all OPD/OT consultations matching this patient name
  const patientVisits = consultations
    .filter((c) => {
      const cNorm = normalizeClinicalPatientName(c.patientName);
      return (
        c.patientName.trim().toLowerCase() === patientName.trim().toLowerCase() ||
        (targetNorm.length >= 3 && cNorm === targetNorm)
      );
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const latestVisit = patientVisits[patientVisits.length - 1];

  // Match IPD admission/discharge records for this patient
  const matchingIpdRecords = findMatchingIpdRecordsForPatient(
    {
      patientName,
      opdNo: latestVisit?.opdNo,
      age: latestVisit?.age,
      gender: latestVisit?.gender,
    },
    ipdPatients
  );

  // Combine OPD/OT and IPD into one chronological timeline
  type TimelineItem =
    | { kind: 'opd'; sortDate: string; visit: Consultation }
    | { kind: 'ipd'; sortDate: string; ipd: IpdPatientRecord };

  const timelineItems: TimelineItem[] = [
    ...patientVisits.map((visit) => ({
      kind: 'opd' as const,
      sortDate: visit.date || '',
      visit,
    })),
    ...matchingIpdRecords.map((ipd) => ({
      kind: 'ipd' as const,
      sortDate: ipd.admissionDate || ipd.dischargeDate || '',
      ipd,
    })),
  ].sort((a, b) => a.sortDate.localeCompare(b.sortDate));

  const latestIpd = matchingIpdRecords[0];
  const displayAge = latestVisit?.age || latestIpd?.age || '';
  const displayGender = latestVisit?.gender || latestIpd?.gender || '';
  const displayUhid = latestVisit?.opdNo || latestIpd?.uhid || latestIpd?.ipdNo || 'N/A';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#2E2A3B]/45 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#FDFBF9] rounded-2xl max-w-3xl w-full shadow-2xl border border-[#E6E0D8] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#D6DDF8] flex items-center justify-between bg-gradient-to-r from-[#F4F1FA] via-[#E1F7FC]/75 to-[#EBFBF3]/80">
          <div className="flex items-center gap-3">
            <MedScribeLogo variant="icon" size="sm" />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-[#2D2A3E]">{patientName}</h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-[#F3EEFF] text-[#4338CA] border border-[#D8B4FE]">
                  {patientVisits.length} OPD/OT
                  {matchingIpdRecords.length > 0 ? ` • ${matchingIpdRecords.length} IPD` : ''}
                </span>
              </div>
              <p className="text-xs text-[#6B647B]">
                {displayAge ? `Age: ${displayAge} • ` : ''}
                {displayGender ? `Gender: ${displayGender} • ` : ''}
                OPD / UHID: {displayUhid}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#6B647B] hover:text-[#2D2A3E] hover:bg-white/80 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Informative Banner */}
        <div className="px-6 py-2.5 bg-blue-50/80 border-b border-blue-100 text-xs text-blue-900 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-blue-600 shrink-0" />
          <span>
            Complete chronological patient history across <strong>OPD Consultations</strong>,{' '}
            <strong>IPD Admissions / Discharges</strong>, and <strong>OT Records</strong>.
          </span>
        </div>

        {/* Timeline of Visits & IPD Admissions */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
            {timelineItems.map((item, index) => {
              const isLatest = index === timelineItems.length - 1;

              if (item.kind === 'ipd') {
                const p = item.ipd;
                const dischDate = p.dischargeDate || p.dischargeSummary?.dischargeDate || '';
                const hasSummary = Boolean(p.dischargeSummary) || p.status === 'discharged';

                return (
                  <div key={`ipd-${p.id}`} className="relative group">
                    <div
                      className={`absolute -left-6 top-1 w-4 h-4 rounded-full border-2 border-white shadow-xs ${
                        p.status === 'admitted'
                          ? 'bg-teal-600 ring-4 ring-teal-100'
                          : 'bg-violet-600 ring-4 ring-violet-100'
                      }`}
                    />
                    <div className="bg-teal-50/50 border border-teal-200 rounded-xl p-4 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-teal-200/70 pb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-teal-700 text-white text-[11px] font-bold">
                            <BedDouble className="w-3 h-3" />
                            <span>
                              IPD {p.status === 'admitted' ? 'Admission' : 'Discharged'}
                            </span>
                          </span>
                          <span className="font-mono font-bold text-xs text-slate-900 bg-white px-2 py-0.5 rounded border border-teal-200">
                            Adm: {formatDisplayDate(p.admissionDate)}
                            {dischDate ? ` → Disch: ${formatDisplayDate(dischDate)}` : ''}
                          </span>
                          {p.wardOrBed && (
                            <span className="text-xs text-teal-900 font-semibold">
                              {p.wardOrBed}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 text-xs flex-wrap">
                          {onPrintDischargeSummary && (
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                onPrintDischargeSummary(p);
                              }}
                              className="px-2.5 py-1 text-xs text-violet-950 bg-[#EDE9FE] hover:bg-[#DDD6FE] rounded border border-[#C4B5FD] font-bold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Printer className="w-3 h-3 text-violet-800" />
                              <span>
                                {hasSummary ? 'Print Discharge Summary' : 'Discharge Summary'}
                              </span>
                            </button>
                          )}
                          {onOpenIpdChart && (
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                onOpenIpdChart(p);
                              }}
                              className="px-2.5 py-1 text-xs text-teal-900 bg-white hover:bg-teal-100 rounded border border-teal-300 font-bold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <BedDouble className="w-3 h-3" />
                              <span>Open IPD Chart</span>
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="font-semibold text-slate-500 block mb-0.5">
                            Final / Admitting Diagnosis:
                          </span>
                          <span className="font-bold text-slate-900">
                            {p.dischargeSummary?.finalDiagnosis ||
                              p.admittingDiagnosis ||
                              'Not specified'}
                          </span>
                        </div>
                        {(p.dischargeSummary?.procedurePerformed || p.otNotes?.procedureName) && (
                          <div>
                            <span className="font-semibold text-slate-500 block mb-0.5">
                              Procedure Performed:
                            </span>
                            <span className="font-semibold text-amber-900">
                              {p.dischargeSummary?.procedurePerformed || p.otNotes?.procedureName}
                            </span>
                          </div>
                        )}
                      </div>

                      {p.dischargeSummary?.hospitalCourse && (
                        <div className="text-xs">
                          <span className="font-semibold text-slate-500 block mb-0.5">
                            Hospital Course:
                          </span>
                          <p className="text-slate-800 whitespace-pre-wrap line-clamp-3">
                            {p.dischargeSummary.hospitalCourse}
                          </p>
                        </div>
                      )}

                      {p.dischargeSummary?.followUpPlan && (
                        <div className="text-xs text-violet-900 bg-violet-50 px-2.5 py-1 rounded border border-violet-200 font-medium">
                          Follow-up: {p.dischargeSummary.followUpPlan}
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              const visit = item.visit;
              const { monthLabel } = getMonthInfo(visit.date);
              const isOt = hasOtNotesData(visit);

              return (
                <div key={visit.id} className="relative group">
                  {/* Timeline bullet */}
                  <div
                    className={`absolute -left-6 top-1 w-4 h-4 rounded-full border-2 border-white shadow-xs flex items-center justify-center ${
                      isLatest
                        ? 'bg-emerald-600 ring-4 ring-emerald-100'
                        : 'bg-slate-400 ring-2 ring-slate-100'
                    }`}
                  />

                  {/* Visit Card */}
                  <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-4 space-y-3 hover:border-slate-300 hover:bg-slate-50 transition-colors">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/60 pb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border ${
                            isOt
                              ? 'bg-amber-50 text-amber-950 border-amber-300'
                              : 'bg-sky-50 text-sky-900 border-sky-200'
                          }`}
                        >
                          {isOt ? (
                            <>
                              <Scissors className="w-3 h-3" />
                              <span>OPD + OT</span>
                            </>
                          ) : (
                            <>
                              <Stethoscope className="w-3 h-3" />
                              <span>OPD Visit</span>
                            </>
                          )}
                        </span>
                        <span className="font-mono font-bold text-xs text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                          {formatDisplayDate(visit.date)}
                        </span>
                        {visit.time && (
                          <span className="text-xs text-slate-500 font-mono flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {visit.time}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 rounded font-medium border border-emerald-200 text-[11px]">
                          Sheet: {monthLabel}
                        </span>
                        <button
                          onClick={() => {
                            onClose();
                            onEditConsultation(visit);
                          }}
                          className="px-2 py-1 text-xs text-slate-700 hover:text-emerald-700 hover:bg-emerald-50 rounded border border-slate-200 font-medium flex items-center gap-1 transition-colors cursor-pointer"
                          title="Edit this visit"
                        >
                          <Edit3 className="w-3 h-3 text-emerald-600" />
                          <span>Edit</span>
                        </button>
                        {onDeleteConsultation && (
                          <button
                            onClick={() => {
                              onDeleteConsultation(visit.id);
                            }}
                            className="px-2 py-1 text-xs text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded border border-rose-200 font-medium flex items-center gap-1 transition-colors cursor-pointer"
                            title="Delete this visit entry"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Delete</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Diagnosis & Complaints */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="font-semibold text-slate-500 block mb-0.5">
                          Clinical Diagnosis:
                        </span>
                        <span className="font-bold text-slate-900 bg-emerald-100/60 text-emerald-950 px-2 py-0.5 rounded inline-block">
                          {visit.diagnosis || 'General Consultation'}
                        </span>
                      </div>
                      <div>
                        <span className="font-semibold text-slate-500 block mb-0.5">Vitals:</span>
                        <span className="font-mono text-slate-700 text-[11px]">
                          {formatVitalsSummary(visit.vitals)}
                        </span>
                      </div>
                    </div>

                    {(visit.complaints || visit.chiefComplaints) && (
                      <div className="text-xs">
                        <span className="font-semibold text-slate-500 block mb-0.5">
                          Chief Complaints (c/o):
                        </span>
                        <p className="text-slate-800">
                          {visit.complaints || visit.chiefComplaints}
                        </p>
                      </div>
                    )}

                    {/* Prescriptions (Rx) */}
                    <div>
                      <span className="font-semibold text-slate-500 text-xs block mb-1">
                        Prescribed Medicines (Rx):
                      </span>
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-xs font-mono text-slate-800 whitespace-pre-line leading-relaxed">
                        {formatPrescriptionsSummary(visit)}
                      </div>
                    </div>

                    {/* Follow-up Note */}
                    {visit.followUpDate && (
                      <div className="text-xs text-rose-800 bg-rose-50 px-2.5 py-1 rounded border border-rose-200 font-medium">
                        Follow-up: {visit.followUpDate}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-[#E6E0D8] bg-[#FAF8F5] flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-[#E1F7FC] hover:bg-[#CBEFF8] text-[#1E4D5C] border border-[#A9CFF7] text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
