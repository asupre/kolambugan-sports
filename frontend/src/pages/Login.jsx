import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Input, Label } from "../components/ui";

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
          <div className="h-12 w-12 rounded-xl bg-indigo-600 flex items-center justify-center">
            <span className="text-white font-bold text-lg">K</span>
          </div>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-slate-900 text-xl font-semibold">Welcome back</h1>
          <p className="text-slate-500 text-sm mt-1">Sign in to the Kolambugan Sports admin</p>
        </div>

        <Card className="p-6">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Label>Username</Label>
              <Input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. sk_federation"
                autoComplete="username"
              />
            </div>
            <div>
              <Label>Password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
              />
            </div>
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </Card>

        <p className="text-center text-slate-400 text-xs mt-6">
          Inter-Barangay Sports League · Municipality of Kolambugan
        </p>
      </div>
    </div>
  );
}