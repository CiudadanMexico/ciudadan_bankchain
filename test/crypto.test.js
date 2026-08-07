const { test } = require("node:test")
const assert = require("node:assert")

const { verifySignature, deriveAddress, hashTransaction } = require("../core/crypto")
const { createWallet, signTransaction } = require("../testWallet")

function buildTx(overrides = {}) {
  const A = createWallet()
  const B = createWallet()
  const tx = {
    type: "transfer",
    from: A.address,
    to: B.address,
    amount: 150,
    token: "LABORY",
    nonce: 0,
    timestamp: Date.now(),
    publicKey: A.publicKey,
    ...overrides
  }
  const signer = overrides.signer || A.privateKey
  tx.signature = signTransaction(tx, signer)
  return tx
}

test("deriveAddress devuelve 0x + 40 hex", () => {
  const wallet = createWallet()
  const address = deriveAddress(wallet.publicKey)
  assert.match(address, /^0x[0-9a-f]{40}$/)
  assert.strictEqual(address, wallet.address)
})

test("verifySignature acepta una tx firmada correctamente", () => {
  const tx = buildTx()
  assert.strictEqual(verifySignature(tx), true)
})

test("el hash cubre nonce: alterar nonce invalida la firma", () => {
  const tx = buildTx()
  tx.nonce = 99
  assert.strictEqual(verifySignature(tx), false)
})

test("el hash cubre token: alterar token invalida la firma", () => {
  const tx = buildTx()
  tx.token = "CIT"
  assert.strictEqual(verifySignature(tx), false)
})

test("el hash cubre publicKey: alterar publicKey invalida la firma", () => {
  const tx = buildTx()
  tx.publicKey = createWallet().publicKey
  assert.strictEqual(verifySignature(tx), false)
})

test("el hash cubre amount: alterar amount invalida la firma", () => {
  const tx = buildTx()
  tx.amount = 151
  assert.strictEqual(verifySignature(tx), false)
})

test("el hash trata number y string de amount como equivalentes", () => {
  const tx = buildTx({ amount: 150 })
  assert.strictEqual(hashTransaction({ ...tx, amount: "150" }), hashTransaction(tx))
})

test("una firma con otra privateKey no valida", () => {
  const tx = buildTx({ signer: createWallet().privateKey })
  assert.strictEqual(verifySignature(tx), false)
})
