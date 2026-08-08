const express = require("express")
const router = express.Router()

const tokenController = require("../controllers/token.controller")
const requireAdmin = require("../middlewares/requireAdmin")
const createRateLimit = require("../middlewares/rateLimit")

const adminRateLimit = createRateLimit({
  max: Number(process.env.RATE_LIMIT_ADMIN_MAX || 20),
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000)
})

router.post("/contracts", requireAdmin, adminRateLimit, tokenController.createContract)
router.get("/contracts", tokenController.listContracts)
router.post("/invest", requireAdmin, adminRateLimit, tokenController.invest)
router.get("/positions", tokenController.listPositions)
router.post("/payouts/run", requireAdmin, adminRateLimit, tokenController.runPayouts)

module.exports = router
