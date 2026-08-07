const express = require("express")
const router = express.Router()

const txController = require("../controllers/transaction.controller")
const validateTx = require("../middlewares/validateTx")

router.post("/send", validateTx, txController.send)
router.post("/verify", txController.verify)

module.exports = router
