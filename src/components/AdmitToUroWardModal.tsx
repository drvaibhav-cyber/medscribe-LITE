import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  BedDouble,
  ExternalLink,
  Copy,
  Check,
  Scissors,
  Pill,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Consultation } from '../types/opd';
import {
  buildUroWardHandoffUrl,
  buildUroWardRecordFromConsultation,
  detectProtocolFromProcedure,
  saveDefaultWard,
  UROWARD_PROTOCOL_OPTIONS,
  UroWardHandoffRecord,
  UroWardProtocolId,
} from '../utils/uroWardHandoff';

interface AdmitToUroWardModalProps {
  isOpen: boolean;
  onClose: () => void;
  consultation: Consultation | null;
  allConsultations: Consultation[];
  activeDoctorName?: string;
  onAdmitted?: (patientName: string) => void;
}

const BLOOD_GROUP_OPTIONS = ['Pending', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export const AdmitToUroWardModal: React.FC<AdmitToUroWardModalProps> = ({
  isOpen,
  onClose,
  consultation,
  allConsultations,
  activeDoctorName,
  onAdmitted,
}) => {
  const [record, setRecord] = useState<UroWardHandoffRecord | null>(null);
  const [linkedOtFound, setLinkedOtFound] = useState(false);
  const [showOtDetails, setShowOtDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen || !consultation) return;
    const built = buildUroWardRecordFromConsultation(
      consultation,
      allConsultations,
      activeDoctorName
    );
    setRecord(built.record);
    setLinkedOtFound(built.linkedOtFound);
    setShowOtDetails(built.linkedOtFound);
    setCopied(false);
  }, [isOpen, consultation, allConsultations, activeDoctorName]);

  const handoffUrl = useMemo(() => {
    if (!record) return '';
    return buildUroWardHandoffUrl(record);
  }, [record]);

  if (!isOpen || !consultation || !record) return null;

  const updateField = <K extends keyof UroWardHandoffRecord>(
    key: K,
    value: UroWardHandoffRecord[K]
  ) => {
    setRecord((prev) => {
      if (!prev) return prev;
      const next = { ...prev, [key]: value };
      if (key === 'procedureName' && !prev.protocolId) {
        const detected = detectProtocolFromProcedure(String(value || ''));
        if (detected) next.protocolId = detected;
      }
      return next;
    });
  };

  const handleCopyUrl = async () => {
    if (!handoffUrl) return;
    try {
      await navigator.clipboard.writeText(handoffUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2400);
    } catch {
      // ignore clipboard errors in restricted frames
    }
  };

  const handleLaunchClick = () => {
    if (record.ward) {
      saveDefaultWard(record.ward);
    }
    onAdmitted?.(record.patientName);
  };

  const medCount = record.medications?.length || 0;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-5"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[92vh] bg-white rounded-2xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4 bg-slate-50/70">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <BedDouble className="w-5 h-5 text-teal-700 shrink-0" />
              <h2 className="text-base font-bold text-slate-900 truncate">
                Admit to UroWard IPD
              </h2>
            </div>
            <p className="text-xs text-slate-600 mt-0.5 truncate">
              {record.patientName}
              {record.age ? ` · ${record.age}Y` : ''}
              {record.sex ? ` · ${record.sex}` : ''}
              {record.uhid ? ` · UHID ${record.uhid}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200/70 transition-colors cursor-pointer"
            aria-label="Close admission dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Admission Logistics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Ward
              </label>
              <input
                type="text"
                value={record.ward || ''}
                onChange={(e) => updateField('ward', e.target.value)}
                placeholder="Urology Surgical Ward A"
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Bed Number
              </label>
              <input
                type="text"
                value={record.bedNumber || ''}
                onChange={(e) => updateField('bedNumber', e.target.value)}
                placeholder="e.g. B-14"
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Blood Group
              </label>
              <select
                value={record.bloodGroup || 'Pending'}
                onChange={(e) => updateField('bloodGroup', e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none cursor-pointer"
              >
                {BLOOD_GROUP_OPTIONS.map((bg) => (
                  <option key={bg} value={bg}>
                    {bg}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Clinical Summary & Pathway */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-slate-100">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Diagnosis
              </label>
              <input
                type="text"
                value={record.diagnosis}
                onChange={(e) => updateField('diagnosis', e.target.value)}
                placeholder="Primary urology diagnosis"
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Planned / Performed Procedure
              </label>
              <input
                type="text"
                value={record.procedureName}
                onChange={(e) => updateField('procedureName', e.target.value)}
                placeholder="e.g. Bipolar TURP, Left PCNL, Right URSL"
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                UroWard Pathway Protocol
              </label>
              <select
                value={record.protocolId || ''}
                onChange={(e) =>
                  updateField('protocolId', e.target.value as UroWardProtocolId)
                }
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none cursor-pointer"
              >
                {UROWARD_PROTOCOL_OPTIONS.map((opt) => (
                  <option key={opt.value || 'auto'} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Surgery / Admission Date
              </label>
              <input
                type="date"
                value={record.surgeryDate || ''}
                onChange={(e) => updateField('surgeryDate', e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Attending Doctor
              </label>
              <input
                type="text"
                value={record.doctorName || ''}
                onChange={(e) => updateField('doctorName', e.target.value)}
                placeholder="Attending Urologist"
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Comorbidities / History
              </label>
              <input
                type="text"
                value={record.comorbidities || ''}
                onChange={(e) => updateField('comorbidities', e.target.value)}
                placeholder="e.g. DM, HTN"
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Allergies
              </label>
              <input
                type="text"
                value={record.allergies || ''}
                onChange={(e) => updateField('allergies', e.target.value)}
                placeholder="No known drug allergies"
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none"
              />
            </div>
          </div>

          {/* Post-Op Orders & Medications Summary */}
          <div className="pt-4 border-t border-slate-100 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-semibold text-slate-700">
                Post-Op Orders / Admission Advice
              </label>
              <span className="text-xs text-slate-500 inline-flex items-center gap-1 tabular-nums">
                <Pill className="w-3.5 h-3.5 text-slate-400" />
                {medCount} Rx medication{medCount === 1 ? '' : 's'} attached
              </span>
            </div>
            <textarea
              rows={3}
              value={record.postOpOrders || ''}
              onChange={(e) => updateField('postOpOrders', e.target.value)}
              placeholder="Post-op instructions, IV fluids, antibiotics, catheter irrigation orders..."
              className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none resize-y"
            />
          </div>

          {/* Collapsible OT Note Handoff Fields */}
          <div className="pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowOtDetails((prev) => !prev)}
              className="w-full flex items-center justify-between text-xs font-semibold text-slate-800 hover:text-teal-800 transition-colors cursor-pointer"
            >
              <span className="inline-flex items-center gap-1.5">
                <Scissors className="w-3.5 h-3.5 text-amber-700" />
                <span>
                  OT Note Details{' '}
                  <span className="font-normal text-slate-500">
                    ({linkedOtFound ? 'auto-filled from OT record' : 'optional'})
                  </span>
                </span>
              </span>
              {showOtDetails ? (
                <ChevronUp className="w-4 h-4 text-slate-500" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-500" />
              )}
            </button>

            {showOtDetails && (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Anaesthesia Type
                  </label>
                  <input
                    type="text"
                    value={record.anesthesiaType || ''}
                    onChange={(e) => updateField('anesthesiaType', e.target.value)}
                    placeholder="Spinal / GA"
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Surgeon / Assistant
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={record.surgeon || ''}
                      onChange={(e) => updateField('surgeon', e.target.value)}
                      placeholder="Surgeon"
                      className="w-full px-2.5 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none"
                    />
                    <input
                      type="text"
                      value={record.assistant || ''}
                      onChange={(e) => updateField('assistant', e.target.value)}
                      placeholder="Assistant"
                      className="w-full px-2.5 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Duration (mins)
                  </label>
                  <input
                    type="text"
                    value={record.durationMins || ''}
                    onChange={(e) => updateField('durationMins', e.target.value)}
                    placeholder="e.g. 45"
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Blood Loss (ml)
                  </label>
                  <input
                    type="text"
                    value={record.bloodLossMl || ''}
                    onChange={(e) => updateField('bloodLossMl', e.target.value)}
                    placeholder="e.g. 50"
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none tabular-nums"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Implants, Stents &amp; Drains
                  </label>
                  <input
                    type="text"
                    value={record.implantsAndDrains || ''}
                    onChange={(e) => updateField('implantsAndDrains', e.target.value)}
                    placeholder="e.g. 20Fr 3-way Foley, 5Fr 26cm DJ stent"
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Operative Findings
                  </label>
                  <textarea
                    rows={2}
                    value={record.otFindings || ''}
                    onChange={(e) => updateField('otFindings', e.target.value)}
                    placeholder="Intra-operative findings..."
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none resize-y"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
          <span className="text-[11px] text-slate-500">
            Patient data transfers via URL hash fragment (kept out of server logs).
          </span>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={handleCopyUrl}
              className="px-3.5 py-2 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Copied Link</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                  <span>Copy Handoff Link</span>
                </>
              )}
            </button>

            <a
              href={handoffUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleLaunchClick}
              className="px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shadow-xs"
            >
              <BedDouble className="w-3.5 h-3.5" />
              <span>Admit to UroWard IPD</span>
              <ExternalLink className="w-3 h-3 opacity-85" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
