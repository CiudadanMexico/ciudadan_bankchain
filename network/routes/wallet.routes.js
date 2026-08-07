const express = require("express")
const router = express.Router()

const wallet = require("../controllers/wallet.controller")
const balance = require("../controllers/balance.controller")

router.get("/", wallet.info)
router.post("/mint-test", wallet.mintTest)
router.get("/:address/:token", balance.getBalance)

module.exports = router
