const { test } = require("node:test")
const assert = require("node:assert")

const { normalizeTx } = require("../core/txFormat")
const { hashTransaction } = require("../core/crypto")
const { createWallet, signTransaction } = require("../testWallet")

function flatTx(wallet, overrides = {}) {
  return {
    type: "transfer",
    from: wallet.address,
    to: "0x1111111111111111111111111111111111111111",
    amount: "10",
    token: "LABORY",
    nonce: 0,
    publicKey: wallet.publicKey,
    timestamp: Date.now(),
    ...overrides
  }
}

test("normalizeTx: pasa la forma plana sin cambios", () => {
  const tx = flatTx(createWallet())
  assert.deepStrictEqual(normalizeTx(tx), tx)
})

test("normalizeTx: une payload + signature en la forma plana", () => {
  const wallet = createWallet()
  const tx = flatTx(wallet)
  const signature = signTransaction(tx, wallet.privateKey)
  const wrapped = { payload: { ...tx, signature: undefined }, signature }
  delete wrapped.payload.signature

  const normalized = normalizeTx(wrapped)
  assert.strictEqual(normalized.type, "transfer")
  assert.strictEqual(normalized.from, wallet.address)
  assert.strictEqual(normalized.signature, signature)
})

test("normalizeTx: wrapper sin signature es inválido", () => {
  const tx = flatTx(createWallet())
  assert.throws(
    () => normalizeTx({ payload: { ...tx, signature: undefined } }),
    /MISSING_SIGNATURE/
  )
})

test("normalizeTx: body vacío es inválido", () => {
  assert.throws(() => normalizeTx(null), /MISSING_TRANSACTION/)
  assert.throws(() => normalizeTx({}), /MISSING_TRANSACTION/)
})

test("wrapper firma el payload y verifica igual que la forma plana", () => {
  const wallet = createWallet()
  const tx = flatTx(wallet)
  const hash = hashTransaction(tx)
  const signature = signTransaction(tx, wallet.privateKey)

  assert.strictEqual(signature.length > 0, true)
  assert.strictEqual(hash.length, 64)
})
