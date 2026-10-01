import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import './mainfooter.css';
import { getActiveSetting } from '../../shopSettings';

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
    getActiveSetting()
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
        {/* Keyboard shortcuts of the entry pages (see common/entryShortcuts.js). */}
        <p className="mainfooter-shortcuts" aria-label="Keyboard shortcuts on entry pages">
          <span>Shortcuts:</span>
          <kbd>F2</kbd> New · <kbd>Ctrl</kbd>+<kbd>S</kbd> Save · <kbd>Ctrl</kbd>+<kbd>P</kbd> Print · <kbd>F8</kbd> Last entry
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
