import React, { useMemo, useRef, useState } from 'react';
import { X, Printer, FileDown, Pill, Calendar } from 'lucide-react';
import { IpdPatientRecord } from '../types/ipd';
import { DoctorAccount } from '../types/doctor';
import { getActiveDoctorPrintCredentials } from '../utils/pdfExporter';
import { exportIpdDailyMedicationPdf } from '../utils/ipdPdfExporter';
import { formatDisplayDate } from '../utils/excelExporter';
import { formatDailyProgressPodLabel } from '../utils/surgicalProtocols';
import {
  ResolvedDailyMedicationRow,
  getResolvedDailyMedicationsForDate,
} from '../utils/ipdDailyMedications';

interface IpdMedicationPrintModalProps {
  patient: IpdPatientRecord;
  dateKey: string;
  overrideItems?: ResolvedDailyMedicationRow[];
  activeDoctor?: DoctorAccount | null;
  onClose: () => void;
}

export const IpdMedicationPrintModal: React.FC<IpdMedicationPrintModalProps> = ({
  patient,
  dateKey,
  overrideItems,
  activeDoctor,
  onClose,
}) => {
  const [useLetterhead, setUseLetterhead] = useState(false);
  const printSheetRef = useRef<HTMLDivElement>(null);

  const creds = useMemo(
    () => getActiveDoctorPrintCredentials(activeDoctor),
    [activeDoctor]
  );

  const podLabel = useMemo(
    () => formatDailyProgressPodLabel(undefined, patient.surgeryDate, dateKey),
    [patient.surgeryDate, dateKey]
  );

  const resolvedMeds = useMemo(() => {
    if (overrideItems) {
      return { source: 'confirmed' as const, items: overrideItems };
    }
    return getResolvedDailyMedicationsForDate(patient, dateKey);
  }, [overrideItems, patient, dateKey]);

  const confirmedCount = resolvedMeds.items.filter((m) => m.status === 'confirmed').length;
  const heldCount = resolvedMeds.items.filter((m) => m.status === 'held').length;

  const fullPatientName = `${patient.salutation ? `${patient.salutation} ` : ''}${patient.patientName}`.trim();

  const handlePrint = () => {
    const sheetEl = printSheetRef.current;
    if (!sheetEl) return;

    const existingFrame = document.getElementById('ipd-med-chart-print-frame');
    if (existingFrame) existingFrame.remove();

    const iframe = document.createElement('iframe');
    iframe.id = 'ipd-med-chart-print-frame';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) return;

    const headStyles = Array.from(
      document.querySelectorAll('link[rel="stylesheet"], style')
    )
      .map((el) => el.outerHTML)
      .join('\n');

    doc.open();
    doc.write(`<!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>IPD Daily Medication Chart - ${fullPatientName} - ${formatDisplayDate(dateKey)}</title>
          ${headStyles}
          <style>
            @page { size: A4 portrait; margin: 10mm 11mm; }
            html, body {
              margin: 0;
              padding: 0;
              background: #ffffff !important;
              color: #0f172a;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .print-sheet {
              box-shadow: none !important;
              border: none !important;
              margin: 0 !important;
              max-width: 100% !important;
              width: 100% !important;
              padding: 0 !important;
            }
            .avoid-break {
              break-inside: avoid;
              page-break-inside: avoid;
            }
          </style>
        </head>
        <body>
          <div class="print-sheet">${sheetEl.innerHTML}</div>
        </body>
      </html>`);
    doc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } finally {
        setTimeout(() => {
          iframe.remove();
        }, 1200);
      }
    }, 280);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-slate-100 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[94vh] flex flex-col overflow-hidden border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Action Bar */}
        <div className="px-4 sm:px-5 py-3.5 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-violet-700 text-white flex items-center justify-center shadow-xs">
              <Pill className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2 flex-wrap">
                <span>Daily Medication Chart Preview</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-violet-50 text-violet-900 border border-violet-200">
                  {formatDisplayDate(dateKey)}
                  {podLabel ? ` · ${podLabel}` : ''}
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                {fullPatientName} · IPD #{patient.ipdNo || '—'} · {patient.wardOrBed || 'Ward'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={useLetterhead}
                onChange={(e) => setUseLetterhead(e.target.checked)}
                className="rounded border-slate-300 text-violet-700 focus:ring-violet-500"
              />
              <span>Pre-Printed Letterhead</span>
            </label>

            <button
              type="button"
              onClick={() =>
                exportIpdDailyMedicationPdf(patient, dateKey, resolvedMeds.items, activeDoctor)
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <FileDown className="w-3.5 h-3.5 text-violet-700" />
              <span>Export PDF</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-violet-700 hover:bg-violet-800 shadow-xs transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print A4</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              aria-label="Close medication chart preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable A4 Preview Canvas */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6">
          <div
            ref={printSheetRef}
            className="mx-auto bg-white rounded-xl border border-slate-200 shadow-sm max-w-[210mm] p-6 sm:p-8 text-slate-900 space-y-5"
          >
            {/* Hospital / Letterhead Header */}
            {useLetterhead ? (
              <div className="h-24 border-b border-dashed border-slate-200 flex items-end justify-center pb-2">
                <span className="text-[10px] uppercase tracking-widest text-slate-300">
                  Pre-Printed Letterhead Space
                </span>
              </div>
            ) : (
              <div className="text-center border-b-2 border-slate-800 pb-3.5 space-y-1">
                <h1 className="text-lg font-extrabold tracking-wide uppercase text-slate-900">
                  {creds.hospitalName}
                </h1>
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  {creds.departmentTitle}
                </p>
                <p className="text-xs text-slate-700">
                  <span className="font-bold text-slate-900">{creds.doctorName}</span>
                  {creds.doctorDegrees ? ` · ${creds.doctorDegrees}` : ''}
                  {creds.doctorRegNo ? ` · Reg: ${creds.doctorRegNo}` : ''}
                </p>
              </div>
            )}

            {/* Document Title */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-2.5 gap-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-violet-700 shrink-0" />
                <h2 className="text-sm sm:text-base font-extrabold uppercase tracking-wide text-slate-900">
                  IPD Daily Medication Chart
                </h2>
              </div>
              <div className="text-right text-xs font-bold text-violet-900 bg-violet-50 border border-violet-200 px-2.5 py-1 rounded-md">
                {formatDisplayDate(dateKey)}
                {podLabel ? ` · ${podLabel}` : ''}
              </div>
            </div>

            {/* Patient Banner */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 bg-slate-50 border border-slate-200 rounded-lg p-3.5 text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500 block">
                  Patient Name
                </span>
                <span className="font-bold text-slate-900 text-sm">{fullPatientName}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500 block">
                  Age / Gender
                </span>
                <span className="font-semibold text-slate-800">
                  {patient.age || '—'} / {patient.gender || '—'}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500 block">
                  IPD / UHID
                </span>
                <span className="font-semibold text-slate-800">
                  {patient.ipdNo || '—'} / {patient.uhid || '—'}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500 block">
                  Ward / Bed
                </span>
                <span className="font-semibold text-slate-800">{patient.wardOrBed || '—'}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500 block">
                  Admitted
                </span>
                <span className="font-semibold text-slate-800">
                  {formatDisplayDate(patient.admissionDate)}
                </span>
              </div>
              {patient.surgeryDate ? (
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">
                    Surgery Date
                  </span>
                  <span className="font-semibold text-slate-800">
                    {formatDisplayDate(patient.surgeryDate)}
                  </span>
                </div>
              ) : (
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">
                    Consultant
                  </span>
                  <span className="font-semibold text-slate-800">
                    {patient.attendingConsultant || creds.doctorName}
                  </span>
                </div>
              )}
              {(patient.admittingDiagnosis || patient.allergies) && (
                <div className="col-span-2 sm:col-span-3 pt-1.5 mt-1 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  {patient.admittingDiagnosis && (
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-500">
                        Diagnosis:{' '}
                      </span>
                      <span className="font-semibold text-slate-900">
                        {patient.admittingDiagnosis}
                      </span>
                    </div>
                  )}
                  {patient.allergies && (
                    <div>
                      <span className="text-[10px] uppercase font-bold text-rose-700">
                        Allergies:{' '}
                      </span>
                      <span className="font-bold text-rose-800">{patient.allergies}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Daily Medication Table */}
            <div className="border border-slate-200 rounded-lg overflow-hidden avoid-break">
              <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <Pill className="w-3.5 h-3.5 text-violet-700" />
                  Medication List for {formatDisplayDate(dateKey)}
                </span>
                <span className="text-[11px] font-semibold text-slate-600">
                  {confirmedCount} Confirmed
                  {heldCount > 0 ? ` · ${heldCount} Held` : ''}
                </span>
              </div>

              {resolvedMeds.items.length === 0 ? (
                <p className="px-3.5 py-4 text-xs text-slate-500 italic">
                  No inpatient medications charted or confirmed for this date.
                </p>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/70 border-b border-slate-200 text-[10.5px] font-bold uppercase tracking-wider text-slate-600">
                      <th className="px-2.5 py-2 w-8">#</th>
                      <th className="px-2.5 py-2">Medicine &amp; Dose</th>
                      <th className="px-2.5 py-2">Route</th>
                      <th className="px-2.5 py-2">Frequency / Timing</th>
                      <th className="px-2.5 py-2">Med Day</th>
                      <th className="px-2.5 py-2">Status</th>
                      <th className="px-2.5 py-2">Notes</th>
                      <th className="px-2.5 py-2 w-24 text-center">Nurse Sign</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {resolvedMeds.items.map((med, idx) => (
                      <tr key={med.id} className={med.status === 'held' ? 'bg-amber-50/40' : ''}>
                        <td className="px-2.5 py-2.5 font-mono text-slate-500">{idx + 1}</td>
                        <td className="px-2.5 py-2.5">
                          <div className="font-bold text-slate-900">
                            {med.medicine}
                            {med.dosage ? ` — ${med.dosage}` : ''}
                          </div>
                        </td>
                        <td className="px-2.5 py-2.5 text-slate-700 font-medium whitespace-nowrap">
                          {med.route || 'PO'}
                        </td>
                        <td className="px-2.5 py-2.5 text-slate-700">
                          <div className="font-semibold">{med.frequency || '—'}</div>
                          {med.when && (
                            <div className="text-[10.5px] text-slate-500">{med.when}</div>
                          )}
                        </td>
                        <td className="px-2.5 py-2.5 font-mono font-bold text-slate-800 whitespace-nowrap">
                          Day {med.dayNumber}
                        </td>
                        <td className="px-2.5 py-2.5 whitespace-nowrap">
                          {med.status === 'confirmed' ? (
                            <span className="font-bold uppercase text-[10.5px] text-emerald-700">
                              Confirmed
                            </span>
                          ) : med.status === 'held' ? (
                            <span className="font-bold uppercase text-[10.5px] text-amber-700">
                              Held
                            </span>
                          ) : (
                            <span className="font-semibold uppercase text-[10.5px] text-slate-500">
                              Charted
                            </span>
                          )}
                        </td>
                        <td className="px-2.5 py-2.5 text-slate-600">{med.notes || '—'}</td>
                        <td className="px-2.5 py-2.5 border-l border-slate-100 text-center text-slate-300">
                          &nbsp;
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer / Consultant Signature */}
            <div className="pt-8 mt-4 border-t border-slate-200 flex items-end justify-between text-xs avoid-break">
              <div className="text-slate-500">
                Date:{' '}
                <span className="font-semibold text-slate-800">
                  {formatDisplayDate(dateKey)}
                </span>
              </div>
              <div className="text-center min-w-[180px]">
                <div className="border-t border-slate-400 pt-1.5 font-bold text-slate-900">
                  {creds.doctorName || patient.attendingConsultant || 'Attending Consultant'}
                </div>
                {creds.doctorDegrees && (
                  <div className="text-[10.5px] text-slate-600">{creds.doctorDegrees}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
