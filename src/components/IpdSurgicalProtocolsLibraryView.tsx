import React, { useMemo, useState } from 'react';
import {
  FileText,
  Image as ImageIcon,
  Edit3,
  Trash2,
  Plus,
  Search,
  X,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Download,
  CheckCircle2,
  Eye,
  ZoomIn,
  ZoomOut,
  Users,
  Layers,
} from 'lucide-react';
import { IpdPatientRecord } from '../types/ipd';
import {
  ProtocolSourceAsset,
  SurgicalProtocolTemplate,
  isBuiltinProtocolId,
} from '../utils/surgicalProtocols';
import { AddSurgicalProtocolModal } from './AddSurgicalProtocolModal';
import { MedScribeLogo } from './MedScribeLogo';

export function getProtocolOriginalAssets(
  protocol: SurgicalProtocolTemplate | null | undefined
): ProtocolSourceAsset[] {
  if (!protocol) return [];
  const list: ProtocolSourceAsset[] = [];
  const seenUrls = new Set<string>();

  if (Array.isArray(protocol.sourceAssets)) {
    for (const asset of protocol.sourceAssets) {
      if (!asset?.url || seenUrls.has(asset.url)) continue;
      seenUrls.add(asset.url);
      list.push(asset);
    }
  }

  if (protocol.pdfUrl && !seenUrls.has(protocol.pdfUrl)) {
    seenUrls.add(protocol.pdfUrl);
    const derivedName =
      protocol.sourceFileName ||
      protocol.pdfUrl.split('/').pop() ||
      `${protocol.shortName || protocol.name}.pdf`;
    list.unshift({
      name: derivedName,
      mimeType: 'application/pdf',
      url: protocol.pdfUrl,
    });
  }

  return list;
}

interface ProtocolOriginalViewerModalProps {
  protocol: SurgicalProtocolTemplate;
  onClose: () => void;
}

export const ProtocolOriginalViewerModal: React.FC<ProtocolOriginalViewerModalProps> = ({
  protocol,
  onClose,
}) => {
  const assets = useMemo(() => getProtocolOriginalAssets(protocol), [protocol]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);

  const safeIndex = activeIndex < assets.length ? activeIndex : 0;
  const activeAsset = assets[safeIndex];
  const isPdf =
    activeAsset &&
    (activeAsset.mimeType === 'application/pdf' ||
      activeAsset.url.toLowerCase().endsWith('.pdf'));

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0">
              {isPdf ? <FileText className="w-5 h-5" /> : <ImageIcon className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                {protocol.name} — Original Reference
              </h2>
              <p className="text-xs text-slate-500 truncate">
                {activeAsset
                  ? `${activeAsset.name} (${safeIndex + 1} of ${assets.length})`
                  : 'No original file attached'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {activeAsset && !isPdf && (
              <button
                type="button"
                onClick={() => setZoomed((z) => !z)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 cursor-pointer"
              >
                {zoomed ? <ZoomOut className="w-3.5 h-3.5" /> : <ZoomIn className="w-3.5 h-3.5" />}
                <span>{zoomed ? 'Fit Screen' : 'Zoom 100%'}</span>
              </button>
            )}
            {activeAsset && (
              <a
                href={activeAsset.url}
                download={activeAsset.name}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download</span>
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 transition-colors cursor-pointer"
              aria-label="Close original protocol viewer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Multi-file tabs when protocol has >1 page/image */}
        {assets.length > 1 && (
          <div className="px-5 py-2 border-b border-slate-200 bg-white flex items-center gap-1.5 overflow-x-auto shrink-0">
            {assets.map((asset, idx) => {
              const active = idx === safeIndex;
              const assetIsPdf =
                asset.mimeType === 'application/pdf' || asset.url.toLowerCase().endsWith('.pdf');
              return (
                <button
                  key={`${asset.url}-${idx}`}
                  type="button"
                  onClick={() => {
                    setActiveIndex(idx);
                    setZoomed(false);
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    active
                      ? 'bg-teal-700 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {assetIsPdf ? (
                    <FileText className="w-3.5 h-3.5" />
                  ) : (
                    <ImageIcon className="w-3.5 h-3.5" />
                  )}
                  <span className="max-w-[180px] truncate">
                    Page {idx + 1}: {asset.name}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Viewer Body */}
        <div className="flex-1 overflow-auto bg-slate-100 p-3 sm:p-5 flex items-center justify-center">
          {!activeAsset ? (
            <div className="text-center py-12 space-y-2">
              <FileText className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-sm font-semibold text-slate-700">
                No original PDF or image is attached to this protocol.
              </p>
              <p className="text-xs text-slate-500">
                Use the Edit button on this protocol to attach a PDF or photo reference.
              </p>
            </div>
          ) : isPdf ? (
            <iframe
              src={activeAsset.url}
              title={activeAsset.name}
              className="w-full h-[74vh] rounded-xl border border-slate-300 bg-white shadow-xs"
            />
          ) : (
            <div className="w-full h-full flex items-start justify-center overflow-auto">
              <img
                src={activeAsset.url}
                alt={activeAsset.name}
                className={
                  zoomed
                    ? 'max-w-none rounded-lg shadow-md border border-slate-300 bg-white'
                    : 'max-w-full max-h-[74vh] object-contain rounded-lg shadow-md border border-slate-300 bg-white'
                }
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface IpdSurgicalProtocolsLibraryViewProps {
  protocols: SurgicalProtocolTemplate[];
  customProtocolIds: Set<string>;
  patients: IpdPatientRecord[];
  doctorUid?: string;
  hasDeletedBuiltins: boolean;
  onSaveProtocol: (protocol: SurgicalProtocolTemplate) => void;
  onDeleteProtocol: (protocolId: string) => void;
  onRestoreBuiltinProtocols: () => void;
}

export const IpdSurgicalProtocolsLibraryView: React.FC<
  IpdSurgicalProtocolsLibraryViewProps
> = ({
  protocols,
  customProtocolIds,
  patients,
  doctorUid,
  hasDeletedBuiltins,
  onSaveProtocol,
  onDeleteProtocol,
  onRestoreBuiltinProtocols,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'builtin' | 'custom'>('all');
  const [expandedProtocolIds, setExpandedProtocolIds] = useState<Record<string, boolean>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [viewerProtocol, setViewerProtocol] = useState<SurgicalProtocolTemplate | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingProtocol, setEditingProtocol] = useState<SurgicalProtocolTemplate | null>(null);

  // Map active IPD patient counts per protocol
  const patientUsageMap = useMemo(() => {
    const counts = new Map<string, { total: number; admitted: number }>();
    for (const p of patients) {
      const pid = p.surgicalProtocol?.protocolId;
      if (!pid) continue;
      const cur = counts.get(pid) || { total: 0, admitted: 0 };
      cur.total += 1;
      if (p.status === 'admitted') cur.admitted += 1;
      counts.set(pid, cur);
    }
    return counts;
  }, [patients]);

  const builtinCount = useMemo(
    () => protocols.filter((p) => isBuiltinProtocolId(p.id)).length,
    [protocols]
  );
  const customCount = protocols.length - builtinCount;

  const filteredProtocols = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return protocols.filter((p) => {
      const isBuiltin = isBuiltinProtocolId(p.id);
      if (filterType === 'builtin' && !isBuiltin) return false;
      if (filterType === 'custom' && isBuiltin) return false;
      if (!q) return true;
      const hay = [
        p.name,
        p.shortName,
        p.subtitle,
        p.expectedStayDays,
        p.sourceFileName,
        ...p.stages.map((s) => `${s.dayTag} ${s.title}`),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [protocols, searchQuery, filterType]);

  const toggleExpand = (id: string) => {
    setExpandedProtocolIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSaveFromModal = (saved: SurgicalProtocolTemplate) => {
    onSaveProtocol(saved);
    setIsAddModalOpen(false);
    setEditingProtocol(null);
  };

  return (
    <div className="space-y-5">
      {/* Header Banner — Unified OPD Pastel Gradient & MedScribe Logo */}
      <div className="bg-gradient-to-br from-[#F3EEFF] via-[#EDF6FF] to-[#EBFBF3] rounded-2xl border border-[#DDD6FE] p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 shadow-2xs">
        <div className="flex items-start sm:items-center gap-3">
          <MedScribeLogo variant="icon" size="sm" />
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                Surgical Protocols Library
              </h2>
              <span className="text-xs font-mono font-semibold text-violet-800 tabular-nums">
                · {protocols.length} available
              </span>
            </div>
            <p className="text-xs text-slate-600 max-w-2xl">
              Browse all postoperative surgical pathways, open original reference PDFs or attached
              protocol photos, edit checklist stages, remove unused protocols, or create a new custom
              interactive checklist stored locally.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hasDeletedBuiltins && (
            <button
              type="button"
              onClick={onRestoreBuiltinProtocols}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white/85 hover:bg-white border border-[#DFD8F0] transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-violet-700" />
              <span>Restore Default Protocols</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setEditingProtocol(null);
              setIsAddModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold text-white bg-violet-700 hover:bg-violet-800 shadow-2xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Protocol</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="bg-white rounded-2xl border border-[#E6E0F0] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center p-1 rounded-xl bg-[#F2EFF9] border border-[#E2DCF0]">
          {(
            [
              { key: 'all', label: `All Protocols (${protocols.length})` },
              { key: 'builtin', label: `Standard (${builtinCount})` },
              { key: 'custom', label: `Custom (${customCount})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilterType(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                filterType === tab.key
                  ? 'bg-white text-violet-950 shadow-2xs'
                  : 'text-slate-600 hover:text-violet-950'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 text-violet-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search protocols, stages, stay..."
            className="w-full pl-8 pr-7 py-1.5 text-xs bg-[#F6F4FB] border border-[#DFD8F0] rounded-xl focus:bg-white focus:border-violet-400 outline-none transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
              aria-label="Clear protocol search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Protocol Cards Grid */}
      {filteredProtocols.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center space-y-3">
          <Layers className="w-8 h-8 text-slate-300 mx-auto" />
          <div className="space-y-1">
            <p className="text-sm font-bold text-slate-800">No surgical protocols found</p>
            <p className="text-xs text-slate-500">
              {searchQuery
                ? `No protocols matched "${searchQuery}". Try clearing the search filter.`
                : 'Create a custom postoperative protocol checklist with optional local PDF or photo reference.'}
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 pt-1">
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 cursor-pointer"
              >
                Clear Search
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setEditingProtocol(null);
                setIsAddModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Protocol</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredProtocols.map((proto) => {
            const isBuiltin = isBuiltinProtocolId(proto.id);
            const isCustomizedBuiltin = isBuiltin && customProtocolIds.has(proto.id);
            const assets = getProtocolOriginalAssets(proto);
            const hasOriginalFiles = assets.length > 0;
            const firstIsPdf =
              hasOriginalFiles &&
              (assets[0].mimeType === 'application/pdf' ||
                assets[0].url.toLowerCase().endsWith('.pdf'));
            const totalItems = proto.stages.reduce((acc, s) => acc + s.items.length, 0);
            const totalFields = proto.stages.reduce(
              (acc, s) => acc + (s.fields?.length || 0),
              0
            );
            const usage = patientUsageMap.get(proto.id);
            const isExpanded = Boolean(expandedProtocolIds[proto.id]);
            const isDeleting = confirmDeleteId === proto.id;

            return (
              <div
                key={proto.id}
                className="bg-white rounded-2xl border border-[#E6E0F0] hover:border-[#C4B5FD] transition-colors flex flex-col justify-between overflow-hidden shadow-2xs"
              >
                <div className="p-4 sm:p-5 space-y-3">
                  {/* Top Metadata Row — Clean Unboxed Typographic Metadata */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                      <span className="font-mono font-bold text-violet-800">
                        {proto.shortName}
                      </span>
                      <span className="text-slate-300" aria-hidden="true">·</span>
                      {!isBuiltin ? (
                        <span className="font-semibold text-sky-800">Custom Protocol</span>
                      ) : isCustomizedBuiltin ? (
                        <span className="font-semibold text-amber-800">Edited Standard</span>
                      ) : (
                        <span className="font-medium text-slate-500">Standard</span>
                      )}
                      {proto.expectedStayDays && (
                        <>
                          <span className="text-slate-300" aria-hidden="true">·</span>
                          <span className="text-[11px] font-medium text-slate-500">
                            {proto.expectedStayDays}
                          </span>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500 tabular-nums">
                      <span>{proto.stages.length} stages</span>
                      <span>·</span>
                      <span>{totalItems} checks</span>
                    </div>
                  </div>

                  {/* Title & Subtitle */}
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-snug">
                      {proto.name}
                    </h3>
                    {proto.subtitle && (
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                        {proto.subtitle}
                      </p>
                    )}
                  </div>

                  {/* Stage Summary Chips */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {proto.stages.map((st) => (
                      <span
                        key={st.id}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-50 border border-slate-200 text-[11px] text-slate-700"
                      >
                        <span className="font-semibold text-slate-800">{st.dayTag}</span>
                        <span className="text-slate-400 font-mono text-[10px]">
                          ({st.items.length})
                        </span>
                      </span>
                    ))}
                  </div>

                  {/* Usage & Source File Info */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-500">
                    <div className="flex flex-wrap items-center gap-3">
                      {totalFields > 0 && (
                        <span>{totalFields} quick-fill field{totalFields === 1 ? '' : 's'}</span>
                      )}
                      {usage && usage.total > 0 && (
                        <span className="inline-flex items-center gap-1 font-semibold text-violet-700">
                          <Users className="w-3 h-3" />
                          {usage.admitted > 0
                            ? `${usage.admitted} admitted patient${usage.admitted === 1 ? '' : 's'}`
                            : `${usage.total} IPD record${usage.total === 1 ? '' : 's'}`}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleExpand(proto.id)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700 hover:text-violet-950 cursor-pointer"
                    >
                      <span>{isExpanded ? 'Hide Checklist' : 'Inspect Checklist'}</span>
                      {isExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  {/* Expanded Inline Checklist Preview */}
                  {isExpanded && (
                    <div className="mt-2 pt-3 border-t border-[#EFEBF9] space-y-3">
                      {proto.stages.map((stage) => (
                        <div
                          key={stage.id}
                          className="rounded-xl border border-[#E6E0F0] bg-[#FAF8F5] p-3 space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[11px] font-mono font-bold text-violet-800 shrink-0">
                                {stage.dayTag}
                              </span>
                              <span className="text-xs font-bold text-slate-800 truncate">
                                {stage.title}
                              </span>
                            </div>
                          </div>

                          {stage.fields && stage.fields.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {stage.fields.map((f) => (
                                <span
                                  key={f.key}
                                  className="px-2 py-0.5 rounded bg-white border border-slate-200 text-[10.5px] text-slate-600"
                                >
                                  <strong className="text-slate-700">{f.label}</strong>
                                  {f.options && f.options.length > 0
                                    ? `: ${f.options.join(' / ')}`
                                    : ''}
                                </span>
                              ))}
                            </div>
                          )}

                          <ul className="space-y-1">
                            {stage.items.map((item) => (
                              <li
                                key={item.id}
                                className="flex items-start gap-1.5 text-[11.5px] text-slate-700 leading-snug"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 shrink-0 mt-0.5" />
                                <span>
                                  {item.text}
                                  {item.critical && (
                                    <span className="ml-1.5 text-[10px] font-bold text-rose-700">
                                      (Priority)
                                    </span>
                                  )}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}

                      {proto.urgentEscalationText && (
                        <div className="rounded-lg bg-rose-50/80 border border-rose-200 p-2.5 text-[11px] text-rose-900">
                          <strong className="font-bold">Escalation Criteria: </strong>
                          {proto.urgentEscalationText}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Action Footer: See Original PDF/Image | Edit | Delete */}
                {isDeleting ? (
                  <div className="px-4 py-3 border-t border-rose-200 bg-rose-50 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-rose-900">
                      {isBuiltin
                        ? `Remove "${proto.shortName}" from your protocols list?`
                        : `Delete "${proto.name}" permanently?`}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          onDeleteProtocol(proto.id);
                          setConfirmDeleteId(null);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
                      >
                        Confirm Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      {hasOriginalFiles ? (
                        <button
                          type="button"
                          onClick={() => setViewerProtocol(proto)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-teal-800 bg-white border border-teal-200 hover:bg-teal-50 transition-colors cursor-pointer"
                        >
                          {firstIsPdf ? (
                            <FileText className="w-3.5 h-3.5 text-teal-700" />
                          ) : (
                            <ImageIcon className="w-3.5 h-3.5 text-teal-700" />
                          )}
                          <span>
                            {assets.length > 1
                              ? `See Original PDF / Images (${assets.length})`
                              : firstIsPdf
                              ? 'See Original PDF'
                              : 'See Original Image'}
                          </span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingProtocol(proto);
                            setIsAddModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 bg-white border border-slate-200 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
                          title="Attach an original PDF or image to this protocol"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>No Original File · Attach</span>
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingProtocol(proto);
                          setIsAddModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(proto.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-700 bg-white border border-rose-200 hover:bg-rose-50 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Original PDF / Image Viewer Modal */}
      {viewerProtocol && (
        <ProtocolOriginalViewerModal
          protocol={viewerProtocol}
          onClose={() => setViewerProtocol(null)}
        />
      )}

      {/* Add / Edit Surgical Protocol Modal */}
      {isAddModalOpen && (
        <AddSurgicalProtocolModal
          existingProtocol={editingProtocol}
          doctorUid={doctorUid}
          canApplyToCurrentPatient={false}
          onSave={handleSaveFromModal}
          onClose={() => {
            setIsAddModalOpen(false);
            setEditingProtocol(null);
          }}
        />
      )}
    </div>
  );
};
