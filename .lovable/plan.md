

# Polymarket Crypto Up/Down — Paper Trading Simulator

A faithful clone of Polymarket's crypto 5m / 15m Up-or-Down markets, frontend-only, with live BTC/ETH/SOL prices, a deterministic local matching engine, simulated order book, portfolio, and market resolution. No backend, no auth — everything persists in localStorage so the user can close the tab and come back.

Because the brief is large, this plan covers **V1** — the playable core end-to-end (Browse → Market Detail → Order ticket → Portfolio → Resolution → Redemption). Replay/backtesting, full unit-test suite, simulation-speed mode, and extra order types beyond GTC/FOK/market are scoped as **V2**.

## V1 scope

**Markets**
- BTC, ETH, SOL — Up/Down — 5 min and 15 min windows
- New market auto-opens every 5/15 min boundary; previous one resolves
- Each market has: `priceToBeat` (price at window open), `currentPrice`, `closeAt`, `state` (open → resolving → resolved → redeemable)
- Resolution: `currentPrice > priceToBeat` → Up wins (pays 1), else Down wins

**Price feed**
- Binance public WebSocket `wss://stream.binance.com:9443/ws/btcusdt@trade` (+ eth, sol) — no key needed, runs in browser
- Auto-reconnect with exponential backoff, monotonic timestamps, stale detection

**Order book simulation**
- Each outcome (Up / Down) has bids/asks, prices 1¢–99¢
- Synthetic market makers seed depth around a fair price derived from time-to-close + price distance vs `priceToBeat` (logistic model)
- Book updates every ~500ms; reacts to user fills (consumes liquidity, replenishes over time)
- Display: midpoint by default, last-trade if spread > 10¢ — exactly like Polymarket

**Matching engine (deterministic)**
- Order types V1: **Market** (marketable limit), **Limit GTC**, **FOK**
- Post-only flag, cancel single / cancel all
- Partial fills, walks the book level by level
- Taker fee: `fee = size × 0.07 × p × (1-p)`, rounded to 5 decimals; maker fee = 0
- Reserved balance for resting orders, balance validation, tick size 1¢, min size $1

**Portfolio**
- Cash balance (start $10,000 paper USD)
- Positions: avgPrice, size, currentValue (size × midpoint), cashPnl, percentPnl, realizedPnl
- Open orders list with cancel
- Trade history
- Redeemable positions after resolution → one-click redeem (winning token → $1, losing → $0)

**UI (hybrid dark trader)**
- Routes:
  - `/` Browse — grid of active markets, search, filter by asset / window (5m vs 15m), sort by volume/ending-soon
  - `/market/$id` Market Detail — header (asset, price to beat, current price, countdown), price chart (live line), order book table, order ticket (right rail desktop / bottom sheet mobile), recent trades, related markets
  - `/portfolio` — Open positions, closed positions, open orders, trade history, redeemable card
- Live activity ticker (fills + book updates)
- Dense, monospace numbers, semantic green/red, single accent color, near-black canvas

## Design system

- Canvas `#0b0e11`, surface `#161a1f`, hairline `#222831`
- Accent `#f5a524` (Polymarket-orange feel, BTC-ish, but unique)
- Up green `#0ecb81`, Down red `#f6465d`
- Type: **Inter** body, **JetBrains Mono** for all numerics (tabular)
- Components: shadcn primitives, custom OrderBook, OrderTicket, PriceChart (recharts), Countdown, MarketCard
- Mobile-first dense layout, sticky order ticket on desktop

## Technical architecture

```text
src/
  lib/
    sim/
      types.ts                 — Market, Order, Fill, Position, OrderBook, Trade, Portfolio
      pricing.ts               — fair-price model (logistic on log-return + time decay)
      orderbook.ts             — generate/refresh synthetic depth around fair price
      matching.ts              — deterministic engine: market, GTC, FOK, fees, partial fills
      portfolio.ts             — avgPrice, PnL, redeem logic
      resolution.ts            — window scheduling, resolve markets at closeAt
      fixtures.ts              — seed markets so app works before WS connects
    feed/
      binance-ws.ts            — multi-symbol WS client, reconnect, last-price store
    store/
      sim-store.ts             — zustand store (markets, books, portfolio, orders)
      persist.ts               — localStorage hydration/serialization
  components/
    market/                    — MarketCard, OrderBook, OrderTicket, PriceChart,
                                 Countdown, ResolutionBadge, ActivityFeed
    ui/                        — shadcn
  routes/
    __root.tsx                 — shell, header, theme, providers
    index.tsx                  — Browse
    market.$marketId.tsx       — Market Detail
    portfolio.tsx              — Portfolio
```

**Tick loop**: a single `requestAnimationFrame`-throttled tick (~4 Hz) advances the simulation: pulls latest price from Binance store, recomputes fair price for each open market, updates book, matches resting orders that became crossable, checks for window close → resolution. Deterministic given (priceStream, userActions).

**State**: zustand with `persist` middleware → localStorage. Live BTC/ETH/SOL prices are NOT persisted (re-subscribe on load).

**Packages to add**: `zustand`, `recharts`, `@fontsource/inter`, `@fontsource/jetbrains-mono`, `clsx` (already), `date-fns`.

## V1 acceptance

1. Open app → see live BTC/ETH/SOL 5m and 15m markets with live countdown and live prices
2. Click a market → see chart, book, ticket, last trade & midpoint
3. Place market $5 Up → fills against synthetic asks → position appears with PnL updating live
4. Place a limit at 25¢ → shows in open orders → can cancel
5. Wait until close → market resolves → position shows redeemable → click redeem → cash credited
6. Refresh tab → portfolio, history, open orders preserved

## Out of scope (V2)

- Replay/backtesting layer, snapshot archive
- GTD / FAK / additional sports/politics markets
- Simulation-speed control
- Full vitest unit-test suite for engine
- Order book WebSocket abstraction (currently in-process)
- Multi-account / leaderboard

Once V1 is approved I'll build it in one pass, then we iterate on V2.
