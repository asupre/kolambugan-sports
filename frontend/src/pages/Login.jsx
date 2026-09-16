import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChessKnight,
  CircleDot,
  Dumbbell,
  Eye,
  EyeOff,
  Gamepad2,
  LockKeyhole,
  Medal,
  ShieldCheck,
  Swords,
  Target,
  Trophy,
  Users2,
  Volleyball,
  Whistle,
} from "lucide-react";
import { api } from "../api";
import LoadingScreen from "../components/LoadingScreen";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

// A scattered texture of generic sport glyphs, not team logos or copyrighted
// art (see the Mobile Legends rule in CLAUDE.md) — just enough to read as
// "a sports league" behind the gradient without competing with the text.
const SPORT_GLYPHS = [
  { Icon: Volleyball, top: "8%", left: "72%", size: 64, rotate: -12 },
  { Icon: Trophy, top: "22%", left: "18%", size: 44, rotate: 8 },
  { Icon: Dumbbell, top: "40%", left: "85%", size: 52, rotate: 20 },
  { Icon: Whistle, top: "62%", left: "8%", size: 40, rotate: -18 },
  { Icon: ChessKnight, top: "78%", left: "60%", size: 48, rotate: 10 },
  { Icon: Gamepad2, top: "12%", left: "45%", size: 40, rotate: -6 },
  { Icon: Target, top: "88%", left: "30%", size: 44, rotate: 4 },
  { Icon: CircleDot, top: "50%", left: "35%", size: 32, rotate: 0 },
  { Icon: Swords, top: "34%", left: "60%", size: 36, rotate: -24 },
  { Icon: Medal, top: "68%", left: "82%", size: 36, rotate: 14 },
];

function SportsBackdrop() {
  return (
    <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
      {SPORT_GLYPHS.map(({ Icon, top, left, size, rotate }, i) => (
        <Icon
          key={i}
          className="absolute text-white/10"
          style={{ top, left, width: size, height: size, transform: `rotate(${rotate}deg)` }}
        />
      ))}
    </div>
  );
}

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [counts, setCounts] = useState(null); // { barangays, sports } — from /api/public/overview
  const navigate = useNavigate();

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
        barangay_admin: "/brgy",
        organizer: "/organizer",
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
        <SportsBackdrop />
        <div className="absolute -top-24 -right-24 size-96 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute bottom-0 left-0 size-72 rounded-full bg-[oklch(0.7_0.2_70)]/20 blur-3xl" />

        <div className="relative flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-white/15 backdrop-blur flex items-center justify-center">
            <span className="font-bold text-sm">K</span>
          </div>
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
            <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-lg">K</span>
            </div>
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
