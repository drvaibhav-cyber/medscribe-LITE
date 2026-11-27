import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Pill,
  Plus,
  Search,
  Trash2,
  Edit3,
  Check,
  FolderPlus,
  Layers,
  Download,
  FileText,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { Consultation } from '../types/opd';
import { MedScribeLogo } from './MedScribeLogo';
import {
  MasterMedicationItem,
  MedicationGroup,
  MedicineMasterStore,
  loadMedicineMasterStore,
  fetchMedicineMasterFromServer,
  syncMedicineMasterToServer,
  extractUniqueMedicationsFromConsultations,
  normalizeMedicationLookupKey,
} from '../utils/medicineMaster';

interface MedicineMasterModalProps {
  isOpen: boolean;
  onClose: () => void;
  doctorUid?: string | null;
  consultations: Consultation[];
  initialTab?: 'master' | 'groups';
  onToast?: (msg: string) => void;
}

export const MedicineMasterModal: React.FC<MedicineMasterModalProps> = ({
  isOpen,
  onClose,
  doctorUid,
  consultations,
  initialTab = 'master',
  onToast,
}) => {
  const [activeTab, setActiveTab] = useState<'master' | 'groups'>(initialTab);
  const [store, setStore] = useState<MedicineMasterStore>(() =>
    loadMedicineMasterStore(doctorUid)
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'notes' | 'prescription' | 'manual'>('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showImportPanel, setShowImportPanel] = useState(false);

  // Manual Add Form state
  const [newMedicine, setNewMedicine] = useState('');
  const [newDosage, setNewDosage] = useState('');
  const [newWhen, setNewWhen] = useState('After food (p/c)');
  const [newFrequency, setNewFrequency] = useState('1-0-1 (BD)');
  const [newDuration, setNewDuration] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newSelectedGroupIds, setNewSelectedGroupIds] = useState<string[]>([]);

  // Inline Edit state for Master Medication
  const [editingMedId, setEditingMedId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<MasterMedicationItem>>({});
  const [confirmDeleteMedId, setConfirmDeleteMedId] = useState<string | null>(null);

  // Groups state
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [groupMedSearch, setGroupMedSearch] = useState('');
  const [confirmDeleteGroupId, setConfirmDeleteGroupId] = useState<string | null>(null);
  const [editingGroupMeta, setEditingGroupMeta] = useState(false);
  const [groupNameDraft, setGroupNameDraft] = useState('');
  const [groupDescDraft, setGroupDescDraft] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(initialTab);
    const local = loadMedicineMasterStore(doctorUid);
    setStore(local);
    if (local.groups.length > 0) {
      setSelectedGroupId((prev) =>
        prev && local.groups.some((g) => g.id === prev) ? prev : local.groups[0].id
      );
    }
    fetchMedicineMasterFromServer(doctorUid).then((synced) => {
      setStore(synced);
      if (synced.groups.length > 0) {
        setSelectedGroupId((prev) =>
          prev && synced.groups.some((g) => g.id === prev) ? prev : synced.groups[0].id
        );
      }
    });
  }, [isOpen, doctorUid, initialTab]);

  const persistStore = (next: MedicineMasterStore) => {
    setStore(next);
    void syncMedicineMasterToServer(next, doctorUid);
  };

  const rxCandidates = useMemo(
    () => extractUniqueMedicationsFromConsultations(consultations, store.medications),
    [consultations, store.medications]
  );

  const newRxCandidatesCount = useMemo(
    () => rxCandidates.filter((c) => !c.alreadyInMaster).length,
    [rxCandidates]
  );

  const filteredMedications = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return store.medications.filter((m) => {
      if (sourceFilter === 'notes' && !m.notes.trim()) return false;
      if (sourceFilter === 'prescription' && m.source !== 'prescription') return false;
      if (sourceFilter === 'manual' && m.source !== 'manual' && m.source !== 'default') return false;
      if (!q) return true;
      return (
        m.medicine.toLowerCase().includes(q) ||
        m.dosage.toLowerCase().includes(q) ||
        m.notes.toLowerCase().includes(q) ||
        m.frequency.toLowerCase().includes(q)
      );
    });
  }, [store.medications, searchQuery, sourceFilter]);

  const medGroupsMap = useMemo(() => {
    const map = new Map<string, MedicationGroup[]>();
    for (const grp of store.groups) {
      for (const mId of grp.medicationIds) {
        const list = map.get(mId) || [];
        list.push(grp);
        map.set(mId, list);
      }
    }
    return map;
  }, [store.groups]);

  const activeGroup = useMemo(
    () => store.groups.find((g) => g.id === selectedGroupId) || store.groups[0] || null,
    [store.groups, selectedGroupId]
  );

  if (!isOpen) return null;

  const handleAddManualMedication = (e: React.FormEvent) => {
    e.preventDefault();
    const medName = newMedicine.trim();
    if (!medName) return;

    const now = Date.now();
    const lookupKey = normalizeMedicationLookupKey(medName, newDosage);
    const existingIdx = store.medications.findIndex(
      (m) => normalizeMedicationLookupKey(m.medicine, m.dosage) === lookupKey
    );

    let medId: string;
    let nextMeds: MasterMedicationItem[];

    if (existingIdx >= 0) {
      medId = store.medications[existingIdx].id;
      nextMeds = store.medications.map((m, i) =>
        i === existingIdx
          ? {
              ...m,
              dosage: newDosage.trim() || m.dosage,
              when: newWhen.trim() || m.when,
              frequency: newFrequency.trim() || m.frequency,
              duration: newDuration.trim() || m.duration,
              notes: newNotes.trim() || m.notes,
              updatedAt: now,
            }
          : m
      );
    } else {
      medId = `med-${now}`;
      const created: MasterMedicationItem = {
        id: medId,
        medicine: medName,
        dosage: newDosage.trim(),
        when: newWhen.trim(),
        frequency: newFrequency.trim(),
        duration: newDuration.trim(),
        notes: newNotes.trim(),
        source: 'manual',
        createdAt: now,
        updatedAt: now,
      };
      nextMeds = [created, ...store.medications];
    }

    const nextGroups = store.groups.map((g) => {
      if (!newSelectedGroupIds.includes(g.id)) return g;
      if (g.medicationIds.includes(medId)) return g;
      return {
        ...g,
        medicationIds: [...g.medicationIds, medId],
        updatedAt: now,
      };
    });

    persistStore({ medications: nextMeds, groups: nextGroups, updatedAt: now });
    setNewMedicine('');
    setNewDosage('');
    setNewWhen('After food (p/c)');
    setNewFrequency('1-0-1 (BD)');
    setNewDuration('');
    setNewNotes('');
    setNewSelectedGroupIds([]);
    setShowAddForm(false);
    onToast?.(`Saved "${medName}" to Master Medication List`);
  };

  const handleImportCandidate = (candKey: string) => {
    const cand = rxCandidates.find((c) => c.key === candKey);
    if (!cand) return;
    const now = Date.now();

    if (cand.alreadyInMaster && cand.existingMasterId) {
      const nextMeds = store.medications.map((m) =>
        m.id === cand.existingMasterId
          ? {
              ...m,
              dosage: m.dosage || cand.dosage,
              when: m.when || cand.when,
              frequency: m.frequency || cand.frequency,
              duration: m.duration || cand.duration,
              notes: m.notes || cand.notes,
              updatedAt: now,
            }
          : m
      );
      persistStore({ ...store, medications: nextMeds, updatedAt: now });
      onToast?.(`Updated "${cand.medicine}" with prescription details`);
      return;
    }

    const created: MasterMedicationItem = {
      id: `med-rx-${now}-${Math.random().toString(36).slice(2, 6)}`,
      medicine: cand.medicine,
      dosage: cand.dosage,
      when: cand.when || 'After food (p/c)',
      frequency: cand.frequency,
      duration: cand.duration,
      notes: cand.notes,
      source: 'prescription',
      createdAt: now,
      updatedAt: now,
    };

    persistStore({
      ...store,
      medications: [created, ...store.medications],
      updatedAt: now,
    });
    onToast?.(`Added "${cand.medicine}" from prescriptions to Master List`);
  };

  const handleImportAllNewFromRx = () => {
    const toAdd = rxCandidates.filter((c) => !c.alreadyInMaster);
    if (toAdd.length === 0) return;
    const now = Date.now();
    const createdItems: MasterMedicationItem[] = toAdd.map((cand, idx) => ({
      id: `med-rx-${now}-${idx}`,
      medicine: cand.medicine,
      dosage: cand.dosage,
      when: cand.when || 'After food (p/c)',
      frequency: cand.frequency,
      duration: cand.duration,
      notes: cand.notes,
      source: 'prescription',
      createdAt: now + idx,
      updatedAt: now + idx,
    }));

    persistStore({
      ...store,
      medications: [...createdItems, ...store.medications],
      updatedAt: now,
    });
    onToast?.(`Imported ${createdItems.length} medications from saved prescriptions`);
  };

  const handleSaveEditMedication = (medId: string) => {
    const cleanName = String(editDraft.medicine || '').trim();
    if (!cleanName) return;
    const now = Date.now();
    const nextMeds = store.medications.map((m) =>
      m.id === medId
        ? {
            ...m,
            medicine: cleanName,
            dosage: String(editDraft.dosage || '').trim(),
            when: String(editDraft.when || '').trim(),
            frequency: String(editDraft.frequency || '').trim(),
            duration: String(editDraft.duration || '').trim(),
            notes: String(editDraft.notes || '').trim(),
            updatedAt: now,
          }
        : m
    );
    persistStore({ ...store, medications: nextMeds, updatedAt: now });
    setEditingMedId(null);
    setEditDraft({});
    onToast?.(`Updated "${cleanName}"`);
  };

  const handleDeleteMedication = (medId: string) => {
    const now = Date.now();
    const nextMeds = store.medications.filter((m) => m.id !== medId);
    const nextGroups = store.groups.map((g) => ({
      ...g,
      medicationIds: g.medicationIds.filter((id) => id !== medId),
    }));
    persistStore({ medications: nextMeds, groups: nextGroups, updatedAt: now });
    setConfirmDeleteMedId(null);
  };

  const handleCreateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newGroupName.trim();
    if (!name) return;
    const existing = store.groups.find(
      (g) => g.name.trim().toLowerCase() === name.toLowerCase()
    );
    if (existing) {
      setSelectedGroupId(existing.id);
      setNewGroupName('');
      setNewGroupDesc('');
      return;
    }
    const now = Date.now();
    const created: MedicationGroup = {
      id: `grp-${now}`,
      name,
      description: newGroupDesc.trim(),
      medicationIds: [],
      createdAt: now,
      updatedAt: now,
    };
    const nextGroups = [...store.groups, created];
    persistStore({ ...store, groups: nextGroups, updatedAt: now });
    setSelectedGroupId(created.id);
    setNewGroupName('');
    setNewGroupDesc('');
    onToast?.(`Created medication group "${name}"`);
  };

  const handleToggleMedicationInActiveGroup = (medId: string) => {
    if (!activeGroup) return;
    const now = Date.now();
    const exists = activeGroup.medicationIds.includes(medId);
    const nextMedIds = exists
      ? activeGroup.medicationIds.filter((id) => id !== medId)
      : [...activeGroup.medicationIds, medId];

    const nextGroups = store.groups.map((g) =>
      g.id === activeGroup.id ? { ...g, medicationIds: nextMedIds, updatedAt: now } : g
    );
    persistStore({ ...store, groups: nextGroups, updatedAt: now });
  };

  const handleMoveMedicationInGroup = (medId: string, dir: -1 | 1) => {
    if (!activeGroup) return;
    const list = [...activeGroup.medicationIds];
    const idx = list.indexOf(medId);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= list.length) return;
    [list[idx], list[target]] = [list[target], list[idx]];
    const now = Date.now();
    const nextGroups = store.groups.map((g) =>
      g.id === activeGroup.id ? { ...g, medicationIds: list, updatedAt: now } : g
    );
    persistStore({ ...store, groups: nextGroups, updatedAt: now });
  };

  const handleSaveGroupMeta = () => {
    if (!activeGroup || !groupNameDraft.trim()) return;
    const now = Date.now();
    const nextGroups = store.groups.map((g) =>
      g.id === activeGroup.id
        ? {
            ...g,
            name: groupNameDraft.trim(),
            description: groupDescDraft.trim(),
            updatedAt: now,
          }
        : g
    );
    persistStore({ ...store, groups: nextGroups, updatedAt: now });
    setEditingGroupMeta(false);
  };

  const handleDeleteGroup = (groupId: string) => {
    const nextGroups = store.groups.filter((g) => g.id !== groupId);
    persistStore({ ...store, groups: nextGroups, updatedAt: Date.now() });
    setConfirmDeleteGroupId(null);
    if (selectedGroupId === groupId) {
      setSelectedGroupId(nextGroups[0]?.id || null);
    }
  };

  const activeGroupMeds = activeGroup
    ? activeGroup.medicationIds
        .map((id) => store.medications.find((m) => m.id === id))
        .filter((m): m is MasterMedicationItem => Boolean(m))
    : [];

  const availableMedsForGroup = store.medications.filter((m) => {
    const q = groupMedSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      m.medicine.toLowerCase().includes(q) ||
      m.dosage.toLowerCase().includes(q) ||
      m.notes.toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#2E2A3B]/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#FDFBF9] rounded-2xl max-w-5xl w-full shadow-2xl border border-[#E6E0D8] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#D6DDF8] flex items-center justify-between bg-gradient-to-r from-[#F4F1FA] via-[#E1F7FC] to-[#EBFBF3] text-[#1E3A5F] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <MedScribeLogo variant="icon" size="sm" />
            <div className="min-w-0">
              <h2 className="text-base font-bold text-[#2D2A3E] truncate">
                Medicine Master &amp; Prescription Groups
              </h2>
              <p className="text-xs text-[#4B6385] truncate">
                Maintain your master drug list, attach default patient notes (e.g. &ldquo;Will have red urine&rdquo;), and build 1-click protocol groups
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Medicine Master"
            className="p-2 rounded-lg text-[#4B6385] hover:text-[#1E3A5F] hover:bg-white/80 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 pt-3 border-b border-slate-200 bg-slate-50 flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('master')}
            className={`px-4 py-2 rounded-t-xl text-xs font-bold border-b-2 transition-colors flex items-center gap-2 cursor-pointer ${
              activeTab === 'master'
                ? 'border-indigo-600 text-indigo-950 bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Pill className="w-4 h-4 text-indigo-600" />
            <span className="tabular-nums">Master Medication List ({store.medications.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('groups')}
            className={`px-4 py-2 rounded-t-xl text-xs font-bold border-b-2 transition-colors flex items-center gap-2 cursor-pointer ${
              activeTab === 'groups'
                ? 'border-indigo-600 text-indigo-950 bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-4 h-4 text-teal-600" />
            <span className="tabular-nums">Medication Groups ({store.groups.length})</span>
          </button>
        </div>

        {/* Body */}
        {activeTab === 'master' ? (
          <div className="p-5 overflow-y-auto space-y-4 flex-1 bg-slate-50/40">
            {/* Toolbar: Search + Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex-1 min-w-[220px] relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search medication name, dosage, or clinical note..."
                  className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowImportPanel((v) => !v);
                    setShowAddForm(false);
                  }}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors flex items-center gap-1.5 cursor-pointer ${
                    showImportPanel
                      ? 'bg-teal-600 text-white border-teal-700'
                      : 'bg-white hover:bg-teal-50 text-teal-900 border-teal-300'
                  }`}
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="tabular-nums">
                    Take Up from Prescriptions
                    {newRxCandidatesCount > 0 ? ` (${newRxCandidatesCount} new)` : ''}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm((v) => !v);
                    setShowImportPanel(false);
                  }}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer ${
                    showAddForm
                      ? 'bg-slate-200 text-slate-800'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  }`}
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Medication Manually</span>
                </button>
              </div>
            </div>

            {/* Segmented Filter Control */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
                {(
                  [
                    { key: 'all', label: 'All' },
                    { key: 'notes', label: 'With Notes' },
                    { key: 'prescription', label: 'From Prescriptions' },
                    { key: 'manual', label: 'Manual & Default' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setSourceFilter(tab.key)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      sourceFilter === tab.key
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <span className="text-xs text-slate-500 tabular-nums">
                Showing {filteredMedications.length} of {store.medications.length} medications
              </span>
            </div>

            {/* Add Medication Manually Form */}
            {showAddForm && (
              <form
                onSubmit={handleAddManualMedication}
                className="p-4 bg-white border border-indigo-200 rounded-xl shadow-2xs space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-indigo-950">
                    Add New Medication to Master List
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    Close
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 text-xs">
                  <div className="sm:col-span-4">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Medicine Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={newMedicine}
                      onChange={(e) => setNewMedicine(e.target.value)}
                      placeholder="e.g. Tab Pyridium"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Dosage
                    </label>
                    <input
                      type="text"
                      value={newDosage}
                      onChange={(e) => setNewDosage(e.target.value)}
                      placeholder="e.g. 200 mg"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      When
                    </label>
                    <input
                      type="text"
                      value={newWhen}
                      onChange={(e) => setNewWhen(e.target.value)}
                      placeholder="After food (p/c)"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Frequency
                    </label>
                    <input
                      type="text"
                      value={newFrequency}
                      onChange={(e) => setNewFrequency(e.target.value)}
                      placeholder="1-0-1 (BD)"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Duration
                    </label>
                    <input
                      type="text"
                      value={newDuration}
                      onChange={(e) => setNewDuration(e.target.value)}
                      placeholder="e.g. 3 Days"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end text-xs">
                  <div className="sm:col-span-8">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Patient / Print Note (auto-filled whenever this medicine is prescribed)
                    </label>
                    <input
                      type="text"
                      value={newNotes}
                      onChange={(e) => setNewNotes(e.target.value)}
                      placeholder='e.g. Will have red/orange urine'
                      className="w-full px-3 py-2 bg-amber-50/50 border border-amber-300 rounded-lg text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="sm:col-span-4 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAddForm(false)}
                      className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer"
                    >
                      Save Medication
                    </button>
                  </div>
                </div>

                {store.groups.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-3 text-xs">
                    <span className="text-[11px] font-semibold text-slate-500">
                      Also assign to groups:
                    </span>
                    {store.groups.map((grp) => {
                      const checked = newSelectedGroupIds.includes(grp.id);
                      return (
                        <label
                          key={grp.id}
                          className="inline-flex items-center gap-1.5 cursor-pointer text-slate-700 font-medium"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setNewSelectedGroupIds((prev) =>
                                e.target.checked
                                  ? [...prev, grp.id]
                                  : prev.filter((id) => id !== grp.id)
                              );
                            }}
                            className="rounded border-slate-300 text-indigo-600"
                          />
                          <span>{grp.name}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </form>
            )}

            {/* Take Up Medications from Prescriptions Panel */}
            {showImportPanel && (
              <div className="p-4 bg-white border border-teal-200 rounded-xl shadow-2xs space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-bold text-teal-950">
                      Medications Found Across Saved Prescriptions ({rxCandidates.length})
                    </h3>
                    <p className="text-[11px] text-slate-600">
                      Pull medications directly from patient prescriptions into your Master List, then add notes or assign them to groups.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {newRxCandidatesCount > 0 && (
                      <button
                        type="button"
                        onClick={handleImportAllNewFromRx}
                        className="px-3.5 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold cursor-pointer"
                      >
                        Import All {newRxCandidatesCount} New
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowImportPanel(false)}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                </div>

                {rxCandidates.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4 text-center">
                    No prescriptions found in saved consultations yet.
                  </p>
                ) : (
                  <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl">
                    {rxCandidates.map((cand) => (
                      <div
                        key={cand.key}
                        className="px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs hover:bg-slate-50"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-slate-900 truncate">
                            {cand.medicine}
                            {cand.dosage ? ` · ${cand.dosage}` : ''}
                          </div>
                          <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-1.5 mt-0.5">
                            <span>{[cand.when, cand.frequency, cand.duration].filter(Boolean).join(' · ') || 'Schedule unspecified'}</span>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums">Prescribed {cand.usageCount}×</span>
                            {cand.notes && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-amber-800 font-medium">Note: {cand.notes}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleImportCandidate(cand.key)}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-bold shrink-0 cursor-pointer transition-colors ${
                            cand.alreadyInMaster
                              ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                              : 'bg-teal-600 hover:bg-teal-700 text-white'
                          }`}
                        >
                          {cand.alreadyInMaster ? 'Sync Missing Fields' : '+ Add to Master'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Master Medication List */}
            {filteredMedications.length === 0 ? (
              <div className="text-center py-10 bg-white rounded-xl border border-slate-200 text-xs text-slate-500">
                No matching medications found. Add one manually or pull from saved prescriptions above.
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                {filteredMedications.map((med) => {
                  const isEditing = editingMedId === med.id;
                  const linkedGroups = medGroupsMap.get(med.id) || [];

                  if (isEditing) {
                    return (
                      <div key={med.id} className="p-4 bg-indigo-50/40 space-y-2.5 text-xs">
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                          <input
                            type="text"
                            value={editDraft.medicine ?? ''}
                            onChange={(e) =>
                              setEditDraft((prev) => ({ ...prev, medicine: e.target.value }))
                            }
                            placeholder="Medicine Name"
                            className="sm:col-span-4 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                          <input
                            type="text"
                            value={editDraft.dosage ?? ''}
                            onChange={(e) =>
                              setEditDraft((prev) => ({ ...prev, dosage: e.target.value }))
                            }
                            placeholder="Dosage"
                            className="sm:col-span-2 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                          <input
                            type="text"
                            value={editDraft.when ?? ''}
                            onChange={(e) =>
                              setEditDraft((prev) => ({ ...prev, when: e.target.value }))
                            }
                            placeholder="When"
                            className="sm:col-span-2 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                          <input
                            type="text"
                            value={editDraft.frequency ?? ''}
                            onChange={(e) =>
                              setEditDraft((prev) => ({ ...prev, frequency: e.target.value }))
                            }
                            placeholder="Frequency"
                            className="sm:col-span-2 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                          <input
                            type="text"
                            value={editDraft.duration ?? ''}
                            onChange={(e) =>
                              setEditDraft((prev) => ({ ...prev, duration: e.target.value }))
                            }
                            placeholder="Duration"
                            className="sm:col-span-2 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            value={editDraft.notes ?? ''}
                            onChange={(e) =>
                              setEditDraft((prev) => ({ ...prev, notes: e.target.value }))
                            }
                            placeholder='Default patient note (e.g. "Will have red urine")'
                            className="flex-1 min-w-[220px] px-2.5 py-1.5 bg-white border border-amber-300 rounded-lg text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveEditMedication(med.id)}
                            className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Save</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingMedId(null);
                              setEditDraft({});
                            }}
                            className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={med.id}
                      className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="text-sm font-bold text-slate-900">{med.medicine}</span>
                          {med.dosage && (
                            <span className="text-xs font-mono text-slate-600">{med.dosage}</span>
                          )}
                        </div>

                        <div className="text-xs text-slate-500 flex flex-wrap items-center gap-1.5">
                          <span>
                            {[med.when, med.frequency, med.duration].filter(Boolean).join(' · ') ||
                              'No default schedule'}
                          </span>
                          {linkedGroups.length > 0 && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-indigo-700 font-medium">
                                Groups: {linkedGroups.map((g) => g.name).join(', ')}
                              </span>
                            </>
                          )}
                        </div>

                        {med.notes ? (
                          <div className="text-xs text-amber-900 bg-amber-50/80 border border-amber-200/80 rounded-lg px-2.5 py-1 inline-flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                            <span>Note: {med.notes}</span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingMedId(med.id);
                              setEditDraft({ ...med });
                            }}
                            className="text-[11px] text-slate-400 hover:text-indigo-700 cursor-pointer"
                          >
                            + Add clinical note
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingMedId(med.id);
                            setEditDraft({ ...med });
                            setConfirmDeleteMedId(null);
                          }}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-800 transition-colors flex items-center gap-1 cursor-pointer"
                          title="Edit medication & note"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>

                        {confirmDeleteMedId === med.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleDeleteMedication(med.id)}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
                            >
                              Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteMedId(null)}
                              className="px-2 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-600 cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteMedId(med.id)}
                            className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Delete from Master List"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* TAB 2: MEDICATION GROUPS */
          <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-12 bg-slate-50/40">
            {/* Left Sidebar: Group List + New Group Form */}
            <div className="md:col-span-4 border-b md:border-b-0 md:border-r border-slate-200 p-4 overflow-y-auto space-y-4 bg-white">
              <form onSubmit={handleCreateGroup} className="space-y-2 pb-3 border-b border-slate-100">
                <label className="block text-xs font-bold text-slate-700">
                  Create Medication Group
                </label>
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder='e.g. UTI, Prostatitis, BPH'
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <input
                  type="text"
                  value={newGroupDesc}
                  onChange={(e) => setNewGroupDesc(e.target.value)}
                  placeholder="Optional indication note"
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="submit"
                  className="w-full py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  <span>Add Group</span>
                </button>
              </form>

              <div className="space-y-1.5">
                {store.groups.map((grp) => {
                  const isSelected = activeGroup?.id === grp.id;
                  return (
                    <button
                      key={grp.id}
                      type="button"
                      onClick={() => {
                        setSelectedGroupId(grp.id);
                        setEditingGroupMeta(false);
                        setConfirmDeleteGroupId(null);
                      }}
                      className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-50 border-indigo-300 text-indigo-950'
                          : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold truncate">{grp.name}</span>
                        <span className="text-[11px] font-mono text-slate-500 tabular-nums shrink-0">
                          {grp.medicationIds.length} meds
                        </span>
                      </div>
                      {grp.description && (
                        <div className="text-[11px] text-slate-500 truncate mt-0.5">
                          {grp.description}
                        </div>
                      )}
                    </button>
                  );
                })}
                {store.groups.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-4">
                    No groups yet. Create one above.
                  </p>
                )}
              </div>
            </div>

            {/* Right Pane: Group Editor */}
            <div className="md:col-span-8 p-5 overflow-y-auto space-y-5">
              {!activeGroup ? (
                <div className="text-center py-12 text-xs text-slate-500">
                  Select or create a medication group on the left to configure its prescription bundle.
                </div>
              ) : (
                <>
                  {/* Group Header */}
                  <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-slate-200">
                    {editingGroupMeta ? (
                      <div className="flex-1 space-y-2">
                        <input
                          type="text"
                          value={groupNameDraft}
                          onChange={(e) => setGroupNameDraft(e.target.value)}
                          className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-900"
                        />
                        <input
                          type="text"
                          value={groupDescDraft}
                          onChange={(e) => setGroupDescDraft(e.target.value)}
                          placeholder="Indication description"
                          className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-700"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleSaveGroupMeta}
                            className="px-3 py-1 rounded-lg bg-indigo-600 text-white text-xs font-bold cursor-pointer"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingGroupMeta(false)}
                            className="px-3 py-1 rounded-lg bg-white border border-slate-300 text-xs font-semibold text-slate-600 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">{activeGroup.name}</h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {activeGroup.description || 'Select medications below to include when this group is picked in Prescription Entry.'}
                        </p>
                      </div>
                    )}

                    {!editingGroupMeta && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setGroupNameDraft(activeGroup.name);
                            setGroupDescDraft(activeGroup.description || '');
                            setEditingGroupMeta(true);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                        >
                          Rename
                        </button>
                        {confirmDeleteGroupId === activeGroup.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleDeleteGroup(activeGroup.id)}
                              className="px-2.5 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold cursor-pointer"
                            >
                              Confirm Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteGroupId(null)}
                              className="px-2 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-600 cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteGroupId(activeGroup.id)}
                            className="px-2.5 py-1.5 rounded-lg bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-semibold cursor-pointer"
                          >
                            Delete Group
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Included Medications Preview & Order */}
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-slate-700 tabular-nums">
                      Medications in &ldquo;{activeGroup.name}&rdquo; ({activeGroupMeds.length})
                    </div>
                    {activeGroupMeds.length === 0 ? (
                      <div className="p-4 bg-white border border-dashed border-slate-300 rounded-xl text-xs text-slate-500 text-center">
                        No medications added to this group yet. Check items from the Master List below.
                      </div>
                    ) : (
                      <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
                        {activeGroupMeds.map((med, idx) => (
                          <div
                            key={med.id}
                            className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="font-bold text-slate-900">
                                <span className="text-slate-400 mr-1.5 tabular-nums">{idx + 1}.</span>
                                {med.medicine}
                                {med.dosage ? ` · ${med.dosage}` : ''}
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                {[med.when, med.frequency, med.duration].filter(Boolean).join(' · ')}
                                {med.notes ? ` · Note: ${med.notes}` : ''}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => handleMoveMedicationInGroup(med.id, -1)}
                                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                                title="Move up"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={idx === activeGroupMeds.length - 1}
                                onClick={() => handleMoveMedicationInGroup(med.id, 1)}
                                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                                title="Move down"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleMedicationInActiveGroup(med.id)}
                                className="px-2 py-1 rounded-lg text-rose-600 hover:bg-rose-50 text-[11px] font-semibold cursor-pointer"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Add / Toggle from Master List */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-700">
                        Select Medications from Master List
                      </span>
                      <input
                        type="text"
                        value={groupMedSearch}
                        onChange={(e) => setGroupMedSearch(e.target.value)}
                        placeholder="Filter master list..."
                        className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl max-h-60 overflow-y-auto divide-y divide-slate-100">
                      {availableMedsForGroup.map((med) => {
                        const checked = activeGroup.medicationIds.includes(med.id);
                        return (
                          <label
                            key={med.id}
                            className={`px-3.5 py-2 flex items-center gap-3 text-xs cursor-pointer hover:bg-slate-50 ${
                              checked ? 'bg-indigo-50/40' : ''
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => handleToggleMedicationInActiveGroup(med.id)}
                              className="rounded border-slate-300 text-indigo-600"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-slate-900 truncate">
                                {med.medicine}
                                {med.dosage ? ` (${med.dosage})` : ''}
                              </div>
                              <div className="text-[11px] text-slate-500 truncate">
                                {[med.when, med.frequency, med.duration, med.notes ? `Note: ${med.notes}` : '']
                                  .filter(Boolean)
                                  .join(' · ')}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
