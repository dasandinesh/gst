import './App.css';
import React from 'react';
import { BrowserRouter as Router, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './authContext';
import RequireAuth from './components/auth/requireauth';
import LoginPage from './components/auth/login';
import SignupPage from './components/auth/signup';
import ForgotPasswordPage from './components/auth/forgotpassword';
import ResetPasswordPage from './components/auth/resetpassword';
import OrderEntryResponsive from './components/order/orderentryresponsive';
import OrderEntryMobile from './components/order/ordermobile';
import SaleEntry from './components/sale/saleentry';
import GstBillEntry from './components/sale/gstbillentry';
import GstBillList from './components/sale/gstbilllist';
import CreditNoteEntry from './components/sale/creditnoteentry';
import CreditNoteList from './components/sale/creditnotelist';
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

// The app's nav/footer chrome, shown only once logged in — wraps every
// protected route below via <Outlet />.
const AppShell = () => (
  <div className="app-shell">
    <MainNav />
    <main className="app-content">
      <Outlet />
    </main>
    <MainFooter />
  </div>
);

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

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
              <Route path="/sale-list" element={<SaleBillList />} />
              <Route path="/price-update" element={<Price />} />
              <Route path="/invoice-setting" element={<InvoiceSetting />} />
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
            </Route>
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
