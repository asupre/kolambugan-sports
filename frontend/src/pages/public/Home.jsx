import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import {
  Panel, SiteImage, LiveDot, DateBar, matchDateLabel,
} from "../../components/PublicUI";
import Reveal from "../../components/Reveal";
import SportsMarquee from "../../components/SportsMarquee";
import HeroImage from "../../components/HeroImage";
import { VsMatchList } from "../../components/VsMatch";



// Near-black + green Home (Oct 3 2026 preview, from a game-hosting landing page the Super Admin
// shared): the hero photo melts into the page, a small green label, a bold Outfit headline, one
// green button, the league's numbers in ONE strip; then the games on the left and "why follow"
// on the right; a big closing line with the key words in green.

// One fact in the hero strip. "Live now" turns red only while a game is actually on.
function StripStat({ icon, value, label, live }) {
  return (
    <div className="flex min-w-0 items-center gap-3 px-4 py-3.5 sm:px-5">
      <span className="hidden shrink-0 sm:block">{icon}</span>
      <div className="min-w-0">
        <div className={`font-['Outfit'] text-[22px] font-bold leading-none tabular-nums ${live ? "text-red-400" : "text-white"}`}>{value}</div>
        <div className="mt-1 truncate text-[12px] text-slate-400">{label}</div>
      </div>
    </div>
  );
}

// "Why follow the league" rows (right column). Inline SVGs: no icon library on public pages.
const WHY = [
  { title: "Live scores", text: "Every point entered courtside, on your phone within seconds.",
    icon: <path d="M13 2 4 14h7l-1 8 9-12h-7z" /> },
  { title: "Verified residents", text: "Players are checked against the barangay list. No dayo.",
    icon: <><path d="M12 3 5 6v6c0 4 3 7.5 7 9 4-1.5 7-5 7-9V6z" /><path d="m9 12 2 2 4-4" /></> },
  { title: "Brackets and standings", text: "Every group, every knockout, updated after each game.",
    icon: <><path d="M4 5h5v5H4zM4 14h5v5H4z" /><path d="M9 7.5h3v9H9M12 12h4M16 9.5h4v5h-4z" /></> },
  { title: "Champions archive", text: "Every title, every barangay, kept season after season.",
    icon: <><path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4" /><path d="M12 13v4M8 21h8M10 17h4" /></> },
];

const ArrowIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

const BarangayIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4ADE80" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1m4 0h1m-6 4h1m4 0h1m-6 4h1m4 0h1" />
  </svg>
);

const SportIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4ADE80" strokeWidth="1.8" strokeLinecap="round">
    <circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 010 18M3 12h18" />
  </svg>
);

// Headline + next step for the "no games yet" state (Oct 2026 polish).
const NO_GAMES_TITLE = {
  setup: "The season is being set up",
  registration_open: "Registration is open",
  verification: "Teams are being verified",
  ongoing: "No games right now",
  completed: "The season is complete",
};
const NO_GAMES_ACTION = {
  setup: { to: "/about", label: "About the league" },
  registration_open: { to: "/teams", label: "See the teams" },
  verification: { to: "/teams", label: "See the teams" },
  ongoing: { to: "/matches", label: "Full schedule" },
  completed: { to: "/champions", label: "See the champions" },
};

// Before any game is dated the Home page used to show nothing about games at
// all, which read as broken. Say what stage the league is at instead.
const NO_GAMES = {
  setup: "The season is being set up. Games will be listed here once the schedule is out.",
  registration_open: "Barangays are registering their teams. Games will be listed here once the brackets are drawn.",
  verification: "Team rosters are being verified. Games will be listed here once the brackets are drawn.",
  ongoing: "No games are scheduled right now. Check back soon.",
  completed: "This season is over. See the champions and final results.",
};

export default function Home() {
  const [data, setData] = useState(null);
  const heroRef = useRef(null);

  useEffect(() => {
    let alive = true;
    // `last` = the previous response as text. A poll that returns the same data
    // skips the re-render (redrawing every 10-15s stalled phones), and a failed
    // poll keeps what is on screen instead of blanking the page.
    let last = "";
    const load = () =>
      api("/api/public/overview")
        .then((d) => {
          if (!alive) return;
          const text = JSON.stringify(d);
          if (text === last) return;
          last = text;
          setData(d);
        })
        .catch(() => { if (alive && !last) setData(null); });
    load();
    const timer = setInterval(load, 10000);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  const live = data?.live || [];
  const today = data?.today || [];
  const upcoming = data?.upcoming || [];
  const nothingOn = data && live.length === 0 && today.length === 0 && upcoming.length === 0;
  const recent = data?.recent || [];
  const counts = data?.counts || {};

  const games = (
    <>
      {/* Live now: NOT wrapped. In-progress matches update mid-game. */}
      {live.length > 0 && (
        <Panel title="Live now" count={`${live.length}`}>
          <div className="px-3 sm:px-5 py-5"><VsMatchList matches={live} showDate={false} /></div>
        </Panel>
      )}

      {today.length > 0 && (
        <Reveal>
          <Panel title="Today" count={`${today.length} scheduled`}>
            <div className="px-3 sm:px-5 py-5"><VsMatchList matches={today} showDate={false} /></div>
          </Panel>
        </Reveal>
      )}

      {upcoming.length > 0 && (
        <Reveal>
          <Panel title="Coming up" count={`next ${upcoming.length}`}>
            <div>
              {Object.entries(
                upcoming.reduce((acc, m) => {
                  (acc[matchDateLabel(m.schedule)] = acc[matchDateLabel(m.schedule)] || []).push(m);
                  return acc;
                }, {})
              ).map(([date, list]) => (
                <div key={date}>
                  <DateBar>{date}</DateBar>
                  <div className="px-3 sm:px-5 py-5"><VsMatchList matches={list} showDate={false} /></div>
                </div>
              ))}
            </div>
            <div className="px-4 py-3.5 border-t border-white/[0.08]">
              <Link to="/matches" className="text-[#4ADE80] text-[14px] font-medium hover:underline">Full schedule →</Link>
            </div>
          </Panel>
        </Reveal>
      )}

      {nothingOn && (
        <Panel
          title="Games"
          emptyTitle={(NO_GAMES_TITLE[data?.season?.status] || NO_GAMES_TITLE.ongoing)}
          emptyIcon={data?.season?.status === "completed" ? "trophy" : "calendar"}
          emptyAction={NO_GAMES_ACTION[data?.season?.status] || NO_GAMES_ACTION.ongoing}
          empty={NO_GAMES[data?.season?.status] || NO_GAMES.ongoing}
        />
      )}

      {recent.length > 0 && (
        <Reveal>
          <Panel title="Recent results" count={`${recent.length}`}>
            <div className="px-3 sm:px-5 py-5"><VsMatchList matches={recent.slice(0, 5)} /></div>
            <div className="px-4 py-3.5 border-t border-white/[0.08]">
              <Link to="/matches?tab=results" className="text-[#4ADE80] text-[14px] font-medium hover:underline">All results →</Link>
            </div>
          </Panel>
        </Reveal>
      )}
    </>
  );

  return (
    <>
      {/* Hero. The Site Images "hero" photo (HeroImage: fade-in, slow drift, parallax) melts into the
          page: dark on the left behind the words, fully page-black at the bottom. Content is
          left-aligned in a readable column, like the reference. KEEP: no viewport-edge full-bleed
          (w-screen / -50vw clipped content on phones); -mx-4 lg:-mx-8 cancels <main>'s padding and
          -mt-6 its top padding, so the hero sits flush under the nav (desktop: also the 72px header, so
          the photo runs up BEHIND the transparent header and the two blend). */}
      <section ref={heroRef} className="relative isolate overflow-hidden bg-[#0C1A12] -mx-4 lg:-mx-8 -mt-6 lg:-mt-[calc(1.5rem+72px)] mb-8 flex flex-col justify-end min-h-[calc(88svh-7.5rem)] lg:min-h-[88svh]">
        <HeroImage containerRef={heroRef} />
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          style={{ background: "linear-gradient(90deg, rgba(10,12,11,0.88) 0%, rgba(10,12,11,0.55) 45%, rgba(10,12,11,0.25) 100%), linear-gradient(180deg, rgba(10,12,11,0.35) 0%, rgba(10,12,11,0) 35%, rgba(10,12,11,0.85) 82%, #0A0C0B 100%)" }}
        />

        <div className="relative px-5 pt-14 pb-10 sm:px-8 lg:px-12 lg:pb-14">
          <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-[#4ADE80]">
            <span aria-hidden="true">✦</span> Live scores · Standings · {counts.barangays ?? 26} barangays
          </p>
          <h1 className="mt-4 max-w-3xl font-['Outfit'] text-[length:clamp(2.6rem,6.2vw,5.4rem)] font-extrabold leading-[1.02] tracking-[-0.02em] text-white">
            Every barangay.<br />Every game.<br /><span className="text-[#4ADE80]">Followed live.</span>
          </h1>
          {/* SAMPLE COPY — replace before deployment. */}
          <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-slate-300">
            The Kolambugan Inter-Barangay Sports League: live scores, brackets and standings
            for every sport, all season long.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/matches" className="inline-flex items-center gap-2 rounded-lg bg-[#4ADE80] px-5 py-3 text-[14px] font-bold uppercase tracking-wide text-[#0A0C0B] transition hover:bg-[#86EFAC]">
              View matches <ArrowIcon />
            </Link>
            <Link to="/standings" className="rounded-lg border border-white/25 px-5 py-3 text-[14px] font-semibold uppercase tracking-wide text-white transition hover:border-white/60">
              Standings
            </Link>
          </div>

          {/* The league's numbers in one strip. Live now is not animated (it changes mid-game). */}
          <div className="mt-9 grid max-w-2xl grid-cols-3 divide-x divide-white/10 rounded-xl border border-white/10 bg-black/45">
            <StripStat icon={<BarangayIcon />} value={counts.barangays ?? "–"} label="Barangays" />
            <StripStat icon={<SportIcon />} value={counts.sports ?? "–"} label="Sports" />
            <StripStat icon={<LiveDot />} value={counts.liveNow ?? 0} label="Live now" live={(counts.liveNow ?? 0) > 0} />
          </div>
        </div>
      </section>

      {/* Sports marquee: a constant CSS loop, so NOT wrapped in Reveal. */}
      <SportsMarquee />

      {/* Games on the left, "why follow" on the right (stacked on phones). */}
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">{games}</div>

        <aside className="space-y-6">
          <Reveal>
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
              <SiteImage slot="league" label="league photo" className="h-40 w-full" />
              <div className="p-5">
                <h2 className="font-['Outfit'] text-[20px] font-bold text-white">About the league</h2>
                {/* SAMPLE COPY — replace before deployment. */}
                <p className="mt-2 text-[15px] leading-relaxed text-slate-400">
                  Organised by the SK Federation: every barangay in the municipality, one
                  competitive season, every result recorded as it happens.
                </p>
              </div>
            </div>
          </Reveal>

          <Reveal>
            <div>
              <h2 className="font-['Outfit'] text-[20px] font-bold text-white">Why follow the league?</h2>
              <ul className="mt-4 space-y-4">
                {WHY.map((w) => (
                  <li key={w.title} className="flex gap-3">
                    <svg aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-[#4ADE80]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{w.icon}</svg>
                    <div>
                      <p className="text-[15px] font-semibold text-slate-100">{w.title}</p>
                      <p className="text-[14px] leading-snug text-slate-400">{w.text}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>

          <Reveal>
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
              <SiteImage slot="barangay" label="municipality photo" className="h-36 w-full" />
              <div className="p-5">
                <h2 className="font-['Outfit'] text-[20px] font-bold text-white">Kolambugan</h2>
                <p className="mt-2 text-[15px] leading-relaxed text-slate-400">
                  A coastal municipality in Lanao del Norte. Every entry carries a community's name.
                </p>
                <Link to="/teams" className="mt-3 inline-block text-[14px] font-medium text-[#4ADE80] hover:underline">Browse the teams →</Link>
              </div>
            </div>
          </Reveal>
        </aside>
      </div>

      {/* Closing line, the key words in green (like the reference's big statement). */}
      <Reveal>
        <section className="mt-14 border-t border-white/10 pt-12 pb-4">
          <p className="max-w-4xl font-['Outfit'] text-[length:clamp(1.7rem,3.6vw,2.9rem)] font-bold leading-[1.15] tracking-[-0.015em] text-slate-500">
            {counts.barangays ?? 26} barangays, {counts.sports ?? 7} sports, <span className="text-white">one season.</span>{" "}
            <span className="text-[#4ADE80]">Follow every game live</span> and cheer your barangay on to the title.
          </p>
          <Link to="/matches" className="mt-7 inline-flex items-center gap-2 rounded-lg bg-[#4ADE80] px-5 py-3 text-[14px] font-bold uppercase tracking-wide text-[#0A0C0B] transition hover:bg-[#86EFAC]">
            See today's games <ArrowIcon />
          </Link>
        </section>
      </Reveal>
    </>
  );
}