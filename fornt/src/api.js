// Thin wrapper around fetch for the JSON API.
//
// The CRA dev server proxies /api/* to the backend on port 8000. While that
// backend is restarting (it runs under `node --watch`) or reconnecting to
// MongoDB, the proxy answers with a plain-text body:
//   "Proxy error: Could not proxy request ... to http://localhost:8000"
// Calling response.json() on that throws "Unexpected token 'P' ... is not valid
// JSON". This helper reads the body as text first and turns both that case and a
// dropped connection into a readable message.

export async function fetchJson(url, options = {}) {
  let response;
  try {
    response = await fetch(url, options);
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
