import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { Crest, Panel, SiteImage, DIVISION_LABEL } from "../../components/PublicUI";



function Stat({ value, label }) {
  return (
    <div>
      <div className="text-[#F5A524] text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-slate-500 text-[11px] tracking-wide uppercase mt-0.5">{label}</div>
    </div>
  );
}

function MiniScore({ m }) {
  const aLeads = m.scoreA >= m.scoreB;
  const Line = ({ name, score, leading }) => (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-2 min-w-0">
        <Crest name={name} size={22} />
        <span className={`text-[13px] truncate ${leading ? "text-slate-100" : "text-slate-400"}`}>
          {name || "TBD"}
        </span>
      </div>
      <span className={`text-[15px] font-semibold tabular-nums pl-3 ${leading ? "text-slate-100" : "text-slate-500"}`}>
        {score}
      </span>
    </div>
  );
  return (
    <div className="px-4 py-3 border-b border-[#1C2430] last:border-0">
      <div className="text-slate-600 text-[11px] mb-1 truncate">
        {m.sport} · {DIVISION_LABEL[m.division] || m.division}
        {m.group ? ` · Grp ${m.group}` : ""}
      </div>
      <Line name={m.teamA?.name} score={m.scoreA} leading={aLeads} />
      <Line name={m.teamB?.name} score={m.scoreB} leading={!aLeads || m.scoreA === m.scoreB} />
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
      {/* Hero */}
      <section className="relative rounded-lg overflow-hidden border border-[#1C2430] mb-6">
        <SiteImage slot="hero" label="hero banner" className="w-full h-56 sm:h-72" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0A1220] via-[#0A1220]/70 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-7">
          {data?.season?.name && (
            <span className="inline-block bg-[#F5A524]/15 text-[#F5A524] text-[10px] px-2.5 py-1 rounded mb-3">
              {data.season.name.toUpperCase()}
            </span>
          )}
          <h1 className="text-slate-50 text-2xl sm:text-4xl font-semibold tracking-tight leading-tight">
            Inter-Barangay Sports League
          </h1>
          <p className="text-slate-400 text-sm mt-2 max-w-xl">
            {/* SAMPLE COPY — replace before deployment. */}
            Seven sports. Twenty-six barangays. One municipality. Follow every
            match, bracket, and standing across the Kolambugan league season.
          </p>
          <div className="flex gap-2 mt-4">
            <Link to="/matches" className="bg-[#F5A524] text-[#0A1220] text-[13px] font-semibold px-4 py-2 rounded hover:bg-[#e0961f] transition">
              View matches
            </Link>
            <Link to="/standings" className="border border-[#2A3441] text-slate-300 text-[13px] px-4 py-2 rounded hover:border-slate-500 transition">
              Standings
            </Link>
          </div>
        </div>
      </section>

      {/* League at a glance */}
      <div className="grid grid-cols-3 gap-4 rounded-lg border border-[#1C2430] bg-[#0F141C] px-5 py-4 mb-6">
        <Stat value={counts.barangays ?? "—"} label="Barangays" />
        <Stat value={counts.sports ?? "—"} label="Sports" />
        <Stat value={counts.liveNow ?? 0} label="Live now" />
      </div>

      {/* Live and today */}
      {live.length > 0 && (
        <Panel title="Live now" count={`${live.length}`}>
          <div>{live.map((m) => <MiniScore key={m.id} m={m} />)}</div>
        </Panel>
      )}

      {today.length > 0 && (
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
      )}

      {/* About the league */}
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

      {/* About Kolambugan */}
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

      {/* Recent results */}
      {recent.length > 0 && (
        <Panel title="Recent results" count={`${recent.length}`}>
          <div>{recent.slice(0, 5).map((m) => <MiniScore key={m.id} m={m} />)}</div>
          <div className="px-4 py-2.5 border-t border-[#1C2430]">
            <Link to="/matches" className="text-[#F5A524] text-[12px] hover:underline">All results →</Link>
          </div>
        </Panel>
      )}
    </>
  );
}