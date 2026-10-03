import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import InstructionModal from "../components/InstructionModal";
import { PasswordInput, PasswordMatchHint } from "../components/PasswordInput";
import { KeyRound } from "lucide-react";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { Alert, AlertDescription } from "../components/ui/alert";
import AuthBrandPanel from "../components/AuthBrandPanel";

export default function ChangePassword() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showIntro, setShowIntro] = useState(false);
  const navigate = useNavigate();

  // Same calm look as the login and admin pages (Oct 2026; this page was still the old blue).
  useEffect(() => {
    const el = document.documentElement;
    el.classList.add("calm-theme");
    return () => el.classList.remove("calm-theme");
  }, []);

  const user = JSON.parse(localStorage.getItem("user") || "null");
  const dest = {
    super_admin: "/admin",
    barangay_admin: "/brgy/dashboard",
    organizer: "/organizer/dashboard",
  }[user?.role] || "/";

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    // Client-side checks before hitting the server.
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirm) {
      setError("The new passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Could not change password.");
      } else {
        // Success — this is a real first login (mustChangePassword only ever
        // fires once), so show the orientation modal before sending them to
        // their dashboard rather than navigating immediately.
        setShowIntro(true);
      }
    } catch {
      setError("Could not reach the server. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }

  // Same two-column screen as Login (Oct 2026): the green animated panel on the left (desktop),
  // the form on the right, so first login reads as one flow.
  return (
    <div className="min-h-screen bg-background grid lg:grid-cols-2">
      <AuthBrandPanel />

      <div className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="flex lg:hidden justify-center mb-6">
            <img src="/logo/ksl-mark-simple.svg" alt="Kolambugan Sports" className="h-12 w-12" />
          </div>

          <div className="mb-8">
            <div className="mb-3 hidden lg:inline-flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <KeyRound className="size-5" />
            </div>
            <h1 className="text-2xl font-semibold">Set a new password</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Replace your temporary password before you continue.
              {user?.username && <> You're signed in as <span className="font-medium text-foreground">{user.username}</span>.</>}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cp-current">Temporary password</Label>
              <PasswordInput
                id="cp-current"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="The password you were given"
                autoComplete="current-password"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cp-new">New password</Label>
              <PasswordInput
                id="cp-new"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cp-confirm">Confirm new password</Label>
              <PasswordInput
                id="cp-confirm"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Type it again"
                autoComplete="new-password"
              />
              <PasswordMatchHint password={newPassword} confirm={confirm} />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" disabled={loading} className="w-full h-9">
              {loading ? "Saving…" : "Save and continue"}
            </Button>
          </form>

          <p className="text-center text-muted-foreground/70 text-xs mt-6">
            Inter-Barangay Sports League · Municipality of Kolambugan
          </p>
        </div>
      </div>

      {showIntro && (
        <InstructionModal role={user?.role} onClose={() => navigate(dest)} />
      )}
    </div>
  );
}