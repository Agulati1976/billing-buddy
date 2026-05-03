import { useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Mic, MicOff, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVoiceInput } from "@/hooks/useVoiceInput";

export interface SearchBarProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  /** When true, the spoken transcript fully replaces the input on final result. */
  voice?: boolean;
}

/**
 * Reusable search input with optional voice (Web Speech API) input.
 * Usable on any module list page.
 */
export function SearchBar({
  value,
  onChange,
  placeholder = "Search…",
  className,
  autoFocus,
  voice = true,
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const { listening, supported, toggle } = useVoiceInput({
    onResult: (text, isFinal) => {
      onChange(text);
      if (isFinal) inputRef.current?.focus();
    },
  });

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  return (
    <div className={cn("relative flex items-center w-full", className)}>
      <Search className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn("pl-9", voice ? "pr-20" : value ? "pr-10" : "pr-3")}
      />
      <div className="absolute right-1 flex items-center gap-0.5">
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onChange("")}
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
        {voice && supported && (
          <Button
            type="button"
            variant={listening ? "default" : "ghost"}
            size="icon"
            className={cn("h-8 w-8", listening && "animate-pulse")}
            onClick={toggle}
            aria-label={listening ? "Stop voice search" : "Start voice search"}
            title={listening ? "Listening… click to stop" : "Voice search"}
          >
            {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>
        )}
      </div>
    </div>
  );
}
