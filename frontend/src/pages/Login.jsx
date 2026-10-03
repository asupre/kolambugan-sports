import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, Eye, EyeOff, KeyRound, LockKeyhole } from "lucide-react";
import { api } from "../api";
import LoadingScreen from "../components/LoadingScreen";
import AuthBrandPanel from "../components/AuthBrandPanel";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { PasswordInput, PasswordMatchHint } from "../components/PasswordInput";
import { Label } from "../components/ui/label";

// Super Admin password reset via a saved recovery code — see
// POST /api/auth/forgot-password. Scoped server-side to super_admin accounts
// (a Barangay Admin/Organizer has no recovery code; they're reset by a Super
// Admin from the Accounts panel instead), but the form itself doesn't need to
// know that — a wrong username/role just comes back as "Invalid username or
// recovery code," same generic message as login.
function ForgotPasswordDialog({ open, onOpenChange }) {
  const [username, setUsername] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  function reset() {
    setUsername(""); setRecoveryCode(""); setNewPassword(""); setConfirm("");
    setError(""); setBusy(false); setDone(false);
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (newPassword.length < 8) return setError("New password must be at least 8 characters.");
    if (newPassword !== confirm) return setError("The new passwords do not match.");
    setBusy(true);
    try {
      await api("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ username: username.trim(), recoveryCode: recoveryCode.trim(), newPassword }),
      });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><KeyRound className="size-4" /> Reset with recovery code</DialogTitle>
          <DialogDescription>
            For Super Admin accounts only. Enter the recovery code you saved when you generated it
            from your profile. Barangay Admins and Organizers should ask their Super Admin to reset
            their password instead.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <>
            <Alert className="border-green-500/30 bg-green-500/5 text-green-700 dark:text-green-400">
              <CheckCircle2 className="size-4" />
              <AlertDescription>
                Password reset. You can now sign in with your new password. Once you're back in,
                generate a new recovery code from your profile. This one has been used up.
              </AlertDescription>
            </Alert>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Back to sign in</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="fp-username">Username</Label>
              <Input id="fp-username" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fp-code">Recovery code</Label>
              <Input id="fp-code" value={recoveryCode} onChange={(e) => setRecoveryCode(e.target.value)}
                placeholder="XXXX-XXXX-XXXX-XXXX" className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fp-new">New password</Label>
              <PasswordInput id="fp-new" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters" autoComplete="new-password" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fp-confirm">Confirm new password</Label>
              <PasswordInput id="fp-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password" />
              <PasswordMatchHint password={newPassword} confirm={confirm} />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button type="submit" disabled={busy || !username.trim() || !recoveryCode.trim()}>
                {busy ? "Resetting…" : "Reset password"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    const el = document.documentElement;
    el.classList.add("calm-theme");
    return () => el.classList.remove("calm-theme");
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
      <AuthBrandPanel />

      {/* Sign-in form */}
      <div className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="flex lg:hidden justify-center mb-6">
            <Link to="/" title="Go to the public site" className="rounded-full transition-opacity hover:opacity-80">
              <img src="/logo/ksl-mark-simple.svg" alt="Kolambugan Sports" className="h-12 w-12" />
            </Link>
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
                  className="absolute inset-y-0 right-0 w-10 flex items-center justify-center text-muted-foreground hover:text-foreground"
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

          <button
            type="button"
            onClick={() => setForgotOpen(true)}
            className="flex items-center gap-1.5 justify-center text-muted-foreground text-xs mt-6 mx-auto hover:text-foreground transition"
          >
            <LockKeyhole className="size-3.5" />
            Forgot your password?
          </button>

          <p className="text-center text-muted-foreground/70 text-xs mt-4">
            Inter-Barangay Sports League · Municipality of Kolambugan
          </p>
        </div>
      </div>

      <ForgotPasswordDialog open={forgotOpen} onOpenChange={setForgotOpen} />
    </div>
  );
}
