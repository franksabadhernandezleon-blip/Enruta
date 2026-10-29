import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import ClientTabBar from './components/ClientTabBar.jsx';
import { Spinner } from './components/ui.jsx';
import { useAuth } from './lib/auth.jsx';
import AccountPage from './pages/AccountPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import CartPage from './pages/CartPage.jsx';
import CatalogPage from './pages/CatalogPage.jsx';
import CheckoutPage from './pages/CheckoutPage.jsx';
import CourierPage from './pages/CourierPage.jsx';
import FavoritesPage from './pages/FavoritesPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import OrderPage from './pages/OrderPage.jsx';
import SearchPage from './pages/SearchPage.jsx';
import StoreAdminPage from './pages/StoreAdminPage.jsx';
import StorePage from './pages/StorePage.jsx';

// Rutas de rol: solo visibles/accesibles con el correo autorizado correspondiente.
function Guard({ allow, children }) {
  const { ready, user } = useAuth();
  const location = useLocation();

  if (!ready) {
    return (
      <p className="muted pad">
        <Spinner /> Verificando tu sesión…
      </p>
    );
  }

  if (!user) {
    return (
      <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />
    );
  }

  if (!allow(user)) return <Navigate to="/" replace />;

  return children;
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<CatalogPage />} />
        <Route path="/tienda/:slug" element={<StorePage />} />
        <Route path="/carrito" element={<CartPage />} />
        <Route
          path="/checkout"
          element={
            <Guard allow={(user) => ['customer', 'owner', 'admin', 'courier'].includes(user.role)}>
              <CheckoutPage />
            </Guard>
          }
        />
        <Route
          path="/pedido/:code"
          element={
            <Guard allow={(user) => ['customer', 'owner', 'admin', 'courier'].includes(user.role)}>
              <OrderPage />
            </Guard>
          }
        />
        <Route
          path="/pedidos"
          element={
            <Guard allow={(user) => ['customer', 'owner', 'admin'].includes(user.role)}>
              <OrderPage />
            </Guard>
          }
        />
        <Route path="/buscar" element={<SearchPage />} />
        <Route path="/favoritos" element={<FavoritesPage />} />
        <Route
          path="/cuenta"
          element={
            <Guard allow={(user) => ['customer', 'owner', 'admin', 'courier'].includes(user.role)}>
              <AccountPage />
            </Guard>
          }
        />
        <Route path="/login" element={<LoginPage />} />

        <Route
          path="/tuteteno"
          element={
            <Guard allow={(user) => user.role === 'admin'}>
              <AdminPage />
            </Guard>
          }
        />
        <Route
          path="/mitienda"
          element={
            <Guard allow={(user) => ['owner', 'admin'].includes(user.role)}>
              <StoreAdminPage />
            </Guard>
          }
        />
        <Route
          path="/repartidor"
          element={
            <Guard allow={(user) => ['courier', 'admin'].includes(user.role)}>
              <CourierPage />
            </Guard>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <ClientTabBar />
    </>
  );
}