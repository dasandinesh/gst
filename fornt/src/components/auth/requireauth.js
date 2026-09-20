import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../authContext';

// Layout route: renders its child routes only when logged in with an active
// business; otherwise bounces to /login (remembering where they came from).
const RequireAuth = () => {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="auth-loading">Loading…</div>;
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />;

  return <Outlet />;
};

export default RequireAuth;
