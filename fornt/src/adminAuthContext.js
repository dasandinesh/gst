import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { fetchJson } from './api';

const AdminAuthContext = createContext(null);

// Mirrors authContext.js but talks to /api/admin/* and its own `admin_token`
// cookie — kept fully separate from the business AuthProvider/session since a
// platform admin isn't scoped to any one business.
export function AdminAuthProvider({ children }) {
  const [adminSession, setAdminSession] = useState(null); // { user } | null
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchJson('/api/admin/me');
      setAdminSession(data);
    } catch {
      setAdminSession(null);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const login = async (email, password) => {
    const data = await fetchJson('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    setAdminSession(data);
    return data;
  };

  const logout = async () => {
    await fetchJson('/api/admin/logout', { method: 'POST' });
    setAdminSession(null);
  };

  return (
    <AdminAuthContext.Provider value={{ adminSession, loading, login, logout, refresh }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export const useAdminAuth = () => useContext(AdminAuthContext);
