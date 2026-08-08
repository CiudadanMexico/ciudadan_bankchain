// index.js
require("dotenv").config()
const path = require("path")
const loadOrCreateWallet = require("./utils/nodeWallet")
const Blockchain = require("./core/blockchain")
const Store = require("./core/store")
const createAPI = require("./network/api")
const createPayoutScheduler = require("./network/payoutScheduler")
const createAutoMiner = require("./network/autoMiner")
const createTokenPayoutRunner = require("./network/tokenPayoutRunner")
const createStrapiSyncRunner = require("./network/strapiSyncRunner")

const PORT = process.env.PORT || 3001
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "data", "ledger.sqlite")
const BLOCK_TIME_MS = parseInt(process.env.BLOCK_TIME_MS, 10) || 6000

// 🔐 Nodo: carga o genera nodeWallet (puede imprimir privateKey la primera vez)
const nodeWallet = loadOrCreateWallet()
console.log("Node Address:", nodeWallet.address)

// 💾 Persistencia (snapshot + blocks) en SQLite
const store = new Store(DB_PATH)
console.log(`Ledger DB: ${DB_PATH}`)

// ⛓ Inicializar blockchain PASANDO nodeWallet (necesitamos privateKey para firmar bloques)
const blockchain = new Blockchain(nodeWallet, store)

// 📅 Scheduler de payouts recurrentes
const stopPayoutScheduler = createPayoutScheduler(blockchain)

// ⛏ Auto-minado: cada BLOCK_TIME_MS mina el mempool si hay transacciones
const stopAutoMiner = createAutoMiner(blockchain, BLOCK_TIME_MS)

// 💰 Runner de payouts de tokens de inversión (CIT)
const stopTokenRunner = createTokenPayoutRunner(blockchain)

// 🔄 Sync opcional de agencias desde Strapi (STRAPI_URL + STRAPI_SYNC_INTERVAL_MS)
const stopStrapiSync = createStrapiSyncRunner(
  blockchain,
  Number(process.env.STRAPI_SYNC_INTERVAL_MS) || 0
)

// 🚀 API modular (wallet, tx, blockchain, assets, payouts)
const app = createAPI(blockchain, nodeWallet)

app.listen(PORT, () => {
  console.log(`Node running on port ${PORT} (auto-mine cada ${BLOCK_TIME_MS}ms)`)
})

function shutdown() {
  stopPayoutScheduler()
  stopAutoMiner()
  stopTokenRunner()
  stopStrapiSync()
  store.close()
  process.exit(0)
}

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
