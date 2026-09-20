import { useEffect, useState } from "react";
import { api } from "../api";

// The season lifecycle, in order. Only the Super Admin advances it, and only one
// step at a time, so this is also the order things happen in.
export const SEASON_STAGES = [
  { key: "setup", label: "Setup", short: "Setting up" },
  { key: "registration_open", label: "Registration", short: "Registration open" },
  { key: "verification", label: "Verification", short: "Verification" },
  { key: "ongoing", label: "Ongoing", short: "Ongoing" },
  { key: "completed", label: "Completed", short: "Completed" },
];

// The current season, fetched once per mount. `/api/seasons/current` is public,
// so any role can read it. `season` is null while loading or if none exists yet.
export function useSeason() {
  const [season, setSeason] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    api("/api/seasons/current")
      .then((d) => { if (alive) setSeason(d.season || null); })
      .catch(() => { if (alive) setSeason(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  return { season, loading };
}
