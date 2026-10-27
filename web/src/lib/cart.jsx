import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const CartContext = createContext(null);
const STORAGE_KEY = 'enruta.cart';

const read = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export function CartProvider({ children }) {
  const [lines, setLines] = useState(read);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  }, [lines]);

  const add = useCallback((product, store) => {
    setLines((prev) => {
      const existing = prev.find((line) => line.productId === product.id);
      if (existing) {
        const max = Math.max(1, Number(product.stock) || 99);
        return prev.map((line) =>
          line.productId === product.id ? { ...line, qty: Math.min(max, line.qty + 1) } : line,
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          priceCents: product.priceCents,
          imageUrl: product.imageUrl,
          weightKg: Number(product.weightKg) || 0,
          requiresConfirmation: Boolean(product.requiresConfirmation),
          stock: Number(product.stock) || 0,
          storeId: store.id,
          storeName: store.name,
          storeSlug: store.slug,
          qty: 1,
        },
      ];
    });
  }, []);

  const setQty = useCallback((productId, qty) => {
    setLines((prev) =>
      prev
        .map((line) =>
          line.productId === productId
            ? { ...line, qty: Math.max(0, Math.min(Number(line.stock) || 99, Number(qty) || 0)) }
            : line,
        )
        .filter((line) => line.qty > 0),
    );
  }, []);

  const remove = useCallback((productId) => {
    setLines((prev) => prev.filter((line) => line.productId !== productId));
  }, []);

  const value = useMemo(() => {
    const stores = [];
    for (const line of lines) {
      let group = stores.find((item) => item.storeId === line.storeId);
      if (!group) {
        group = { storeId: line.storeId, storeName: line.storeName, storeSlug: line.storeSlug, lines: [], subtotalCents: 0 };
        stores.push(group);
      }
      group.lines.push(line);
      group.subtotalCents += line.priceCents * line.qty;
    }

    return {
      lines,
      stores,
      count: lines.reduce((total, line) => total + line.qty, 0),
      subtotalCents: lines.reduce((total, line) => total + line.priceCents * line.qty, 0),
      weightKg: Math.round(lines.reduce((total, line) => total + line.weightKg * line.qty, 0) * 100) / 100,
      requiresConfirmation: lines.some((line) => line.requiresConfirmation),
      cartPayload: lines.map((line) => ({ productId: line.productId, qty: line.qty })),
      add,
      setQty,
      remove,
      clear: () => setLines([]),
    };
  }, [lines, add, setQty, remove]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart necesita CartProvider');
  return context;
};
