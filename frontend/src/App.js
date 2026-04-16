import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LoginPage } from "./components/LoginPage";
import { Layout } from "./components/Layout";
import { Dashboard } from "./components/Dashboard";
import { OrdersPage } from "./components/OrdersPage";
import { StockPage } from "./components/StockPage";
import { CustomersPage } from "./components/CustomersPage";
import { AccountingPage } from "./components/AccountingPage";
import { SettingsPage } from "./components/SettingsPage";
import { MarketingPage, MarketingAIPage } from "./components/MarketingPage";
import { StockeurPage } from "./components/StockeurPage";
import { BankReconciliationPage } from "./components/BankReconciliationPage";
import { WooCommerceSyncPage } from "./components/WooCommerceSyncPage";
import { SocialDashboardPage } from "./components/SocialDashboardPage";
import { Toaster } from "./components/ui/sonner";
import "./App.css";

function RoleBasedRedirect() {
  const { user, loading } = useAuth();
  
  if (loading) return null;
  
  if (!user) return <Navigate to="/login" replace />;
  
  switch (user.role) {
    case 'admin':
      return <Navigate to="/dashboard" replace />;
    case 'marketing':
      return <Navigate to="/marketing" replace />;
    case 'stockeur':
      return <Navigate to="/stockeur" replace />;
    default:
      return <Navigate to="/login" replace />;
  }
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<LoginPage />} />
          
          {/* Role-based redirect */}
          <Route path="/" element={<RoleBasedRedirect />} />
          
          {/* Admin Routes */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <Layout><Dashboard /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <Layout><OrdersPage /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/stock"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <Layout><StockPage /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/customers"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <Layout><CustomersPage /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/accounting"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <Layout><AccountingPage /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <Layout><SettingsPage /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/bank"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <Layout><BankReconciliationPage /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/woo-sync"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <Layout><WooCommerceSyncPage /></Layout>
              </ProtectedRoute>
            }
          />
          
          {/* Marketing Routes */}
          <Route
            path="/marketing"
            element={
              <ProtectedRoute allowedRoles={['marketing', 'admin']}>
                <Layout><MarketingPage /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/marketing/ai"
            element={
              <ProtectedRoute allowedRoles={['marketing', 'admin']}>
                <Layout><MarketingAIPage /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/marketing/social"
            element={
              <ProtectedRoute allowedRoles={['marketing', 'admin']}>
                <Layout><SocialDashboardPage /></Layout>
              </ProtectedRoute>
            }
          />
          
          {/* Stockeur Routes */}
          <Route
            path="/stockeur"
            element={
              <ProtectedRoute allowedRoles={['stockeur', 'admin']}>
                <Layout><StockeurPage /></Layout>
              </ProtectedRoute>
            }
          />
          
          {/* Catch all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </AuthProvider>
  );
}

export default App;
