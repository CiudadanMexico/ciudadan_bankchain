const { syncAgenciesFromStrapi } = require("../core/syncStrapi")

function createStrapiSyncRunner(blockchain, intervalMs = 0) {
  if (!intervalMs || intervalMs <= 0) return () => {}

  const timer = setInterval(async () => {
    try {
      const summary = await syncAgenciesFromStrapi(blockchain)
      if (summary.synced > 0) {
        console.log(`[strapi-sync] ${summary.synced} agencia(s) sincronizadas`)
      }
    } catch (err) {
      console.error(`[strapi-sync] ${err.message}`)
    }
  }, intervalMs)

  timer.unref()
  return () => clearInterval(timer)
}

module.exports = createStrapiSyncRunner
