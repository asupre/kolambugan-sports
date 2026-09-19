import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { Crest, Panel, Reveal, SiteImage, LiveDot, DIVISION_LABEL } from "../../components/PublicUI";



// Individually-bordered tile (rather than one shared row) so each fact reads
// on its own — the "live" tile tints red only while something's actually
// ongoing, same "color means something" rule as LiveDot elsewhere.
function StatTile({ icon, value, label, live }) {
  return (
    <div className={`rounded-xl border ${live ? "border-red-500/35" : "border-[#1C2430]"} bg-[#0F141C] px-2.5 py-4 text-center`}>
      <div className="flex justify-center mb-2">{icon}</div>
      <div className="text-slate-50 text-[26px] font-extrabold leading-none tabular-nums">{value}</div>
      <div className={`text-[9px] tracking-wide uppercase mt-1.5 font-semibold ${live ? "text-red-400" : "text-slate-500"}`}>
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

function MiniScore({ m }) {
  const aLeads = m.scoreA >= m.scoreB;
  const Line = ({ team, score, leading }) => (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-2 min-w-0">
        <Crest name={team?.name} barangayId={team?.barangayId} size={22} />
        <span className={`text-[13px] truncate ${leading ? "text-slate-100" : "text-slate-400"}`}>
          {team?.name || "TBD"}
        </span>
      </div>
      <span className={`text-[15px] font-semibold tabular-nums pl-3 ${leading ? "text-slate-100" : "text-slate-500"}`}>
        {score}
      </span>
    </div>
  );
  return (
    <div className="px-4 py-3 border-b border-[#1C2430] last:border-0">
      <div className="flex items-center gap-1.5 text-slate-600 text-[11px] mb-1 truncate">
        {m.status === "ongoing" && <LiveDot />}
        {m.sport} · {DIVISION_LABEL[m.division] || m.division}
        {m.group ? ` · Grp ${m.group}` : ""}
      </div>
      <Line team={m.teamA} score={m.scoreA} leading={aLeads} />
       <Line team={m.teamB} score={m.scoreB} leading={!aLeads || m.scoreA === m.scoreB} />
    </div>
  );
}

export default function Home() {
  const [data, setData] = useState(null);

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
  const recent = data?.recent || [];
  const counts = data?.counts || {};

  return (
    <>
      {/* Hero. NOTE: a true viewport-edge "full-bleed" (w-screen + -50vw
          margins) was tried here and reverted — on a page this tall, a
          vertical scrollbar makes 100vw compute WIDER than the real visible
          width in Chromium, so the breakout overshot the right edge and
          clipped the headline and nav on mobile (confirmed with an actual
          screenshot, not just a build check). This version just fills its
          normal container — already 1400px wide (see PublicLayout), which
          reads as effectively full-bleed on anything but an ultra-wide
          monitor, with zero overflow risk.
          The `hero` SiteImage sits as a full background layer — a
          left-to-right dark gradient keeps the text (which lives on the
          left) readable over whatever gets uploaded, while the right side
          stays brighter to actually show the photo. Falls back to
          PublicUI's own "Sample image" placeholder box when nothing's
          uploaded yet, same as the league/barangay slots below. A subtle
          ring accent (nodding to the real crest's gold ring ticks) sits on
          top either way.
          `-mt-20` additionally pulls the section's own background up
          underneath the sticky header (z-30, ~90% opaque with a blur — see
          PublicLayout) instead of starting right below it, so the panel/
          photo visually reaches the very top of the page instead of
          stopping short and leaving the nav on a flat strip of its own.
          `<main>` itself has py-6 (24px) of its own padding above the hero,
          which eats into this margin before it ever reaches the header, so
          the REAL overlap into the header's box is ~56px (80px - 24px) —
          comfortably under the header's shortest real height (~104px+) at
          any breakpoint, so this can't overshoot and peek out above it.
          Matching extra top padding keeps the actual TEXT starting at the
          same spot as before — only the background moved. */}
      <section className="relative overflow-hidden bg-[#0A1220] border-b border-[#1C2430] -mx-4 lg:-mx-8 -mt-20 px-5 sm:px-8 lg:px-12 pt-[7.5rem] sm:pt-36 lg:pt-40 pb-10 sm:pb-16 lg:pb-20 mb-6">
        <SiteImage slot="hero" label="hero banner" className="absolute inset-0 w-full h-full" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0A1220] via-[#0A1220]/85 to-[#0A1220]/35" />
        <div className="absolute -top-14 right-4 w-64 h-64 rounded-full border border-[#F5A524]/20 pointer-events-none" />

        <div className="relative">
          {data?.season?.name && (
            <span className="inline-block bg-[#F5A524]/15 text-[#F5A524] text-[10px] font-bold tracking-wide px-2.5 py-1.5 rounded-full mb-4">
              {data.season.name.toUpperCase()}
            </span>
          )}
          <h1 className="text-slate-50 text-4xl sm:text-6xl lg:text-8xl font-extrabold uppercase tracking-tight leading-[0.95] break-words">
            Inter-Barangay
          </h1>
          <h1 className="text-[#F5A524] text-4xl sm:text-6xl lg:text-8xl font-extrabold uppercase tracking-tight leading-[0.95] mt-1 break-words">
            Sports League
          </h1>
          <p className="text-slate-400 text-sm sm:text-base mt-5 max-w-xl">
            {/* SAMPLE COPY — replace before deployment. */}
            Seven sports. Twenty-six barangays. One municipality. Follow every
            match, bracket, and standing across the Kolambugan league season.
          </p>
          <div className="flex flex-wrap gap-2.5 mt-6">
            <Link to="/matches" className="flex items-center gap-1.5 bg-[#F5A524] text-[#0A1220] text-[13px] sm:text-sm font-bold px-5 sm:px-6 py-3 sm:py-3.5 rounded-full hover:bg-[#e0961f] transition">
              View matches <ArrowIcon />
            </Link>
            <Link to="/standings" className="border-[1.5px] border-[#2A3441] text-slate-200 text-[13px] sm:text-sm font-semibold px-5 sm:px-6 py-3 sm:py-3.5 rounded-full hover:border-slate-500 transition">
              Standings
            </Link>
          </div>
        </div>
      </section>

      {/* League at a glance — each tile reveals a beat after the last,
          cascading in rather than snapping in all at once. */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Reveal delay={0}>
          <StatTile icon={<BarangayIcon />} value={counts.barangays ?? "—"} label="Barangays" />
        </Reveal>
        <Reveal delay={100}>
          <StatTile icon={<SportIcon />} value={counts.sports ?? "—"} label="Sports" />
        </Reveal>
        <Reveal delay={200}>
          <StatTile
            icon={<LiveDot />}
            value={counts.liveNow ?? 0}
            label="Live now"
            live={(counts.liveNow ?? 0) > 0}
          />
        </Reveal>
      </div>

      {/* Live and today */}
      {live.length > 0 && (
        <Reveal>
          <Panel title="Live now" count={`${live.length}`}>
            <div>{live.map((m) => <MiniScore key={m.id} m={m} />)}</div>
          </Panel>
        </Reveal>
      )}

      {today.length > 0 && (
        <Reveal>
          <Panel title="Today" count={`${today.length} scheduled`}>
            <div>
              {today.map((m) => (
                <div key={m.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-[#1C2430] last:border-0">
                  <div className="flex-1 min-w-0 flex items-center justify-end gap-2">
                    <span className="text-slate-200 text-[13px] truncate text-right">{m.teamA?.name || "TBD"}</span>
                    <Crest name={m.teamA?.name} size={22} />
                  </div>
                  <span className="text-slate-600 text-[11px] shrink-0">vs</span>
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <Crest name={m.teamB?.name} size={22} />
                    <span className="text-slate-200 text-[13px] truncate">{m.teamB?.name || "TBD"}</span>
                  </div>
                  <span className="w-20 shrink-0 text-right text-slate-600 text-[11px] truncate">{m.venue || m.sport}</span>
                </div>
              ))}
            </div>
          </Panel>
        </Reveal>
      )}

      {/* About the league */}
      <Reveal>
        <section className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
          <SiteImage slot="league" label="league photo" className="w-full h-52 rounded-lg border border-[#1C2430]" />
          <div className="flex flex-col justify-center">
            <h2 className="text-slate-100 text-lg font-semibold mb-2">About the league</h2>
            {/* SAMPLE COPY — replace before deployment. */}
            <p className="text-slate-400 text-[14px] leading-relaxed mb-3">
              The Inter-Barangay Sports League brings together every barangay in the
              municipality for a single competitive season, organised by the
              Sangguniang Kabataan Federation. Teams register through their barangay,
              players are verified as residents, and every result is recorded as it
              happens.
            </p>
            <p className="text-slate-500 text-[13px] leading-relaxed">
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
            <h2 className="text-slate-100 text-lg font-semibold mb-2">Kolambugan</h2>
            {/* SAMPLE COPY — replace before deployment. */}
            <p className="text-slate-400 text-[14px] leading-relaxed mb-3">
              A coastal municipality in Lanao del Norte, Kolambugan is made up of
              barangays that each field their own teams. The league is as much about
              the barangays as the sport — every entry carries a community's name.
            </p>
            <Link to="/teams" className="text-[#F5A524] text-[13px] hover:underline">
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
            <div>{recent.slice(0, 5).map((m) => <MiniScore key={m.id} m={m} />)}</div>
            <div className="px-4 py-2.5 border-t border-[#1C2430]">
              <Link to="/matches" className="text-[#F5A524] text-[12px] hover:underline">All results →</Link>
            </div>
          </Panel>
        </Reveal>
      )}
    </>
  );
}