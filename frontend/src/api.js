// Small fetch wrapper that attaches the JWT and parses JSON.
//
// A hung backend request (a slow DB, a network blip) used to leave a "Saving…"
// button stuck forever with no way out but a page refresh — the fetch promise
// just never resolved. A default timeout means it always settles one way or
// another; pass { timeoutMs: 0 } to disable it for a call that's expected to
// run long.
const DEFAULT_TIMEOUT_MS = 20000;

// A random id for THIS browser tab (Oct 2026). Up to three devices share one organizer login
// on a match, and the server gives each job to one device; this id is how it tells them apart.
// sessionStorage = one id per tab, kept across reloads, gone when the tab is closed.
export function deviceId() {
  try {
    let id = sessionStorage.getItem('device-id');
    if (!id) {
      id = (crypto.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/[^A-Za-z0-9_-]/g, '');
      sessionStorage.setItem('device-id', id);
    }
    return id;
  } catch {
    return null;
  }
}

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
        ...(deviceId() ? { "X-Device-Id": deviceId() } : {}),
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
  // status + code ride along so a screen can react to a specific refusal (e.g. a stale form).
  if (!res.ok) throw Object.assign(new Error(data.message || "Request failed."), { status: res.status, code: data.code });
  return data;
}