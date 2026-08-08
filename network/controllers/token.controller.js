const { assertAddress, parseAmount, assertToken } = require("../../core/amounts")
const { logAction } = require("../middlewares/logger")

exports.createContract = (req, res) => {
  try {
    const record = req.blockchain.registerTokenContract(req.body)
    logAction("token.contract", { id: record.id, factorTarget: record.factorTarget })
    res.json({ success: true, data: record })
  } catch (err) {
    res.status(400).json({ success: false, error: err.message })
  }
}

exports.listContracts = (req, res) => {
  res.json({ success: true, data: req.blockchain.listTokenContracts() })
}

exports.invest = (req, res) => {
  try {
    const { owner, contractId, amount } = req.body
    const result = req.blockchain.invest({
      owner: assertAddress(owner),
      contractId,
      amount
    })
    logAction("token.invest", { id: result.position.id, owner, contractId, amount })
    res.json({ success: true, data: result.position })
  } catch (err) {
    res.status(400).json({ success: false, error: err.message })
  }
}

exports.listPositions = (req, res) => {
  const { owner } = req.query
  res.json({ success: true, data: req.blockchain.listTokenPositions(owner) })
}

exports.runPayouts = (req, res) => {
  try {
    const result = req.blockchain.processTokenPayouts()
    const data = { payouts: result.payouts, blockIndex: result.block ? result.block.index : null }
    logAction("token.payouts", { count: data.payouts.length, blockIndex: data.blockIndex })
    res.json({ success: true, data })
  } catch (err) {
    res.status(400).json({ success: false, error: err.message })
  }
}
