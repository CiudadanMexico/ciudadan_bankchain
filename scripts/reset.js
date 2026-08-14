// Reset: limpia el ledger (data/ledger.sqlite) para arrancar de cero.
// El nodo no debe estar corriendo. Con --wallet también borra nodeWallet.json
// (identidad del nodo, para regenerarla con una clave nueva).
require("dotenv").config()
const path = require("path")
const fs = require("fs")
const { execSync } = require("child_process")

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data", "ledger.sqlite")
const WALLET_PATH = path.join(__dirname, "..", "nodeWallet.json")

function nodeRunning() {
  try {
    execSync("pgrep -f \"node index.js\"", { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

if (nodeRunning()) {
  console.error("El nodo está corriendo. Detenlo primero (pkill -f \"node index.js\") y vuelve a intentar.")
  process.exit(1)
}

const removed = []
for (const f of [DB_PATH, DB_PATH + "-wal", DB_PATH + "-shm"]) {
  if (fs.existsSync(f)) {
    fs.rmSync(f, { force: true })
    removed.push(path.basename(f))
  }
}

if (process.argv.includes("--wallet")) {
  if (fs.existsSync(WALLET_PATH)) {
    fs.rmSync(WALLET_PATH, { force: true })
    removed.push(path.basename(WALLET_PATH))
  }
}

if (removed.length) {
  console.log("Reset completado. Eliminados: " + removed.join(", "))
  console.log("Siguiente: npm run bootstrap (opcional) y npm start")
} else {
  console.log("Nada que borrar: el ledger ya estaba limpio.")
}
