import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { type ReactNode, useState, useEffect } from "react";

import appCss from "../styles.css?url";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import { Toaster } from "@/components/ui/sonner";
import { useTimezone } from "@/hooks/use-timezone";
import { useSimEngine } from "@/lib/store/use-sim-engine";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-5xl font-bold">404</h1>
        <p className="mt-2 text-sm text-muted-foreground">Market not found.</p>
        <Link to="/" className="mt-4 inline-block text-primary hover:underline">Back to markets</Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error }: { error: Error }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-lg font-semibold">Something broke.</h1>
        <p className="mt-2 text-xs text-muted-foreground font-mono">{error.message}</p>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Polysim — Polymarket CLOB paper trading" },
      { name: "description", content: "Paper trading des vrais marchés Polymarket crypto Up/Down 5m, 15m et 1h." },
      { name: "theme-color", content: "#0b0e11" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='12' fill='%23FCD535'/%3E%3Ctext x='32' y='42' text-anchor='middle' font-family='Arial' font-size='34' font-weight='700' fill='%23181a20'%3EP%3C/text%3E%3C/svg%3E" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head><HeadContent /></head>
      <body suppressHydrationWarning>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AppShell />
    </QueryClientProvider>
  );
}

function AppShell() {
  useSimEngine();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-4">
        <Outlet />
      </main>
      <Toaster theme="dark" position="bottom-right" />
    </div>
  );
}

function Header() {
  return (
    <header className="border-b border-hairline bg-surface/60 backdrop-blur sticky top-0 z-30">
      <div className="mx-auto max-w-7xl px-4 h-14 flex items-center gap-6">
        <Link to="/" className="flex items-center gap-2">
          <div className="h-7 w-7 rounded bg-primary flex items-center justify-center text-primary-foreground font-black text-sm">P</div>
          <span className="font-bold tracking-tight">polysim<span className="text-primary">_</span></span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link
            to="/"
            activeOptions={{ exact: true }}
            activeProps={{ className: "bg-accent text-foreground" }}
            className="px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition"
          >
            Markets
          </Link>
          <Link
            to="/portfolio"
            activeProps={{ className: "bg-accent text-foreground" }}
            className="px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition"
          >
            Portfolio
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <ThemeToggle />
          <TimezoneToggle />
          <div className="hidden sm:flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-up animate-pulse" />
            Live · Polymarket CLOB
          </div>
        </div>
      </div>
    </header>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") return "dark";
    return (localStorage.getItem("polysim-theme") as "dark" | "light") || "dark";
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === "light") {
      root.classList.remove("dark");
      root.classList.add("light");
    } else {
      root.classList.remove("light");
      root.classList.add("dark");
    }
    localStorage.setItem("polysim-theme", theme);
  }, [theme]);

  return (
    <button
      type="button"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="hidden sm:flex items-center gap-1.5 rounded-md border border-hairline px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition"
      title={theme === "dark" ? "Passer en mode jour" : "Passer en mode nuit"}
    >
      {theme === "dark" ? (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
          Jour
        </>
      ) : (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
          Nuit
        </>
      )}
    </button>
  );
}

function TimezoneToggle() {
  const [mode, setMode] = useTimezone();
  return (
    <button
      type="button"
      onClick={() => setMode(mode === "et" ? "local" : "et")}
      className="hidden sm:flex items-center gap-1.5 rounded-md border border-hairline px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition"
      title={mode === "et" ? "Heure de l'Est (ET)" : "Heure locale"}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
      {mode === "et" ? "ET" : "Local"}
    </button>
  );
}

