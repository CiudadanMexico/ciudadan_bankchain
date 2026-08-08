function logger(req, res, next) {
  const start = Date.now()
  res.on("finish", () => {
    const ms = Date.now() - start
    console.log(
      `${new Date().toISOString()} ${req.ip} ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`
    )
  })
  next()
}

function logAction(action, details) {
  console.log(`${new Date().toISOString()} [action] ${action} ${JSON.stringify(details)}`)
}

module.exports = { logger, logAction }
