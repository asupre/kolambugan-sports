import { useState } from "react";
import { CalendarIcon, Clock } from "lucide-react";
import { Button } from "./ui/button";
import { Calendar } from "./ui/calendar";
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

export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  className,
  disabled,
  captionLayout = "label",
  disableFuture = false,
}) {
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
          captionLayout={captionLayout}
          selected={date}
          defaultMonth={date}
          onSelect={(d) => { onChange(formatDateOnly(d)); setOpen(false); }}
          disabled={disableFuture ? { after: new Date() } : undefined}
        />
      </PopoverContent>
    </Popover>
  );
}

function splitDateTime(value) {
  if (!value) return { date: undefined, time: "" };
  const [d, t] = value.split("T");
  // "00:00" is how a date saved without a time comes back — treat it as no time.
  return { date: parseDateOnly(d), time: t && t !== "00:00" ? t.slice(0, 5) : "" };
}

function joinDateTime(date, time) {
  if (!date) return "";
  return `${formatDateOnly(date)}T${time || "00:00"}`;
}

// Game times offered as one-tap slots: every 30 minutes, 6:00 AM to 10:00 PM.
const TIME_SLOTS = [];
for (let h = 6; h <= 22; h++) {
  TIME_SLOTS.push(`${pad(h)}:00`);
  if (h < 22) TIME_SLOTS.push(`${pad(h)}:30`);
}

function formatTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${pad(m)} ${h < 12 ? "AM" : "PM"}`;
}

// Date AND time in one popup: pick a day (the popup stays open), then tap a
// time slot. It used to close on the day and leave a tiny native time box
// beside it, which was fiddly to type into and started on the current month.
export function DateTimePicker({ value, onChange, placeholder = "Pick date & time", className, disabled }) {
  const [open, setOpen] = useState(false);
  const { date, time } = splitDateTime(value);
  // A saved time that isn't on the half hour still shows up (and stays selected).
  const slots = time && !TIME_SLOTS.includes(time) ? [...TIME_SLOTS, time].sort() : TIME_SLOTS;
  const thisYear = new Date().getFullYear();

  const label = date
    ? date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) +
      (time ? ` · ${formatTime(time)}` : "")
    : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn("justify-start font-normal min-w-[13rem]", !date && "text-muted-foreground", className)}
        >
          <CalendarIcon className="size-4 shrink-0" />
          <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex flex-col sm:flex-row">
          <Calendar
            mode="single"
            captionLayout="dropdown"
            startMonth={new Date(thisYear - 1, 0)}
            endMonth={new Date(thisYear + 2, 11)}
            selected={date}
            defaultMonth={date}
            onSelect={(d) => d && onChange(joinDateTime(d, time))}
          />
          <div className="border-t sm:border-t-0 sm:border-l flex flex-col sm:w-32">
            <div className="flex items-center gap-1.5 px-3 pt-3 pb-2 text-xs font-medium text-muted-foreground">
              <Clock className="size-3.5" /> {date ? "Time" : "Pick a day first"}
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-1 gap-1 px-2 pb-2 max-h-40 sm:max-h-[17rem] overflow-y-auto scrollbar-thin">
              {slots.map((t) => (
                <Button
                  key={t}
                  type="button"
                  size="sm"
                  variant={t === time ? "default" : "ghost"}
                  disabled={!date}
                  onClick={() => { onChange(joinDateTime(date, t)); setOpen(false); }}
                  className="h-8 justify-center text-xs font-normal"
                >
                  {formatTime(t)}
                </Button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange(joinDateTime(new Date(), time))}>
            Today
          </Button>
          <div className="flex gap-1">
            {date && time && (
              <Button type="button" size="sm" variant="ghost" onClick={() => onChange(joinDateTime(date, ""))}>
                No time
              </Button>
            )}
            {value && (
              <Button type="button" size="sm" variant="ghost" onClick={() => onChange("")}>
                Clear
              </Button>
            )}
            <Button type="button" size="sm" onClick={() => setOpen(false)}>Done</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
