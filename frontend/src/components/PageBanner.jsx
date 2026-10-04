import { HelpCircle } from "lucide-react";

// Page banners (Oct 2026; layout from the Super Admin's banner.webp / newb.webp references).
// Every admin page except the Dashboards (they have the "Hello" picture banner) and Season (its
// photo season card is enough) opens with a rounded PHOTO banner: the page name small on top, one
// bold line, a white "How this works" pill (opens the guide on THIS page's step, stepForPath), and
// a dark shade on the left so the white text reads on any photo.
// Photos: frontend/public/banners/*.webp (free stock photos chosen by the Super Admin, cropped and
// scaled to 2000px). `focus` = CSS object-position, so the subject stays in view: on a wide desktop
// the banner is ~7:1 and shows only a strip of the photo. `tone` is the colour shown while the
// photo loads (or if it fails). A page with no entry keeps the plain title + subtitle header.

const TONES = {
  sky: "bg-[#2F7BE0]", teal: "bg-[#0F9F8A]", amber: "bg-[#C9821A]", indigo: "bg-[#3B3FB8]",
  gold: "bg-[#8A6A1A]", cyan: "bg-[#1689A8]", pink: "bg-[#5A3A48]", slate: "bg-[#3D4B63]",
  green: "bg-[#2F6B4B]", coral: "bg-[#B5603A]", plum: "bg-[#4A2E5C]",
};

// Longest matching path prefix wins (so /admin/tournaments/:sportId uses /admin/tournaments).
export const BANNERS = {
  "/admin/reference": { photo: "referencelist", focus: "50% 60%", tone: "sky", headline: "Every player checked against the list" },
  "/admin/review": { photo: "reviewqueue", focus: "50% 80%", tone: "teal", headline: "Give the official verdict" },
  "/admin/config": { photo: "leaguesetup", focus: "50% 62%", tone: "amber", headline: "Set up the games and barangays" },
  "/admin/tournaments": { photo: "tournaments", focus: "50% 50%", tone: "indigo", headline: "Draw the brackets, follow every game" },
  "/admin/reports": { photo: "reports", focus: "75% 50%", tone: "cyan", headline: "The whole league in numbers" },
  "/admin/champions": { photo: "champions", focus: "50% 45%", tone: "gold", headline: "Every title, every season" },
  "/admin/site-images": { photo: "siteimages", focus: "50% 32%", tone: "pink", headline: "Pictures for the public site" },
  "/admin/accounts": { photo: "accounts", focus: "50% 35%", tone: "slate", headline: "A login for every official" },
  "/brgy/documents": { photo: "verificationstatus", focus: "50% 50%", tone: "coral", headline: "Send the documents asked for" },
  "/brgy/matches": { photo: "matchesbrgy", focus: "50% 62%", tone: "sky", headline: "Follow your barangay's games" },
  "/brgy": { photo: "myteams", focus: "50% 38%", tone: "green", headline: "Register your teams and players" },
  "/organizer": { photo: "matchesorganizer", focus: "50% 50%", tone: "plum", headline: "Score every game courtside" },
};

const DASHBOARDS = ["/admin", "/brgy/dashboard", "/organizer/dashboard"];

export function bannerFor(pathname) {
  if (DASHBOARDS.includes(pathname)) return null;
  const key = Object.keys(BANNERS)
    .filter((k) => pathname === k || pathname.startsWith(k + "/"))
    .sort((a, b) => b.length - a.length)[0];
  return key ? BANNERS[key] : null;
}

export default function PageBanner({ banner, title, onHelp }) {
  return (
    <div className={`relative mb-7 overflow-hidden rounded-2xl ${TONES[banner.tone] || TONES.green} shadow-sm print:hidden`}>
      <img
        src={`/banners/${banner.photo}.webp`}
        alt=""
        decoding="async"
        style={{ objectPosition: banner.focus }}
        className="absolute inset-0 size-full object-cover"
        onError={(e) => { e.currentTarget.style.display = "none"; }}
      />
      {/* Dark on the left behind the text, clearing toward the right where the subject is. */}
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/45 to-black/5" />
      <div className="relative flex min-h-[132px] flex-col justify-center py-5 pl-5 pr-5 sm:min-h-[156px] sm:pl-7">
        <div className="min-w-0 max-w-[34rem] text-white [text-shadow:0_1px_10px_rgba(0,0,0,0.35)]">
          <h1 className="text-[13px] font-medium text-white/85 sm:text-[14px]">{title}</h1>
          <p className="mt-0.5 text-[21px] font-bold leading-tight tracking-tight sm:text-[27px]">{banner.headline}</p>
        </div>
        <button
          type="button"
          onClick={onHelp}
          className="mt-3.5 inline-flex w-fit items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-[13px] font-semibold text-slate-900 shadow-sm transition hover:bg-white/90"
        >
          <HelpCircle className="size-3.5" /> How this works
        </button>
      </div>
    </div>
  );
}
