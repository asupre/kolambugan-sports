// Small fetch wrapper that attaches the JWT and parses JSON.
//
// A hung backend request (a slow DB, a network blip) used to leave a "Saving…"
// button stuck forever with no way out but a page refresh — the fetch promise
// just never resolved. A default timeout means it always settles one way or
// another; pass { timeoutMs: 0 } to disable it for a call that's expected to
// run long.
const DEFAULT_TIMEOUT_MS = 20000;

export async function api(path, options = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchOptions } = options;
  const token = localStorage.getItem("token");

  const controller = timeoutMs > 0 && !fetchOptions.signal ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  let res;
  try {
    res = await fetch(path, {
      ...fetchOptions,
      signal: fetchOptions.signal || controller?.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(fetchOptions.headers || {}),
      },
    });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("The server took too long to respond. Check your connection and try again.");
    }
    throw new Error("Could not reach the server. Check your connection and try again.");
  } finally {
    if (timer) clearTimeout(timer);
  }

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