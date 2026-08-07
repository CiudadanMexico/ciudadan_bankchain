const express = require("express")
const Transaction = require("../core/transaction")

function createAPI(blockchain, state) {
  const app = express()
  app.use(express.json())

  app.get("/balance/:address", (req, res) => {
    res.json({ balance: state.getBalance(req.params.address) })
  })

  app.post("/transfer", (req, res) => {
    const { from, to, amount } = req.body
    const tx = new Transaction("TRANSFER", from, to, amount)
    blockchain.addTransaction(tx)
    res.json({ status: "tx added", tx })
  })

  app.post("/produce", (req, res) => {
    const block = blockchain.produceBlock()
    res.json(block)
  })

  return app
}

module.exports = createAPI
