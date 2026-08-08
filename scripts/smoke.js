require("dotenv").config()
const { createWallet, signTransaction } = require("../testWallet")
const { TREASURY_ADDRESS } = require("../config/economic")

const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:9917"
const ADMIN_TOKEN = process.env.ADMIN_TOKEN

async function call(method, path, body) {
  const headers = { "Content-Type": "application/json" }
  if (ADMIN_TOKEN) headers["x-admin-token"] = ADMIN_TOKEN
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  })
  const json = await res.json()
  return { status: res.status, json }
}

function signTransfer(from, to, amount, nonce) {
  const tx = {
    type: "transfer",
    from: from.address,
    to: to.address,
    amount,
    token: "LABORY",
    nonce,
    timestamp: Date.now(),
    publicKey: from.publicKey
  }
  tx.signature = signTransaction(tx, from.privateKey)
  return tx
}

function check(name, cond, detail) {
  if (!cond) {
    console.error(`✖ ${name} ${detail ? JSON.stringify(detail) : ""}`)
    process.exitCode = 1
  } else {
    console.log(`✔ ${name}`)
  }
}

async function main() {
  const A = createWallet()
  const B = createWallet()

  // wallet del nodo
  const node = await call("GET", "/wallet")
  check("GET /wallet responde", node.status === 200 && node.json.data.address, node.json)

  // mint sin token de admin → rechazado
  const anonMint = await fetch(BASE + "/wallet/mint-test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: A.address, amount: 1, token: "LABORY" })
  }).then((r) => r.json())
  check("mint-test sin token rechazado", anonMint.success === false && (anonMint.error === "UNAUTHORIZED" || anonMint.error === "ADMIN_NOT_CONFIGURED"), anonMint)

  // mint con monto float → debe rechazar
  const badMint = await call("POST", "/wallet/mint-test", { address: A.address, amount: 1.5, token: "LABORY" })
  check("mint float rechazado", badMint.status === 400 && badMint.json.error === "AMOUNT_NOT_INTEGER", badMint.json)

  // mint correcto
  const mintA = await call("POST", "/wallet/mint-test", { address: A.address, amount: 1000, token: "LABORY" })
  check("mint A 1000", mintA.json.success && mintA.json.balance === 1000, mintA.json)

  // transfer float → rechazado
  const badTx = signTransfer(A, B, 1.5, 0)
  const badSend = await call("POST", "/tx/send", badTx)
  check("send float rechazado", badSend.status === 400 && badSend.json.error === "AMOUNT_NOT_INTEGER", badSend.json)

  // verify de tx válida
  const goodTx = signTransfer(A, B, 150, 0)
  const verify = await call("POST", "/tx/verify", goodTx)
  check("verify tx válida", verify.json.data.valid === true, verify.json)

  // send + mine
  const send = await call("POST", "/tx/send", goodTx)
  check("send A→B 150", send.json.success === true, send.json)
  const mine = await call("POST", "/mine")
  check("mine", mine.json.success === true && mine.json.data.index >= 1, mine.json)

  // balances: A=850, B=150, nodo=4 (reward), tesorería=1
  const assetsA = await call("GET", "/assets/" + A.address)
  check("A balance 850", assetsA.json.data && assetsA.json.data.LABORY === 850, assetsA.json)
  const assetsB = await call("GET", "/assets/" + B.address)
  check("B balance 150", assetsB.json.data && assetsB.json.data.LABORY === 150, assetsB.json)
  const assetsNode = await call("GET", "/assets/" + node.json.data.address)
  check("nodo recibió reward 4", assetsNode.json.data && assetsNode.json.data.LABORY === 4, assetsNode.json)
  const assetsTreasury = await call("GET", "/assets/" + TREASURY_ADDRESS)
  check("tesorería recibió 1", assetsTreasury.json.data && assetsTreasury.json.data.LABORY === 1, assetsTreasury.json)

  // mint a tesorería y payout
  const mintT = await call("POST", "/wallet/mint-test", { address: TREASURY_ADDRESS, amount: 100, token: "LABORY" })
  check("mint tesorería 100", mintT.json.success === true, mintT.json)
  const payout = await call("POST", "/payouts/run", { recipients: [{ address: B.address, amount: 10 }], token: "LABORY" })
  check("payout 10 a B", payout.json.success === true && payout.json.data.recipients === 1, payout.json)
  const assetsB2 = await call("GET", "/assets/" + B.address)
  check("B balance 160 tras payout", assetsB2.json.data && assetsB2.json.data.LABORY === 160, assetsB2.json)
  const assetsT2 = await call("GET", "/assets/" + TREASURY_ADDRESS)
  check("tesorería 91 tras payout", assetsT2.json.data && assetsT2.json.data.LABORY === 91, assetsT2.json)

  // payout sin fondos → rechazado
  const poorPayout = await call("POST", "/payouts/run", { recipients: [{ address: B.address, amount: 999999 }], token: "LABORY" })
  check("payout insuficiente rechazado", poorPayout.status === 400 && poorPayout.json.error === "INSUFFICIENT_TREASURY", poorPayout.json)

  // programar payout
  const at = new Date(Date.now() + 60000).toISOString()
  const schedule = await call("POST", "/payouts/schedule", { at, recipients: [{ address: A.address, amount: 1 }], token: "LABORY", repeat: "once" })
  check("schedule creado", schedule.json.success === true && schedule.json.data.nextRunAt, schedule.json)
  const list = await call("GET", "/payouts")
  check("list schedules", list.json.data.schedules.length === 1, list.json)

  console.log(process.exitCode ? "SMOKE: FALLÓ" : "SMOKE: OK")
}

main().catch((err) => {
  console.error("SMOKE ERROR:", err.message)
  process.exitCode = 1
})
