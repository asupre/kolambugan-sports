import { useState } from "react";
import { useNavigate } from "react-router-dom";
import InstructionModal from "../components/InstructionModal";

export default function ChangePassword() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showIntro, setShowIntro] = useState(false);
  const navigate = useNavigate();

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
    } catch (err) {
      setError("Could not reach the server. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-6">
          <img src="/logo/ksl-mark-simple.svg" alt="Kolambugan Sports" className="h-12 w-12" />
        </div>

        <div className="text-center mb-8">
          <h1 className="text-slate-900 text-xl font-semibold">Set a new password</h1>
          <p className="text-slate-500 text-sm mt-1">
            For your security, please change your temporary password before continuing.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-slate-700 text-sm font-medium mb-1.5">Current password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Your temporary password"
                className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 px-3 py-2.5 text-sm placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                autoComplete="current-password"
              />
            </div>

            <div>
              <label className="block text-slate-700 text-sm font-medium mb-1.5">New password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 px-3 py-2.5 text-sm placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                autoComplete="new-password"
              />
            </div>

            <div>
              <label className="block text-slate-700 text-sm font-medium mb-1.5">Confirm new password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Re-enter your new password"
                className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 px-3 py-2.5 text-sm placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                autoComplete="new-password"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-blue-600 text-white text-sm font-medium py-2.5 hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {loading ? "Updating..." : "Update password"}
            </button>
          </form>
        </div>
      </div>

      {showIntro && (
        <InstructionModal role={user?.role} onClose={() => navigate(dest)} />
      )}
    </div>
  );
}