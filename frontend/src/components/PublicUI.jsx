// Shared primitives for the PUBLIC viewer (dark theme).
//
// NOTE: components/ui.jsx is the LIGHT admin set (white cards, indigo).
// Do not mix the two — nothing in ui.jsx works on this background.
//
// Crest is the SINGLE SWAP POINT for barangay logos. When the logo serve
// route exists, change it here and every public page picks it up at once.

import { useState, useEffect } from "react";
import { useInView } from "../hooks/useInView";

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
export const playerPhotoUrl = (id) => `/api/teams/players/${id}/photo`;

// Pending Hon. Reserva's decision on publishing minors' photos.
// Flip to false and every public photo falls back to a monogram — no other edits.
export const SHOW_PLAYER_PHOTOS = true;

// ── Components ──────────────────────────────────────────────────────────────

export const barangayLogoUrl = (id) => `/api/barangays/${id}/logo`;

// Which barangays actually have a logo, fetched once per page load. Without it
// every crest fires a request that 404s before falling back to the monogram —
// on a page with 26 barangays that's dozens of wasted round trips.
let logoPromise = null;
function loadLogos() {
  if (!logoPromise) {
    logoPromise = fetch("/api/barangays")
      .then((r) => (r.ok ? r.json() : { barangays: [] }))
      .then((d) => new Set((d.barangays || []).filter((b) => b.hasLogo).map((b) => String(b._id))))
      .catch(() => new Set());
  }
  return logoPromise;
}

// Barangay crest. Falls back to a monogram when no logo is uploaded, or when the
// payload carries no barangay id.
export function Crest({ name, barangayId, size = 40 }) {
  const [has, setHas] = useState(null);   // null = still checking
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!barangayId) { setHas(false); return; }
    let alive = true;
    loadLogos().then((set) => { if (alive) setHas(set.has(String(barangayId))); });
    return () => { alive = false; };
  }, [barangayId]);

  if (has && !failed) {
    return (
      <img
        src={barangayLogoUrl(barangayId)}
        alt=""
        onError={() => setFailed(true)}
        className="rounded object-cover bg-[#1C2430] shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded bg-[#1C2430] text-slate-400 font-semibold flex items-center justify-center shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.3 }}
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
      className="rounded object-cover bg-[#1C2430] shrink-0"
      style={{ width: size, height: size }}
    />
  );
}

export function Panel({ title, count, children, empty }) {
  return (
    <section className="rounded-lg border border-[#1C2430] bg-[#0F141C] mb-5 overflow-hidden">
      {title && (
        <div className="px-5 py-3.5 border-b border-[#1C2430] flex items-baseline gap-2.5">
          <h2 className="text-slate-100 text-[15px] font-semibold">{title}</h2>
          {count != null && <span className="text-slate-500 text-xs">{count}</span>}
        </div>
      )}
      {children || <p className="px-5 py-5 text-slate-500 text-sm">{empty}</p>}
    </section>
  );
}

// Sport filter bar. Pass allLabel={null} to drop the "all" tab — used on
// Players, where combining sports would rank badminton rallies against
// basketball field goals.
export function SportTabs({ sports, value, onChange, allLabel = "All sports" }) {
  const Tab = ({ v, label }) => (
    <button
      onClick={() => onChange(v)}
      className={`px-3 py-2 text-[13px] whitespace-nowrap border-b-2 transition ${
        value === v
          ? "text-[#F5A524] border-[#F5A524]"
          : "text-slate-400 border-transparent hover:text-slate-200"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="flex gap-4 overflow-x-auto border-b border-[#1C2430] mb-6">
      {allLabel && <Tab v="" label={allLabel} />}
      {sports.map((s) => <Tab key={s} v={s} label={s} />)}
    </div>
  );
}

export function Tag({ children }) {
  return (
    <span className="px-2 py-0.5 rounded bg-[#1C2430] text-slate-400 text-[11px] font-medium whitespace-nowrap">
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

export function SiteImage({ slot, label, className = "" }) {
  const [failed, setFailed] = useState(false);
  const [focal, setFocal] = useState("center");

  useEffect(() => {
    let alive = true;
    loadFocals().then((f) => { if (alive && f[slot]) setFocal(f[slot]); });
    return () => { alive = false; };
  }, [slot]);

  if (failed) {
    return (
      <div className={`flex items-center justify-center bg-[#141A24] border border-dashed border-[#2A3441] ${className}`}>
        <span className="text-slate-600 text-[11px] tracking-wide">Sample image · {label}</span>
      </div>
    );
  }
  return (
    <img
      src={siteImageUrl(slot)}
      alt=""
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
  return <div className={`animate-pulse rounded bg-[#1C2430] ${className}`} />;
}

// Generic list-row panel — stands in for Matches, Standings, and any other
// page whose loaded content is a stack of rows.
export function PanelSkeleton({ rows = 4, title = true }) {
  return (
    <section className="rounded-lg border border-[#1C2430] bg-[#0F141C] mb-5 overflow-hidden">
      {title && (
        <div className="px-5 py-3.5 border-b border-[#1C2430]">
          <Skeleton className="h-4 w-32" />
        </div>
      )}
      <div className="divide-y divide-[#1C2430]">
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
    <section className="rounded-lg border border-[#1C2430] bg-[#0F141C] mb-5 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-[#1C2430]">
        <Skeleton className="h-4 w-32" />
      </div>
      <div className={`grid ${cols} gap-px bg-[#1C2430]`}>
        {Array.from({ length: tiles }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-5 py-4 bg-[#0F141C]">
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
    <section className="rounded-lg border border-[#1C2430] bg-[#0F141C] mb-5 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-[#1C2430]">
        <Skeleton className="h-4 w-24" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex flex-col sm:flex-row gap-5 p-5 border-b border-[#1C2430] last:border-0">
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

// Scroll-triggered reveal (Sep 2026) — the motion.dev-style fade-up-into-
// view effect: content sits slightly lower and transparent until it
// scrolls into the viewport, then eases up into place, once. Wrap any
// below-the-fold section in it (see Home.jsx). `delay` (ms) staggers a row
// of siblings so they cascade in one after another instead of all
// snapping in together. Skips the animation (shows content immediately)
// under prefers-reduced-motion — see useInView.
export function Reveal({ children, delay = 0, className = "" }) {
  const [ref, inView] = useInView();
  return (
    <div
      ref={ref}
      style={{ transitionDelay: inView ? `${delay}ms` : "0ms" }}
      className={`transition-all duration-700 ease-out ${
        inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = "Search…" }) {
  return (
    <div className="relative mb-5">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
        className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none">
        <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" strokeLinecap="round" />
      </svg>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-[#1C2430] bg-[#0F141C] text-slate-200 placeholder:text-slate-600 text-[14px] pl-9 pr-9 py-2.5 outline-none focus:border-[#2A3441] transition"
      />
      {value && (
        <button onClick={() => onChange("")} aria-label="Clear search"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-300 text-sm">
          ✕
        </button>
      )}
    </div>
  );
}