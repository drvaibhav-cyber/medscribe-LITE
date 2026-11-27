import React, { useState } from 'react';
import {
  Calendar,
  FlaskConical,
  ScanLine,
  Trash2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { Consultation } from '../types/opd';
import {
  buildDateWiseInvestigationTable,
  MAX_PRINT_INVESTIGATION_DATES,
} from '../utils/investigationUtils';

interface DateWiseInvestigationTableProps {
  consultation: Consultation;
  allConsultations?: Consultation[];
  compact?: boolean;
  printMode?: boolean;
  printScope?: 'whole-table' | 'latest-only';
  defaultCollapsed?: boolean;
  onRemoveParameterOnDate?: (isoDate: string, parameterName: string) => void;
}

export const DateWiseInvestigationTable: React.FC<DateWiseInvestigationTableProps> = ({
  consultation,
  allConsultations = [],
  compact = false,
  printMode = false,
  printScope = 'whole-table',
  defaultCollapsed = false,
  onRemoveParameterOnDate,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  const tableData = React.useMemo(
    () => buildDateWiseInvestigationTable(consultation, allConsultations),
    [consultation, allConsultations]
  );

  // Filter dates, labRows, and imagingTimeline for printMode (max latest 5 dates in print whole-table mode, or 1 date in latest-only mode; uncapped in record view)
  const effectiveData = React.useMemo(() => {
    if (tableData.rows.length === 0 || tableData.dates.length === 0) {
      return {
        dates: [],
        labDates: [],
        labRows: [],
        imagingTimeline: [],
      };
    }

    let allowedDates = tableData.dates;

    if (printScope === 'latest-only') {
      const matchingConsultationDate = tableData.dates.find(
        (d) => d.isoDate === consultation.date
      );
      const targetDate =
        matchingConsultationDate || tableData.dates[tableData.dates.length - 1];
      allowedDates = [targetDate];
    } else if (printMode && tableData.dates.length > MAX_PRINT_INVESTIGATION_DATES) {
      // In printMode with 'whole-table', cap to the latest 5 dates for clean printing
      allowedDates = tableData.dates.slice(-MAX_PRINT_INVESTIGATION_DATES);
    }

    const allowedIsoSet = new Set(allowedDates.map((d) => d.isoDate));

    const filteredLabRows = tableData.labRows.filter((r) =>
      allowedDates.some((d) => Boolean(r.valuesByDate[d.isoDate]?.value))
    );

    const labDatesWithValues = allowedDates.filter((d) =>
      filteredLabRows.some((r) => Boolean(r.valuesByDate[d.isoDate]?.value))
    );

    const filteredImagingTimeline = tableData.imagingTimeline.filter((img) =>
      allowedIsoSet.has(img.isoDate)
    );

    // Fallback if latest-only consultation.date had no entries on that exact date
    if (
      printScope === 'latest-only' &&
      filteredLabRows.length === 0 &&
      filteredImagingTimeline.length === 0 &&
      tableData.dates.length > 0
    ) {
      const lastDate = tableData.dates[tableData.dates.length - 1];
      const fallbackLabs = tableData.labRows.filter((r) =>
        Boolean(r.valuesByDate[lastDate.isoDate]?.value)
      );
      const fallbackImg = tableData.imagingTimeline.filter(
        (img) => img.isoDate === lastDate.isoDate
      );
      return {
        dates: [lastDate],
        labDates: fallbackLabs.length > 0 ? [lastDate] : [],
        labRows: fallbackLabs,
        imagingTimeline: fallbackImg,
      };
    }

    return {
      dates: allowedDates,
      labDates: labDatesWithValues,
      labRows: filteredLabRows,
      imagingTimeline: filteredImagingTimeline,
    };
  }, [tableData, printScope, printMode, consultation.date]);

  if (
    effectiveData.labRows.length === 0 &&
    effectiveData.imagingTimeline.length === 0
  ) {
    return null;
  }

  const hasLabRows = effectiveData.labRows.length > 0 && effectiveData.labDates.length > 0;
  const totalCols = hasLabRows ? 1 + effectiveData.labDates.length : 1;

  if (printMode) {
    const isSingleLabDate = effectiveData.labDates.length === 1;
    const hasImaging = effectiveData.imagingTimeline.length > 0;
    const hasLongLabValue = effectiveData.labRows.some((r) =>
      effectiveData.labDates.some((d) => (r.valuesByDate[d.isoDate]?.value || '').length > 18)
    );
    const useFullWidthFixedTable =
      effectiveData.labDates.length >= 2 || hasImaging || hasLongLabValue;

    const totalBullets = effectiveData.imagingTimeline.reduce(
      (acc, img) => acc + img.bullets.length,
      0
    );
    const totalVisualRows =
      effectiveData.labRows.length + effectiveData.imagingTimeline.length * 1.5 + totalBullets;
    const isVeryDensePrint = totalVisualRows >= 10;
    const isDensePrint =
      isVeryDensePrint ||
      totalVisualRows >= 6 ||
      effectiveData.labDates.length >= 2 ||
      hasImaging;

    const tableTextSize = isVeryDensePrint
      ? 'text-[8.5px] leading-tight'
      : isDensePrint
      ? 'text-[9px] leading-snug'
      : 'text-[10px] leading-snug';

    const cellPad = isVeryDensePrint
      ? 'py-0.5 px-1.5'
      : isDensePrint
      ? 'py-0.5 px-2'
      : 'py-1 px-2.5';

    const labDateCount = effectiveData.labDates.length;
    const invColWidthClass = useFullWidthFixedTable
      ? labDateCount >= 5
        ? 'w-[25%]'
        : labDateCount === 4
        ? 'w-[28%]'
        : labDateCount === 3
        ? 'w-[34%]'
        : labDateCount === 2
        ? 'w-[42%]'
        : 'w-[52%]'
      : 'w-auto';

    const dateColWidthClass = useFullWidthFixedTable
      ? labDateCount >= 5
        ? 'w-[15%]'
        : labDateCount === 4
        ? 'w-[18%]'
        : labDateCount === 3
        ? 'w-[22%]'
        : labDateCount === 2
        ? 'w-[29%]'
        : 'w-[48%]'
      : 'w-auto';

    return (
      <div
        className={`${
          useFullWidthFixedTable ? 'block w-full' : 'inline-block'
        } max-w-full border border-slate-400 rounded overflow-hidden mt-0.5`}
      >
        <table
          className={`${
            useFullWidthFixedTable ? 'w-full table-fixed' : 'w-auto'
          } max-w-full text-left border-collapse ${tableTextSize}`}
        >
          {hasLabRows && (
            <thead>
              <tr className="bg-slate-100 border-b border-slate-400 text-slate-900 font-bold">
                <th
                  className={`${cellPad} border-r border-slate-300 ${invColWidthClass} break-words`}
                >
                  Investigation
                </th>
                {effectiveData.labDates.map((d) => (
                  <th
                    key={d.isoDate}
                    className={`${cellPad} border-r border-slate-300 last:border-r-0 font-mono text-center whitespace-nowrap ${dateColWidthClass}`}
                  >
                    {d.displayDate}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody className="divide-y divide-slate-300">
            {/* Top Matrix: Lab Parameters */}
            {hasLabRows &&
              effectiveData.labRows.map((row) => (
                <tr key={row.key}>
                  <td
                    className={`${cellPad} border-r border-slate-300 font-bold text-slate-900 align-top break-words whitespace-normal`}
                  >
                    <div className="flex items-start gap-1">
                      <span className="uppercase text-[7.5px] px-1 py-0.2 rounded bg-slate-200 text-slate-800 font-mono shrink-0 mt-0.5">
                        LAB
                      </span>
                      <span className="break-words">{row.parameterName}</span>
                    </div>
                  </td>
                  {effectiveData.labDates.map((d) => {
                    const cell = row.valuesByDate[d.isoDate];
                    const valText = cell?.value || '—';
                    const isShortValue = valText.length <= 16;
                    return (
                      <td
                        key={d.isoDate}
                        className={`${cellPad} border-r border-slate-300 last:border-r-0 text-slate-900 font-medium align-top break-words whitespace-normal ${
                          isShortValue
                            ? 'text-center font-mono font-semibold'
                            : 'text-left leading-tight'
                        }`}
                      >
                        {valText}
                      </td>
                    );
                  })}
                </tr>
              ))}

            {/* Bottom Section: Imaging Investigations — One Below the Other with Dates using Whole Row */}
            {effectiveData.imagingTimeline.map((imgEntry, idx) => (
              <tr
                key={imgEntry.key}
                className={
                  idx === 0 && hasLabRows
                    ? 'border-t-2 border-slate-400 bg-slate-50/70'
                    : 'bg-slate-50/50'
                }
              >
                <td
                  colSpan={totalCols}
                  className={`${
                    isVeryDensePrint ? 'py-1 px-1.5' : 'py-1 px-2'
                  } text-slate-900 align-top break-words whitespace-normal`}
                >
                  <div
                    className={`font-bold ${
                      isVeryDensePrint ? 'text-[8.5px]' : 'text-[9px]'
                    } text-slate-900 flex items-center gap-1 border-b border-slate-300 pb-0.5 mb-0.5 flex-wrap`}
                  >
                    <span className="uppercase text-[7.5px] px-1 rounded bg-slate-200 text-slate-900 font-mono shrink-0">
                      IMG
                    </span>
                    <span>
                      {imgEntry.studyName} &mdash;{' '}
                      <span className="font-mono underline decoration-slate-400 underline-offset-2">
                        {imgEntry.displayDate}
                      </span>
                    </span>
                  </div>
                  <ul className="space-y-0.5 pl-1">
                    {imgEntry.bullets.map((b, bIdx) => (
                      <li
                        key={bIdx}
                        className={`${
                          isVeryDensePrint
                            ? 'text-[8px] leading-tight'
                            : 'text-[8.5px] leading-snug'
                        } font-medium text-slate-900 flex items-start gap-1 break-words whitespace-normal`}
                      >
                        <span className="font-bold text-slate-700 shrink-0">&bull;</span>
                        <span className="break-words min-w-0 flex-1">{b}</span>
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const labCount = effectiveData.labRows.length;
  const imagingCount = effectiveData.imagingTimeline.length;

  return (
    <div
      className={`rounded-xl border overflow-hidden bg-white shadow-2xs ${
        compact ? 'border-sky-200/90 text-[10.5px]' : 'border-sky-300 text-xs'
      }`}
    >
      {/* Collapsible Header Bar (Closed by default) */}
      <button
        type="button"
        onClick={() => setIsCollapsed((prev) => !prev)}
        className={`w-full flex items-center justify-between text-left transition-colors cursor-pointer select-none ${
          !isCollapsed ? 'border-b' : ''
        } ${
          compact
            ? 'px-2.5 py-1.5 bg-sky-100/80 hover:bg-sky-100 border-sky-200 text-[10px]'
            : 'px-3 py-2 bg-gradient-to-r from-sky-900 via-sky-800 to-teal-900 hover:from-sky-800 hover:to-teal-800 text-white text-[11px]'
        }`}
        title={isCollapsed ? 'Click to open investigation table' : 'Click to close investigation table'}
      >
        <div className="flex items-center gap-1.5 font-bold">
          {isCollapsed ? (
            <ChevronRight className={`w-3.5 h-3.5 shrink-0 ${compact ? 'text-sky-700' : 'text-sky-300'}`} />
          ) : (
            <ChevronDown className={`w-3.5 h-3.5 shrink-0 ${compact ? 'text-sky-700' : 'text-sky-300'}`} />
          )}
          <Calendar className={`w-3.5 h-3.5 shrink-0 ${compact ? 'text-sky-700' : 'text-sky-300'}`} />
          <span className={compact ? 'text-sky-950' : 'text-white'}>
            Lab &amp; Imaging Table ({effectiveData.dates.length}{' '}
            {effectiveData.dates.length === 1 ? 'Date' : 'Dates'})
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span
            className={`px-1.5 py-0.5 rounded font-mono text-[9.5px] font-semibold ${
              compact ? 'bg-white text-sky-900 border border-sky-200' : 'bg-sky-950/70 text-sky-200'
            }`}
          >
            {labCount} Lab &bull; {imagingCount} Imaging
          </span>
          <span
            className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
              compact
                ? 'bg-sky-200/80 text-sky-900'
                : 'bg-white/15 text-white'
            }`}
          >
            {isCollapsed ? 'Open' : 'Close'}
          </span>
        </div>
      </button>

      {/* Collapsible Table Body */}
      {!isCollapsed && (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            {hasLabRows && (
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold text-[10.5px] uppercase tracking-wider">
                  <th className="py-1.5 px-2.5 border-r border-slate-200 min-w-[145px]">
                    Lab Investigation
                  </th>
                  {effectiveData.labDates.map((d) => (
                    <th
                      key={d.isoDate}
                      className="py-1.5 px-2.5 border-r border-slate-200 last:border-r-0 font-mono text-sky-950 bg-sky-50/60 min-w-[100px]"
                    >
                      <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-600 shrink-0" />
                        <span>{d.displayDate}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody className="divide-y divide-slate-100">
              {/* Top Matrix: Lab Parameters across Dates */}
              {hasLabRows &&
                effectiveData.labRows.map((row) => (
                  <tr key={row.key} className="hover:bg-sky-50/30 transition-colors">
                    <td className="py-1.5 px-2.5 border-r border-slate-200 font-semibold text-slate-900 align-top">
                      <div className="flex items-start gap-1.5">
                        <FlaskConical className="w-3.5 h-3.5 text-sky-600 shrink-0 mt-0.5" />
                        <div>
                          <div className="leading-snug">{row.parameterName}</div>
                          {row.panelOrStudy && row.panelOrStudy !== row.parameterName && (
                            <span className="text-[9px] font-mono uppercase text-slate-400">
                              {row.panelOrStudy}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    {effectiveData.labDates.map((d) => {
                      const cell = row.valuesByDate[d.isoDate];
                      const isAbnormal =
                        cell?.flag &&
                        ['high', 'low', 'abnormal'].includes(cell.flag.toLowerCase());
                      return (
                        <td
                          key={d.isoDate}
                          className="py-1.5 px-2.5 border-r border-slate-100 last:border-r-0 align-top font-mono font-semibold text-slate-900"
                        >
                          {cell ? (
                            <div className="flex items-start justify-between gap-1 group/cell">
                              <div className="space-y-0.5">
                                <span
                                  className={
                                    isAbnormal
                                      ? 'text-rose-700 font-bold bg-rose-50 px-1 py-0.2 rounded border border-rose-200'
                                      : ''
                                  }
                                >
                                  {cell.value}
                                </span>
                                {cell.flag && isAbnormal && (
                                  <span className="ml-1 text-[9px] font-sans font-bold uppercase text-rose-600">
                                    ({cell.flag})
                                  </span>
                                )}
                              </div>
                              {onRemoveParameterOnDate && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onRemoveParameterOnDate(d.isoDate, row.parameterName)
                                  }
                                  className="opacity-0 group-hover/cell:opacity-100 p-0.5 text-slate-400 hover:text-rose-600 rounded transition-opacity"
                                  title="Remove this entry"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-300 font-normal">&mdash;</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}

              {/* Bottom Section: Imaging Investigations — One Below the Other with Dates using Whole Row */}
              {effectiveData.imagingTimeline.map((imgEntry, idx) => (
                <tr
                  key={imgEntry.key}
                  className={`${
                    idx === 0 && hasLabRows
                      ? 'border-t-2 border-purple-200 bg-purple-50/40'
                      : 'border-t border-purple-100 bg-purple-50/30'
                  } hover:bg-purple-50/60 transition-colors`}
                >
                  <td colSpan={totalCols} className="py-2 px-3 align-top">
                    <div className="flex items-center justify-between border-b border-purple-200/80 pb-1 mb-1.5">
                      <div className="flex items-center gap-1.5 font-bold text-purple-950">
                        <ScanLine className="w-3.5 h-3.5 text-purple-700 shrink-0" />
                        <span>{imgEntry.studyName}</span>
                        <span className="text-purple-400">&mdash;</span>
                        <span className="font-mono text-purple-900 underline decoration-purple-400 underline-offset-2">
                          {imgEntry.displayDate}
                        </span>
                      </div>
                      {onRemoveParameterOnDate && (
                        <button
                          type="button"
                          onClick={() =>
                            onRemoveParameterOnDate(imgEntry.isoDate, imgEntry.studyName)
                          }
                          className="p-0.5 text-slate-400 hover:text-rose-600 rounded"
                          title="Remove this imaging entry"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <ul className="space-y-1 pl-3">
                      {imgEntry.bullets.map((bullet, bIdx) => (
                        <li
                          key={bIdx}
                          className="text-slate-800 font-medium leading-snug flex items-start gap-2"
                        >
                          <span className="text-purple-700 font-bold shrink-0">&bull;</span>
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
