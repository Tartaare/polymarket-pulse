import type { OutcomeBook } from "@/lib/sim/types";
import { midpoint, spread } from "@/lib/sim/orderbook";

export function OrderBookTable({ book, accent }: { book: OutcomeBook; accent: "up" | "down" }) {
  const mid = midpoint(book);
  const sp = spread(book);
  const accentText = accent === "up" ? "text-up" : "text-down";
  const totalBids = book.bids.reduce((a, l) => a + l.size, 0);
  const totalAsks = book.asks.reduce((a, l) => a + l.size, 0);
  const maxSize = Math.max(totalBids, totalAsks, 1);

  // asks shown reversed (highest first), bids highest first
  const asksDesc = [...book.asks].reverse();

  return (
    <div className="text-xs">
      <div className="grid grid-cols-3 gap-2 text-[10px] uppercase text-muted-foreground border-b border-hairline pb-1 mb-1">
        <span>Price</span>
        <span className="text-right">Shares</span>
        <span className="text-right">Total $</span>
      </div>
      <div className="space-y-px max-h-[140px] overflow-auto scrollbar-thin">
        {asksDesc.map((l) => {
          const w = Math.min(100, (l.size / maxSize) * 100);
          return (
            <Row key={`a-${l.price}`} price={l.price} size={l.size} color="text-down" bg="bg-down/10" width={w} />
          );
        })}
      </div>
      <div className="flex items-center justify-between border-y border-hairline py-1 my-1">
        <span className={`num font-semibold ${accentText}`}>
          {mid != null ? `${Math.round(mid * 100)}¢` : "—"}
        </span>
        <span className="text-[10px] text-muted-foreground">
          spread {sp != null ? `${Math.round(sp * 100)}¢` : "—"}
        </span>
      </div>
      <div className="space-y-px max-h-[140px] overflow-auto scrollbar-thin">
        {book.bids.map((l) => {
          const w = Math.min(100, (l.size / maxSize) * 100);
          return (
            <Row key={`b-${l.price}`} price={l.price} size={l.size} color="text-up" bg="bg-up/10" width={w} />
          );
        })}
      </div>
    </div>
  );
}

function Row({ price, size, color, bg, width }: { price: number; size: number; color: string; bg: string; width: number }) {
  return (
    <div className="relative grid grid-cols-3 gap-2 num py-0.5 px-1">
      <div className={`absolute inset-y-0 right-0 ${bg}`} style={{ width: `${width}%` }} />
      <span className={`relative ${color}`}>{Math.round(price * 100)}¢</span>
      <span className="relative text-right">{Math.round(size)}</span>
      <span className="relative text-right text-muted-foreground">${(size * price).toFixed(2)}</span>
    </div>
  );
}
