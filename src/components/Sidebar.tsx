import React from 'react';
import {
  Plus,
  FileSpreadsheet,
  BarChart3,
  BookOpen,
  UserPlus,
  LogOut,
  Stethoscope,
  ChevronLeft,
  ChevronRight,
  Calendar,
  CalendarDays,
  Edit3,
  FolderKanban,
  X,
  LayoutGrid,
  Eye,
  EyeOff,
  ClipboardList,
  Scissors,
  Pill,
} from 'lucide-react';
import { DoctorAccount } from '../types/doctor';
import { MedScribeLogo } from './MedScribeLogo';

export interface YearNavItem {
  yearKey: string;
  yearLabel: string;
  count: number;
}

export interface MonthNavItem {
  monthKey: string;
  monthLabel: string;
  shortLabel?: string;
  yearKey: string;
  count: number;
}

interface SidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  currentDoctor?: DoctorAccount | null;
  onOpenDoctorProfile: () => void;
  onOpenManualEntry: () => void;
  isPatientListOpen: boolean;
  onTogglePatientList: (open?: boolean) => void;
  activeWorkspaceView?: 'desk' | 'consultations' | 'ot' | 'register';
  onChangeWorkspaceView?: (
    view: 'desk' | 'consultations' | 'ot' | 'register'
  ) => void;
  otCount?: number;
  onOpenNewOtEntry?: () => void;
  isAnalyticsOpen: boolean;
  onToggleAnalytics: () => void;
  onOpenDictionary: () => void;
  onOpenMedicineMaster?: () => void;
  onExportExcel: () => void;
  onOpenAuthPage: (mode: 'login' | 'register') => void;
  onLogoutDoctor: () => void;
  yearItems: YearNavItem[];
  selectedYearKey: string;
  onSelectYearKey: (yearKey: string) => void;
  monthItems: MonthNavItem[];
  selectedMonthKey: string;
  onSelectMonthKey: (key: string) => void;
  totalConsultationsCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isCollapsed,
  onToggleCollapse,
  isMobileOpen,
  onCloseMobile,
  currentDoctor,
  onOpenDoctorProfile,
  onOpenManualEntry,
  isPatientListOpen,
  onTogglePatientList,
  activeWorkspaceView = isPatientListOpen ? 'register' : 'desk',
  onChangeWorkspaceView,
  otCount = 0,
  onOpenNewOtEntry,
  isAnalyticsOpen,
  onToggleAnalytics,
  onOpenDictionary,
  onOpenMedicineMaster,
  onExportExcel,
  onOpenAuthPage,
  onLogoutDoctor,
  yearItems,
  selectedYearKey,
  onSelectYearKey,
  monthItems,
  selectedMonthKey,
  onSelectMonthKey,
  totalConsultationsCount,
}) => {
  const setView = (
    v: 'desk' | 'consultations' | 'ot' | 'register'
  ) => {
    if (onChangeWorkspaceView) {
      onChangeWorkspaceView(v);
    } else {
      onTogglePatientList(v !== 'desk');
    }
  };
  const activeYearCount =
    selectedYearKey === 'ALL'
      ? totalConsultationsCount
      : yearItems.find((y) => y.yearKey === selectedYearKey)?.count ?? 0;

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#F4F1FA] text-slate-800 select-none">
      {/* Top Brand Header & Collapse Toggle */}
      <div className="h-16 px-3.5 flex items-center justify-between border-b border-[#E3DDF2] bg-[#EFEBF9]/70 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <MedScribeLogo
            variant={isCollapsed ? 'icon' : 'horizontal'}
            size="sm"
            subtitleText="Local OPD & IPD EMR"
          />
        </div>

        {/* Desktop Collapse Button */}
        <button
          type="button"
          onClick={onToggleCollapse}
          className="hidden lg:inline-flex p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-[#E5DFF5] transition-colors cursor-pointer"
          title={isCollapsed ? 'Expand left sidebar' : 'Collapse left sidebar'}
        >
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>

        {/* Mobile Close Button */}
        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-[#E5DFF5] transition-colors"
          title="Close menu"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Clickable Doctor Profile Card */}
      {currentDoctor && (
        <div className="p-3 border-b border-[#E3DDF2] shrink-0">
          <button
            type="button"
            onClick={() => {
              onOpenDoctorProfile();
              onCloseMobile();
            }}
            title="Click to view or edit Doctor Profile"
            className={`w-full text-left rounded-xl bg-white/85 hover:bg-white border border-[#DFD8F0] hover:border-violet-300 transition-colors cursor-pointer group ${
              isCollapsed ? 'p-2 flex justify-center' : 'p-3'
            }`}
          >
            {isCollapsed ? (
              <Stethoscope className="w-5 h-5 text-violet-700" />
            ) : (
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-900 group-hover:text-violet-800 truncate">
                    {currentDoctor.fullName}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-violet-700 shrink-0">
                    <Edit3 className="w-3 h-3" />
                    <span>Profile</span>
                  </span>
                </div>
                <div className="text-[11px] font-mono text-slate-700 mt-0.5 truncate">
                  {currentDoctor.registrationNo}
                </div>
                <div className="text-[11px] text-slate-600 mt-0.5 truncate">
                  {currentDoctor.speciality}
                </div>
                <div className="text-[10px] text-slate-500 truncate">
                  {currentDoctor.hospitalName}
                </div>
              </div>
            )}
          </button>
        </div>
      )}

      {/* Scrollable Navigation & App Controls */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {/* 0. Workspace View Mode (Clinical Desk vs Consultations vs Patient Register) */}
        <div className="space-y-1.5">
          {!isCollapsed && (
            <div className="px-2 text-[11px] font-semibold text-slate-600">
              Workspace View
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setView('desk');
              onCloseMobile();
            }}
            title="Clinical Desk (Privacy Mode — Patient Records Hidden)"
            className={`w-full rounded-xl text-xs font-semibold transition-colors flex items-center cursor-pointer ${
              isCollapsed ? 'justify-center p-2.5' : 'px-3 py-2.5 gap-2.5 justify-between'
            } ${
              activeWorkspaceView === 'desk'
                ? 'bg-[#E5DEFF] text-violet-950 border border-[#C4B5FD] shadow-2xs'
                : 'text-slate-700 hover:text-slate-900 hover:bg-white/70'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <LayoutGrid className="w-4 h-4 text-violet-700 shrink-0" />
              {!isCollapsed && <span className="truncate">Clinical Desk (Home)</span>}
            </div>
            {!isCollapsed && activeWorkspaceView === 'desk' && (
              <span className="text-[10px] font-mono text-violet-800">Active</span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setView('consultations');
              onCloseMobile();
            }}
            title="Consultations Quick List (Date of Visit, Age, Sex, Diagnosis, Open Notes, Edit & Export PDF)"
            className={`w-full rounded-xl text-xs font-semibold transition-colors flex items-center cursor-pointer ${
              isCollapsed ? 'justify-center p-2.5' : 'px-3 py-2.5 gap-2.5 justify-between'
            } ${
              activeWorkspaceView === 'consultations'
                ? 'bg-[#CFEAFE] text-sky-950 border border-[#7DD3FC] shadow-2xs'
                : 'bg-white/80 text-slate-800 hover:bg-white border border-[#DFD8F0]'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <ClipboardList className="w-4 h-4 text-sky-800 shrink-0" />
              {!isCollapsed && <span className="truncate">Consultations</span>}
            </div>
            {!isCollapsed && (
              <span
                className={`text-[11px] font-mono tabular-nums ${
                  activeWorkspaceView === 'consultations'
                    ? 'text-sky-900 font-bold'
                    : 'text-sky-800 font-semibold'
                }`}
              >
                {totalConsultationsCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setView('ot');
              onCloseMobile();
            }}
            title="OT Notes Register (Operated OPD & Freelance Surgery Patients — Dates, Name, Procedure & Detailed OT Notes)"
            className={`w-full rounded-xl text-xs font-semibold transition-colors flex items-center cursor-pointer ${
              isCollapsed ? 'justify-center p-2.5' : 'px-3 py-2.5 gap-2.5 justify-between'
            } ${
              activeWorkspaceView === 'ot'
                ? 'bg-[#FEF3C7] text-amber-950 border border-[#FCD34D] shadow-2xs'
                : 'bg-white/80 text-slate-800 hover:bg-white border border-[#DFD8F0]'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Scissors className="w-4 h-4 text-amber-800 shrink-0" />
              {!isCollapsed && <span className="truncate">OT Notes</span>}
            </div>
            {!isCollapsed && (
              <span
                className={`text-[11px] font-mono tabular-nums ${
                  activeWorkspaceView === 'ot'
                    ? 'text-amber-950 font-bold'
                    : 'text-amber-800 font-semibold'
                }`}
              >
                {otCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setView(activeWorkspaceView === 'register' ? 'desk' : 'register');
              onCloseMobile();
            }}
            title={
              activeWorkspaceView === 'register'
                ? 'Hide Patient Register & Return to Clinical Desk'
                : 'Open Detailed Patient Register & Excel Sheets'
            }
            className={`w-full rounded-xl text-xs font-semibold transition-colors flex items-center cursor-pointer ${
              isCollapsed ? 'justify-center p-2.5' : 'px-3 py-2.5 gap-2.5 justify-between'
            } ${
              activeWorkspaceView === 'register'
                ? 'bg-[#D1FAE5] text-emerald-950 border border-[#6EE7B7] shadow-2xs'
                : 'bg-white/80 text-slate-800 hover:bg-white border border-[#DFD8F0]'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {activeWorkspaceView === 'register' ? (
                <EyeOff className="w-4 h-4 text-emerald-800 shrink-0" />
              ) : (
                <Eye className="w-4 h-4 text-teal-700 shrink-0" />
              )}
              {!isCollapsed && (
                <span className="truncate">
                  {activeWorkspaceView === 'register' ? 'Hide Register' : 'Open Register'}
                </span>
              )}
            </div>
            {!isCollapsed && (
              <span
                className={`text-[11px] font-mono tabular-nums ${
                  activeWorkspaceView === 'register'
                    ? 'text-emerald-900 font-bold'
                    : 'text-teal-800 font-semibold'
                }`}
              >
                {totalConsultationsCount}
              </span>
            )}
          </button>
        </div>

        {/* 1. Primary Clinical Capture Actions */}
        <div className="space-y-2 pt-2 border-t border-[#E3DDF2]">
          {!isCollapsed && (
            <div className="px-2 text-[11px] font-semibold text-slate-600">
              Consultation Capture
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              onOpenManualEntry();
              onCloseMobile();
            }}
            title="Add a new patient consultation manually"
            className={`w-full rounded-xl bg-[#D1FAE5] hover:bg-[#A7F3D0] text-emerald-950 border border-[#6EE7B7] font-bold text-xs shadow-2xs transition-colors flex items-center cursor-pointer ${
              isCollapsed ? 'justify-center p-2.5' : 'px-3.5 py-2.5 gap-2.5'
            }`}
          >
            <Plus className="w-4 h-4 text-emerald-800 shrink-0" />
            {!isCollapsed && <span className="whitespace-nowrap">New Patient Entry</span>}
          </button>

          {onOpenNewOtEntry && (
            <button
              type="button"
              onClick={() => {
                onOpenNewOtEntry();
                onCloseMobile();
              }}
              title="Add Operation Theatre (OT) Notes for an OPD or Freelance Surgical Patient"
              className={`w-full rounded-xl bg-[#FEF3C7] hover:bg-[#FDE68A] text-amber-950 border border-[#FCD34D] font-bold text-xs transition-colors flex items-center cursor-pointer ${
                isCollapsed ? 'justify-center p-2.5' : 'px-3.5 py-2.5 gap-2.5'
              }`}
            >
              <Scissors className="w-4 h-4 text-amber-800 shrink-0" />
              {!isCollapsed && <span className="whitespace-nowrap">+ Add OT Notes</span>}
            </button>
          )}
        </div>

        {/* 2. Browse Patient Sheets by Year & Month (Clicking opens Patient Register on demand) */}
        <div className="space-y-1.5 pt-2 border-t border-[#E3DDF2]">
          {!isCollapsed && (
            <div className="px-2 flex items-center justify-between text-[11px] font-semibold text-slate-600">
              <span className="flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5 text-violet-700" />
                <span>Sheets by Year</span>
              </span>
              <span className="font-mono text-[10px] text-slate-500">
                {selectedYearKey === 'ALL' ? 'All' : selectedYearKey}
              </span>
            </div>
          )}

          {isCollapsed ? (
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => {
                  onSelectYearKey('ALL');
                  onTogglePatientList(true);
                }}
                title="Open All Years in Patient Register"
                className={`w-full p-2 rounded-xl text-[10px] font-bold font-mono transition-colors cursor-pointer ${
                  isPatientListOpen && selectedYearKey === 'ALL'
                    ? 'bg-[#DDD6FE] text-violet-950 border border-[#C4B5FD]'
                    : 'bg-white/80 text-slate-600 hover:text-slate-900'
                }`}
              >
                ALL
              </button>
              {yearItems.map((y) => (
                <button
                  key={y.yearKey}
                  type="button"
                  onClick={() => {
                    onSelectYearKey(y.yearKey);
                    onTogglePatientList(true);
                  }}
                  title={`Open Year ${y.yearLabel} (${y.count} patients)`}
                  className={`w-full p-2 rounded-xl text-[10px] font-bold font-mono transition-colors cursor-pointer ${
                    isPatientListOpen && selectedYearKey === y.yearKey
                      ? 'bg-[#DDD6FE] text-violet-950 border border-[#C4B5FD]'
                      : 'bg-white/80 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {y.yearLabel}
                </button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1.5 px-1">
              <button
                type="button"
                onClick={() => {
                  onSelectYearKey('ALL');
                  onTogglePatientList(true);
                }}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center justify-between cursor-pointer ${
                  isPatientListOpen && selectedYearKey === 'ALL'
                    ? 'bg-[#DDD6FE] text-violet-950 border border-[#C4B5FD]'
                    : 'bg-white/80 text-slate-700 hover:bg-white border border-[#DFD8F0]'
                }`}
              >
                <span>All Years</span>
                <span className="text-[10px] font-mono tabular-nums opacity-85">
                  {totalConsultationsCount}
                </span>
              </button>

              {yearItems.map((y) => {
                const isYearActive = isPatientListOpen && selectedYearKey === y.yearKey;
                return (
                  <button
                    key={y.yearKey}
                    type="button"
                    onClick={() => {
                      onSelectYearKey(y.yearKey);
                      onTogglePatientList(true);
                    }}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center justify-between cursor-pointer ${
                      isYearActive
                        ? 'bg-[#DDD6FE] text-violet-950 border border-[#C4B5FD]'
                        : 'bg-white/80 text-slate-700 hover:bg-white border border-[#DFD8F0]'
                    }`}
                  >
                    <span className="font-mono">{y.yearLabel}</span>
                    <span className="text-[10px] font-mono tabular-nums opacity-85">
                      {y.count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 3. Months under Selected Year */}
        <div className="space-y-1">
          {!isCollapsed && (
            <div className="px-2 pb-1 text-[11px] font-semibold text-slate-600 flex items-center justify-between">
              <span>
                {selectedYearKey === 'ALL'
                  ? 'Monthly Sheets'
                  : `Months in ${selectedYearKey}`}
              </span>
              <span className="font-mono text-[10px] text-slate-500">
                {monthItems.length}
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              onSelectMonthKey('ALL');
              onTogglePatientList(true);
              onCloseMobile();
            }}
            title={
              selectedYearKey === 'ALL'
                ? 'Open all monthly sheets combined'
                : `Open all months in ${selectedYearKey}`
            }
            className={`w-full rounded-xl text-xs font-medium transition-colors flex items-center cursor-pointer ${
              isCollapsed ? 'justify-center p-2.5' : 'px-3 py-2 gap-2.5 justify-between'
            } ${
              isPatientListOpen && selectedMonthKey === 'ALL'
                ? 'bg-[#E0F2FE] text-sky-950 font-semibold border border-[#BAE6FD]'
                : 'text-slate-700 hover:text-slate-900 hover:bg-white/70'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <FolderKanban className="w-4 h-4 text-sky-700 shrink-0" />
              {!isCollapsed && (
                <span className="truncate">
                  {selectedYearKey === 'ALL'
                    ? 'All Months'
                    : `All ${selectedYearKey} Months`}
                </span>
              )}
            </div>
            {!isCollapsed && (
              <span className="text-[11px] font-mono tabular-nums text-slate-600">
                {activeYearCount}
              </span>
            )}
          </button>

          {monthItems.map((m) => {
            const isActive = isPatientListOpen && selectedMonthKey === m.monthKey;
            const hasRecords = m.count > 0;
            return (
              <button
                key={m.monthKey}
                type="button"
                onClick={() => {
                  onSelectMonthKey(m.monthKey);
                  onTogglePatientList(true);
                  onCloseMobile();
                }}
                title={`Open ${m.monthLabel} (${m.count} patients)`}
                className={`w-full rounded-xl text-xs font-medium transition-colors flex items-center cursor-pointer ${
                  isCollapsed ? 'justify-center p-2' : 'px-3 py-1.5 gap-2.5 justify-between'
                } ${
                  isActive
                    ? 'bg-[#E0F2FE] text-sky-950 font-semibold border border-[#BAE6FD]'
                    : hasRecords
                    ? 'text-slate-800 hover:text-slate-950 hover:bg-white/80'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Calendar
                    className={`w-3.5 h-3.5 shrink-0 ${
                      isActive || hasRecords ? 'text-violet-700' : 'text-slate-400'
                    }`}
                  />
                  {!isCollapsed && <span className="truncate">{m.monthLabel}</span>}
                </div>
                {!isCollapsed && (
                  <span
                    className={`text-[11px] font-mono tabular-nums ${
                      hasRecords ? 'text-violet-800 font-semibold' : 'text-slate-400'
                    }`}
                  >
                    {m.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* 4. App Controls & Workspace Panels */}
        <div className="space-y-1 pt-2 border-t border-[#E3DDF2]">
          {!isCollapsed && (
            <div className="px-2 pb-1 text-[11px] font-semibold text-slate-600">
              Tools &amp; Export
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              onToggleAnalytics();
              onCloseMobile();
            }}
            title="Click to open or close Clinical Analytics & Demographics Panel"
            className={`w-full rounded-xl text-xs font-medium transition-colors flex items-center cursor-pointer ${
              isCollapsed ? 'justify-center p-2.5' : 'px-3 py-2 gap-2.5 justify-between'
            } ${
              isAnalyticsOpen
                ? 'bg-[#FCE7F3] text-pink-950 border border-[#F9A8D4]'
                : 'text-slate-700 hover:text-slate-950 hover:bg-white/70'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <BarChart3 className="w-4 h-4 text-pink-700 shrink-0" />
              {!isCollapsed && <span className="truncate">Analytics &amp; Charts</span>}
            </div>
            {!isCollapsed && (
              <span className="text-[10px] font-mono text-slate-600">
                {isAnalyticsOpen ? 'Open' : 'Closed'}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              onOpenDictionary();
              onCloseMobile();
            }}
            title="View medical shorthand & abbreviation reference"
            className={`w-full rounded-xl text-xs font-medium text-slate-700 hover:text-slate-950 hover:bg-white/70 transition-colors flex items-center cursor-pointer ${
              isCollapsed ? 'justify-center p-2.5' : 'px-3 py-2 gap-2.5'
            }`}
          >
            <BookOpen className="w-4 h-4 text-amber-700 shrink-0" />
            {!isCollapsed && <span className="truncate">Medical Shorthand</span>}
          </button>

          {onOpenMedicineMaster && (
            <button
              type="button"
              onClick={() => {
                onOpenMedicineMaster();
                onCloseMobile();
              }}
              title="Manage master medication list, notes (e.g. red urine), and diagnosis groups (UTI, Prostatitis)"
              className={`w-full rounded-xl text-xs font-medium text-slate-700 hover:text-slate-950 hover:bg-white/70 transition-colors flex items-center cursor-pointer ${
                isCollapsed ? 'justify-center p-2.5' : 'px-3 py-2 gap-2.5'
              }`}
            >
              <Pill className="w-4 h-4 text-teal-700 shrink-0" />
              {!isCollapsed && <span className="truncate">Medicine Master &amp; Groups</span>}
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              onExportExcel();
              onCloseMobile();
            }}
            title="Download multi-sheet Excel register (.xlsx)"
            className={`w-full rounded-xl text-xs font-medium text-slate-700 hover:text-slate-950 hover:bg-white/70 transition-colors flex items-center cursor-pointer ${
              isCollapsed ? 'justify-center p-2.5' : 'px-3 py-2 gap-2.5'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-700 shrink-0" />
            {!isCollapsed && <span className="truncate">Download Excel (.xlsx)</span>}
          </button>
        </div>
      </div>

      {/* Bottom Doctor Account Controls */}
      <div className="p-3 border-t border-[#E3DDF2] bg-[#EFEBF9]/50 space-y-1 shrink-0">
        {!isCollapsed && (
          <div className="px-2 pb-1 text-[11px] font-semibold text-slate-600">
            Physician Account
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            onOpenDoctorProfile();
            onCloseMobile();
          }}
          title="View and edit Doctor Profile"
          className={`w-full rounded-xl text-xs font-medium text-slate-700 hover:text-slate-950 hover:bg-white/80 transition-colors flex items-center cursor-pointer ${
            isCollapsed ? 'justify-center p-2.5' : 'px-3 py-2 gap-2.5'
          }`}
        >
          <Edit3 className="w-4 h-4 text-violet-700 shrink-0" />
          {!isCollapsed && <span className="truncate">Doctor Profile &amp; Edit</span>}
        </button>

        <button
          type="button"
          onClick={() => {
            onOpenAuthPage('register');
            onCloseMobile();
          }}
          title="Register a new doctor account"
          className={`w-full rounded-xl text-xs font-medium text-slate-700 hover:text-slate-950 hover:bg-white/80 transition-colors flex items-center cursor-pointer ${
            isCollapsed ? 'justify-center p-2.5' : 'px-3 py-2 gap-2.5'
          }`}
        >
          <UserPlus className="w-4 h-4 text-sky-700 shrink-0" />
          {!isCollapsed && <span className="truncate">Register New Doctor</span>}
        </button>

        <button
          type="button"
          onClick={() => {
            onLogoutDoctor();
            onCloseMobile();
          }}
          title="Log out or switch doctor account"
          className={`w-full rounded-xl text-xs font-medium text-rose-700 hover:text-rose-900 hover:bg-rose-100/70 transition-colors flex items-center cursor-pointer ${
            isCollapsed ? 'justify-center p-2.5' : 'px-3 py-2 gap-2.5'
          }`}
        >
          <LogOut className="w-4 h-4 text-rose-600 shrink-0" />
          {!isCollapsed && <span className="truncate">Log Out</span>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Left-Hand Margin Sidebar */}
      <aside
        className={`hidden lg:flex flex-col shrink-0 border-r border-[#E3DDF2] bg-[#F4F1FA] sticky top-0 h-screen z-30 transition-all duration-150 ${
          isCollapsed ? 'w-18' : 'w-64'
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden bg-slate-900/40 backdrop-blur-xs flex"
          onClick={onCloseMobile}
        >
          <div
            className="w-64 max-w-[82vw] h-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
