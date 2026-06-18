import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { type ReactNode } from "react";

import appCss from "../styles.css?url";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import { Toaster } from "@/components/ui/sonner";
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
        <div className="ml-auto text-xs text-muted-foreground hidden sm:flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-up animate-pulse" />
          Live · Polymarket CLOB
        </div>
      </div>
    </header>
  );
}
