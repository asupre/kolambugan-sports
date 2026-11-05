// Age in whole years from a birthdate (Date, ISO string or "YYYY-MM-DD"); null without one.
export function ageFrom(birthdate) {
  if (!birthdate) return null;
  const d = new Date(birthdate), now = new Date();
  if (isNaN(d.getTime())) return null;
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a;
}
