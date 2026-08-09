import AdminLayout from "../../components/AdminLayout";

const superAdminMenu = [
  { label: "Dashboard", path: "/admin", icon: "▦" },
  { label: "Season", path: "/admin/season", icon: "◷" },
  { label: "Reference List", path: "/admin/reference", icon: "☑" },
  { label: "Review Queue", path: "/admin/review", icon: "⚑" },
  { label: "Tournaments", path: "/admin/tournaments", icon: "⛃" },
  { label: "Accounts", path: "/admin/accounts", icon: "☺" },
];

function StatCard({ label, value, sub }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <p className="text-slate-500 text-sm">{label}</p>
      <p className="text-slate-900 text-2xl font-semibold mt-1">{value}</p>
      {sub && <p className="text-slate-400 text-xs mt-1">{sub}</p>}
    </div>
  );
}

export default function AdminDashboard() {
  return (
    <AdminLayout title="Dashboard" menu={superAdminMenu}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Current season" value="—" sub="Not loaded yet" />
        <StatCard label="Teams registered" value="—" />
        <StatCard label="Players to review" value="—" />
        <StatCard label="Barangays" value="26" />
      </div>

      <div className="mt-6 bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <h2 className="text-slate-800 font-semibold mb-1">Welcome back</h2>
        <p className="text-slate-500 text-sm">
          Use the sidebar to manage the season, upload the reference list, review players,
          run tournaments, and provision accounts. Each section connects to live data — we'll
          wire these cards up next.
        </p>
      </div>
    </AdminLayout>
  );
}