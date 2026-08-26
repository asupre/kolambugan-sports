// Shared primitives for the PUBLIC viewer (dark theme).
//
// NOTE: components/ui.jsx is the LIGHT admin set (white cards, indigo).
// Do not mix the two — nothing in ui.jsx works on this background.
//
// Crest is the SINGLE SWAP POINT for barangay logos. When the logo serve
// route exists, change it here and every public page picks it up at once.

import { useState } from "react";

export const DIVISION_LABEL = {
  open: "Open",
  boys: "Boys",
  girls: "Girls",
  under17: "U17",
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
export const playerPhotoUrl = (id) => `/api/team/players/${id}/photo`;

// Pending Hon. Reserva's decision on publishing minors' photos.
// Flip to false and every public photo falls back to a monogram — no other edits.
export const SHOW_PLAYER_PHOTOS = true;

// ── Components ──────────────────────────────────────────────────────────────

// Barangay crest. Falls back to a monogram tile until logos are uploaded.
export function Crest({ name, size = 40 }) {
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