import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAdminAuth } from '../../adminAuthContext';
import '../auth/auth.css';

const AdminLoginPage = () => {
  const { login } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/admin/users';

  const [status, setStatus] = useState({ type: '', message: '' });
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (data) => {
    setStatus({ type: '', message: '' });
    try {
      await login(data.email, data.password);
      navigate(from, { replace: true });
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
    }
  };

  return (
    <main className="auth-page admin-login-page">
      <section className="auth-card">
        <div className="auth-heading">
          <h1>Admin login</h1>
          <p>Platform administration — not for regular business accounts.</p>
        </div>

        {status.message && <div className={`auth-status ${status.type}`}>{status.message}</div>}

        <form className="auth-form" onSubmit={handleSubmit(onSubmit)} noValidate>
          <label className="auth-field">
            <span>Email</span>
            <input type="email" placeholder="admin@example.com" {...register('email', { required: 'Email is required.' })} />
            {errors.email && <small className="field-error">{errors.email.message}</small>}
          </label>
          <label className="auth-field">
            <span>Password</span>
            <input type="password" placeholder="Your password" {...register('password', { required: 'Password is required.' })} />
            {errors.password && <small className="field-error">{errors.password.message}</small>}
          </label>
          <button type="submit" className="auth-submit" disabled={isSubmitting}>
            {isSubmitting ? 'Logging in…' : 'Log in'}
          </button>
        </form>
      </section>
    </main>
  );
};

export default AdminLoginPage;
