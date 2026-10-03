import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import InstructionModal from "../components/InstructionModal";
import { PasswordInput, PasswordMatchHint } from "../components/PasswordInput";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";

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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card/60">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-2.5 px-4 sm:px-8">
          <img src="/logo/ksl-mark-simple.svg" alt="" className="h-9 w-9" />
          <span className="text-[16px] font-semibold">Kolambugan Sports</span>
        </div>
      </header>

      <main className="mx-auto flex max-w-md flex-col px-4 py-10 sm:py-16">
        <h1 className="text-[30px] font-semibold leading-tight tracking-tight sm:text-[34px]">Set a new password</h1>
        <p className="mt-1.5 text-[16px] text-muted-foreground">
          For your security, replace your temporary password before continuing.
          {user?.username && <> Signed in as <span className="font-medium text-foreground">{user.username}</span>.</>}
        </p>

        <div className="mt-7 rounded-2xl border bg-card p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="cp-current">Current password</Label>
              <PasswordInput
                id="cp-current"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Your temporary password"
                autoComplete="current-password"
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
                placeholder="Re-enter your new password"
                autoComplete="new-password"
              />
              <PasswordMatchHint password={newPassword} confirm={confirm} />
            </div>

            {error && (
              <p className="rounded-xl border border-red-500/30 bg-red-500/5 px-3 py-2 text-[14px] text-red-700 dark:text-red-400">{error}</p>
            )}

            <Button type="submit" size="lg" disabled={loading} className="w-full">
              {loading ? "Updating…" : "Update password"}
            </Button>
          </form>
        </div>
      </main>

      {showIntro && (
        <InstructionModal role={user?.role} onClose={() => navigate(dest)} />
      )}
    </div>
  );
}