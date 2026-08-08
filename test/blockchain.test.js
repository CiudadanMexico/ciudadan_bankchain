const { test } = require("node:test")
const assert = require("node:assert")
const os = require("os")
const path = require("path")
const fs = require("fs")

const Blockchain = require("../core/blockchain")
const Store = require("../core/store")
const { createWallet, signTransaction } = require("../testWallet")
const { BLOCK_REWARD, TREASURY_RATIO, TREASURY_ADDRESS, NATIVE_TOKEN } = require("../config/economic")

function buildSignedTx(from, to, amount, token, nonce) {
  const tx = {
    type: "transfer",
    from: from.address,
    to: to.address,
    amount,
    token,
    nonce,
    timestamp: Date.now(),
    publicKey: from.publicKey
  }
  tx.signature = signTransaction(tx, from.privateKey)
  return tx
}

function tmpDb() {
  return path.join(os.tmpdir(), `ledger-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`)
}

function cleanup(dbPath) {
  for (const f of [dbPath, dbPath + "-wal", dbPath + "-shm"]) {
    fs.rmSync(f, { force: true })
  }
}

test("mint y transfer aplican saldos", () => {
  const bc = new Blockchain()
  const A = createWallet()
  const B = createWallet()

  bc.mint(A.address, 1000, "LABORY")
  bc.addTransaction(buildSignedTx(A, B, 150, "LABORY", 0))
  bc.mineBlock()

  assert.strictEqual(bc.getBalance(A.address), 850)
  assert.strictEqual(bc.getBalance(B.address), 150)
  assert.strictEqual(bc.getNonce(A.address), 1)
})

test("mint rechaza montos float", () => {
  const bc = new Blockchain()
  const A = createWallet()
  assert.throws(() => bc.mint(A.address, 10.5), /AMOUNT_NOT_INTEGER/)
})

test("addTransaction rechaza transfer con monto float", () => {
  const bc = new Blockchain()
  const A = createWallet()
  const B = createWallet()
  bc.mint(A.address, 1000, "LABORY")
  assert.throws(() => bc.addTransaction(buildSignedTx(A, B, 10.5, "LABORY", 0)), /AMOUNT_NOT_INTEGER/)
})

test("mineBlock entrega reward al productor y tesorería", () => {
  const node = createWallet()
  const bc = new Blockchain(node)
  const A = createWallet()
  const B = createWallet()

  bc.mint(A.address, 1000, "LABORY")
  bc.addTransaction(buildSignedTx(A, B, 100, "LABORY", 0))
  bc.mineBlock()

  const treasuryShare = Math.floor(BLOCK_REWARD * TREASURY_RATIO)
  const producerShare = BLOCK_REWARD - treasuryShare

  assert.strictEqual(bc.getBalance(node.address, NATIVE_TOKEN), producerShare)
  assert.strictEqual(bc.getBalance(TREASURY_ADDRESS, NATIVE_TOKEN), treasuryShare)
})

test("mineBlock sin transacciones lanza NO_TRANSACTIONS", () => {
  const bc = new Blockchain()
  assert.throws(() => bc.mineBlock(), /NO_TRANSACTIONS/)
})

test("executePayouts debita la tesorería y emite a destinatarios", () => {
  const node = createWallet()
  const bc = new Blockchain(node)
  const B = createWallet()

  bc.mint(TREASURY_ADDRESS, 100, "LABORY")
  const block = bc.executePayouts([{ address: B.address, amount: 40 }], "LABORY")

  assert.strictEqual(bc.getBalance(TREASURY_ADDRESS, "LABORY"), 60)
  assert.strictEqual(bc.getBalance(B.address, "LABORY"), 40)
  assert.strictEqual(block.transactions.length, 1)
  assert.strictEqual(block.transactions[0].type, "payout")
})

test("executePayouts rechaza tesorería insuficiente", () => {
  const bc = new Blockchain()
  const B = createWallet()
  assert.throws(
    () => bc.executePayouts([{ address: B.address, amount: 1 }], "LABORY"),
    /INSUFFICIENT_TREASURY/
  )
})

test("persistencia: estado se restaura tras reabrir la BD", () => {
  const dbPath = tmpDb()
  try {
    const node = createWallet()
    const A = createWallet()
    const B = createWallet()

    const store1 = new Store(dbPath)
    const bc1 = new Blockchain(node, store1)

    bc1.mint(A.address, 1000, "LABORY")
    bc1.mint(B.address, 500, "LABORY")
    bc1.addTransaction(buildSignedTx(A, B, 250, "LABORY", 0))
    bc1.mineBlock()
    store1.close()

    const store2 = new Store(dbPath)
    const bc2 = new Blockchain(node, store2)

    assert.strictEqual(bc2.chain.length, bc1.chain.length)
    assert.strictEqual(bc2.getBalance(A.address), 750)
    assert.strictEqual(bc2.getBalance(B.address), 750)
    assert.strictEqual(bc2.getNonce(A.address), 1)
    store2.close()
  } finally {
    cleanup(dbPath)
  }
})

test("persistencia: replay de bloques sin snapshot válido", () => {
  const dbPath = tmpDb()
  try {
    const node = createWallet()
    const A = createWallet()
    const B = createWallet()

    const store1 = new Store(dbPath)
    const bc1 = new Blockchain(node, store1)
    bc1.mint(A.address, 1000, "LABORY")
    bc1.addTransaction(buildSignedTx(A, B, 100, "LABORY", 0))
    bc1.mineBlock()
    store1.close()

    // borrar snapshot para forzar replay desde bloques
    const store2 = new Store(dbPath)
    store2.db.exec("DELETE FROM snapshot")
    store2.close()

    const store3 = new Store(dbPath)
    const bc3 = new Blockchain(node, store3)
    assert.strictEqual(bc3.getBalance(A.address), 900)
    assert.strictEqual(bc3.getBalance(B.address), 100)
    assert.strictEqual(bc3.getNonce(A.address), 1)
    store3.close()
  } finally {
    cleanup(dbPath)
  }
})
