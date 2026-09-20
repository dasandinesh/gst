import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../../authContext';
import './auth.css';

const ResetPasswordPage = () => {
  const { resetPassword } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [status, setStatus] = useState({ type: '', message: '' });
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { password: '', confirmPassword: '' },
  });

  const onSubmit = async (data) => {
    setStatus({ type: '', message: '' });
    try {
      const result = await resetPassword(token, data.password);
      setStatus({ type: 'success', message: result.message });
      setTimeout(() => navigate('/login', { replace: true }), 1500);
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
    }
  };

  if (!token) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <div className="auth-heading">
            <h1>Reset password</h1>
          </div>
          <div className="auth-status error">This reset link is missing its token. Request a new one.</div>
          <p className="auth-switch"><Link to="/forgot-password">Request a new reset link</Link></p>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-heading">
          <h1>Reset password</h1>
          <p>Choose a new password for your account.</p>
        </div>

        {status.message && <div className={`auth-status ${status.type}`}>{status.message}</div>}

        <form className="auth-form" onSubmit={handleSubmit(onSubmit)} noValidate>
          <label className="auth-field">
            <span>New password</span>
            <input type="password" placeholder="At least 6 characters" {...register('password', { required: 'Password is required.', minLength: { value: 6, message: 'At least 6 characters.' } })} />
            {errors.password && <small className="field-error">{errors.password.message}</small>}
          </label>
          <label className="auth-field">
            <span>Confirm new password</span>
            <input type="password" placeholder="Re-enter password" {...register('confirmPassword', { required: 'Confirm your password.', validate: (v) => v === watch('password') || 'Passwords do not match.' })} />
            {errors.confirmPassword && <small className="field-error">{errors.confirmPassword.message}</small>}
          </label>
          <button type="submit" className="auth-submit" disabled={isSubmitting}>
            {isSubmitting ? 'Updating…' : 'Update password'}
          </button>
        </form>

        <p className="auth-switch"><Link to="/login">Back to log in</Link></p>
      </section>
    </main>
  );
};

export default ResetPasswordPage;
