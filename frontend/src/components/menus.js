// Sidebar menus, defined once. These used to be copy-pasted into every admin
// page, so adding an entry meant editing six files and they drifted apart.
//
// `dynamic: "sports"` tells AdminLayout to expand that entry into one child per
// sport, fetched at runtime — the list can't be hardcoded because sports are
// configured in the database.
//
// superAdminMenu is GROUPED (array of {header, items}) — AdminLayout renders
// each group as a collapsible section. Ten items in one flat list is why the
// sidebar felt cluttered; grouped by what each screen is FOR, not when it was
// built. organizerMenu/brgyMenu stay flat (a header would be overkill for 1-3
// items) — AdminLayout supports both shapes.

import {
  Award, CalendarDays, CalendarRange, ClipboardList, FileChartColumn, FileCheck2, Images,
  LayoutDashboard, ShieldCheck, SlidersHorizontal, Swords, Trophy, Users, UsersRound,
} from "lucide-react";

// `icon` is a lucide-react component (Oct 2026: they used to be Unicode symbols like
// ▦ ◷ ⛃, which looked unfinished). The sidebar shows ONLY the icons when collapsed to
// the rail, and ONLY the labels when expanded.
export const superAdminMenu = [
  {
    header: "Overview",
    items: [
      { label: "Dashboard", path: "/admin", icon: LayoutDashboard },
    ],
  },
  {
    header: "Season & Verification",
    items: [
      { label: "Season", path: "/admin/season", icon: CalendarRange },
      { label: "Reference List", path: "/admin/reference", icon: ClipboardList },
      { label: "Review Queue", path: "/admin/review", icon: ShieldCheck, badge: "reviewPending" },
    ],
  },
  {
    header: "Competition",
    items: [
      { label: "League Setup", path: "/admin/config", icon: SlidersHorizontal },
      { label: "Tournaments", path: "/admin/tournaments", icon: Trophy, dynamic: "sports" },
    ],
  },
  {
    header: "Content",
    items: [
      { label: "Champions", path: "/admin/champions", icon: Award },
      { label: "Reports", path: "/admin/reports", icon: FileChartColumn },
      { label: "Site Images", path: "/admin/site-images", icon: Images },
    ],
  },
  {
    header: "Administration",
    items: [
      { label: "Accounts", path: "/admin/accounts", icon: UsersRound },
    ],
  },
];

export const organizerMenu = [
  { label: "Dashboard", path: "/organizer/dashboard", icon: LayoutDashboard },
  { label: "Matches", path: "/organizer", icon: Swords },
];

export const brgyMenu = [
  { label: "Dashboard", path: "/brgy/dashboard", icon: LayoutDashboard },
  { label: "My Teams", path: "/brgy", icon: Users },
  { label: "Verification Status", path: "/brgy/documents", icon: FileCheck2 },
  { label: "Matches", path: "/brgy/matches", icon: CalendarDays },
];
