import React, { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchJson } from '../../api';
import './customerdetails.css';

const emptyCustomer = {
  name: '', phone: '', door: '', street: '', area: '', district: '', state: '', pincode: '', oldBalance: 0,
  gst_no: '', pan_it_no: '',
  bankDetails: { bankName: '', accountHolderName: '', accountNumber: '', ifscCode: '', branchName: '', accountType: '' },
};

const CustomerDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({ defaultValues: emptyCustomer });

  const loadCustomer = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchJson(`/api/customers/${id}`);
      setCustomer(data); reset({ ...emptyCustomer, ...data });
    } catch (error) { setMessage({ type: 'error', text: error.message }); } finally { setLoading(false); }
  }, [id, reset]);
  useEffect(() => { loadCustomer(); }, [loadCustomer]);

  const saveCustomer = async (data) => {
    try {
      const updatedCustomer = await fetchJson(`/api/customers/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, oldBalance: Number(data.oldBalance || 0) }) });
      setCustomer(updatedCustomer); reset({ ...emptyCustomer, ...updatedCustomer }); setEditing(false);
      setMessage({ type: 'success', text: 'Customer updated successfully.' });
    } catch (error) { setMessage({ type: 'error', text: error.message }); }
  };
  const deleteCustomer = async () => {
    if (!window.confirm(`Delete ${customer.name}? This cannot be undone.`)) return;
    try {
      await fetchJson(`/api/customers/${id}`, { method: 'DELETE' });
      navigate('/customer-list');
    } catch (error) { setMessage({ type: 'error', text: error.message }); }
  };

  if (loading) return <main className="customer-details-page"><p>Loading customer…</p></main>;
  if (!customer) return <main className="customer-details-page"><button type="button" className="back-button" onClick={() => navigate('/customer-list')}>← Back to customers</button>{message.text && <p className="details-message error">{message.text}</p>}</main>;
  return <main className="customer-details-page"><section className="customer-details-card">
    <button type="button" className="back-button" onClick={() => navigate('/customer-list')}>← Back to customers</button>
    <header className="customer-details-header"><div><p>Customer details</p><h1>{customer.name}</h1></div><div className="details-actions"><button type="button" className="edit-button" onClick={() => { setEditing(true); setMessage({ type: '', text: '' }); }}>Edit</button><button type="button" className="delete-button" onClick={deleteCustomer}>Delete</button></div></header>
    {message.text && <p className={`details-message ${message.type}`}>{message.text}</p>}
    {editing ? <form className="customer-details-form" onSubmit={handleSubmit(saveCustomer)}>
      <label>Customer name <b>*</b><input {...register('name', { required: 'Customer name is required.' })} />{errors.name && <small>{errors.name.message}</small>}</label><label>Phone number<input type="tel" {...register('phone')} /></label><label>Door / house no.<input {...register('door')} /></label><label>Street<input {...register('street')} /></label><label>Area<input {...register('area')} /></label><label>District<input {...register('district')} /></label><label>State<input {...register('state')} /></label><label>Pincode<input inputMode="numeric" {...register('pincode')} /></label><label>Balance<input type="number" step="0.01" {...register('oldBalance')} /></label><label>GST number<input {...register('gst_no')} /></label><label>PAN / IT number<input {...register('pan_it_no')} /></label><label>Bank name<input {...register('bankDetails.bankName')} /></label><label>Account holder name<input {...register('bankDetails.accountHolderName')} /></label><label>Account number<input {...register('bankDetails.accountNumber')} /></label><label>IFSC code<input {...register('bankDetails.ifscCode')} /></label><label>Branch name<input {...register('bankDetails.branchName')} /></label><label>Account type<select {...register('bankDetails.accountType')}><option value="">Select type</option><option value="Savings">Savings</option><option value="Current">Current</option><option value="Other">Other</option></select></label>
      <div className="form-actions"><button type="button" className="back-button" onClick={() => { reset({ ...emptyCustomer, ...customer }); setEditing(false); }}>Cancel</button><button type="submit" className="save-button" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save changes'}</button></div>
    </form> : <dl className="customer-details-grid"><div><dt>Phone number</dt><dd>{customer.phone || '—'}</dd></div><div><dt>Balance</dt><dd>₹{Number(customer.oldBalance || 0).toFixed(2)}</dd></div><div><dt>Door / house no.</dt><dd>{customer.door || '—'}</dd></div><div><dt>Street</dt><dd>{customer.street || '—'}</dd></div><div><dt>Area</dt><dd>{customer.area || '—'}</dd></div><div><dt>District</dt><dd>{customer.district || '—'}</dd></div><div><dt>State</dt><dd>{customer.state || '—'}</dd></div><div><dt>Pincode</dt><dd>{customer.pincode || '—'}</dd></div><div><dt>GST number</dt><dd>{customer.gst_no || '—'}</dd></div><div><dt>PAN / IT number</dt><dd>{customer.pan_it_no || '—'}</dd></div><div><dt>Bank name</dt><dd>{customer.bankDetails?.bankName || '—'}</dd></div><div><dt>Account holder name</dt><dd>{customer.bankDetails?.accountHolderName || '—'}</dd></div><div><dt>Account number</dt><dd>{customer.bankDetails?.accountNumber || '—'}</dd></div><div><dt>IFSC code</dt><dd>{customer.bankDetails?.ifscCode || '—'}</dd></div><div><dt>Branch name</dt><dd>{customer.bankDetails?.branchName || '—'}</dd></div><div><dt>Account type</dt><dd>{customer.bankDetails?.accountType || '—'}</dd></div></dl>}
  </section></main>;
};
export default CustomerDetails;
