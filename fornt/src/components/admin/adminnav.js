import { NavLink, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../../adminAuthContext';
import './adminnav.css';

const ADMIN_LINKS = [
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/gst-summary', label: 'GST Summary' },
];

const linkClass = ({ isActive }) => `adminnav-link${isActive ? ' is-active' : ''}`;

// Deliberately styled apart from the business MainNav (dark/slate vs. green)
// so it's immediately obvious this is the platform admin area, not a tenant's
// own workspace.
const AdminNav = () => {
  const { adminSession, logout } = useAdminAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/admin/login', { replace: true });
  };

  return (
    <nav className="adminnav" aria-label="Admin navigation">
      <div className="adminnav-brand">
        <span className="adminnav-badge">ADMIN</span>
        <span>Platform Console</span>
      </div>

      <div className="adminnav-links">
        {ADMIN_LINKS.map((link) => (
          <NavLink key={link.to} to={link.to} className={linkClass}>{link.label}</NavLink>
        ))}
      </div>

      <div className="adminnav-user">
        {adminSession && <span className="adminnav-user-name">{adminSession.user.name}</span>}
        <button type="button" className="adminnav-logout" onClick={handleLogout}>Log out</button>
      </div>
    </nav>
  );
};

export default AdminNav;
