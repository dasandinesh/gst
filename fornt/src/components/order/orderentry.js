import React, { useRef, useState,useEffect, useCallback } from 'react';
import { useForm, useFieldArray } from "react-hook-form";
import './order.css';
import axios from 'axios';

// Local calendar date as yyyy-mm-dd (toISOString alone would shift the day for non-UTC zones).
const todayString = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().split("T")[0];
};

// Any stored/ISO date -> yyyy-mm-dd for a <input type="date">.
const toDateInput = (value) => {
    if (!value) return todayString();
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return todayString();
    parsed.setMinutes(parsed.getMinutes() - parsed.getTimezoneOffset());
    return parsed.toISOString().split("T")[0];
};

const OrderEntry = () => {
    const CustomerNameInputRef = useRef(null);
    const productNameInputRef = useRef(null);
    const quantityInputRef = useRef(null);
    const bagsInputRef = useRef(null);
    const scaleInputRef = useRef(null);
    const singlePriceInputRef = useRef(null);

    const [customerList, setCustomerList] = useState([]);
    const [productList, setProductList] = useState([]);

    // Summary panel: defaults to today's orders, refetches whenever a date changes.
    const [orderFilter, setOrderFilter] = useState({ startDate: todayString(), endDate: todayString() });
    const [orderSummary, setOrderSummary] = useState([]);
    const [summaryStatus, setSummaryStatus] = useState('');
    const [selectedIds, setSelectedIds] = useState(new Set()); // order _ids checked in the summary list.

    const loadOrderSummary = useCallback(async () => {
        const params = new URLSearchParams();
        if (orderFilter.startDate) params.set('startDate', orderFilter.startDate);
        if (orderFilter.endDate) params.set('endDate', orderFilter.endDate);
        setSummaryStatus('Loading…');
        setSelectedRow(-1);
        setSelectedIds(new Set());
        try {
            const response = await axios.get(`/api/orders${params.toString() ? `?${params}` : ''}`);
            setOrderSummary(response.data);
            setSummaryStatus(response.data.length ? '' : 'No orders for this date.');
        } catch (error) {
            setOrderSummary([]);
            setSummaryStatus(error.response?.data?.error || 'Unable to load orders.');
        }
    }, [orderFilter.startDate, orderFilter.endDate]);

    useEffect(() => {
        loadOrderSummary();
    }, [loadOrderSummary]);

    useEffect(() => {
        axios.get('/api/customers')
            .then(response => {
                setCustomerList(response.data);
            })
            .catch(error => {
                console.error('Error fetching customer list:', error);
            });

        axios.get('/api/products')
            .then(response => {
                setProductList(response.data);
            })
            .catch(error => {
                console.error('Error fetching product list:', error);
            });

        CustomerNameInputRef.current?.focus();
    }, []);

    const handleKeyDown = (e, currentRef, nextRef) => {
        if (e.key === 'Enter') {
            e.preventDefault(); // Prevents accidental form submission
            nextRef.current?.focus();
            if (currentRef === singlePriceInputRef) {
                if (!product.name || (!product.quantity && !product.bags) || !product.scale || !product.single_price) {
                    alert("Please fill in the product details before adding (quantity or bags is enough).");
                    return;
                } else {
                    handleAddProduct();
                    alert("Product Added");
                }
                setTimeout(() => {
                    productNameInputRef.current?.focus();
                }, 0);
            }
        }
    };

    // Function to move focus to the next index on Enter
    const handleKeyDownforprice = (e, fieldName, index) => {
        if (e.key === 'Enter') {
            e.preventDefault(); // Prevent form submission on Enter
            const nextInput = document.querySelector(`input[name="products.${index + 1}.${fieldName}"]`);
            if (nextInput) {
                nextInput.focus();
                nextInput.select(); // Optional: selects text for quick editing
            }
        }
    };
    const [isSubscribed, setIsSubscribed] = useState(false);
    const handleCheckboxChange = () => {
        setIsSubscribed(!isSubscribed);
    };
 
 
    const [product, setProduct] = useState({
        name: "",
        comment: "",
        quantity: "",
        bags: "",
        scale: "mixters",
        single_price: "",
        base_price: "",
        crossprice: "",
        crossprice_total: "",
        scaleno: "",
        single_bag_amount: "",
        bagprice: "",
        bagRate: "", // per-bag purchase rate, pulled from the product master — not shown in the UI, just saved with the order.
        single_wages_amount: "",
        Wages: "",
        wage: "", // per-bag wage rate, pulled from the product master — not shown in the UI, just saved with the order.
        single_commission_amount: "",
        commission: "", // per-bag commission rate, pulled from the product master — not shown in the UI, just saved with the order.
        price: "",
    });


    const [saveStatus, setSaveStatus] = useState('');
    const [editingId, setEditingId] = useState(null); // null = creating a new order.
    const [viewOrder, setViewOrder] = useState(null); // order shown in the read-only details popup.
    const [selectedRow, setSelectedRow] = useState(-1); // highlighted row in the summary list.
    const [customerWarning, setCustomerWarning] = useState(''); // set when a name is not in the customer list.
    const [productWarning, setProductWarning] = useState(''); // set when a name is not in the product list.

    const customerExists = (name) =>
        !name || customerList.some((cust) => cust.name?.toLowerCase() === name.trim().toLowerCase());
    const productExists = (name) =>
        !name || productList.some((prod) => prod.name?.toLowerCase() === name.trim().toLowerCase());
    const { register, control, handleSubmit, setValue, reset, getValues, watch } = useForm({
        defaultValues: {
            customer: { name: "" },
            bill_details: {
                order_sno: "",
                date: new Date().toISOString().split("T")[0],
                bill_date: new Date().toISOString().split("T")[0],
                total_quantity: "",
                bag_quantity: "",
                weight: "",
                base_price: "",
                transport: "",
                totalbagprice: "",
                totalWages: "",
                totalcommission: "",
                credit: "",
                cash: "",
                old_balance: "",
                new_balance: "",
                subtotal: "",
                bill_amount: "",
                billed: false,

            },
            products: [
                // { name: "", comment: "", quantity: "", single_price: "", scale: "", scaleno: "", single_bag_amount: "", bagprice: "", single_wages_amount: "", Wages: "", single_commission_amount: "", commission: "", price: "" }
            ],
        },
    });
    const customerNameRegistration = register("customer.name", { required: "Customer name is required." });
    const { fields, append, remove } = useFieldArray({
        control,
        name: "products",
    });
    const handleAddProduct = () => {
        if (!productExists(product.name)) {
            setProductWarning('This product is not in the list. Please add the product first.');
            return;
        }
        const quantity = Number(product.quantity);
        const singlePrice = Number(product.single_price);
        const basePrice = quantity * singlePrice;
        append({
            ...product,
            base_price: basePrice,
        });
        setProduct({
            name: "",
            comment: "",
            quantity: "",
            bags: "",
            single_price: "",
            base_price: "",
            scale: "mixters",
            crossprice: "",
            crossprice_total: "",
            scaleno: "",
            single_bag_amount: "",
            bagprice: "",
            bagRate: "",
            single_wages_amount: "",
            Wages: "",
            wage: "",
            single_commission_amount: "",
            commission: "",
            price: "",
        });
        calculateTotals();

    };

    const calculateTotals = () => {
        const products = getValues("products");
        const totalQuantity = products.reduce((sum, product) => sum + Number(product.quantity || 0), 0);
        const totalBagQuantity = products.reduce((sum, product) => sum + Number(product.bags || 0), 0);
        const totalWeight = products.reduce((sum, product) => sum + (Number(product.quantity || 0) * Number(product.scale || 0)), 0);
        setValue('bill_details.total_quantity', totalQuantity);
        setValue('bill_details.bag_quantity', totalBagQuantity);
        setValue('bill_details.weight', totalWeight);
    };
    const up = (index) => {
        if (index > 0) {
            const values = getValues("products");
            [values[index], values[index - 1]] = [values[index - 1], values[index]];
            reset({ ...getValues(), products: values });
        }
    };
    const blankForm = () => ({
        customer: { name: "" },
        bill_details: {
            order_sno: "",
            date: todayString(),
            bill_date: todayString(),
            total_quantity: "",
            bag_quantity: "",
            weight: "",
            billed: false,
        },
        products: [],
    });

    const handleNewOrder = () => {
        setEditingId(null);
        setIsSubscribed(false);
        setSaveStatus('');
        setSelectedRow(-1);
        setCustomerWarning('');
        setProductWarning('');
        reset(blankForm());
    };

    // Load an existing order from the summary list back into the form for editing.
    const handleEdit = (order) => {
        setEditingId(order._id);
        setIsSubscribed(Boolean(order.bill_details?.billed));
        setSaveStatus('');
        setCustomerWarning('');
        setProductWarning('');
        reset({
            customer: { name: order.customer?.name || "" },
            bill_details: {
                ...order.bill_details,
                date: toDateInput(order.bill_details?.date),
                bill_date: toDateInput(order.bill_details?.bill_date),
            },
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

    // Arrow up/down through the summary list; the highlighted order is loaded into the form.
    const handleSummaryKeyDown = (e) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        if (!orderSummary.length) return;
        e.preventDefault();
        setSelectedRow((current) => {
            const base = current < 0 ? (e.key === 'ArrowDown' ? -1 : orderSummary.length) : current;
            const next = e.key === 'ArrowDown'
                ? Math.min(base + 1, orderSummary.length - 1)
                : Math.max(base - 1, 0);
            handleEdit(orderSummary[next]);
            return next;
        });
    };

    // After a customer is picked, if the selected date range already has an order for
    // that customer, pull it into the form so it can be updated instead of duplicated.
    const loadExistingOrderForCustomer = (name) => {
        if (!name || editingId) return;
        const match = orderSummary.find(
            (order) => order.customer?.name?.toLowerCase() === name.trim().toLowerCase()
        );
        if (match) {
            const rowIndex = orderSummary.indexOf(match);
            setSelectedRow(rowIndex);
            handleEdit(match);
            setSaveStatus(`Existing order ${match.bill_details?.order_sno || ''} loaded for editing.`);
        }
    };

    const toggleSelectAll = (e) => {
        setSelectedIds(e.target.checked ? new Set(orderSummary.map((order) => order._id)) : new Set());
    };

    const toggleSelectRow = (id) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const handleDeleteSelected = async () => {
        if (!selectedIds.size) {
            alert('Select at least one order to delete.');
            return;
        }
        if (!window.confirm(`Delete ${selectedIds.size} selected order(s)? This cannot be undone.`)) return;
        try {
            await Promise.all(Array.from(selectedIds).map((id) => axios.delete(`/api/orders/${id}`)));
            if (editingId && selectedIds.has(editingId)) handleNewOrder();
            setSelectedIds(new Set());
            loadOrderSummary();
        } catch (error) {
            setSummaryStatus(error.response?.data?.error || 'Unable to delete selected orders.');
        }
    };

    // Groups the currently loaded orders by customer and prints one line per
    // customer listing each "mixters"-scale product with its quantity and scale, A5 page size.
    const handlePrintByCustomer = () => {
        if (!orderSummary.length) {
            alert('No orders to print for the selected dates.');
            return;
        }
        const grouped = new Map();
        orderSummary.forEach((order) => {
            const name = order.customer?.name || 'Unknown';
            const mixerProducts = (order.products || []).filter((item) => item.scale === 'mixters');
            if (!mixerProducts.length) return;
            if (!grouped.has(name)) grouped.set(name, []);
            grouped.get(name).push(...mixerProducts);
        });

        if (!grouped.size) {
            alert('No "mixters" scale products in the selected orders.');
            return;
        }

        const rows = Array.from(grouped.entries()).map(([customer, products]) => {
            const productText = products
                .map((item) => `${item.name} ${item.quantity}${item.scale || ''}`)
                .join(', ');
            return `<div class="customer-block"><span class="customer-name">${customer}</span> — ${productText}</div>`;
        }).join('');

        const printWindow = window.open('', '_blank', 'width=600,height=800');
        if (!printWindow) {
            alert('Please allow popups to print.');
            return;
        }
        printWindow.document.write(`
            <html>
            <head>
                <title>Order Summary</title>
                <style>
                    @page { size: A5; margin: 10mm; }
                    body { font-family: Arial, sans-serif; font-size: 13px; }
                    h3 { margin: 0 0 10px; }
                    .customer-block { margin-bottom: 6px; }
                    .customer-name { font-weight: bold; }
                </style>
            </head>
            <body>
                <h3>Orders (${orderFilter.startDate} to ${orderFilter.endDate})</h3>
                ${rows}
            </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
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
        const payload = {
            ...data,
            bill_details: { ...data.bill_details, billed: isSubscribed },
        };
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

    return (
        <div className="order-entry-container">
            <div className="order-entry-form">
                <form onSubmit={handleSubmit(onSubmit)}>
                    <div className="customer-bill-details">
                        <div><label>Customer Name:</label>
                            <input
                                type="text"
                                className="textInput"
                                {...customerNameRegistration}
                                list="customer-list"
                                ref={(element) => {
                                    customerNameRegistration.ref(element);
                                    CustomerNameInputRef.current = element;
                                }}
                                onChange={(e) => {
                                    customerNameRegistration.onChange(e);
                                    if (customerWarning) setCustomerWarning('');
                                }}
                                onBlur={(e) => {
                                    customerNameRegistration.onBlur(e);
                                    const known = customerExists(e.target.value);
                                    setCustomerWarning(known ? '' : 'This customer is not in the list. Please add the customer first.');
                                    if (known) loadExistingOrderForCustomer(e.target.value);
                                }}
                                onKeyDown={(e) => handleKeyDown(e, CustomerNameInputRef, productNameInputRef)}

                            />
                            {customerWarning && <p className="field-warning" role="alert">{customerWarning}</p>}</div>
                        <datalist id="customer-list">
                            {customerList.map((cust, index) => (
                                <option key={index} value={cust.name} />
                            ))}
                        </datalist>
                        <div></div>
                        <div></div>

                        <div><label>Bill Date:</label><br></br>
                            <input type="date" {...register("bill_details.date")} /></div>


                        <div> <label>Bill Number:</label>
                            <input type="text" placeholder="Auto" {...register("bill_details.order_sno")} /></div>


                    </div>
                    <div>
                        <div className="product-input-grid">
                            <div className="product-input-field">
                                <label>Product Name</label>
                                <br />
                                <input
                                    type="text"
                                    name="productname"
                                    value={product.name}
                                    placeholder="Product Name"
                                    list="product-list"
                                    ref={productNameInputRef}
                                    className="textInput"
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        const selectedProduct = productList.find((prod) => prod.name === val);
                                        if (productWarning) setProductWarning('');
                                        setProduct({
                                            ...product,
                                            name: val,
                                            single_price: selectedProduct ? selectedProduct.Price : "",
                                            single_bag_amount: selectedProduct ? selectedProduct.single_bag_amount : "",
                                            single_wages_amount: selectedProduct ? selectedProduct.single_wages_amount : "",
                                            single_commission_amount: selectedProduct ? selectedProduct.single_commission_amount : "",
                                            // Bag rate, wage and commission are looked up from the product master and
                                            // carried on the line silently — no inputs for them here; the backend
                                            // turns them into bagAmount/wageAmount/commissionAmount (rate × bags)
                                            // and rolls those into the order's bill_amount.
                                            bagRate: selectedProduct ? (selectedProduct.pags ?? "") : "",
                                            wage: selectedProduct ? (selectedProduct.Wages ?? "") : "",
                                            commission: selectedProduct ? (selectedProduct.commission ?? "") : "",

                                        });
                                    }}
                                    onBlur={(e) => setProductWarning(productExists(e.target.value) ? '' : 'This product is not in the list. Please add the product first.')}
                                    onKeyDown={(e) => handleKeyDown(e, productNameInputRef, quantityInputRef)}

                                />

                                <datalist id="product-list">
                                    {productList.map((prod, index) => (
                                        <option key={index} value={prod.name} />
                                    ))}
                                </datalist>
                                {productWarning && <p className="field-warning" role="alert">{productWarning}</p>}
                            </div>
                            <div className="product-input-field">
                                <label>Quantity</label>
                                <br />
                                <input
                                    type="number"
                                    name="quantity"
                                    id="quantity"
                                    ref={quantityInputRef}
                                    value={product.quantity}
                                    className="small-input"
                                    onChange={(e) => {
                                        setProduct({ ...product, quantity: e.target.value });
                                    }}
                                    placeholder="Quantity"
                                    onKeyDown={(e) => handleKeyDown(e, quantityInputRef, bagsInputRef)}

                                />
                            </div>
                            <div className="product-input-field">
                                <label>bags</label>
                                <br />
                                <input
                                    type="number"
                                    name="bags"
                                    id="bags"
                                    ref={bagsInputRef}
                                    value={product.bags}
                                    className="small-input"
                                    onChange={(e) => {
                                        const bags = e.target.value;
                                        // Entering a bag count auto-fills Scale with the product's unit.
                                        const selectedProduct = productList.find((prod) => prod.name === product.name);
                                        setProduct({
                                            ...product,
                                            bags,
                                            scale: bags && selectedProduct?.Unit ? selectedProduct.Unit : product.scale,
                                        });
                                    }}
                                    placeholder="Bags"
                                    onKeyDown={(e) => handleKeyDown(e, bagsInputRef, scaleInputRef)}

                                />
                            </div>
                            <div className="product-input-field">
                                <label>Scale</label>
                                <br />
                                <input
                                    type="text"
                                    name="scale"
                                    value={product.scale}
                                    className="small-input"
                                    onChange={(e) => setProduct({ ...product, scale: e.target.value })}
                                    placeholder="Scale"
                                    ref={scaleInputRef}
                                    onKeyDown={(e) => handleKeyDown(e, scaleInputRef, singlePriceInputRef)}
                                    list='scallist'
                                />
                                <datalist id="scallist">
                                    <option value="mixters" />
                                    <option value="bag" />
                                    <option value="o bag" />
                                    <option value="leaves" />
                                    <option value="box" />

                                </datalist>
                            </div>
                            <div className="product-input-field">
                                <label>Single Price</label>
                                <br />
                                <input
                                    type="number"
                                    name="single_price"
                                    value={product.single_price}
                                    className="small-input"
                                    onChange={(e) => setProduct({ ...product, single_price: e.target.value })}
                                    placeholder="Price"
                                    ref={singlePriceInputRef}
                                    onKeyDown={(e) => handleKeyDown(e, singlePriceInputRef, productNameInputRef)}
                                />
                            </div>
                            <div className="product-input-field">
                                <button
                                    type="button"
                                    className="add-button"
                                    onClick={handleAddProduct}

                                >
                                    Add
                                </button>
                            </div>
                        </div>
                    </div>
                    <div className="table-wrapper" style={{ height: "200px", overflow: "auto" }}>
                        <table className="product-table">
                            <thead>
                                <tr>
                                    <th>Product Name</th>
                                    <th>Quantity</th>
                                    <th>Bags</th>
                                    <th>Single Price</th>
                                    <th> Price</th>
                                    <th>Actions</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {fields.map((item, index) => (
                                    <tr key={item.id}>
                                        <td className="product-name-cell">
                                            <input
                                                className="product-name-cell" type="text"
                                                {...register(`products.${index}.name`)}
                                                list='product-list'
                                                onKeyDown={(e) => handleKeyDownforprice(e, "name", index)}
                                            />
                                        </td>
                                        <datalist id="product-list">
                                            {productList.map((prod, index) => (
                                                <option key={index} value={prod.name} />
                                            ))}
                                        </datalist>
                                        <td className="product-quantity-cell">
                                            <input
                                                className="product-quantity-cell"
                                                type="number"
                                                {...register(`products.${index}.quantity`)}
                                                onKeyDown={(e) => handleKeyDownforprice(e,"quantity", index)}
                                            />
                                        </td>
                                        <td className="product-quantity-cell">
                                            <input
                                                className="product-quantity-cell"
                                                type="number"
                                                {...register(`products.${index}.bags`)}
                                                onKeyDown={(e) => handleKeyDownforprice(e,"bags", index)}
                                            />
                                        </td>

                                        <td className="product-quantity-cell">
                                            <input
                                                className="product-quantity-cell"

                                                type="number"
                                                step="0.01"
                                                {...register(`products.${index}.single_price`)}
                                                onKeyDown={(e) => handleKeyDownforprice(e,"single_price", index)}

                                            />
                                        </td>
                                        <td className="product-quantity-cell">
                                            <input
                                                className="product-quantity-cell"
                                                type="number"
                                                step="0.01"
                                                {...register(`products.${index}.base_price`)}
                                                onKeyDown={(e) => handleKeyDownforprice(e,"base_price", index)}

                                            />
                                        </td>
                                        <td className="product-quantity-cell">
                                            <button className="product-quantity-cell" type="button" onClick={() => up(index)}>up</button>
                                        </td>
                                        <td className="product-quantity-cell">
                                            <button className="product-quantity-cell" type="button" onClick={() => remove(index)}>Remove</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="bill-total-summary">
                        <div>
                            <label>Total Quantity:</label>
                            <input type="number" {...register("bill_details.total_quantity")} />
                        </div>
                        <div>
                            <label>Total Bag Quantity:</label>
                            <input type="number" {...register("bill_details.bag_quantity")} />
                        </div>
                        <div>
                            <label>Total Weight:</label>
                            <input type="number" {...register("bill_details.weight")} />
                        </div>

                        <div>
                            <label>
                                <input
                                    type="checkbox"
                                    checked={isSubscribed}
                                    onChange={handleCheckboxChange}
                                />
                                Billed
                            </label>
                        </div>


                    </div>
                    <div className="summary-buttons">
                        <button type="submit">{editingId ? 'Update' : 'Submit'}</button>
                        <div><button type="button" onClick={handleNewOrder}>new</button></div>
                        <div><button type="submit">save</button></div>
                        <div><button type="button">delete</button></div>
                    </div>
                    {editingId && <p role="status">Editing order {getValues('bill_details.order_sno') || editingId}. Press “new” to cancel.</p>}
                    {saveStatus && <p role="alert">{saveStatus}</p>}
                </form>
            </div>
            <div className="order-entry-summary">
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div>
                        <input
                            type="date"
                            value={orderFilter.startDate}
                            max={orderFilter.endDate || undefined}
                            onChange={(e) => setOrderFilter({ ...orderFilter, startDate: e.target.value })}
                        />
                    </div>
                    <div>
                        <input
                            type="date"
                            value={orderFilter.endDate}
                            min={orderFilter.startDate || undefined}
                            onChange={(e) => setOrderFilter({ ...orderFilter, endDate: e.target.value })}
                        />
                    </div>

                </div>
                <div
                    className="summary-content"
                    tabIndex={0}
                    onKeyDown={handleSummaryKeyDown}
                >
                    <table>
                        <tbody>
                            <tr>
                                <td>
                                    <input
                                        type="checkbox"
                                        checked={orderSummary.length > 0 && selectedIds.size === orderSummary.length}
                                        onChange={toggleSelectAll}
                                    />
                                </td>
                                <td>S.no</td>
                                <td>customer</td>
                                <td>biled</td>
                                <td>views</td>
                                <td>edit</td>
                            </tr>
                            {orderSummary.map((order, index) => (
                                <tr
                                    key={order._id}
                                    className={index === selectedRow ? 'summary-row-selected' : undefined}
                                    onClick={() => { setSelectedRow(index); handleEdit(order); }}
                                >
                                    <td>
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.has(order._id)}
                                            onClick={(e) => e.stopPropagation()}
                                            onChange={() => toggleSelectRow(order._id)}
                                        />
                                    </td>
                                    <td>{order.bill_details?.order_sno || '—'}</td>
                                    <td>{order.customer?.name || '—'}</td>
                                    <td>{order.bill_details?.billed ? 'Billed' : 'Pending'}</td>
                                    <td><button type="button" onClick={(e) => { e.stopPropagation(); setViewOrder(order); }}>view</button></td>
                                    <td><button type="button" onClick={(e) => { e.stopPropagation(); setSelectedRow(index); handleEdit(order); }}>edit</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {summaryStatus && <p role="status">{summaryStatus}</p>}
                </div>
                <div className="summary-buttons">
                    <div><button type="button">Total order</button></div>
                    <div><button type="button" onClick={handlePrintByCustomer}>mixer</button></div>
                    <div><button type="button">all views</button></div>
                    <div><button type="button" onClick={handleDeleteSelected}>delete ({selectedIds.size})</button></div>
                </div>
            </div>

            {viewOrder && (
                <div className="order-view-overlay" onClick={() => setViewOrder(null)}>
                    <div className="order-view-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="order-view-header">
                            <h3>Order details</h3>
                            <button type="button" onClick={() => setViewOrder(null)}>✕</button>
                        </div>
                        <div className="order-view-meta">
                            <div><span>Bill No.</span><strong>{viewOrder.bill_details?.order_sno || '—'}</strong></div>
                            <div><span>Customer</span><strong>{viewOrder.customer?.name || '—'}</strong></div>
                            <div><span>Date</span><strong>{toDateInput(viewOrder.bill_details?.date)}</strong></div>
                            <div><span>Status</span><strong>{viewOrder.bill_details?.billed ? 'Billed' : 'Pending'}</strong></div>
                        </div>
                        <table className="order-view-table">
                            <thead>
                                <tr><th>Product</th><th>Qty</th><th>Bags</th><th>Scale</th><th>Single price</th><th>Amount</th></tr>
                            </thead>
                            <tbody>
                                {(viewOrder.products || []).map((item, index) => (
                                    <tr key={index}>
                                        <td>{item.name}</td>
                                        <td>{item.quantity}</td>
                                        <td>{item.bags}</td>
                                        <td>{item.scale || '—'}</td>
                                        <td>{item.single_price}</td>
                                        <td>{item.base_price}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div className="order-view-totals">
                            <div><span>Total quantity</span><strong>{viewOrder.bill_details?.total_quantity || 0}</strong></div>
                            <div><span>Total bags</span><strong>{viewOrder.bill_details?.bag_quantity || 0}</strong></div>
                            <div><span>Weight</span><strong>{viewOrder.bill_details?.weight || 0}</strong></div>
                            <div><span>Bill amount</span><strong>₹{Number(viewOrder.bill_details?.bill_amount || 0).toFixed(2)}</strong></div>
                        </div>
                        <div className="order-view-actions">
                            <button type="button" onClick={() => { handleEdit(viewOrder); setViewOrder(null); }}>Edit this order</button>
                            <button type="button" onClick={() => setViewOrder(null)}>Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
export default OrderEntry;
