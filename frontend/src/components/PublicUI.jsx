// Shared primitives for the PUBLIC viewer (dark theme).
//
// NOTE: components/ui.jsx is the LIGHT admin set (white cards, indigo).
// Do not mix the two — nothing in ui.jsx works on this background.
//
// Crest is the SINGLE SWAP POINT for barangay logos. When the logo serve
// route exists, change it here and every public page picks it up at once.

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { hasTime } from "../lib/dashboardFormat";

export const DIVISION_LABEL = {
  open: "Open",
  boys: "Boys",
  girls: "Girls",
  under15: "U15",
  under30: "U30",
};

export const FORMAT_LABEL = {
  team: "Team",
  doubles: "Doubles",
  singles: "Singles",
};

export const initials = (name = "") =>
  name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

// ── Photo routes ────────────────────────────────────────────────────────────
// TODO(Jerico): confirm this against the real GridFS serve route.
// `?c=2`: a new URL so browsers drop copies cached under the old day-long rule
// (Sep 2026); the server now revalidates photos on every load (ETag + no-cache).
export const playerPhotoUrl = (id) => `/api/teams/players/${id}/photo?c=2`;

// Pending Hon. Reserva's decision on publishing minors' photos.
// Flip to false and every public photo falls back to a monogram — no other edits.
export const SHOW_PLAYER_PHOTOS = true;

// ── Components ──────────────────────────────────────────────────────────────

export const barangayLogoUrl = (id) => `/api/barangays/${id}/logo`;

// Which barangays actually have a logo, fetched once per page load. Without it
// every crest fires a request that 404s before falling back to the monogram —
// on a page with 26 barangays that's dozens of wasted round trips.
let logoPromise = null;
// The resolved set, kept so crests mounted AFTER the first load know the answer
// on their very first render (no monogram flash, no second render per crest —
// that was 2 renders x every crest on every page).
let logoSet = null;
function loadLogos() {
  if (!logoPromise) {
    logoPromise = fetch("/api/barangays")
      .then((r) => (r.ok ? r.json() : { barangays: [] }))
      .then((d) => new Set((d.barangays || []).filter((b) => b.hasLogo).map((b) => String(b._id))))
      .catch(() => new Set())
      .then((set) => { logoSet = set; return set; });
  }
  return logoPromise;
}

// Barangay crest. Falls back to a monogram when no logo is uploaded, or when the
// payload carries no barangay id. `variant="cover"` fills its parent COMPLETELY
// (absolute inset-0, object-cover) instead of sitting as a small fixed-size icon
// — for a poster-style card where the crest is the whole background and other
// content (a name, a scrim) sits on top of it. The parent must be `relative`
// with its own size/aspect-ratio; this variant doesn't set its own dimensions.
// coverText: monogram font size for the cover variant (small cover boxes need less than 32).
export function Crest({ name, barangayId, size = 40, variant = "icon", coverText = 32 }) {
  // null = still checking. Known at once when the logo list has already loaded.
  const [has, setHas] = useState(() => (!barangayId ? false : logoSet ? logoSet.has(String(barangayId)) : null));
  const [failed, setFailed] = useState(false);
  const cover = variant === "cover";

  useEffect(() => {
    if (!barangayId) { setHas(false); return; }
    if (logoSet) { setHas(logoSet.has(String(barangayId))); return; }
    let alive = true;
    loadLogos().then((set) => { if (alive) setHas(set.has(String(barangayId))); });
    return () => { alive = false; };
  }, [barangayId]);

  // Poster cards: while we don't yet know whether there's a logo, show the
  // blank tile rather than the monogram, so a card doesn't flash initials and
  // then swap to the photo a moment later.
  if (cover && has === null) {
    return <div className="absolute inset-0 bg-[#22344F]" />;
  }
  if (has && !failed) {
    return (
      <img
        src={barangayLogoUrl(barangayId)}
        alt=""
        // Decode off the main thread; poster cards scrolled off to the side of
        // a row only load when they come near the viewport.
        decoding="async"
        loading={cover ? "lazy" : undefined}
        onError={() => setFailed(true)}
        className={cover ? "absolute inset-0 h-full w-full object-cover bg-[#22344F]" : "rounded object-cover bg-[#22344F] shrink-0"}
        style={cover ? undefined : { width: size, height: size }}
      />
    );
  }
  return (
    <div
      className={cover
        ? "absolute inset-0 flex items-center justify-center bg-[#22344F] text-slate-500 font-semibold"
        : "rounded bg-[#22344F] text-slate-400 font-semibold flex items-center justify-center shrink-0"}
      style={cover ? { fontSize: coverText } : { width: size, height: size, fontSize: size * 0.3 }}
    >
      {initials(name) || "—"}
    </div>
  );
}

// Player photo, with a monogram fallback if it's missing, blocked, or 404s.
export function PlayerAvatar({ player, size = 40 }) {
  const [failed, setFailed] = useState(false);
  const name = `${player.firstName || ""} ${player.lastName || ""}`.trim();

  if (!SHOW_PLAYER_PHOTOS || !player.hasPhoto || failed) {
    return <Crest name={name} size={size} />;
  }
  return (
    <img
      src={playerPhotoUrl(player.id)}
      alt=""
      onError={() => setFailed(true)}
      className="rounded object-cover bg-[#22344F] shrink-0"
      style={{ width: size, height: size }}
    />
  );
}

// glass (DEFAULT since Oct 2026 — whole public viewer): frosted-glass look — translucent fill, backdrop
// blur, hairline white border and a top highlight. Needs something colourful
// behind it (GlassBackdrop, rendered once by PublicLayout). glass={false} = old solid panel.
// Performance (Oct 2026): the blur only runs from lg up. Behind a panel is the
// already-soft GlassBackdrop gradient, so blurring it changes almost nothing
// visually but costs a lot on a phone GPU; below lg the tint is a bit stronger.
// className: extra classes, e.g. content-visibility for long lists.
export function Panel({ title, count, children, empty, actions, glass = true, className = "" }) {
  return (
    <section className={(glass
      ? "relative rounded-2xl border border-white/[0.12] bg-white/[0.07] lg:bg-white/[0.05] lg:backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_8px_32px_rgba(0,0,0,0.35)] mb-5 overflow-hidden"
      : "rounded-lg border border-white/[0.08] bg-[#122036] mb-5 overflow-hidden") + (className ? " " + className : "")}>
      {title && (
        <div className={`px-4 sm:px-5 py-3.5 border-b ${glass ? "border-white/[0.08] bg-white/[0.03]" : "border-white/[0.08]"} flex items-center justify-between gap-2.5`}>
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 min-w-0">
            <h2 className="text-slate-100 text-[17px] font-semibold truncate max-w-full">{title}</h2>
            {count != null && <span className="text-slate-500 text-[13px]">{count}</span>}
          </div>
          {actions && <div className="flex items-center gap-1.5 shrink-0">{actions}</div>}
        </div>
      )}
      {children || <p className="px-4 sm:px-5 py-5 text-slate-400 text-[15px] leading-relaxed">{empty}</p>}
    </section>
  );
}

// Soft coloured glows fixed behind a page, for glass panels to blur. Purely
// decorative; pointer-events off. Content above it needs `relative z-10`.
export function GlassBackdrop() {
  // Radial gradients, not blur() filters: the same soft glow without asking the
  // GPU to blur three 400px+ layers (Oct 2026 performance pass).
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0"
      style={{
        background: [
          "radial-gradient(38rem 32rem at 0% 0%, rgba(37,99,235,0.30), transparent 70%)",
          "radial-gradient(40rem 34rem at 100% 45%, rgba(250,204,21,0.13), transparent 70%)",
          "radial-gradient(36rem 30rem at 30% 105%, rgba(14,165,233,0.20), transparent 70%)",
        ].join(","),
      }}
    />
  );
}

// ── Match rows ──────────────────────────────────────────────────────────────
// Pinned to Manila: league dates are Philippine dates whatever the device says.
// Formatters built once and reused (toLocale*String builds a new one per call,
// which is slow when it runs for every match row).
const DATE_LABEL = new Intl.DateTimeFormat(undefined, {
  timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric",
});
const TIME_LABEL = new Intl.DateTimeFormat([], { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
export const matchDateLabel = (d) => DATE_LABEL.format(new Date(d));

// A time is shown only when one was actually chosen — a date-only schedule is
// stored as midnight and must not render as a made-up "12:00 AM".
export const matchTime = (d) =>
  d && hasTime(d)
    ? TIME_LABEL.format(new Date(d))
    : null;

// "Basketball · U15 · Grp A · Round 1" — roundLabel comes from the API (lib/roundLabels.js):
// "Round 2", "Winners Round 1", "Semifinals", "Final", "Playoff"…
export const matchContext = (m, { sport = true } = {}) =>
  [sport ? m.sport : null, DIVISION_LABEL[m.division] || m.division, m.group ? `Grp ${m.group}` : null, m.roundLabel]
    .filter(Boolean).join(" · ");

// Quarters in basketball, sets in the rally sports.
const PERIOD_PREFIX = { Basketball: "Q", Volleyball: "S", Badminton: "S", Pickleball: "S" };

function TeamLine({ team, size = 28, className = "text-slate-100" }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0 py-1">
      <Crest name={team?.name} barangayId={team?.barangayId} size={size} />
      <span className={`text-[16px] truncate ${className}`}>{team?.name || "TBD"}</span>
    </div>
  );
}

// A fixture (no score yet), PBA-style: when + where on the LEFT, the two teams
// STACKED on the right. The old one-line "A vs B" squeezed each name to a few
// letters on a phone ("Ku… vs Ri…"); stacked, each name gets the full width.
export function FixtureRow({ m, when, where, context }) {
  return (
    <div className="flex gap-3 px-4 py-3 border-b border-white/[0.08] last:border-0">
      <div className="w-[4.5rem] sm:w-24 shrink-0 pt-0.5">
        <div className="text-slate-100 text-[15px] font-semibold tabular-nums leading-tight">{when || "TBD"}</div>
        {where && <div className="text-slate-500 text-[13px] leading-snug mt-1 line-clamp-2 break-words">{where}</div>}
      </div>
      <div className="flex-1 min-w-0 border-l border-white/[0.08] pl-3">
        {context && <div className="text-slate-500 text-[13px] leading-snug line-clamp-2 mb-0.5">{context}</div>}
        <TeamLine team={m.teamA} />
        <TeamLine team={m.teamB} />
      </div>
    </div>
  );
}

// Scoreboard strip — live and finished matches, where the score is the point.
// The leading team stays bright and the trailing one dims.
function ScoreLine({ team, score, leading }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <TeamLine team={team} size={30} className={leading ? "text-slate-100" : "text-slate-400"} />
      <span className={`text-2xl font-bold tabular-nums ${leading ? "text-slate-50" : "text-slate-500"}`}>
        {score}
      </span>
    </div>
  );
}

export function ScoreStrip({ m, showTime = true }) {
  const live = m.status === "ongoing";
  const aLeads = m.scoreA >= m.scoreB;
  const place = [matchContext(m), m.venue].filter(Boolean).join(" · ");
  return (
    <div className="px-4 py-3.5 border-b border-white/[0.08] last:border-0">
      <div className="flex items-start justify-between gap-3 mb-1">
        <span className="text-slate-500 text-[13px] leading-snug line-clamp-2">{place}</span>
        {live ? (
          <span className="flex items-center gap-1.5 text-red-400 text-[13px] font-semibold shrink-0">
            <LiveDot />
            {m.totalPeriods > 1
              ? `LIVE · ${PERIOD_PREFIX[m.sport] || "P"}${Math.min(m.periodsPlayed + 1, m.totalPeriods)}`
              : "LIVE"}
          </span>
        ) : (
          <span className="text-slate-500 text-[13px] shrink-0">
            {m.status === "forfeited" ? "Forfeit" : "Final"}
            {showTime && m.schedule ? ` · ${matchDateLabel(m.schedule)}` : ""}
          </span>
        )}
      </div>
      <ScoreLine team={m.teamA} score={m.scoreA} leading={aLeads} />
      <ScoreLine team={m.teamB} score={m.scoreB} leading={!aLeads || m.scoreA === m.scoreB} />
      {m.periods?.length > 1 && (
        <div className="text-slate-500 text-[13px] mt-1.5 tabular-nums">
          {m.periods.map((p) => `${p.a}-${p.b}`).join("  ·  ")}
        </div>
      )}
    </div>
  );
}

// Date header bar inside a schedule panel.
export function DateBar({ children, count }) {
  return (
    <div className="px-4 py-2.5 bg-white/[0.04] border-b border-white/[0.08] flex items-baseline gap-2">
      <span className="text-slate-100 text-[14px] font-semibold">{children}</span>
      {count != null && <span className="text-slate-500 text-[13px]">{count}</span>}
    </div>
  );
}

// Round prev/next buttons for a drag-scrollable row (e.g. a team carousel) —
// same inline-SVG convention as SearchInput, no lucide-react on Public.
export function CarouselArrow({ dir, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === "prev" ? "Scroll left" : "Scroll right"}
      className="w-7 h-7 rounded-full border border-white/[0.08] flex items-center justify-center text-slate-400 hover:text-slate-100 hover:border-[#2E4466] disabled:opacity-30 disabled:pointer-events-none transition"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
        <path d={dir === "prev" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

// Sport filter bar. Pass allLabel={null} to drop the "all" tab — used on
// Players, where combining sports would rank badminton rallies against
// basketball field goals.
export function SportTabs({ sports, value, onChange, allLabel = "All sports" }) {
  const items = [
    ...(allLabel ? [{ value: "", label: allLabel }] : []),
    ...sports.map((s) => ({ value: s, label: s })),
  ];
  return <TabRow items={items} value={value} onChange={onChange} />;
}

// Underlined tab row — sports on Matches/Teams/Players, competitions on
// Standings/Brackets. Swipes sideways on a phone; the right edge fades so it's
// obvious there are more tabs off-screen.
// A row that doesn't fit used to scroll with NO scrollbar — fine by swipe on a
// phone, but on a PC the tabs past the edge were unreachable. Now: a visible
// thin scrollbar, ‹ › arrows while it overflows, the mouse wheel scrolls it
// sideways, and the selected tab is scrolled into view.
export function TabRow({ items, value, onChange }) {
  const ref = useRef(null);
  const [edge, setEdge] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdge({
      left: el.scrollLeft > 2,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2,
    });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // A vertical wheel over the row scrolls it sideways — only while there is
    // room to move that way, so the page still scrolls once the row hits an end.
    const onWheel = (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      if ((e.deltaY < 0 && el.scrollLeft <= 0) || (e.deltaY > 0 && el.scrollLeft >= max)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => { ro.disconnect(); el.removeEventListener("wheel", onWheel); };
  }, [measure, items.length]);

  // Keep the selected tab visible (e.g. the first load picks one off-screen).
  useEffect(() => {
    const el = ref.current;
    const active = el?.querySelector('[aria-selected="true"]');
    if (!active) return;
    const l = active.offsetLeft, r = l + active.offsetWidth;
    if (l < el.scrollLeft || r > el.scrollLeft + el.clientWidth) {
      el.scrollTo({ left: l - 24, behavior: "smooth" });
    }
  }, [value, items.length]);

  const page = (dir) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.7, behavior: "smooth" });
  };
  const overflow = edge.left || edge.right;

  return (
    <div className="mb-6 border-b border-white/[0.08] flex items-end gap-2">
      <div className="relative flex-1 min-w-0">
        <div
          ref={ref}
          onScroll={measure}
          role="tablist"
          className="flex gap-1 overflow-x-auto overflow-y-hidden scrollbar-public -mb-px"
        >
          {items.map((it) => (
            <button
              key={it.value}
              role="tab"
              aria-selected={value === it.value}
              onClick={() => onChange(it.value)}
              className={`shrink-0 px-3 py-2.5 text-[15px] font-medium whitespace-nowrap border-b-2 transition ${
                value === it.value
                  ? "text-[#FACC15] border-[#FACC15]"
                  : "text-slate-400 border-transparent hover:text-slate-200"
              }`}
            >
              {it.label}
            </button>
          ))}
        </div>
        {edge.left && (
          <div className="pointer-events-none absolute left-0 top-0 bottom-2 w-8 bg-gradient-to-r from-[#0B1626] to-transparent" />
        )}
        {edge.right && (
          <div className="pointer-events-none absolute right-0 top-0 bottom-2 w-8 bg-gradient-to-l from-[#0B1626] to-transparent" />
        )}
      </div>
      {overflow && (
        <div className="hidden sm:flex shrink-0 items-center gap-1.5 pb-2.5">
          <CarouselArrow dir="prev" onClick={() => page(-1)} disabled={!edge.left} />
          <CarouselArrow dir="next" onClick={() => page(1)} disabled={!edge.right} />
        </div>
      )}
    </div>
  );
}

export function Tag({ children }) {
  return (
    <span className="px-2.5 py-1 rounded bg-[#22344F] text-slate-300 text-[13px] font-medium whitespace-nowrap">
      {children}
    </span>
  );
}
// ── Editable site imagery ───────────────────────────────────────────────────
export const siteImageUrl = (key) => `/api/public/site-image/${key}`;

// Fetched once per page load and shared by every slot, rather than each image
// firing its own request for the same data.
let focalPromise = null;
function loadFocals() {
  if (!focalPromise) {
    focalPromise = fetch("/api/public/site-images")
      .then((r) => (r.ok ? r.json() : { focals: {} }))
      .then((d) => d.focals || {})
      .catch(() => ({}));
  }
  return focalPromise;
}

export function SiteImage({ slot, label, className = "", hideOnFail = false, onLoad }) {
  const [failed, setFailed] = useState(false);
  const [focal, setFocal] = useState("center");

  useEffect(() => {
    let alive = true;
    loadFocals().then((f) => { if (alive && f[slot]) setFocal(f[slot]); });
    return () => { alive = false; };
  }, [slot]);

  // hideOnFail: render nothing (instead of the dashed "Sample image" box)
  // when the slot has no upload — for images used as a background layer.
  if (failed && hideOnFail) return null;
  if (failed) {
    return (
      <div className={`flex items-center justify-center bg-white/[0.04] border border-dashed border-white/[0.15] ${className}`}>
        <span className="text-slate-600 text-[11px] tracking-wide">Sample image · {label}</span>
      </div>
    );
  }
  return (
    <img
      src={siteImageUrl(slot)}
      alt=""
      onLoad={onLoad}
      onError={() => setFailed(true)}
      style={{ objectPosition: focal }}
      className={`object-cover ${className}`}
    />
  );
}
// ── Loading & live-state primitives ─────────────────────────────────────────
// A bare "Loading…" line is the one thing that reliably reads as unfinished
// on a sports site — ESPN/PBA-style pages always show shaped placeholders.
// These mimic the real panel shapes so the page doesn't "jump" once data lands.

export function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded bg-[#22344F] ${className}`} />;
}

// Generic list-row panel — stands in for Matches, Standings, and any other
// page whose loaded content is a stack of rows.
export function PanelSkeleton({ rows = 4, title = true }) {
  return (
    <section className="relative rounded-2xl border border-white/[0.12] bg-white/[0.05] lg:backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_8px_32px_rgba(0,0,0,0.35)] mb-5 overflow-hidden">
      {title && (
        <div className="px-5 py-3.5 border-b border-white/[0.08]">
          <Skeleton className="h-4 w-32" />
        </div>
      )}
      <div className="divide-y divide-white/[0.08]">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3.5">
            <Skeleton className="h-6 w-6 rounded shrink-0" />
            <Skeleton className="h-3.5 flex-1" />
            <Skeleton className="h-3.5 w-10 shrink-0" />
          </div>
        ))}
      </div>
    </section>
  );
}

// Grid-of-tiles panel — stands in for Teams and the Players "all" view.
export function TileGridSkeleton({ tiles = 6, cols = "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4" }) {
  return (
    <section className="relative rounded-2xl border border-white/[0.12] bg-white/[0.05] lg:backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_8px_32px_rgba(0,0,0,0.35)] mb-5 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-white/[0.08]">
        <Skeleton className="h-4 w-32" />
      </div>
      <div className={`grid ${cols} gap-px bg-[#22344F]`}>
        {Array.from({ length: tiles }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-5 py-4">
            <Skeleton className="h-10 w-10 rounded shrink-0" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// Photo + text rows — stands in for Champions.
export function PhotoRowSkeleton({ rows = 2 }) {
  return (
    <section className="relative rounded-2xl border border-white/[0.12] bg-white/[0.05] lg:backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_8px_32px_rgba(0,0,0,0.35)] mb-5 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-white/[0.08]">
        <Skeleton className="h-4 w-24" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex flex-col sm:flex-row gap-5 p-5 border-b border-white/[0.08] last:border-0">
          <Skeleton className="shrink-0 w-full sm:w-72 h-48 sm:h-52 rounded" />
          <div className="min-w-0 flex-1 space-y-2.5 py-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-3.5 w-1/3" />
          </div>
        </div>
      ))}
    </section>
  );
}

// A genuine pulsing dot on anything marked LIVE, the way broadcast sports
// UIs do it. Never used for anything but a real "ongoing" status —
// color/motion here still means something, it isn't decoration.
export function LiveDot({ className = "" }) {
  return (
    <span className={`relative inline-flex h-2 w-2 shrink-0 ${className}`}>
      <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 animate-ping" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
    </span>
  );
}

// Focus glow (a soft gold ring, not just the border color swap) and the
// clear button both animate with Motion — the clear button was a plain
// `{value && <button>}` that just popped in/out with no transition, and the
// focus state had almost no visible feedback (`border-white/[0.08]` to
// `border-[#2E4466]` is barely a shade apart). Gold matches the rest of the
// site's one accent color, so "the search bar is active" reads the same way
// "this nav link is active" or "this is live" already do everywhere else.
export function SearchInput({ value, onChange, placeholder = "Search…" }) {
  const [focused, setFocused] = useState(false);
  return (
    <div className="relative mb-5 max-w-xs">
      <motion.div
        className="absolute inset-0 rounded-lg pointer-events-none"
        initial={false}
        animate={{ boxShadow: focused ? "0 0 0 3px rgba(245,165,36,0.18)" : "0 0 0 0px rgba(245,165,36,0)" }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      />
      <motion.svg
        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
        className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
        initial={false}
        animate={{ color: focused ? "#FACC15" : "#475569" }}
        transition={{ duration: 0.2 }}
      >
        <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" strokeLinecap="round" />
      </motion.svg>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-white/[0.12] bg-white/[0.05] lg:backdrop-blur-md text-slate-200 placeholder:text-slate-600 text-[14px] pl-9 pr-9 py-2.5 outline-none focus:border-[#FACC15]/50 transition-colors"
      />
      <AnimatePresence>
        {value && (
          // y stays "-50%" across every state (never animates) purely to keep
          // this centered — Motion composes its own x/y/scale into ONE
          // transform, so a plain Tailwind `-translate-y-1/2` class here
          // would just get clobbered by the scale animation's transform.
          <motion.button
            key="clear"
            onClick={() => onChange("")}
            aria-label="Clear search"
            initial={{ opacity: 0, scale: 0.5, y: "-50%" }}
            animate={{ opacity: 1, scale: 1, y: "-50%" }}
            exit={{ opacity: 0, scale: 0.5, y: "-50%" }}
            transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-3 top-1/2 text-slate-600 hover:text-slate-300 text-sm"
          >
            ✕
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}