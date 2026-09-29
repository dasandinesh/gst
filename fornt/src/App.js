import './App.css';
import React from 'react';
import { BrowserRouter as Router, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './authContext';
import { AdminAuthProvider } from './adminAuthContext';
import RequireAuth from './components/auth/requireauth';
import LoginPage from './components/auth/login';
import SignupPage from './components/auth/signup';
import ForgotPasswordPage from './components/auth/forgotpassword';
import ResetPasswordPage from './components/auth/resetpassword';
import RequireAdminAuth from './components/admin/requireadminauth';
import AdminLoginPage from './components/admin/adminlogin';
import AdminNav from './components/admin/adminnav';
import AdminUsers from './components/admin/adminusers';
import AdminGstSummary from './components/admin/admingstsummary';
import OrderEntryResponsive from './components/order/orderentryresponsive';
import OrderEntryMobile from './components/order/ordermobile';
import SaleEntry from './components/sale/saleentry';
import GstBillEntry from './components/sale/gstbillentry';
import GstBillList from './components/sale/gstbilllist';
import EstimateBillEntry from './components/estimate/estimateBillEntry';
import EstimateBillList from './components/estimate/estimateBillList';
import EstimateCustomerAdd from './components/estimate/estimateCustomerAdd';
import EstimateCustomerList from './components/estimate/estimateCustomerList';
import EstimateProductAdd from './components/estimate/estimateProductAdd';
import EstimateProductList from './components/estimate/estimateProductList';
import CreditNoteEntry from './components/sale/creditnoteentry';
import CreditNoteList from './components/sale/creditnotelist';
import DcEntry from './components/deliverychallan/dcEntry';
import DcList from './components/deliverychallan/dcList';
import PoEntry from './components/buyerpo/poEntry';
import PoList from './components/buyerpo/poList';
import MainNav from './components/navbar/mainnav';
import MainFooter from './components/footer/mainfooter';
import CustomerAdd from './components/cutomer/customeradd';
import CustomerList from './components/cutomer/customerlist';
import CustomerDetails from './components/cutomer/customerdetails';
import ProductAdd from './components/product/productadd';
import ProductList from './components/product/productlist';
import ProductDetails from './components/product/productdetails';
import OrderList from './components/order/orderlist';
import InvoiceSetting from './components/invoice/invoicesetting';
import EntryPreferences from './components/preferences/entrypreferences';
import ChartOfAccounts from './components/books/chartofaccounts';
import TrialBalance from './components/books/trialbalance';
import AccountLedger from './components/books/accountledger';
import ReceiptEntry from './components/accounts/receiptentry';
import SaleBillList from './components/sale/salebilllist';
import CustomerLedger from './components/accounts/customerledger';
import Dashboard from './components/home/dashboard';
import Price from './components/sale/price';
import OrderPrice from './components/order/price';
import DriverAdd from './components/driver/driveradd';
import DriverList from './components/driver/driverlist';
import VehicleAdd from './components/vehicle/vehicleadd';
import VehicleList from './components/vehicle/vehiclelist';
import SupplierAdd from './components/supplier/supplieradd';
import SupplierList from './components/supplier/supplierlist';
import PurchaseBillEntry from './components/purchase/purchasebillentry';
import PurchaseBillList from './components/purchase/purchasebilllist';
import StockMaintenance from './components/stock/stockmaintenance';
import DebitNoteEntry from './components/purchase/debitnoteentry';
import DebitNoteList from './components/purchase/debitnotelist';
import PaymentEntry from './components/accounts/paymententry';
import SupplierLedger from './components/accounts/supplierledger';
import GstReports from './components/reports/gstreports';
import DayBook from './components/reports/daybook';
import Profile from './components/profile/profile';

// The app's nav/footer chrome, shown only once logged in — wraps every
// protected route below via <Outlet />.
// Sidebar on the left, the page + footer on the right (stacks on phones).
const AppShell = () => (
  <div className="app-shell app-shell--sidebar">
    <MainNav />
    <div className="app-main">
      <main className="app-content">
        <Outlet />
      </main>
      <MainFooter />
    </div>
  </div>
);

// Separate chrome for the platform admin area — AdminNav instead of MainNav —
// so it's visually distinct from a tenant's own workspace.
const AdminShell = () => (
  <div className="app-shell">
    <AdminNav />
    <main className="app-content">
      <Outlet />
    </main>
  </div>
);

function App() {
  return (
    <AuthProvider>
      <AdminAuthProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />

            <Route path="/admin/login" element={<AdminLoginPage />} />
            <Route element={<RequireAdminAuth />}>
              <Route element={<AdminShell />}>
                <Route path="/admin" element={<Navigate to="/admin/users" replace />} />
                <Route path="/admin/users" element={<AdminUsers />} />
                <Route path="/admin/gst-summary" element={<AdminGstSummary />} />
              </Route>
            </Route>

            <Route element={<RequireAuth />}>
              <Route element={<AppShell />}>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/order-entry" element={<OrderEntryResponsive />} />
                <Route path="/order-entry-mobile" element={<OrderEntryMobile />} />
                <Route path="/customers" element={<CustomerAdd />} />
                <Route path="/customer-list" element={<CustomerList />} />
                <Route path="/customer-list/:id" element={<CustomerDetails />} />
                <Route path="/products" element={<ProductAdd />} />
                <Route path="/product-list" element={<ProductList />} />
                <Route path="/product-list/:id" element={<ProductDetails />} />
                <Route path="/drivers" element={<DriverAdd />} />
                <Route path="/driver-list" element={<DriverList />} />
                <Route path="/vehicles" element={<VehicleAdd />} />
                <Route path="/vehicle-list" element={<VehicleList />} />
                <Route path="/order-list" element={<OrderList />} />
                <Route path="/order-price-update" element={<OrderPrice />} />
                <Route path="/sale-entry" element={<SaleEntry />} />
                <Route path="/gst-billing" element={<GstBillEntry />} />
                <Route path="/gst-bill-list" element={<GstBillList />} />
                <Route path="/delivery-challan" element={<DcEntry />} />
                <Route path="/delivery-challan-list" element={<DcList />} />
                <Route path="/buyer-po" element={<PoEntry />} />
                <Route path="/buyer-po-list" element={<PoList />} />
                <Route path="/estimate-billing" element={<EstimateBillEntry />} />
                <Route path="/estimate-bill-list" element={<EstimateBillList />} />
                <Route path="/estimate-customers" element={<EstimateCustomerAdd />} />
                <Route path="/estimate-customer-list" element={<EstimateCustomerList />} />
                <Route path="/estimate-products" element={<EstimateProductAdd />} />
                <Route path="/estimate-product-list" element={<EstimateProductList />} />
                <Route path="/sale-list" element={<SaleBillList />} />
                <Route path="/price-update" element={<Price />} />
                <Route path="/invoice-setting" element={<InvoiceSetting />} />
                <Route path="/entry-settings" element={<EntryPreferences />} />
                <Route path="/chart-of-accounts" element={<ChartOfAccounts />} />
                <Route path="/trial-balance" element={<TrialBalance />} />
                <Route path="/account-ledger" element={<AccountLedger />} />
                <Route path="/receipts" element={<ReceiptEntry />} />
                <Route path="/customer-ledger" element={<CustomerLedger />} />
                <Route path="/suppliers" element={<SupplierAdd />} />
                <Route path="/supplier-list" element={<SupplierList />} />
                <Route path="/purchase-entry" element={<PurchaseBillEntry />} />
                <Route path="/purchase-list" element={<PurchaseBillList />} />
                <Route path="/stock-maintenance" element={<StockMaintenance />} />
                <Route path="/credit-note-entry" element={<CreditNoteEntry />} />
                <Route path="/credit-note-list" element={<CreditNoteList />} />
                <Route path="/debit-note-entry" element={<DebitNoteEntry />} />
                <Route path="/debit-note-list" element={<DebitNoteList />} />
                <Route path="/payments" element={<PaymentEntry />} />
                <Route path="/supplier-ledger" element={<SupplierLedger />} />
                <Route path="/gst-reports" element={<GstReports />} />
                <Route path="/day-book" element={<DayBook />} />
                <Route path="/profile" element={<Profile />} />
              </Route>
            </Route>
          </Routes>
        </Router>
      </AdminAuthProvider>
    </AuthProvider>
  );
}

export default App;
