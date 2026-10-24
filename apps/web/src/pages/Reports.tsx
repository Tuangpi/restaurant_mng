import { useState, useEffect } from "react";
import { useLanguage } from "../hooks/useLanguage";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { api } from "../lib/api";
import { t, Language, formatMoney } from "../lib/translations";

export function ReportsPage() {
  const { t: tl, language } = useLanguage();
  const [dailySales, setDailySales] = useState<any>(null);
  const [paymentMix, setPaymentMix] = useState<any>(null);
  const [topItems, setTopItems] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    loadReports();
  }, [startDate, endDate]);

  const loadReports = () => {
    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);

    api.get<{ success: boolean; data: any }>(`/reports/daily-sales?${params}`).then((res) => {
      if (res.success) setDailySales(res.data);
    });
    api.get<{ success: boolean; data: any }>(`/reports/payment-mix?${params}`).then((res) => {
      if (res.success) setPaymentMix(res.data);
    });
    api.get<{ success: boolean; data: any }>(`/reports/top-items?${params}`).then((res) => {
      if (res.success) setTopItems(res.data);
    });
    setIsLoading(false);
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
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-burmese-primary">{tl("reports")}</h1>
          <div className="flex gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-2 border border-burmese-secondary/30 rounded-lg text-sm"
            />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-2 border border-burmese-secondary/30 rounded-lg text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-burmese-bg p-6 rounded-xl border border-burmese-secondary/20">
            <div className="text-sm font-semibold text-burmese-secondary uppercase tracking-wider mb-2">{tl("totalRevenue")}</div>
            <div className="text-2xl font-bold text-burmese-primary">
              {dailySales?.totalRevenue != null ? formatMoney(dailySales.totalRevenue, language as Language) : "—"}
            </div>
          </div>
          <div className="bg-burmese-bg p-6 rounded-xl border border-burmese-secondary/20">
            <div className="text-sm font-semibold text-burmese-secondary uppercase tracking-wider mb-2">{tl("totalOrders")}</div>
            <div className="text-2xl font-bold text-burmese-primary">{dailySales?.ordersCount ?? "—"}</div>
          </div>
          <div className="bg-burmese-bg p-6 rounded-xl border border-burmese-secondary/20">
            <div className="text-sm font-semibold text-burmese-secondary uppercase tracking-wider mb-2">{tl("itemsSold")}</div>
            <div className="text-2xl font-bold text-burmese-primary">{dailySales?.itemsSold ?? "—"}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-burmese-bg p-6 rounded-xl border border-burmese-secondary/20">
            <h2 className="text-sm font-semibold text-burmese-secondary uppercase tracking-wider mb-4">{tl("paymentMix")}</h2>
            {paymentMix?.paymentMix?.length ? (
              <ul className="space-y-3">
                {paymentMix.paymentMix.map((item: any) => (
                  <li key={item.method} className="flex justify-between text-sm border-b border-burmese-secondary/10 pb-2">
                    <span className="text-burmese-secondary">{item.method}</span>
                    <span className="text-burmese-primary font-medium">{formatMoney(item.amount, language as Language)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-burmese-secondary text-sm">No data</div>
            )}
          </div>

          <div className="bg-burmese-bg p-6 rounded-xl border border-burmese-secondary/20">
            <h2 className="text-sm font-semibold text-burmese-secondary uppercase tracking-wider mb-4">{tl("topItems")}</h2>
            {topItems?.topItems?.length ? (
              <ul className="space-y-3">
                {topItems.topItems.map((item: any, idx: number) => (
                  <li key={idx} className="flex justify-between text-sm border-b border-burmese-secondary/10 pb-2">
                    <span className="text-burmese-secondary">{item.name}</span>
                    <span className="text-burmese-primary font-medium">{item.quantity}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-burmese-secondary text-sm">No data</div>
            )}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}

export default ReportsPage;