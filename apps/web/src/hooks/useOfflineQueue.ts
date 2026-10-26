import { useState, useEffect, useCallback } from "react";

type QueuedPayment = {
  id: string;
  tenantId: string;
  clientId: string;
  idempotencyKey: string;
  orderId: string;
  amount: number;
  method: "CASH" | "CARD" | "MOBILE" | "QR";
  tendered?: number;
  reference?: string;
  createdAt: number;
};

type QueueAction =
  | { type: "ADD_ORDER"; payload: QueuedOrder }
  | { type: "REMOVE_ORDER"; payload: { idempotencyKey: string } }
  | { type: "CLEAR_QUEUE" }
  | { type: "SET_SYNC_STATUS"; payload: "online" | "offline" | "syncing" };

const ORDERS_KEY = "offline_order_queue";
const PAYMENTS_KEY = "offline_payment_queue";
const SYNC_STATUS_KEY = "offline_sync_status";

export function useOfflineQueue() {
  const [queue, setQueue] = useState<QueuedOrder[]>(() => {
    const stored = localStorage.getItem(ORDERS_KEY);
    return stored ? JSON.parse(stored) : [];
  });

  const [syncStatus, setSyncStatus] = useState<
    "online" | "offline" | "syncing"
  >(() => {
    const stored = localStorage.getItem(SYNC_STATUS_KEY);
    return stored as "online" | "offline" | "syncing" || "online";
  });

  const [paymentQueue, setPaymentQueue] = useState<QueuedPayment[]>(() => {
    const stored = localStorage.getItem(PAYMENTS_KEY);
    return stored ? JSON.parse(stored) : [];
  });

  const [attemptCount, setAttemptCount] = useState(0);
  const [lastSyncAttempt, setLastSyncAttempt] = useState<number>(0);

  useEffect(() => {
    const handleOnline = () => {
      setSyncStatus("online");
      // Debounced auto-sync with exponential backoff
      const now = Date.now();
      if (now - (lastSyncAttempt || 0) < 1000) return; // Throttle: min 1s between attempts
      setAttemptCount((prev) => {
        const newCount = Math.min(prev + 1, 3); // Max 3 attempts
        if (newCount >= 3) {
          // Last attempt - sync immediately
          void syncQueue();
        } else {
          // Schedule next attempt with backoff
          const backoff = 1000 * Math.pow(2, newCount); // 2s, 4s
          setLastSyncAttempt(now);
          const timer = setTimeout(() => {
            setAttemptCount(newCount);
            void syncQueue();
          }, backoff);
          return () => clearTimeout(timer);
        }
        return newCount;
      });
    };

    const handleOffline = () => setSyncStatus("offline");

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [syncStatus, queue, paymentQueue, attemptCount, lastSyncAttempt, syncQueue]);

  const addOrder = useCallback(
    (order: Omit<QueuedOrder, "id" | "createdAt">) => {
      const newOrder: QueuedOrder = {
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        ...order,
      };
      setQueue((prev) => [...prev, newOrder]);
      localStorage.setItem(ORDERS_KEY, JSON.stringify([...queue, newOrder]));
    },
    [queue]
  );

  const removeOrder = useCallback(
    (idempotencyKey: string) => {
      setQueue((prev) => prev.filter((o) => o.idempotencyKey !== idempotencyKey));
      localStorage.setItem(ORDERS_KEY, JSON.stringify(queue.filter((o) => o.idempotencyKey !== idempotencyKey)));
    },
    [queue]
  );

  const clearQueue = useCallback(() => {
    setQueue([]);
    localStorage.removeItem(ORDERS_KEY);
    setPaymentQueue([]);
    localStorage.removeItem(PAYMENTS_KEY);
    localStorage.removeItem(SYNC_STATUS_KEY);
  }, []);

  const syncQueue = useCallback(async () => {
    if (syncStatus !== "online" || queue.length === 0 && paymentQueue.length === 0) return;

    setSyncStatus("syncing");
    const results: Array<{ idempotencyKey: string; status: string; entityId?: string }> = [];

    for (const order of [...queue]) {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_BASE || "http://localhost:4000/api"}/sync`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Tenant-Id": order.tenantId,
            ...(typeof window !== "undefined" ? { Authorization: `Bearer ${localStorage.getItem("access_token")}` } : {}),
          },
          credentials: "include",
          body: JSON.stringify({
            clientId: order.clientId,
            operations: [
              {
                idempotencyKey: order.idempotencyKey,
                entity: "ORDER",
                operation: "CREATE",
                payload: {
                  type: order.type,
                  tableId: order.tableId,
                  items: order.items,
                },
              },
            ],
          }),
        });

        const data = await res.json();

        if (res.ok) {
          results.push({
            idempotencyKey: order.idempotencyKey,
            status: "APPLIED",
            entityId: data.data?.results?.[0]?.entityId,
          });
          removeOrder(order.idempotencyKey);
        } else {
          results.push({
            idempotencyKey: order.idempotencyKey,
            status: "REJECTED",
            error: data.error?.message || "Unknown error",
          });
        }
      } catch (err) {
        results.push({
          idempotencyKey: order.idempotencyKey,
          status: "FAILED",
          error: err instanceof Error ? err.message : "Network error",
        });
      }
    }

    // Then sync payments
    for (const payment of [...paymentQueue]) {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_BASE || "http://localhost:4000/api"}/sync`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Tenant-Id": payment.tenantId,
            ...(typeof window !== "undefined" ? { Authorization: `Bearer ${localStorage.getItem("access_token")}` } : {}),
          },
          credentials: "include",
          body: JSON.stringify({
            clientId: payment.clientId,
            operations: [
              {
                idempotencyKey: payment.idempotencyKey,
                entity: "PAYMENT",
                operation: "RECORD",
                payload: {
                  orderId: payment.orderId,
                  amount: payment.amount,
                  method: payment.method,
                  tendered: payment.tendered,
                  reference: payment.reference,
                },
              },
            ],
          }),
        });

        const data = await res.json();

        if (res.ok) {
          results.push({
            idempotencyKey: payment.idempotencyKey,
            status: "APPLIED",
            entityId: data.data?.results?.[0]?.entityId,
          });
          // Remove from payment queue
          setPaymentQueue((prev) => prev.filter((p) => p.idempotencyKey !== payment.idempotencyKey));
          localStorage.setItem(PAYMENTS_KEY, JSON.stringify(prev.filter((p) => p.idempotencyKey !== payment.idempotencyKey)));
        } else {
          results.push({
            idempotencyKey: payment.idempotencyKey,
            status: "REJECTED",
            error: data.error?.message || "Unknown error",
          });
        }
      } catch (err) {
        results.push({
          idempotencyKey: payment.idempotencyKey,
          status: "FAILED",
          error: err instanceof Error ? err.message : "Network error",
        });
      }
    }

    setSyncStatus("online");
    return results;
  }, [syncStatus, queue, paymentQueue]);

  return {
    queue,
    syncStatus,
    addOrder,
    removeOrder,
    clearQueue,
    syncQueue,
    isOnline: syncStatus === "online",
    isOffline: syncStatus === "offline",
    isSyncing: syncStatus === "syncing",
  };
}