import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { Panel, SiteImage } from "../../components/PublicUI";
import Reveal from "../../components/Reveal";




function Step({ n, title, children }) {
  return (
    <div className="flex gap-4 px-4 sm:px-5 py-4 border-b border-white/[0.08] last:border-0">
      <div className="w-7 h-7 rounded-full bg-[#242C27] text-[#4ADE80] text-[13px] font-semibold flex items-center justify-center shrink-0">
        {n}
      </div>
      <div className="min-w-0">
        <h3 className="text-slate-100 text-[16px] font-semibold mb-1">{title}</h3>
        <p className="text-slate-400 text-[15px] leading-relaxed">{children}</p>
      </div>
    </div>
  );
}

export default function About() {
  const [counts, setCounts] = useState({});

  useEffect(() => {
    let alive = true;
    api("/api/public/overview")
      .then((d) => { if (alive) setCounts(d.counts || {}); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  return (
    <>
      <h1 className="text-slate-50 text-[32px] sm:text-[40px] font-semibold tracking-tight leading-tight mb-1.5">About</h1>
      <p className="text-slate-400 text-[16px] sm:text-[17px] mb-8">
        The Inter-Barangay Sports League and how this site works
      </p>

      {/* SAMPLE COPY — replace before deployment. */}
      <Reveal>
      <section className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
        <SiteImage slot="about" label="league photo" className="w-full h-56 rounded-lg border border-white/[0.08]" />
        <div className="flex flex-col justify-center">
          <h2 className="text-slate-100 text-lg font-semibold mb-2">The league</h2>
          <p className="text-slate-400 text-[14px] leading-relaxed mb-3">
            The Inter-Barangay Sports League is organised by the Sangguniang
            Kabataan Federation of Kolambugan, bringing every barangay in the
            municipality into a single competitive season across{" "}
            {counts.sports || "several"} sports.
          </p>
          <p className="text-slate-400 text-[14px] leading-relaxed">
            Each barangay registers its own teams, submits its rosters, and
            competes for the municipal title in its division. Results are recorded
            courtside as matches are played, so what you see here is the live state
            of the season.
          </p>
        </div>
      </section>
      </Reveal>

      {/* SAMPLE COPY — replace before deployment. */}
      <Reveal>
      <Panel title="How a season runs">
        <div>
          <Step n="1" title="Registration">
            Each barangay's SK Chairperson registers a team for a sport and division,
            then builds a roster within the size limits for that entry format.
          </Step>
          <Step n="2" title="Residency verification">
            Every player is checked against the municipality's reference list of
            residents. Anyone the system can't confirm automatically submits a
            supporting document, which the SK Federation reviews before the player
            is cleared.
          </Step>
          <Step n="3" title="The draw">
            Verified teams are drawn into groups. Group results decide who advances,
            and the qualifiers move into the knockout bracket.
          </Step>
          <Step n="4" title="Match day">
            A designated organizer scores each match courtside. Scores, standings,
            and brackets on this site update as the game is played.
          </Step>
          <Step n="5" title="Champions">
            The bracket decides the title. Past winners are recorded in the{" "}
            <Link to="/champions" className="text-[#4ADE80] hover:underline">Champions</Link>{" "}
            archive.
          </Step>
        </div>
      </Panel>
      </Reveal>

      <Reveal delay={0.05}>
      <Panel title="Using this site">
        <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
          {[
            ["Matches", "/matches", "Live scores, upcoming fixtures, and results."],
            ["Standings", "/standings", "Group tables and who is qualifying."],
            ["Brackets", "/brackets", "The full knockout and group bracket trees."],
            ["Teams", "/teams", "Every verified team and its roster."],
            ["Players", "/players", "Rosters by team, and this season's top scorers."],
            ["Champions", "/champions", "Past winners by year and sport."],
          ].map(([label, to, desc]) => (
            <div key={to} className="flex gap-3">
              <Link to={to} className="text-[#4ADE80] text-[15px] font-medium w-24 shrink-0 hover:underline">
                {label}
              </Link>
              <span className="text-slate-400 text-[15px]">{desc}</span>
            </div>
          ))}
        </div>
      </Panel>
      </Reveal>

      {/* SAMPLE COPY — replace before deployment. */}
      <Reveal delay={0.05}>
      <Panel title="Organised by">
        <div className="px-4 sm:px-5 py-4 space-y-3">
          <div>
            <h3 className="text-slate-100 text-[16px] font-medium">Sangguniang Kabataan Federation of Kolambugan</h3>
            <p className="text-slate-400 text-[15px] mt-0.5">
              Runs the league, verifies residency, and manages the season.
            </p>
          </div>
          <div>
            <h3 className="text-slate-100 text-[16px] font-medium">Local Youth Development Office</h3>
            <p className="text-slate-400 text-[15px] mt-0.5">
              Supports the league and provides the municipal resident records used
              for verification.
            </p>
          </div>
          <div className="pt-3 border-t border-white/[0.08]">
            <p className="text-slate-500 text-[15px] leading-relaxed">
              This system was developed as an undergraduate thesis at the Lanao
              School of Science and Technology, Inc.
            </p>
          </div>
        </div>
      </Panel>
      </Reveal>
    </>
  );
}