import React from 'react';
import { AlertTriangle, Trash2, X, Calendar, User, FileSpreadsheet, Stethoscope } from 'lucide-react';
import { Consultation } from '../types/opd';
import { formatDisplayDate, getMonthInfo } from '../utils/excelExporter';
import {
  cleanExplicitOpdNo,
  formatPatientNameWithSalutation,
} from '../utils/investigationUtils';
import { hasOtNotesData } from '../utils/otNotesUtils';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  consultation: Consultation | null;
  onConfirmDelete: (id: string) => void;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  onClose,
  consultation,
  onConfirmDelete,
}) => {
  if (!isOpen || !consultation) return null;

  const { monthLabel } = getMonthInfo(consultation.date);
  const explicitOpd = cleanExplicitOpdNo(consultation.opdNo);
  const isOtRecord = hasOtNotesData(consultation);

  const handleDelete = () => {
    onConfirmDelete(consultation.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden transform transition-all scale-100">
        {/* Header */}
        <div className="px-5 py-4 border-b border-rose-100 bg-rose-50/70 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {isOtRecord ? 'Delete OT Note Entry?' : 'Delete Consultation Entry?'}
              </h3>
              <p className="text-[11px] text-slate-500">This action cannot be undone</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Entry Details */}
        <div className="p-5 space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            Are you sure you want to permanently delete the following consultation record from the register and Excel sheets?
          </p>

          <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 space-y-2 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="text-slate-500 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span>Patient</span>
              </span>
              <span className="font-bold text-slate-900">
                {formatPatientNameWithSalutation(consultation.salutation, consultation.patientName)}
                {consultation.age ? ` (${consultation.age}${consultation.gender ? `/${consultation.gender}` : ''})` : ''}
              </span>
            </div>

            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="text-slate-500 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>Date &amp; Time</span>
              </span>
              <span className="font-mono font-medium text-slate-800">
                {formatDisplayDate(consultation.date)} {consultation.time ? `• ${consultation.time}` : ''}
              </span>
            </div>

            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="text-slate-500 flex items-center gap-1.5">
                <FileSpreadsheet className="w-3.5 h-3.5 text-slate-400" />
                <span>Excel Sheet</span>
              </span>
              <span className="font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[11px]">
                {monthLabel}
              </span>
            </div>

            {explicitOpd && (
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-slate-500">OPD / UHID</span>
                <span className="font-mono text-slate-700">{explicitOpd}</span>
              </div>
            )}

            {consultation.diagnosis && (
              <div className="flex items-start justify-between pt-0.5">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <Stethoscope className="w-3.5 h-3.5 text-slate-400" />
                  <span>Diagnosis</span>
                </span>
                <span className="font-semibold text-slate-800 text-right max-w-[200px] truncate">
                  {consultation.diagnosis}
                </span>
              </div>
            )}
          </div>

          <div className="bg-amber-50 rounded-lg p-2.5 border border-amber-200/80 text-[11px] text-amber-900 leading-tight">
            {isOtRecord
              ? 'Deleting this OT note will remove it from the OPD OT Register, Master Register, patient history, future exports, and any synced IPD Ward OT Notes & Daily Progress entries.'
              : 'Deleting this entry will remove it from daily consultation lists, patient history timeline, and future Excel exports.'}
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/50 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg shadow-xs flex items-center gap-1.5 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Yes, Delete Entry</span>
          </button>
        </div>
      </div>
    </div>
  );
};
