const { test } = require("node:test")
const assert = require("node:assert")
const os = require("os")
const path = require("path")
const fs = require("fs")

const Blockchain = require("../core/blockchain")
const Store = require("../core/store")
const { createWallet } = require("../testWallet")
const { syncAgenciesFromStrapi } = require("../core/syncStrapi")

function tmpDb() {
  return path.join(os.tmpdir(), `ledger-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`)
}

function cleanup(dbPath) {
  for (const f of [dbPath, dbPath + "-wal", dbPath + "-shm"]) {
    fs.rmSync(f, { force: true })
  }
}

function setup() {
  const dbPath = tmpDb()
  const store = new Store(dbPath)
  const bc = new Blockchain(createWallet(), store)
  return { dbPath, store, bc }
}

function strapiPage(records, pageCount = 1) {
  return {
    data: records,
    meta: { pagination: { pageCount } }
  }
}

function okFetch(pages) {
  const calls = []
  return {
    async fetchFn(url, opts) {
      calls.push({ url, auth: opts.headers.Authorization || null })
      const page = pages.shift()
      return { ok: true, json: async () => page }
    },
    calls
  }
}

test("syncAgenciesFromStrapi: mapea wallet_address y persiste agencias", async () => {
  const { dbPath, bc } = setup()
  const { fetchFn, calls } = okFetch([
    strapiPage([
      {
        id: 1,
        attributes: { nombre: "Agencia Norte", wallet_address: "0x4f84b6f1c3c7ba35159e7995a22d7fc6b85ad0da", nivel_subsidio: 3 }
      }
    ])
  ])

  const summary = await syncAgenciesFromStrapi(bc, {
    fetch: fetchFn,
    config: { url: "https://dev.ciudadan.org", token: "secret-token" }
  })

  assert.deepStrictEqual(summary, { fetched: 1, synced: 1, skipped: 0, errors: [] })
  const agency = bc.getAgency("0x4f84b6f1c3c7ba35159e7995a22d7fc6b85ad0da")
  assert.strictEqual(agency.agencia_id, "1")
  assert.strictEqual(agency.nivel_subsidio, 3)
  assert.ok(calls[0].url.includes("/api/agencias"))
  assert.strictEqual(calls[0].auth, "Bearer secret-token")
  cleanup(dbPath)
})

test("syncAgenciesFromStrapi: usa nivel_subsidio por defecto si el campo no existe", async () => {
  const { dbPath, bc } = setup()
  const { fetchFn } = okFetch([
    strapiPage([
      { id: 2, attributes: { nombre: "Agencia Sur", wallet_address: "0x0000000000000000000000000000000000000001" } }
    ])
  ])

  await syncAgenciesFromStrapi(bc, {
    fetch: fetchFn,
    config: { url: "https://dev.ciudadan.org", defaultLevel: 0 }
  })

  const agency = bc.getAgency("0x0000000000000000000000000000000000000001")
  assert.strictEqual(agency.nivel_subsidio, 0)
  cleanup(dbPath)
})

test("syncAgenciesFromStrapi: omite registros sin dirección válida", async () => {
  const { dbPath, bc } = setup()
  const { fetchFn } = okFetch([
    strapiPage([
      { id: 3, attributes: { nombre: "Sin wallet" } },
      { id: 4, attributes: { nombre: "Invalida", wallet_address: "no-es-direccion" } }
    ])
  ])

  const summary = await syncAgenciesFromStrapi(bc, {
    fetch: fetchFn,
    config: { url: "https://dev.ciudadan.org" }
  })

  assert.strictEqual(summary.fetched, 2)
  assert.strictEqual(summary.synced, 0)
  assert.strictEqual(summary.skipped, 2)
  assert.strictEqual(bc.listAgencies().length, 0)
  cleanup(dbPath)
})

test("syncAgenciesFromStrapi: pagina hasta agotar pageCount", async () => {
  const { dbPath, bc } = setup()
  const records1 = [1, 2].map((i) => ({
    id: i,
    attributes: { wallet_address: `0x${String(i).padStart(40, "a")}` }
  }))
  const records2 = [{ id: 3, attributes: { wallet_address: `0x${String(3).padStart(40, "a")}` } }]

  const { fetchFn, calls } = okFetch([
    strapiPage(records1, 2),
    strapiPage(records2, 2)
  ])

  const summary = await syncAgenciesFromStrapi(bc, {
    fetch: fetchFn,
    config: { url: "https://dev.ciudadan.org" }
  })

  assert.strictEqual(summary.fetched, 3)
  assert.strictEqual(summary.synced, 3)
  assert.strictEqual(calls.length, 2)
  assert.ok(calls[0].url.includes("pagination[page]=1"))
  assert.ok(calls[1].url.includes("pagination[page]=2"))
  cleanup(dbPath)
})

test("syncAgenciesFromStrapi: lanza error si Strapi responde no-ok", async () => {
  const { dbPath, bc } = setup()
  const fetchFn = async () => ({ ok: false, status: 401 })

  await assert.rejects(
    () => syncAgenciesFromStrapi(bc, { fetch: fetchFn, config: { url: "https://dev.ciudadan.org" } }),
    /STRAPI_HTTP_401/
  )
  cleanup(dbPath)
})

test("syncAgenciesFromStrapi: requiere STRAPI_URL", async () => {
  const { dbPath, bc } = setup()
  const fetchFn = async () => ({ ok: true, json: async () => ({ data: [], meta: { pagination: { pageCount: 1 } } }) })
  await assert.rejects(() => syncAgenciesFromStrapi(bc, { fetch: fetchFn, config: { url: "" } }), /STRAPI_URL_REQUIRED/)
  cleanup(dbPath)
})
