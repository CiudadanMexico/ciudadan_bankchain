// core/syncStrapi.js
// Sync de identidades desde Strapi → tabla de agencias de bankchain.
// Desacoplado de la red: recibe fetchFn y config para poder testear con mocks.

const { assertAddress } = require("./amounts")

const DEFAULT_CONFIG = {
  url: process.env.STRAPI_URL || "",
  token: process.env.STRAPI_TOKEN || "",
  endpoint: process.env.STRAPI_AGENCIA_ENDPOINT || "/api/agencias",
  field: process.env.STRAPI_NIVEL_SUBSIDIO_FIELD || "nivel_subsidio",
  defaultLevel: Number(process.env.STRAPI_NIVEL_SUBSIDIO_DEFAULT) || 0,
  pageSize: Number(process.env.STRAPI_PAGE_SIZE) || 100
}

async function fetchPage(fetchFn, config, page) {
  const url =
    `${config.url}${config.endpoint}` +
    `?pagination[page]=${page}&pagination[pageSize]=${config.pageSize}`
  const headers = { "Content-Type": "application/json" }
  if (config.token) headers.Authorization = `Bearer ${config.token}`

  const res = await fetchFn(url, { headers })
  if (!res.ok) {
    throw new Error(`STRAPI_HTTP_${res.status}`)
  }
  return res.json()
}

/**
 * Sincroniza las agencias desde Strapi en la tabla de agencias de bankchain.
 * Retorna { fetched, synced, skipped, errors }.
 * @param {object} blockchain  instancia con setAgency/listAgencies
 * @param {object} opts        { fetch, config }
 */
async function syncAgenciesFromStrapi(blockchain, opts = {}) {
  if (!blockchain || typeof blockchain.setAgency !== "function") {
    throw new Error("BLOCKCHAIN_REQUIRED")
  }

  const fetchFn = opts.fetch || global.fetch
  if (typeof fetchFn !== "function") throw new Error("FETCH_UNAVAILABLE")

  const config = { ...DEFAULT_CONFIG, ...(opts.config || {}) }
  if (!config.url) throw new Error("STRAPI_URL_REQUIRED")

  const summary = { fetched: 0, synced: 0, skipped: 0, errors: [] }
  let page = 1
  let totalPages = 1
  let items = []

  do {
    const json = await fetchPage(fetchFn, config, page)
    items = (json && json.data) || []
    totalPages = (json && json.meta && json.meta.pagination && json.meta.pagination.pageCount) || 1

    for (const item of items) {
      const attrs = (item && item.attributes) || {}
      const rawAddress = attrs.wallet_address || attrs.walletAddress
      summary.fetched++

      if (!rawAddress) {
        summary.skipped++
        continue
      }

      let address
      try {
        address = assertAddress(rawAddress)
      } catch (err) {
        summary.skipped++
        continue
      }

      const rawLevel = attrs[config.field]
      const nivel_subsidio =
        Number.isInteger(rawLevel) && rawLevel >= 0 ? rawLevel : config.defaultLevel

      blockchain.setAgency({
        address,
        agencia_id: String(item.id != null ? item.id : rawAddress),
        nivel_subsidio
      })
      summary.synced++
    }

    page++
  } while (page <= totalPages && items.length > 0)

  return summary
}

module.exports = { syncAgenciesFromStrapi, DEFAULT_CONFIG }
