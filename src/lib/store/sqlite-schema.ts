export const CREATE_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    lastTick INTEGER,
    cash REAL,
    reserved REAL
  );

  CREATE TABLE IF NOT EXISTS markets (
    id TEXT PRIMARY KEY,
    slug TEXT,
    question TEXT,
    conditionId TEXT,
    asset TEXT,
    windowMin INTEGER,
    startDate INTEGER,
    endDate INTEGER,
    closed INTEGER,
    active INTEGER,
    archived INTEGER,
    status TEXT,
    state TEXT,
    outcomes TEXT,
    outcomeLabels TEXT,
    outcomePrices TEXT,
    clobTokenIds TEXT,
    tokens TEXT,
    orderMinSize REAL,
    tickSize REAL,
    feeRateBps REAL,
    feeSchedule TEXT,
    volume REAL,
    liquidity REAL,
    resolvedOutcome TEXT,
    source TEXT,
    updatedAt INTEGER
  );

  CREATE TABLE IF NOT EXISTS books (
    marketId TEXT PRIMARY KEY,
    conditionId TEXT,
    UP TEXT,
    DOWN TEXT,
    shadowUP TEXT,
    shadowDOWN TEXT,
    updatedAt INTEGER,
    source TEXT
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    marketId TEXT,
    tokenId TEXT,
    outcome TEXT,
    side TEXT,
    type TEXT,
    limitPrice REAL,
    expiresAt INTEGER,
    size REAL,
    filled REAL,
    avgFillPrice REAL,
    postOnly INTEGER,
    status TEXT,
    createdAt INTEGER,
    updatedAt INTEGER,
    feesPaid REAL,
    grossProceeds REAL,
    rejectionReason TEXT,
    cancelledRemainder REAL
  );

  CREATE TABLE IF NOT EXISTS fills (
    id TEXT PRIMARY KEY,
    orderId TEXT,
    marketId TEXT,
    tokenId TEXT,
    outcome TEXT,
    side TEXT,
    price REAL,
    size REAL,
    fee REAL,
    feeRateBps REAL,
    ts INTEGER
  );

  CREATE TABLE IF NOT EXISTS positions (
    marketId TEXT,
    tokenId TEXT,
    outcome TEXT,
    size REAL,
    avgPrice REAL,
    realizedPnl REAL,
    feesPaid REAL,
    redeemable INTEGER,
    redeemed INTEGER,
    PRIMARY KEY (marketId, tokenId)
  );

  CREATE TABLE IF NOT EXISTS equity_points (
    ts INTEGER PRIMARY KEY,
    equity REAL,
    cash REAL,
    grossPnl REAL,
    netPnl REAL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    startedAt INTEGER,
    endedAt INTEGER,
    label TEXT
  );

  CREATE TABLE IF NOT EXISTS book_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    marketId TEXT,
    ts INTEGER,
    book TEXT
  );
`;
