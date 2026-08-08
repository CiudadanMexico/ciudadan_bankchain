const express = require("express")
const router = express.Router()

const paymentController = require("../controllers/payment.controller")
const requireAdmin = require("../middlewares/requireAdmin")
const createRateLimit = require("../middlewares/rateLimit")

const adminRateLimit = createRateLimit({
  max: Number(process.env.RATE_LIMIT_ADMIN_MAX || 20),
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000)
})

router.post("/subsidized", requireAdmin, adminRateLimit, paymentController.subsidized)
router.post("/earn", requireAdmin, adminRateLimit, paymentController.earn)

module.exports = router
