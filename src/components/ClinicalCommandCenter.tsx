import React, { useState } from 'react';
import {
  FilePlus2,
  FolderOpen,
  Search,
  Calendar,
  BarChart3,
  BookOpen,
  UserCheck,
  ArrowRight,
  Eye,
  ShieldCheck,
  Pill,
  ClipboardList,
  Scissors,
} from 'lucide-react';
import { DoctorAccount } from '../types/doctor';
import { MonthNavItem, YearNavItem } from './Sidebar';
import { MedScribeLogo } from './MedScribeLogo';

interface ClinicalCommandCenterProps {
  currentDoctor: DoctorAccount;
  totalConsultationsCount: number;
  otCount?: number;
  monthsCount: number;
  datesCount: number;
  yearItems: YearNavItem[];
  monthItems: MonthNavItem[];
  onOpenManualEntry: (defaultDate?: string) => void;
  onOpenNewOtEntry?: (defaultDate?: string) => void;
  onOpenConsultationsList: () => void;
  onOpenOtList: () => void;
  onOpenPatientRegister: (options?: {
    yearKey?: string;
    monthKey?: string;
    searchQuery?: string;
  }) => void;
  onToggleAnalytics: () => void;
  isAnalyticsOpen: boolean;
  onOpenDictionary: () => void;
  onExportExcel: () => void;
  onOpenDoctorProfile: () => void;
}

export const ClinicalCommandCenter: React.FC<ClinicalCommandCenterProps> = ({
  currentDoctor,
  totalConsultationsCount,
  otCount = 0,
  monthsCount,
  datesCount,
  yearItems,
  monthItems,
  onOpenManualEntry,
  onOpenNewOtEntry,
  onOpenConsultationsList,
  onOpenOtList,
  onOpenPatientRegister,
  onToggleAnalytics,
  isAnalyticsOpen,
  onOpenDictionary,
  onOpenDoctorProfile,
}) => {
  const [quickSearch, setQuickSearch] = useState('');
  const todayIso = new Date().toISOString().split('T')[0];
  const todayFormatted = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const activeMonths = monthItems.filter((m) => m.count > 0).slice(0, 6);

  const handleQuickSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onOpenPatientRegister({ searchQuery: quickSearch.trim() });
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* 1. Physician Workspace Hero & Privacy-First Banner (Soft Pastel Lavender-Sky-Sage Gradient with Watermark MedScribe Logo) */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#F3EEFF] via-[#EDF6FF] to-[#EBFBF3] text-slate-800 rounded-2xl border border-[#DDD6FE] p-6 sm:p-8 shadow-2xs">
        {/* Subtle MedScribe Pastel Watermark in the Hero Background */}
        <div
          aria-hidden="true"
          className="pointer-events-none select-none absolute inset-y-0 right-1/4 sm:right-[28%] flex items-center justify-center opacity-[0.22]"
        >
          <MedScribeLogo
            variant="watermark"
            size="2xl"
            subtitleText="Local OPD & IPD EMR"
            className="scale-110 sm:scale-125"
          />
        </div>

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Expanded Doctor Details Section */}
          <div className="flex-1 min-w-0 space-y-2.5">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs sm:text-sm text-violet-800 font-semibold">
              <span>{currentDoctor.department || 'Clinical Department'}</span>
              <span aria-hidden="true" className="text-violet-400">·</span>
              <span>{currentDoctor.hospitalName || 'Medical Clinic'}</span>
              <span aria-hidden="true" className="text-violet-400">·</span>
              <span className="font-mono tabular-nums text-sky-900">{todayFormatted}</span>
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-slate-900">
              {currentDoctor.fullName}
            </h1>

            <p className="text-sm sm:text-base text-slate-700 leading-relaxed font-medium">
              {currentDoctor.qualification}
              {currentDoctor.speciality ? ` · ${currentDoctor.speciality}` : ''}
              {currentDoctor.registrationNo ? ` · Reg: ${currentDoctor.registrationNo}` : ''}
            </p>

            <div className="pt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-600 tabular-nums">
              <span className="inline-flex items-center gap-1.5 text-teal-900 font-medium bg-white/60 px-2.5 py-1 rounded-lg border border-[#CBE7E0]">
                <ShieldCheck className="w-4 h-4 text-teal-700 shrink-0" />
                <span>Patient records are concealed by default for consultation room privacy</span>
              </span>
              <span aria-hidden="true" className="hidden sm:inline text-slate-400">·</span>
              <span>
                <strong className="text-slate-900 font-mono">{totalConsultationsCount}</strong> Saved Consultations
              </span>
              <span aria-hidden="true" className="text-slate-400">·</span>
              <span>
                <strong className="text-slate-900 font-mono">{monthsCount}</strong> Monthly Sheets
              </span>
              <span aria-hidden="true" className="text-slate-400">·</span>
              <span>
                <strong className="text-slate-900 font-mono">{datesCount}</strong> OPD Dates
              </span>
            </div>
          </div>

          {/* Stacked Action Buttons: Consultations, OT Notes, Open Patient Register */}
          <div className="flex flex-col items-stretch gap-2.5 shrink-0 w-full sm:w-auto sm:min-w-[255px]">
            <button
              type="button"
              onClick={onOpenConsultationsList}
              className="w-full px-5 py-2.5 rounded-xl bg-[#CFEAFE] hover:bg-[#BAE6FD] text-sky-950 border border-[#7DD3FC] font-bold text-xs sm:text-sm shadow-2xs transition-colors flex items-center justify-center gap-2.5 cursor-pointer whitespace-nowrap"
              title="Open Quick Consultations List (Date of Visit, Age, Sex, Diagnosis, Open Notes, Edit & Export PDF)"
            >
              <ClipboardList className="w-4 h-4 text-sky-800 shrink-0" />
              <span>Consultations ({totalConsultationsCount})</span>
            </button>

            <button
              type="button"
              onClick={onOpenOtList}
              className="w-full px-5 py-2.5 rounded-xl bg-[#FEF3C7] hover:bg-[#FDE68A] text-amber-950 border border-[#FCD34D] font-bold text-xs sm:text-sm shadow-2xs transition-colors flex items-center justify-center gap-2.5 cursor-pointer whitespace-nowrap"
              title="Open Operation Theatre (OT) Register — Dates, Patient Name, Procedure Done & Detailed OT Notes"
            >
              <Scissors className="w-4 h-4 text-amber-800 shrink-0" />
              <span>OT Notes ({otCount})</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenPatientRegister()}
              className="w-full px-5 py-2.5 rounded-xl bg-[#DDD6FE] hover:bg-[#C4B5FD] text-violet-950 border border-[#C4B5FD] font-bold text-xs sm:text-sm shadow-2xs transition-colors flex items-center justify-center gap-2.5 cursor-pointer whitespace-nowrap"
              title="Open Detailed Multi-Sheet Patient Register"
            >
              <Eye className="w-4 h-4 text-violet-800 shrink-0" />
              <span>Open Patient Register ({totalConsultationsCount})</span>
            </button>
          </div>
        </div>
      </section>

      {/* 2. Primary Consultation Capture Grid (2 Distinct Pastel Cards: OPD Entry & OT Notes) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Start a Patient Consultation or OT Note
            </h2>
            <p className="text-xs text-slate-600">
              Log structured OPD consultations or surgical OT notes locally with instant Master Register sync and A4 print preview.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
          {/* Workflow 1: Manual Structured OPD Form Entry (Pastel Sage Mint) */}
          <div className="bg-[#F1FBF6] rounded-2xl border border-[#A7F3D0] p-5 flex flex-col justify-between hover:border-[#6EE7B7] transition-colors">
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-emerald-900">
                  01. Direct OPD Form
                </span>
                <div className="w-9 h-9 rounded-xl bg-[#D1FAE5] border border-[#A7F3D0] text-emerald-800 flex items-center justify-center">
                  <FilePlus2 className="w-4 h-4" />
                </div>
              </div>

              <div className="space-y-1.5">
                <h3 className="text-base font-bold text-slate-900">
                  New Manual Patient Entry
                </h3>
                <p className="text-xs text-slate-700 leading-relaxed">
                  Open a structured Urology &amp; Internal Medicine consultation form for today ({todayIso}) with 1-click medicine presets, investigations table, and A4 prescription printing.
                </p>
              </div>
            </div>

            <div className="pt-5 mt-5 border-t border-[#D1F7E5]">
              <button
                type="button"
                onClick={() => onOpenManualEntry(todayIso)}
                className="w-full py-2.5 px-3.5 rounded-xl bg-[#D1FAE5] hover:bg-[#A7F3D0] text-emerald-950 border border-[#6EE7B7] font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
              >
                <FilePlus2 className="w-4 h-4 text-emerald-800" />
                <span>Open Blank OPD Form</span>
                <ArrowRight className="w-3.5 h-3.5 ml-auto text-emerald-800" />
              </button>
            </div>
          </div>

          {/* Workflow 2: Operation Theatre (OT) & Freelance Surgery Notes (Pastel Warm Peach-Amber) */}
          <div className="bg-[#FFFBEB] rounded-2xl border border-[#FDE68A] p-5 flex flex-col justify-between hover:border-[#FCD34D] transition-colors">
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-amber-900">
                  02. OT &amp; Freelance Surgery
                </span>
                <div className="w-9 h-9 rounded-xl bg-[#FEF3C7] border border-[#FCD34D] text-amber-900 flex items-center justify-center">
                  <Scissors className="w-4 h-4" />
                </div>
              </div>

              <div className="space-y-1.5">
                <h3 className="text-base font-bold text-slate-900">
                  Add OT / Surgical Notes
                </h3>
                <p className="text-xs text-slate-700 leading-relaxed">
                  Log operative notes for OPD patients or standalone freelance surgeries with 1-click Urology OT templates, automatic IPD cross-sync, and A4 OT printouts.
                </p>
              </div>
            </div>

            <div className="pt-5 mt-5 border-t border-[#FDE68A]">
              <button
                type="button"
                onClick={() =>
                  onOpenNewOtEntry ? onOpenNewOtEntry(todayIso) : onOpenManualEntry(todayIso)
                }
                className="w-full py-2.5 px-3.5 rounded-xl bg-[#FEF3C7] hover:bg-[#FDE68A] text-amber-950 border border-[#FCD34D] font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Scissors className="w-4 h-4 text-amber-800" />
                <span>+ Add OT Notes</span>
                <ArrowRight className="w-3.5 h-3.5 ml-auto text-amber-800" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 3. On-Demand Patient Lookup & Monthly Excel Sheet Launcher */}
      <section className="bg-[#FFFDF9] rounded-2xl border border-[#E6DFD5] p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[#EFEAE2]">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Patient Records &amp; Monthly Register Sheets
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Records are concealed by default. Search a specific patient below or click a month sheet to open the register.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
            <button
              type="button"
              onClick={onOpenConsultationsList}
              className="px-4 py-2.5 rounded-xl bg-[#E0F2FE] hover:bg-[#BAE6FD] text-sky-950 border border-[#7DD3FC] font-bold text-xs flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
            >
              <ClipboardList className="w-4 h-4 text-sky-800" />
              <span>Consultations ({totalConsultationsCount})</span>
            </button>

            <button
              type="button"
              onClick={onOpenOtList}
              className="px-4 py-2.5 rounded-xl bg-[#FEF3C7] hover:bg-[#FDE68A] text-amber-950 border border-[#FCD34D] font-bold text-xs flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Scissors className="w-4 h-4 text-amber-800" />
              <span>OT Notes ({otCount})</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenPatientRegister({ yearKey: 'ALL', monthKey: 'ALL' })}
              className="px-4 py-2.5 rounded-xl bg-[#EDE9FE] hover:bg-[#DDD6FE] text-violet-950 border border-[#C4B5FD] font-semibold text-xs flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
            >
              <FolderOpen className="w-4 h-4 text-violet-800" />
              <span>Open Patient Register ({totalConsultationsCount})</span>
            </button>
          </div>
        </div>

        {/* Search to Open Register */}
        <form onSubmit={handleQuickSearchSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-violet-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={quickSearch}
              onChange={(e) => setQuickSearch(e.target.value)}
              placeholder="Search patient name, UHID/OPD number, phone, or diagnosis to open matching records..."
              className="w-full pl-10 pr-4 py-2.5 text-xs bg-[#F7F5FC] focus:bg-white border border-[#DFD8F0] focus:border-violet-400 rounded-xl outline-none text-slate-900 transition-colors"
            />
          </div>
          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl bg-[#E0F2FE] hover:bg-[#BAE6FD] text-sky-950 border border-[#7DD3FC] font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Search className="w-3.5 h-3.5 text-sky-800" />
            <span>Search &amp; Open Records</span>
          </button>
        </form>

        {/* Browse by Month or Year on Demand */}
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span className="font-semibold text-slate-800">Open Specific Monthly Sheet</span>
            <div className="flex items-center gap-2 font-mono text-[11px]">
              {yearItems.map((yr) => (
                <button
                  key={yr.yearKey}
                  type="button"
                  onClick={() => onOpenPatientRegister({ yearKey: yr.yearKey, monthKey: 'ALL' })}
                  className="px-2.5 py-1 rounded-lg bg-[#F3F0FA] hover:bg-[#DDD6FE] text-violet-900 border border-[#DFD8F0] font-semibold transition-colors cursor-pointer"
                >
                  {yr.yearLabel} ({yr.count})
                </button>
              ))}
            </div>
          </div>

          {activeMonths.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {activeMonths.map((m, idx) => {
                const pastelTileStyles = [
                  'bg-[#F6F3FF] hover:bg-[#EDE9FE] border-[#DDD6FE] text-violet-950',
                  'bg-[#F0F9FF] hover:bg-[#E0F2FE] border-[#BAE6FD] text-sky-950',
                  'bg-[#F0FDF4] hover:bg-[#DCFCE7] border-[#BBF7D0] text-emerald-950',
                ];
                const tileClass = pastelTileStyles[idx % pastelTileStyles.length];
                return (
                  <button
                    key={m.monthKey}
                    type="button"
                    onClick={() =>
                      onOpenPatientRegister({
                        yearKey: m.yearKey,
                        monthKey: m.monthKey,
                      })
                    }
                    className={`p-3.5 rounded-xl border text-left flex items-center justify-between transition-colors cursor-pointer group ${tileClass}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-white/90 border border-white flex items-center justify-center text-violet-700 shrink-0 shadow-2xs">
                        <Calendar className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 truncate">
                          {m.monthLabel}
                        </div>
                        <div className="text-[11px] text-slate-600 font-mono tabular-nums">
                          {m.count} {m.count === 1 ? 'Consultation' : 'Consultations'}
                        </div>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-500 group-hover:translate-x-0.5 transition-transform shrink-0" />
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() =>
                  onOpenPatientRegister({
                    yearKey: 'ALL',
                    monthKey: 'PRESCRIPTIONS',
                  })
                }
                className="p-3.5 rounded-xl border border-[#FBCFE8] bg-[#FDF2F8] hover:bg-[#FCE7F3] text-left flex items-center justify-between transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-white/90 border border-white flex items-center justify-center text-pink-700 shrink-0 shadow-2xs">
                    <Pill className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 truncate">
                      Prescriptions (Rx) Register
                    </div>
                    <div className="text-[11px] text-slate-600">
                      All prescribed medicines table
                    </div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-pink-700 group-hover:translate-x-0.5 transition-transform shrink-0" />
              </button>
            </div>
          ) : (
            <div className="p-6 rounded-xl bg-[#F7F5FC] border border-[#E4DFF3] text-center text-xs text-slate-600">
              No consultations recorded yet. Use <strong>New Manual Patient Entry</strong> or <strong>Add OT / Surgical Notes</strong> above to log your first patient.
            </div>
          )}
        </div>
      </section>

      {/* 4. Secondary Workspace Tools Bar (Soft Pastel Rose, Amber-Peach, and Mint) */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <button
          type="button"
          onClick={onToggleAnalytics}
          className={`p-4 rounded-xl border text-left flex items-center justify-between transition-colors cursor-pointer ${
            isAnalyticsOpen
              ? 'bg-[#FCE7F3] border-[#F9A8D4] text-pink-950'
              : 'bg-[#FDF4F8] border-[#FBCFE8] hover:bg-[#FCE7F3] text-slate-800'
          }`}
        >
          <div className="flex items-center gap-3">
            <BarChart3 className="w-4 h-4 text-pink-700 shrink-0" />
            <div>
              <div className="text-xs font-bold text-slate-900">Clinical Analytics &amp; Charts</div>
              <div className="text-[11px] text-slate-600">
                {isAnalyticsOpen ? 'Currently open above' : 'Demographics & top diagnoses'}
              </div>
            </div>
          </div>
          <span className="text-[11px] font-mono text-pink-800 font-semibold">
            {isAnalyticsOpen ? 'Hide' : 'Open'}
          </span>
        </button>

        <button
          type="button"
          onClick={onOpenDictionary}
          className="p-4 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] hover:bg-[#FEF3C7] text-left flex items-center justify-between transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <BookOpen className="w-4 h-4 text-amber-800 shrink-0" />
            <div>
              <div className="text-xs font-bold text-slate-900">Medical Shorthand Reference</div>
              <div className="text-[11px] text-slate-600">
                Clinical &amp; prescription abbreviations
              </div>
            </div>
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-amber-800" />
        </button>

        <button
          type="button"
          onClick={onOpenDoctorProfile}
          className="p-4 rounded-xl border border-[#DDD6FE] bg-[#F5F3FF] hover:bg-[#EDE9FE] text-left flex items-center justify-between transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <UserCheck className="w-4 h-4 text-violet-800 shrink-0" />
            <div>
              <div className="text-xs font-bold text-slate-900">Doctor Profile &amp; Backup</div>
              <div className="text-[11px] text-slate-600">
                Print header credentials &amp; local sync
              </div>
            </div>
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-violet-800" />
        </button>
      </section>
    </div>
  );
};
