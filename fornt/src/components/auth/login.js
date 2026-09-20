import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../authContext';
import './auth.css';

const LoginPage = () => {
  const { login, selectBusiness } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/dashboard';

  const [status, setStatus] = useState({ type: '', message: '' });
  const [businesses, setBusinesses] = useState(null); // set once login says "pick one"
  const [selecting, setSelecting] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (data) => {
    setStatus({ type: '', message: '' });
    try {
      const result = await login(data.email, data.password);
      if (result.needsBusinessSelection) {
        setBusinesses(result.businesses);
      } else {
        navigate(from, { replace: true });
      }
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
    }
  };

  const onPickBusiness = async (businessId) => {
    setSelecting(true);
    setStatus({ type: '', message: '' });
    try {
      await selectBusiness(businessId);
      navigate(from, { replace: true });
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
      setSelecting(false);
    }
  };

  const hero = (
    <div className="auth-split-hero">
      <div className="auth-split-hero-content">
        <h2>We are helping to manage your business</h2>
        <p>GST billing, purchases, stock and accounts — all in one place, built for how small businesses actually work.</p>
        <ul className="auth-split-hero-features">
          <li>GST-compliant billing &amp; auto invoice numbering</li>
          <li>Real-time stock &amp; low-stock alerts</li>
          <li>Customer &amp; supplier ledgers, always up to date</li>
        </ul>
      </div>
    </div>
  );

  if (businesses) {
    return (
      <main className="auth-split-page">
        {hero}
        <div className="auth-split-form-side">
          <section className="auth-card">
            <div className="auth-heading">
              <h1>Choose a business</h1>
              <p>Your account has access to more than one business.</p>
            </div>
            {status.message && <div className={`auth-status ${status.type}`}>{status.message}</div>}
            <ul className="auth-business-list">
              {businesses.map((b) => (
                <li key={b.id}>
                  <button type="button" disabled={selecting} onClick={() => onPickBusiness(b.id)}>
                    <span className="auth-business-name">{b.name}</span>
                    <span className="auth-business-role">{b.role}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-split-page">
      {hero}
      <div className="auth-split-form-side">
        <section className="auth-card">
          <div className="auth-heading">
            <h1>Log in</h1>
            <p>Welcome back. Enter your details to continue.</p>
          </div>

          {status.message && <div className={`auth-status ${status.type}`}>{status.message}</div>}

          <form className="auth-form" onSubmit={handleSubmit(onSubmit)} noValidate>
            <label className="auth-field">
              <span>Email</span>
              <input type="email" placeholder="you@example.com" {...register('email', { required: 'Email is required.' })} />
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

          <p className="auth-switch"><Link to="/forgot-password">Forgot password?</Link></p>
          <p className="auth-switch">Don't have an account? <Link to="/signup">Sign up</Link></p>
        </section>
      </div>
    </main>
  );
};

export default LoginPage;
