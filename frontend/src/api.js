// Small fetch wrapper that attaches the JWT and parses JSON.
export async function api(path, options = {}) {
  const token = localStorage.getItem("token");
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  // An expired token surfaced as "Authentication required" in the middle of a
  // page, which tells nobody what to do about it. Clear the dead session and
  // send them to log in again.
  if (res.status === 401 && token) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    if (!window.location.pathname.startsWith("/login")) {
      window.location.href = "/login?expired=1";
    }
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Request failed.");
  return data;
}