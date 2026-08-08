const { test } = require("node:test")
const assert = require("node:assert")
const os = require("os")
const path = require("path")
const fs = require("fs")

const Blockchain = require("../core/blockchain")
const Store = require("../core/store")
const { createWallet } = require("../testWallet")
const { NATIVE_TOKEN, RESERVE_ADDRESS, TREASURY_ADDRESS } = require("../config/economic")

function tmpDb() {
  return path.join(os.tmpdir(), `ledger-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`)
}

function cleanup(dbPath) {
  for (const f of [dbPath, dbPath + "-wal", dbPath + "-shm"]) {
    fs.rmSync(f, { force: true })
  }
}

const CONTRACT = {
  id: "cit-2x",
  name: "Ciudadan 2x",
  factorTarget: 2,
  payoutFrequency: "weekly",
  fixedRate: 0.1,
  variableRate: 0.05,
  commissionRate: 0.1,
  minAmount: 100,
  maxAmount: 100000
}

function setup() {
  const dbPath = tmpDb()
  const store = new Store(dbPath)
  const bc = new Blockchain(createWallet(), store)
  bc.registerTokenContract(CONTRACT)
  return { dbPath, store, bc }
}

test("registerTokenContract valida factorTarget y frecuencias", () => {
  const { dbPath, bc } = setup()
  assert.throws(() => bc.registerTokenContract({ ...CONTRACT, factorTarget: 5 }), /INVALID_FACTOR_TARGET/)
  assert.throws(() => bc.registerTokenContract({ ...CONTRACT, payoutFrequency: "anual" }), /INVALID_PAYOUT_FREQUENCY/)
  assert.throws(() => bc.registerTokenContract({ ...CONTRACT, commissionRate: 1.5 }), /INVALID_RATE_COMMISSIONRATE/)
  const rec = bc.registerTokenContract({ ...CONTRACT, id: "cit-3x", factorTarget: 3 })
  assert.strictEqual(rec.factorTarget, 3)
  cleanup(dbPath)
})

test("invest: debita al dueño, bloquea en reserve y crea posición", () => {
  const { dbPath, bc } = setup()
  const owner = createWallet()

  bc.mint(owner.address, 1000, NATIVE_TOKEN)
  const { position } = bc.invest({ owner: owner.address, contractId: CONTRACT.id, amount: 500 })

  assert.strictEqual(position.principal, 500)
  assert.strictEqual(position.matured, false)
  assert.strictEqual(bc.getBalance(owner.address, NATIVE_TOKEN), 500)
  assert.strictEqual(bc.getBalance(RESERVE_ADDRESS, NATIVE_TOKEN), 500)
  assert.strictEqual(bc.listTokenPositions(owner.address).length, 1)
  cleanup(dbPath)
})

test("invest: rechaza saldo insuficiente y montos fuera de rango", () => {
  const { dbPath, bc } = setup()
  const owner = createWallet()
  bc.mint(owner.address, 50, NATIVE_TOKEN)

  assert.throws(() => bc.invest({ owner: owner.address, contractId: CONTRACT.id, amount: 500 }), /INSUFFICIENT_BALANCE/)
  assert.throws(() => bc.invest({ owner: owner.address, contractId: CONTRACT.id, amount: 10 }), /BELOW_MIN_AMOUNT/)
  assert.throws(() => bc.invest({ owner: owner.address, contractId: "nope", amount: 500 }), /UNKNOWN_TOKEN_CONTRACT/)
  cleanup(dbPath)
})

test("processTokenPayouts: paga rendimiento fijo+variable con comisión", () => {
  const { dbPath, bc } = setup()
  const owner = createWallet()

  bc.mint(owner.address, 1000, NATIVE_TOKEN)
  bc.mint(TREASURY_ADDRESS, 1000, NATIVE_TOKEN)
  const { position } = bc.invest({ owner: owner.address, contractId: CONTRACT.id, amount: 1000 })

  // rendimiento esperado: 1000 * (0.10 + 0.05) * (1 - 0.10) = 135
  const after = Date.now() + require("../config/economic").WEEKLY_MS + 1
  const result = bc.processTokenPayouts({ now: after })

  assert.strictEqual(result.payouts.length, 1)
  assert.strictEqual(result.payouts[0].paid, 135)
  assert.strictEqual(result.payouts[0].matured, false)

  const updated = bc.listTokenPositions(owner.address)[0]
  assert.strictEqual(updated.totalPayout, 135)
  assert.strictEqual(bc.getBalance(owner.address, NATIVE_TOKEN), 135)
  cleanup(dbPath)
})

test("processTokenPayouts: madura al alcanzar factorTarget y devuelve el principal", () => {
  const { dbPath, bc } = setup()
  const owner = createWallet()

  bc.mint(owner.address, 1000, NATIVE_TOKEN)
  bc.mint(TREASURY_ADDRESS, 5000, NATIVE_TOKEN)
  const { position } = bc.invest({ owner: owner.address, contractId: CONTRACT.id, amount: 1000 })

  // factorTarget 2 → yieldTarget = 1000. con 135/periodo ≈ 8 períodos
  const WEEKLY = require("../config/economic").WEEKLY_MS
  const start = position.lastPayoutAt
  for (let i = 1; i <= 8; i++) {
    bc.processTokenPayouts({ now: start + i * WEEKLY + 1 })
  }

  const updated = bc.listTokenPositions(owner.address)[0]
  assert.strictEqual(updated.matured, true)
  assert.strictEqual(updated.totalPayout, 1000) // cap en yieldTarget

  // total recibido: rendimientos (1000) + principal devuelto (1000) = 2000 = 2x
  assert.strictEqual(bc.getBalance(owner.address, NATIVE_TOKEN), 2000)
  assert.strictEqual(bc.getBalance(RESERVE_ADDRESS, NATIVE_TOKEN), 0)
  cleanup(dbPath)
})

test("processTokenPayouts: rechaza si tesorería no tiene fondos", () => {
  const { dbPath, bc } = setup()
  const owner = createWallet()

  bc.mint(owner.address, 1000, NATIVE_TOKEN)
  bc.invest({ owner: owner.address, contractId: CONTRACT.id, amount: 1000 }) // sin fondos en tesorería

  const after = Date.now() + require("../config/economic").WEEKLY_MS + 1
  assert.throws(() => bc.processTokenPayouts({ now: after }), /INSUFFICIENT_TREASURY/)
  cleanup(dbPath)
})

test("contratos y posiciones persisten tras reabrir la BD", () => {
  const dbPath = tmpDb()
  try {
    const owner = createWallet()

    const store1 = new Store(dbPath)
    const bc1 = new Blockchain(createWallet(), store1)
    bc1.registerTokenContract(CONTRACT)
    bc1.mint(owner.address, 1000, NATIVE_TOKEN)
    bc1.invest({ owner: owner.address, contractId: CONTRACT.id, amount: 300 })
    store1.close()

    const store2 = new Store(dbPath)
    const bc2 = new Blockchain(createWallet(), store2)
    assert.strictEqual(bc2.listTokenContracts().length, 1)
    const positions = bc2.listTokenPositions(owner.address)
    assert.strictEqual(positions.length, 1)
    assert.strictEqual(positions[0].principal, 300)
    store2.close()
  } finally {
    cleanup(dbPath)
  }
})
