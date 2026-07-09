import React from "react";
import { createRoot } from "react-dom/client";
import { Activity, Bot, PackageSearch } from "lucide-react";
import "./styles.css";

const metrics = [
  { label: "候选商品", value: "0", icon: PackageSearch },
  { label: "AI 任务", value: "0", icon: Bot },
  { label: "系统健康", value: "OK", icon: Activity }
];

function App() {
  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-8">
        <header className="flex flex-col gap-2 border-b border-neutral-800 pb-6">
          <p className="text-sm uppercase tracking-wide text-emerald-300">
            AI E-Commerce Automation
          </p>
          <h1 className="text-3xl font-semibold">无货源电商自动化控制台</h1>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          {metrics.map((metric) => (
            <article
              className="rounded-lg border border-neutral-800 bg-neutral-900 p-5"
              key={metric.label}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-400">{metric.label}</span>
                <metric.icon className="h-5 w-5 text-emerald-300" />
              </div>
              <p className="mt-4 text-3xl font-semibold">{metric.value}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
