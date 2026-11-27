import React, { useMemo, useState } from 'react';
import {
  CheckSquare,
  Square,
  AlertTriangle,
  FileText,
  Image as ImageIcon,
  RefreshCw,
  Calendar,
  Edit3,
  Trash2,
} from 'lucide-react';
import {
  IpdPatientRecord,
  IpdSurgicalProtocolProgress,
  SurgicalProtocolId,
} from '../types/ipd';
import {
  SurgicalProtocolTemplate,
  computePostOpDayNumber,
  getEffectiveSurgicalProtocols,
  getProtocolCompletionStats,
  getSurgicalProtocolById,
  normalizeStageHeadingForDailyProgress,
  suggestProtocolIdFromText,
} from '../utils/surgicalProtocols';
import { AddSurgicalProtocolModal } from './AddSurgicalProtocolModal';
import {
  ProtocolOriginalViewerModal,
  getProtocolOriginalAssets,
} from './IpdSurgicalProtocolsLibraryView';

export type ProtocolDailySyncAction =
  | {
      type: 'toggle-item';
      stageTag: string;
      itemText: string;
      checked: boolean;
    }
  | {
      type: 'set-field';
      stageTag: string;
      fieldLabel: string;
      value: string;
    }
  | {
      type: 'set-deviation';
      value: string;
    };

interface IpdSurgicalProtocolPanelProps {
  patient: IpdPatientRecord;
  availableProtocols?: SurgicalProtocolTemplate[];
  customProtocols?: SurgicalProtocolTemplate[];
  doctorUid?: string;
  onSaveCustomProtocol?: (protocol: SurgicalProtocolTemplate) => void;
  onDeleteCustomProtocol?: (protocolId: string) => void;
  onUpdateProtocol: (
    nextProtocol: IpdSurgicalProtocolProgress | undefined,
    updatedSurgeryDate?: string,
    syncAction?: ProtocolDailySyncAction
  ) => void;
}

export const IpdSurgicalProtocolPanel: React.FC<IpdSurgicalProtocolPanelProps> = ({
  patient,
  availableProtocols,
  customProtocols = [],
  doctorUid,
  onSaveCustomProtocol,
  onDeleteCustomProtocol,
  onUpdateProtocol,
}) => {
  const allProtocols = useMemo(
    () => availableProtocols ?? getEffectiveSurgicalProtocols(customProtocols),
    [availableProtocols, customProtocols]
  );

  const activeProtocolProgress = patient.surgicalProtocol;
  const activeTemplate = useMemo(() => {
    if (!activeProtocolProgress) return undefined;
    return (
      allProtocols.find((p) => p.id === activeProtocolProgress.protocolId) ||
      getSurgicalProtocolById(activeProtocolProgress.protocolId)
    );
  }, [activeProtocolProgress, allProtocols]);

  const [activeStageId, setActiveStageId] = useState<string>('');
  const [confirmSwitchId, setConfirmSwitchId] = useState<SurgicalProtocolId | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingCustomProtocol, setEditingCustomProtocol] =
    useState<SurgicalProtocolTemplate | null>(null);
  const [confirmDeleteCustomId, setConfirmDeleteCustomId] = useState<string | null>(null);
  const [viewerProtocol, setViewerProtocol] = useState<SurgicalProtocolTemplate | null>(null);

  const suggestedId = useMemo(() => {
    const searchStr = [
      patient.otNotes?.procedureName,
      ...(patient.otProcedures || []).map((o) => o.procedureName),
      patient.admittingDiagnosis,
    ]
      .filter(Boolean)
      .join(' ');
    return suggestProtocolIdFromText(searchStr);
  }, [patient.otNotes?.procedureName, patient.otProcedures, patient.admittingDiagnosis, customProtocols]);

  const effectiveSurgeryDate =
    activeProtocolProgress?.surgeryDate ||
    patient.surgeryDate ||
    patient.otNotes?.surgeryDate ||
    '';

  const currentPod = computePostOpDayNumber(effectiveSurgeryDate);

  const selectedStage = useMemo(() => {
    if (!activeTemplate) return undefined;
    if (activeStageId && activeTemplate.stages.some((s) => s.id === activeStageId)) {
      return activeTemplate.stages.find((s) => s.id === activeStageId);
    }
    return activeTemplate.stages[0];
  }, [activeTemplate, activeStageId]);

  const startProtocol = (protocolId: SurgicalProtocolId, explicitTemplate?: SurgicalProtocolTemplate) => {
    const now = Date.now();
    const sDate =
      patient.surgeryDate ||
      patient.otNotes?.surgeryDate ||
      new Date().toISOString().split('T')[0];
    const next: IpdSurgicalProtocolProgress = {
      protocolId,
      surgeryDate: sDate,
      checkedItemIds: [],
      fieldValues: {},
      deviationsNote: '',
      startedAt: now,
      updatedAt: now,
    };
    const tpl =
      explicitTemplate ||
      allProtocols.find((p) => p.id === protocolId) ||
      getSurgicalProtocolById(protocolId);
    setActiveStageId(tpl?.stages[0]?.id || '');
    setConfirmSwitchId(null);
    onUpdateProtocol(next, sDate);
  };

  const toggleItem = (itemId: string, itemText: string, stageTag: string) => {
    if (!activeProtocolProgress) return;
    const set = new Set(activeProtocolProgress.checkedItemIds || []);
    const willCheck = !set.has(itemId);
    if (willCheck) {
      set.add(itemId);
    } else {
      set.delete(itemId);
    }
    onUpdateProtocol(
      {
        ...activeProtocolProgress,
        checkedItemIds: Array.from(set),
        updatedAt: Date.now(),
      },
      undefined,
      {
        type: 'toggle-item',
        stageTag,
        itemText,
        checked: willCheck,
      }
    );
  };

  const updateField = (
    key: string,
    value: string,
    syncMeta?: { stageTag: string; fieldLabel: string }
  ) => {
    if (!activeProtocolProgress) return;
    onUpdateProtocol(
      {
        ...activeProtocolProgress,
        fieldValues: {
          ...(activeProtocolProgress.fieldValues || {}),
          [key]: value,
        },
        updatedAt: Date.now(),
      },
      undefined,
      syncMeta
        ? {
            type: 'set-field',
            stageTag: syncMeta.stageTag,
            fieldLabel: syncMeta.fieldLabel,
            value,
          }
        : undefined
    );
  };

  const updateSurgeryDate = (nextDate: string) => {
    if (!activeProtocolProgress) return;
    onUpdateProtocol(
      {
        ...activeProtocolProgress,
        surgeryDate: nextDate,
        updatedAt: Date.now(),
      },
      nextDate
    );
  };

  const handleSaveCustom = (proto: SurgicalProtocolTemplate, applyImmediately?: boolean) => {
    onSaveCustomProtocol?.(proto);
    setIsAddModalOpen(false);
    setEditingCustomProtocol(null);
    if (applyImmediately) {
      startProtocol(proto.id, proto);
    }
  };

  const handleConfirmDeleteCustom = (protocolId: string) => {
    if (activeProtocolProgress?.protocolId === protocolId) {
      onUpdateProtocol(undefined);
    }
    onDeleteCustomProtocol?.(protocolId);
    setConfirmDeleteCustomId(null);
  };

  const addModal = isAddModalOpen ? (
    <AddSurgicalProtocolModal
      existingProtocol={editingCustomProtocol}
      doctorUid={doctorUid}
      canApplyToCurrentPatient={true}
      onSave={handleSaveCustom}
      onClose={() => {
        setIsAddModalOpen(false);
        setEditingCustomProtocol(null);
      }}
    />
  ) : null;

  const originalViewerModal = viewerProtocol ? (
    <ProtocolOriginalViewerModal
      protocol={viewerProtocol}
      onClose={() => setViewerProtocol(null)}
    />
  ) : null;

  if (!activeProtocolProgress || !activeTemplate) {
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Select Post-Operative Surgical Protocol
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Track daily postoperative milestones, catheter/drain removal, voiding trials, and
              discharge readiness against preset or custom surgical pathways.
            </p>
          </div>
          {suggestedId && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => startProtocol(suggestedId)}
                className="px-3.5 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
              >
                Start Suggested:{' '}
                {allProtocols.find((p) => p.id === suggestedId)?.shortName ||
                  getSurgicalProtocolById(suggestedId)?.shortName}
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {allProtocols.map((proto) => {
            const isSuggested = proto.id === suggestedId;
            const totalChecks = proto.stages.reduce((acc, s) => acc + s.items.length, 0);
            const isDeletingThis = confirmDeleteCustomId === proto.id;
            return (
              <div
                key={proto.id}
                className={`p-4 rounded-xl border bg-white flex flex-col justify-between gap-4 transition-colors ${
                  isSuggested ? 'border-teal-500 ring-1 ring-teal-500/20' : 'border-slate-200'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-semibold text-teal-800 truncate">
                        {proto.expectedStayDays}
                      </span>
                      {proto.isCustom && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-[10px] font-bold text-indigo-700 shrink-0">
                          Custom
                        </span>
                      )}
                    </div>
                    <span className="font-mono tabular-nums shrink-0">{totalChecks} checks</span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-900">{proto.name}</h4>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {proto.subtitle || `${proto.stages.length} postoperative stages`}
                  </p>
                </div>

                {isDeletingThis ? (
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-rose-100 bg-rose-50/70 -mx-4 -mb-4 px-4 py-2.5 rounded-b-xl">
                    <span className="text-[11px] font-semibold text-rose-800">
                      Delete protocol?
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleConfirmDeleteCustom(proto.id)}
                        className="px-2.5 py-1 rounded-md bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold cursor-pointer"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteCustomId(null)}
                        className="px-2 py-1 rounded-md bg-white border border-slate-200 text-[11px] font-semibold text-slate-600 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {getProtocolOriginalAssets(proto).length > 0 && (
                        <button
                          type="button"
                          onClick={() => setViewerProtocol(proto)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-900 cursor-pointer"
                          title="View original PDF or image"
                        >
                          {getProtocolOriginalAssets(proto)[0].mimeType === 'application/pdf' ? (
                            <FileText className="w-3.5 h-3.5" />
                          ) : (
                            <ImageIcon className="w-3.5 h-3.5" />
                          )}
                          <span>Original</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCustomProtocol(proto);
                          setIsAddModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1 px-1.5 py-1 rounded-md text-[11px] font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
                        title="Edit protocol"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteCustomId(proto.id)}
                        className="inline-flex items-center gap-1 px-1.5 py-1 rounded-md text-[11px] font-semibold text-slate-500 hover:text-rose-700 hover:bg-rose-50 cursor-pointer"
                        title="Delete protocol"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => startProtocol(proto.id, proto)}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Apply Pathway
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {addModal}
        {originalViewerModal}
      </div>
    );
  }

  const stats = getProtocolCompletionStats(
    activeProtocolProgress.protocolId,
    activeProtocolProgress.checkedItemIds
  );
  const checkedSet = new Set(activeProtocolProgress.checkedItemIds || []);

  return (
    <div className="space-y-5">
      {/* Protocol Summary Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span className="font-semibold text-teal-800">{activeTemplate.expectedStayDays}</span>
            {activeTemplate.isCustom && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-[10px] font-bold text-indigo-700">
                Custom Protocol
              </span>
            )}
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {stats.completed} / {stats.total} completed ({stats.percent}%)
            </span>
            {currentPod !== null && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums font-bold text-slate-900">
                  Current: POD {currentPod}
                </span>
              </>
            )}
          </div>
          <h3 className="text-base font-bold text-slate-900">{activeTemplate.name}</h3>
          <p className="text-xs text-slate-600">{activeTemplate.subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <span className="font-medium">POD 0 (Surgery):</span>
            <input
              type="date"
              value={effectiveSurgeryDate}
              onChange={(e) => updateSurgeryDate(e.target.value)}
              className="bg-transparent text-xs font-mono text-slate-900 outline-none"
            />
          </label>

          {getProtocolOriginalAssets(activeTemplate).length > 0 && (
            <button
              type="button"
              onClick={() => setViewerProtocol(activeTemplate)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 whitespace-nowrap cursor-pointer"
            >
              {getProtocolOriginalAssets(activeTemplate)[0].mimeType === 'application/pdf' ? (
                <FileText className="w-3.5 h-3.5 text-teal-600" />
              ) : (
                <ImageIcon className="w-3.5 h-3.5 text-teal-600" />
              )}
              <span>View Original PDF / Image</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setEditingCustomProtocol(activeTemplate);
              setIsAddModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 whitespace-nowrap cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5 text-slate-500" />
            <span>Edit Template</span>
          </button>

          <select
            aria-label="Switch surgical protocol"
            value=""
            onChange={(e) => {
              const val = e.target.value as SurgicalProtocolId;
              if (val && val !== activeProtocolProgress.protocolId) {
                setConfirmSwitchId(val);
              }
            }}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 outline-none cursor-pointer"
          >
            <option value="">Switch Protocol...</option>
            {allProtocols.map((p) => (
              <option key={p.id} value={p.id}>
                {p.shortName}
                {p.isCustom ? ' (Custom)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {confirmSwitchId && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-amber-950 font-medium">
            Switch this patient to{' '}
            <strong>
              {allProtocols.find((p) => p.id === confirmSwitchId)?.name ||
                getSurgicalProtocolById(confirmSwitchId)?.name}
            </strong>
            ? Current checklist selections will reset for the new pathway.
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => startProtocol(confirmSwitchId)}
              className="px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold cursor-pointer inline-flex items-center gap-1"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Confirm Switch</span>
            </button>
            <button
              type="button"
              onClick={() => setConfirmSwitchId(null)}
              className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Progress Bar */}
      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-teal-600 transition-all duration-200"
          style={{ width: `${stats.percent}%` }}
        />
      </div>

      {/* Urgent Escalation Criteria */}
      {activeTemplate.urgentEscalationText && (
        <div className="p-3.5 rounded-xl bg-rose-50/70 border border-rose-200 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
          <div className="text-xs text-rose-950 leading-relaxed">
            <span className="font-bold">Urgent Escalation Criteria: </span>
            {activeTemplate.urgentEscalationText}
          </div>
        </div>
      )}

      {/* Stage Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
        {activeTemplate.stages.map((stage, stageIdx) => {
          const isSelected = selectedStage?.id === stage.id;
          const stageDone = stage.items.filter((i) => checkedSet.has(i.id)).length;
          const displayTag =
            normalizeStageHeadingForDailyProgress(
              stage.dayTag,
              stageIdx,
              activeTemplate.stages
            ) || stage.dayTag;
          return (
            <button
              key={stage.id}
              type="button"
              onClick={() => setActiveStageId(stage.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                isSelected
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>{displayTag}</span>
              <span className="font-mono tabular-nums text-[11px] text-slate-500">
                {stageDone}/{stage.items.length}
              </span>
            </button>
          );
        })}
      </div>

      {/* Active Stage Fields & Checklist */}
      {selectedStage && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-bold text-slate-900">{selectedStage.title}</h4>
              {selectedStage.subtitle && (
                <p className="text-xs text-slate-600 mt-0.5">{selectedStage.subtitle}</p>
              )}
            </div>
            <span className="text-[11px] font-semibold text-teal-800 bg-teal-50 border border-teal-200 rounded-md px-2.5 py-1">
              Checked items auto-add to Daily Progress Notes
            </span>
          </div>

          {selectedStage.fields && selectedStage.fields.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4 rounded-xl bg-slate-50/70 border border-slate-200">
              {selectedStage.fields.map((field) => {
                const val = activeProtocolProgress.fieldValues?.[field.key] || '';
                return (
                  <div key={field.key} className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-700 block">
                      {field.label}
                    </label>
                    {field.options ? (
                      <div className="flex flex-wrap gap-1.5">
                        {field.options.map((opt) => {
                          const active = val === opt;
                          return (
                            <button
                              key={opt}
                              type="button"
                              onClick={() =>
                                updateField(field.key, active ? '' : opt, {
                                  stageTag: selectedStage.dayTag,
                                  fieldLabel: field.label,
                                })
                              }
                              className={`px-2.5 py-1 rounded-md border text-[11px] font-semibold transition-colors cursor-pointer ${
                                active
                                  ? 'bg-teal-700 text-white border-teal-700'
                                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={val}
                        onChange={(e) => updateField(field.key, e.target.value)}
                        onBlur={(e) =>
                          updateField(field.key, e.target.value, {
                            stageTag: selectedStage.dayTag,
                            fieldLabel: field.label,
                          })
                        }
                        placeholder={field.placeholder || ''}
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Checklist Items */}
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl bg-white overflow-hidden">
            {selectedStage.items.map((item) => {
              const checked = checkedSet.has(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggleItem(item.id, item.text, selectedStage.dayTag)}
                  className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors cursor-pointer ${
                    checked ? 'bg-teal-50/40' : 'hover:bg-slate-50'
                  }`}
                >
                  {checked ? (
                    <CheckSquare className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 text-xs leading-relaxed">
                    <span
                      className={
                        checked ? 'text-slate-500 line-through' : 'text-slate-900 font-medium'
                      }
                    >
                      {item.text}
                    </span>
                    {item.critical && !checked && (
                      <span className="ml-2 text-[11px] font-bold text-rose-700">
                        Priority check
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Protocol Deviations / Surgeon Notes */}
      <div className="space-y-1.5 pt-2 border-t border-slate-200">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs font-bold text-slate-800">
            Pathway Deviations / Surgeon Post-Op Notes
          </label>
        </div>
        <textarea
          rows={2}
          value={activeProtocolProgress.deviationsNote || ''}
          onChange={(e) =>
            onUpdateProtocol({
              ...activeProtocolProgress,
              deviationsNote: e.target.value,
              updatedAt: Date.now(),
            })
          }
          onBlur={(e) =>
            onUpdateProtocol(
              {
                ...activeProtocolProgress,
                deviationsNote: e.target.value,
                updatedAt: Date.now(),
              },
              undefined,
              { type: 'set-deviation', value: e.target.value }
            )
          }
          placeholder="Document any delay, earlier progression, drain retention reason, or conversion to open..."
          className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl text-slate-900 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
        />
      </div>

      {addModal}
      {originalViewerModal}
    </div>
  );
};
