// API client. Sends the "Viewing as" persona so the server can apply
// employer / sponsor / role-minting permission checks (demo stand-in for auth).

let viewer = null;
export function setViewer(id) { viewer = id || null; }
export function getViewer() { return viewer; }

export async function api(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (viewer) headers['X-Lockwork-As'] = viewer;
  const r = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(data.error || `${r.status} ${r.statusText}`);
    e.status = r.status;
    e.data = data;
    throw e;
  }
  return data;
}

export const get = (p) => api('GET', p);
export const post = (p, b) => api('POST', p, b ?? {});
export const patch = (p, b) => api('PATCH', p, b ?? {});
export const del = (p) => api('DELETE', p);

/* Tiny localStorage wrapper — never required for the page to work. */
export const store = {
  get(k) { try { return localStorage.getItem(`lockwork:${k}`); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(`lockwork:${k}`, v); } catch { /* ignore */ } },
};
