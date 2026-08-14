// scripts/client.js
// Mini-cliente del ledger, como lo usaría un usuario final (sin token admin).
//
//   node scripts/client.js new <etiqueta>                 crea una wallet y la guarda
//   node scripts/client.js list                          wallets guardadas
//   node scripts/client.js balances <etiqueta>           saldos por token
//   node scripts/client.js wallet <etiqueta> <TOKEN>     balance + nonce
//   node scripts/client.js tx <etiqueta>                 historial
//   node scripts/client.js send <origen> <destino> <cantidad> <TOKEN>
//                                                        transferencia firmada (cliente)
//
// Las llaves se guardan en demo/clients.json (gitignored; NO compartir).

require("dotenv").config()
const fs = require("fs")
const http = require("http")
const path = require("path")
const { ec: EC } = require("elliptic")
const { hashTransaction } = require("../core/crypto")

const ec = new EC("secp256k1")
const CLIENTS_FILE = path.join(__dirname, "..", "demo", "clients.json")
const PORT = process.env.PORT || 6633
const BASE = `http://localhost:${PORT}`

function loadClients() {
  if (!fs.existsSync(CLIENTS_FILE)) return {}
  return JSON.parse(fs.readFileSync(CLIENTS_FILE, "utf8"))
}

function saveClients(clients) {
  fs.mkdirSync(path.dirname(CLIENTS_FILE), { recursive: true })
  fs.writeFileSync(CLIENTS_FILE, JSON.stringify(clients, null, 2))
}

function createWallet() {
  const key = ec.genKeyPair()
  const privateKey = key.getPrivate("hex")
  const publicKey = key.getPublic("hex")
  const address = "0x" + require("crypto-js/sha256")(publicKey).toString().slice(-40)
  return { privateKey, publicKey, address }
}

function httpRequest(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(BASE + urlPath, { method, headers: { "Content-Type": "application/json" } }, (res) => {
      let data = ""
      res.on("data", (chunk) => (data += chunk))
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) })
        } catch (err) {
          reject(new Error("Respuesta no válida del nodo"))
        }
      })
    })
    req.on("error", reject)
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

function sign(payload, privateKey) {
  const hash = hashTransaction(payload)
  return ec.keyFromPrivate(privateKey).sign(hash).toDER("hex")
}

async function cmdNew(label) {
  const clients = loadClients()
  const wallet = createWallet()
  clients[label] = wallet
  saveClients(clients)
  console.log(`Wallet "${label}" creada:`)
  console.log(`  address:    ${wallet.address}`)
  console.log(`  publicKey:  ${wallet.publicKey}`)
  console.log(`  privateKey: ${wallet.privateKey}`)
  console.log("Guárdala bajo llave; solo la dirección es pública.")
}

function cmdList() {
  const clients = loadClients()
  const labels = Object.keys(clients)
  if (labels.length === 0) {
    console.log("Sin wallets guardadas. Crea una con: node scripts/client.js new <etiqueta>")
    return
  }
  console.log("Wallets guardadas:")
  for (const label of labels) {
    console.log(`  ${label} -> ${clients[label].address}`)
  }
}

async function cmdBalances(label) {
  const clients = loadClients()
  if (!clients[label]) throw new Error(`No existe la wallet "${label}".`)
  const { status, body } = await httpRequest("GET", `/assets/${clients[label].address}`)
  console.log(`Saldos de ${label} (${clients[label].address}):`)
  if (status !== 200) return console.log(JSON.stringify(body, null, 2))
  const data = body.data || {}
  if (Object.keys(data).length === 0) return console.log("  (sin saldos)")
  for (const [token, balance] of Object.entries(data)) {
    console.log(`  ${token}: ${balance}`)
  }
}

async function cmdWallet(label, token) {
  const clients = loadClients()
  if (!clients[label]) throw new Error(`No existe la wallet "${label}".`)
  const { status, body } = await httpRequest("GET", `/wallet/${clients[label].address}/${token}`)
  if (status !== 200) return console.log(JSON.stringify(body, null, 2))
  const d = body.data
  console.log(`${label} | ${d.token}: ${d.balance} (nonce ${d.nonce})`)
}

async function cmdTx(label) {
  const clients = loadClients()
  if (!clients[label]) throw new Error(`No existe la wallet "${label}".`)
  const { status, body } = await httpRequest("GET", `/tx/${clients[label].address}`)
  if (status !== 200) return console.log(JSON.stringify(body, null, 2))
  const data = body.data || []
  if (data.length === 0) return console.log("Sin transacciones todavía.")
  for (const t of data) {
    const dir = t.type === "mint" ? "mint ->" : `${t.from === clients[label].address ? "->" : "<-"}`
    console.log(`  [blk ${t.blockIndex}] ${t.type.padEnd(9)} ${dir} ${t.to}  ${t.amount} ${t.token}`)
  }
  console.log(`  Total: ${data.length}`)
}

async function cmdSend(fromLabel, toRef, amount, token) {
  const clients = loadClients()
  if (!clients[fromLabel]) throw new Error(`No existe la wallet origen "${fromLabel}".`)
  const to = clients[toRef] ? clients[toRef].address : toRef
  const from = clients[fromLabel]

  const res = await httpRequest("GET", `/wallet/${from.address}/${token}`)
  if (res.status !== 200) throw new Error(res.body.error || "No se pudo leer el nonce")
  const { nonce } = res.body.data

  const payload = {
    type: "transfer",
    from: from.address,
    to,
    amount: String(amount),
    token,
    nonce,
    publicKey: from.publicKey,
    timestamp: Date.now()
  }
  const signature = sign(payload, from.privateKey)
  const body = { payload, signature }

  console.log(`Firmando ${amount} ${token} de "${fromLabel}" -> ${to} (nonce ${nonce})...`)
  const sent = await httpRequest("POST", "/tx/send", body)
  if (sent.status !== 200) {
    console.log(`Rechazada (${sent.status}):`, sent.body.error)
    return
  }
  console.log(`Aceptada. Bloque en curso.`)
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2)
  try {
    if (cmd === "new") return await cmdNew(args[0])
    if (cmd === "list") return cmdList()
    if (cmd === "balances") return await cmdBalances(args[0])
    if (cmd === "wallet") return await cmdWallet(args[0], args[1])
    if (cmd === "tx") return await cmdTx(args[0])
    if (cmd === "send") return await cmdSend(args[0], args[1], args[2], args[3])
    console.log("Uso: node scripts/client.js <new|list|balances|wallet|tx|send> ...")
  } catch (err) {
    console.error("Error:", err.message)
    process.exitCode = 1
  }
}

main()
