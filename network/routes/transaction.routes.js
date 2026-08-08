const express = require("express")
const router = express.Router()

const txController = require("../controllers/transaction.controller")
const validateTx = require("../middlewares/validateTx")
const createRateLimit = require("../middlewares/rateLimit")

const txRateLimit = createRateLimit({
  max: Number(process.env.RATE_LIMIT_TX_MAX || 30),
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000)
})

router.post("/send", txRateLimit, validateTx, txController.send)
router.post("/verify", txController.verify)

module.exports = router
