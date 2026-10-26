import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useLanguage } from "../hooks/useLanguage";
import { api, isSuccessResponse } from "../lib/api";
import { Language } from "../lib/translations";
import { Layout } from "../components/Layout";

export function DashboardPage() {
  const { t: tl } = useLanguage();
const navigate = useNavigate();
  const [tenants, setTenants] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [syncStats, setSyncStats] = useState<any>(null);

  useEffect(() => {
    api.get("/tenants").then((res) => {
      if (isSuccessResponse<any[]>(res)) setTenants(res.data);
      setIsLoading(false);
    });
  }, []);

  useEffect(() => {
    if (localStorage.getItem("tenantId")) {
      api.get("/sync/queue-stats").then((res) => {
        if (isSuccessResponse<any>(res)) setSyncStats(res.data);
      });
    }
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-burmese-accent"></div>
      </div>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-burmese-primary">{tl("dashboard")}</h1>
            <p className="text-burmese-secondary">{tl("selectTenant")}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-burmese-bg p-6 rounded-xl border border-burmese-secondary/20">
            <h3 className="text-sm font-semibold text-burmese-secondary uppercase tracking-wider mb-4">
              {tl("tables")}
            </h3>
            <button
              onClick={() => navigate("/tables")}
              className="mt-4 w-full py-2 text-sm text-burmese-accent hover:underline"
            >
              {tl("tables")}
            </button>
          </div>

          <div className="bg-burmese-bg p-6 rounded-xl border border-burmese-secondary/20">
            <h3 className="text-sm font-semibold text-burmese-secondary uppercase tracking-wider mb-4">
              {tl("orders")}
            </h3>
            <button
              onClick={() => navigate("/orders/pos")}
              className="mt-4 w-full py-2 text-sm text-burmese-accent hover:underline"
            >
              {tl("orders")}
            </button>
          </div>

          <div className="bg-burmese-bg p-6 rounded-xl border border-burmese-secondary/20">
            <h3 className="text-sm font-semibold text-burmese-secondary uppercase tracking-wider mb-4">
              {tl("reports")}
            </h3>
            <button
              onClick={() => navigate("/reports")}
              className="mt-4 w-full py-2 text-sm text-burmese-accent hover:underline"
            >
              {tl("reports")}
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-burmese-primary">{tl("selectTenant")}</h2>
          {tenants.length === 0 ? (
            <div className="text-center py-20">
              <h2 className="text-xl font-bold text-burmese-primary">{tl("noTenants")}</h2>
              <button
                onClick={() => {
                  const name = prompt(tl("tenantName"));
                  const slug = prompt(tl("tenantSlug"), "my-restaurant");
                  if (name && slug) {
                    api.post("/tenants", { name, slug }).then((res) => {
                      if (isSuccessResponse<{ tenant: { id: string } }>(res)) {
                        localStorage.setItem("tenantId", res.data.tenant.id);
                        window.location.reload();
                      }
                    });
                  }
                }}
                className="px-6 py-3 bg-burmese-primary text-white rounded-lg font-medium hover:bg-burmese-secondary transition-colors"
              >
                {tl("createTenant")}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {tenants.map((tenant) => (
                <button
                  key={tenant.id}
                  onClick={() => {
                    localStorage.setItem("tenantId", tenant.id);
                    navigate(`/tables`);
                  }}
                  className="p-4 border border-burmese-secondary/30 rounded-xl hover:bg-burmese-secondary/10 hover:border-burmese-accent transition-all flex items-center justify-between"
                >
                  <div>
                    <div className="font-bold text-burmese-primary">{tenant.name}</div>
                    <div className="text-xs text-burmese-secondary">{tenant.slug}</div>
                  </div>
                  <span className="text-burmese-accent">OWNER</span>
                </button>
              ))}
            </div>
          )}

        </div>

        {syncStats && (
          <div className="bg-burmese-bg p-6 rounded-xl border border-burmese-secondary/20">
            <h3 className="text-sm font-semibold text-burmese-secondary uppercase tracking-wider mb-4">
              Sync reliability
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>Pending: {syncStats.pending}</div>
              <div>Applied: {syncStats.applied}</div>
              <div>Duplicates: {syncStats.duplicate}</div>
              <div>Failed: {syncStats.failed}</div>
            </div>
            <p className="mt-2 text-xs text-burmese-secondary">
              Retention: {syncStats.retentionDays} days
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
}

export default DashboardPage;
