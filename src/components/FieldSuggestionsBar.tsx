import React, { useState, useEffect } from 'react';
import { Plus, X, Pill, Layers, Settings2 } from 'lucide-react';
import {
  SuggestionFieldKey,
  getFieldSuggestions,
  recordFieldUsage,
  removeFieldSuggestion,
  applySuggestionToValue,
  getRememberedMedicinePresets,
  RememberedMedicinePreset,
} from '../utils/fieldSuggestions';
import { PrescriptionItem } from '../types/opd';
import {
  loadMedicineMasterStore,
  MedicineMasterStore,
  MedicationGroup,
  getGroupMedications,
  masterMedicationToPrescriptionItem,
  MEDICINE_MASTER_CHANGED_EVENT,
} from '../utils/medicineMaster';

interface FieldSuggestionsBarProps {
  field: SuggestionFieldKey;
  currentValue?: string;
  onSelect: (newValue: string) => void;
  mode?: 'replace' | 'append-semi' | 'append-comma';
  limit?: number;
  label?: string;
  visible?: boolean;
  extraSuggestions?: string[];
}

export const FieldSuggestionsBar: React.FC<FieldSuggestionsBarProps> = ({
  field,
  currentValue = '',
  onSelect,
  mode = 'append-semi',
  limit = 6,
  label = 'Quick fill:',
  visible = true,
  extraSuggestions = [],
}) => {
  const [refreshTick, setRefreshTick] = useState(0);

  // Re-evaluate suggestions whenever field, currentValue, or refreshTick changes
  const suggestions = React.useMemo(() => {
    const base = getFieldSuggestions(field, currentValue, limit);
    if (!extraSuggestions || extraSuggestions.length === 0) return base;
    const seen = new Set(base.map((s) => s.toLowerCase()));
    const merged = [...base];
    for (const extra of extraSuggestions) {
      const clean = (extra || '').trim();
      if (clean && !seen.has(clean.toLowerCase())) {
        seen.add(clean.toLowerCase());
        merged.push(clean);
      }
    }
    return merged.slice(0, Math.max(limit, extraSuggestions.length + 4));
  }, [field, currentValue, limit, refreshTick, extraSuggestions]);

  if (!visible) return null;

  const trimmedCurrent = (currentValue || '').trim();
  const canRememberCurrent =
    trimmedCurrent.length >= 3 &&
    trimmedCurrent.length <= 100 &&
    !suggestions.some((s) => s.toLowerCase() === trimmedCurrent.toLowerCase());

  if (suggestions.length === 0 && !canRememberCurrent) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-1.5 border-t border-slate-100">
      <span className="text-[11px] text-slate-400 font-medium mr-0.5 select-none">
        {label}
      </span>

      {suggestions.map((item) => {
        const isAlreadyIncluded = (currentValue || '')
          .toLowerCase()
          .includes(item.toLowerCase());

        return (
          <div
            key={item}
            className={`group inline-flex items-center rounded-md border text-[11px] transition-colors ${
              isAlreadyIncluded
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-medium'
                : 'bg-slate-50 hover:bg-white border-slate-200 text-slate-700'
            }`}
          >
            <button
              type="button"
              onClick={() => {
                const updated = applySuggestionToValue(currentValue, item, mode);
                recordFieldUsage(field, item);
                onSelect(updated);
                setRefreshTick((t) => t + 1);
              }}
              className="px-2 py-0.5 text-left truncate max-w-[230px] cursor-pointer"
              title={
                mode === 'replace'
                  ? `Set to "${item}"`
                  : `Add "${item}"`
              }
            >
              {mode === 'replace' ? item : `+ ${item}`}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeFieldSuggestion(field, item);
                setRefreshTick((t) => t + 1);
              }}
              className="pr-1 pl-0.5 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              title="Remove from remembered suggestions"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
        );
      })}

      {canRememberCurrent && (
        <button
          type="button"
          onClick={() => {
            recordFieldUsage(field, trimmedCurrent);
            setRefreshTick((t) => t + 1);
          }}
          className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[11px] font-medium transition-colors cursor-pointer"
          title="Save current text to remembered suggestions for this field"
        >
          <Plus className="w-2.5 h-2.5" />
          <span>Remember</span>
        </button>
      )}
    </div>
  );
};

interface MedicinePresetsBarProps {
  onAddMedicinePreset: (preset: PrescriptionItem) => void;
  onApplyMedicationGroup?: (group: MedicationGroup, store: MedicineMasterStore) => void;
  onOpenMedicineMaster?: () => void;
  doctorUid?: string | null;
}

export const MedicinePresetsBar: React.FC<MedicinePresetsBarProps> = ({
  onAddMedicinePreset,
  onApplyMedicationGroup,
  onOpenMedicineMaster,
  doctorUid,
}) => {
  const [presets, setPresets] = useState<RememberedMedicinePreset[]>([]);
  const [masterStore, setMasterStore] = useState<MedicineMasterStore>(() =>
    loadMedicineMasterStore(doctorUid)
  );
  const [selectedMasterId, setSelectedMasterId] = useState('');
  const [groupFeedback, setGroupFeedback] = useState<string | null>(null);

  useEffect(() => {
    setPresets(getRememberedMedicinePresets(10));
    setMasterStore(loadMedicineMasterStore(doctorUid));

    const handleRefresh = () => {
      setMasterStore(loadMedicineMasterStore(doctorUid));
      setPresets(getRememberedMedicinePresets(10));
    };
    window.addEventListener(MEDICINE_MASTER_CHANGED_EVENT, handleRefresh);
    return () => window.removeEventListener(MEDICINE_MASTER_CHANGED_EVENT, handleRefresh);
  }, [doctorUid]);

  const handleGroupClick = (group: MedicationGroup) => {
    if (onApplyMedicationGroup) {
      onApplyMedicationGroup(group, masterStore);
    } else {
      const meds = getGroupMedications(group, masterStore);
      meds.forEach((m) => onAddMedicinePreset(masterMedicationToPrescriptionItem(m)));
    }
    const count = getGroupMedications(group, masterStore).length;
    setGroupFeedback(`Applied "${group.name}" (${count} med${count === 1 ? '' : 's'})`);
    setTimeout(() => setGroupFeedback(null), 2600);
  };

  if (
    presets.length === 0 &&
    masterStore.groups.length === 0 &&
    masterStore.medications.length === 0
  ) {
    return null;
  }

  return (
    <div className="p-3 bg-indigo-50/50 border border-indigo-200/80 rounded-xl space-y-2.5">
      {/* Medication Groups Row */}
      {(masterStore.groups.length > 0 || masterStore.medications.length > 0) && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-indigo-950 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-teal-700" />
              <span>Medication Groups &amp; Master List</span>
              {groupFeedback && (
                <span className="text-[11px] font-semibold text-emerald-700 ml-1">
                  · {groupFeedback}
                </span>
              )}
            </span>

            <div className="flex items-center gap-2">
              {masterStore.medications.length > 0 && (
                <select
                  aria-label="Pick medication from Master List"
                  value={selectedMasterId}
                  onChange={(e) => {
                    const medId = e.target.value;
                    if (!medId) return;
                    const found = masterStore.medications.find((m) => m.id === medId);
                    if (found) {
                      onAddMedicinePreset(masterMedicationToPrescriptionItem(found));
                    }
                    setSelectedMasterId('');
                  }}
                  className="px-2.5 py-1 bg-white border border-indigo-200 rounded-lg text-[11px] font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 max-w-[230px] cursor-pointer"
                >
                  <option value="">+ Pick from Master List...</option>
                  {masterStore.medications.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.medicine}
                      {m.dosage ? ` (${m.dosage})` : ''}
                      {m.notes ? ` — ${m.notes}` : ''}
                    </option>
                  ))}
                </select>
              )}

              {onOpenMedicineMaster && (
                <button
                  type="button"
                  onClick={onOpenMedicineMaster}
                  className="px-2 py-1 rounded-lg bg-white hover:bg-indigo-100/70 border border-indigo-200 text-indigo-800 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                  title="Open Medicine Master & Groups"
                >
                  <Settings2 className="w-3 h-3" />
                  <span>Manage</span>
                </button>
              )}
            </div>
          </div>

          {masterStore.groups.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {masterStore.groups.map((grp) => {
                const meds = getGroupMedications(grp, masterStore);
                return (
                  <button
                    key={grp.id}
                    type="button"
                    onClick={() => handleGroupClick(grp)}
                    disabled={meds.length === 0}
                    className="px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-600 hover:text-white border border-teal-300 text-teal-950 text-[11px] font-bold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-45"
                    title={
                      meds.length > 0
                        ? `Add ${grp.name}: ${meds.map((m) => m.medicine).join(', ')}`
                        : 'Group has no medications assigned yet'
                    }
                  >
                    <Layers className="w-3 h-3 shrink-0" />
                    <span>+ {grp.name}</span>
                    <span className="text-[10px] opacity-75 font-mono tabular-nums">
                      ({meds.length})
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Frequently Used Individual Presets */}
      {presets.length > 0 && (
        <div
          className={`space-y-1.5 ${
            masterStore.groups.length > 0 || masterStore.medications.length > 0
              ? 'pt-2 border-t border-indigo-200/70'
              : ''
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-indigo-900 flex items-center gap-1">
              <Pill className="w-3 h-3 text-indigo-600" />
              Most Used Individual Medicines (1-Click Add):
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {presets.map((p) => (
              <button
                key={p.medicine}
                type="button"
                onClick={() =>
                  onAddMedicinePreset({
                    medicine: p.medicine,
                    drugName: p.medicine,
                    dosage: p.dosage,
                    dosageStrength: p.dosage,
                    when: p.when,
                    timing: p.when,
                    frequency: p.frequency,
                    duration: p.duration,
                    notes: p.notes,
                    instructions: p.notes,
                  })
                }
                className="px-2 py-1 rounded-lg bg-white hover:bg-indigo-600 hover:text-white border border-indigo-200 text-indigo-950 text-[10.5px] font-semibold transition-colors shadow-2xs flex items-center gap-1 cursor-pointer"
                title={`Add ${p.medicine} ${p.dosage} | ${p.when} | ${p.frequency} | ${p.duration}`}
              >
                <span>+ {p.medicine}</span>
                {p.dosage && <span className="opacity-75 font-mono text-[10px]">{p.dosage}</span>}
                {p.frequency && (
                  <span className="text-[9.5px] opacity-80 font-mono">
                    · {p.frequency.split(' ')[0]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const ALL_DATALIST_FIELDS: SuggestionFieldKey[] = [
  'city',
  'bp',
  'pulse',
  'temp',
  'spo2',
  'complaints',
  'ipssFrequency',
  'ipssUrgency',
  'ipssNocturia',
  'ipssPoorFlow',
  'ipssIntermittency',
  'ipssStraining',
  'ipssIncompleteEvac',
  'ipssQol',
  'systemicExamination',
  'genitalExamination',
  'perRectalExam',
  'pastMedication',
  'labTestsAndImaging',
  'diagnosis',
  'testsRequested',
  'testsRequestedByWhen',
  'medicine',
  'dosage',
  'when',
  'frequency',
  'duration',
  'rxNotes',
  'dietAndExercise',
  'assessmentPlan',
  'advice',
  'nextVisit',
  'doctorName',
  'referredDoctor',
  'referredSpeciality',
];

export const GlobalFieldDatalists: React.FC<{ refreshKey?: number | string }> = ({
  refreshKey,
}) => {
  const [masterTick, setMasterTick] = useState(0);

  useEffect(() => {
    const handleRefresh = () => setMasterTick((t) => t + 1);
    window.addEventListener(MEDICINE_MASTER_CHANGED_EVENT, handleRefresh);
    return () => window.removeEventListener(MEDICINE_MASTER_CHANGED_EVENT, handleRefresh);
  }, []);

  const datalists = React.useMemo(() => {
    const masterStore = loadMedicineMasterStore();
    return ALL_DATALIST_FIELDS.map((field) => {
      const base = getFieldSuggestions(field, '', 25);
      if (field === 'medicine') {
        const merged = Array.from(
          new Set([...masterStore.medications.map((m) => m.medicine), ...base].filter(Boolean))
        );
        return { field, items: merged };
      }
      if (field === 'rxNotes') {
        const merged = Array.from(
          new Set([...masterStore.medications.map((m) => m.notes), ...base].filter(Boolean))
        );
        return { field, items: merged };
      }
      return { field, items: base };
    });
  }, [refreshKey, masterTick]);

  return (
    <div className="hidden" aria-hidden="true">
      {datalists.map(({ field, items }) => (
        <datalist key={field} id={`suggest-${field}`}>
          {items.map((val) => (
            <option key={val} value={val} />
          ))}
        </datalist>
      ))}
    </div>
  );
};
