import React from 'react';
import {
  Plus,
  Search,
  X,
  Stethoscope,
  Menu,
  Edit3,
  Eye,
  EyeOff,
  LayoutGrid,
  ClipboardList,
  Scissors,
  BedDouble,
} from 'lucide-react';
import { Consultation } from '../types/opd';
import { hasOtNotesData } from '../utils/otNotesUtils';
import { DoctorAccount } from '../types/doctor';
import { MedScribeLogo } from './MedScribeLogo';

interface HeaderProps {
  activeSection?: 'opd' | 'ipd';
  onChangeSection?: (section: 'opd' | 'ipd') => void;
  admittedIpdCount?: number;
  consultations: Consultation[];
  totalConsultationsCount?: number;
  monthsCount: number;
  datesCount: number;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  isPatientListOpen: boolean;
  onTogglePatientList: (open?: boolean) => void;
  activeWorkspaceView?: 'desk' | 'consultations' | 'ot' | 'register';
  onChangeWorkspaceView?: (
    view: 'desk' | 'consultations' | 'ot' | 'register'
  ) => void;
  currentDoctor?: DoctorAccount | null;
  onOpenDoctorProfile?: () => void;
  onOpenMobileSidebar?: () => void;
  onOpenManualEntry: () => void;
  onOpenNewOtEntry?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeSection = 'opd',
  onChangeSection,
  admittedIpdCount = 0,
  consultations,
  totalConsultationsCount,
  searchQuery,
  onSearchChange,
  isPatientListOpen,
  onTogglePatientList,
  activeWorkspaceView = isPatientListOpen ? 'register' : 'desk',
  onChangeWorkspaceView,
  currentDoctor,
  onOpenDoctorProfile,
  onOpenMobileSidebar,
  onOpenManualEntry,
  onOpenNewOtEntry,
}) => {
  const totalCount = totalConsultationsCount ?? consultations.length;
  const otCount = consultations.filter((c) => hasOtNotesData(c)).length;
  const hasSearch = searchQuery.trim().length > 0;

  const setView = (
    v: 'desk' | 'consultations' | 'ot' | 'register'
  ) => {
    if (onChangeWorkspaceView) {
      onChangeWorkspaceView(v);
    } else {
      onTogglePatientList(v !== 'desk');
    }
  };

  return (
    <header className="bg-[#FDFBF9]/95 backdrop-blur-xs border-b border-[#E6E0F0] sticky top-0 z-20">
      <div className="px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
        {/* Left Zone: Mobile Menu Toggle + Doctor Profile + Top OPD / IPD Section Switcher */}
        <div className="flex items-center gap-3 min-w-0">
          {onOpenMobileSidebar && activeSection === 'opd' && (
            <button
              type="button"
              onClick={onOpenMobileSidebar}
              className="lg:hidden p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-[#EFEBF9] transition-colors cursor-pointer"
              title="Open workspace menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          {/* MedScribe Brand Logo — always visible in IPD (where left sidebar is hidden) and compact icon on mobile OPD */}
          {activeSection === 'ipd' ? (
            <div className="flex items-center gap-2.5 shrink-0 pr-2 border-r border-[#E6E0F0]">
              <MedScribeLogo
                variant="horizontal"
                size="xs"
                subtitleText="IPD & Surgical EMR"
                className="hidden sm:inline-flex"
              />
              <MedScribeLogo variant="icon" size="xs" className="sm:hidden" />
            </div>
          ) : (
            <div className="lg:hidden shrink-0">
              <MedScribeLogo variant="icon" size="xs" />
            </div>
          )}

          {currentDoctor ? (
            <button
              type="button"
              onClick={onOpenDoctorProfile}
              title="Click to view & edit Doctor Profile"
              className="flex flex-col text-left px-2.5 py-1.5 rounded-xl hover:bg-[#F3F0FA] border border-transparent hover:border-[#DFD8F0] transition-colors cursor-pointer group min-w-0 max-w-[230px]"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <Stethoscope className="w-3.5 h-3.5 text-violet-700 shrink-0" />
                <span className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-violet-800 truncate">
                  {currentDoctor.fullName}
                </span>
                <Edit3 className="w-3 h-3 text-slate-400 group-hover:text-violet-700 shrink-0" />
              </div>
              <span className="text-[11px] text-slate-600 truncate">
                {currentDoctor.speciality} · {currentDoctor.hospitalName}
              </span>
            </button>
          ) : (
            <div className="text-sm font-bold text-slate-900 truncate">
              MedScribe Workspace
            </div>
          )}

          {/* Top Department Section Switcher: OPD Section vs IPD Section (Unified OPD Palette) */}
          {onChangeSection && (
            <div
              className="inline-flex items-center p-1 rounded-xl bg-[#EFEBF9] border border-[#DDD6FE] shrink-0"
              role="tablist"
              aria-label="Department Section"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeSection === 'opd'}
                onClick={() => onChangeSection('opd')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  activeSection === 'opd'
                    ? 'bg-violet-700 text-white shadow-2xs'
                    : 'text-slate-700 hover:text-violet-950'
                }`}
              >
                <Stethoscope className="w-3.5 h-3.5" />
                <span>OPD Section</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeSection === 'ipd'}
                onClick={() => onChangeSection('ipd')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  activeSection === 'ipd'
                    ? 'bg-violet-700 text-white shadow-2xs'
                    : 'text-slate-700 hover:text-violet-950'
                }`}
              >
                <BedDouble className="w-3.5 h-3.5" />
                <span>IPD Section</span>
                {admittedIpdCount > 0 && (
                  <span
                    className={`text-[11px] font-mono tabular-nums ${
                      activeSection === 'ipd' ? 'text-violet-100' : 'text-violet-800'
                    }`}
                  >
                    ({admittedIpdCount})
                  </span>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Center & Right Zones: OPD Search + Mode Switcher + Capture Actions (shown in OPD Section) */}
        {activeSection === 'opd' ? (
          <>
            <div className="flex-1 max-w-sm w-full hidden sm:block">
              <div className="relative flex items-center">
                <Search className="w-4 h-4 text-violet-500 absolute left-3 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    const val = e.target.value;
                    onSearchChange(val);
                    if (val.trim().length > 0 && activeWorkspaceView === 'desk') {
                      setView('consultations');
                    }
                  }}
                  placeholder="Search patient name or UHID/OPD..."
                  aria-label="Search consultations by patient name or OPD number"
                  className="w-full pl-9 pr-16 py-2 bg-[#F6F4FB] hover:bg-[#F0ECF9] focus:bg-white rounded-xl border border-[#DFD8F0] focus:border-violet-400 focus:ring-2 focus:ring-violet-300/30 text-xs text-slate-800 placeholder:text-slate-400 outline-none transition-all"
                />
                {hasSearch && (
                  <div className="absolute right-2 flex items-center gap-1">
                    <span className="text-[11px] font-mono tabular-nums font-semibold text-violet-800">
                      {consultations.length}/{totalCount}
                    </span>
                    <button
                      type="button"
                      onClick={() => onSearchChange('')}
                      className="p-1 text-slate-400 hover:text-slate-700 rounded-md hover:bg-violet-100 transition-colors"
                      title="Clear search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Segmented View Switcher: Clinical Desk vs Consultations vs OT Notes vs Open Register */}
              <div className="hidden lg:inline-flex items-center p-1 rounded-xl bg-[#F2EFF9] border border-[#E2DCF0]">
                <button
                  type="button"
                  onClick={() => setView('desk')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                    activeWorkspaceView === 'desk'
                      ? 'bg-white text-violet-950 border border-[#DDD6FE] shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Return to Privacy-Safe Clinical Desk (Hide Patient Records)"
                >
                  <LayoutGrid className="w-3.5 h-3.5 text-violet-700" />
                  <span>Desk</span>
                </button>
                <button
                  type="button"
                  onClick={() => setView('consultations')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                    activeWorkspaceView === 'consultations'
                      ? 'bg-[#E0F2FE] text-sky-950 border border-[#7DD3FC] shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Open Quick Consultations List"
                >
                  <ClipboardList className="w-3.5 h-3.5 text-sky-700" />
                  <span>OPD ({totalCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setView('ot')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                    activeWorkspaceView === 'ot'
                      ? 'bg-[#FEF3C7] text-amber-950 border border-[#FCD34D] shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Open Operation Theatre (OT) Register"
                >
                  <Scissors className="w-3.5 h-3.5 text-amber-800" />
                  <span>OT ({otCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setView('register')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                    activeWorkspaceView === 'register'
                      ? 'bg-[#D1FAE5] text-emerald-950 border border-[#6EE7B7] shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Open Detailed Patient Register & Monthly Excel Sheets"
                >
                  <Eye className="w-3.5 h-3.5 text-teal-700" />
                  <span>Register</span>
                </button>
              </div>

              {/* Mobile toggle button */}
              <button
                type="button"
                onClick={() => setView(activeWorkspaceView === 'desk' ? 'consultations' : 'desk')}
                className={`lg:hidden inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeWorkspaceView !== 'desk'
                    ? 'bg-[#D1FAE5] text-emerald-950 border-[#6EE7B7]'
                    : 'bg-[#E0F2FE] text-sky-950 border-[#7DD3FC]'
                }`}
              >
                {activeWorkspaceView !== 'desk' ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5 text-emerald-800" />
                    <span className="hidden sm:inline">Hide List</span>
                  </>
                ) : (
                  <>
                    <ClipboardList className="w-3.5 h-3.5 text-sky-700" />
                    <span>OPD ({totalCount})</span>
                  </>
                )}
              </button>

              <div className="flex items-center gap-1.5">
                {onOpenNewOtEntry && (
                  <button
                    type="button"
                    onClick={onOpenNewOtEntry}
                    className="hidden xl:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-amber-950 bg-[#FEF3C7] hover:bg-[#FDE68A] border border-[#FCD34D] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    title="Add Operation Theatre (OT) Notes manually"
                  >
                    <Scissors className="w-3.5 h-3.5 text-amber-800" />
                    <span>+ OT Note</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={onOpenManualEntry}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-emerald-950 bg-[#D1FAE5] hover:bg-[#A7F3D0] border border-[#6EE7B7] shadow-2xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  title="Add a new OPD patient consultation manually"
                >
                  <Plus className="w-3.5 h-3.5 text-emerald-800" />
                  <span className="hidden sm:inline">New Entry</span>
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="hidden md:flex items-center gap-2 text-xs text-slate-600 shrink-0">
            <span className="font-bold text-violet-800">In-Patient Department</span>
            <span className="text-violet-300" aria-hidden="true">·</span>
            <span>Ward Census · Daily Progress · MAR · OT Notes · Protocols · Discharge</span>
          </div>
        )}
      </div>
    </header>
  );
};
