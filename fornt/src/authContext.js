import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { fetchJson } from './api';

const AuthContext = createContext(null);

// Wraps the whole app. Loads the current session (if any) once on mount by
// asking the backend, since the session lives in an httpOnly cookie the
// frontend can't read directly.
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null); // { user, business, role, businesses } | null
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchJson('/api/auth/me');
      setSession(data);
    } catch {
      setSession(null);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const signup = async (formData) => {
    const data = await fetchJson('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });
    setSession(data);
    return data;
  };

  const login = async (email, password) => {
    const data = await fetchJson('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!data.needsBusinessSelection) setSession(data);
    return data;
  };

  const selectBusiness = async (businessId) => {
    const data = await fetchJson('/api/auth/select-business', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessId }),
    });
    setSession(data);
    return data;
  };

  const logout = async () => {
    await fetchJson('/api/auth/logout', { method: 'POST' });
    setSession(null);
  };

  const forgotPassword = (email) => fetchJson('/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  const resetPassword = (token, password) => fetchJson('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password }),
  });

  return (
    <AuthContext.Provider value={{ session, loading, signup, login, selectBusiness, logout, refresh, forgotPassword, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
