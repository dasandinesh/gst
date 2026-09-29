import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAdminAuth } from '../../adminAuthContext';

// Layout route: renders admin child routes only when logged in as a super
// admin; otherwise bounces to /admin/login. Separate from RequireAuth, which
// guards the regular business app.
const RequireAdminAuth = () => {
  const { adminSession, loading } = useAdminAuth();
  const location = useLocation();

  if (loading) return <div className="auth-loading">Loading…</div>;
  if (!adminSession) return <Navigate to="/admin/login" replace state={{ from: location }} />;

  return <Outlet />;
};

export default RequireAdminAuth;
