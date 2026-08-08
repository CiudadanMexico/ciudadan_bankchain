const { test } = require("node:test")
const assert = require("node:assert")

const requireAdmin = require("../network/middlewares/requireAdmin")
const createRateLimit = require("../network/middlewares/rateLimit")

function mockReqRes(overrides = {}) {
  const req = { get: (name) => overrides.headers && overrides.headers[name.toLowerCase()], ip: "127.0.0.1", ...overrides }
  let statusCode = 200
  const res = {
    status(code) { statusCode = code; return this },
    json(payload) { res.payload = payload; res.statusCode = statusCode },
    ...overrides.res
  }
  return { req, res }
}

test("requireAdmin rechaza sin token de admin", () => {
  const old = process.env.ADMIN_TOKEN
  process.env.ADMIN_TOKEN = "secret123"
  try {
    const { req, res } = mockReqRes()
    requireAdmin(req, res, () => assert.fail("no debería llamar next"))
    assert.strictEqual(res.payload.error, "UNAUTHORIZED")
    assert.strictEqual(res.statusCode, 401)
  } finally {
    process.env.ADMIN_TOKEN = old
  }
})

test("requireAdmin rechaza token incorrecto", () => {
  const old = process.env.ADMIN_TOKEN
  process.env.ADMIN_TOKEN = "secret123"
  try {
    const { req, res } = mockReqRes({ headers: { "x-admin-token": "wrong" } })
    requireAdmin(req, res, () => assert.fail("no debería llamar next"))
    assert.strictEqual(res.payload.error, "UNAUTHORIZED")
  } finally {
    process.env.ADMIN_TOKEN = old
  }
})

test("requireAdmin acepta token correcto y llama next", () => {
  const old = process.env.ADMIN_TOKEN
  process.env.ADMIN_TOKEN = "secret123"
  try {
    let called = false
    const { req, res } = mockReqRes({ headers: { "x-admin-token": "secret123" } })
    requireAdmin(req, res, () => { called = true })
    assert.strictEqual(called, true)
  } finally {
    process.env.ADMIN_TOKEN = old
  }
})

test("requireAdmin falla cerrado si ADMIN_TOKEN no está configurado", () => {
  const old = process.env.ADMIN_TOKEN
  delete process.env.ADMIN_TOKEN
  try {
    const { req, res } = mockReqRes()
    requireAdmin(req, res, () => assert.fail("no debería llamar next"))
    assert.strictEqual(res.payload.error, "ADMIN_NOT_CONFIGURED")
    assert.strictEqual(res.statusCode, 503)
  } finally {
    process.env.ADMIN_TOKEN = old
  }
})

test("rateLimit permite hasta max y luego 429", () => {
  const limit = createRateLimit({ max: 3, windowMs: 60000 })
  let nexts = 0
  let limited = null

  for (let i = 0; i < 5; i++) {
    const { req, res } = mockReqRes()
    res.status(429).json = function (payload) { limited = payload }
    limit(req, res, () => { nexts += 1 })
  }

  assert.strictEqual(nexts, 3)
  assert.deepStrictEqual(limited, { success: false, error: "RATE_LIMITED" })
})

test("rateLimit reinicia la ventana después de windowMs", () => {
  const limit = createRateLimit({ max: 1, windowMs: 50 })
  let nexts = 0

  const hit = () => {
    const { req, res } = mockReqRes()
    res.status(429).json = () => {}
    limit(req, res, () => { nexts += 1 })
  }

  hit()
  hit() // excede → limitado
  const sleeps = () => new Promise((r) => setTimeout(r, 60))
  return sleeps().then(() => {
    hit() // nueva ventana → pasa
    assert.strictEqual(nexts, 2)
  })
})
