import { useEffect, useState } from "react";
import { useImageRev } from "../lib/profileImages";

// The picture behind the Dashboard "Hello" banner, shared so other pages can reuse it in their own
// way (e.g. the Season page's current-season card). Fills its positioned parent (absolute inset-0).
// Tried in order: the account's own picture (Profile > Dashboard banner), then /banner.jpg
// (frontend/public, gitignored: a LOCAL preview only), then the drawn landscape underneath
// (Mount Bucas, Panguil Bay, the sunrise from the logo, pines on the right). One inline SVG, no blur.
const BANNER_PHOTO = "/banner.jpg";

// The version comes from lib/profileImages.js, so a banner changed in Profile shows here at once.
export default function BannerBackdrop({ userId, position = "50% 42%" }) {
  const rev = useImageRev("banner", userId);
  const sources = [userId && `/api/auth/users/${userId}/banner?rev=${rev}`, BANNER_PHOTO].filter(Boolean);
  const [at, setAt] = useState(0);
  useEffect(() => { setAt(0); }, [rev]);
  const photo = at < sources.length;
  return (
    <>
      {photo && (
        <>
          <img key={sources[at]} src={sources[at]} alt="" decoding="async" onError={() => setAt((i) => i + 1)}
            style={{ objectPosition: position }}
            className="absolute inset-0 z-[1] size-full object-cover" />
          {/* Dark on the left behind the text, clear on the right. */}
          <div aria-hidden="true" className="absolute inset-0 z-[1] bg-gradient-to-r from-black/70 via-black/35 to-black/10" />
        </>
      )}
      <svg aria-hidden="true" viewBox="0 0 1200 160" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full">
        <defs>
          <linearGradient id="bn-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#557F70" />
            <stop offset="1" stopColor="#9DBFB0" />
          </linearGradient>
        </defs>
        <rect width="1200" height="160" fill="url(#bn-sky)" />
        <circle cx="760" cy="92" r="34" fill="#F1E2B4" opacity="0.55" />
        {/* far range */}
        <path d="M0 112 L90 84 L170 100 L260 70 L350 96 L430 78 L520 102 L600 88 L690 104 L780 74 L880 98 L980 80 L1080 100 L1200 86 L1200 160 L0 160Z" fill="#88AE9D" opacity="0.8" />
        {/* Mount Bucas */}
        <path d="M480 160 L640 58 L668 72 L700 50 L860 160Z" fill="#5F8C79" />
        {/* near hills */}
        <path d="M0 128 C120 108 240 132 360 118 C480 104 560 130 700 122 C820 114 900 134 1040 120 L1200 116 L1200 160 L0 160Z" fill="#46705F" />
        {/* the bay */}
        <path d="M0 140 L1200 136 L1200 160 L0 160Z" fill="#3B6A62" />
        <g stroke="#CFE6DE" strokeWidth="2" strokeLinecap="round" opacity="0.45">
          <line x1="560" y1="146" x2="620" y2="146" /><line x1="680" y1="150" x2="760" y2="150" /><line x1="820" y1="145" x2="870" y2="145" />
        </g>
        {/* pines, right */}
        <g fill="#24433A">
          <path d="M960 160 L985 80 L1010 160Z" /><path d="M1000 160 L1030 60 L1060 160Z" /><path d="M1050 160 L1072 94 L1094 160Z" />
          <path d="M1085 160 L1115 52 L1145 160Z" /><path d="M1135 160 L1158 88 L1181 160Z" /><path d="M1170 160 L1195 70 L1220 160Z" />
        </g>
      </svg>
    </>
  );
}
