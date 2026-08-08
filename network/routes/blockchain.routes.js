const express = require("express")
const router = express.Router()

const bc = require("../controllers/blockchain.controller")
const requireAdmin = require("../middlewares/requireAdmin")
const createRateLimit = require("../middlewares/rateLimit")

const adminRateLimit = createRateLimit({
  max: Number(process.env.RATE_LIMIT_ADMIN_MAX || 20),
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000)
})

router.get("/chain", bc.getChain)
router.get("/mempool", bc.getMempool)
router.get("/health", bc.health)
router.get("/audit", requireAdmin, adminRateLimit, bc.audit)
router.get("/tx/:address", bc.getHistory)
router.post("/mine", requireAdmin, adminRateLimit, bc.mine)
router.post("/block/apply", requireAdmin, adminRateLimit, bc.applyExternalBlock)
router.get("/ledger/export", requireAdmin, adminRateLimit, bc.exportLedger)

module.exports = router
