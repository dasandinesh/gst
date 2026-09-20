import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../authContext';
import './auth.css';

const SignupPage = () => {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState({ type: '', message: '' });
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    defaultValues: {
      name: '', email: '', password: '',
      businessName: '', gstin: '', phone: '',
      door: '', street: '', area: '', district: '', state: '', pincode: '',
    },
  });

  const onSubmit = async (data) => {
    setStatus({ type: '', message: '' });
    try {
      await signup(data);
      navigate('/dashboard', { replace: true });
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
    }
  };

  return (
    <main className="auth-split-page">
      <div className="auth-split-hero">
        <div className="auth-split-hero-content">
          <h2>We are helping to manage your business</h2>
          <p>Set up your login and your business in one step, and get straight to GST billing, stock and accounts.</p>
          <ul className="auth-split-hero-features">
            <li>GST-compliant billing &amp; auto invoice numbering</li>
            <li>Real-time stock &amp; low-stock alerts</li>
            <li>Customer &amp; supplier ledgers, always up to date</li>
          </ul>
        </div>
      </div>
      <div className="auth-split-form-side">
      <section className="auth-card auth-card-wide">
        <div className="auth-heading">
          <h1>Create your account</h1>
          <p>Set up your login and your business in one step.</p>
        </div>

        {status.message && <div className={`auth-status ${status.type}`}>{status.message}</div>}

        <form className="auth-form" onSubmit={handleSubmit(onSubmit)} noValidate>
          <fieldset>
            <legend>Your login</legend>
            <div className="auth-form-grid">
              <label className="auth-field">
                <span>Your name <b>*</b></span>
                <input type="text" placeholder="Full name" {...register('name', { required: 'Name is required.' })} />
                {errors.name && <small className="field-error">{errors.name.message}</small>}
              </label>
              <label className="auth-field">
                <span>Email <b>*</b></span>
                <input type="email" placeholder="you@example.com" {...register('email', { required: 'Email is required.' })} />
                {errors.email && <small className="field-error">{errors.email.message}</small>}
              </label>
              <label className="auth-field">
                <span>Password <b>*</b></span>
                <input type="password" placeholder="At least 6 characters" {...register('password', { required: 'Password is required.', minLength: { value: 6, message: 'At least 6 characters.' } })} />
                {errors.password && <small className="field-error">{errors.password.message}</small>}
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend>Your business</legend>
            <div className="auth-form-grid">
              <label className="auth-field">
                <span>Business name <b>*</b></span>
                <input type="text" placeholder="Shop / company name" {...register('businessName', { required: 'Business name is required.' })} />
                {errors.businessName && <small className="field-error">{errors.businessName.message}</small>}
              </label>
              <label className="auth-field"><span>GSTIN</span><input type="text" placeholder="e.g. 22AAAAA0000A1Z5" {...register('gstin')} /></label>
              <label className="auth-field"><span>Phone</span><input type="tel" placeholder="Contact number" {...register('phone')} /></label>
            </div>
            <div className="auth-form-grid">
              <label className="auth-field"><span>Door / street</span><input type="text" placeholder="Door no., street" {...register('door')} /></label>
              <label className="auth-field"><span>Area</span><input type="text" placeholder="Area / locality" {...register('area')} /></label>
              <label className="auth-field"><span>District</span><input type="text" placeholder="District" {...register('district')} /></label>
              <label className="auth-field"><span>State</span><input type="text" placeholder="State" {...register('state')} /></label>
              <label className="auth-field"><span>Pincode</span><input type="text" inputMode="numeric" placeholder="Pincode" {...register('pincode')} /></label>
            </div>
          </fieldset>

          <button type="submit" className="auth-submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="auth-switch">Already have an account? <Link to="/login">Log in</Link></p>
      </section>
      </div>
    </main>
  );
};

export default SignupPage;
