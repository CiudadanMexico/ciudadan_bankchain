function createTokenPayoutRunner(blockchain, intervalMs = 30000) {
  const timer = setInterval(() => {
    try {
      const result = blockchain.processTokenPayouts()
      if (result.payouts.length > 0) {
        console.log(
          `[tokens] ${result.payouts.length} payout(s) ejecutado(s) en bloque ${result.block ? result.block.index : "-"}`
        )
      }
    } catch (err) {
      console.error(`[tokens] runner: ${err.message}`)
    }
  }, intervalMs)

  timer.unref()
  return () => clearInterval(timer)
}

module.exports = createTokenPayoutRunner
