/**
 * Persistence layer for sim-store.
 * Handles server-side state (SQLite via API routes) and IndexedDB migration.
 */

export async function fetchAppState(): Promise<unknown> {
  try {
    const res = await fetch("/api/state");
    if (!res.ok) return null;
    const data = await res.json();
    return data.state;
  } catch (err) {
    console.error("Failed to fetch app state from server:", err);
    return null;
  }
}

export async function saveAppState(state: unknown): Promise<void> {
  try {
    await fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state }),
    });
  } catch (err) {
    console.error("Failed to save app state to server:", err);
  }
}

export async function saveBookSnapshots(books: unknown): Promise<void> {
  try {
    await fetch("/api/state/snapshot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ books, ts: Date.now() }),
    });
  } catch (err) {
    console.error("Failed to save book snapshots to server:", err);
  }
}

function readIndexedDbAppState(): Promise<unknown> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    const request = indexedDB.open("polysim-polymarket-v1", 1);
    request.onerror = () => resolve(null);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("app_state")) {
        db.close();
        return resolve(null);
      }
      try {
        const tx = db.transaction("app_state", "readonly");
        const getReq = tx.objectStore("app_state").get("current");
        getReq.onerror = () => resolve(null);
        getReq.onsuccess = () => {
          resolve(getReq.result || null);
          db.close();
        };
      } catch {
        resolve(null);
        db.close();
      }
    };
  });
}

export async function performIndexedDbMigration(): Promise<unknown> {
  if (typeof window === "undefined") return null;
  const localState = await readIndexedDbAppState();
  if (!localState || Object.keys(localState as Record<string, unknown>).length === 0) return null;
  
  try {
    const res = await fetch("/api/state/migrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: localState }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.ok && data.migrated) {
        // Migration successful, delete indexedDB to avoid running it again
        indexedDB.deleteDatabase("polysim-polymarket-v1");
        console.log("Successfully migrated local IndexedDB data to server SQLite and deleted local DB.");
      }
      return localState;
    }
  } catch (err) {
    console.error("Error during IndexedDB migration:", err);
  }
  return null;
}
