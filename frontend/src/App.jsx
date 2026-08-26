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
import Documents from "./pages/brgy/Documents";
import OrganizerScoring from "./pages/organizer/OrganizerScoring";
import PublicLayout from "./pages/public/PublicLayout";
import Home from "./pages/public/Home";
import Matches from "./pages/public/Matches";
import Standings from "./pages/public/Standings";
import Teams from "./pages/public/Teams";
import TeamDetail from "./pages/public/TeamDetail";
import Players from "./pages/public/Players";
import Brackets from "./pages/public/Brackets";
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
    <BrowserRouter>
     <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/change-password" element={<ChangePassword />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/season" element={<Season />} />
        <Route path="/admin/reference" element={<ReferenceList />} />
        <Route path="/admin/review" element={<ReviewQueue />} />
        <Route path="/admin/tournaments" element={<Tournaments />} />
        <Route path="/admin/accounts" element={<Accounts />} />
        <Route path="/brgy" element={<BrgyDashboard />} />
        <Route path="/brgy/documents" element={<Documents />} />
        <Route path="/organizer" element={<OrganizerScoring />} />
        <Route element={<PublicLayout />}>
          <Route path="/" element={<Home />} />
           <Route path="/matches" element={<Matches />} />
            <Route path="/standings" element={<Standings />} />
            <Route path="teams" element={<Teams />} />
            <Route path="teams/:id" element={<TeamDetail />} />
            <Route path="players" element={<Players />} />
            <Route path="/brackets" element={<Brackets />} />
          </Route>
        <Route path="*" element={<Navigate to="/" replace/>} />
        
      </Routes>
    </BrowserRouter>
  );
}