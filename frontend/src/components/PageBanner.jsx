import { HelpCircle } from "lucide-react";

// Page banners (Oct 2026, from the Super Admin's banner.webp reference: promo-style cards).
// Every admin page except the Dashboards and Season (removed Oct 2026: its photo season card is
// enough) (which have the "Hello" picture banner) opens with a
// rounded gradient card: the page name small on top, one bold line, a pill button, and a drawn
// illustration on the right. All inline SVG (no images to load, nothing uploaded), one colour
// per page so each tab is recognisable at a glance. Config by path in BANNERS below; a page
// with no entry keeps the plain title + subtitle header. "How this works" opens the guide on THIS
// page's step (stepForPath).

const TONES = {
  violet: "from-[#6D4AE8] to-[#8F7CF5]",
  sky: "from-[#2F7BE0] to-[#5CB8F0]",
  teal: "from-[#0F9F8A] to-[#38C9A0]",
  amber: "from-[#E8862A] to-[#F5B547]",
  indigo: "from-[#3B3FB8] to-[#6A5FE0]",
  gold: "from-[#C9821A] to-[#EDB43E]",
  cyan: "from-[#1689A8] to-[#3FC1D9]",
  pink: "from-[#D9468F] to-[#F27BB0]",
  slate: "from-[#3D4B63] to-[#62708A]",
  green: "from-[#2F6B4B] to-[#4FA374]",
  coral: "from-[#E0573F] to-[#F2896B]",
  plum: "from-[#7A2E8C] to-[#B04FB8]",
};

// Longest matching path prefix wins (so /admin/tournaments/:sportId uses /admin/tournaments).
export const BANNERS = {
  "/admin/reference": { tone: "sky", art: "clipboard", headline: "Every player checked against the list" },
  "/admin/review": { tone: "teal", art: "shield", headline: "Give the official verdict" },
  "/admin/config": { tone: "amber", art: "sliders", headline: "Set up the games and barangays" },
  "/admin/tournaments": { tone: "indigo", art: "bracket", headline: "Draw the brackets, follow every game" },
  "/admin/reports": { tone: "cyan", art: "chart", headline: "The whole league in numbers" },
  "/admin/champions": { tone: "gold", art: "trophy", headline: "Every title, every season" },
  "/admin/site-images": { tone: "pink", art: "picture", headline: "Pictures for the public site" },
  "/admin/accounts": { tone: "slate", art: "people", headline: "A login for every official" },
  "/brgy/documents": { tone: "coral", art: "document", headline: "Send the documents asked for" },
  "/brgy/matches": { tone: "sky", art: "ball", headline: "Follow your barangay's games" },
  "/brgy": { tone: "green", art: "jersey", headline: "Register your teams and players" },
  "/organizer": { tone: "plum", art: "scoreboard", headline: "Score every game courtside" },
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
    <div className={`relative mb-7 overflow-hidden rounded-2xl bg-gradient-to-r ${TONES[banner.tone] || TONES.green} shadow-sm print:hidden`}>
      {/* soft light blobs, like the reference's glow behind the art */}
      <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-16 size-56 rounded-full bg-white/15 blur-2xl" />
      <div aria-hidden="true" className="pointer-events-none absolute right-40 -bottom-20 size-40 rounded-full bg-white/10 blur-2xl" />
      <Sparkles />
      <div className="relative z-[1] flex min-h-[132px] items-center justify-between gap-4 py-5 pl-5 pr-3 sm:min-h-[148px] sm:pl-7 sm:pr-6">
        <div className="min-w-0 text-white">
          <h1 className="text-[13px] font-medium text-white/85 sm:text-[14px]">{title}</h1>
          <p className="mt-0.5 text-[20px] font-bold leading-tight tracking-tight sm:text-[26px]">{banner.headline}</p>
          <button
            type="button"
            onClick={onHelp}
            className="mt-3.5 inline-flex items-center gap-1.5 rounded-full bg-black/20 px-4 py-1.5 text-[13px] font-semibold text-white transition hover:bg-black/30"
          >
            <HelpCircle className="size-3.5" /> How this works
          </button>
        </div>
        <div aria-hidden="true" className="h-[96px] w-[112px] shrink-0 sm:h-[120px] sm:w-[150px]">
          <Art name={banner.art} />
        </div>
      </div>
    </div>
  );
}

function Sparkles() {
  return (
    <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full" preserveAspectRatio="none">
      <g fill="#fff">
        <circle cx="62%" cy="22%" r="2" opacity=".55" />
        <circle cx="70%" cy="78%" r="1.5" opacity=".45" />
        <circle cx="54%" cy="64%" r="1.2" opacity=".35" />
        <circle cx="93%" cy="86%" r="2" opacity=".4" />
        <circle cx="48%" cy="18%" r="1.2" opacity=".3" />
      </g>
    </svg>
  );
}

// Drawn illustrations, 150x120, a little dimensional (two-tone fills + a highlight), in the
// same friendly style as the reference. White/cream bodies read on every banner colour.
function Art({ name }) {
  const common = { viewBox: "0 0 150 120", className: "size-full drop-shadow-[0_8px_14px_rgba(0,0,0,0.22)]" };
  switch (name) {
    case "calendar":
      return (
        <svg {...common}>
          <rect x="28" y="22" width="94" height="84" rx="12" fill="#fff" />
          <path d="M28 34a12 12 0 0 1 12-12h70a12 12 0 0 1 12 12v12H28z" fill="#FF6B6B" />
          <rect x="46" y="12" width="8" height="20" rx="4" fill="#3B3363" />
          <rect x="96" y="12" width="8" height="20" rx="4" fill="#3B3363" />
          {[0, 1, 2, 3].map((c) => [0, 1, 2].map((r) => (
            <rect key={`${c}${r}`} x={40 + c * 19} y={56 + r * 15} width="12" height="9" rx="2.5" fill={c === 2 && r === 1 ? "#6D4AE8" : "#E3E1F2"} />
          )))}
          <circle cx="114" cy="96" r="16" fill="#4ADE80" />
          <path d="M106 96l6 6 10-11" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "clipboard":
      return (
        <svg {...common}>
          <rect x="34" y="18" width="78" height="96" rx="10" fill="#fff" />
          <rect x="56" y="10" width="34" height="16" rx="6" fill="#3B4A6B" />
          {[0, 1, 2, 3].map((i) => (
            <g key={i}>
              <circle cx="50" cy={44 + i * 17} r="5" fill={i < 3 ? "#4ADE80" : "#E2E8F0"} />
              <rect x="60" y={41 + i * 17} width={i % 2 ? 30 : 40} height="6" rx="3" fill="#CBD5E1" />
            </g>
          ))}
          <circle cx="112" cy="88" r="20" fill="#FFD166" />
          <circle cx="112" cy="88" r="11" fill="none" stroke="#3B4A6B" strokeWidth="4" />
          <path d="M120 96l9 9" stroke="#3B4A6B" strokeWidth="5" strokeLinecap="round" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M75 10l42 15v30c0 28-19 46-42 55-23-9-42-27-42-55V25z" fill="#fff" />
          <path d="M75 10l42 15v30c0 28-19 46-42 55z" fill="#E6F7F3" />
          <circle cx="75" cy="58" r="22" fill="#0F9F8A" />
          <path d="M64 58l8 8 15-16" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="122" cy="26" r="6" fill="#FFD166" />
          <circle cx="28" cy="96" r="4" fill="#FFD166" />
        </svg>
      );
    case "sliders":
      return (
        <svg {...common}>
          <rect x="24" y="18" width="102" height="86" rx="14" fill="#fff" />
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <rect x="40" y={38 + i * 24} width="70" height="6" rx="3" fill="#FDE3C4" />
              <rect x="40" y={38 + i * 24} width={[46, 24, 58][i]} height="6" rx="3" fill="#E8862A" />
              <circle cx={40 + [46, 24, 58][i]} cy={41 + i * 24} r="8" fill="#fff" stroke="#E8862A" strokeWidth="4" />
            </g>
          ))}
          <g transform="translate(116 88)">
            <circle r="17" fill="#3B3363" />
            <circle r="6" fill="#F5B547" />
            {[0, 60, 120, 180, 240, 300].map((a) => <rect key={a} x="-3" y="-21" width="6" height="8" rx="2" fill="#3B3363" transform={`rotate(${a})`} />)}
          </g>
        </svg>
      );
    case "bracket":
      return (
        <svg {...common}>
          <g fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity=".9">
            <path d="M14 22h22v22h16M14 66h22V44M14 78h22v22h16M14 122h22V100" transform="translate(0 -6)" />
            <path d="M52 38h16v22h12M52 94h16V60" transform="translate(0 -6)" />
          </g>
          {[16, 60, 72, 116].map((y) => <rect key={y} x="4" y={y - 6} width="18" height="8" rx="4" fill="#fff" transform="translate(0 -6)" />)}
          <g transform="translate(82 18)">
            <path d="M14 0h34v20a17 17 0 0 1-34 0z" fill="#FFD166" />
            <path d="M31 0h17v20a17 17 0 0 1-17 17z" fill="#F5A524" />
            <path d="M14 6H5a9 9 0 0 0 9 12M48 6h9a9 9 0 0 1-9 12" fill="none" stroke="#FFD166" strokeWidth="4" />
            <rect x="26" y="38" width="10" height="12" fill="#F5A524" />
            <rect x="15" y="50" width="32" height="10" rx="3" fill="#3B3363" />
          </g>
        </svg>
      );
    case "chart":
      return (
        <svg {...common}>
          <rect x="22" y="16" width="106" height="90" rx="14" fill="#fff" />
          {[[38, 50, "#7DD3E8"], [58, 34, "#3FC1D9"], [78, 58, "#1689A8"], [98, 44, "#3FC1D9"]].map(([x, h, c]) => (
            <rect key={x} x={x} y={92 - h} width="14" height={h} rx="4" fill={c} />
          ))}
          <path d="M38 52l20-14 20 10 22-20" fill="none" stroke="#FF6B6B" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="100" cy="28" r="5" fill="#FF6B6B" />
        </svg>
      );
    case "trophy":
      return (
        <svg {...common}>
          <ellipse cx="75" cy="108" rx="34" ry="6" fill="#000" opacity=".12" />
          <path d="M45 12h60v32a30 30 0 0 1-60 0z" fill="#FFD166" />
          <path d="M75 12h30v32a30 30 0 0 1-30 30z" fill="#F5A524" />
          <path d="M45 22H32a14 14 0 0 0 14 20M105 22h13a14 14 0 0 1-14 20" fill="none" stroke="#FFD166" strokeWidth="6" strokeLinecap="round" />
          <rect x="68" y="72" width="14" height="16" fill="#F5A524" />
          <rect x="50" y="88" width="50" height="16" rx="4" fill="#5A3A1A" />
          <path d="M60 30l4 9 9 1-7 6 2 9-8-5-8 5 2-9-7-6 9-1z" fill="#fff" opacity=".85" />
          <path d="M52 18v24" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity=".5" />
        </svg>
      );
    case "picture":
      return (
        <svg {...common}>
          <rect x="30" y="26" width="92" height="74" rx="10" fill="#fff" transform="rotate(8 76 63)" />
          <rect x="22" y="18" width="92" height="74" rx="10" fill="#fff" />
          <rect x="30" y="26" width="76" height="52" rx="6" fill="#BDE7F7" />
          <circle cx="90" cy="40" r="7" fill="#FFD166" />
          <path d="M30 78l22-26 16 18 12-12 26 20z" fill="#4FA374" />
          <path d="M30 78l22-26 12 14-22 12z" fill="#2F6B4B" />
        </svg>
      );
    case "people":
      return (
        <svg {...common}>
          <circle cx="98" cy="40" r="15" fill="#FFD9B8" />
          <path d="M70 104c0-20 12-34 28-34s28 14 28 34z" fill="#8FA3C2" />
          <circle cx="58" cy="36" r="18" fill="#FFE3C8" />
          <path d="M24 106c0-24 15-40 34-40s34 16 34 40z" fill="#fff" />
          <path d="M44 30a16 14 0 0 1 30 0c-8-5-20-5-30 0z" fill="#3B3363" />
          <g transform="translate(112 86)">
            <circle r="13" fill="#FFD166" />
            <circle r="4" fill="#3D4B63" />
            <rect x="9" y="-3" width="20" height="6" rx="3" fill="#FFD166" />
          </g>
        </svg>
      );
    case "document":
      return (
        <svg {...common}>
          <path d="M38 10h50l24 24v74a8 8 0 0 1-8 8H38a8 8 0 0 1-8-8V18a8 8 0 0 1 8-8z" fill="#fff" />
          <path d="M88 10v18a6 6 0 0 0 6 6h18z" fill="#FBD5CC" />
          {[0, 1, 2].map((i) => <rect key={i} x="44" y={50 + i * 14} width={[52, 40, 46][i]} height="6" rx="3" fill="#E5E7EB" />)}
          <circle cx="110" cy="92" r="18" fill="#4ADE80" />
          <path d="M101 92l6 6 12-12" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "ball":
      return (
        <svg {...common}>
          <ellipse cx="75" cy="110" rx="30" ry="5" fill="#000" opacity=".12" />
          <circle cx="75" cy="58" r="44" fill="#F28C38" />
          <path d="M75 14v88M31 58h88" stroke="#7A3A12" strokeWidth="3.5" />
          <path d="M45 26c14 14 14 50 0 64M105 26c-14 14-14 50 0 64" fill="none" stroke="#7A3A12" strokeWidth="3.5" />
          <path d="M50 30a40 40 0 0 1 22-10" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity=".55" />
        </svg>
      );
    case "jersey":
      return (
        <svg {...common}>
          <path d="M50 14l-30 16 12 26 12-6v58h62V50l12 6 12-26-30-16c-3 10-12 16-25 16S53 24 50 14z" fill="#fff" />
          <path d="M50 14c3 10 12 16 25 16s22-6 25-16l-6-2c-3 7-10 11-19 11s-16-4-19-11z" fill="#2F6B4B" />
          <text x="75" y="84" textAnchor="middle" fontSize="34" fontWeight="800" fill="#2F6B4B" fontFamily="Figtree, sans-serif">7</text>
          <circle cx="124" cy="100" r="14" fill="#FFD166" />
          <path d="M118 100h12M124 94v12" stroke="#2F6B4B" strokeWidth="4" strokeLinecap="round" />
        </svg>
      );
    case "scoreboard":
      return (
        <svg {...common}>
          <rect x="16" y="22" width="118" height="70" rx="12" fill="#2A1633" />
          <rect x="16" y="22" width="118" height="16" rx="8" fill="#B04FB8" />
          <text x="48" y="76" textAnchor="middle" fontSize="30" fontWeight="800" fill="#FFD166" fontFamily="Figtree, sans-serif">24</text>
          <text x="102" y="76" textAnchor="middle" fontSize="30" fontWeight="800" fill="#FFD166" fontFamily="Figtree, sans-serif">19</text>
          <circle cx="75" cy="58" r="3" fill="#fff" /><circle cx="75" cy="70" r="3" fill="#fff" />
          <rect x="44" y="92" width="10" height="20" fill="#2A1633" /><rect x="96" y="92" width="10" height="20" fill="#2A1633" />
          <g transform="translate(118 18)">
            <circle r="13" fill="#fff" />
            <path d="M-6 0a6 6 0 0 0 12 0" fill="none" stroke="#B04FB8" strokeWidth="3" />
          </g>
        </svg>
      );
    default:
      return null;
  }
}
