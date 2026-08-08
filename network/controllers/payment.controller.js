const { assertToken } = require("../../core/amounts")
const { logAction } = require("../middlewares/logger")

exports.subsidized = (req, res) => {
  try {
    const {
      cartera_origen,
      cartera_destino,
      cartera_agencia,
      monto_laborys_usuario,
      subsidio,
      token
    } = req.body

    const block = req.blockchain.executeSubsidizedPayment({
      carteraOrigen: cartera_origen,
      carteraDestino: cartera_destino,
      carteraAgencia: cartera_agencia,
      montoLaborysUsuario: monto_laborys_usuario,
      subsidio,
      token: assertToken(token || "LABORY")
    })

    logAction("payment.subsidized", { blockIndex: block.index, txs: block.transactions.length })

    res.json({
      success: true,
      data: {
        blockIndex: block.index,
        total: block.transactions.reduce((s, tx) => s + tx.amount, 0)
      }
    })
  } catch (err) {
    res.status(400).json({ success: false, error: err.message })
  }
}

exports.earn = (req, res) => {
  try {
    const { tipo, monto, cartera_agencia, cartera_destino, origin_id, token } = req.body

    const block = req.blockchain.executeEarn({
      tipo,
      carteraAgencia: cartera_agencia,
      carteraDestino: cartera_destino,
      monto,
      originId: origin_id,
      token: assertToken(token || "LABORY")
    })

    logAction("earn", { blockIndex: block.index, tipo, originId: origin_id, amount: monto })

    res.json({
      success: true,
      data: { blockIndex: block.index }
    })
  } catch (err) {
    res.status(400).json({ success: false, error: err.message })
  }
}
