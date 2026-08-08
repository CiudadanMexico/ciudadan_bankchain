const crypto = require("crypto")

function safeEqual(a, b) {
  const ba = Buffer.from(String(a))
  const bb = Buffer.from(String(b))
  if (ba.length !== bb.length) return false
  return crypto.timingSafeEqual(ba, bb)
}

function requireAdmin(req, res, next) {
  const token = process.env.ADMIN_TOKEN

  if (!token) {
    return res.status(503).json({ success: false, error: "ADMIN_NOT_CONFIGURED" })
  }

  if (!safeEqual(req.get("x-admin-token") || "", token)) {
    return res.status(401).json({ success: false, error: "UNAUTHORIZED" })
  }

  next()
}

module.exports = requireAdmin
