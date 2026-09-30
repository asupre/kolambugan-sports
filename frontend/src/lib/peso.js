// Champion prizes are stored as text ("₱15,000", or older free text like
// "₱15,000 + trophy"). The admin form types only the amount; these helpers add
// the peso sign and thousands commas so nobody has to type "₱".

const PESO = "₱";
const NUMERIC = /^[\d,]+(\.\d{0,2})?$/;

const withCommas = (digits) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

// Live formatting while typing: a plain amount gets commas ("15000" → "15,000");
// anything with words in it (an older "15,000 + trophy") is left as typed.
export function formatAmountInput(text) {
  const v = String(text || "").replace(/^\s*₱\s*/, "");
  if (!NUMERIC.test(v)) return v;
  const [whole, dec] = v.replace(/,/g, "").split(".");
  return withCommas(whole) + (dec !== undefined ? `.${dec}` : "");
}

// The form's value (no ₱) from a stored prize.
export const prizeAmount = (prize) => String(prize || "").replace(/^\s*₱\s*/, "");

// What gets saved and shown: "₱" in front of anything that starts with a number.
// Text that doesn't ("Trophy only") is left alone.
export function formatPrize(prize) {
  const v = formatAmountInput(String(prize || "").trim()).trim();
  if (!v) return "";
  return /^\d/.test(v) ? `${PESO}${v}` : v;
}
