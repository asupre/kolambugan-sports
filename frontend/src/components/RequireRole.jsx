import { Navigate, useLocation } from "react-router-dom";

// Wraps admin routes. Without this, typing /admin/accounts while logged out
// renders the whole admin shell and then fails every request — it looks broken
// rather than protected. The backend is still the real gate; this is about not
// showing someone a page that was never theirs.
export default function RequireRole({ roles, children }) {
  const location = useLocation();
  const token = localStorage.getItem("token");
  let user = null;
  try { user = JSON.parse(localStorage.getItem("user") || "null"); } catch { user = null; }

  if (!token || !user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (roles && !roles.includes(user.role)) {
    // Signed in, wrong role — send them to their own home rather than to login,
    // which would look like their session had failed.
    const home = user.role === "super_admin" ? "/admin"
      : user.role === "barangay_admin" ? "/brgy"
      : user.role === "organizer" ? "/organizer"
      : "/";
    return <Navigate to={home} replace />;
  }

  return children;
}