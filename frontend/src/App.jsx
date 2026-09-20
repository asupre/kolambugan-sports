import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import ChangePassword from "./pages/ChangePassword";
import AdminDashboard from "./pages/admin/AdminDashboard";
import Season from "./pages/admin/Season";
import ReferenceList from "./pages/admin/ReferenceList";
import ReviewQueue from "./pages/admin/ReviewQueue";
import Tournaments from "./pages/admin/Tournaments";
import Accounts from "./pages/admin/Accounts";
import BrgyDashboard from "./pages/brgy/BrgyDashboard";
import BrgyHome from "./pages/brgy/BrgyHome";
import Documents from "./pages/brgy/Documents";
import OrganizerScoring from "./pages/organizer/OrganizerScoring";
import OrganizerHome from "./pages/organizer/OrganizerHome";
import PublicLayout from "./pages/public/PublicLayout";
import Home from "./pages/public/Home";
import Matches from "./pages/public/Matches";
import Standings from "./pages/public/Standings";
import Teams from "./pages/public/Teams";
import TeamDetail from "./pages/public/TeamDetail";
import Players from "./pages/public/Players";
import Brackets from "./pages/public/Brackets";
import AdminChampions from "./pages/admin/Champions";
import Champions from "./pages/public/Champions";
import About from "./pages/public/About";
import SiteImages from "./pages/admin/SiteImages";
import SportConfig from "./pages/admin/SportConfig";
import BrgyMatches from "./pages/brgy/BrgyMatches";
import Reports from "./pages/admin/Reports";
import RequireRole from "./components/RequireRole";
import { ErrorDialogProvider } from "./components/ErrorDialog";
import { ConfirmDialogProvider } from "./components/ConfirmDialog";
// Temporary placeholder pages so routes resolve while we build the real ones.
function Placeholder({ title }) {
  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center">
      <h1 className="text-brand-gold text-2xl font-bold">{title}</h1>
    </div>
  );
}

export default function App() {
  return (
    <ErrorDialogProvider>
    <ConfirmDialogProvider>
      <BrowserRouter>
        <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/change-password" element={<ChangePassword />} />

        {/* Super Admin */}
        <Route path="/admin" element={<RequireRole roles={["super_admin"]}><AdminDashboard /></RequireRole>} />
        <Route path="/admin/season" element={<RequireRole roles={["super_admin"]}><Season /></RequireRole>} />
        <Route path="/admin/reference" element={<RequireRole roles={["super_admin"]}><ReferenceList /></RequireRole>} />
        <Route path="/admin/review" element={<RequireRole roles={["super_admin"]}><ReviewQueue /></RequireRole>} />
        <Route path="/admin/tournaments" element={<RequireRole roles={["super_admin"]}><Tournaments /></RequireRole>} />
        <Route path="/admin/tournaments/:sportId" element={<RequireRole roles={["super_admin"]}><Tournaments /></RequireRole>} />
        <Route path="/admin/config" element={<RequireRole roles={["super_admin"]}><SportConfig /></RequireRole>} />
        <Route path="/admin/reports" element={<RequireRole roles={["super_admin"]}><Reports /></RequireRole>} />
        <Route path="/admin/champions" element={<RequireRole roles={["super_admin"]}><AdminChampions /></RequireRole>} />
        <Route path="/admin/site-images" element={<RequireRole roles={["super_admin"]}><SiteImages /></RequireRole>} />
        <Route path="/admin/accounts" element={<RequireRole roles={["super_admin"]}><Accounts /></RequireRole>} />

        {/* Barangay Admin */}
        <Route path="/brgy/dashboard" element={<RequireRole roles={["barangay_admin"]}><BrgyHome /></RequireRole>} />
        <Route path="/brgy" element={<RequireRole roles={["barangay_admin"]}><BrgyDashboard /></RequireRole>} />
        <Route path="/brgy/documents" element={<RequireRole roles={["barangay_admin"]}><Documents /></RequireRole>} />
        <Route path="/brgy/matches" element={<RequireRole roles={["barangay_admin"]}><BrgyMatches /></RequireRole>} />

        {/* Organizer — super admin may score too, matching the backend. */}
        <Route path="/organizer/dashboard" element={<RequireRole roles={["organizer"]}><OrganizerHome /></RequireRole>} />
        <Route path="/organizer" element={<RequireRole roles={["organizer", "super_admin"]}><OrganizerScoring /></RequireRole>} />

        {/* Public */}
        <Route element={<PublicLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/matches" element={<Matches />} />
          <Route path="/standings" element={<Standings />} />
          <Route path="/teams" element={<Teams />} />
          <Route path="/teams/:id" element={<TeamDetail />} />
          <Route path="/players" element={<Players />} />
          <Route path="/brackets" element={<Brackets />} />
          <Route path="/champions" element={<Champions />} />
          <Route path="/about" element={<About />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </BrowserRouter>
    </ConfirmDialogProvider>
    </ErrorDialogProvider>
  );
}