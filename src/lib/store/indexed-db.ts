import type { Market, MarketBook, Portfolio } from "@/lib/sim/types";

const DB_NAME = "polysim-polymarket-v1";
const DB_VERSION = 1;
const SNAPSHOT_KEY = "current";
const BOOK_SNAPSHOT_LIMIT = 400;

export interface PersistedAppState {
  markets: Record<string, Market>;
  books: Record<string, MarketBook>;
  portfolio: Portfolio;
  lastTick: number;
}

interface BookSnapshot {
  id?: number;
  marketId: string;
  ts: number;
  book: MarketBook;
}

let dbPromise: Promise<IDBDatabase> | null = null;

export async function readPersistedAppState(): Promise<Partial<PersistedAppState>> {
  if (!canUseIndexedDb()) return migrateLocalStorage();
  const db = await openDb();
  const snapshot = await get<PersistedAppState>(db, "app_state", SNAPSHOT_KEY);
  return snapshot ?? migrateLocalStorage();
}

export async function writePersistedAppState(state: PersistedAppState): Promise<void> {
  if (!canUseIndexedDb()) return;
  const db = await openDb();
  await put(db, "app_state", state, SNAPSHOT_KEY);
}

export async function saveBookSnapshots(books: Record<string, MarketBook>): Promise<void> {
  if (!canUseIndexedDb()) return;
  const db = await openDb();
  const snapshots: BookSnapshot[] = Object.values(books).map((book) => ({ marketId: book.marketId, ts: Date.now(), book }));
  await transaction(db, "book_snapshots", "readwrite", (store) => {
    for (const snapshot of snapshots) store.add(snapshot);
  });
  await pruneBookSnapshots(db);
}

function canUseIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("app_state")) db.createObjectStore("app_state");
      if (!db.objectStoreNames.contains("book_snapshots")) {
        const store = db.createObjectStore("book_snapshots", { keyPath: "id", autoIncrement: true });
        store.createIndex("by_ts", "ts");
        store.createIndex("by_market", "marketId");
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  return dbPromise;
}

function get<T>(db: IDBDatabase, storeName: string, key: IDBValidKey): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readonly").objectStore(storeName).get(key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result as T | undefined);
  });
}

function put<T>(db: IDBDatabase, storeName: string, value: T, key: IDBValidKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readwrite").objectStore(storeName).put(value, key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

function transaction(
  db: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    run(tx.objectStore(storeName));
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
  });
}

async function pruneBookSnapshots(db: IDBDatabase): Promise<void> {
  await transaction(db, "book_snapshots", "readwrite", (store) => {
    const index = store.index("by_ts");
    const countRequest = store.count();
    countRequest.onsuccess = () => {
      const overflow = countRequest.result - BOOK_SNAPSHOT_LIMIT;
      if (overflow <= 0) return;
      let deleted = 0;
      const cursorRequest = index.openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor || deleted >= overflow) return;
        cursor.delete();
        deleted += 1;
        cursor.continue();
      };
    };
  });
}

function migrateLocalStorage(): Partial<PersistedAppState> {
  if (typeof localStorage === "undefined") return {};
  const raw = localStorage.getItem("polysim-v1");
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedAppState>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
