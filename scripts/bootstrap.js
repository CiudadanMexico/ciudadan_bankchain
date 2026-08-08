// Bootstrap: siembra saldos iniciales on-chain y los persiste en el ledger.
require("dotenv").config()
const path = require("path")
const Blockchain = require("../core/blockchain")
const Store = require("../core/store")
const loadOrCreateWallet = require("../utils/nodeWallet")

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data", "ledger.sqlite")

const store = new Store(DB_PATH)
const nodeWallet = loadOrCreateWallet()
const blockchain = new Blockchain(nodeWallet, store)

const SEEDS = [
  { address: nodeWallet.address, amount: 100000, token: "LABORY" },
  { address: nodeWallet.address, amount: 50000, token: "CIT" }
]

for (const s of SEEDS) {
  blockchain.mint(s.address, s.amount, s.token)
}

console.log("Bootstrap completado:")
console.log("  nodo LABORY:", blockchain.getBalance(nodeWallet.address, "LABORY"))
console.log("  nodo CIT:   ", blockchain.getBalance(nodeWallet.address, "CIT"))
console.log("  bloques:    ", blockchain.chain.length)

store.close()
