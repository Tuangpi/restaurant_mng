import { useState } from "react";
import { useLanguage } from "../hooks/useLanguage";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { api } from "../lib/api";
import { t, Language, formatMoney } from "../lib/translations";

export function ShiftPage() {
  const { t: tl, language } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [openingFloat, setOpeningFloat] = useState("");
  const [countedCash, setCountedCash] = useState("");
  const [expectedCash, setExpectedCash] = useState("");
  const [difference, setDifference] = useState("");

  const handleOpenShift = async (e: React.FormEvent) => {
    e.preventDefault();
    const float = parseInt(openingFloat, 10) || 0;
    setExpectedCash(float.toString());
    setDifference("0");
    setIsOpen(true);
  };

  const handleCloseShift = async (e: React.FormEvent) => {
    e.preventDefault();
    const counted = parseInt(countedCash, 10) || 0;
    const expected = parseInt(expectedCash, 10) || 0;
    setDifference((counted - expected).toString());

    try {
      await api.post("/payments/shift/close", {
        openingFloat: parseInt(openingFloat, 10) || 0,
        countedCash: counted,
        expectedCash: expected,
      });
      setIsOpen(false);
      alert(tl("shiftClosed"));
    } catch {
      alert(tl("somethingWentWrong"));
    }
  };

  return (
    <ProtectedRoute>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-burmese-primary">{tl("shift")}</h1>

        {!isOpen ? (
          <div className="bg-burmese-bg p-6 rounded-xl border border-burmese-secondary/20">
            <h2 className="text-lg font-semibold text-burmese-primary mb-4">{tl("openShift")}</h2>
            <form onSubmit={handleOpenShift} className="space-y-4 max-w-md">
              <div>
                <label className="block text-sm font-medium text-burmese-secondary mb-1">{tl("openingFloat")}</label>
                <input
                  type="number"
                  required
                  className="w-full px-4 py-2 border border-burmese-secondary/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-burmese-accent"
                  value={openingFloat}
                  onChange={(e) => setOpeningFloat(e.target.value)}
                  placeholder="0"
                />
              </div>
              <button type="submit" className="w-full py-3 px-4 bg-burmese-primary text-white rounded-lg font-medium hover:bg-burmese-secondary transition-colors">
                {tl("openShift")}
              </button>
            </form>
          </div>
        ) : (
          <div className="bg-burmese-bg p-6 rounded-xl border border-burmese-secondary/20">
            <h2 className="text-lg font-semibold text-burmese-primary mb-4">{tl("closeShift")}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-burmese-secondary mb-1">{tl("openingFloat")}</label>
                <div className="text-burmese-primary">{formatMoney(parseInt(openingFloat, 10) || 0, language as Language)}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-burmese-secondary mb-1">{tl("expectedCash")}</label>
                <div className="text-burmese-primary">{formatMoney(parseInt(expectedCash, 10) || 0, language as Language)}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-burmese-secondary mb-1">{tl("countedCash")}</label>
                <input
                  type="number"
                  required
                  className="w-full px-4 py-2 border border-burmese-secondary/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-burmese-accent"
                  value={countedCash}
                  onChange={(e) => setCountedCash(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-burmese-secondary mb-1">{tl("difference")}</label>
                <div className={`text-lg font-bold ${parseInt(difference, 10) >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {formatMoney(parseInt(difference, 10) || 0, language as Language)}
                </div>
              </div>
            </div>
            <form onSubmit={handleCloseShift} className="space-y-2">
              <button type="submit" className="w-full py-3 px-4 bg-burmese-primary text-white rounded-lg font-medium hover:bg-burmese-secondary transition-colors">
                {tl("closeShift")}
              </button>
            </form>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}

export default ShiftPage;