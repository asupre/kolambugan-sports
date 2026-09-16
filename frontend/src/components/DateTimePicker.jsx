import { useState } from "react";
import { CalendarIcon, Clock } from "lucide-react";
import { Button } from "./ui/button";
import { Calendar } from "./ui/calendar";
import { Input } from "./ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { cn } from "../lib/utils";

const pad = (n) => String(n).padStart(2, "0");

// Both pickers read/write the exact "YYYY-MM-DD" / "YYYY-MM-DDTHH:mm" strings
// the native date / datetime-local inputs used to — the server's parseManila()
// reads that shape as Philippine local time with no timezone attached, so
// nothing downstream (schedule saves, birthdate saves) needed to change.
function parseDateOnly(value) {
  if (!value) return undefined;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDateOnly(date) {
  if (!date) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function DatePicker({ value, onChange, placeholder = "Pick a date", className, disabled }) {
  const [open, setOpen] = useState(false);
  const date = parseDateOnly(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn("justify-start font-normal w-full", !date && "text-muted-foreground", className)}
        >
          <CalendarIcon className="size-4" />
          {date ? date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => { onChange(formatDateOnly(d)); setOpen(false); }}
        />
      </PopoverContent>
    </Popover>
  );
}

function splitDateTime(value) {
  if (!value) return { date: undefined, time: "" };
  const [d, t] = value.split("T");
  return { date: parseDateOnly(d), time: t || "" };
}

function joinDateTime(date, time) {
  if (!date) return "";
  return `${formatDateOnly(date)}T${time || "00:00"}`;
}

export function DateTimePicker({ value, onChange, placeholder = "Pick date & time", className, disabled }) {
  const [open, setOpen] = useState(false);
  const { date, time } = splitDateTime(value);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn("justify-start font-normal flex-1 min-w-0", !date && "text-muted-foreground")}
          >
            <CalendarIcon className="size-4 shrink-0" />
            <span className="truncate">
              {date ? date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : placeholder}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0">
          <Calendar
            mode="single"
            selected={date}
            onSelect={(d) => { onChange(joinDateTime(d, time)); setOpen(false); }}
          />
        </PopoverContent>
      </Popover>
      <div className="relative shrink-0">
        <Clock className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="time"
          value={time}
          disabled={disabled || !date}
          onChange={(e) => onChange(joinDateTime(date || new Date(), e.target.value))}
          className="w-28 pl-8 [&::-webkit-calendar-picker-indicator]:hidden"
        />
      </div>
    </div>
  );
}
