// Thin wrapper around fetch for the JSON API.
//
// The CRA dev server proxies /api/* to the backend on port 8000. While that
// backend is restarting (it runs under `node --watch`) or reconnecting to
// MongoDB, the proxy answers with a plain-text body:
//   "Proxy error: Could not proxy request ... to http://localhost:8000"
// Calling response.json() on that throws "Unexpected token 'P' ... is not valid
// JSON". This helper reads the body as text first and turns both that case and a
// dropped connection into a readable message.

// In dev, REACT_APP_API_URL is unset so requests stay relative and go through
// CRA's "proxy" (package.json) to localhost:8000. In production (Vercel), the
// frontend and backend are separate deployments, so this must point at the
// deployed backend's URL — set REACT_APP_API_URL in the frontend's Vercel
// project settings.
const API_BASE = process.env.REACT_APP_API_URL || '';

export async function fetchJson(url, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${url}`, options);
  } catch {
    throw new Error('Cannot reach the server. Check that the backend is running on port 8000.');
  }

  const body = await response.text();
  let data;
  try {
    data = body ? JSON.parse(body) : {};
  } catch {
    throw new Error('The server is not responding correctly. Make sure the backend is running on port 8000, then retry.');
  }

  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status}).`);
  }
  return data;
}
