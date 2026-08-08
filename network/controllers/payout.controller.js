const { parseAmount, assertToken, assertAddress } = require("../../core/amounts")
const { logAction } = require("../middlewares/logger")

const REPEATS = new Set(["once", "daily", "weekly"])
const DAY_MS = 86400000

function parseScheduleAt(value) {
  let at = value
  if (typeof value === "string" && !/^\d+$/.test(value)) {
    at = Date.parse(value)
  } else {
    at = Number(value)
  }
  if (!Number.isFinite(at)) throw new Error("INVALID_SCHEDULE_AT")
  return at
}

function normalizeRecipients(recipients) {
  if (!Array.isArray(recipients) || recipients.length === 0) throw new Error("RECIPIENTS_REQUIRED")
  return recipients.map((r) => ({
    address: assertAddress(r && r.address),
    amount: parseAmount(r && r.amount)
  }))
}

exports.run = (req, res) => {
  try {
    const { recipients, token } = req.body
    const items = normalizeRecipients(recipients)
    const t = assertToken(token || "LABORY")

    const block = req.blockchain.executePayouts(items, t)
    logAction("payout.run", {
      blockIndex: block.index,
      recipients: items.length,
      total: items.reduce((s, it) => s + it.amount, 0),
      token: t
    })

    res.json({
      success: true,
      data: {
        blockIndex: block.index,
        recipients: items.length,
        total: items.reduce((s, it) => s + it.amount, 0),
        token: t
      }
    })
  } catch (err) {
    res.status(400).json({ success: false, error: err.message })
  }
}

exports.schedule = (req, res) => {
  try {
    const { at, recipients, token, repeat } = req.body
    const items = normalizeRecipients(recipients)
    const t = assertToken(token || "LABORY")
    const r = REPEATS.has(repeat) ? repeat : "once"

    const nextRunAt = parseScheduleAt(at)
    if (nextRunAt <= Date.now()) throw new Error("SCHEDULE_AT_IN_PAST")

    const store = req.blockchain.store
    if (!store) throw new Error("PERSISTENCE_DISABLED")

    const saved = store.saveSchedule({
      nextRunAt,
      recipients: items,
      token: t,
      repeat: r
    })
    logAction("payout.schedule", { id: saved.id, nextRunAt, repeat: r, recipients: items.length })

    res.json({ success: true, data: saved })
  } catch (err) {
    res.status(400).json({ success: false, error: err.message })
  }
}

exports.list = (req, res) => {
  const store = req.blockchain.store
  const schedules = store ? store.loadSchedules() : []
  const treasury = req.blockchain.getBalance(
    require("../../config/economic").TREASURY_ADDRESS
  )

  res.json({
    success: true,
    data: { schedules, treasury }
  })
}

exports.cancel = (req, res) => {
  try {
    const store = req.blockchain.store
    if (!store) throw new Error("PERSISTENCE_DISABLED")
    store.deleteSchedule(Number(req.params.id))
    res.json({ success: true })
  } catch (err) {
    res.status(400).json({ success: false, error: err.message })
  }
}

exports.DAY_MS = DAY_MS
