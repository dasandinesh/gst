import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import NavIcon from './navicons';
import { useAuth } from '../../authContext';
import './mainnav.css';

const DASHBOARD_LINK = { to: '/dashboard', label: 'Dashboard', icon: 'dashboard' };
const PREFERENCES_LINK = { to: '/entry-settings', label: 'Preferences', icon: 'gear' };

// GST Billing/Purchases/Stock, grouped into one collapsible group — same pattern as
// Master/Notes/Accounts/Reports — instead of five flat top-level links.
const NAV_LINKS = [
  // { to: '/order-entry', label: 'Orders', icon: 'cart' },
  // { to: '/order-entry-mobile', label: 'Orders (Mobile)', icon: 'cart' },
  // { to: '/order-list', label: 'Order List', icon: 'clipboard' },
  // { to: '/sale-entry', label: 'Sales', icon: 'tag' },
  { to: '/gst-billing', label: 'GST Billing', icon: 'tag' },
  { to: '/gst-bill-list', label: 'GST Bills', icon: 'fileText' },
  { to: '/delivery-challan', label: 'Delivery Challan', icon: 'truck' },
  { to: '/delivery-challan-list', label: 'Delivery Challans', icon: 'fileText' },
  { to: '/buyer-po', label: "Buyer's PO Entry", icon: 'clipboard' },
  { to: '/buyer-po-list', label: "Buyers' POs", icon: 'fileText' },
  // { to: '/sale-list', label: 'Sale Bills', icon: 'fileText' },
  { to: '/purchase-entry', label: 'Purchase Entry', icon: 'cart' },
  { to: '/purchase-list', label: 'Purchase Bills', icon: 'fileText' },
  { to: '/stock-maintenance', label: 'Stock Maintenance', icon: 'box' },
];

// Credit/debit note entry+list, grouped into their own group so they don't add
// four more flat top-level links next to GST Billing/Purchases.
// Estimate/Quotation entry+list plus its own customer/product masters —
// kept fully separate from the real GST Billing/Master data (own stock
// counter, own customer balance).
const ESTIMATE_LINKS = [
  { to: '/estimate-billing', label: 'Estimate Billing', icon: 'tag' },
  { to: '/estimate-bill-list', label: 'Estimate Bills', icon: 'fileText' },
  // { to: '/estimate-customers', label: 'Estimate Customer Add', icon: 'add' },
  { to: '/estimate-customer-list', label: 'Estimate Customer List', icon: 'users' },
  // { to: '/estimate-products', label: 'Estimate Product Add', icon: 'add' },
  { to: '/estimate-product-list', label: 'Estimate Product List', icon: 'box' },
];

const NOTES_LINKS = [
  { to: '/credit-note-entry', label: 'Credit Note', icon: 'pencil' },
  { to: '/credit-note-list', label: 'Credit Notes', icon: 'fileText' },
  { to: '/debit-note-entry', label: 'Debit Note', icon: 'pencil' },
  { to: '/debit-note-list', label: 'Debit Notes', icon: 'fileText' },
];

const MASTER_LINKS = [
  { to: '/customers', label: 'Customer Add', icon: 'add' },
  { to: '/customer-list', label: 'Customer List', icon: 'users' },
  { to: '/products', label: 'Product Add', icon: 'add' },
  { to: '/product-list', label: 'Product List', icon: 'box' },
  { to: '/drivers', label: 'Driver Add', icon: 'add' },
  { to: '/driver-list', label: 'Driver List', icon: 'users' },
  { to: '/vehicles', label: 'Vehicle Add', icon: 'add' },
  { to: '/vehicle-list', label: 'Vehicle List', icon: 'truck' },
  { to: '/suppliers', label: 'Supplier Add', icon: 'add' },
  { to: '/supplier-list', label: 'Supplier List', icon: 'users' },
  { to: '/invoice-setting', label: 'Invoice Setting', icon: 'gear' },
  { to: '/profile', label: 'Profile', icon: 'users' },
];

// Grouped into their own group — with 10+ top-level links the two Price Update
// pages were easy to miss buried inline, so they get a clearly-labeled home instead.
// const PRICE_LINKS = [
//   { to: '/price-update', label: 'Sale Price Update', icon: 'pencil' },
//   { to: '/order-price-update', label: 'Order Price Update', icon: 'pencil' },
// ];

const ACCOUNT_LINKS = [
  { to: '/receipts', label: 'Receipts', icon: 'receipt' },
  { to: '/payments', label: 'Payments', icon: 'receipt' },
  { to: '/customer-ledger', label: 'Customer Ledger', icon: 'book' },
  { to: '/supplier-ledger', label: 'Supplier Ledger', icon: 'book' },
];

const REPORT_LINKS = [
  { to: '/gst-reports', label: 'GST Reports', icon: 'clipboard' },
  { to: '/day-book', label: 'Day Book', icon: 'fileText' },
];

const GROUPS = [
  { id: 'transactions', label: 'Transactions', icon: 'tag', links: NAV_LINKS },
  { id: 'estimate', label: 'Estimate', icon: 'fileText', links: ESTIMATE_LINKS },
  { id: 'notes', label: 'Notes', icon: 'fileText', links: NOTES_LINKS },
  { id: 'accounts', label: 'Accounts', icon: 'wallet', links: ACCOUNT_LINKS },
  { id: 'reports', label: 'Reports', icon: 'clipboard', links: REPORT_LINKS },
  { id: 'master', label: 'Master', icon: 'layers', links: MASTER_LINKS },
];

// The group holding the page at `pathname` (e.g. /customer-list/123 → master), or null.
const groupFor = (pathname) => GROUPS.find((g) => g.links.some((l) => pathname === l.to || pathname.startsWith(`${l.to}/`)))?.id || null;

const linkClass = ({ isActive }) => `mainnav-link${isActive ? ' is-active' : ''}`;

// A collapsible sidebar group: click the heading to open/close its links.
const NavGroup = ({ id, label, icon, links, onNavigate, openId, onToggle }) => {
  const isOpen = openId === id;
  return (
    <div className={`mainnav-dropdown${isOpen ? ' is-open' : ''}`}>
      <button
        type="button"
        className="mainnav-dropdown-toggle"
        aria-expanded={isOpen}
        onClick={() => onToggle(id)}
      >
        <NavIcon name={icon} />
        <span>{label}</span>
      </button>
      <div className="mainnav-dropdown-menu">
        {links.map((link) => (
          <NavLink key={link.to} to={link.to} className={linkClass} onClick={onNavigate}>
            <NavIcon name={link.icon} />
            <span>{link.label}</span>
          </NavLink>
        ))}
      </div>
    </div>
  );
};

// Left sidebar on desktop; on phones it collapses to a top bar with a
// hamburger that slides the same links open (handled in mainnav.css).
const MainNav = () => {
  // Phone only: whether the hamburger panel is open.
  const [open, setOpen] = useState(false);
  const location = useLocation();
  // Which group is expanded — starts on (and follows) the group of the current page.
  const [openGroup, setOpenGroup] = useState(() => groupFor(location.pathname));
  const navRef = useRef(null);
  const { session, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const current = groupFor(location.pathname);
    if (current) setOpenGroup(current);
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  // Picking a page closes the phone panel; the sidebar group stays open.
  const close = () => setOpen(false);
  const toggleGroup = (id) => setOpenGroup((current) => (current === id ? null : id));

  // Close the phone panel on outside click or Escape — same as Bootstrap's navbar.
  useEffect(() => {
    if (!open) return undefined;
    const handleClick = (e) => {
      if (navRef.current && !navRef.current.contains(e.target)) close();
    };
    const handleKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <nav className="mainnav" aria-label="Main navigation" ref={navRef}>
      {session && (
        <NavLink to="/profile" className="mainnav-user-info" title="Profile" onClick={close}>
          <span className="mainnav-business-name">{session.business.name}</span>
          <span className="mainnav-user-name">{session.user.name}</span>
        </NavLink>
      )}

      <button
        type="button"
        className={`mainnav-toggler${open ? ' is-open' : ''}`}
        aria-label="Toggle navigation"
        aria-expanded={open}
        aria-controls="mainnav-links"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="mainnav-toggler-bar" />
        <span className="mainnav-toggler-bar" />
        <span className="mainnav-toggler-bar" />
      </button>

      <div id="mainnav-links" className={`mainnav-links${open ? ' is-open' : ''}`}>
        <NavLink to={DASHBOARD_LINK.to} className={linkClass} onClick={close}>
          <NavIcon name={DASHBOARD_LINK.icon} />
          <span>{DASHBOARD_LINK.label}</span>
        </NavLink>
        {GROUPS.map((group) => (
          <NavGroup key={group.id} {...group} onNavigate={close} openId={openGroup} onToggle={toggleGroup} />
        ))}

        <div className="mainnav-bottom">
          <NavLink to={PREFERENCES_LINK.to} className={linkClass} onClick={close}>
            <NavIcon name={PREFERENCES_LINK.icon} />
            <span>{PREFERENCES_LINK.label}</span>
          </NavLink>
          <button type="button" className="mainnav-logout" onClick={handleLogout}>Log out</button>
        </div>
      </div>
    </nav>
  );
};

export default MainNav;
