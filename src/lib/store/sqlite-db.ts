import { CREATE_TABLES_SQL } from "./sqlite-schema";
import type { Market, MarketBook, Portfolio, Order, Fill, Position, EquityPoint, TrainingSession } from "@/lib/sim/types";
import path from "path";
import fs from "fs";

// Type definitions for Database to avoid import errors
let dbInstance: any = null;

async function getDb() {
  if (typeof window !== "undefined") {
    throw new Error("Database operations are not allowed on the client side.");
  }

  if (dbInstance) return dbInstance;

  // Dynamic import of better-sqlite3 to prevent bundling issues on the client
  const Database = (await import("better-sqlite3")).default;
  
  // Use a data directory or root directory for database storage
  const dbDir = path.resolve(process.cwd(), ".data");
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  const dbPath = path.join(dbDir, "polysim.db");

  dbInstance = new Database(dbPath);
  
  // Enable WAL mode for better performance
  dbInstance.pragma("journal_mode = WAL");
  dbInstance.exec(CREATE_TABLES_SQL);

  return dbInstance;
}

export interface AppStateData {
  markets: Record<string, Market>;
  books: Record<string, MarketBook>;
  portfolio: Portfolio;
  lastTick: number;
}

export async function readAppState(): Promise<AppStateData | null> {
  const db = await getDb();

  try {
    // 1. Read app state
    const appStateRow = db.prepare("SELECT * FROM app_state WHERE key = 'current'").get() as {
      key: string;
      lastTick: number;
      cash: number;
      reserved: number;
    } | undefined;

    if (!appStateRow) return null;

    // 2. Read markets
    const marketRows = db.prepare("SELECT * FROM markets").all() as any[];
    const markets: Record<string, Market> = {};
    for (const row of marketRows) {
      markets[row.id] = {
        id: row.id,
        slug: row.slug,
        question: row.question,
        conditionId: row.conditionId,
        asset: row.asset,
        windowMin: row.windowMin,
        startDate: row.startDate,
        endDate: row.endDate,
        closed: Boolean(row.closed),
        active: Boolean(row.active),
        archived: Boolean(row.archived),
        status: row.status,
        state: row.state,
        outcomes: JSON.parse(row.outcomes),
        outcomeLabels: JSON.parse(row.outcomeLabels),
        outcomePrices: JSON.parse(row.outcomePrices),
        clobTokenIds: JSON.parse(row.clobTokenIds),
        tokens: JSON.parse(row.tokens),
        orderMinSize: row.orderMinSize,
        tickSize: row.tickSize,
        feeRateBps: row.feeRateBps,
        feeSchedule: row.feeSchedule ? JSON.parse(row.feeSchedule) : undefined,
        volume: row.volume,
        liquidity: row.liquidity,
        resolvedOutcome: row.resolvedOutcome || undefined,
        source: row.source,
        updatedAt: row.updatedAt,
      };
    }

    // 3. Read books
    const bookRows = db.prepare("SELECT * FROM books").all() as any[];
    const books: Record<string, MarketBook> = {};
    for (const row of bookRows) {
      books[row.marketId] = {
        marketId: row.marketId,
        conditionId: row.conditionId,
        UP: JSON.parse(row.UP),
        DOWN: JSON.parse(row.DOWN),
        shadowUP: row.shadowUP ? JSON.parse(row.shadowUP) : undefined,
        shadowDOWN: row.shadowDOWN ? JSON.parse(row.shadowDOWN) : undefined,
        updatedAt: row.updatedAt,
        source: row.source,
      } as MarketBook;
    }

    // 4. Read portfolio details
    const orderRows = db.prepare("SELECT * FROM orders").all() as any[];
    const orders: Order[] = orderRows.map((row) => ({
      id: row.id,
      marketId: row.marketId,
      tokenId: row.tokenId,
      outcome: row.outcome,
      side: row.side,
      type: row.type,
      limitPrice: row.limitPrice !== null ? row.limitPrice : undefined,
      expiresAt: row.expiresAt !== null ? row.expiresAt : undefined,
      size: row.size,
      filled: row.filled,
      avgFillPrice: row.avgFillPrice,
      postOnly: Boolean(row.postOnly),
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      feesPaid: row.feesPaid,
      grossProceeds: row.grossProceeds,
      rejectionReason: row.rejectionReason || undefined,
      cancelledRemainder: row.cancelledRemainder !== null ? row.cancelledRemainder : undefined,
    }));

    const fillRows = db.prepare("SELECT * FROM fills").all() as any[];
    const fills: Fill[] = fillRows.map((row) => ({
      id: row.id,
      orderId: row.orderId,
      marketId: row.marketId,
      tokenId: row.tokenId,
      outcome: row.outcome,
      side: row.side,
      price: row.price,
      size: row.size,
      fee: row.fee,
      feeRateBps: row.feeRateBps,
      ts: row.ts,
    }));

    const positionRows = db.prepare("SELECT * FROM positions").all() as any[];
    const positions: Position[] = positionRows.map((row) => ({
      marketId: row.marketId,
      tokenId: row.tokenId,
      outcome: row.outcome,
      size: row.size,
      avgPrice: row.avgPrice,
      realizedPnl: row.realizedPnl,
      feesPaid: row.feesPaid,
      redeemable: Boolean(row.redeemable),
      redeemed: Boolean(row.redeemed),
    }));

    const equityRows = db.prepare("SELECT * FROM equity_points ORDER BY ts ASC").all() as any[];
    const equity: EquityPoint[] = equityRows.map((row) => ({
      ts: row.ts,
      equity: row.equity,
      cash: row.cash,
      grossPnl: row.grossPnl,
      netPnl: row.netPnl,
    }));

    const sessionRows = db.prepare("SELECT * FROM sessions ORDER BY startedAt ASC").all() as any[];
    const sessions: TrainingSession[] = sessionRows.map((row) => ({
      id: row.id,
      startedAt: row.startedAt,
      endedAt: row.endedAt !== null ? row.endedAt : undefined,
      label: row.label,
    }));

    const portfolio: Portfolio = {
      cash: appStateRow.cash,
      reserved: appStateRow.reserved,
      positions,
      orders,
      fills,
      equity,
      sessions,
    };

    return {
      markets,
      books,
      portfolio,
      lastTick: appStateRow.lastTick,
    };
  } catch (error) {
    console.error("Error reading app state from SQLite:", error);
    throw error;
  }
}

export async function writeAppState(state: AppStateData): Promise<void> {
  const db = await getDb();

  // Run in a single transaction for atomicity and high speed
  const runTx = db.transaction(() => {
    // 1. Save general app state
    db.prepare(`
      INSERT OR REPLACE INTO app_state (key, lastTick, cash, reserved)
      VALUES ('current', ?, ?, ?)
    `).run(state.lastTick, state.portfolio.cash, state.portfolio.reserved);

    // 2. Save markets
    const insertMarket = db.prepare(`
      INSERT OR REPLACE INTO markets (
        id, slug, question, conditionId, asset, windowMin, startDate, endDate,
        closed, active, archived, status, state, outcomes, outcomeLabels,
        outcomePrices, clobTokenIds, tokens, orderMinSize, tickSize, feeRateBps,
        feeSchedule, volume, liquidity, resolvedOutcome, source, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const m of Object.values(state.markets)) {
      insertMarket.run(
        m.id,
        m.slug,
        m.question,
        m.conditionId,
        m.asset,
        m.windowMin,
        m.startDate,
        m.endDate,
        m.closed ? 1 : 0,
        m.active ? 1 : 0,
        m.archived ? 1 : 0,
        m.status,
        m.state,
        JSON.stringify(m.outcomes),
        JSON.stringify(m.outcomeLabels),
        JSON.stringify(m.outcomePrices),
        JSON.stringify(m.clobTokenIds),
        JSON.stringify(m.tokens),
        m.orderMinSize,
        m.tickSize,
        m.feeRateBps,
        m.feeSchedule ? JSON.stringify(m.feeSchedule) : null,
        m.volume,
        m.liquidity,
        m.resolvedOutcome || null,
        m.source,
        m.updatedAt
      );
    }

    // 3. Save books
    const insertBook = db.prepare(`
      INSERT OR REPLACE INTO books (marketId, conditionId, UP, DOWN, shadowUP, shadowDOWN, updatedAt, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const b of Object.values(state.books)) {
      insertBook.run(
        b.marketId,
        b.conditionId,
        JSON.stringify(b.UP),
        JSON.stringify(b.DOWN),
        b.shadowUP ? JSON.stringify(b.shadowUP) : null,
        b.shadowDOWN ? JSON.stringify(b.shadowDOWN) : null,
        b.updatedAt,
        b.source
      );
    }

    // 4. Save Portfolio - Clear first to prevent orphaned records, then insert
    db.prepare("DELETE FROM orders").run();
    const insertOrder = db.prepare(`
      INSERT INTO orders (
        id, marketId, tokenId, outcome, side, type, limitPrice, expiresAt,
        size, filled, avgFillPrice, postOnly, status, createdAt, updatedAt, feesPaid,
        grossProceeds, rejectionReason, cancelledRemainder
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const o of state.portfolio.orders) {
      insertOrder.run(
        o.id,
        o.marketId,
        o.tokenId,
        o.outcome,
        o.side,
        o.type,
        o.limitPrice !== undefined ? o.limitPrice : null,
        o.expiresAt !== undefined ? o.expiresAt : null,
        o.size,
        o.filled,
        o.avgFillPrice,
        o.postOnly ? 1 : 0,
        o.status,
        o.createdAt,
        o.updatedAt,
        o.feesPaid,
        o.grossProceeds,
        o.rejectionReason || null,
        o.cancelledRemainder !== undefined ? o.cancelledRemainder : null
      );
    }

    db.prepare("DELETE FROM fills").run();
    const insertFill = db.prepare(`
      INSERT INTO fills (id, orderId, marketId, tokenId, outcome, side, price, size, fee, feeRateBps, ts)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const f of state.portfolio.fills) {
      insertFill.run(f.id, f.orderId, f.marketId, f.tokenId, f.outcome, f.side, f.price, f.size, f.fee, f.feeRateBps, f.ts);
    }

    db.prepare("DELETE FROM positions").run();
    const insertPosition = db.prepare(`
      INSERT INTO positions (marketId, tokenId, outcome, size, avgPrice, realizedPnl, feesPaid, redeemable, redeemed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const p of state.portfolio.positions) {
      insertPosition.run(p.marketId, p.tokenId, p.outcome, p.size, p.avgPrice, p.realizedPnl, p.feesPaid, p.redeemable ? 1 : 0, p.redeemed ? 1 : 0);
    }

    db.prepare("DELETE FROM equity_points").run();
    const insertEquity = db.prepare(`
      INSERT INTO equity_points (ts, equity, cash, grossPnl, netPnl)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const eq of state.portfolio.equity) {
      insertEquity.run(eq.ts, eq.equity, eq.cash, eq.grossPnl, eq.netPnl);
    }

    db.prepare("DELETE FROM sessions").run();
    const insertSession = db.prepare(`
      INSERT INTO sessions (id, startedAt, endedAt, label)
      VALUES (?, ?, ?, ?)
    `);
    for (const s of state.portfolio.sessions) {
      insertSession.run(s.id, s.startedAt, s.endedAt !== undefined ? s.endedAt : null, s.label);
    }
  });

  try {
    runTx();
  } catch (error) {
    console.error("Error writing app state to SQLite:", error);
    throw error;
  }
}

export async function saveBookSnapshot(marketId: string, book: MarketBook, ts: number): Promise<void> {
  const db = await getDb();

  try {
    db.prepare(`
      INSERT INTO book_snapshots (marketId, ts, book)
      VALUES (?, ?, ?)
    `).run(marketId, ts, JSON.stringify(book));

    // Prune old snapshots (keep last 400 for each market or total)
    // Keep last 400 total
    const countRow = db.prepare("SELECT COUNT(*) as cnt FROM book_snapshots").get() as { cnt: number };
    if (countRow.cnt > 400) {
      const excess = countRow.cnt - 400;
      db.prepare(`
        DELETE FROM book_snapshots 
        WHERE id IN (SELECT id FROM book_snapshots ORDER BY ts ASC LIMIT ?)
      `).run(excess);
    }
  } catch (error) {
    console.error("Error saving book snapshot to SQLite:", error);
  }
}
