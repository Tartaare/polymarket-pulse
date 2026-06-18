import { createFileRoute, Link } from "@tanstack/react-router";
import { useSimStore, selectMidpoint } from "@/lib/store/sim-store";
import { positionPnl } from "@/lib/sim/portfolio";
import { toast } from "sonner";

export const Route = createFileRoute("/portfolio")({
  head: () => ({
    meta: [
      { title: "Portfolio — Polysim" },
      { name: "description", content: "Positions, PnL, ordres ouverts et historique." },
    ],
  }),
  component: PortfolioPage,
});

function PortfolioPage() {
  const portfolio = useSimStore((s) => s.portfolio);
  const markets = useSimStore((s) => s.markets);
  const books = useSimStore((s) => s.books);
  const cancelOrder = useSimStore((s) => s.cancelOrder);
  const cancelAll = useSimStore((s) => s.cancelAll);
  const redeem = useSimStore((s) => s.redeem);
  const reset = useSimStore((s) => s.resetPortfolio);

  const positions = portfolio.positions;
  const openPositions = positions.filter((p) => p.size > 0 && !p.redeemable);
  const redeemable = positions.filter((p) => p.redeemable);
  const closed = positions.filter((p) => p.redeemed || (p.size === 0 && !p.redeemable));

  const openOrders = portfolio.orders.filter((o) => o.status === "OPEN" || o.status === "PARTIAL");
  const trades = [...portfolio.fills].sort((a, b) => b.ts - a.ts).slice(0, 50);

  const totalUnrealized = openPositions.reduce((acc, p) => {
    const mid = selectMidpoint(books[p.marketId], p.outcome) ?? p.avgPrice;
    return acc + positionPnl(p, mid).cashPnl;
  }, 0);

  const totalEquity = portfolio.cash + openPositions.reduce((a, p) => {
    const mid = selectMidpoint(books[p.marketId], p.outcome) ?? p.avgPrice;
    return a + p.size * mid;
  }, 0);

  return (
    <div className="space-y-4">
      <header className="grid sm:grid-cols-4 gap-3">
        <Stat title="Equity" value={`$${totalEquity.toFixed(2)}`} />
        <Stat title="Cash" value={`$${portfolio.cash.toFixed(2)}`} sub={`Réservé $${portfolio.reserved.toFixed(2)}`} />
        <Stat title="PnL non-réalisé" value={`$${totalUnrealized.toFixed(2)}`} accent={totalUnrealized >= 0 ? "up" : "down"} />
        <Stat
          title="PnL réalisé"
          value={`$${positions.reduce((a, p) => a + p.realizedPnl, 0).toFixed(2)}`}
        />
      </header>

      {redeemable.length > 0 && (
        <Section title="À racheter">
          <div className="space-y-2">
            {redeemable.map((p) => {
              const m = markets[p.marketId];
              const winner = m?.resolvedOutcome === p.outcome;
              const payout = winner ? p.size : 0;
              return (
                <div key={`${p.marketId}-${p.outcome}`} className="flex items-center gap-3 p-3 rounded-md border border-hairline bg-surface">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{m?.asset} {m?.windowMin}m — <span className={p.outcome === "UP" ? "text-up" : "text-down"}>{p.outcome}</span></div>
                    <div className="text-xs text-muted-foreground num">{p.size.toFixed(0)} shares @ {Math.round(p.avgPrice * 100)}¢ · Gagnant: {m?.resolvedOutcome}</div>
                  </div>
                  <div className="num text-right">
                    <div className={`font-semibold ${winner ? "text-up" : "text-down"}`}>${payout.toFixed(2)}</div>
                  </div>
                  <button
                    onClick={() => { redeem(p.marketId, p.outcome); toast.success(`Redeem $${payout.toFixed(2)}`); }}
                    className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold"
                  >
                    Racheter
                  </button>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      <Section title="Positions ouvertes">
        {openPositions.length === 0 ? <Empty /> : (
          <Table headers={["Marché", "Outcome", "Shares", "Prix moyen", "Prix actuel", "Valeur", "PnL"]}>
            {openPositions.map((p) => {
              const m = markets[p.marketId];
              const mid = selectMidpoint(books[p.marketId], p.outcome) ?? p.avgPrice;
              const { cashPnl, currentValue, percentPnl } = positionPnl(p, mid);
              return (
                <tr key={`${p.marketId}-${p.outcome}`} className="border-t border-hairline">
                  <td className="py-2"><Link to="/market/$marketId" params={{ marketId: p.marketId }} className="hover:underline">{m?.asset} {m?.windowMin}m</Link></td>
                  <td className={p.outcome === "UP" ? "text-up" : "text-down"}>{p.outcome}</td>
                  <td className="num text-right">{p.size.toFixed(0)}</td>
                  <td className="num text-right">{Math.round(p.avgPrice * 100)}¢</td>
                  <td className="num text-right">{Math.round(mid * 100)}¢</td>
                  <td className="num text-right">${currentValue.toFixed(2)}</td>
                  <td className={`num text-right ${cashPnl >= 0 ? "text-up" : "text-down"}`}>
                    ${cashPnl.toFixed(2)} ({(percentPnl * 100).toFixed(1)}%)
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Section>

      <Section
        title="Ordres ouverts"
        right={openOrders.length > 0 && (
          <button onClick={() => { cancelAll(); toast("Tous les ordres annulés"); }} className="text-xs text-muted-foreground hover:text-foreground">Annuler tout</button>
        )}
      >
        {openOrders.length === 0 ? <Empty /> : (
          <Table headers={["Marché", "Outcome", "Side", "Type", "Prix", "Size", "Rempli", ""]}>
            {openOrders.map((o) => {
              const m = markets[o.marketId];
              return (
                <tr key={o.id} className="border-t border-hairline">
                  <td className="py-2">{m?.asset} {m?.windowMin}m</td>
                  <td className={o.outcome === "UP" ? "text-up" : "text-down"}>{o.outcome}</td>
                  <td>{o.side}</td>
                  <td>{o.type}{o.postOnly ? " · PO" : ""}</td>
                  <td className="num text-right">{o.limitPrice != null ? `${Math.round(o.limitPrice * 100)}¢` : "—"}</td>
                  <td className="num text-right">{o.size.toFixed(0)}</td>
                  <td className="num text-right">{o.filled.toFixed(0)}</td>
                  <td className="text-right">
                    <button onClick={() => cancelOrder(o.id)} className="text-xs text-down hover:underline">Annuler</button>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Section>

      <Section title="Historique de trades">
        {trades.length === 0 ? <Empty /> : (
          <Table headers={["Heure", "Marché", "Outcome", "Side", "Prix", "Size", "Fee"]}>
            {trades.map((f) => {
              const m = markets[f.marketId];
              return (
                <tr key={f.id} className="border-t border-hairline">
                  <td className="py-2 text-muted-foreground text-xs num">{new Date(f.ts).toLocaleTimeString()}</td>
                  <td>{m?.asset} {m?.windowMin}m</td>
                  <td className={f.outcome === "UP" ? "text-up" : "text-down"}>{f.outcome}</td>
                  <td>{f.side}</td>
                  <td className="num text-right">{Math.round(f.price * 100)}¢</td>
                  <td className="num text-right">{f.size.toFixed(0)}</td>
                  <td className="num text-right text-muted-foreground">${f.fee.toFixed(4)}</td>
                </tr>
              );
            })}
          </Table>
        )}
      </Section>

      <Section title="Positions fermées">
        {closed.length === 0 ? <Empty /> : (
          <Table headers={["Marché", "Outcome", "PnL réalisé"]}>
            {closed.map((p) => {
              const m = markets[p.marketId];
              return (
                <tr key={`${p.marketId}-${p.outcome}-c`} className="border-t border-hairline">
                  <td className="py-2">{m?.asset} {m?.windowMin}m</td>
                  <td className={p.outcome === "UP" ? "text-up" : "text-down"}>{p.outcome}</td>
                  <td className={`num text-right ${p.realizedPnl >= 0 ? "text-up" : "text-down"}`}>${p.realizedPnl.toFixed(2)}</td>
                </tr>
              );
            })}
          </Table>
        )}
      </Section>

      <div className="pt-4">
        <button
          onClick={() => { if (confirm("Réinitialiser le portefeuille à $10,000 ?")) { reset(); toast("Portefeuille reset"); }}}
          className="text-xs text-muted-foreground hover:text-down"
        >
          Réinitialiser le portefeuille
        </button>
      </div>
    </div>
  );
}

function Stat({ title, value, sub, accent }: { title: string; value: string; sub?: string; accent?: "up" | "down" }) {
  return (
    <div className="rounded-lg border border-hairline bg-surface p-4">
      <div className="text-[10px] uppercase text-muted-foreground tracking-wide">{title}</div>
      <div className={`num text-xl font-bold ${accent === "up" ? "text-up" : accent === "down" ? "text-down" : ""}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-hairline bg-surface p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase text-muted-foreground tracking-wide">
            {headers.map((h, i) => (
              <th key={i} className={`py-1 ${i === 0 ? "text-left" : i > 1 ? "text-right" : "text-left"}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Empty() {
  return <div className="text-xs text-muted-foreground py-3">Rien ici pour le moment.</div>;
}
