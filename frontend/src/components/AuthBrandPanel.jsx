import { lazy, Suspense, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck, Trophy, Users2 } from "lucide-react";
import { api } from "../api";

// The green animated brand panel on the LEFT of the sign-in screens (desktop only). Shared by
// Login and the first-login "Set a new password" page so the two look like one flow.

// React Bits "Gradient Waves" (WebGL). Lazy so its chunk + `ogl` never touch the
// main bundle — only the sign-in pages ever fetch it.
const GradientWaves = lazy(() => import("./GradientWaves"));

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return matches;
}

export default function AuthBrandPanel() {
  // The panel is `hidden lg:flex`, so on phones it is display:none — but a hidden element would
  // still MOUNT the WebGL canvas. Only render the waves at desktop widths.
  const wide = useMediaQuery("(min-width: 1024px)");
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  // Pulled live rather than hardcoded — League Setup can add/remove sports and barangays.
  const [counts, setCounts] = useState(null);
  useEffect(() => {
    api("/api/public/overview")
      .then((d) => setCounts(d.counts || null))
      .catch(() => {});
  }, []);

  // Hidden on phones; the one screen that gets to be a little more decorative since every
  // role lands here first.
  return (
    <div className="hidden lg:flex relative flex-col justify-between overflow-hidden bg-gradient-to-br from-[#174A31] via-[#1D5A3C] to-[#0A2A1B] p-12 text-white">
      {/* Layers, bottom to top (green since Oct 2026, was purple): the green gradient (fallback) -> React Bits
          GradientWaves (animated, desktop only; frozen under
          prefers-reduced-motion via speed 0) -> one scrim for text legibility. */}
      {wide && (
        <div className="absolute inset-0" aria-hidden="true">
          <Suspense fallback={null}>
            <GradientWaves
              horizonColor="#05241A"
              waveColor="#13603F"
              crestColor="#6EE0A6"
              fogDepth={60}
              amplitude={3}
              speed={reduceMotion ? 0 : 0.35}
              mouseInteraction={!reduceMotion}
              grainIntensity={0.04}
            />
          </Suspense>
        </div>
      )}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "linear-gradient(180deg, rgba(4,28,18,0.55) 0%, rgba(4,28,18,0.35) 45%, rgba(4,28,18,0.88) 100%)" }}
      />

      <Link
        to="/"
        title="Go to the public site"
        className="relative flex w-fit items-center gap-2.5 rounded-md transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
      >
        <img src="/logo/ksl-mark-simple.svg" alt="" className="h-9 w-9" />
        <span className="font-semibold">Kolambugan Sports</span>
      </Link>

      <div className="relative space-y-6 max-w-md">
        <div className="inline-flex flex-col items-center gap-4">
          {/* The gold trophy from the Champions leaderboard (public/medals). */}
          <img src="/medals/trophy.png" alt="" className="h-16 w-16 object-contain drop-shadow-[0_6px_18px_rgba(250,204,21,0.35)]" />
          {/* Same lettering as the public Home hero (Anton, capitals): line 1 white, line 2 in
              a yellow-to-gold gradient (mint blended into the waves). */}
          <h1 className="font-['Anton'] font-normal uppercase leading-[0.92] tracking-tight drop-shadow-[0_2px_16px_rgba(0,0,0,0.45)]">
            <span className="block text-white text-[54px] xl:text-[68px]">Inter-Barangay</span>
            <span className="block bg-gradient-to-r from-[#FDE68A] via-[#FACC15] to-[#F5A524] bg-clip-text text-transparent text-[54px] xl:text-[68px]">
              Sports League
            </span>
          </h1>
        </div>
        <p className="text-[22px] font-semibold text-white/90 drop-shadow-[0_1px_8px_rgba(0,0,0,0.4)]">Run without the paper trail.</p>
        <p className="text-white/80 text-[15px] leading-relaxed">
          Residency verification, live scoring, and standings for every
          barangay and every sport, all in one place, all season long.
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-3 pt-2 text-sm text-white/85">
          <span className="flex items-center gap-1.5">
            <Users2 className="size-4" /> {counts?.barangays ?? "–"} barangays
          </span>
          <span className="flex items-center gap-1.5">
            <Trophy className="size-4" /> {counts?.sports ?? "–"} sports
          </span>
          <span className="flex items-center gap-1.5"><ShieldCheck className="size-4" /> Verified residency</span>
        </div>
      </div>

      <p className="relative text-white/60 text-xs">
        Municipality of Kolambugan, Lanao del Norte
      </p>
    </div>
  );
}
