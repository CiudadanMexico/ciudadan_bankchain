function createRateLimit({ max = 60, windowMs = 60000 } = {}) {
  const hits = new Map()

  const sweep = setInterval(() => {
    const now = Date.now()
    for (const [key, bucket] of hits) {
      if (bucket.reset < now) hits.delete(key)
    }
  }, windowMs)
  sweep.unref()

  return (req, res, next) => {
    const key = req.ip
    const now = Date.now()
    const bucket = hits.get(key)

    if (!bucket || bucket.reset < now) {
      hits.set(key, { count: 1, reset: now + windowMs })
      return next()
    }

    bucket.count += 1
    if (bucket.count > max) {
      return res.status(429).json({ success: false, error: "RATE_LIMITED" })
    }
    next()
  }
}

module.exports = createRateLimit
