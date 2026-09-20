import { lazy, Suspense, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, LockKeyhole, ShieldCheck, Trophy, Users2 } from "lucide-react";
import { api } from "../api";
import LoadingScreen from "../components/LoadingScreen";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

// React Bits "Gradient Waves" (WebGL). Lazy so its chunk + `ogl` never touch the
// main bundle — only the login page ever fetches it.
const GradientWaves = lazy(() => import("../components/GradientWaves"));

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

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [counts, setCounts] = useState(null); // { barangays, sports } — from /api/public/overview
  const navigate = useNavigate();
  // The brand panel is `hidden lg:flex`, so on phones it is display:none — but a
  // hidden element would still MOUNT the WebGL canvas. Only render the waves at
  // desktop widths so phones never download or run them at all.
  const wide = useMediaQuery("(min-width: 1024px)");
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  // Pulled live rather than hardcoded — the League Setup page lets the Super
  // Admin add/remove sports and barangays mid-season (e.g. adding a Mobile
  // Legends-style esport), so a fixed "26 barangays · 7 sports" goes stale
  // the moment that happens.
  useEffect(() => {
    api("/api/public/overview")
      .then((d) => setCounts(d.counts || null))
      .catch(() => {});
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Login failed.");
        setLoading(false);
        return;
      }
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      if (data.mustChangePassword) {
        navigate("/change-password");
        return;
      }
      const dest = {
        super_admin: "/admin",
        barangay_admin: "/brgy/dashboard",
        organizer: "/organizer/dashboard",
      }[data.user.role] || "/";
      navigate(dest);
      // loading stays true — this page unmounts on navigate, no reset needed,
      // and it keeps the full-screen loader up through the route change
      // instead of flashing the form again for a frame.
    } catch {
      setError("Could not reach the server. Is the backend running?");
      setLoading(false);
    }
  }

  if (loading) return <LoadingScreen message="Signing in…" />;

  return (
    <div className="min-h-screen bg-background grid lg:grid-cols-2">
      {/* Brand panel — hidden on phones, this is the one screen that gets to be a
          little more decorative since every role lands here first. */}
      <div className="hidden lg:flex relative flex-col justify-between overflow-hidden bg-gradient-to-br from-primary via-primary to-[oklch(0.34_0.19_290)] p-12 text-primary-foreground">
        {/* Layers, bottom to top: the purple gradient (fallback) -> React Bits
            GradientWaves (animated, desktop only; frozen under
            prefers-reduced-motion via speed 0) -> one scrim for text legibility. */}
        {wide && (
          <div className="absolute inset-0" aria-hidden="true">
            <Suspense fallback={null}>
              <GradientWaves
                horizonColor="#170844"
                waveColor="#2b1382"
                crestColor="#8b5cff"
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
          style={{ background: "linear-gradient(180deg, rgba(20,8,48,0.55) 0%, rgba(20,8,48,0.25) 40%, rgba(20,8,48,0.88) 100%)" }}
        />

        <div className="relative flex items-center gap-2.5">
          <img src="/logo/ksl-mark-simple.svg" alt="" className="h-9 w-9" />
          <span className="font-semibold">Kolambugan Sports</span>
        </div>

        <div className="relative space-y-6 max-w-md">
          <Trophy className="size-10 opacity-90" />
          <h1 className="text-3xl font-semibold leading-tight">
            Inter-Barangay Sports League, run without the paper trail.
          </h1>
          <p className="text-primary-foreground/80 text-sm leading-relaxed">
            Residency verification, live scoring, and standings for every
            barangay and every sport — all in one place, all season long.
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-3 pt-2 text-sm text-primary-foreground/80">
            <span className="flex items-center gap-1.5">
              <Users2 className="size-4" /> {counts?.barangays ?? "–"} barangays
            </span>
            <span className="flex items-center gap-1.5">
              <Trophy className="size-4" /> {counts?.sports ?? "–"} sports
            </span>
            <span className="flex items-center gap-1.5"><ShieldCheck className="size-4" /> Verified residency</span>
          </div>
        </div>

        <p className="relative text-primary-foreground/60 text-xs">
          Municipality of Kolambugan, Lanao del Norte
        </p>
      </div>

      {/* Sign-in form */}
      <div className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="flex lg:hidden justify-center mb-6">
            <img src="/logo/ksl-mark-simple.svg" alt="Kolambugan Sports" className="h-12 w-12" />
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-semibold">Welcome back</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Sign in with the account provisioned for you.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. sk_federation"
                autoComplete="username"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  className="pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-0 top-0 h-8 w-9 flex items-center justify-center text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" className="w-full h-9">
              Sign in
            </Button>
          </form>

          <p className="flex items-center gap-1.5 justify-center text-muted-foreground text-xs mt-6">
            <LockKeyhole className="size-3.5" />
            Forgot your password? Ask your Super Admin to reset it.
          </p>

          <p className="text-center text-muted-foreground/70 text-xs mt-4">
            Inter-Barangay Sports League · Municipality of Kolambugan
          </p>
        </div>
      </div>
    </div>
  );
}
