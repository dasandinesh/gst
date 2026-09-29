import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useForm, useFieldArray } from "react-hook-form";
import './sale.css';
import axios from 'axios';
import { renderBillHtml, buildBillsDocumentHtml } from './billTemplate';

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

const SaleEntry = () => {
    const CustomerNameInputRef = useRef(null);
    const productNameInputRef = useRef(null);
    const quantityInputRef = useRef(null);
    const bagsInputRef = useRef(null);
    const scaleInputRef = useRef(null);
    const singlePriceInputRef = useRef(null);
    const bagRateInputRef = useRef(null);
    const wageInputRef = useRef(null);
    const commissionInputRef = useRef(null);

    const [customerList, setCustomerList] = useState([]);
    const [productList, setProductList] = useState([]);
    const [invoiceSetting, setInvoiceSetting] = useState(null); // shop letterhead printed on bills.

    // Summary panel: defaults to today's sales, refetches whenever a date changes.
    const [saleFilter, setSaleFilter] = useState({ startDate: todayString(), endDate: todayString() });
    const [saleSummary, setSaleSummary] = useState([]);
    const [summaryStatus, setSummaryStatus] = useState('');
    const [selectedIds, setSelectedIds] = useState(new Set()); // sale _ids checked in the summary list.

    // Order (purchase) bill list — a separate panel, same shape as the sale list above, own filter/selection.
    const [orderFilter, setOrderFilter] = useState({ startDate: todayString(), endDate: todayString() });
    const [orderListSummary, setOrderListSummary] = useState([]);
    const [orderListStatus, setOrderListStatus] = useState('');
    const [orderSelectedIds, setOrderSelectedIds] = useState(new Set());
    const [orderSelectedRow, setOrderSelectedRow] = useState(-1);

    const loadSaleSummary = useCallback(async () => {
        const params = new URLSearchParams();
        if (saleFilter.startDate) params.set('startDate', saleFilter.startDate);
        if (saleFilter.endDate) params.set('endDate', saleFilter.endDate);
        setSummaryStatus('Loading…');
        setSelectedRow(-1);
        setSelectedIds(new Set());
        try {
            const response = await axios.get(`/api/sales${params.toString() ? `?${params}` : ''}`);
            setSaleSummary(response.data);
            setSummaryStatus(response.data.length ? '' : 'No sales for this date.');
        } catch (error) {
            setSaleSummary([]);
            setSummaryStatus(error.response?.data?.error || 'Unable to load sales.');
        }
    }, [saleFilter.startDate, saleFilter.endDate]);

    const loadOrderListSummary = useCallback(async () => {
        const params = new URLSearchParams();
        if (orderFilter.startDate) params.set('startDate', orderFilter.startDate);
        if (orderFilter.endDate) params.set('endDate', orderFilter.endDate);
        setOrderListStatus('Loading…');
        setOrderSelectedRow(-1);
        setOrderSelectedIds(new Set());
        try {
            const response = await axios.get(`/api/orders${params.toString() ? `?${params}` : ''}`);
            setOrderListSummary(response.data);
            setOrderListStatus(response.data.length ? '' : 'No orders for this date.');
        } catch (error) {
            setOrderListSummary([]);
            setOrderListStatus(error.response?.data?.error || 'Unable to load orders.');
        }
    }, [orderFilter.startDate, orderFilter.endDate]);

    useEffect(() => {
        loadSaleSummary();
    }, [loadSaleSummary]);

    useEffect(() => {
        loadOrderListSummary();
    }, [loadOrderListSummary]);

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

        axios.get('/api/invoice-settings/active')
            .then(response => setInvoiceSetting(response.data))
            .catch(() => setInvoiceSetting(null)); // 0 or >1 settings — bill prints without a letterhead.

        CustomerNameInputRef.current?.focus();
    }, []);

    const handleKeyDown = (e, currentRef, nextRef) => {
        if (e.key === 'Enter') {
            e.preventDefault(); // Prevents accidental form submission
            nextRef.current?.focus();
            if (currentRef === commissionInputRef) {
                if (!product.name || !product.quantity || !product.unit || !product.rate) {
                    alert("Please fill in product name, quantity, scale and single price before adding (bags is optional).");
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
            const nextInput = document.querySelector(`input[name="items.${index + 1}.${fieldName}"]`);
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

    const emptyProduct = {
        name: "",
        comment: "",
        tamilName: "",
        quantity: "",
        bags: "",
        unit: "mixters",
        rate: "",
        bagRate: "",
        wageRate: "",
        commissionRate: "",
    };

    const [product, setProduct] = useState(emptyProduct);

    const [saveStatus, setSaveStatus] = useState('');
    const [editingId, setEditingId] = useState(null); // null = creating a new sale.
    const [viewSale, setViewSale] = useState(null); // sale shown in the read-only details popup.
    const [viewOrderBill, setViewOrderBill] = useState(null); // order shown in the read-only details popup.
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
            billDetails: {
                billNumber: "",
                orderNumber: "",
                mainParty: "",
                date: new Date().toISOString().split("T")[0],
                billDate: new Date().toISOString().split("T")[0],
                totalQuantity: "",
                totalBags: "",
                weight: "",
                subtotal: "",
                totalBagAmount: "",
                totalWage: "",
                totalCommission: "",
                freight: "",
                grandTotal: "",
                balance: "",
                openingBalance: "",
                closingBalance: "",
                debit: "",
                credit: "",
                notes: "",
                billed: false,
            },
            items: [],
        },
    });
    const customerNameRegistration = register("customer.name", { required: "Customer name is required." });
    const { fields, append, remove } = useFieldArray({
        control,
        name: "items",
    });

    // Line amount is always Quantity × Single Price. Bags never drive the price.
    const lineAmount = (item) => Number(item.quantity || 0) * Number(item.rate || 0);

    const handleAddProduct = () => {
        if (!productExists(product.name)) {
            setProductWarning('This product is not in the list. Please add the product first.');
            return;
        }
        if (!product.quantity) {
            alert('Quantity is required.');
            return;
        }
        append({
            ...product,
            amount: lineAmount(product),
        });
        setProduct(emptyProduct);
        calculateTotals();
    };

    const calculateTotals = useCallback(() => {
        const items = getValues("items");
        const totalQuantity = items.reduce((sum, p) => sum + Number(p.quantity || 0), 0);
        const totalBags = items.reduce((sum, p) => sum + Number(p.bags || 0), 0);
        const totalWeight = items.reduce((sum, p) => sum + (Number(p.quantity || 0) * Number(p.unit || 0)), 0);
        const subtotal = items.reduce((sum, p) => sum + lineAmount(p), 0);
        // Bag price / wage / commission only apply when a bag count is entered on the line.
        const bagCharge = (p, rateField) => (Number(p.bags || 0) > 0 ? Number(p.bags) * Number(p[rateField] || 0) : 0);
        const totalBagAmount = items.reduce((sum, p) => sum + bagCharge(p, 'bagRate'), 0);
        const totalWage = items.reduce((sum, p) => sum + bagCharge(p, 'wageRate'), 0);
        const totalCommission = items.reduce((sum, p) => sum + bagCharge(p, 'commissionRate'), 0);
        const freight = Number(getValues('billDetails.freight') || 0);
        setValue('billDetails.totalQuantity', totalQuantity);
        setValue('billDetails.totalBags', totalBags);
        setValue('billDetails.weight', totalWeight);
        setValue('billDetails.subtotal', subtotal);
        setValue('billDetails.totalBagAmount', totalBagAmount);
        setValue('billDetails.totalWage', totalWage);
        setValue('billDetails.totalCommission', totalCommission);
        setValue('billDetails.grandTotal', subtotal + totalBagAmount + totalWage + totalCommission + freight);
    }, [getValues, setValue]);

    // Recalculate every total whenever ANY field of ANY product row changes — typing in a
    // cell, adding/removing a row, or reordering — without wiring onChange on each input.
    const watchedProducts = watch('items');
    useEffect(() => {
        calculateTotals();
    }, [watchedProducts, calculateTotals]);

    // When Quantity or Bags in a table row loses focus, recompute that row's Price
    // (Quantity × Single Price) so it reflects the new value straight away.
    const syncLineAmount = (index) => {
        const row = getValues(`items.${index}`);
        setValue(`items.${index}.amount`, lineAmount(row));
    };
    const up = (index) => {
        if (index > 0) {
            const values = getValues("items");
            [values[index], values[index - 1]] = [values[index - 1], values[index]];
            reset({ ...getValues(), items: values });
            calculateTotals();
        }
    };
    const blankForm = () => ({
        customer: { name: "" },
        billDetails: {
            billNumber: "",
            orderNumber: "",
            mainParty: "",
            date: todayString(),
            billDate: todayString(),
            totalQuantity: "",
            totalBags: "",
            weight: "",
            subtotal: "",
            totalBagAmount: "",
            totalWage: "",
            totalCommission: "",
            freight: "",
            grandTotal: "",
            balance: "",
            openingBalance: "",
            closingBalance: "",
            debit: "",
            credit: "",
            notes: "",
            billed: false,
        },
        items: [],
    });

    const handleNewSale = () => {
        setEditingId(null);
        setIsSubscribed(false);
        setSaveStatus('');
        setSelectedRow(-1);
        setCustomerWarning('');
        setProductWarning('');
        reset(blankForm());
    };

    // Load an existing sale from the summary list back into the form for editing.
    const handleEdit = (sale) => {
        setEditingId(sale._id);
        setIsSubscribed(Boolean(sale.billDetails?.billed));
        setSaveStatus('');
        setCustomerWarning('');
        setProductWarning('');
        reset({
            customer: { name: sale.customer?.name || "" },
            billDetails: {
                ...blankForm().billDetails,
                ...sale.billDetails,
                date: toDateInput(sale.billDetails?.date),
                billDate: toDateInput(sale.billDetails?.billDate),
            },
            items: (sale.items || []).map((item) => ({
                name: item.name || "",
                comment: item.comment || "",
                tamilName: item.tamilName || "",
                quantity: item.quantity ?? "",
                bags: item.bags ?? "",
                unit: item.unit || "",
                rate: item.rate ?? "",
                amount: item.amount ?? "",
                bagRate: item.bagRate ?? "",
                wageRate: item.wageRate ?? "",
                commissionRate: item.commissionRate ?? "",
            })),
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // Turn an order (purchase) bill into a fresh sale — pulls the customer and product
    // lines across, re-pricing each line from the product master (sale price/wage/commission)
    // rather than reusing the order's purchase price.
    const handleUseOrderForSale = (order) => {
        setEditingId(null); // always a new sale, never overwrites an existing one.
        setIsSubscribed(false);
        setSaveStatus('');
        setSelectedRow(-1);
        setCustomerWarning('');
        setProductWarning('');
        reset({
            customer: { name: order.customer?.name || "" },
            billDetails: { ...blankForm().billDetails },
            items: (order.items || []).map((item) => {
                const prod = productList.find((p) => p.name?.toLowerCase() === (item.name || '').trim().toLowerCase());
                const mapped = {
                    name: item.name || "",
                    comment: item.comment || "",
                    tamilName: prod?.Tamil || prod?.tamil || "",
                    quantity: item.quantity ?? "",
                    bags: item.bags ?? "",
                    unit: item.unit || prod?.Unit || "",
                    rate: prod ? prod.Price : (item.rate ?? ""),
                    bagRate: prod ? (prod.pags ?? "") : "",
                    wageRate: prod ? (prod.Wages ?? "") : "",
                    commissionRate: prod ? (prod.commission ?? "") : "",
                };
                return { ...mapped, amount: lineAmount(mapped) };
            }),
        });
        calculateTotals();
        setSaveStatus(`Sale entry filled from order ${order.billDetails?.billNumber || ''}. Review and save.`);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // Arrow up/down through the summary list; the highlighted sale is loaded into the form.
    const handleSummaryKeyDown = (e) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        if (!saleSummary.length) return;
        e.preventDefault();
        setSelectedRow((current) => {
            const base = current < 0 ? (e.key === 'ArrowDown' ? -1 : saleSummary.length) : current;
            const next = e.key === 'ArrowDown'
                ? Math.min(base + 1, saleSummary.length - 1)
                : Math.max(base - 1, 0);
            handleEdit(saleSummary[next]);
            return next;
        });
    };

    // After a customer is picked, if the selected date range already has a sale for
    // that customer, pull it into the form so it can be updated instead of duplicated.
    const loadExistingSaleForCustomer = (name) => {
        if (!name || editingId) return;
        const match = saleSummary.find(
            (sale) => sale.customer?.name?.toLowerCase() === name.trim().toLowerCase()
        );
        if (match) {
            const rowIndex = saleSummary.indexOf(match);
            setSelectedRow(rowIndex);
            handleEdit(match);
            setSaveStatus(`Existing sale ${match.billDetails?.billNumber || ''} loaded for editing.`);
        }
    };

    const toggleSelectAll = (e) => {
        setSelectedIds(e.target.checked ? new Set(saleSummary.map((sale) => sale._id)) : new Set());
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
            alert('Select at least one sale to delete.');
            return;
        }
        if (!window.confirm(`Delete ${selectedIds.size} selected sale(s)? This cannot be undone.`)) return;
        try {
            await Promise.all(Array.from(selectedIds).map((id) => axios.delete(`/api/sales/${id}`)));
            if (editingId && selectedIds.has(editingId)) handleNewSale();
            setSelectedIds(new Set());
            loadSaleSummary();
        } catch (error) {
            setSummaryStatus(error.response?.data?.error || 'Unable to delete selected sales.');
        }
    };

    // Order list panel — same select-all/select-row/delete pattern as the sale list above.
    const toggleOrderSelectAll = (e) => {
        setOrderSelectedIds(e.target.checked ? new Set(orderListSummary.map((order) => order._id)) : new Set());
    };

    const toggleOrderSelectRow = (id) => {
        setOrderSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const handleOrderSummaryKeyDown = (e) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        if (!orderListSummary.length) return;
        e.preventDefault();
        setOrderSelectedRow((current) => {
            const base = current < 0 ? (e.key === 'ArrowDown' ? -1 : orderListSummary.length) : current;
            return e.key === 'ArrowDown'
                ? Math.min(base + 1, orderListSummary.length - 1)
                : Math.max(base - 1, 0);
        });
    };

    const handleDeleteSelectedOrders = async () => {
        if (!orderSelectedIds.size) {
            alert('Select at least one order to delete.');
            return;
        }
        if (!window.confirm(`Delete ${orderSelectedIds.size} selected order(s)? This cannot be undone.`)) return;
        try {
            await Promise.all(Array.from(orderSelectedIds).map((id) => axios.delete(`/api/orders/${id}`)));
            setOrderSelectedIds(new Set());
            loadOrderListSummary();
        } catch (error) {
            setOrderListStatus(error.response?.data?.error || 'Unable to delete selected orders.');
        }
    };

    // Groups the currently loaded sales by customer and prints one line per
    // customer listing each "mixters"-scale product with its quantity and scale, A5 page size.
    const handlePrintByCustomer = () => {
        if (!saleSummary.length) {
            alert('No sales to print for the selected dates.');
            return;
        }
        const grouped = new Map();
        saleSummary.forEach((sale) => {
            const name = sale.customer?.name || 'Unknown';
            const mixerProducts = (sale.items || []).filter((item) => item.unit === 'mixters');
            if (!mixerProducts.length) return;
            if (!grouped.has(name)) grouped.set(name, []);
            grouped.get(name).push(...mixerProducts);
        });

        if (!grouped.size) {
            alert('No "mixters" scale products in the selected sales.');
            return;
        }

        const rows = Array.from(grouped.entries()).map(([customer, products]) => {
            const productText = products
                .map((item) => `${item.name} ${item.quantity}${item.unit || ''}`)
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
                <title>Sale Summary</title>
                <style>
                    @page { size: A5; margin: 10mm; }
                    body { font-family: Arial, sans-serif; font-size: 13px; }
                    h3 { margin: 0 0 10px; }
                    .customer-block { margin-bottom: 6px; }
                    .customer-name { font-weight: bold; }
                </style>
            </head>
            <body>
                <h3>Sales (${saleFilter.startDate} to ${saleFilter.endDate})</h3>
                ${rows}
            </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
    };

    // Open a print window with one bill per A5 page. The actual bill markup/styles
    // live in ./billTemplate.js — edit that file to change how a bill looks.
    const openBillsWindow = (records) => {
        const bills = records
            .map((record) => {
                const customer = customerList.find(
                    (c) => c.name?.toLowerCase() === (record.customer?.name || '').trim().toLowerCase()
                );
                return renderBillHtml(record, invoiceSetting || {}, customer);
            })
            .filter(Boolean);
        if (!bills.length) {
            alert('Nothing to print — the selected bill(s) have no products.');
            return;
        }
        const win = window.open('', '_blank', 'width=640,height=900');
        if (!win) {
            alert('Please allow popups to print the bill.');
            return;
        }
        win.document.write(buildBillsDocumentHtml(bills, `Bills (${bills.length})`));
        win.document.close();
        win.focus();
    };

    const handlePrintBill = (record) => openBillsWindow([record]);

    // Print the checked rows, or every row in the list if none are checked.
    const handlePrintSales = (all = false) => {
        const chosen = all || !selectedIds.size
            ? saleSummary
            : saleSummary.filter((s) => selectedIds.has(s._id));
        if (!chosen.length) { alert('No sales to print.'); return; }
        openBillsWindow(chosen);
    };

    const handlePrintOrders = (all = false) => {
        const chosen = all || !orderSelectedIds.size
            ? orderListSummary
            : orderListSummary.filter((o) => orderSelectedIds.has(o._id));
        if (!chosen.length) { alert('No orders to print.'); return; }
        openBillsWindow(chosen);
    };

    const onSubmit = async (data) => {
        setSaveStatus('');
        if (!customerExists(data.customer?.name)) {
            setCustomerWarning('This customer is not in the list. Please add the customer first.');
            return;
        }
        const unknownProduct = (data.items || []).find((item) => item.name && !productExists(item.name));
        if (unknownProduct) {
            setSaveStatus(`Product "${unknownProduct.name}" is not in the list. Please add it first.`);
            return;
        }
        const payload = {
            ...data,
            billDetails: { ...data.billDetails, billed: isSubscribed },
        };
        try {
            const response = editingId
                ? await axios.put(`/api/sales/${editingId}`, payload)
                : await axios.post('/api/sales', payload);
            const sno = response.data.billDetails?.billNumber || '';
            setSaveStatus(`Sale ${sno} ${editingId ? 'updated' : 'saved'} successfully.`);
            setEditingId(null);
            setIsSubscribed(false);
            reset(blankForm());
            loadSaleSummary();
        } catch (error) {
            setSaveStatus(error.response?.data?.error || 'Unable to save sale.');
        }
    };

    return (
        <div className="sale-entry-container">
            <div className="sale-entry-form">
                <form onSubmit={handleSubmit(onSubmit)}>
                    <div className="sale-customer-bill-details">
                        <div><label>Customer Name:</label>
                            <input
                                type="text"
                                className="sale-textInput"
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
                                    if (known) loadExistingSaleForCustomer(e.target.value);
                                }}
                                onKeyDown={(e) => handleKeyDown(e, CustomerNameInputRef, productNameInputRef)}
                            />
                            {customerWarning && <p className="sale-field-warning" role="alert">{customerWarning}</p>}</div>
                        <datalist id="customer-list">
                            {customerList.map((cust, index) => (
                                <option key={index} value={cust.name} />
                            ))}
                        </datalist>
                    
                        <div><label>Bill Date:</label><br></br>
                            <input type="date" {...register("billDetails.date")} /></div>

                        <div> <label>Bill Number:</label>
                            <input type="text" placeholder="Auto" {...register("billDetails.billNumber")} /></div>
                    </div>
                    <div>
                        <div className="sale-product-input-grid">
                            <div className="sale-product-input-field">
                                <label>Product Name</label>
                                <br />
                                <input
                                    type="text"
                                    name="productname"
                                    value={product.name}
                                    placeholder="Product Name"
                                    list="product-list"
                                    ref={productNameInputRef}
                                    className="sale-textInput"
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        const selectedProduct = productList.find((prod) => prod.name === val);
                                        if (productWarning) setProductWarning('');
                                        setProduct({
                                            ...product,
                                            name: val,
                                            tamilName: selectedProduct?.tamil || selectedProduct?.Tamil || "",
                                            rate: selectedProduct ? selectedProduct.Price : "",
                                            bagRate: selectedProduct ? (selectedProduct.pags ?? "") : "",
                                            wageRate: selectedProduct ? (selectedProduct.Wages ?? "") : "",
                                            commissionRate: selectedProduct ? (selectedProduct.commission ?? "") : "",
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
                                {productWarning && <p className="sale-field-warning" role="alert">{productWarning}</p>}
                            </div>
                            <div className="sale-product-input-field">
                                <label>Quantity</label>
                                <br />
                                <input
                                    type="number"
                                    name="quantity"
                                    id="quantity"
                                    ref={quantityInputRef}
                                    value={product.quantity}
                                    className="sale-small-input"
                                    onChange={(e) => {
                                        setProduct({ ...product, quantity: e.target.value });
                                    }}
                                    placeholder="Quantity"
                                    onKeyDown={(e) => handleKeyDown(e, quantityInputRef, bagsInputRef)}
                                />
                            </div>
                            <div className="sale-product-input-field">
                                <label>bags</label>
                                <br />
                                <input
                                    type="number"
                                    name="bags"
                                    id="bags"
                                    ref={bagsInputRef}
                                    value={product.bags}
                                    className="sale-small-input"
                                    onChange={(e) => {
                                        const bags = e.target.value;
                                        // Entering a bag count auto-fills Scale with the product's unit.
                                        const selectedProduct = productList.find((prod) => prod.name === product.name);
                                        setProduct({
                                            ...product,
                                            bags,
                                            unit: bags && selectedProduct?.Unit ? selectedProduct.Unit : product.unit,
                                        });
                                    }}
                                    placeholder="Bags"
                                    onKeyDown={(e) => handleKeyDown(e, bagsInputRef, scaleInputRef)}
                                />
                            </div>
                            <div className="sale-product-input-field">
                                <label>Scale</label>
                                <br />
                                <input
                                    type="text"
                                    name="unit"
                                    value={product.unit}
                                    className="sale-small-input"
                                    onChange={(e) => setProduct({ ...product, unit: e.target.value })}
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
                            <div className="sale-product-input-field">
                                <label>Single Price</label>
                                <br />
                                <input
                                    type="number"
                                    name="rate"
                                    value={product.rate}
                                    className="sale-small-input"
                                    onChange={(e) => setProduct({ ...product, rate: e.target.value })}
                                    placeholder="Price"
                                    ref={singlePriceInputRef}
                                    onKeyDown={(e) => handleKeyDown(e, singlePriceInputRef, bagRateInputRef)}
                                />
                            </div>
                            <div className="sale-product-input-field">
                                <label>Bag Rate</label>
                                <br />
                                <input
                                    type="number"
                                    name="bagRate"
                                    value={product.bagRate}
                                    className="sale-small-input"
                                    onChange={(e) => setProduct({ ...product, bagRate: e.target.value })}
                                    placeholder="Bag Rate"
                                    ref={bagRateInputRef}
                                    onKeyDown={(e) => handleKeyDown(e, bagRateInputRef, wageInputRef)}
                                />
                            </div>
                            <div className="sale-product-input-field">
                                <label>Wage</label>
                                <br />
                                <input
                                    type="number"
                                    name="wageRate"
                                    value={product.wageRate}
                                    className="sale-small-input"
                                    onChange={(e) => setProduct({ ...product, wageRate: e.target.value })}
                                    placeholder="Wage"
                                    ref={wageInputRef}
                                    onKeyDown={(e) => handleKeyDown(e, wageInputRef, commissionInputRef)}
                                />
                            </div>
                            <div className="sale-product-input-field">
                                <label>Commission</label>
                                <br />
                                <input
                                    type="number"
                                    name="commissionRate"
                                    value={product.commissionRate}
                                    className="sale-small-input"
                                    onChange={(e) => setProduct({ ...product, commissionRate: e.target.value })}
                                    placeholder="Commission"
                                    ref={commissionInputRef}
                                    onKeyDown={(e) => handleKeyDown(e, commissionInputRef, productNameInputRef)}
                                />
                            </div>
                            <div className="sale-product-input-field">
                                <button
                                    type="button"
                                    className="sale-add-button"
                                    onClick={handleAddProduct}
                                >
                                    Add
                                </button>
                               <button 
                               className="sale-add-button"
                               type="submit">{editingId ? 'Update' : 'Submit'}
                               </button>

                            </div>

                        </div>
                    </div>
                    <div className="sale-table-wrapper" style={{ height: "200px", overflow: "auto" }}>
                        <table className="sale-product-table">
                            <thead>
                                <tr>
                                    <th>Product Name</th>
                                    <th>Quantity</th>
                                    <th>Bags</th>
                                    <th>Single Price</th>
                                    <th>Price</th>
                                    <th>Bag Rate</th>
                                    <th>Wage</th>
                                    <th>Commission</th>
                                    <th>Actions</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {fields.map((item, index) => (
                                    <tr key={item.id}>
                                        <td className="sale-product-name-cell">
                                            <input
                                                className="sale-product-name-cell sale-textInput" type="text"
                                                {...register(`items.${index}.name`)}
                                                list='product-list'
                                            />
                                        </td>
                                        <datalist id="product-list">
                                            {productList.map((prod, index) => (
                                                <option key={index} value={prod.name} />
                                            ))}
                                        </datalist>
                                        <td className="sale-product-quantity-cell">
                                            <input
                                                className="sale-product-quantity-cell"
                                                type="number"
                                                {...register(`items.${index}.quantity`, { onBlur: () => syncLineAmount(index) })}
                                                onKeyDown={(e) => handleKeyDownforprice(e, "quantity", index)}
                                            />
                                        </td>
                                        <td className="sale-product-quantity-cell">
                                            <input
                                                className="sale-product-quantity-cell"
                                                type="number"
                                                {...register(`items.${index}.bags`, { onBlur: () => syncLineAmount(index) })}
                                                onKeyDown={(e) => handleKeyDownforprice(e, "bags", index)}
                                            />
                                        </td>
                                        <td className="sale-product-quantity-cell">
                                            <input
                                                className="sale-product-quantity-cell"
                                                type="number"
                                                step="0.01"
                                                {...register(`items.${index}.rate`, { onBlur: () => syncLineAmount(index) })}
                                                onKeyDown={(e) => handleKeyDownforprice(e, "rate", index)}
                                            />
                                        </td>
                                        <td className="sale-product-quantity-cell">
                                            <input
                                                className="sale-product-quantity-cell"
                                                type="number"
                                                step="0.01"
                                                {...register(`items.${index}.amount`)}
                                                onKeyDown={(e) => handleKeyDownforprice(e, "amount", index)}
                                            />
                                        </td>
                                        <td className="sale-product-quantity-cell">
                                            <input
                                                className="sale-product-quantity-cell"
                                                type="number"
                                                step="0.01"
                                                {...register(`items.${index}.bagRate`, { onBlur: () => syncLineAmount(index) })}
                                                onKeyDown={(e) => handleKeyDownforprice(e, "bagRate", index)}
                                            />
                                        </td>
                                        <td className="sale-product-quantity-cell">
                                            <input
                                                className="sale-product-quantity-cell"
                                                type="number"
                                                step="0.01"
                                                {...register(`items.${index}.wageRate`, { onBlur: () => syncLineAmount(index) })}
                                                onKeyDown={(e) => handleKeyDownforprice(e, "wageRate", index)}
                                            />
                                        </td>
                                        <td className="sale-product-quantity-cell">
                                            <input
                                                className="sale-product-quantity-cell"
                                                type="number"
                                                step="0.01"
                                                {...register(`items.${index}.commissionRate`, { onBlur: () => syncLineAmount(index) })}
                                                onKeyDown={(e) => handleKeyDownforprice(e, "commissionRate", index)}
                                            />
                                        </td>
                                        <td className="sale-product-quantity-cell">
                                            <button className="sale-product-quantity-cell" type="button" onClick={() => up(index)}>up</button>
                                        </td>
                                        <td className="sale-product-quantity-cell">
                                            <button className="sale-product-quantity-cell" type="button" onClick={() => { remove(index); calculateTotals(); }}>Remove</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="sale-bill-total-summary">
                        <div >
                            <label>Total Quantity:</label>
                            <input className='number' type="number" {...register("billDetails.totalQuantity")} />
                        </div>
                        <div >
                            <label>Total Bag Quantity:</label>
                            <input className='number' type="number" {...register("billDetails.totalBags")} />
                        </div>
                        <div>
                            <label>Total Weight:</label>
                            <input className='number' type="number" {...register("billDetails.weight")} />
                        </div>
                        <div>
                            <label>Subtotal:</label>
                            <input className='number' type="number" {...register("billDetails.subtotal")} />
                        </div>
                        <div>
                            <label>Bag Amount Total:</label>
                            <input className='number' type="number" {...register("billDetails.totalBagAmount")} />
                        </div>
                        <div>
                            <label>Wage Total:</label>
                            <input  className='number' type="number" {...register("billDetails.totalWage")} />
                        </div>
                        <div>
                            <label>Commission Total:</label>
                            <input className='number' type="number" {...register("billDetails.totalCommission")} />
                        </div>
                        <div>
                            <label>Freight:</label>
                            <input
                                type="number"
                                className='number'
                                {...register("billDetails.freight", { onChange: calculateTotals })}
                            />
                        </div>
                        <div>
                            <label>Grand Total:</label>
                            <input type="number" {...register("billDetails.grandTotal")} />
                        </div>
                        <div>
                            <label>Opening Balance:</label>
                            <input className='number' type="number" readOnly {...register("billDetails.openingBalance")} />
                        </div>
                        <div>
                            <label>Closing Balance:</label>
                            <input className='number' type="number" readOnly {...register("billDetails.balance")} />
                        </div>
                        <div>
                            <label>Debit (Paymt):</label>
                            <input className='number' type="number" {...register("billDetails.debit")} />
                        </div>
                        <div>
                            <label>Credit (Cash):</label>
                            <input className='number' type="number" {...register("billDetails.credit")} />
                        </div>
                        <div>
                            <label>Remark:</label>
                            <input type="text" {...register("billDetails.notes")} />
                        </div>
                        <div>
                            <label>
                                <input
                                    type="checkbox"
                                    checked={isSubscribed}
                                    onChange={handleCheckboxChange}
                                />
                                Confirm
                            </label>
                        </div>
                    </div>
                    <div className="sale-summary-buttons">
                        <button type="submit">{editingId ? 'Update' : 'Submit'}</button>
                        <div><button type="button" onClick={handleNewSale}>new</button></div>
                        <div><button type="submit">save</button></div>
                        <div><button type="button" onClick={handleDeleteSelected}>delete</button></div>
                    </div>
                    {editingId && <p role="status">Editing sale {getValues('billDetails.billNumber') || editingId}. Press “new” to cancel.</p>}
                    {saveStatus && <p role="alert">{saveStatus}</p>}
                </form>
            </div>
            <div style={{ flex: 3, marginLeft: 4, display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="sale-entry-summary">
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div>
                        <input
                            type="date"
                            value={saleFilter.startDate}
                            max={saleFilter.endDate || undefined}
                            onChange={(e) => setSaleFilter({ ...saleFilter, startDate: e.target.value })}
                        />
                    </div>
                    <div>
                        <input
                            type="date"
                            value={saleFilter.endDate}
                            min={saleFilter.startDate || undefined}
                            onChange={(e) => setSaleFilter({ ...saleFilter, endDate: e.target.value })}
                        />
                    </div>
                </div>
                <div
                    className="sale-summary-content"
                    tabIndex={0}
                    onKeyDown={handleSummaryKeyDown}
                >
                    <table>
                        <tbody>
                            <tr>
                                <td>
                                    <input
                                        type="checkbox"
                                        checked={saleSummary.length > 0 && selectedIds.size === saleSummary.length}
                                        onChange={toggleSelectAll}
                                    />
                                </td>
                                <td>S.no</td>
                                <td>customer</td>
                                <td>biled</td>
                                <td>print</td>
                                <td>views</td>
                                <td>edit</td>
                            </tr>
                            {saleSummary.map((sale, index) => (
                                <tr
                                    key={sale._id}
                                    className={index === selectedRow ? 'sale-row-selected' : undefined}
                                    onClick={() => { setSelectedRow(index); handleEdit(sale); }}
                                >
                                    <td>
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.has(sale._id)}
                                            onClick={(e) => e.stopPropagation()}
                                            onChange={() => toggleSelectRow(sale._id)}
                                        />
                                    </td>
                                    <td>{sale.billDetails?.billNumber || '—'}</td>
                                    <td>{sale.customer?.name || '—'}</td>
                                    <td>{sale.billDetails?.billed ? 'Billed' : 'Pending'}</td>
                                    <td><button type="button" onClick={(e) => { e.stopPropagation(); handlePrintBill(sale); }}>print</button></td>
                                    <td><button type="button" onClick={(e) => { e.stopPropagation(); setViewSale(sale); }}>view</button></td>
                                    <td><button type="button" onClick={(e) => { e.stopPropagation(); setSelectedRow(index); handleEdit(sale); }}>edit</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {summaryStatus && <p role="status">{summaryStatus}</p>}
                </div>
                <div className="sale-summary-buttons">
                    <div><button type="button">Total sale</button></div>
                    <div><button type="button" onClick={handlePrintByCustomer}>mixer</button></div>
                    <div><button type="button" onClick={() => handlePrintSales(false)}>print selected ({selectedIds.size})</button></div>
                    <div><button type="button" onClick={() => handlePrintSales(true)}>print all</button></div>
                    <div><button type="button" onClick={handleDeleteSelected}>delete ({selectedIds.size})</button></div>
                </div>
            </div>

            {/* Order (purchase) bill list — same layout/behaviour as the sale list above, wired to /api/orders. */}
            <div className="sale-entry-summary">
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
                    className="sale-summary-content"
                    tabIndex={0}
                    onKeyDown={handleOrderSummaryKeyDown}
                >
                    <table>
                        <tbody>
                            <tr>
                                <td>
                                    <input
                                        type="checkbox"
                                        checked={orderListSummary.length > 0 && orderSelectedIds.size === orderListSummary.length}
                                        onChange={toggleOrderSelectAll}
                                    />
                                </td>
                                <td>S.no</td>
                                <td>customer</td>
                                <td>biled</td>
                                <td>print</td>
                                <td>views</td>
                                <td>edit</td>
                            </tr>
                            {orderListSummary.map((order, index) => (
                                <tr
                                    key={order._id}
                                    className={index === orderSelectedRow ? 'sale-row-selected' : undefined}
                                    onClick={() => setOrderSelectedRow(index)}
                                >
                                    <td>
                                        <input
                                            type="checkbox"
                                            checked={orderSelectedIds.has(order._id)}
                                            onClick={(e) => e.stopPropagation()}
                                            onChange={() => toggleOrderSelectRow(order._id)}
                                        />
                                    </td>
                                    <td>{order.billDetails?.billNumber || '—'}</td>
                                    <td>{order.customer?.name || '—'}</td>
                                    <td>{order.billDetails?.billed ? 'Billed' : 'Pending'}</td>
                                    <td><button type="button" onClick={(e) => { e.stopPropagation(); handlePrintBill(order); }}>print</button></td>
                                    <td><button type="button" onClick={(e) => { e.stopPropagation(); setViewOrderBill(order); }}>view</button></td>
                                    <td><button type="button" title="Fill Sale Entry from this order" onClick={(e) => { e.stopPropagation(); handleUseOrderForSale(order); }}>edit</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {orderListStatus && <p role="status">{orderListStatus}</p>}
                </div>
                <div className="sale-summary-buttons">
                    <div><button type="button">Total order</button></div>
                    <div><button type="button" onClick={() => handlePrintOrders(false)}>print selected ({orderSelectedIds.size})</button></div>
                    <div><button type="button" onClick={() => handlePrintOrders(true)}>print all</button></div>
                    <div><button type="button" onClick={handleDeleteSelectedOrders}>delete ({orderSelectedIds.size})</button></div>
                </div>
            </div>
            </div>

            {viewOrderBill && (
                <div className="sale-view-overlay" onClick={() => setViewOrderBill(null)}>
                    <div className="sale-view-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="sale-view-header">
                            <h3>Order details</h3>
                            <button type="button" onClick={() => setViewOrderBill(null)}>✕</button>
                        </div>
                        <div className="sale-view-meta">
                            <div><span>Bill No.</span><strong>{viewOrderBill.billDetails?.billNumber || '—'}</strong></div>
                            <div><span>Customer</span><strong>{viewOrderBill.customer?.name || '—'}</strong></div>
                            <div><span>Date</span><strong>{toDateInput(viewOrderBill.billDetails?.date)}</strong></div>
                            <div><span>Status</span><strong>{viewOrderBill.billDetails?.billed ? 'Billed' : 'Pending'}</strong></div>
                        </div>
                        <table className="sale-view-table">
                            <thead>
                                <tr><th>Product</th><th>Qty</th><th>Bags</th><th>Scale</th><th>Single price</th><th>Amount</th><th>Bag amt</th><th>Wage</th><th>Comm.</th></tr>
                            </thead>
                            <tbody>
                                {(viewOrderBill.items || []).map((item, index) => (
                                    <tr key={index}>
                                        <td>{item.name}</td>
                                        <td>{item.quantity}</td>
                                        <td>{item.bags}</td>
                                        <td>{item.unit || '—'}</td>
                                        <td>{item.rate}</td>
                                        <td>{item.amount}</td>
                                        <td>{item.bagAmount}</td>
                                        <td>{item.wageAmount}</td>
                                        <td>{item.commissionAmount}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div className="sale-view-totals">
                            <div><span>Total quantity</span><strong>{viewOrderBill.billDetails?.totalQuantity || 0}</strong></div>
                            <div><span>Total bags</span><strong>{viewOrderBill.billDetails?.totalBags || 0}</strong></div>
                            <div><span>Weight</span><strong>{viewOrderBill.billDetails?.weight || 0}</strong></div>
                            <div><span>Subtotal</span><strong>₹{Number(viewOrderBill.billDetails?.subtotal || 0).toFixed(2)}</strong></div>
                            <div><span>Bag amount</span><strong>₹{Number(viewOrderBill.billDetails?.totalBagAmount || 0).toFixed(2)}</strong></div>
                            <div><span>Wage</span><strong>₹{Number(viewOrderBill.billDetails?.totalWage || 0).toFixed(2)}</strong></div>
                            <div><span>Commission</span><strong>₹{Number(viewOrderBill.billDetails?.totalCommission || 0).toFixed(2)}</strong></div>
                            <div><span>Freight</span><strong>₹{Number(viewOrderBill.billDetails?.freight || 0).toFixed(2)}</strong></div>
                            <div><span>Grand total</span><strong>₹{Number(viewOrderBill.billDetails?.grandTotal || 0).toFixed(2)}</strong></div>
                        </div>
                        <div className="sale-view-actions">
                            <a href="/order-entry">Go to Order Entry</a>
                            <button type="button" onClick={() => setViewOrderBill(null)}>Close</button>
                        </div>
                    </div>
                </div>
            )}

            {viewSale && (
                <div className="sale-view-overlay" onClick={() => setViewSale(null)}>
                    <div className="sale-view-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="sale-view-header">
                            <h3>Sale details</h3>
                            <button type="button" onClick={() => setViewSale(null)}>✕</button>
                        </div>
                        <div className="sale-view-meta">
                            <div><span>Bill No.</span><strong>{viewSale.billDetails?.billNumber || '—'}</strong></div>
                            <div><span>Customer</span><strong>{viewSale.customer?.name || '—'}</strong></div>
                            <div><span>Date</span><strong>{toDateInput(viewSale.billDetails?.date)}</strong></div>
                            <div><span>Status</span><strong>{viewSale.billDetails?.billed ? 'Billed' : 'Pending'}</strong></div>
                        </div>
                        <table className="sale-view-table">
                            <thead>
                                <tr><th>Product</th><th>Qty</th><th>Bags</th><th>Scale</th><th>Single price</th><th>Amount</th><th>Bag amt</th><th>Wage</th><th>Comm.</th></tr>
                            </thead>
                            <tbody>
                                {(viewSale.items || []).map((item, index) => (
                                    <tr key={index}>
                                        <td>{item.name}</td>
                                        <td>{item.quantity}</td>
                                        <td>{item.bags}</td>
                                        <td>{item.unit || '—'}</td>
                                        <td>{item.rate}</td>
                                        <td>{item.amount}</td>
                                        <td>{item.bagAmount}</td>
                                        <td>{item.wageAmount}</td>
                                        <td>{item.commissionAmount}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div className="sale-view-totals">
                            <div><span>Total quantity</span><strong>{viewSale.billDetails?.totalQuantity || 0}</strong></div>
                            <div><span>Total bags</span><strong>{viewSale.billDetails?.totalBags || 0}</strong></div>
                            <div><span>Weight</span><strong>{viewSale.billDetails?.weight || 0}</strong></div>
                            <div><span>Subtotal</span><strong>₹{Number(viewSale.billDetails?.subtotal || 0).toFixed(2)}</strong></div>
                            <div><span>Bag amount</span><strong>₹{Number(viewSale.billDetails?.totalBagAmount || 0).toFixed(2)}</strong></div>
                            <div><span>Wage</span><strong>₹{Number(viewSale.billDetails?.totalWage || 0).toFixed(2)}</strong></div>
                            <div><span>Commission</span><strong>₹{Number(viewSale.billDetails?.totalCommission || 0).toFixed(2)}</strong></div>
                            <div><span>Freight</span><strong>₹{Number(viewSale.billDetails?.freight || 0).toFixed(2)}</strong></div>
                            <div><span>Grand total</span><strong>₹{Number(viewSale.billDetails?.grandTotal || 0).toFixed(2)}</strong></div>
                        </div>
                        <div className="sale-view-actions">
                            <button type="button" onClick={() => { handleEdit(viewSale); setViewSale(null); }}>Edit this sale</button>
                            <button type="button" onClick={() => setViewSale(null)}>Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
export default SaleEntry;
