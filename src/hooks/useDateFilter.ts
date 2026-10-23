import { useMemo } from "react";
import {
  startOfDay, endOfDay, subDays,
  startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths,
  startOfQuarter, endOfQuarter, startOfYear, endOfYear,
} from "date-fns";

export type DatePreset =
  | "all" | "today" | "yesterday"
  | "last_7" | "last_30" | "last_90"
  | "this_week" | "this_month" | "last_month"
  | "this_quarter" | "this_year" | "last_365"
  | "custom";

export interface DateRange { from: Date | null; to: Date | null; label: string; }

export function rangeFor(preset: DatePreset, custom: { from: Date; to: Date }): DateRange {
  const now = new Date();
  switch (preset) {
    case "all":          return { from: null, to: null, label: "All time" };
    case "today":        return { from: startOfDay(now), to: endOfDay(now), label: "Today" };
    case "yesterday":    { const y = subDays(now, 1); return { from: startOfDay(y), to: endOfDay(y), label: "Yesterday" }; }
    case "last_7":       return { from: startOfDay(subDays(now, 6)), to: endOfDay(now), label: "Last 7 days" };
    case "last_30":      return { from: startOfDay(subDays(now, 29)), to: endOfDay(now), label: "Last 30 days" };
    case "last_90":      return { from: startOfDay(subDays(now, 89)), to: endOfDay(now), label: "Last 90 days" };
    case "this_week":    return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }), label: "This week" };
    case "this_month":   return { from: startOfMonth(now), to: endOfMonth(now), label: "This month" };
    case "last_month":   { const lm = subMonths(now, 1); return { from: startOfMonth(lm), to: endOfMonth(lm), label: "Last month" }; }
    case "this_quarter": return { from: startOfQuarter(now), to: endOfQuarter(now), label: "This quarter" };
    case "this_year":    return { from: startOfYear(now), to: endOfYear(now), label: "This year" };
    case "last_365":     return { from: startOfDay(subDays(now, 364)), to: endOfDay(now), label: "Last 12 months" };
    case "custom":       return { from: startOfDay(custom.from), to: endOfDay(custom.to), label: "Custom" };
  }
}

export function useDateFilter<T>(rows: T[], getDate: (r: T) => string | Date | null | undefined, range: DateRange): T[] {
  return useMemo(() => {
    if (!range.from || !range.to) return rows;
    const from = range.from.getTime();
    const to = range.to.getTime();
    return rows.filter((r) => {
      const d = getDate(r);
      if (!d) return false;
      const t = new Date(d).getTime();
      return t >= from && t <= to;
    });
  }, [rows, range.from, range.to, getDate]);
}
