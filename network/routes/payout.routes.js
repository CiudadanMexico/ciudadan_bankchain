const express = require("express")
const router = express.Router()

const payoutController = require("../controllers/payout.controller")
const requireAdmin = require("../middlewares/requireAdmin")
const createRateLimit = require("../middlewares/rateLimit")

const adminRateLimit = createRateLimit({
  max: Number(process.env.RATE_LIMIT_ADMIN_MAX || 20),
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000)
})

router.post("/run", requireAdmin, adminRateLimit, payoutController.run)
router.post("/schedule", requireAdmin, adminRateLimit, payoutController.schedule)
router.get("/", payoutController.list)
router.delete("/:id", requireAdmin, adminRateLimit, payoutController.cancel)

module.exports = router
