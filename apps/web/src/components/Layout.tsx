import { Outlet, useNavigate } from "react-router";
import { useLanguage } from "../hooks/useLanguage";
import { useAuth } from "../hooks/useAuth";
import { t, formatMoney, Language } from "../lib/translations";

export function Layout({ children }: { children?: React.ReactNode }) {
  const { t: tl, switchLanguage, language } = useLanguage();
  const { user, logout, setTenant, clearTenant } = useAuth();
  const navigate = useNavigate();
  const tenantId = localStorage.getItem("tenantId") || "";

  const handleLogout = async () => {
    if (confirm(tl("logoutConfirm"))) {
      await logout();
      clearTenant();
      navigate("/login");
    }
  };

  return (
    <div className="min-h-screen bg-burmese-bg text-burmese-primary">
      <nav className="border-b border-burmese-secondary/20 bg-burmese-bg/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold">{tl("title")}</span>
              <span className="text-xs text-burmese-secondary uppercase tracking-wider">POS</span>
            </div>

            <div className="flex items-center gap-4">
              {tenantId && (
                <button
                  onClick={handleLogout}
                  className="text-sm text-burmese-secondary hover:text-burmese-primary transition-colors"
                >
                  {tl("logout")}
                </button>
              )}
              <button
                onClick={() => switchLanguage(language === "en" ? "my" : "en")}
                className="text-sm text-burmese-secondary hover:text-burmese-accent transition-colors px-3 py-1 rounded border border-burmese-secondary/30"
              >
                {language === "en" ? tl("burmese") : tl("english")}
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Outlet />
      </main>
    </div>
  );
}