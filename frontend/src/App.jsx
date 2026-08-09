import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import ChangePassword from "./pages/ChangePassword";
import AdminDashboard from "./pages/admin/AdminDashboard";

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
        <Route path="/admin/season" element={<Placeholder title="Season (coming soon)" />} />
        <Route path="/admin/reference" element={<Placeholder title="Reference List (coming soon)" />} />
        <Route path="/admin/review" element={<Placeholder title="Review Queue (coming soon)" />} />
        <Route path="/admin/tournaments" element={<Placeholder title="Tournaments (coming soon)" />} />
        <Route path="/admin/accounts" element={<Placeholder title="Accounts (coming soon)" />} />
        <Route path="/barangay" element={<Placeholder title="Barangay Admin (coming soon)" />} />
        <Route path="/organizer" element={<Placeholder title="Organizer (coming soon)" />} />
        <Route path="/" element={<Placeholder title="Public Viewer (coming soon)" />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}