const express = require("express")

const walletRoutes = require("./routes/wallet.routes")
const transactionRoutes = require("./routes/transaction.routes")
const blockchainRoutes = require("./routes/blockchain.routes")
const assetRoutes = require("./routes/asset.routes")

function createAPI(blockchain, nodeWallet) {
  const app = express()
  app.use(express.json())

  // Inyectamos blockchain y nodeWallet en req
  app.use((req, res, next) => {
    req.blockchain = blockchain
    req.nodeWallet = nodeWallet
    next()
  })

  app.use("/wallet", walletRoutes)
  app.use("/tx", transactionRoutes)
  app.use("/", blockchainRoutes)
  app.use("/assets", assetRoutes)

  return app
}

module.exports = createAPI
