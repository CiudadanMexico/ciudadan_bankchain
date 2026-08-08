const { test } = require("node:test")
const assert = require("node:assert")
const os = require("os")
const path = require("path")
const fs = require("fs")

const Blockchain = require("../core/blockchain")
const Store = require("../core/store")
const { createWallet, signTransaction } = require("../testWallet")
const { NATIVE_TOKEN } = require("../config/economic")

function buildSignedTx(from, to, amount, nonce) {
  const tx = {
    type: "transfer",
    from: from.address,
    to: to.address,
    amount,
    token: NATIVE_TOKEN,
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

test("audit: estado actual coincide con el replay del ledger", () => {
  const node = createWallet()
  const bc = new Blockchain(node)
  const A = createWallet()
  const B = createWallet()

  bc.mint(A.address, 1000, NATIVE_TOKEN)
  bc.addTransaction(buildSignedTx(A, B, 150, 0))
  bc.mineBlock()

  const audit = bc.audit()
  assert.strictEqual(audit.ok, true)
  assert.strictEqual(audit.blocks, 2)
  assert.strictEqual(audit.totals[NATIVE_TOKEN], 1000 + require("../config/economic").BLOCK_REWARD)
})

test("getTransactionHistory devuelve movimientos de una wallet en orden", () => {
  const bc = new Blockchain()
  const A = createWallet()
  const B = createWallet()

  bc.mint(A.address, 1000, NATIVE_TOKEN)
  bc.addTransaction(buildSignedTx(A, B, 100, 0))
  bc.mineBlock()

  const histA = bc.getTransactionHistory(A.address)
  assert.strictEqual(histA.length, 2) // mint + transfer
  assert.strictEqual(histA[0].type, "mint")
  assert.strictEqual(histA[1].type, "transfer")

  const histB = bc.getTransactionHistory(B.address)
  assert.strictEqual(histB.length, 1)
  assert.strictEqual(histB[0].amount, 100)
})

test("pago con subsidio: usuario + agencia pagan, destino recibe el total", () => {
  const bc = new Blockchain()
  const user = createWallet()
  const dest = createWallet()
  const agency = createWallet()

  bc.setAgency({ address: agency.address, agencia_id: "ag-1", nivel_subsidio: 3 })
  bc.mint(user.address, 100, NATIVE_TOKEN)
  bc.mint(agency.address, 100, NATIVE_TOKEN)

  const block = bc.executeSubsidizedPayment({
    carteraOrigen: user.address,
    carteraDestino: dest.address,
    carteraAgencia: agency.address,
    montoLaborysUsuario: 15,
    subsidio: 45,
    token: NATIVE_TOKEN
  })

  assert.strictEqual(bc.getBalance(user.address), 85)
  assert.strictEqual(bc.getBalance(agency.address), 55)
  assert.strictEqual(bc.getBalance(dest.address), 60)
  assert.strictEqual(block.transactions.length, 2)
})

test("pago con subsidio: rechaza ratio incorrecto", () => {
  const bc = new Blockchain()
  const user = createWallet()
  const dest = createWallet()
  const agency = createWallet()

  bc.setAgency({ address: agency.address, agencia_id: "ag-1", nivel_subsidio: 3 })
  bc.mint(user.address, 100, NATIVE_TOKEN)
  bc.mint(agency.address, 100, NATIVE_TOKEN)

  assert.throws(
    () =>
      bc.executeSubsidizedPayment({
        carteraOrigen: user.address,
        carteraDestino: dest.address,
        carteraAgencia: agency.address,
        montoLaborysUsuario: 15,
        subsidio: 30, // debería ser 45 (3x15)
        token: NATIVE_TOKEN
      }),
    /SUBSIDY_RATIO_MISMATCH/
  )
})

test("pago con subsidio: rechaza agencia desconocida", () => {
  const bc = new Blockchain()
  const user = createWallet()
  const dest = createWallet()
  const agency = createWallet()

  assert.throws(
    () =>
      bc.executeSubsidizedPayment({
        carteraOrigen: user.address,
        carteraDestino: dest.address,
        carteraAgencia: agency.address,
        montoLaborysUsuario: 15,
        subsidio: 0,
        token: NATIVE_TOKEN
      }),
    /UNKNOWN_AGENCY/
  )
})

test("earn: agencia paga recompensa y origin_id no puede reutilizarse", () => {
  const dbPath = tmpDb()
  try {
    const store = new Store(dbPath)
    const bc = new Blockchain(createWallet(), store)
    const agency = createWallet()
    const worker = createWallet()

    bc.setAgency({ address: agency.address, agencia_id: "ag-2", nivel_subsidio: 0 })
    bc.mint(agency.address, 100, NATIVE_TOKEN)

    const block = bc.executeEarn({
      tipo: "tarea",
      carteraAgencia: agency.address,
      carteraDestino: worker.address,
      monto: 20,
      originId: "todo-abc-123",
      token: NATIVE_TOKEN
    })

    assert.strictEqual(block.transactions[0].type, "earn")
    assert.strictEqual(bc.getBalance(worker.address), 20)
    assert.strictEqual(bc.getBalance(agency.address), 80)

    assert.throws(
      () =>
        bc.executeEarn({
          tipo: "tarea",
          carteraAgencia: agency.address,
          carteraDestino: worker.address,
          monto: 20,
          originId: "todo-abc-123",
          token: NATIVE_TOKEN
        }),
      /ORIGIN_ALREADY_EARNED/
    )

    store.close()
  } finally {
    cleanup(dbPath)
  }
})

test("earn: rechaza tipo inválido", () => {
  const bc = new Blockchain()
  const agency = createWallet()
  const worker = createWallet()

  assert.throws(
    () =>
      bc.executeEarn({
        tipo: "otra-cosa",
        carteraAgencia: agency.address,
        carteraDestino: worker.address,
        monto: 1,
        originId: "x",
        token: NATIVE_TOKEN
      }),
    /INVALID_EARN_TYPE/
  )
})

test("agencia persiste y se restaura", () => {
  const dbPath = tmpDb()
  try {
    const agency = createWallet()

    const store1 = new Store(dbPath)
    const bc1 = new Blockchain(createWallet(), store1)
    bc1.setAgency({ address: agency.address, agencia_id: "ag-3", nivel_subsidio: 2 })
    store1.close()

    const store2 = new Store(dbPath)
    const bc2 = new Blockchain(createWallet(), store2)
    const rec = bc2.getAgency(agency.address)
    assert.strictEqual(rec.agencia_id, "ag-3")
    assert.strictEqual(rec.nivel_subsidio, 2)
    store2.close()
  } finally {
    cleanup(dbPath)
  }
})
