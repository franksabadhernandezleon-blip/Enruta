import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, MapPin, Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import ClientHeader from '../components/ClientHeader.jsx';
import { useAddress } from '../lib/address.js';
import { useCart } from '../lib/cart.jsx';
import { formatUsd } from '../lib/format.js';

export default function CartPage() {
  const cart = useCart();
  const [address] = useAddress();
  const navigate = useNavigate();

  return (
    <div className="client-shell">
      <ClientHeader />

      <main className="page">
        <section className="page-head">
          <div>
            <p className="eyebrow">Tu pedido</p>
            <h1>Carrito agrupado por tienda</h1>
            <p className="lede">
              Puedes pedir en varias tiendas: el delivery se calcula como una ruta con paradas extra.
            </p>
          </div>
          <span className="meta-chip is-static">
            <MapPin size={14} aria-hidden="true" />
            <span className="meta-label">Entregar en</span>
            <b>{address.label}</b>
          </span>
        </section>

        {!cart.lines.length && (
          <section className="empty">
            <ShoppingCart size={22} aria-hidden="true" />
            <h2>Tu carrito está vacío</h2>
            <p>Explora las tiendas de Caripito y agrega productos.</p>
            <Link to="/" className="btn btn-primary">
              Ver el centro comercial
            </Link>
          </section>
        )}

        {cart.lines.length > 0 && (
          <>
            <div className="cart-groups">
              {cart.stores.map((group) => (
                <section key={group.storeId} className="panel">
                  <header className="panel-head">
                    <div>
                      <h2>{group.storeName}</h2>
                      <p className="muted">Subtotal {formatUsd(group.subtotalCents)}</p>
                    </div>
                    <Link to={`/tienda/${group.storeSlug}`} className="btn btn-ghost btn-sm">
                      Seguir comprando aquí
                    </Link>
                  </header>

                  <ul className="cart-lines">
                    {group.lines.map((line) => (
                      <li key={line.productId}>
                        <div className="cart-line-media">
                          {line.imageUrl ? (
                            <img src={line.imageUrl} alt={line.name} />
                          ) : (
                            <span className="product-media-empty">{line.name.slice(0, 1)}</span>
                          )}
                        </div>
                        <div className="cart-line-body">
                          <strong>{line.name}</strong>
                          <span className="muted">{formatUsd(line.priceCents)} c/u</span>
                          {line.requiresConfirmation && <span className="tag">Confirmar stock</span>}
                        </div>
                        <div className="qty">
                          <button
                            type="button"
                            className="btn btn-icon"
                            onClick={() => cart.setQty(line.productId, line.qty - 1)}
                            aria-label={`Quitar uno de ${line.name}`}
                          >
                            <Minus size={14} aria-hidden="true" />
                          </button>
                          <span>{line.qty}</span>
                          <button
                            type="button"
                            className="btn btn-icon"
                            onClick={() => cart.setQty(line.productId, line.qty + 1)}
                            aria-label={`Agregar uno de ${line.name}`}
                          >
                            <Plus size={14} aria-hidden="true" />
                          </button>
                        </div>
                        <b className="price">{formatUsd(line.priceCents * line.qty)}</b>
                        <button
                          type="button"
                          className="btn btn-icon btn-danger"
                          onClick={() => cart.remove(line.productId)}
                          aria-label={`Eliminar ${line.name}`}
                        >
                          <Trash2 size={15} aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>

            <section className="panel checkout-summary">
              <div className="summary-row">
                <span>Productos ({cart.count})</span>
                <b>{formatUsd(cart.subtotalCents)}</b>
              </div>
              <div className="summary-row">
                <span>Peso estimado</span>
                <b>{cart.weightKg.toFixed(2)} kg</b>
              </div>
              <div className="summary-row is-total">
                <span>Subtotal</span>
                <b>{formatUsd(cart.subtotalCents)}</b>
              </div>
              <p className="muted">El delivery se cotiza en el siguiente paso según la ruta y las paradas.</p>
              <div className="page-actions">
                <button type="button" className="btn btn-ghost" onClick={cart.clear}>
                  Vaciar carrito
                </button>
                <button type="button" className="btn btn-primary" onClick={() => navigate('/checkout')}>
                  Checkout multi-ruta
                  <ArrowRight size={15} aria-hidden="true" />
                </button>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
