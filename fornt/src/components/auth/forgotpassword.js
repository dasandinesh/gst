import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { useAuth } from '../../authContext';
import './auth.css';

const ForgotPasswordPage = () => {
  const { forgotPassword } = useAuth();
  const [status, setStatus] = useState({ type: '', message: '' });
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { email: '' },
  });

  const onSubmit = async (data) => {
    setStatus({ type: '', message: '' });
    try {
      const result = await forgotPassword(data.email);
      setStatus({ type: 'success', message: result.message });
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-heading">
          <h1>Forgot password</h1>
          <p>Enter your account email and we'll send a link to reset your password.</p>
        </div>

        {status.message && <div className={`auth-status ${status.type}`}>{status.message}</div>}

        <form className="auth-form" onSubmit={handleSubmit(onSubmit)} noValidate>
          <label className="auth-field">
            <span>Email</span>
            <input type="email" placeholder="you@example.com" {...register('email', { required: 'Email is required.' })} />
            {errors.email && <small className="field-error">{errors.email.message}</small>}
          </label>
          <button type="submit" className="auth-submit" disabled={isSubmitting}>
            {isSubmitting ? 'Sending…' : 'Send reset link'}
          </button>
        </form>

        <p className="auth-switch"><Link to="/login">Back to log in</Link></p>
      </section>
    </main>
  );
};

export default ForgotPasswordPage;
