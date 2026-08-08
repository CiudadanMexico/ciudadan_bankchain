const { DatabaseSync } = require("node:sqlite")
const fs = require("fs")
const path = require("path")

class Store {
  constructor(dbPath) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    this.db = new DatabaseSync(dbPath)
    this.db.exec("PRAGMA journal_mode = WAL;")
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS blocks (
        idx INTEGER PRIMARY KEY,
        data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS snapshot (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        balances TEXT NOT NULL,
        nonces TEXT NOT NULL,
        block_index INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS schedules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS agencies (
        address TEXT PRIMARY KEY,
        agencia_id TEXT NOT NULL,
        nivel_subsidio INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS claims (
        origin_id TEXT PRIMARY KEY,
        block_index INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS token_contracts (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS token_positions (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL
      );
    `)
  }

  loadBlocks() {
    const rows = this.db.prepare("SELECT data FROM blocks ORDER BY idx").all()
    return rows.map((r) => JSON.parse(r.data))
  }

  saveBlock(block) {
    this.db
      .prepare("INSERT OR REPLACE INTO blocks (idx, data) VALUES (?, ?)")
      .run(block.index, JSON.stringify(block))
  }

  loadSnapshot() {
    const row = this.db.prepare("SELECT * FROM snapshot WHERE id = 1").get()
    if (!row) return null
    return {
      balances: JSON.parse(row.balances),
      nonces: JSON.parse(row.nonces),
      blockIndex: row.block_index
    }
  }

  saveSnapshot(state) {
    this.db
      .prepare(
        "INSERT OR REPLACE INTO snapshot (id, balances, nonces, block_index, updated_at) VALUES (1, ?, ?, ?, ?)"
      )
      .run(
        JSON.stringify(state.balances),
        JSON.stringify(state.nonces),
        state.latestBlockIndex,
        Date.now()
      )
  }

  saveSchedule(schedule) {
    const r = this.db
      .prepare("INSERT INTO schedules (data) VALUES (?)")
      .run(JSON.stringify(schedule))
    return { id: Number(r.lastInsertRowid), ...schedule }
  }

  updateSchedule(schedule) {
    if (schedule.id == null) throw new Error("MISSING_SCHEDULE_ID")
    this.db
      .prepare("UPDATE schedules SET data = ? WHERE id = ?")
      .run(JSON.stringify(schedule), schedule.id)
    return schedule
  }

  loadSchedules() {
    return this.db
      .prepare("SELECT id, data FROM schedules ORDER BY id")
      .all()
      .map((r) => ({ id: r.id, ...JSON.parse(r.data) }))
  }

  deleteSchedule(id) {
    this.db.prepare("DELETE FROM schedules WHERE id = ?").run(id)
  }

  upsertAgency({ address, agencia_id, nivel_subsidio }) {
    this.db
      .prepare(
        `INSERT INTO agencies (address, agencia_id, nivel_subsidio, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(address) DO UPDATE SET
           agencia_id = excluded.agencia_id,
           nivel_subsidio = excluded.nivel_subsidio,
           updated_at = excluded.updated_at`
      )
      .run(address, agencia_id, nivel_subsidio, Date.now())
    return this.getAgency(address)
  }

  getAgency(address) {
    const row = this.db.prepare("SELECT * FROM agencies WHERE address = ?").get(address)
    if (!row) return null
    return {
      address: row.address,
      agencia_id: row.agencia_id,
      nivel_subsidio: row.nivel_subsidio
    }
  }

  listAgencies() {
    return this.db.prepare("SELECT * FROM agencies ORDER BY address").all().map((row) => ({
      address: row.address,
      agencia_id: row.agencia_id,
      nivel_subsidio: row.nivel_subsidio
    }))
  }

  saveClaim(originId, blockIndex) {
    this.db
      .prepare("INSERT OR IGNORE INTO claims (origin_id, block_index, created_at) VALUES (?, ?, ?)")
      .run(String(originId), blockIndex, Date.now())
  }

  hasClaim(originId) {
    const row = this.db.prepare("SELECT 1 FROM claims WHERE origin_id = ?").get(String(originId))
    return Boolean(row)
  }

  saveTokenContract(contract) {
    this.db
      .prepare("INSERT OR REPLACE INTO token_contracts (id, data) VALUES (?, ?)")
      .run(contract.id, JSON.stringify(contract))
    return contract
  }

  getTokenContract(id) {
    const row = this.db.prepare("SELECT data FROM token_contracts WHERE id = ?").get(id)
    return row ? JSON.parse(row.data) : null
  }

  listTokenContracts() {
    return this.db
      .prepare("SELECT data FROM token_contracts ORDER BY id")
      .all()
      .map((r) => JSON.parse(r.data))
  }

  saveTokenPosition(position) {
    this.db
      .prepare("INSERT OR REPLACE INTO token_positions (id, data) VALUES (?, ?)")
      .run(position.id, JSON.stringify(position))
    return position
  }

  listTokenPositions(owner) {
    const rows = this.db.prepare("SELECT data FROM token_positions ORDER BY rowid").all()
    return rows.map((r) => JSON.parse(r.data)).filter((p) => !owner || p.owner === owner)
  }

  close() {
    this.db.close()
  }
}

module.exports = Store
