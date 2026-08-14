const { test } = require("node:test")
const assert = require("node:assert")
const controller = require("../network/controllers/wallet.controller")

function mockReqRes() {
  const req = { params: {}, blockchain: {} }
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this }
  }
  return { req, res }
}

test("wallet.balance: responde balance y nonce de una wallet", () => {
  const { req, res } = mockReqRes()
  req.params = { address: "0x" + "a".repeat(40), token: "LABORY" }
  req.blockchain = {
    getBalance: () => 100,
    getNonce: () => 7
  }
  controller.balance(req, res)
  assert.strictEqual(res.body.success, true)
  assert.strictEqual(res.body.data.address, "0x" + "a".repeat(40))
  assert.strictEqual(res.body.data.token, "LABORY")
  assert.strictEqual(res.body.data.balance, 100)
  assert.strictEqual(res.body.data.nonce, 7)
})

test("wallet.balance: dirección inválida responde 400", () => {
  const { req, res } = mockReqRes()
  req.params = { address: "no-es-hex", token: "LABORY" }
  controller.balance(req, res)
  assert.strictEqual(res.statusCode, 400)
  assert.strictEqual(res.body.error, "INVALID_ADDRESS")
})
