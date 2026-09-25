import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import {
  Panel, SiteImage, LiveDot, ScoreStrip, FixtureRow, DateBar, matchDateLabel, matchTime, matchContext,
} from "../../components/PublicUI";
import Reveal, { RevealGroup, RevealItem } from "../../components/Reveal";
import SportsMarquee from "../../components/SportsMarquee";
import HeroImage from "../../components/HeroImage";



// Individually-bordered tile (rather than one shared row) so each fact reads
// on its own — the "live" tile tints red only while something's actually
// ongoing, same "color means something" rule as LiveDot elsewhere.
function StatTile({ icon, value, label, live }) {
  return (
    <div className={`rounded-xl border ${live ? "border-red-500/35" : "border-[#1C2430]"} bg-[#0F141C] px-2.5 py-4 text-center`}>
      <div className="flex justify-center mb-2">{icon}</div>
      <div className="text-slate-50 text-[30px] font-extrabold leading-none tabular-nums">{value}</div>
      <div className={`text-[11px] tracking-wide uppercase mt-2 font-semibold ${live ? "text-red-400" : "text-slate-500"}`}>
        {label}
      </div>
    </div>
  );
}

const ArrowIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

const BarangayIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F5A524" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1m4 0h1m-6 4h1m4 0h1m-6 4h1m4 0h1" />
  </svg>
);

const SportIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F5A524" strokeWidth="1.8" strokeLinecap="round">
    <circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 010 18M3 12h18" />
  </svg>
);

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
    const load = () =>
      api("/api/public/overview")
        .then((d) => { if (alive) setData(d); })
        .catch(() => { if (alive) setData(null); });
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

  return (
    <>
      {/* Hero (Super Admin's spec, Sep 2026, third revision). Layers:
          1. the Site Images "hero" slot — full opacity, full colour,
             object-cover, full-bleed. With nothing uploaded `hideOnFail`
             makes SiteImage render nothing and the section's own solid
             #0C3550 shows instead. Upload/crop/focal are untouched;
          2. ONE gradient scrim (the exact stops below) — nothing else tints
             the photo, and it's drawn even with no photo so the fallback
             looks the same;
          3. content in normal flow, bottom-anchored (the scrim is darkest
             at the bottom): a left-aligned two-line Anton headline running
             nearly the full container width, then the copy block 28px
             (`mt-7`) below it. Nothing overlaps the headline (the optional
             /hero-player.png cut-out layer was removed for that reason —
             re-add it deliberately if a subject PNG is ever supplied).
          Headline size: clamp on viewport width AND height. "INTER-BARANGAY"
          in Anton is ~5.8em wide, so 15vw fills ~87% of the width at any
          screen size; the 28svh term keeps it from outgrowing short screens.
          KEEP: no viewport-edge full-bleed (w-screen / -50vw) — 100vw
          includes the scrollbar in Chromium and clipped content on mobile
          (screenshot-confirmed). `-mx-4 lg:-mx-8` cancels <main>'s padding;
          `-mt-6` cancels its py-6 so the hero sits flush under the nav. The
          min-heights subtract the nav's real height (~72px at lg, ~116-120px
          where the nav wraps/icons) so the hero fills the first screen and
          the stat tiles start below the fold. The headline and copy are NOT
          animated; the PHOTO is (HeroImage: load-triggered fade + settle,
          slow drift, scroll parallax — the last two honour reduced motion). */}
      <section ref={heroRef} className="relative isolate overflow-hidden bg-[#0C3550] -mx-4 lg:-mx-8 -mt-6 mb-6 flex flex-col justify-end min-h-[calc(100svh-7.5rem)] lg:min-h-[calc(100svh-4.5rem)]">
        <HeroImage containerRef={heroRef} />
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          style={{ background: "linear-gradient(180deg, rgba(8,35,52,0.55) 0%, rgba(8,35,52,0.30) 45%, rgba(8,35,52,0.88) 100%)" }}
        />

        <div className="relative px-5 pt-10 pb-8 sm:px-8 lg:px-12 lg:pb-12">
          <h1 className="text-left font-['Anton'] font-normal uppercase leading-[0.82] tracking-tight text-[length:clamp(2.5rem,min(15vw,28svh),14rem)]">
            <span className="block text-white">Inter-Barangay</span>
            <span className="block text-[#D9A441]">Sports League</span>
          </h1>

          <div className="mt-7">
            <h2 className="text-white text-[28px] font-semibold leading-tight">
              Follow &amp; cheer on<br />every barangay, every match.
            </h2>
            {/* SAMPLE COPY — replace before deployment. */}
            <p className="mt-3 text-[15px] text-white/70 md:whitespace-nowrap">
              Live scores, brackets and standings for all 26 barangays.
            </p>
            <div className="mt-5 flex flex-wrap gap-2.5">
              <Link to="/matches" className="flex items-center gap-2 rounded-full bg-[#D9A441] py-2 pl-6 pr-2 text-sm font-bold text-[#0A1220] transition hover:bg-[#c8942f]">
                View matches
                <span className="flex size-8 items-center justify-center rounded-full bg-[#0A1220] text-[#D9A441]"><ArrowIcon /></span>
              </Link>
              <Link to="/standings" className="rounded-full border-[1.5px] border-white/40 px-6 py-3 text-sm font-semibold text-white transition hover:border-white">
                Standings
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* League at a glance. The two static tiles reveal one after another;
          the LIVE NOW tile is deliberately NOT wrapped — its counter changes
          mid-match and must never animate. (Plain child of the group: it
          just sits there.) */}
      <RevealGroup className="grid grid-cols-3 gap-3 mb-6">
        <RevealItem>
          <StatTile icon={<BarangayIcon />} value={counts.barangays ?? "—"} label="Barangays" />
        </RevealItem>
        <RevealItem>
          <StatTile icon={<SportIcon />} value={counts.sports ?? "—"} label="Sports" />
        </RevealItem>
        <div>
          <StatTile
            icon={<LiveDot />}
            value={counts.liveNow ?? 0}
            label="Live now"
            live={(counts.liveNow ?? 0) > 0}
          />
        </div>
      </RevealGroup>

      {/* Live now: NOT wrapped — in-progress matches update mid-game. */}
      {live.length > 0 && (
        <Panel title="Live now" count={`${live.length}`}>
          <div>{live.map((m) => <ScoreStrip key={m.id} m={m} showTime={false} />)}</div>
        </Panel>
      )}

      {/* Sports marquee — constant CSS loop, so NOT wrapped in Reveal. Renders
          nothing if /api/sports fails or is empty. */}
      <SportsMarquee />

      {today.length > 0 && (
        <Reveal>
          <Panel title="Today" count={`${today.length} scheduled`}>
            <div>
              {today.map((m) => (
                <FixtureRow key={m.id} m={m} when={matchTime(m.schedule)} where={m.venue} context={matchContext(m)} />
              ))}
            </div>
          </Panel>
        </Reveal>
      )}

      {/* The next dated games after today, grouped by day. */}
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
                  {list.map((m) => (
                    <FixtureRow key={m.id} m={m} when={matchTime(m.schedule)} where={m.venue} context={matchContext(m)} />
                  ))}
                </div>
              ))}
            </div>
            <div className="px-4 py-3.5 border-t border-[#1C2430]">
              <Link to="/matches" className="text-[#F5A524] text-[14px] font-medium hover:underline">Full schedule →</Link>
            </div>
          </Panel>
        </Reveal>
      )}

      {nothingOn && (
        <Panel title="Games">
          <p className="px-4 sm:px-5 py-5 text-slate-400 text-[15px] leading-relaxed">
            {NO_GAMES[data?.season?.status] || NO_GAMES.ongoing}
          </p>
        </Panel>
      )}

      {/* About the league */}
      <Reveal>
        <section className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
          <SiteImage slot="league" label="league photo" className="w-full h-52 rounded-lg border border-[#1C2430]" />
          <div className="flex flex-col justify-center">
            <h2 className="text-slate-100 text-xl font-semibold mb-2">About the league</h2>
            {/* SAMPLE COPY — replace before deployment. */}
            <p className="text-slate-300 text-[16px] leading-relaxed mb-3">
              The Inter-Barangay Sports League brings together every barangay in the
              municipality for a single competitive season, organised by the
              Sangguniang Kabataan Federation. Teams register through their barangay,
              players are verified as residents, and every result is recorded as it
              happens.
            </p>
            <p className="text-slate-400 text-[15px] leading-relaxed">
              Competition runs across basketball, volleyball, badminton, pickleball,
              billiards, chess, and Mobile Legends, with divisions set each season.
            </p>
          </div>
        </section>
      </Reveal>

      {/* About Kolambugan */}
      <Reveal>
        <section className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
          <div className="flex flex-col justify-center md:order-1 order-2">
            <h2 className="text-slate-100 text-xl font-semibold mb-2">Kolambugan</h2>
            {/* SAMPLE COPY — replace before deployment. */}
            <p className="text-slate-300 text-[16px] leading-relaxed mb-3">
              A coastal municipality in Lanao del Norte, Kolambugan is made up of
              barangays that each field their own teams. The league is as much about
              the barangays as the sport — every entry carries a community's name.
            </p>
            <Link to="/teams" className="text-[#F5A524] text-[15px] font-medium hover:underline">
              Browse the teams →
            </Link>
          </div>
          <SiteImage slot="barangay" label="municipality photo" className="w-full h-52 rounded-lg border border-[#1C2430] md:order-2 order-1" />
        </section>
      </Reveal>

      {/* Recent results */}
      {recent.length > 0 && (
        <Reveal>
          <Panel title="Recent results" count={`${recent.length}`}>
            <div>{recent.slice(0, 5).map((m) => <ScoreStrip key={m.id} m={m} />)}</div>
            <div className="px-4 py-3.5 border-t border-[#1C2430]">
              <Link to="/matches" className="text-[#F5A524] text-[14px] font-medium hover:underline">All results →</Link>
            </div>
          </Panel>
        </Reveal>
      )}
    </>
  );
}