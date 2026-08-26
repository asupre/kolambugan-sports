// Sidebar menus, defined once. These used to be copy-pasted into every admin
// page, so adding an entry meant editing six files and they drifted apart.
//
// `dynamic: "sports"` tells AdminLayout to expand that entry into one child per
// sport, fetched at runtime — the list can't be hardcoded because sports are
// configured in the database.

export const superAdminMenu = [
  { label: "Dashboard", path: "/admin", icon: "▦" },
  { label: "Season", path: "/admin/season", icon: "◷" },
  { label: "Reference List", path: "/admin/reference", icon: "☑" },
  { label: "Review Queue", path: "/admin/review", icon: "⚑" },
  { label: "Tournaments", path: "/admin/tournaments", icon: "⛃", dynamic: "sports" },
    { label: "Sport Setup", path: "/admin/config", icon: "⚙" },
  { label: "Champions", path: "/admin/champions", icon: "★" },
  { label: "Site Images", path: "/admin/site-images", icon: "▣" },
  { label: "Accounts", path: "/admin/accounts", icon: "☺" },
];

export const organizerMenu = [
  { label: "Matches", path: "/organizer", icon: "⛃" },
];