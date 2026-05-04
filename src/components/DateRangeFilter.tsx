import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  format, startOfDay, endOfDay, subDays,
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

interface Props {
  preset: DatePreset;
  onPresetChange: (p: DatePreset) => void;
  customFrom: Date;
  customTo: Date;
  onCustomFromChange: (d: Date) => void;
  onCustomToChange: (d: Date) => void;
}

export function DateRangeFilter({ preset, onPresetChange, customFrom, customTo, onCustomFromChange, onCustomToChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={preset} onValueChange={(v) => onPresetChange(v as DatePreset)}>
        <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All time</SelectItem>
          <SelectItem value="today">Today</SelectItem>
          <SelectItem value="yesterday">Yesterday</SelectItem>
          <SelectItem value="last_7">Last 7 days</SelectItem>
          <SelectItem value="last_30">Last 30 days</SelectItem>
          <SelectItem value="last_90">Last 90 days</SelectItem>
          <SelectItem value="this_week">This week</SelectItem>
          <SelectItem value="this_month">This month</SelectItem>
          <SelectItem value="last_month">Last month</SelectItem>
          <SelectItem value="this_quarter">This quarter</SelectItem>
          <SelectItem value="this_year">This year</SelectItem>
          <SelectItem value="last_365">Last 12 months</SelectItem>
          <SelectItem value="custom">Custom range…</SelectItem>
        </SelectContent>
      </Select>

      {preset === "custom" && (
        <>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="justify-start text-left font-normal w-[150px]">
                <CalendarIcon className="h-4 w-4 mr-2" />
                {format(customFrom, "dd MMM yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={customFrom} onSelect={(d) => d && onCustomFromChange(d)} initialFocus className={cn("p-3 pointer-events-auto")} />
            </PopoverContent>
          </Popover>
          <span className="text-muted-foreground text-sm">to</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="justify-start text-left font-normal w-[150px]">
                <CalendarIcon className="h-4 w-4 mr-2" />
                {format(customTo, "dd MMM yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={customTo} onSelect={(d) => d && onCustomToChange(d)} initialFocus className={cn("p-3 pointer-events-auto")} />
            </PopoverContent>
          </Popover>
        </>
      )}
    </div>
  );
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
