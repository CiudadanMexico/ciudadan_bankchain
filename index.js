// index.js
require("dotenv").config()
const loadOrCreateWallet = require("./utils/nodeWallet")
const Blockchain = require("./core/blockchain")
const createAPI = require("./network/api")

const PORT = process.env.PORT || 3001

// 🔐 Nodo: carga o genera nodeWallet (puede imprimir privateKey la primera vez)
const nodeWallet = loadOrCreateWallet()
console.log("Node Address:", nodeWallet.address)

// ⛓ Inicializar blockchain PASANDO nodeWallet (necesitamos privateKey para firmar bloques)
const blockchain = new Blockchain(nodeWallet)

// 🚀 API modular (wallet, tx, blockchain, assets)
const app = createAPI(blockchain, nodeWallet)

app.listen(PORT, () => {
  console.log(`Node running on port ${PORT}`)
})
