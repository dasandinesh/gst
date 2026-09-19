// Minimal, dependency-free stroke icons for the main nav (Feather-style, hand-drawn
// paths). Rendered with currentColor so they follow the link's text color/state.
const SHAPES = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.6" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6" />
    </>
  ),
  add: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  users: (
    <>
      <circle cx="8.2" cy="8" r="3.2" />
      <path d="M2.6 20c0-3.4 2.5-5.8 5.6-5.8S13.8 16.6 13.8 20" />
      <circle cx="17.2" cy="9" r="2.6" />
      <path d="M14.8 20c.2-2.9 2.1-4.9 4.7-4.9 1 0 1.9.3 2.7.8" />
    </>
  ),
  box: (
    <>
      <path d="M12 3l8 4.2v9.6L12 21l-8-4.2V7.2L12 3z" />
      <path d="M4 7.2L12 11.4l8-4.2" />
      <path d="M12 11.4V21" />
    </>
  ),
  clipboard: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <rect x="9" y="2.3" width="6" height="3" rx="1" />
      <path d="M8 11h8M8 15h5" />
    </>
  ),
  fileText: (
    <>
      <path d="M7 3h7l5 5v13H7V3z" />
      <path d="M14 3v5h5" />
      <path d="M9.5 12.2h5M9.5 15.7h5" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v2.4M12 19.1v2.4M4.2 6.3l1.7 1.7M18.1 16l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.2 17.7l1.7-1.7M18.1 8l1.7-1.7" />
    </>
  ),
  cart: (
    <>
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="17" cy="20" r="1.4" />
      <path d="M2.5 3h2.2l2.6 12.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 2-1.6L21 7H6" />
    </>
  ),
  tag: (
    <>
      <path d="M11 3h7a1 1 0 0 1 1 1v7a1 1 0 0 1-.3.7l-8.6 8.6a2 2 0 0 1-2.8 0l-6.6-6.6a2 2 0 0 1 0-2.8l8.6-8.6A1 1 0 0 1 11 3z" />
      <circle cx="16" cy="8" r="1.4" />
    </>
  ),
  pencil: (
    <>
      <path d="M4 20l1-4.2L15.6 5.2a2 2 0 0 1 2.8 0l.4.4a2 2 0 0 1 0 2.8L8.2 19 4 20z" />
      <path d="M13.5 6.8l3.7 3.7" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 2h12v19l-2.5-1.5L13 21l-2.5-1.5L8 21l-2-1.5V2z" />
      <path d="M9 7h6M9 11h6M9 15h4" />
    </>
  ),
  book: (
    <>
      <path d="M12 6.5c-1.8-1.6-4.4-2-7.5-1.3v13c3.1-.7 5.7-.3 7.5 1.3 1.8-1.6 4.4-2 7.5-1.3v-13C16.4 4.5 13.8 4.9 12 6.5z" />
      <path d="M12 6.5V19.5" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3l9 5-9 5-9-5 9-5z" />
      <path d="M3 13l9 5 9-5" />
    </>
  ),
  wallet: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2.5" />
      <path d="M3 10h18" />
      <circle cx="17" cy="14" r="1.3" />
    </>
  ),
  truck: (
    <>
      <path d="M2.5 6.5h11v9h-11z" />
      <path d="M13.5 10.5h4l3.5 3v2h-7.5z" />
      <circle cx="7" cy="18" r="1.7" />
      <circle cx="17" cy="18" r="1.7" />
    </>
  ),
};

const NavIcon = ({ name, className }) => (
  <svg
    className={`nav-icon${className ? ` ${className}` : ''}`}
    viewBox="0 0 24 24"
    width="17"
    height="17"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {SHAPES[name] || null}
  </svg>
);

export default NavIcon;
