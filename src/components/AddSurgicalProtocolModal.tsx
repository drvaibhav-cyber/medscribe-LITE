import React, { useMemo, useRef, useState } from 'react';
import {
  X,
  Upload,
  FileText,
  Plus,
  Trash2,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
} from 'lucide-react';
import {
  ProtocolCheckItem,
  ProtocolFieldDef,
  ProtocolSourceAsset,
  ProtocolStage,
  SurgicalProtocolTemplate,
  generateCustomProtocolId,
  isBuiltinProtocolId,
  sanitizeCustomSurgicalProtocol,
  uploadProtocolSourceAssetsToServer,
} from '../utils/surgicalProtocols';

interface AddSurgicalProtocolModalProps {
  existingProtocol?: SurgicalProtocolTemplate | null;
  doctorUid?: string;
  canApplyToCurrentPatient?: boolean;
  onSave: (protocol: SurgicalProtocolTemplate, applyImmediately?: boolean) => void;
  onClose: () => void;
}

interface UploadedProtocolSource {
  id: string;
  name: string;
  mimeType: string;
  data: string; // base64 without data: prefix
  sizeLabel: string;
  previewUrl?: string;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function createBlankProtocol(): SurgicalProtocolTemplate {
  return {
    id: generateCustomProtocolId('custom-protocol'),
    name: '',
    shortName: '',
    subtitle: '',
    expectedStayDays: 'POD 1–2 Target Discharge',
    urgentEscalationText: '',
    defaultDischargeAdvice: '',
    defaultReturnWarnings: '',
    isCustom: true,
    stages: [
      {
        id: 'stage-pod0',
        dayTag: 'POD 0',
        title: 'Immediate Postoperative Care & Orders',
        fields: [],
        items: [{ id: 'stage-pod0-i1', text: '' }],
      },
      {
        id: 'stage-discharge',
        dayTag: 'Discharge',
        title: 'Discharge Readiness & Follow-Up',
        fields: [],
        items: [{ id: 'stage-discharge-i1', text: '' }],
      },
    ],
  };
}

export const AddSurgicalProtocolModal: React.FC<AddSurgicalProtocolModalProps> = ({
  existingProtocol,
  doctorUid,
  canApplyToCurrentPatient = false,
  onSave,
  onClose,
}) => {
  const isEditing = Boolean(existingProtocol);
  const isEditingBuiltin = Boolean(existingProtocol && isBuiltinProtocolId(existingProtocol.id));
  const [uploadedFiles, setUploadedFiles] = useState<UploadedProtocolSource[]>([]);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [draft, setDraft] = useState<SurgicalProtocolTemplate>(() =>
    existingProtocol ? JSON.parse(JSON.stringify(existingProtocol)) : createBlankProtocol()
  );
  const [expandedStageIds, setExpandedStageIds] = useState<Record<string, boolean>>({});
  const editAttachInputRef = useRef<HTMLInputElement>(null);

  const totalChecklistCount = useMemo(
    () => draft.stages.reduce((acc, st) => acc + st.items.filter((i) => i.text.trim()).length, 0),
    [draft.stages]
  );

  const handleFileSelection = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setErrorMsg('');
    setIsProcessingFiles(true);
    try {
      const nextFiles: UploadedProtocolSource[] = [];
      const incoming = Array.from(fileList).slice(0, Math.max(0, 10 - uploadedFiles.length));

      for (const file of incoming) {
        const lowerName = file.name.toLowerCase();
        const isPdf = file.type === 'application/pdf' || lowerName.endsWith('.pdf');
        const isImage =
          (file.type.startsWith('image/') && !/heic|heif/i.test(file.type)) ||
          /\.(jpg|jpeg|png|webp)$/i.test(lowerName);

        if (!isPdf && !isImage) {
          setErrorMsg(
            `Skipped "${file.name}": please upload PDF or image files (JPG, PNG, WebP).`
          );
          continue;
        }

        if (file.size > 15 * 1024 * 1024) {
          setErrorMsg(`"${file.name}" exceeds 15 MB limit.`);
          continue;
        }

        const base64 = await readFileAsBase64(file);
        const resolvedMime = isPdf ? 'application/pdf' : file.type || 'image/jpeg';
        nextFiles.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: file.name,
          mimeType: resolvedMime,
          data: base64,
          sizeLabel: formatBytes(file.size),
          previewUrl: isPdf ? undefined : `data:${resolvedMime};base64,${base64}`,
        });
      }

      if (nextFiles.length > 0) {
        setUploadedFiles((prev) => [...prev, ...nextFiles]);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not process the selected file(s).');
    } finally {
      setIsProcessingFiles(false);
      if (editAttachInputRef.current) editAttachInputRef.current.value = '';
    }
  };

  const updateStage = (stageIdx: number, updater: (st: ProtocolStage) => ProtocolStage) => {
    setDraft((prev) => ({
      ...prev,
      stages: prev.stages.map((st, idx) => (idx === stageIdx ? updater(st) : st)),
    }));
  };

  const addStage = () => {
    const newId = `stage-${Date.now().toString(36)}`;
    const nextNum = draft.stages.length;
    setDraft((prev) => ({
      ...prev,
      stages: [
        ...prev.stages,
        {
          id: newId,
          dayTag: `POD ${nextNum}`,
          title: `Postoperative Day ${nextNum}`,
          fields: [],
          items: [{ id: `${newId}-i1`, text: '' }],
        },
      ],
    }));
    setExpandedStageIds((prev) => ({ ...prev, [newId]: true }));
  };

  const removeStage = (stageIdx: number) => {
    setDraft((prev) => ({
      ...prev,
      stages: prev.stages.filter((_, idx) => idx !== stageIdx),
    }));
  };

  const addChecklistItem = (stageIdx: number) => {
    updateStage(stageIdx, (st) => ({
      ...st,
      items: [
        ...st.items,
        {
          id: `${st.id}-i${Date.now().toString(36)}`,
          text: '',
        },
      ],
    }));
  };

  const updateChecklistItem = (
    stageIdx: number,
    itemIdx: number,
    patch: Partial<ProtocolCheckItem>
  ) => {
    updateStage(stageIdx, (st) => ({
      ...st,
      items: st.items.map((it, i) => (i === itemIdx ? { ...it, ...patch } : it)),
    }));
  };

  const removeChecklistItem = (stageIdx: number, itemIdx: number) => {
    updateStage(stageIdx, (st) => ({
      ...st,
      items: st.items.filter((_, i) => i !== itemIdx),
    }));
  };

  const addField = (stageIdx: number) => {
    updateStage(stageIdx, (st) => {
      const nextFields: ProtocolFieldDef[] = [
        ...(st.fields || []),
        {
          key: `field_${Date.now().toString(36)}`,
          label: '',
          placeholder: '',
        },
      ];
      return { ...st, fields: nextFields };
    });
  };

  const updateField = (
    stageIdx: number,
    fieldIdx: number,
    patch: Partial<ProtocolFieldDef>
  ) => {
    updateStage(stageIdx, (st) => ({
      ...st,
      fields: (st.fields || []).map((f, i) => (i === fieldIdx ? { ...f, ...patch } : f)),
    }));
  };

  const removeField = (stageIdx: number, fieldIdx: number) => {
    updateStage(stageIdx, (st) => ({
      ...st,
      fields: (st.fields || []).filter((_, i) => i !== fieldIdx),
    }));
  };

  const handleSaveProtocol = async (applyImmediately = false) => {
    setErrorMsg('');
    if (!draft.name.trim()) {
      setErrorMsg('Please enter a Protocol Name.');
      return;
    }

    setIsSaving(true);
    try {
      let persistedAssets: ProtocolSourceAsset[] | undefined =
        draft.sourceAssets && draft.sourceAssets.length > 0
          ? draft.sourceAssets
          : existingProtocol?.sourceAssets;
      let persistedPdfUrl: string | undefined = draft.pdfUrl || existingProtocol?.pdfUrl;
      let persistedSourceFileName: string | undefined =
        draft.sourceFileName || existingProtocol?.sourceFileName;

      if (uploadedFiles.length > 0) {
        let uploadedAssets: ProtocolSourceAsset[] = [];
        if (doctorUid) {
          uploadedAssets = await uploadProtocolSourceAssetsToServer(
            doctorUid,
            uploadedFiles.map((f) => ({
              name: f.name,
              mimeType: f.mimeType,
              data: f.data,
            }))
          );
        }

        // Offline / fallback: preserve image data URLs locally if server upload wasn't available
        if (uploadedAssets.length === 0) {
          uploadedAssets = uploadedFiles
            .filter((f) => f.mimeType.startsWith('image/') && f.data.length < 400_000)
            .map((f) => ({
              name: f.name,
              mimeType: f.mimeType,
              url: `data:${f.mimeType};base64,${f.data}`,
            }));
        }

        if (uploadedAssets.length > 0) {
          persistedAssets = uploadedAssets;
          const firstPdf = uploadedAssets.find((a) => a.mimeType === 'application/pdf');
          if (firstPdf) {
            persistedPdfUrl = firstPdf.url;
          } else if (!isEditingBuiltin) {
            // If user replaced original file with photo(s), clear stale pdfUrl on custom protocol
            persistedPdfUrl = undefined;
          }
        }
        persistedSourceFileName = uploadedFiles.map((f) => f.name).join(', ');
      }

      const sanitized = sanitizeCustomSurgicalProtocol({
        ...draft,
        id: existingProtocol?.id || draft.id || generateCustomProtocolId(draft.name),
        pdfUrl: persistedPdfUrl,
        sourceAssets: persistedAssets,
        sourceFileName: persistedSourceFileName,
        createdAt: existingProtocol?.createdAt || draft.createdAt || Date.now(),
        updatedAt: Date.now(),
      });
      if (!sanitized) {
        setErrorMsg(
          'Please include at least one stage with at least one checklist item or structured field.'
        );
        return;
      }
      onSave(sanitized, applyImmediately);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not save surgical protocol.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-600 text-white flex items-center justify-center shadow-xs">
              <ClipboardCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {isEditing
                  ? isEditingBuiltin
                    ? 'Edit Surgical Protocol'
                    : 'Edit Custom Surgical Protocol'
                  : 'Create Custom Surgical Protocol'}
              </h2>
              <p className="text-xs text-slate-500">
                Build postoperative stages, checklist items, quick-select parameters, and discharge guidance stored locally.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition-colors cursor-pointer"
            aria-label="Close add surgical protocol modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {errorMsg && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="space-y-5">
              {/* Protocol Metadata */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Protocol Name *
                  </label>
                  <input
                    type="text"
                    value={draft.name}
                    onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. RIRS Postoperative Pathway"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Short Label (used in Daily Notes heading) *
                  </label>
                  <input
                    type="text"
                    value={draft.shortName}
                    onChange={(e) => setDraft((p) => ({ ...p, shortName: e.target.value }))}
                    placeholder="e.g. RIRS"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Subtitle / Scope
                  </label>
                  <input
                    type="text"
                    value={draft.subtitle}
                    onChange={(e) => setDraft((p) => ({ ...p, subtitle: e.target.value }))}
                    placeholder="e.g. Retrograde intrarenal surgery POD 0 to Discharge"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Expected Stay / Discharge Target
                  </label>
                  <input
                    type="text"
                    value={draft.expectedStayDays}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, expectedStayDays: e.target.value }))
                    }
                    placeholder="e.g. POD 1 Target Discharge"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              {/* Original PDF / Image Attachment Status */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800">
                      Original Reference PDF / Image
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {uploadedFiles.length > 0
                        ? `${uploadedFiles.length} new file${uploadedFiles.length === 1 ? '' : 's'} ready to save (${uploadedFiles.map((f) => f.name).join(', ')})`
                        : draft.sourceAssets && draft.sourceAssets.length > 0
                        ? `${draft.sourceAssets.length} attached file${draft.sourceAssets.length === 1 ? '' : 's'} (${draft.sourceAssets.map((a) => a.name).join(', ')})`
                        : draft.pdfUrl
                        ? `Attached PDF: ${draft.sourceFileName || draft.pdfUrl.split('/').pop()}`
                        : 'No original PDF or photo attached yet.'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    ref={editAttachInputRef}
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp"
                    multiple
                    className="hidden"
                    onChange={(e) => handleFileSelection(e.target.files)}
                  />
                  {uploadedFiles.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setUploadedFiles([])}
                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 cursor-pointer"
                    >
                      Clear New Files
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => editAttachInputRef.current?.click()}
                    disabled={isProcessingFiles || isSaving}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>
                      {uploadedFiles.length > 0 ||
                      (draft.sourceAssets && draft.sourceAssets.length > 0) ||
                      draft.pdfUrl
                        ? 'Replace PDF / Photo'
                        : 'Attach PDF / Photo'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Stages Editor */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                      Protocol Stages &amp; Checklist Items ({draft.stages.length} stages ·{' '}
                      {totalChecklistCount} items)
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Items checked within the same stage will automatically club under one heading
                      (e.g. &ldquo;{draft.shortName || 'Protocol'} · POD 1&rdquo;) in Daily Notes.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addStage}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Stage
                  </button>
                </div>

                {draft.stages.map((stage, sIdx) => {
                  const isOpen = expandedStageIds[stage.id] ?? true;
                  return (
                    <div
                      key={stage.id}
                      className="border border-slate-200 rounded-xl bg-white overflow-hidden"
                    >
                      <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedStageIds((prev) => ({
                              ...prev,
                              [stage.id]: !isOpen,
                            }))
                          }
                          className="flex items-center gap-2 text-left flex-1 min-w-0 cursor-pointer"
                        >
                          <span className="px-2 py-0.5 rounded-md bg-teal-100 text-teal-800 text-[11px] font-bold shrink-0">
                            {stage.dayTag || `Stage ${sIdx + 1}`}
                          </span>
                          <span className="text-xs font-bold text-slate-800 truncate">
                            {stage.title || 'Untitled Stage'}
                          </span>
                          <span className="text-[11px] text-slate-500 shrink-0">
                            ({stage.items.length} items
                            {stage.fields && stage.fields.length > 0
                              ? ` · ${stage.fields.length} fields`
                              : ''}
                            )
                          </span>
                        </button>
                        <div className="flex items-center gap-1">
                          {draft.stages.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeStage(sIdx)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded-md cursor-pointer"
                              title="Remove stage"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedStageIds((prev) => ({
                                ...prev,
                                [stage.id]: !isOpen,
                              }))
                            }
                            className="p-1 text-slate-500 hover:text-slate-800 rounded-md cursor-pointer"
                          >
                            {isOpen ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>

                      {isOpen && (
                        <div className="p-3.5 space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            <div>
                              <label className="block text-[10.5px] font-bold text-slate-500 uppercase mb-1">
                                Day / Stage Tag
                              </label>
                              <input
                                type="text"
                                value={stage.dayTag}
                                onChange={(e) =>
                                  updateStage(sIdx, (st) => ({ ...st, dayTag: e.target.value }))
                                }
                                placeholder="e.g. POD 0, POD 1, Discharge"
                                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="block text-[10.5px] font-bold text-slate-500 uppercase mb-1">
                                Stage Heading
                              </label>
                              <input
                                type="text"
                                value={stage.title}
                                onChange={(e) =>
                                  updateStage(sIdx, (st) => ({ ...st, title: e.target.value }))
                                }
                                placeholder="e.g. Immediate Postoperative Care & Orders"
                                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                              />
                            </div>
                          </div>

                          {/* Structured Fields for Stage */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                Quick-Fill Parameters (Optional)
                              </span>
                              <button
                                type="button"
                                onClick={() => addField(sIdx)}
                                className="text-[11px] font-semibold text-teal-700 hover:text-teal-800 inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Plus className="w-3 h-3" />
                                Add Parameter
                              </button>
                            </div>
                            {(stage.fields || []).map((field, fIdx) => (
                              <div
                                key={`${field.key}-${fIdx}`}
                                className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center bg-slate-50 p-2 rounded-lg border border-slate-200"
                              >
                                <input
                                  type="text"
                                  value={field.label}
                                  onChange={(e) =>
                                    updateField(sIdx, fIdx, { label: e.target.value })
                                  }
                                  placeholder="Field label (e.g. Side, DJ Stent)"
                                  className="sm:col-span-4 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
                                />
                                <input
                                  type="text"
                                  value={(field.options || []).join(', ')}
                                  onChange={(e) => {
                                    const opts = e.target.value
                                      .split(',')
                                      .map((s) => s.trim())
                                      .filter(Boolean);
                                    updateField(sIdx, fIdx, {
                                      options: opts.length > 0 ? opts : undefined,
                                    });
                                  }}
                                  placeholder="Options comma-separated (optional, e.g. Right, Left)"
                                  className="sm:col-span-4 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
                                />
                                <input
                                  type="text"
                                  value={field.placeholder || ''}
                                  onChange={(e) =>
                                    updateField(sIdx, fIdx, { placeholder: e.target.value })
                                  }
                                  placeholder="Placeholder hint"
                                  className="sm:col-span-3 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeField(sIdx, fIdx)}
                                  className="sm:col-span-1 p-1.5 text-slate-400 hover:text-rose-600 justify-self-end cursor-pointer"
                                  title="Remove field"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>

                          {/* Checklist Items for Stage */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                Checklist Items ({stage.items.length})
                              </span>
                              <button
                                type="button"
                                onClick={() => addChecklistItem(sIdx)}
                                className="text-[11px] font-semibold text-teal-700 hover:text-teal-800 inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Plus className="w-3 h-3" />
                                Add Item
                              </button>
                            </div>
                            {stage.items.map((item, iIdx) => (
                              <div key={item.id} className="flex items-start gap-2">
                                <input
                                  type="text"
                                  value={item.text}
                                  onChange={(e) =>
                                    updateChecklistItem(sIdx, iIdx, { text: e.target.value })
                                  }
                                  placeholder="Describe clinical check, order, or milestone..."
                                  className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                                />
                                <label className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 cursor-pointer shrink-0 select-none">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(item.critical)}
                                    onChange={(e) =>
                                      updateChecklistItem(sIdx, iIdx, {
                                        critical: e.target.checked,
                                      })
                                    }
                                    className="rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                                  />
                                  Priority
                                </label>
                                <button
                                  type="button"
                                  onClick={() => removeChecklistItem(sIdx, iIdx)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md cursor-pointer shrink-0"
                                  title="Delete item"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Safety Escalation & Discharge Defaults */}
              <div className="space-y-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                  Safety Escalation &amp; Discharge Defaults (Optional)
                </h3>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Urgent Escalation / Red Flag Criteria
                  </label>
                  <textarea
                    rows={2}
                    value={draft.urgentEscalationText}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, urgentEscalationText: e.target.value }))
                    }
                    placeholder="Signs requiring urgent clinician review or emergency escalation..."
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Default Discharge Advice
                    </label>
                    <textarea
                      rows={2}
                      value={draft.defaultDischargeAdvice}
                      onChange={(e) =>
                        setDraft((p) => ({ ...p, defaultDischargeAdvice: e.target.value }))
                      }
                      placeholder="Fluid, wound care, diet, and activity instructions..."
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Default Return Warnings
                    </label>
                    <textarea
                      rows={2}
                      value={draft.defaultReturnWarnings}
                      onChange={(e) =>
                        setDraft((p) => ({ ...p, defaultReturnWarnings: e.target.value }))
                      }
                      placeholder="Symptoms for which the patient must return urgently..."
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </div>
              </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-end gap-2.5 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleSaveProtocol(false)}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-teal-800 bg-teal-50 border border-teal-300 hover:bg-teal-100 disabled:opacity-50 cursor-pointer"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              {isSaving ? 'Saving...' : 'Save Protocol'}
            </button>
            {canApplyToCurrentPatient && !isEditing && (
              <button
                type="button"
                onClick={() => handleSaveProtocol(true)}
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 shadow-xs cursor-pointer"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                {isSaving ? 'Saving...' : 'Save & Apply to Patient'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
