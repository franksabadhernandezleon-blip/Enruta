import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import LoginPage from './pages/LoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';

function Splash() {
  return (
    <div className="splash">
      <span className="brand-mark" aria-hidden="true">
        E
      </span>
      <p>Cargando ENRUTA…</p>
    </div>
  );
}

export default function App() {
  const { account, ready } = useAuth();

  if (!ready) return <Splash />;

  return (
    <Routes>
      <Route
        path="/login"
        element={account ? <Navigate to="/" replace /> : <LoginPage />}
      />
      <Route
        path="/"
        element={account ? <DashboardPage /> : <Navigate to="/login" replace />}
      />
      <Route path="*" element={<Navigate to={account ? '/' : '/login'} replace />} />
    </Routes>
  );
}
