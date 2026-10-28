import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './lib/auth.jsx';
import { CartProvider } from './lib/cart.jsx';
import { ConfigProvider } from './lib/config.jsx';
import { registerServiceWorker } from './lib/push.js';
import './styles.css';

registerServiceWorker();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ConfigProvider>
        <AuthProvider>
          <CartProvider>
            <App />
          </CartProvider>
        </AuthProvider>
      </ConfigProvider>
    </BrowserRouter>
  </StrictMode>,
);
