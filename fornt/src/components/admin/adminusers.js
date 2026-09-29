import React, { useCallback, useEffect, useState } from 'react';
import { fetchJson } from '../../api';
import '../accounts/accounts.css';
import './adminusers.css';

const formatDate = (iso) => (iso ? new Date(iso).toLocaleDateString() : '—');

// Platform-wide user list: every signed-up user, which business(es) they
// belong to and with what role, and admin actions (disable/enable, delete).
const AdminUsers = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchJson('/api/admin/users');
      setUsers(data);
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const filtered = users.filter((u) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
      || u.businesses.some((b) => b.businessName.toLowerCase().includes(q));
  });

  const toggleDisabled = async (user) => {
    const nextDisabled = !user.isDisabled;
    if (nextDisabled && !window.confirm(`Disable ${user.name}? They will not be able to log in until re-enabled.`)) return;
    setBusyId(user.id);
    setMessage({ type: '', text: '' });
    try {
      await fetchJson(`/api/admin/users/${user.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDisabled: nextDisabled }),
      });
      setUsers((items) => items.map((u) => (u.id === user.id ? { ...u, isDisabled: nextDisabled } : u)));
      setMessage({ type: 'success', text: `${user.name} ${nextDisabled ? 'disabled' : 're-enabled'}.` });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setBusyId(null);
    }
  };

  const deleteUser = async (user) => {
    if (!window.confirm(`Permanently delete ${user.name} (${user.email})? This cannot be undone.`)) return;
    setBusyId(user.id);
    setMessage({ type: '', text: '' });
    try {
      await fetchJson(`/api/admin/users/${user.id}`, { method: 'DELETE' });
      setUsers((items) => items.filter((u) => u.id !== user.id));
      setMessage({ type: 'success', text: `${user.name} deleted.` });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="acc-page admin-users-page">
      <section className="acc-card">
        <h1>Users</h1>
        <p className="acc-sub">Every account registered on the platform, across all businesses.</p>

        <div className="acc-form" style={{ marginBottom: 4 }}>
          <label className="acc-field" style={{ gridColumn: 'span 2' }}>
            <span>Search</span>
            <input type="search" placeholder="Name, email, or business" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
        </div>

        {message.text && <p className={`acc-status ${message.type}`}>{message.text}</p>}

        <div className="acc-table-wrap">
          <table className="acc-table admin-users-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Businesses</th>
                <th>Joined</th>
                <th>Status</th>
                <th aria-label="Actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" style={{ textAlign: 'center' }}>Loading users…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan="6" style={{ textAlign: 'center' }}>{users.length === 0 ? 'No users found.' : 'No users match this search.'}</td></tr>
              ) : filtered.map((user) => (
                <tr key={user.id}>
                  <td>{user.name}{user.isSuperAdmin && <span className="admin-pill admin-pill-admin">Admin</span>}</td>
                  <td>{user.email}</td>
                  <td>
                    {user.businesses.length === 0 ? '—' : user.businesses.map((b) => (
                      <div key={b.businessId} className="admin-users-business">{b.businessName} <span className="admin-users-role">({b.role})</span></div>
                    ))}
                  </td>
                  <td>{formatDate(user.createdAt)}</td>
                  <td><span className={`admin-pill ${user.isDisabled ? 'admin-pill-disabled' : 'admin-pill-active'}`}>{user.isDisabled ? 'Disabled' : 'Active'}</span></td>
                  <td className="acc-row-actions">
                    <button type="button" disabled={busyId === user.id} onClick={() => toggleDisabled(user)}>
                      {user.isDisabled ? 'Enable' : 'Disable'}
                    </button>
                    <button type="button" className="danger" disabled={busyId === user.id} onClick={() => deleteUser(user)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
};

export default AdminUsers;
