import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  ChevronDown,
  ChevronUp,
  Stethoscope,
  Users,
  Calendar,
  MapPin,
  X,
} from 'lucide-react';
import { Consultation } from '../types/opd';
import { getMonthInfo } from '../utils/excelExporter';
import { MedScribeLogo } from './MedScribeLogo';

interface AnalyticsPanelProps {
  consultations: Consultation[];
  isOpen: boolean;
  onToggle: () => void;
  selectedDiagnosisFilter?: string | null;
  onSelectDiagnosisFilter?: (diagnosis: string | null) => void;
}

const IGNORED_DIAGNOSES = new Set([
  'not explicitly stated',
  'not explicitly noted',
  'not mentioned',
  'none',
  'nil',
  'n/a',
  'na',
  '-',
  '--',
]);

function parseNumericAge(ageStr?: string): number | null {
  if (!ageStr) return null;
  const match = String(ageStr).match(/(\d{1,3})/);
  if (!match) return null;
  const val = parseInt(match[1], 10);
  return val > 0 && val < 125 ? val : null;
}

function normalizeDiagnosisLabel(raw: string): string {
  const cleaned = raw.trim().replace(/\s+/g, ' ').replace(/^[•\-*]\s*/, '');
  if (!cleaned) return '';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export const AnalyticsPanel: React.FC<AnalyticsPanelProps> = ({
  consultations,
  isOpen,
  onToggle,
  selectedDiagnosisFilter = null,
  onSelectDiagnosisFilter,
}) => {
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>('ALL');

  // Available months from consultations
  const availableMonths = useMemo(() => {
    const map = new Map<string, string>();
    consultations.forEach((c) => {
      if (!c.date) return;
      const { monthKey, monthLabel } = getMonthInfo(c.date);
      if (!map.has(monthKey)) {
        map.set(monthKey, monthLabel);
      }
    });
    return Array.from(map.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => b.key.localeCompare(a.key));
  }, [consultations]);

  // Consultations filtered by month selection inside Analytics
  const scopedConsultations = useMemo(() => {
    if (selectedMonthKey === 'ALL') return consultations;
    return consultations.filter((c) => getMonthInfo(c.date).monthKey === selectedMonthKey);
  }, [consultations, selectedMonthKey]);

  // 1. Most Common Diagnoses
  const diagnosisStats = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>();
    let totalMentions = 0;

    scopedConsultations.forEach((c) => {
      const rawDiag = (c.diagnosis || '').trim();
      if (!rawDiag) return;

      // Split composite diagnoses separated by '/', ';', or '|'
      const parts = rawDiag
        .split(/[\/;|]+/)
        .map((p) => p.trim())
        .filter(Boolean);

      const seenInThisConsultation = new Set<string>();

      parts.forEach((part) => {
        const lower = part.toLowerCase();
        if (IGNORED_DIAGNOSES.has(lower)) return;
        if (seenInThisConsultation.has(lower)) return;
        seenInThisConsultation.add(lower);

        const existing = counts.get(lower);
        if (existing) {
          existing.count += 1;
        } else {
          counts.set(lower, {
            label: normalizeDiagnosisLabel(part),
            count: 1,
          });
        }
        totalMentions += 1;
      });
    });

    const sorted = Array.from(counts.values()).sort((a, b) => b.count - a.count);
    const maxCount = sorted[0]?.count || 1;
    const totalPatients = Math.max(scopedConsultations.length, 1);

    return {
      items: sorted.slice(0, 7).map((item) => ({
        ...item,
        percentageOfPatients: Math.round((item.count / totalPatients) * 100),
        barWidthPercent: Math.max(Math.round((item.count / maxCount) * 100), 8),
      })),
      uniqueDiagnosesCount: sorted.length,
      topDiagnosis: sorted[0] || null,
      totalMentions,
    };
  }, [scopedConsultations]);

  // 2. Gender Demographics (for SVG Donut Chart)
  const genderStats = useMemo(() => {
    let male = 0;
    let female = 0;
    let other = 0;

    scopedConsultations.forEach((c) => {
      const g = String(c.gender || 'M').trim().toUpperCase();
      if (g.startsWith('F')) female += 1;
      else if (g.startsWith('M')) male += 1;
      else other += 1;
    });

    const total = male + female + other;
    const safeTotal = Math.max(total, 1);

    return {
      total,
      segments: [
        {
          key: 'Male',
          count: male,
          percent: Math.round((male / safeTotal) * 100),
          color: '#7EA8D8', // pastel cornflower blue
          bgClass: 'bg-[#7EA8D8]',
        },
        {
          key: 'Female',
          count: female,
          percent: Math.round((female / safeTotal) * 100),
          color: '#9F8FEF', // pastel lavender
          bgClass: 'bg-[#9F8FEF]',
        },
        ...(other > 0
          ? [
              {
                key: 'Other',
                count: other,
                percent: Math.round((other / safeTotal) * 100),
                color: '#84C5B8', // pastel sage
                bgClass: 'bg-[#84C5B8]',
              },
            ]
          : []),
      ],
    };
  }, [scopedConsultations]);

  // 3. Age Cohort Distribution & Average Age
  const ageStats = useMemo(() => {
    const cohorts = [
      { label: '<18y', rangeLabel: 'Pediatric (<18)', min: 0, max: 17, count: 0 },
      { label: '18–35y', rangeLabel: 'Young Adult (18–35)', min: 18, max: 35, count: 0 },
      { label: '36–50y', rangeLabel: 'Middle Age (36–50)', min: 36, max: 50, count: 0 },
      { label: '51–65y', rangeLabel: 'Senior (51–65)', min: 51, max: 65, count: 0 },
      { label: '65+y', rangeLabel: 'Elderly (65+)', min: 66, max: 200, count: 0 },
    ];

    let ageSum = 0;
    let validAgeCount = 0;
    let minAge = Infinity;
    let maxAge = -Infinity;

    scopedConsultations.forEach((c) => {
      const age = parseNumericAge(c.age);
      if (age !== null) {
        ageSum += age;
        validAgeCount += 1;
        if (age < minAge) minAge = age;
        if (age > maxAge) maxAge = age;

        const bucket = cohorts.find((b) => age >= b.min && age <= b.max);
        if (bucket) bucket.count += 1;
      }
    });

    const maxBucketCount = Math.max(...cohorts.map((b) => b.count), 1);
    const safeTotal = Math.max(validAgeCount, 1);

    return {
      averageAge: validAgeCount > 0 ? Math.round(ageSum / validAgeCount) : null,
      minAge: minAge !== Infinity ? minAge : null,
      maxAge: maxAge !== -Infinity ? maxAge : null,
      validAgeCount,
      cohorts: cohorts.map((c) => ({
        ...c,
        percent: validAgeCount > 0 ? Math.round((c.count / safeTotal) * 100) : 0,
        heightPercent: c.count > 0 ? Math.max(Math.round((c.count / maxBucketCount) * 100), 12) : 4,
      })),
    };
  }, [scopedConsultations]);

  // 4. Top Cities & Unique Patients
  const summaryStats = useMemo(() => {
    const uniquePatients = new Set(
      scopedConsultations.map((c) => (c.patientName || '').trim().toLowerCase()).filter(Boolean)
    ).size;

    const admissionsRecommended = scopedConsultations.filter(
      (c) => (c.admissionAdvice || '').toLowerCase() === 'yes'
    ).length;

    const cityMap = new Map<string, { name: string; count: number }>();
    scopedConsultations.forEach((c) => {
      const rawCity = (c.city || c.addressOrCity || '').trim();
      if (!rawCity) return;
      const key = rawCity.toLowerCase();
      const existing = cityMap.get(key);
      if (existing) existing.count += 1;
      else cityMap.set(key, { name: rawCity, count: 1 });
    });

    const topCities = Array.from(cityMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);

    return {
      uniquePatients,
      admissionsRecommended,
      topCities,
    };
  }, [scopedConsultations]);

  // Compute SVG Donut stroke-dasharray / stroke-dashoffset segments
  const donutRadius = 38;
  const donutCircumference = 2 * Math.PI * donutRadius;
  let cumulativeFraction = 0;
  const donutArcs = genderStats.segments.map((seg) => {
    const fraction = genderStats.total > 0 ? seg.count / genderStats.total : 0;
    const dashLength = fraction * donutCircumference;
    const dashOffset = -cumulativeFraction * donutCircumference;
    cumulativeFraction += fraction;
    return {
      ...seg,
      dashArray: `${dashLength} ${donutCircumference}`,
      dashOffset,
    };
  });

  return (
    <section
      aria-label="Clinical Analytics & Patient Demographics"
      className="w-full px-4 sm:px-6 lg:px-8 pt-5"
    >
      <div className="bg-[#FDFBF9] border border-[#E6E0D8] rounded-2xl overflow-hidden shadow-2xs">
        {/* Top Toggle Header Bar */}
        <div className="px-4 sm:px-5 py-3 bg-gradient-to-r from-[#F4F1FA] via-[#E1F7FC]/75 to-[#EBFBF3]/80 border-b border-[#D6DDF8] flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onToggle}
            className="flex items-center gap-2.5 text-left group focus:outline-none"
          >
            <MedScribeLogo variant="icon" size="xs" />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-[#2D2A3E] group-hover:text-[#5B4D9D] transition-colors">
                  Clinical Analytics &amp; Demographics Summary
                </h2>
                <span className="text-xs text-[#6B647B] font-normal">
                  · {scopedConsultations.length} Consultations
                  {diagnosisStats.topDiagnosis ? ` · Top Dx: ${diagnosisStats.topDiagnosis.label}` : ''}
                </span>
              </div>
              <p className="text-[11px] text-[#6B647B]">
                Most common urology/OPD diagnoses, age distribution, and gender breakdown
              </p>
            </div>
          </button>

          <div className="flex items-center gap-2">
            {/* Month Scope Selector (visible when open) */}
            {isOpen && availableMonths.length > 1 && (
              <div className="flex items-center gap-1 bg-white/80 border border-[#D6DDF8] p-0.5 rounded-lg">
                <button
                  type="button"
                  onClick={() => setSelectedMonthKey('ALL')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    selectedMonthKey === 'ALL'
                      ? 'bg-[#F3EEFF] text-[#3B2E68] shadow-2xs font-bold'
                      : 'text-[#6B647B] hover:text-[#2D2A3E]'
                  }`}
                >
                  All Months
                </button>
                {availableMonths.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setSelectedMonthKey(m.key)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      selectedMonthKey === m.key
                        ? 'bg-[#F3EEFF] text-[#3B2E68] shadow-2xs font-bold'
                        : 'text-[#6B647B] hover:text-[#2D2A3E]'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={onToggle}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#3B2E68] bg-white border border-[#D6DDF8] hover:bg-[#F3EEFF] transition-colors whitespace-nowrap shrink-0"
              aria-expanded={isOpen}
            >
              <span>{isOpen ? 'Hide Analytics' : 'Show Analytics'}</span>
              {isOpen ? (
                <ChevronUp className="w-3.5 h-3.5 text-[#5B4D9D]" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-[#5B4D9D]" />
              )}
            </button>
          </div>
        </div>

        {/* Collapsible Body */}
        {isOpen && (
          <div className="p-4 sm:p-5 space-y-5">
            {scopedConsultations.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                No consultations match the current filter to generate analytics charts.
              </div>
            ) : (
              <>
                {/* Top KPI Metric Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-4 border-b border-slate-200">
                  <div>
                    <div className="text-xs text-slate-500 font-medium">Total Consultations</div>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-slate-900 tabular-nums">
                        {scopedConsultations.length}
                      </span>
                      <span className="text-xs text-slate-500 tabular-nums">
                        · {summaryStats.uniquePatients} unique patients
                      </span>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-500 font-medium">Mean Patient Age</div>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-slate-900 tabular-nums">
                        {ageStats.averageAge !== null ? `${ageStats.averageAge} yrs` : '—'}
                      </span>
                      {ageStats.minAge !== null && ageStats.maxAge !== null && (
                        <span className="text-xs text-slate-500 tabular-nums">
                          · Range {ageStats.minAge}–{ageStats.maxAge}y
                        </span>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-500 font-medium">Distinct Diagnoses</div>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-slate-900 tabular-nums">
                        {diagnosisStats.uniqueDiagnosesCount}
                      </span>
                      <span className="text-xs text-slate-500 tabular-nums">
                        · {diagnosisStats.totalMentions} total entries
                      </span>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-500 font-medium">IPD Admissions Advised</div>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-slate-900 tabular-nums">
                        {summaryStats.admissionsRecommended}
                      </span>
                      <span className="text-xs text-slate-500 tabular-nums">
                        ·{' '}
                        {Math.round(
                          (summaryStats.admissionsRecommended / Math.max(scopedConsultations.length, 1)) * 100
                        )}
                        % of visits
                      </span>
                    </div>
                  </div>
                </div>

                {/* Main 3-Column Charts Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                  {/* Column 1 (5 cols): Most Common Diagnoses Horizontal Bar Chart */}
                  <div className="lg:col-span-5 flex flex-col justify-between lg:pr-6 lg:border-r lg:border-slate-200">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-1.5">
                          <Stethoscope className="w-4 h-4 text-teal-700" />
                          <h3 className="text-xs font-bold text-slate-900">
                            Most Common Diagnoses
                          </h3>
                        </div>
                        {selectedDiagnosisFilter ? (
                          <button
                            type="button"
                            onClick={() => onSelectDiagnosisFilter?.(null)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700 hover:text-teal-900"
                          >
                            <span>Filtering: {selectedDiagnosisFilter}</span>
                            <X className="w-3 h-3" />
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400">
                            {onSelectDiagnosisFilter ? 'Click a bar to filter register' : 'Share of visits'}
                          </span>
                        )}
                      </div>

                      {diagnosisStats.items.length === 0 ? (
                        <p className="text-xs text-slate-400 py-6">
                          No recorded diagnoses in this period.
                        </p>
                      ) : (
                        <div className="space-y-2.5">
                          {diagnosisStats.items.map((diag, idx) => {
                            const isSelected =
                              selectedDiagnosisFilter?.toLowerCase() === diag.label.toLowerCase();
                            return (
                              <button
                                key={diag.label}
                                type="button"
                                onClick={() => {
                                  if (!onSelectDiagnosisFilter) return;
                                  onSelectDiagnosisFilter(isSelected ? null : diag.label);
                                }}
                                className={`w-full text-left group rounded-lg p-1.5 -mx-1.5 transition-colors ${
                                  isSelected
                                    ? 'bg-teal-50/90 ring-1 ring-teal-600/30'
                                    : 'hover:bg-slate-50'
                                }`}
                                title={`Click to filter consultations with diagnosis "${diag.label}"`}
                              >
                                <div className="flex items-baseline justify-between gap-2 text-xs mb-1">
                                  <span className="font-semibold text-slate-800 truncate group-hover:text-teal-800">
                                    <span className="text-slate-400 font-mono mr-1.5 tabular-nums">
                                      0{idx + 1}.
                                    </span>
                                    {diag.label}
                                  </span>
                                  <span className="text-xs text-slate-600 font-mono tabular-nums shrink-0">
                                    <strong className="text-slate-900">{diag.count}</strong> (
                                    {diag.percentageOfPatients}%)
                                  </span>
                                </div>
                                <div className="w-full h-2 bg-slate-100 rounded-sm overflow-hidden">
                                  <div
                                    className={`h-full rounded-sm transition-transform duration-200 origin-left ${
                                      isSelected
                                        ? 'bg-teal-700'
                                        : idx === 0
                                        ? 'bg-teal-600'
                                        : idx === 1
                                        ? 'bg-teal-500'
                                        : 'bg-teal-400/85'
                                    }`}
                                    style={{ width: `${diag.barWidthPercent}%` }}
                                  />
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Column 2 (3 cols): Gender Distribution Donut Chart */}
                  <div className="lg:col-span-3 flex flex-col justify-between lg:pr-6 lg:border-r lg:border-slate-200">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-1.5">
                          <Users className="w-4 h-4 text-sky-700" />
                          <h3 className="text-xs font-bold text-slate-900">
                            Gender Breakdown
                          </h3>
                        </div>
                        <span className="text-[11px] text-slate-400 tabular-nums">
                          n = {genderStats.total}
                        </span>
                      </div>

                      <div className="flex items-center gap-4 my-2">
                        {/* SVG Donut Chart */}
                        <div className="relative w-28 h-28 shrink-0 flex items-center justify-center">
                          <svg
                            viewBox="0 0 100 100"
                            className="w-28 h-28 -rotate-90 transform"
                            aria-label="Patient gender distribution chart"
                          >
                            <circle
                              cx="50"
                              cy="50"
                              r={donutRadius}
                              fill="transparent"
                              stroke="#f1f5f9"
                              strokeWidth="12"
                            />
                            {donutArcs.map((arc) => (
                              <circle
                                key={arc.key}
                                cx="50"
                                cy="50"
                                r={donutRadius}
                                fill="transparent"
                                stroke={arc.color}
                                strokeWidth="12"
                                strokeDasharray={arc.dashArray}
                                strokeDashoffset={arc.dashOffset}
                                strokeLinecap="butt"
                              />
                            ))}
                          </svg>
                          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                            <span className="text-base font-bold text-slate-900 tabular-nums leading-none">
                              {genderStats.total}
                            </span>
                            <span className="text-[10px] text-slate-500 mt-0.5">
                              Patients
                            </span>
                          </div>
                        </div>

                        {/* Legend & Ratios */}
                        <div className="flex-1 space-y-2.5">
                          {genderStats.segments.map((seg) => (
                            <div key={seg.key} className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`w-2.5 h-2.5 rounded-xs shrink-0 ${seg.bgClass}`}
                                  aria-hidden="true"
                                />
                                <span className="font-medium text-slate-700">{seg.key}</span>
                              </div>
                              <div className="font-mono text-xs text-slate-900 tabular-nums">
                                <strong>{seg.count}</strong>{' '}
                                <span className="text-slate-500">({seg.percent}%)</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Top Locations Summary */}
                    {summaryStats.topCities.length > 0 && (
                      <div className="pt-3 mt-3 border-t border-slate-100">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 mb-1.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          <span>Top Patient Locations</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
                          {summaryStats.topCities.map((c, i) => (
                            <React.Fragment key={c.name}>
                              {i > 0 && <span aria-hidden="true" className="text-slate-300">·</span>}
                              <span className="tabular-nums">
                                <strong className="font-semibold text-slate-800">{c.name}</strong> ({c.count})
                              </span>
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Column 3 (4 cols): Age Group Distribution Vertical Bar Chart */}
                  <div className="lg:col-span-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-4 h-4 text-teal-700" />
                          <h3 className="text-xs font-bold text-slate-900">
                            Age Group Distribution
                          </h3>
                        </div>
                        <span className="text-[11px] text-slate-400 tabular-nums">
                          {ageStats.averageAge !== null ? `Avg ${ageStats.averageAge} yrs` : 'By age group'}
                        </span>
                      </div>

                      {/* Vertical Column Chart */}
                      <div className="h-36 pt-4 pb-1 px-2 bg-slate-50/70 rounded-lg border border-slate-200/70 flex items-end justify-between gap-2">
                        {ageStats.cohorts.map((cohort) => (
                          <div
                            key={cohort.label}
                            className="flex-1 flex flex-col items-center h-full justify-end group"
                            title={`${cohort.rangeLabel}: ${cohort.count} patients (${cohort.percent}%)`}
                          >
                            <div className="text-[10px] font-mono font-bold text-slate-700 tabular-nums mb-1">
                              {cohort.count}
                            </div>
                            <div className="w-full max-w-[36px] bg-slate-200/70 rounded-t-sm flex items-end h-20 overflow-hidden">
                              <div
                                className="w-full bg-teal-600 group-hover:bg-teal-700 rounded-t-sm transition-all duration-200"
                                style={{ height: `${cohort.heightPercent}%` }}
                              />
                            </div>
                            <div className="text-[10px] font-semibold text-slate-600 mt-1.5 whitespace-nowrap tabular-nums">
                              {cohort.label}
                            </div>
                            <div className="text-[9px] text-slate-400 font-mono tabular-nums">
                              {cohort.percent}%
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                      <span>Dominant Age Cohort</span>
                      <span className="font-semibold text-slate-800 tabular-nums">
                        {[...ageStats.cohorts].sort((a, b) => b.count - a.count)[0]?.rangeLabel || '—'}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
