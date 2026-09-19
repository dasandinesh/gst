import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import './mainfooter.css';

const QUICK_LINKS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/order-entry', label: 'Orders' },
  { to: '/sale-entry', label: 'Sales' },
  { to: '/customer-list', label: 'Customers' },
  { to: '/customer-ledger', label: 'Ledger' },
];

const MainFooter = () => {
  const [shopName, setShopName] = useState('');

  useEffect(() => {
    fetch('/api/invoice-settings/active')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setShopName(data?.name || ''))
      .catch(() => {});
  }, []);

  const year = new Date().getFullYear();

  return (
    <footer className="mainfooter">
      <div className="mainfooter-inner">
        <p className="mainfooter-brand">
          © {year} {shopName || 'Market'} — all rights reserved.
        </p>
        <nav className="mainfooter-links" aria-label="Footer">
          {QUICK_LINKS.map((link) => (
            <Link key={link.to} to={link.to}>{link.label}</Link>
          ))}
        </nav>
      </div>
    </footer>
  );
};

export default MainFooter;
