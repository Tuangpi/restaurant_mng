import { useState, useEffect } from "react";
import { useLanguage } from "../hooks/useLanguage";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { api, isSuccessResponse } from "../lib/api";
import { t, Language, formatMoney } from "../lib/translations";

interface KitchenOrder {
  id: string;
  orderNumber: number;
  type: string;
  status: string;
  tableId?: string;
  createdAt: string;
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  statusHistory: Array<{ status: string; changedAt: string }>;
}

export function KitchenPage() {
  const { t: tl, language } = useLanguage();
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    api.get("/kitchen/orders").then((res) => {
      if (isSuccessResponse<KitchenOrder[]>(res)) setOrders(res.data);
      setIsLoading(false);
    });
  }, []);

  const updateStatus = async (orderId: string, status: string) => {
    try {
      await api.post(`/kitchen/orders/${orderId}/status`, { status });
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status } : o)));
    } catch {
      alert(tl("somethingWentWrong"));
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "OPEN": return "text-burmese-primary";
      case "COOKING": return "text-burmese-accent";
      case "READY": return "text-green-600";
      case "SERVED": return "text-green-800";
      case "CLOSED": return "text-burmese-secondary";
      default: return "text-burmese-secondary";
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-burmese-accent"></div>
      </div>
    );
  }

  return (
    <ProtectedRoute>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-burmese-primary">{tl("kitchenDisplay")}</h1>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {orders.length === 0 ? (
            <div className="col-span-full text-center py-20 text-burmese-secondary">
              No active orders
            </div>
          ) : (
            orders.map((order) => (
              <div key={order.id} className="bg-burmese-bg rounded-xl border border-burmese-secondary/20 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-bold text-burmese-primary">#{order.orderNumber}</div>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full uppercase ${statusColor(order.status)}`}>
                    {order.status}
                  </span>
                </div>
                {order.tableId && <div className="text-xs text-burmese-secondary mb-2">Table {order.tableId}</div>}
                <div className="space-y-2">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-2 bg-white rounded border border-burmese-secondary/10">
                      <div className="flex-1">
                        <div className="text-sm font-medium text-burmese-primary">{item.name}</div>
                        <div className="text-xs text-burmese-secondary">× {item.quantity}</div>
                      </div>
                      <div className="text-sm font-medium text-burmese-primary">{formatMoney(item.lineTotal, language as Language)}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  {order.status !== "READY" && order.status !== "SERVED" && (
                    <button
                      onClick={() => updateStatus(order.id, "COOKING")}
                      className="flex-1 py-2 px-3 bg-burmese-accent text-white rounded text-xs font-medium hover:bg-orange-600 transition-colors"
                    >
                      {tl("markCooking")}
                    </button>
                  )}
                  {order.status === "COOKING" && (
                    <button
                      onClick={() => updateStatus(order.id, "READY")}
                      className="flex-1 py-2 px-3 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 transition-colors"
                    >
                      {tl("markReady")}
                    </button>
                  )}
                  {order.status === "READY" && (
                    <button
                      onClick={() => updateStatus(order.id, "SERVED")}
                      className="flex-1 py-2 px-3 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 transition-colors"
                    >
                      {tl("markServed")}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}

export default KitchenPage;