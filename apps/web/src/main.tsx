import React from "react";
import { createBrowserRouter, RouterProvider } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLanguage } from "./hooks/useLanguage.ts";

const router = createBrowserRouter([
  {
    path: "/",
    element: <></>,
  },
]);

function App() {
  const { t, switchLanguage, language } = useLanguage();

  return (
    <>
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>
      <h1>{t("title")}</h1>
    </>
  );
}

export default App;
