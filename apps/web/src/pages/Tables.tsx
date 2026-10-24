import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useLanguage } from "../hooks/useLanguage";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { t, Language, formatMoney } from "../lib/translations";

type TableStatus = "available" | "occupied";

const INITIAL_TABLES = [
  { id: "1", number: "1", status: "available" as TableStatus, capacity: 4 },
  { id: "2", number: "2", status: "available" as TableStatus, capacity: 2 },
  { id: "3", number: "3", status: "available" as TableStatus, capacity: 4 },
  { id: "4", number: "4", status: "available" as TableStatus, capacity: 6 },
  { id: "5", number: "5", status: "available" as TableStatus, capacity: 2 },
  { id: "6", number: "6", status: "available" as TableStatus, capacity: 4 },
];

interface Table {
  id: string;
  number: string;
  status: TableStatus;
  capacity: number;
}

export function TablesPage() {
  const { t: tl, language } = useLanguage();
  const navigate = useNavigate();
  const [tables, setTables] = useState(INITIAL_TABLES);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

  const handleSeat = (tableId: string) => {
    setSelectedTable(tableId);
    navigate(`/orders/pos?tableId=${tableId}`);
  };

  return (
    <ProtectedRoute>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-burmese-primary">{tl("tables")}</h1>
          <button
            onClick={() => navigate("/orders/pos")}
            className="px-4 py-2 bg-burmese-primary text-white rounded-lg text-sm font-medium hover:bg-burmese-secondary transition-colors"
          >
            {tl("seatCustomer")}
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {tables.map((table) => {
            const isOccupied = table.status === "occupied";
            return (
              <button
                key={table.id}
                onClick={() => handleSeat(table.id)}
                disabled={isOccupied}
                className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${
                  isOccupied
                    ? "bg-red-50 border-red-200 text-red-600"
                    : table.id === selectedTable
                    ? "bg-burmese-accent/10 border-burmese-accent text-burmese-accent"
                    : "bg-burmese-bg border-burmese-secondary/20 text-burmese-primary hover:bg-burmese-secondary/10"
                }`}
              >
                <div className="text-2xl font-bold mb-1">T{table.number}</div>
                <div className="text-xs font-medium capitalize">
                  {tl(language as Language, table.status === "occupied" ? "statusOccupied" : "statusAvailable")}
                </div>
                <div className="text-[10px] text-burmese-secondary mt-1">{table.capacity} seats</div>
              </button>
            );
          })}
        </div>
      </div>
    </ProtectedRoute>
  );
}

export default TablesPage;