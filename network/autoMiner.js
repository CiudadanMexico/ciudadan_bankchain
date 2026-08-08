function createAutoMiner(blockchain, intervalMs = 6000) {
  const timer = setInterval(() => {
    if (blockchain.mempool.length === 0) return

    try {
      const block = blockchain.mineBlock()
      console.log(`[miner] bloque ${block.index} minado (${block.transactions.length} txs)`)
    } catch (err) {
      console.error(`[miner] error: ${err.message}`)
    }
  }, intervalMs)

  timer.unref()
  return () => clearInterval(timer)
}

module.exports = createAutoMiner
