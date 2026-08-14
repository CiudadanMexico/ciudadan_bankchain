const express = require("express")

const { logger } = require("./middlewares/logger")
const walletRoutes = require("./routes/wallet.routes")
const transactionRoutes = require("./routes/transaction.routes")
const blockchainRoutes = require("./routes/blockchain.routes")
const assetRoutes = require("./routes/asset.routes")
const payoutRoutes = require("./routes/payout.routes")
const paymentRoutes = require("./routes/payment.routes")
const agencyRoutes = require("./routes/agency.routes")
const tokenRoutes = require("./routes/token.routes")

function createAPI(blockchain, nodeWallet) {
  const app = express()
  app.use(express.json({ limit: "100kb" }))

  app.use(logger)

  app.use((req, res, next) => {
    req.blockchain = blockchain
    req.nodeWallet = nodeWallet
    next()
  })

  app.use("/wallet", walletRoutes)
  app.use("/tx", transactionRoutes)
  app.use("/", blockchainRoutes)
  app.use("/assets", assetRoutes)
  app.use("/payouts", payoutRoutes)
  app.use("/payments", paymentRoutes)
  app.use("/agencies", agencyRoutes)
  app.use("/tokens", tokenRoutes)

  return app
}

module.exports = createAPI
