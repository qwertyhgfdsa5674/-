import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";

import { App } from "./App";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1
    }
  }
});

async function enableMocks() {
  const apiBase = import.meta.env.VITE_API_BASE_URL;
  const forceMsw = import.meta.env.VITE_ENABLE_MSW === "true";

  if (import.meta.env.DEV && (!apiBase || forceMsw)) {
    const { worker } = await import("./mocks/browser");
    await worker.start({ onUnhandledRequest: "bypass" });
  }
}

function renderApp() {
  createRoot(rootElement!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
          <Toaster position="top-right" />
        </BrowserRouter>
      </QueryClientProvider>
    </React.StrictMode>
  );
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

enableMocks()
  .catch((error: unknown) => {
    console.error("Mock service worker failed to start", error);
  })
  .finally(renderApp);
