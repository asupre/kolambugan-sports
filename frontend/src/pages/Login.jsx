import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

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
      } else {
        localStorage.setItem("token", data.token);
        localStorage.setItem("user", JSON.stringify(data.user));

        // First-login users must change their password before anything else.
        if (data.mustChangePassword) {
          navigate("/change-password");
          return;
        }
        // Otherwise, send each role to its home.
        const dest = {
          super_admin: "/admin",
          barangay_admin: "/barangay",
          organizer: "/organizer",
        }[data.user.role] || "/";
        navigate(dest);
      }
    } catch (err) {
      setError("Could not reach the server. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-brand-card rounded-2xl p-6 shadow-lg">
        <h1 className="text-brand-gold text-2xl font-bold text-center mb-1">
          Kolambugan Sports
        </h1>
        <p className="text-slate-400 text-center text-sm mb-6">Admin Login</p>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-slate-300 text-sm mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg bg-brand-navy text-white px-3 py-2 outline-none focus:ring-2 focus:ring-brand-gold"
              autoComplete="username"
            />
          </div>
          <div>
            <label className="block text-slate-300 text-sm mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg bg-brand-navy text-white px-3 py-2 outline-none focus:ring-2 focus:ring-brand-gold"
              autoComplete="current-password"
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-brand-gold text-brand-bg font-semibold py-2 hover:opacity-90 disabled:opacity-50 transition"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}