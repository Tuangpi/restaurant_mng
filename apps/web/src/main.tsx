import React from "react";
import { createBrowserRouter, RouterProvider, RouteObject } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLanguage } from "./hooks/useLanguage";
import { TailwindProvider } from "./lib/tailwind";

const router = createBrowserRouter({
  children: [
    {
      path: "/",
      element: <h1>Myanmar Restaurant POS</h1>,
    },
  ],
});

function App() {
  const { t, switchLanguage } = useLanguage();

  return (
    <TailwindProvider>
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </TailwindProvider>
  );
}

export default App;