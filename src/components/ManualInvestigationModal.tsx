import React, { useEffect, useState } from 'react';
import { X, Plus, Trash2, FlaskConical, Check } from 'lucide-react';
import { Consultation, InvestigationItem } from '../types/opd';
import { formatDisplayDate } from '../utils/excelExporter';
import { formatInvestigationItemsToText } from '../utils/investigationUtils';

interface ManualInvestigationModalProps {
  isOpen: boolean;
  onClose: () => void;
  consultation: Consultation;
  allConsultations?: Consultation[];
  onApplyInvestigations: (updatedFields: {
    investigationRecords: InvestigationItem[];
    labTestsAndImaging: string;
  }) => void;
}

interface DraftRow {
  id: string;
  reportDate: string;
  category: 'lab' | 'imaging';
  panelOrStudy: string;
  parameterName: string;
  valueOrImpression: string;
  referenceRange: string;
  flag: string;
}

const QUICK_UROLOGY_PARAMS: Array<{
  label: string;
  category: 'lab' | 'imaging';
  panelOrStudy: string;
  parameterName: string;
  placeholder: string;
}> = [
  { label: 'Hb', category: 'lab', panelOrStudy: 'CBC', parameterName: 'Hb (Hemoglobin)', placeholder: 'e.g. 13.2 g/dL' },
  { label: 'WBC / TLC', category: 'lab', panelOrStudy: 'CBC', parameterName: 'TLC / WBC', placeholder: 'e.g. 7,800 /cumm' },
  { label: 'Platelets', category: 'lab', panelOrStudy: 'CBC', parameterName: 'Platelets', placeholder: 'e.g. 2.4 Lakh/cumm' },
  { label: 'Sr. Creatinine', category: 'lab', panelOrStudy: 'KFT', parameterName: 'Serum Creatinine', placeholder: 'e.g. 1.0 mg/dL' },
  { label: 'Blood Urea', category: 'lab', panelOrStudy: 'KFT', parameterName: 'Blood Urea', placeholder: 'e.g. 28 mg/dL' },
  { label: 'Na+ / K+', category: 'lab', panelOrStudy: 'Electrolytes', parameterName: 'Serum Na+ / K+', placeholder: 'e.g. 138 / 4.2 mEq/L' },
  { label: 'RBS / FBS', category: 'lab', panelOrStudy: 'Sugar', parameterName: 'RBS / FBS', placeholder: 'e.g. 112 mg/dL' },
  { label: 'HbA1c', category: 'lab', panelOrStudy: 'Sugar', parameterName: 'HbA1c', placeholder: 'e.g. 6.2%' },
  { label: 'Serum PSA', category: 'lab', panelOrStudy: 'Urology', parameterName: 'Serum PSA (Total)', placeholder: 'e.g. 2.4 ng/mL' },
  { label: 'Urine R/M', category: 'lab', panelOrStudy: 'Urine', parameterName: 'Urine R/M', placeholder: 'e.g. Pus cells 2-4/HPF, RBC nil' },
  { label: 'Urine C/S', category: 'lab', panelOrStudy: 'Urine', parameterName: 'Urine Culture & Sensitivity', placeholder: 'e.g. No growth / E. coli sensitive to...' },
  { label: 'USG KUB', category: 'imaging', panelOrStudy: 'Imaging', parameterName: 'USG KUB', placeholder: 'e.g. Prostate 42cc, PVR 65mL, 6mm R calculus' },
  { label: 'NCCT KUB', category: 'imaging', panelOrStudy: 'Imaging', parameterName: 'NCCT KUB', placeholder: 'e.g. 9mm R lower ureteric calculus (980 HU)' },
  { label: 'X-Ray KUB', category: 'imaging', panelOrStudy: 'Imaging', parameterName: 'X-Ray KUB', placeholder: 'e.g. DJ stent in situ / No radio-opaque shadow' },
  { label: 'Uroflowmetry', category: 'imaging', panelOrStudy: 'Urodynamics', parameterName: 'Uroflowmetry', placeholder: 'e.g. Qmax 11 mL/s, VV 240 mL, PVR 45 mL' },
];

function makeEmptyRow(defaultDate: string): DraftRow {
  return {
    id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    reportDate: defaultDate,
    category: 'lab',
    panelOrStudy: 'Lab',
    parameterName: '',
    valueOrImpression: '',
    referenceRange: '',
    flag: 'Normal',
  };
}

export const ManualInvestigationModal: React.FC<ManualInvestigationModalProps> = ({
  isOpen,
  onClose,
  consultation,
  onApplyInvestigations,
}) => {
  const defaultDate = consultation.date || new Date().toISOString().split('T')[0];
  const [reportDate, setReportDate] = useState(defaultDate);
  const [rows, setRows] = useState<DraftRow[]>([makeEmptyRow(defaultDate)]);

  useEffect(() => {
    if (isOpen) {
      const nextDate = consultation.date || new Date().toISOString().split('T')[0];
      setReportDate(nextDate);
      setRows([makeEmptyRow(nextDate)]);
    }
  }, [isOpen, consultation.date]);

  if (!isOpen) return null;

  const updateRow = (id: string, patch: Partial<DraftRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeRow = (id: string) => {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  };

  const handleQuickAdd = (preset: (typeof QUICK_UROLOGY_PARAMS)[number]) => {
    setRows((prev) => {
      const firstEmpty = prev.find((r) => !r.parameterName.trim() && !r.valueOrImpression.trim());
      if (firstEmpty) {
        return prev.map((r) =>
          r.id === firstEmpty.id
            ? {
                ...r,
                reportDate,
                category: preset.category,
                panelOrStudy: preset.panelOrStudy,
                parameterName: preset.parameterName,
              }
            : r
        );
      }
      return [
        ...prev,
        {
          id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          reportDate,
          category: preset.category,
          panelOrStudy: preset.panelOrStudy,
          parameterName: preset.parameterName,
          valueOrImpression: '',
          referenceRange: '',
          flag: 'Normal',
        },
      ];
    });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const validNewItems: InvestigationItem[] = rows
      .filter((r) => r.parameterName.trim() && r.valueOrImpression.trim())
      .map((r) => {
        const iso = r.reportDate || reportDate;
        return {
          id: r.id,
          reportDate: iso,
          displayDate: formatDisplayDate(iso),
          category: r.category,
          panelOrStudy: r.panelOrStudy.trim() || (r.category === 'imaging' ? 'Imaging' : 'Lab'),
          parameterName: r.parameterName.trim(),
          valueOrImpression: r.valueOrImpression.trim(),
          referenceRange: r.referenceRange.trim() || undefined,
          flag: r.flag || 'Normal',
        };
      });

    if (validNewItems.length === 0) {
      onClose();
      return;
    }

    const existing = consultation.investigationRecords || [];
    const merged: InvestigationItem[] = [...existing];
    for (const item of validNewItems) {
      const idx = merged.findIndex(
        (ex) =>
          ex.reportDate === item.reportDate &&
          ex.parameterName.trim().toLowerCase() === item.parameterName.trim().toLowerCase()
      );
      if (idx >= 0) {
        merged[idx] = item;
      } else {
        merged.push(item);
      }
    }

    const formattedText = formatInvestigationItemsToText(merged);
    const existingText = (consultation.labTestsAndImaging || '').trim();
    const nextSummary = formattedText || existingText;

    onApplyInvestigations({
      investigationRecords: merged,
      labTestsAndImaging: nextSummary,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0">
              <FlaskConical className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900">
                Add Investigation Parameters (Manual Entry)
              </h2>
              <p className="text-xs text-slate-500">
                Enter lab values or imaging impressions for{' '}
                <strong className="text-slate-700">{consultation.patientName || 'Patient'}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Default Report Date + Quick Chips */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-slate-700">Report Date:</label>
                <input
                  type="date"
                  value={reportDate}
                  onChange={(e) => {
                    const next = e.target.value;
                    setReportDate(next);
                    setRows((prev) => prev.map((r) => ({ ...r, reportDate: next })));
                  }}
                  className="px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:border-teal-500 outline-none"
                />
              </div>

              <button
                type="button"
                onClick={() => setRows((prev) => [...prev, makeEmptyRow(reportDate)])}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Row</span>
              </button>
            </div>

            <div className="space-y-1.5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Quick-Add Common Urology Labs &amp; Imaging
              </div>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_UROLOGY_PARAMS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => handleQuickAdd(preset)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                      preset.category === 'imaging'
                        ? 'bg-sky-50 hover:bg-sky-100 text-sky-900 border-sky-200'
                        : 'bg-slate-50 hover:bg-teal-50 text-slate-700 hover:text-teal-900 border-slate-200 hover:border-teal-300'
                    }`}
                  >
                    + {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Parameter Rows */}
          <div className="space-y-2.5">
            {rows.map((row) => (
              <div
                key={row.id}
                className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-start p-3 rounded-xl bg-slate-50 border border-slate-200"
              >
                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                    Type
                  </label>
                  <select
                    value={row.category}
                    onChange={(e) =>
                      updateRow(row.id, { category: e.target.value as 'lab' | 'imaging' })
                    }
                    className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded-lg outline-none focus:border-teal-500"
                  >
                    <option value="lab">Lab</option>
                    <option value="imaging">Imaging</option>
                  </select>
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                    Parameter / Study *
                  </label>
                  <input
                    type="text"
                    value={row.parameterName}
                    onChange={(e) => updateRow(row.id, { parameterName: e.target.value })}
                    placeholder="e.g. Serum Creatinine"
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg outline-none focus:border-teal-500 font-semibold"
                  />
                </div>

                <div className="sm:col-span-4">
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                    Value / Impression *
                  </label>
                  <input
                    type="text"
                    value={row.valueOrImpression}
                    onChange={(e) => updateRow(row.id, { valueOrImpression: e.target.value })}
                    placeholder="e.g. 1.1 mg/dL or USG findings"
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg outline-none focus:border-teal-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                    Flag
                  </label>
                  <select
                    value={row.flag}
                    onChange={(e) => updateRow(row.id, { flag: e.target.value })}
                    className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded-lg outline-none focus:border-teal-500"
                  >
                    <option value="Normal">Normal</option>
                    <option value="High">High</option>
                    <option value="Low">Low</option>
                    <option value="Abnormal">Abnormal</option>
                  </select>
                </div>

                <div className="sm:col-span-1 flex items-end justify-end sm:pt-5">
                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
                    disabled={rows.length === 1}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-30 cursor-pointer"
                    title="Remove row"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-white border border-slate-300 hover:bg-slate-100 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 shadow-xs cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Save Investigations</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
