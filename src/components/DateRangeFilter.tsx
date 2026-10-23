import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { DatePreset } from "@/hooks/useDateFilter";

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
