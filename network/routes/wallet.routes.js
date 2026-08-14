const express = require("express")
const router = express.Router()

const wallet = require("../controllers/wallet.controller")
const requireAdmin = require("../middlewares/requireAdmin")
const createRateLimit = require("../middlewares/rateLimit")

const adminRateLimit = createRateLimit({
  max: Number(process.env.RATE_LIMIT_ADMIN_MAX || 20),
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000)
})

router.get("/", wallet.info)
router.get("/:address/:token", wallet.balance)
router.post("/mint-test", requireAdmin, adminRateLimit, wallet.mintTest)

module.exports = router
