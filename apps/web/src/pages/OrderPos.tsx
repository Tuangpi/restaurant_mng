import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useLanguage } from "../hooks/useLanguage";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { api, isSuccessResponse } from "../lib/api";
import { Language, formatMoney } from "../lib/translations";
import { useOfflineQueue } from "../hooks/useOfflineQueue";

interface MenuItem {
  id: string;
  name: string;
  nameMm?: string | null;
  price: number;
  isAvailable: boolean;
  categoryId?: string;
}

interface MenuCategory {
  id: string;
  name: string;
  nameMm?: string | null;
  sortOrder: number;
}

interface CartItem {
  menuItemId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export function OrderPosPage() {
  const { t: tl, language } = useLanguage();
  const { isOnline, isOffline, isSyncing, addOrder, syncQueue } = useOfflineQueue();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tableId = searchParams.get("tableId") || "";

  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/menu/categories").then((res) => {
      if (isSuccessResponse<MenuCategory[]>(res)) {
        setCategories(res.data);
        if (res.data.length > 0) setSelectedCategory(res.data[0].id);
      }
    });
  }, []);

  useEffect(() => {
    if (!selectedCategory) return;
    api.get(`/menu/items?categoryId=${selectedCategory}`).then((res) => {
      if (isSuccessResponse<MenuItem[]>(res)) setItems(res.data.filter((i) => i.isAvailable));
    });
  }, [selectedCategory]);

  const addToCart = useCallback((item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.menuItemId === item.id);
      if (existing) {
        return prev.map((c) =>
          c.menuItemId === item.id
            ? { ...c, quantity: c.quantity + 1, lineTotal: (c.quantity + 1) * item.price }
            : c
        );
      }
      return [...prev, { menuItemId: item.id, name: item.name, unitPrice: item.price, quantity: 1, lineTotal: item.price }];
    });
  }, []);

  const removeFromCart = (menuItemId: string) => {
    setCart((prev) => prev.filter((c) => c.menuItemId !== menuItemId));
  };

  const subtotal = cart.reduce((sum, item) => sum + item.lineTotal, 0);
  const tax = Math.round(subtotal * 0.07);
  const total = subtotal + tax;

  const adjustQuantity = (menuItemId: string, delta: number) => {
    setCart((prev) =>
      prev.map((c) => {
        if (c.menuItemId !== menuItemId) return c;
        const newQty = Math.max(0, c.quantity + delta);
        if (newQty === 0) return null as any;
        return { ...c, quantity: newQty, lineTotal: newQty * c.unitPrice };
      })
    );
    setCart((prev) => prev.filter((c) => c !== null));
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) {
      setError(tl("required"));
      return;
    }
    const idempotencyKey = `order-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    setError("");

    // Add to offline queue
    addOrder({
      tenantId: localStorage.getItem("tenantId") || "",
      clientId: localStorage.getItem("clientId") || "",
      idempotencyKey,
      type: searchParams.get("type") || "DINE_IN",
      tableId,
      items: cart.map((c) => ({ menuItemId: c.menuItemId, quantity: c.quantity })),
      createdAt: Date.now(),
    });

    // Try to sync immediately if online
    if (isOnline) {
      const results = await syncQueue();
      if (results.some((r) => r.status === "APPLIED")) {
        setCart([]);
      }
    }

    setIsLoading(false);
  };

  useEffect(() => {
    // Sync queued orders when coming back online
    if (isOnline && localStorage.getItem("offline_order_queue")) {
      syncQueue();
    }
  }, [isOnline]);

  return (
    <div className="min-h-screen bg-burmese-bg text-burmese-text">
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-2xl font-bold text-burmese-primary mb-6">
          {language === "my" ? "တischtausk" : "Myanmar Restaurant POS"}
        </h1>

        {/* Offline status banner */}
        {isOffline && (
          <div className="p-3 mb-4 bg-burmese-secondary/20 border-burmese-secondary/30 rounded-xl text-burmese-secondary text-sm">
            {tl("offline_sync_caption")}
          </div>
        )}

        <ProtectedRoute>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h2 className="text-sm font-semibold text-burmese-secondary uppercase tracking-wider mb-4">
                {tl("menu")}
              </h2>
              {language === "my" && <p className="text-burmese-secondary text-sm mb-4">ဆင်ရွေးစ Nominal roll</p>}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => addToCart(item)}
                    className="flex flex-col items-center p-3 rounded-xl border border-burmese-secondary/20 hover:border-burmese-accent hover:bg-burmese-secondary/10 transition-all"
                  >
                    <div className="text-sm font-medium text-burmese-primary truncate">
                      {language === "my" && item.nameMm ? item.nameMm : item.name}
                    </div>
                    <div className="text-xs text-burmese-secondary">{formatMoney(item.price, language as Language)}</div>
                  </button>
                ))}
                {items.length === 0 && (
                  <div className="col-span-full py-8 text-center text-burmese-secondary">No items available</div>
                )}
              </div>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-burmese-secondary uppercase tracking-wider mb-4">
                {tl("cart")}
              </h2>
              {cart.length === 0 ? (
                <div className="text-center text-burmese-secondary text-sm">No items yet</div>
              ) : (
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {cart.map((item) => (
                    <div
                      key={item.menuItemId}
                      className="flex items-center justify-between p-2 bg-white rounded border border-burmese-secondary/10"
                    >
                      <div className="flex-1">
                        <div className="text-sm font-medium text-burmese-primary truncate">{item.name}</div>
                        <div className="text-xs text-burmese-secondary">{formatMoney(item.unitPrice, language as Language)} × {item.quantity}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => adjustQuantity(item.menuItemId, -1)}
                          className="w-6 h-6 rounded border border-burmese-secondary/30 flex items-center justify-center text-xs hover:bg-burmese-secondary/20"
                        >
                          −
                        </button>
                        <span className="w-4 text-center text-xs font-medium">{item.quantity}</span>
                        <button
                          onClick={() => adjustQuantity(item.menuItemId, 1)}
                          className="w-6 h-6 rounded border border-burmese-secondary/30 flex items-center justify-center text-xs hover:bg-burmese-secondary/20"
                        >
                          +
                        </button>
                      </div>
                      <button
                        onClick={() => removeFromCart(item.menuItemId)}
                        className="text-burmese-secondary hover:text-red-500"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-6 space-y-2">
                <div className="flex justify-between text-sm"><span className="text-burmese-secondary">Subtotal</span><span>{formatMoney(subtotal, language as Language)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-burmese-secondary">Tax</span><span>{formatMoney(tax, language as Language)}</span></div>
                <div className="flex justify-between text-lg font-bold border-t pt-2"><span className="text-burmese-primary">Total</span><span>{formatMoney(total, language as Language)}</span></div>
              </div>

              {isSyncing && (
                <div className="mt-4 p-3 bg-burmese-secondary/10 border-burmese-secondary/30 rounded-xl text-burmese-secondary text-sm">
                  {tl("syncing")}
                </div>
              )}

              <button
                onClick={handleCreateOrder}
                disabled={cart.length === 0 || isLoading || isOffline || isSyncing}
                className="w-full py-3 px-4 bg-burmese-primary text-white rounded-lg font-medium disabled:opacity-50 hover:bg-burmese-secondary transition-colors mt-4"
              >
                {isSyncing ? tl("syncing") : isOffline ? tl("save_offline") : tl("createOrder")}
              </button>
            </div>
          </div>
        </ProtectedRoute>
      </div>
    </div>
  );
}

export default OrderPosPage;