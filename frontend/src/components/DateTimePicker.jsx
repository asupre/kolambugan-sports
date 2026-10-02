import { useState } from "react";
import { CalendarIcon, Clock } from "lucide-react";
import { Button } from "./ui/button";
import { Calendar } from "./ui/calendar";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { cn } from "../lib/utils";
import { useMediaQuery } from "../lib/useMediaQuery";

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

function formatTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${pad(m)} ${h < 12 ? "AM" : "PM"}`;
}

// The time: hour / minute / AM-PM dropdowns. Native selects on purpose, so a
// phone opens its own scroll wheel. Starts blank ("--") while no time is set;
// the first pick fills the rest in (minute :00, and PM for 12-6 since games
// are mostly played in the afternoon).
function TimeSelect({ time, disabled, onChange }) {
  const [h24, m] = time ? time.split(":").map(Number) : [null, null];
  const hour = h24 === null ? "" : h24 % 12 || 12;
  const ampm = h24 === null ? "" : h24 >= 12 ? "PM" : "AM";
  const minute = m === null ? "" : m;

  function set(hr, min, ap) {
    const h = Number(hr || 12);
    const isPm = ap ? ap === "PM" : h === 12 || h <= 6;
    onChange(pad((h % 12) + (isPm ? 12 : 0)) + ":" + pad(Number(min || 0)));
  }

  // text-base on phones: iOS zooms the page into any control under 16px.
  const sel = "h-10 sm:h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-base sm:text-sm disabled:opacity-50";
  return (
    <div className="flex flex-1 items-center gap-1.5">
      <select aria-label="Hour" className={sel} disabled={disabled} value={hour}
        onChange={(e) => set(e.target.value, minute, ampm)}>
        {hour === "" && <option value="">--</option>}
        {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <span className="text-muted-foreground">:</span>
      <select aria-label="Minute" className={sel} disabled={disabled} value={minute}
        onChange={(e) => set(hour, e.target.value, ampm)}>
        {minute === "" && <option value="">--</option>}
        {Array.from({ length: 60 }, (_, i) => i).map((n) => <option key={n} value={n}>{pad(n)}</option>)}
      </select>
      <select aria-label="AM or PM" className={sel} disabled={disabled} value={ampm}
        onChange={(e) => set(hour, minute, e.target.value)}>
        {ampm === "" && <option value="">--</option>}
        <option>AM</option>
        <option>PM</option>
      </select>
    </div>
  );
}

// Date AND time in one place: pick a day, set the time with the dropdowns,
// then Done. A popup on desktop; on a phone a centred dialog instead, since a
// popup anchored to a button deep in a scrolling list lands half off screen,
// and the calendar gets bigger day cells there.
export function DateTimePicker({ value, onChange, placeholder = "Pick date & time", className, disabled }) {
  const [open, setOpen] = useState(false);
  const isPhone = useMediaQuery("(max-width: 639px)");
  const { date, time } = splitDateTime(value);
  const thisYear = new Date().getFullYear();

  const label = date
    ? date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) +
      (time ? ` · ${formatTime(time)}` : "")
    : placeholder;

  const trigger = (
    <Button
      type="button"
      variant="outline"
      disabled={disabled}
      onClick={isPhone ? () => setOpen(true) : undefined}
      className={cn("justify-start font-normal w-full sm:w-auto sm:min-w-[13rem]", !date && "text-muted-foreground", className)}
    >
      <CalendarIcon className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
    </Button>
  );

  const body = (
    <>
      <Calendar
        mode="single"
        captionLayout="dropdown"
        startMonth={new Date(thisYear - 1, 0)}
        endMonth={new Date(thisYear + 2, 11)}
        selected={date}
        defaultMonth={date}
        onSelect={(d) => d && onChange(joinDateTime(d, time))}
        className={cn("mx-auto bg-transparent", isPhone && "[--cell-size:--spacing(10)]")}
      />
      <div className={cn("border-t px-3", isPhone ? "py-3 space-y-1.5" : "py-2 flex items-center gap-2")}>
        <p className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground" title={date ? undefined : "Pick a day first"}>
          <Clock className="size-3.5" /> {date || !isPhone ? "Time" : "Time (pick a day first)"}
        </p>
        <TimeSelect time={time} disabled={!date} onChange={(t) => onChange(joinDateTime(date, t))} />
      </div>
      <div className="flex items-center justify-between gap-1 border-t px-2 py-2">
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
    </>
  );

  if (isPhone) {
    return (
      <>
        {trigger}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent showCloseButton={false} aria-describedby={undefined} className="gap-0 p-0 max-w-[calc(100%-1.5rem)] max-h-[90dvh] overflow-y-auto overscroll-contain">
            <DialogTitle className="px-4 pt-3 pb-1 text-sm">Date &amp; time</DialogTitle>
            {body}
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        className="w-auto gap-0 p-0"
        align="start"
        collisionPadding={8}
      >
        {body}
      </PopoverContent>
    </Popover>
  );
}
