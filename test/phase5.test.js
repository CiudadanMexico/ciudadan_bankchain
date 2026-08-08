const { test } = require("node:test")
const assert = require("node:assert")
const os = require("os")
const path = require("path")
const fs = require("fs")

const Blockchain = require("../core/blockchain")
const Store = require("../core/store")
const { createWallet } = require("../testWallet")

function tmpDb() {
  return path.join(os.tmpdir(), `ledger-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`)
}

function cleanup(dbPath) {
  for (const f of [dbPath, dbPath + "-wal", dbPath + "-shm"]) {
    fs.rmSync(f, { force: true })
  }
}

test("exportLedger: contiene formato, version, bloques, balances y nonces", () => {
  const dbPath = tmpDb()
  const store = new Store(dbPath)
  const bc = new Blockchain(createWallet(), store)

  const owner = createWallet()
  bc.mint(owner.address, 100, "LABORY")

  const exportData = bc.exportLedger()

  assert.strictEqual(exportData.format, "ciudadan-ledger-export")
  assert.strictEqual(exportData.version, 1)
  assert.strictEqual(exportData.contract, "CONTRATO_API v1")
  assert.ok(exportData.exportedAt)
  assert.strictEqual(exportData.latestBlock, 1)
  assert.strictEqual(exportData.blocks, 2) // genesis + bloque de mint
  assert.strictEqual(exportData.balances[owner.address].LABORY, 100)
  assert.strictEqual(exportData.chain.length, 2)
  assert.strictEqual(exportData.chain[0].hash, "GENESIS_BLOCK")
  assert.strictEqual(exportData.chain[1].transactions[0].type, "mint")
  assert.ok(Array.isArray(exportData.aux.agencies))

  cleanup(dbPath)
})

test("exportLedger: la cadena exportada es suficiente para reconstruir balances", () => {
  const dbPath = tmpDb()
  try {
    const owner = createWallet()

    const store1 = new Store(dbPath)
    const bc1 = new Blockchain(createWallet(), store1)
    bc1.mint(owner.address, 100, "LABORY")
    bc1.mint(owner.address, 50, "LABORY")
    const exportData = bc1.exportLedger()
    store1.close()

    // reconstrucción en un nodo nuevo: solo con la cadena exportada
    const store2 = new Store(tmpDb())
    const bc2 = new Blockchain(createWallet(), store2)
    for (const block of exportData.chain) {
      for (const tx of block.transactions) {
        bc2.applyTransaction(tx)
      }
    }
    assert.strictEqual(bc2.getBalance(owner.address, "LABORY"), 150)
    store2.close()
  } finally {
    cleanup(dbPath)
  }
})
