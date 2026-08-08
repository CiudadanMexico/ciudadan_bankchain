const { assertAddress } = require("../../core/amounts")
const { logAction } = require("../middlewares/logger")

exports.register = (req, res) => {
  try {
    const { address, agencia_id, nivel_subsidio } = req.body

    const a = assertAddress(address)
    if (!agencia_id || typeof agencia_id !== "string") throw new Error("INVALID_AGENCIA_ID")
    if (!Number.isInteger(nivel_subsidio) || nivel_subsidio < 0) throw new Error("INVALID_NIVEL_SUBSIDIO")

    const record = req.blockchain.setAgency({
      address: a,
      agencia_id,
      nivel_subsidio
    })

    logAction("agency.register", { address: a, agencia_id, nivel_subsidio })

    res.json({ success: true, data: record })
  } catch (err) {
    res.status(400).json({ success: false, error: err.message })
  }
}

exports.list = (req, res) => {
  res.json({ success: true, data: req.blockchain.listAgencies() })
}

exports.syncFromStrapi = async (req, res) => {
  const { syncAgenciesFromStrapi } = require("../../core/syncStrapi")
  try {
    const summary = await syncAgenciesFromStrapi(req.blockchain)
    logAction("agency.sync", summary)
    res.json({ success: true, data: summary })
  } catch (err) {
    res.status(502).json({ success: false, error: err.message })
  }
}
