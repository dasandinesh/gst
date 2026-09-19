import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useForm, useFieldArray } from "react-hook-form";
import './ordermobile.css';
import axios from 'axios';

// Mobile-first order entry — same data/save logic as orderentry.js, but laid out as
// single-column stacked cards instead of the desktop's side-by-side grid + wide table,
// which doesn't fit a phone screen. Kept as its own component (rather than making
// orderentry.js responsive) so each layout can be edited independently.

const todayString = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().split("T")[0];
};

const toDateInput = (value) => {
    if (!value) return todayString();
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return todayString();
    parsed.setMinutes(parsed.getMinutes() - parsed.getTimezoneOffset());
    return parsed.toISOString().split("T")[0];
};

const emptyProduct = {
    name: "",
    comment: "",
    quantity: "",
    bags: "",
    scale: "mixters",
    single_price: "",
    base_price: "",
    bagRate: "",
    wage: "",
    commission: "",
};

const OrderEntryMobile = () => {
    const productNameInputRef = useRef(null);

    const [customerList, setCustomerList] = useState([]);
    const [productList, setProductList] = useState([]);

    const [orderFilter, setOrderFilter] = useState({ startDate: todayString(), endDate: todayString() });
    const [orderSummary, setOrderSummary] = useState([]);
    const [summaryStatus, setSummaryStatus] = useState('');

    const loadOrderSummary = useCallback(async () => {
        const params = new URLSearchParams();
        if (orderFilter.startDate) params.set('startDate', orderFilter.startDate);
        if (orderFilter.endDate) params.set('endDate', orderFilter.endDate);
        setSummaryStatus('Loading…');
        try {
            const response = await axios.get(`/api/orders${params.toString() ? `?${params}` : ''}`);
            setOrderSummary(response.data);
            setSummaryStatus(response.data.length ? '' : 'No orders for this date.');
        } catch (error) {
            setOrderSummary([]);
            setSummaryStatus(error.response?.data?.error || 'Unable to load orders.');
        }
    }, [orderFilter.startDate, orderFilter.endDate]);

    useEffect(() => { loadOrderSummary(); }, [loadOrderSummary]);

    useEffect(() => {
        axios.get('/api/customers').then((r) => setCustomerList(r.data)).catch(() => {});
        axios.get('/api/products').then((r) => setProductList(r.data)).catch(() => {});
    }, []);

    const [isSubscribed, setIsSubscribed] = useState(false);
    const [product, setProduct] = useState(emptyProduct);
    const [saveStatus, setSaveStatus] = useState('');
    const [editingId, setEditingId] = useState(null);
    const [viewOrder, setViewOrder] = useState(null);
    const [customerWarning, setCustomerWarning] = useState('');
    const [productWarning, setProductWarning] = useState('');

    // Custom tap-to-select suggestion lists — native <datalist> barely works on mobile
    // browsers (iOS Safari in particular shows no suggestions at all), so these two
    // fields get their own filtered dropdown instead.
    const [customerSuggestOpen, setCustomerSuggestOpen] = useState(false);
    const [productSuggestOpen, setProductSuggestOpen] = useState(false);

    const customerExists = (name) =>
        !name || customerList.some((cust) => cust.name?.toLowerCase() === name.trim().toLowerCase());
    const productExists = (name) =>
        !name || productList.some((prod) => prod.name?.toLowerCase() === name.trim().toLowerCase());

    const { register, control, handleSubmit, setValue, reset, getValues, watch } = useForm({
        defaultValues: {
            customer: { name: "" },
            bill_details: {
                order_sno: "",
                date: todayString(),
                total_quantity: "",
                bag_quantity: "",
                weight: "",
                billed: false,
            },
            products: [],
        },
    });
    const customerNameRegistration = register("customer.name", { required: "Customer name is required." });
    const { fields, append, remove } = useFieldArray({ control, name: "products" });

    const handleAddProduct = () => {
        if (!productExists(product.name)) {
            setProductWarning('This product is not in the list. Please add the product first.');
            return;
        }
        if (!product.name || (!product.quantity && !product.bags) || !product.scale || !product.single_price) {
            alert("Please fill in the product details before adding (quantity or bags is enough).");
            return;
        }
        const basePrice = Number(product.quantity) * Number(product.single_price);
        append({ ...product, base_price: basePrice });
        setProduct(emptyProduct);
        calculateTotals();
        // Deferred a tick so focus lands after the product-list re-render settles.
        setTimeout(() => productNameInputRef.current?.focus(), 0);
    };

    const calculateTotals = () => {
        const products = getValues("products");
        const totalQuantity = products.reduce((sum, p) => sum + Number(p.quantity || 0), 0);
        const totalBagQuantity = products.reduce((sum, p) => sum + Number(p.bags || 0), 0);
        const totalWeight = products.reduce((sum, p) => sum + (Number(p.quantity || 0) * Number(p.scale || 0)), 0);
        setValue('bill_details.total_quantity', totalQuantity);
        setValue('bill_details.bag_quantity', totalBagQuantity);
        setValue('bill_details.weight', totalWeight);
    };

    const blankForm = () => ({
        customer: { name: "" },
        bill_details: { order_sno: "", date: todayString(), total_quantity: "", bag_quantity: "", weight: "", billed: false },
        products: [],
    });

    const handleNewOrder = () => {
        setEditingId(null);
        setIsSubscribed(false);
        setSaveStatus('');
        setCustomerWarning('');
        setProductWarning('');
        reset(blankForm());
    };

    const handleEdit = (order) => {
        setEditingId(order._id);
        setIsSubscribed(Boolean(order.bill_details?.billed));
        setSaveStatus('');
        setCustomerWarning('');
        setProductWarning('');
        reset({
            customer: { name: order.customer?.name || "" },
            bill_details: { ...order.bill_details, date: toDateInput(order.bill_details?.date) },
            products: (order.products || []).map((item) => ({
                name: item.name || "",
                comment: item.comment || "",
                quantity: item.quantity ?? "",
                bags: item.bags ?? "",
                scale: item.scale || "",
                single_price: item.single_price ?? "",
                base_price: item.base_price ?? "",
                bagRate: item.bagRate ?? "",
                wage: item.wage ?? "",
                commission: item.commission ?? "",
            })),
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // After picking a customer, if the selected date range (the Recent orders filter)
    // already has a bill for them, load it into the form so it's updated, not duplicated.
    const loadExistingOrderForCustomer = (name) => {
        if (!name || editingId) return;
        const match = orderSummary.find(
            (order) => order.customer?.name?.toLowerCase() === name.trim().toLowerCase()
        );
        if (match) {
            handleEdit(match);
            setSaveStatus(`Existing order ${match.bill_details?.order_sno || ''} loaded for editing.`);
        }
    };

    const handleDeleteOrder = async (order) => {
        if (!window.confirm(`Delete order ${order.bill_details?.order_sno || ''}? This cannot be undone.`)) return;
        try {
            await axios.delete(`/api/orders/${order._id}`);
            if (editingId === order._id) handleNewOrder();
            loadOrderSummary();
        } catch (error) {
            setSummaryStatus(error.response?.data?.error || 'Unable to delete the order.');
        }
    };

    const onSubmit = async (data) => {
        setSaveStatus('');
        if (!customerExists(data.customer?.name)) {
            setCustomerWarning('This customer is not in the list. Please add the customer first.');
            return;
        }
        const unknownProduct = (data.products || []).find((item) => item.name && !productExists(item.name));
        if (unknownProduct) {
            setSaveStatus(`Product "${unknownProduct.name}" is not in the list. Please add it first.`);
            return;
        }
        const payload = { ...data, bill_details: { ...data.bill_details, billed: isSubscribed } };
        try {
            const response = editingId
                ? await axios.put(`/api/orders/${editingId}`, payload)
                : await axios.post('/api/orders', payload);
            const sno = response.data.bill_details?.order_sno || '';
            setSaveStatus(`Order ${sno} ${editingId ? 'updated' : 'saved'} successfully.`);
            setEditingId(null);
            setIsSubscribed(false);
            reset(blankForm());
            loadOrderSummary();
        } catch (error) {
            setSaveStatus(error.response?.data?.error || 'Unable to save order.');
        }
    };

    const money = (n) => Number(n || 0).toFixed(2);

    // Filtered suggestion lists for the two custom autocomplete dropdowns below.
    const customerNameValue = watch('customer.name') || '';
    const customerSuggestions = (customerNameValue.trim()
        ? customerList.filter((c) => c.name?.toLowerCase().includes(customerNameValue.trim().toLowerCase()))
        : customerList
    ).slice(0, 8);
    const productSuggestions = (product.name.trim()
        ? productList.filter((p) => p.name?.toLowerCase().includes(product.name.trim().toLowerCase()))
        : productList
    ).slice(0, 8);

    const pickCustomer = (name) => {
        setValue('customer.name', name, { shouldDirty: true, shouldValidate: true });
        setCustomerWarning('');
        setCustomerSuggestOpen(false);
        loadExistingOrderForCustomer(name);
    };

    const pickProduct = (selectedProduct) => {
        if (productWarning) setProductWarning('');
        setProduct({
            ...product,
            name: selectedProduct.name,
            single_price: selectedProduct.Price ?? "",
            bagRate: selectedProduct.pags ?? "",
            wage: selectedProduct.Wages ?? "",
            commission: selectedProduct.commission ?? "",
        });
        setProductSuggestOpen(false);
    };

    return (
        <div className="om-page">
            <form className="om-form" onSubmit={handleSubmit(onSubmit)}>
                <section className="om-card om-card-billing">
                    <h2 className="om-card-title">Customer &amp; bill</h2>
                    <label className="om-field">
                        <span>Customer name</span>
                        <div className="om-autocomplete">
                            <input
                                type="text"
                                className="om-input"
                                autoComplete="off"
                                {...customerNameRegistration}
                                onChange={(e) => {
                                    customerNameRegistration.onChange(e);
                                    if (customerWarning) setCustomerWarning('');
                                    setCustomerSuggestOpen(true);
                                }}
                                onFocus={() => setCustomerSuggestOpen(true)}
                                onBlur={(e) => {
                                    customerNameRegistration.onBlur(e);
                                    const known = customerExists(e.target.value);
                                    setCustomerWarning(known ? '' : 'This customer is not in the list. Please add the customer first.');
                                    if (known) loadExistingOrderForCustomer(e.target.value);
                                    // Delayed so a tap on a suggestion still registers before the list unmounts.
                                    setTimeout(() => setCustomerSuggestOpen(false), 150);
                                }}
                            />
                            {customerSuggestOpen && customerSuggestions.length > 0 && (
                                <ul className="om-suggest-list">
                                    {customerSuggestions.map((c) => (
                                        <li key={c._id}>
                                            <button type="button" onClick={() => pickCustomer(c.name)}>{c.name}</button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </label>
                    {customerWarning && <p className="om-warning" role="alert">{customerWarning}</p>}

                    <div className="om-field-row">
                        <label className="om-field">
                            <span>Bill date</span>
                            <input type="date" className="om-input" {...register("bill_details.date")} />
                        </label>
                        <label className="om-field">
                            <span>Bill no.</span>
                            <input type="text" className="om-input" placeholder="Auto" {...register("bill_details.order_sno")} />
                        </label>
                    </div>

                    <div className="om-section-divider" />
                    <h2 className="om-card-title">Add product</h2>
                    <label className="om-field">
                        <span>Product name</span>
                        <div className="om-autocomplete">
                            <input
                                type="text"
                                className="om-input"
                                autoComplete="off"
                                ref={productNameInputRef}
                                value={product.name}
                                placeholder="Product name"
                                onChange={(e) => {
                                    const val = e.target.value;
                                    const selectedProduct = productList.find((prod) => prod.name === val);
                                    if (productWarning) setProductWarning('');
                                    setProduct({
                                        ...product,
                                        name: val,
                                        single_price: selectedProduct ? selectedProduct.Price : "",
                                        bagRate: selectedProduct ? (selectedProduct.pags ?? "") : "",
                                        wage: selectedProduct ? (selectedProduct.Wages ?? "") : "",
                                        commission: selectedProduct ? (selectedProduct.commission ?? "") : "",
                                    });
                                    setProductSuggestOpen(true);
                                }}
                                onFocus={() => setProductSuggestOpen(true)}
                                onBlur={(e) => {
                                    setProductWarning(productExists(e.target.value) ? '' : 'This product is not in the list. Please add the product first.');
                                    setTimeout(() => setProductSuggestOpen(false), 150);
                                }}
                            />
                            {productSuggestOpen && productSuggestions.length > 0 && (
                                <ul className="om-suggest-list">
                                    {productSuggestions.map((p) => (
                                        <li key={p._id}>
                                            <button type="button" onClick={() => pickProduct(p)}>{p.name}</button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </label>
                    {/* Still used by the already-added product rows below, which keep the plain
                        native datalist since those aren't the "selection" fields being replaced. */}
                    <datalist id="om-product-list">
                        {productList.map((p) => <option key={p._id} value={p.name} />)}
                    </datalist>
                    {productWarning && <p className="om-warning" role="alert">{productWarning}</p>}

                    <div className="om-field-row">
                        <label className="om-field">
                            <span>Quantity</span>
                            <input
                                type="number"
                                className="om-input"
                                value={product.quantity}
                                placeholder="Qty"
                                onChange={(e) => setProduct({ ...product, quantity: e.target.value })}
                            />
                        </label>
                        <label className="om-field">
                            <span>Bags</span>
                            <input
                                type="number"
                                className="om-input"
                                value={product.bags}
                                placeholder="Bags"
                                onChange={(e) => {
                                    const bags = e.target.value;
                                    const selectedProduct = productList.find((prod) => prod.name === product.name);
                                    setProduct({
                                        ...product,
                                        bags,
                                        scale: bags && selectedProduct?.Unit ? selectedProduct.Unit : product.scale,
                                    });
                                }}
                            />
                        </label>
                    </div>
                    <div className="om-field-row">
                        <label className="om-field">
                            <span>Scale</span>
                            <input
                                type="text"
                                className="om-input"
                                list="om-scale-list"
                                value={product.scale}
                                onChange={(e) => setProduct({ ...product, scale: e.target.value })}
                            />
                        </label>
                        <label className="om-field">
                            <span>Single price</span>
                            <input
                                type="number"
                                className="om-input"
                                value={product.single_price}
                                placeholder="Price"
                                onChange={(e) => setProduct({ ...product, single_price: e.target.value })}
                            />
                        </label>
                    </div>
                    <datalist id="om-scale-list">
                        <option value="mixters" /><option value="bag" /><option value="o bag" /><option value="leaves" /><option value="box" />
                    </datalist>

                    <button type="button" className="om-btn om-btn-primary om-btn-block" onClick={handleAddProduct}>
                        + Add product
                    </button>
                    <button type="submit" className="om-btn om-btn-block om-btn-save-inline">
                        {editingId ? 'Update order' : 'Save order'}
                    </button>

                    {fields.length > 0 && (
                        <>
                            <div className="om-section-divider" />
                            <h2 className="om-card-title">Products ({fields.length})</h2>
                            <div className="om-product-list">
                                {fields.map((item, index) => (
                                    <div className="om-product-row" key={item.id}>
                                        <div className="om-product-row-top">
                                            <input className="om-input om-product-name" type="text" {...register(`products.${index}.name`)} list="om-product-list" />
                                            <button type="button" className="om-remove" onClick={() => { remove(index); calculateTotals(); }} aria-label="Remove">✕</button>
                                        </div>
                                        <div className="om-product-row-grid">
                                            <label><span>Qty</span><input className="om-input" type="number" {...register(`products.${index}.quantity`)} /></label>
                                            <label><span>Bags</span><input className="om-input" type="number" {...register(`products.${index}.bags`)} /></label>
                                            <label><span>Price</span><input className="om-input" type="number" step="0.01" {...register(`products.${index}.single_price`)} /></label>
                                            <label><span>Amount</span><input className="om-input" type="number" step="0.01" {...register(`products.${index}.base_price`)} /></label>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    <div className="om-section-divider" />
                    <div className="om-totals">
                        <div><span>Total quantity</span><strong className="om-total-value">{watch('bill_details.total_quantity') || 0}</strong></div>
                        <div><span>Total bags</span><strong className="om-total-value">{watch('bill_details.bag_quantity') || 0}</strong></div>
                        <div><span>Total weight</span><strong className="om-total-value">{watch('bill_details.weight') || 0}</strong></div>
                    </div>

                    {editingId && <p className="om-status" role="status">Editing order {getValues('bill_details.order_sno') || editingId}.</p>}
                    {saveStatus && <p className="om-status" role="alert">{saveStatus}</p>}

                    <div className="om-actions om-actions-inline">
                        <button type="submit" className="om-btn om-btn-primary om-btn-block">{editingId ? 'Update order' : 'Save order'}</button>
                        <button type="button" className="om-btn om-btn-block" onClick={handleNewOrder}>New order</button>
                    </div>
                </section>
            </form>

            <section className="om-card om-summary">
                <h2 className="om-card-title">Recent orders</h2>
                <div className="om-filter-box">
                    <div className="om-field-row">
                        <label className="om-field">
                            <span>From</span>
                            <input type="date" className="om-input" value={orderFilter.startDate} max={orderFilter.endDate || undefined}
                                onChange={(e) => setOrderFilter({ ...orderFilter, startDate: e.target.value })} />
                        </label>
                        <label className="om-field">
                            <span>To</span>
                            <input type="date" className="om-input" value={orderFilter.endDate} min={orderFilter.startDate || undefined}
                                onChange={(e) => setOrderFilter({ ...orderFilter, endDate: e.target.value })} />
                        </label>
                    </div>
                </div>

                {summaryStatus && <p className="om-status" role="status">{summaryStatus}</p>}

                <div className="om-order-list">
                    {orderSummary.map((order) => (
                        <div className="om-order-card" key={order._id}>
                            <div className="om-order-card-top">
                                <div>
                                    <div className="om-order-card-title">{order.customer?.name || '—'}</div>
                                    <div className="om-order-card-sub">Bill {order.bill_details?.order_sno || '—'}</div>
                                </div>
                                <span className={`om-badge ${order.bill_details?.billed ? 'is-billed' : 'is-pending'}`}>
                                    {order.bill_details?.billed ? 'Billed' : 'Pending'}
                                </span>
                            </div>
                            <div className="om-order-card-amount">₹{money(order.bill_details?.bill_amount)}</div>
                            <div className="om-order-card-actions">
                                <button type="button" className="om-btn" onClick={() => setViewOrder(order)}>View</button>
                                <button type="button" className="om-btn" onClick={() => handleEdit(order)}>Edit</button>
                                <button type="button" className="om-btn om-btn-danger" onClick={() => handleDeleteOrder(order)}>Delete</button>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {viewOrder && (
                <div className="om-overlay" onClick={() => setViewOrder(null)}>
                    <div className="om-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="om-modal-header">
                            <h3>Order details</h3>
                            <button type="button" className="om-remove" onClick={() => setViewOrder(null)}>✕</button>
                        </div>
                        <div className="om-modal-meta">
                            <div><span>Bill no.</span><strong>{viewOrder.bill_details?.order_sno || '—'}</strong></div>
                            <div><span>Customer</span><strong>{viewOrder.customer?.name || '—'}</strong></div>
                            <div><span>Date</span><strong>{toDateInput(viewOrder.bill_details?.date)}</strong></div>
                            <div><span>Status</span><strong>{viewOrder.bill_details?.billed ? 'Billed' : 'Pending'}</strong></div>
                        </div>
                        <div className="om-product-list">
                            {(viewOrder.products || []).map((item, index) => (
                                <div className="om-product-row" key={index}>
                                    <div className="om-product-row-top"><strong>{item.name}</strong></div>
                                    <div className="om-order-card-sub">
                                        Qty {item.quantity || 0} · Bags {item.bags || 0} · {item.scale || '—'} · ₹{money(item.single_price)} = ₹{money(item.base_price)}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="om-modal-meta">
                            <div><span>Bill amount</span><strong>₹{money(viewOrder.bill_details?.bill_amount)}</strong></div>
                        </div>
                        <div className="om-actions">
                            <button type="button" className="om-btn om-btn-primary om-btn-block" onClick={() => { handleEdit(viewOrder); setViewOrder(null); }}>Edit this order</button>
                            <button type="button" className="om-btn om-btn-block" onClick={() => setViewOrder(null)}>Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default OrderEntryMobile;
