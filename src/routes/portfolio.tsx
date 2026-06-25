import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { positionPnl } from "@/lib/sim/portfolio";
import { selectMidpoint, useSimStore } from "@/lib/store/sim-store";

export const Route = createFileRoute("/portfolio")({
  head: () => ({
    meta: [
      { title: "Portfolio — Polysim" },
      { name: "description", content: "Positions, PnL net, ordres paper et historique IndexedDB." },
    ],
  }),
  component: PortfolioPage,
});

function PortfolioPage() {
  const portfolio = useSimStore((state) => state.portfolio);
  const markets = useSimStore((state) => state.markets);
  const books = useSimStore((state) => state.books);
  const cancelOrder = useSimStore((state) => state.cancelOrder);
  const cancelAll = useSimStore((state) => state.cancelAll);
  const redeem = useSimStore((state) => state.redeem);
  const reset = useSimStore((state) => state.resetPortfolio);
  const exportFillsCsv = useSimStore((state) => state.exportFillsCsv);

  const openPositions = portfolio.positions.filter((position) => position.size > 0 && !position.redeemable);
  const redeemable = portfolio.positions.filter((position) => position.redeemable);
  const closed = portfolio.positions.filter((position) => position.redeemed || (position.size === 0 && !position.redeemable));
  const openOrders = portfolio.orders.filter((order) => order.status === "OPEN" || order.status === "PARTIALLY_FILLED");
  const trades = [...portfolio.fills].sort((a, b) => b.ts - a.ts).slice(0, 80);
  const fees = portfolio.fills.reduce((acc, fill) => acc + fill.fee, 0);
  const realized = portfolio.positions.reduce((acc, position) => acc + position.realizedPnl, 0);
  const markedValue = openPositions.reduce((acc, position) => {
    const mid = selectMidpoint(books[position.marketId], position.outcome) ?? position.avgPrice;
    return acc + position.size * mid;
  }, 0);
  const equity = portfolio.cash + markedValue;
  const netPnl = equity - 10_000;
  const grossPnl = netPnl + fees;

  const downloadCsv = () => {
    const blob = new Blob([exportFillsCsv()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `polysim-fills-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <header className="grid gap-3 sm:grid-cols-5">
        <Stat title="Equity" value={`$${equity.toFixed(2)}`} />
        <Stat title="Cash" value={`$${portfolio.cash.toFixed(2)}`} sub={`Réservé $${portfolio.reserved.toFixed(2)}`} />
        <Stat title="PnL brut" value={`$${grossPnl.toFixed(2)}`} accent={grossPnl >= 0 ? "up" : "down"} />
        <Stat title="PnL net" value={`$${netPnl.toFixed(2)}`} accent={netPnl >= 0 ? "up" : "down"} />
        <Stat title="Frais" value={`$${fees.toFixed(5)}`} />
      </header>

      <Section title="Equity curve">
        {portfolio.equity.length < 2 ? (
          <Empty label="La courbe se construit après les premiers ticks." />
        ) : (
          <div className="flex h-24 items-end gap-1">
            {portfolio.equity.slice(-80).map((point) => {
              const min = Math.min(...portfolio.equity.map((item) => item.equity));
              const max = Math.max(...portfolio.equity.map((item) => item.equity));
              const height = max === min ? 50 : 10 + ((point.equity - min) / (max - min)) * 90;
              return <div key={point.ts} className="flex-1 rounded-sm bg-primary/80" style={{ height: `${height}%` }} title={`$${point.equity.toFixed(2)}`} />;
            })}
          </div>
        )}
      </Section>

      {redeemable.length > 0 && (
        <Section title="À racheter">
          <div className="space-y-2">
            {redeemable.map((position) => {
              const market = markets[position.marketId];
              const winner = market?.resolvedOutcome === position.outcome;
              const payout = winner ? position.size : 0;
              return (
                <div key={`${position.tokenId}-redeem`} className="flex items-center gap-3 rounded-md border border-hairline bg-surface-2 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{market?.question ?? position.marketId}</div>
                    <div className="num text-xs text-muted-foreground">{position.size.toFixed(2)} @ {Math.round(position.avgPrice * 100)}¢ · winner {market?.resolvedOutcome ?? "—"}</div>
                  </div>
                  <div className={`num font-semibold ${winner ? "text-up" : "text-down"}`}>${payout.toFixed(2)}</div>
                  <button type="button" onClick={() => { redeem(position.marketId, position.outcome); toast.success("Rachat paper appliqué"); }} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
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
          <Table headers={["Marché", "Outcome", "Shares", "Prix moyen", "Prix actuel", "Valeur", "Break-even", "PnL net"]}>
            {openPositions.map((position) => {
              const market = markets[position.marketId];
              const mid = selectMidpoint(books[position.marketId], position.outcome) ?? position.avgPrice;
              const pnl = positionPnl(position, mid);
              return (
                <tr key={position.tokenId} className="border-t border-hairline">
                  <td className="max-w-[280px] truncate py-2">
                    <Link to="/market/$marketId" params={{ marketId: position.marketId }} className="hover:text-primary">{market?.question ?? position.marketId}</Link>
                  </td>
                  <td className={position.outcome === "UP" ? "text-up" : "text-down"}>{position.outcome}</td>
                  <td className="num text-right">{position.size.toFixed(2)}</td>
                  <td className="num text-right">{Math.round(position.avgPrice * 100)}¢</td>
                  <td className="num text-right">{Math.round(mid * 100)}¢</td>
                  <td className="num text-right">${pnl.currentValue.toFixed(2)}</td>
                  <td className="num text-right">{Math.round(pnl.breakEven * 100)}¢</td>
                  <td className={`num text-right ${pnl.cashPnl >= 0 ? "text-up" : "text-down"}`}>${pnl.cashPnl.toFixed(2)}</td>
                </tr>
              );
            })}
          </Table>
        )}
      </Section>

      <Section
        title="Ordres ouverts"
        right={openOrders.length > 0 && <button type="button" onClick={() => { cancelAll(); toast("Tous les ordres ouverts sont annulés"); }} className="text-xs text-muted-foreground hover:text-foreground">Annuler tout</button>}
      >
        {openOrders.length === 0 ? <Empty /> : (
          <Table headers={["Marché", "Outcome", "Side", "Type", "Prix", "Size", "Rempli", ""]}>
            {openOrders.map((order) => {
              const market = markets[order.marketId];
              return (
                <tr key={order.id} className="border-t border-hairline">
                  <td className="max-w-[260px] truncate py-2">{market?.question ?? order.marketId}</td>
                  <td className={order.outcome === "UP" ? "text-up" : "text-down"}>{order.outcome}</td>
                  <td>{order.side}</td>
                  <td>{order.type}{order.postOnly ? " · PO" : ""}</td>
                  <td className="num text-right">{order.limitPrice != null ? `${Math.round(order.limitPrice * 100)}¢` : "—"}</td>
                  <td className="num text-right">{order.size.toFixed(2)}</td>
                  <td className="num text-right">{order.filled.toFixed(2)}</td>
                  <td className="text-right"><button type="button" onClick={() => cancelOrder(order.id)} className="text-xs text-down hover:underline">Annuler</button></td>
                </tr>
              );
            })}
          </Table>
        )}
      </Section>

      <Section
        title="Historique de trades"
        right={trades.length > 0 && <button type="button" onClick={downloadCsv} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">CSV</button>}
      >
        {trades.length === 0 ? <Empty /> : (
          <Table headers={["Heure", "Marché", "Outcome", "Side", "Prix", "Size", "Fee", "Net"]}>
            {trades.map((fill) => {
              const market = markets[fill.marketId];
              const net = fill.side === "BUY" ? -(fill.price * fill.size + fill.fee) : fill.price * fill.size - fill.fee;
              return (
                <tr key={fill.id} className="border-t border-hairline">
                  <td className="num py-2 text-xs text-muted-foreground">{new Date(fill.ts).toLocaleTimeString()}</td>
                  <td className="max-w-[260px] truncate">{market?.question ?? fill.marketId}</td>
                  <td className={fill.outcome === "UP" ? "text-up" : "text-down"}>{fill.outcome}</td>
                  <td>{fill.side}</td>
                  <td className="num text-right">{Math.round(fill.price * 100)}¢</td>
                  <td className="num text-right">{fill.size.toFixed(2)}</td>
                  <td className="num text-right text-muted-foreground">${fill.fee.toFixed(5)}</td>
                  <td className={`num text-right ${net >= 0 ? "text-up" : "text-down"}`}>${net.toFixed(2)}</td>
                </tr>
              );
            })}
          </Table>
        )}
      </Section>

      <Section title="Positions fermées">
        {closed.length === 0 ? <Empty /> : (
          <Table headers={["Marché", "Outcome", "PnL réalisé"]}>
            {closed.map((position) => {
              const market = markets[position.marketId];
              return (
                <tr key={`${position.tokenId}-closed`} className="border-t border-hairline">
                  <td className="py-2">{market?.question ?? position.marketId}</td>
                  <td className={position.outcome === "UP" ? "text-up" : "text-down"}>{position.outcome}</td>
                  <td className={`num text-right ${position.realizedPnl >= 0 ? "text-up" : "text-down"}`}>${position.realizedPnl.toFixed(2)}</td>
                </tr>
              );
            })}
          </Table>
        )}
      </Section>

      <div className="flex items-center gap-3 pt-4">
        <button type="button" onClick={() => { if (confirm("Réinitialiser le portefeuille paper à $10,000 ?")) { reset(); toast("Portefeuille reset"); } }} className="text-xs text-muted-foreground hover:text-down">
          Réinitialiser le portefeuille
        </button>
        <span className="text-xs text-muted-foreground">PnL réalisé: ${realized.toFixed(2)}</span>
      </div>
    </div>
  );
}

function Stat({ title, value, sub, accent }: { title: string; value: string; sub?: string; accent?: "up" | "down" }) {
  return (
    <div className="rounded-lg border border-hairline bg-surface p-4">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className={`num text-xl font-bold ${accent === "up" ? "text-up" : accent === "down" ? "text-down" : ""}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-hairline bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
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
          <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {headers.map((header, index) => (
              <th key={header} className={`py-1 ${index === 0 ? "text-left" : index > 1 ? "text-right" : "text-left"}`}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Empty({ label = "Rien ici pour le moment." }: { label?: string }) {
  return <div className="py-3 text-xs text-muted-foreground">{label}</div>;
}
