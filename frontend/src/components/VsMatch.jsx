import { memo } from "react";
import { Crest, LiveDot, matchDateLabel, matchTime, DIVISION_LABEL } from "./PublicUI";

// VS match row (Oct 2026, from the Super Admin's "vs sample ui"), shared by the
// public Matches and Home pages. ONE game per row, like the picture:
//
//   [crest] [angled name banner]    9:00 AM     [angled name banner] [crest]
//           [ light strip: info ]    Oct 2      [ light strip: info ]
//
// Banners are a blue gradient (steel-navy + yellow theme) slanted on the edge
// that faces the centre. Both strips say the stage (group + round), Oct 31 2026;
// it used to be on the right only. Finished: winner green / loser red, loser greyed.

// Quarters in basketball, sets in the rally sports.
const PERIOD_PREFIX = { Basketball: "Q", Volleyball: "S", Badminton: "S", Pickleball: "S" };

const isDone = (m) => m.status === "completed" || m.status === "forfeited";
const stageOf = (m) => [m.group ? `Group ${m.group}` : null, m.roundLabel].filter(Boolean).join(" · ");

const CLIP = {
  left: "polygon(0 0, 100% 0, calc(100% - 16px) 100%, 0 100%)",
  right: "polygon(0 0, 100% 0, 100% 100%, 16px 100%)",
};

function Banner({ team, side, tone, info }) {
  const right = side === "right";
  const empty = !team;
  const lose = tone === "lose";
  const bg = empty
    ? "bg-[#161B18]"
    : lose
    ? "bg-gradient-to-r from-[#334155] to-[#283447]"
    : right
    ? "bg-gradient-to-l from-[#15803D] to-[#22C55E]"
    : "bg-gradient-to-r from-[#15803D] to-[#22C55E]";
  return (
    <div className="flex-1 min-w-0" style={{ clipPath: CLIP[side] }}>
      <div className={`${bg} ${right ? "pl-4 sm:pl-6 pr-2 sm:pr-3 text-right" : "pl-2 sm:pl-3 pr-4 sm:pr-6"} py-2 sm:py-2.5`}>
        <div className={`text-[12px] sm:text-[16px] leading-tight line-clamp-2 [overflow-wrap:anywhere] sm:[overflow-wrap:normal] ${
          empty ? "text-slate-500 italic" : `font-bold uppercase sm:tracking-wide ${lose ? "text-slate-300" : "text-white"}`
        }`}>
          {team ? team.name : "Awaiting opponent"}
        </div>
      </div>
      <div className={`${right ? "pl-6 pr-3 text-right" : "pl-3 pr-6"} h-1 sm:h-auto sm:py-0.5 text-[0px] sm:text-[10px] font-bold uppercase tracking-wider truncate ${
        empty ? "bg-[#242C27] text-slate-500" : lose ? "bg-slate-500/50 text-slate-200" : "bg-slate-100 text-[#0A0C0B]"
      }`}>
        {info || " "}
      </div>
    </div>
  );
}

function Side({ team, side, tone, info }) {
  const right = side === "right";
  return (
    <div className={`flex flex-col sm:flex-row items-center gap-2 sm:gap-3 min-w-0 ${right ? "sm:flex-row-reverse" : ""}`}>
      <div className={`relative shrink-0 ${tone === "lose" ? "opacity-50 grayscale" : ""}`}>
        {team ? (
          // ONE crest that resizes with CSS (it used to render two and hide one).
          <div className="relative size-[38px] sm:size-[56px] overflow-hidden rounded">
            <Crest name={team.name} barangayId={team.barangayId} variant="cover" coverText={14} />
          </div>
        ) : (
          <span className="block size-[38px] sm:size-[56px] rounded-lg border border-dashed border-[#303A34]" />
        )}
        {tone === "win" && (
          <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded px-1 text-[9px] sm:text-[10px] font-bold uppercase tracking-wide bg-emerald-500 text-[#0A0C0B]">
            Won
          </span>
        )}
      </div>
      <div className="w-full sm:w-auto sm:flex-1 min-w-0 flex"><Banner team={team} side={side} tone={tone} info={info} /></div>
    </div>
  );
}

// showDate: put the date under the time (Home's "Today" doesn't need it).
// Memoised on the match's CONTENT: a poll hands back new objects every 10s,
// and only rows whose data actually changed should redraw.
export const VsMatchRow = memo(VsMatchRowImpl, (a, b) =>
  a.showDate === b.showDate && (a.m === b.m || JSON.stringify(a.m) === JSON.stringify(b.m)));

function VsMatchRowImpl({ m, showDate = true }) {
  const live = m.status === "ongoing";
  const done = isDone(m);
  const aWon = done && m.winner && String(m.winner) === String(m.teamA?.id);
  const bWon = done && m.winner && String(m.winner) === String(m.teamB?.id);
  const tone = (won, other) => (won ? "win" : other ? "lose" : null);
  const time = matchTime(m.schedule);
  // End time (Nov 2026): a smaller "to 8:00 AM" under the big start time (a full range in the
  // big Anton figure is too wide for the centre column on a phone).
  const endTime = time && m.scheduleEnd ? matchTime(m.scheduleEnd) : null;
  const scoreTone = (won, lost) => (won ? "text-emerald-400" : lost ? "text-red-400" : "text-white");
  const date = m.schedule ? matchDateLabel(m.schedule) : null;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-5">
      {/* The competition label is in the centre; both strips carry the stage. */}
      <Side team={m.teamA} side="left" tone={tone(aWon, bWon)} info={stageOf(m)} />

      <div className="flex flex-col items-center text-center min-w-[56px] sm:min-w-[110px]">
        {/* Sport · division, centred over the time / score. Two short lines on a phone. */}
        <div className="-mt-1 mb-3 sm:-mt-2 sm:mb-4 flex flex-col sm:flex-row sm:gap-1.5 items-center text-[11px] sm:text-[13px] font-bold uppercase tracking-wide leading-tight text-slate-100">
          <span>{m.sport}</span>
          <span className="hidden sm:inline text-slate-500">·</span>
          <span className="text-slate-300">{DIVISION_LABEL[m.division] || m.division}</span>
        </div>
        {live || done ? (
          <div className="text-[24px] sm:text-[36px] leading-none tabular-nums" style={{ fontFamily: "Anton, sans-serif" }}>
            <span className={done ? scoreTone(aWon, bWon) : "text-white"}>{m.scoreA}</span>
            <span className="text-slate-500 px-1">:</span>
            <span className={done ? scoreTone(bWon, aWon) : "text-white"}>{m.scoreB}</span>
          </div>
        ) : (
          <div className={`leading-none tabular-nums ${time ? "text-white text-[22px] sm:text-[34px]" : "text-slate-400 text-[20px] sm:text-[26px]"}`}
            style={{ fontFamily: "Anton, sans-serif" }}>
            {time || "TBA"}
          </div>
        )}
        {!live && !done && endTime && (
          <div className="mt-1 text-[11px] sm:text-[13px] font-semibold tabular-nums text-slate-300">to {endTime}</div>
        )}
        <div className="mt-1.5 text-[10px] sm:text-[12px] font-semibold uppercase tracking-wide">
          {live ? (
            <span className="inline-flex items-center gap-1 text-red-400">
              <LiveDot />
              {m.totalPeriods > 1 ? `${PERIOD_PREFIX[m.sport] || "P"}${Math.min(m.periodsPlayed + 1, m.totalPeriods)}` : "Live"}
            </span>
          ) : done ? (
            <span className="text-slate-400">
              {m.status === "forfeited" ? "Forfeit" : "Final"}{showDate && date ? ` · ${date}` : ""}
            </span>
          ) : (
            <span className="text-[#4ADE80]">{showDate && date ? date : "VS"}</span>
          )}
        </div>
        {/* Venue under the VS (Super Admin request, Oct 2026). */}
        {/* Bold + a yellow pin so it reads at a glance (Super Admin, Oct 2026). */}
        {m.venue && (
          <div className="mt-1.5 flex items-start justify-center gap-1 max-w-[92px] sm:max-w-[170px] text-[11px] sm:text-[13px] font-bold leading-snug text-slate-100">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="mt-[1px] size-3 sm:size-3.5 shrink-0 fill-[#4ADE80]">
              <path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" />
            </svg>
            <span className="line-clamp-2 break-words">{m.venue}</span>
          </div>
        )}
      </div>

      <Side team={m.teamB} side="right" tone={tone(bWon, aWon)} info={stageOf(m)} />
      {(live || done) && m.periods?.length > 1 && (
        <div className="col-span-3 -mt-1 text-center text-[11px] text-slate-500 tabular-nums">
          {m.periods.map((p) => `${p.a}-${p.b}`).join(" · ")}
        </div>
      )}
    </div>
  );
}

// A stack of VS rows, centred and capped in width so banners don't stretch
// across a wide desktop.
export function VsMatchList({ matches, showDate = true, className = "" }) {
  return (
    <div className={`mx-auto w-full max-w-5xl flex flex-col gap-7 sm:gap-9 ${className}`}>
      {matches.map((m) => <VsMatchRow key={m.id} m={m} showDate={showDate} />)}
    </div>
  );
}

// Loading placeholder shaped like the VS rows, shown the moment a sport tab is
// switched (the page used to freeze on the old list with no feedback).
export function VsMatchSkeleton({ rows = 5 }) {
  return (
    <div className="mx-auto w-full max-w-5xl flex flex-col gap-5 sm:gap-6" aria-busy="true" aria-label="Loading matches">
      <div className="h-9 w-56 rounded-xl bg-white/[0.06] animate-pulse" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-5">
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3">
            <div className="size-[38px] sm:size-[56px] shrink-0 rounded bg-white/[0.07] animate-pulse" />
            <div className="h-9 sm:h-12 w-full rounded bg-white/[0.07] animate-pulse" />
          </div>
          <div className="flex flex-col items-center gap-2 min-w-[56px] sm:min-w-[110px]">
            <div className="h-6 sm:h-8 w-14 sm:w-20 rounded bg-white/[0.08] animate-pulse" />
            <div className="h-3 w-8 rounded bg-white/[0.06] animate-pulse" />
          </div>
          <div className="flex flex-col sm:flex-row-reverse items-center gap-2 sm:gap-3">
            <div className="size-[38px] sm:size-[56px] shrink-0 rounded bg-white/[0.07] animate-pulse" />
            <div className="h-9 sm:h-12 w-full rounded bg-white/[0.07] animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}
