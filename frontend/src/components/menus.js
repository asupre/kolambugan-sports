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

export const superAdminMenu = [
  {
    header: "Overview",
    items: [
      { label: "Dashboard", path: "/admin", icon: "▦" },
    ],
  },
  {
    header: "Season & Verification",
    items: [
      { label: "Season", path: "/admin/season", icon: "◷" },
      { label: "Reference List", path: "/admin/reference", icon: "☑" },
      { label: "Review Queue", path: "/admin/review", icon: "⚑" },
    ],
  },
  {
    header: "Competition",
    items: [
      { label: "League Setup", path: "/admin/config", icon: "⚙" },
      { label: "Tournaments", path: "/admin/tournaments", icon: "⛃", dynamic: "sports" },
    ],
  },
  {
    header: "Content",
    items: [
      { label: "Champions", path: "/admin/champions", icon: "★" },
      { label: "Reports", path: "/admin/reports", icon: "▤" },
      { label: "Site Images", path: "/admin/site-images", icon: "▣" },
    ],
  },
  {
    header: "Administration",
    items: [
      { label: "Accounts", path: "/admin/accounts", icon: "☺" },
    ],
  },
];

export const organizerMenu = [
  { label: "Matches", path: "/organizer", icon: "⛃" },
];

export const brgyMenu = [
  { label: "My Teams", path: "/brgy", icon: "⛃" },
  { label: "Verification Status", path: "/brgy/documents", icon: "🗎" },
  { label: "Matches", path: "/brgy/matches", icon: "◷" },
];
