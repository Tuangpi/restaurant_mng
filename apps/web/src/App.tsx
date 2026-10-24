import { createBrowserRouter, RouterProvider } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLanguage } from "./hooks/useLanguage";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Login } from "./pages/Login";
import { DashboardPage } from "./pages/Dashboard";
import { TablesPage } from "./pages/Tables";
import { OrderPosPage } from "./pages/OrderPos";
import { KitchenPage } from "./pages/Kitchen";
import { ShiftPage } from "./pages/Shift";
import { ReportsPage } from "./pages/Reports";

const queryClient = new QueryClient();

const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "login", element: <Login /> },
      { path: "tables", element: <TablesPage /> },
      { path: "orders/pos", element: <OrderPosPage /> },
      { path: "kitchen", element: <KitchenPage /> },
      { path: "shift", element: <ShiftPage /> },
      { path: "reports", element: <ReportsPage /> },
    ],
  },
  { path: "/login", element: <Login /> },
]);

function App() {
  const { t, switchLanguage, language } = useLanguage();

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <h1>{t("title")}</h1>
    </QueryClientProvider>
  );
}

export default App;