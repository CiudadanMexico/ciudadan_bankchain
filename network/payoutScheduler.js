const { DAY_MS } = require("./controllers/payout.controller")

function createPayoutScheduler(blockchain, intervalMs = 30000) {
  const timer = setInterval(() => {
    const store = blockchain.store
    if (!store) return

    const now = Date.now()

    for (const schedule of store.loadSchedules()) {
      if (now < schedule.nextRunAt) continue

      try {
        blockchain.executePayouts(schedule.recipients, schedule.token)
        console.log(`[payouts] schedule #${schedule.id} ejecutado (${schedule.recipients.length} destinatarios)`)
      } catch (err) {
        console.error(`[payouts] schedule #${schedule.id} falló: ${err.message}`)
        store.deleteSchedule(schedule.id)
        continue
      }

      if (schedule.repeat === "daily") {
        schedule.nextRunAt += DAY_MS
        store.updateSchedule(schedule)
      } else if (schedule.repeat === "weekly") {
        schedule.nextRunAt += 7 * DAY_MS
        store.updateSchedule(schedule)
      } else {
        store.deleteSchedule(schedule.id)
      }
    }
  }, intervalMs)

  timer.unref()
  return () => clearInterval(timer)
}

module.exports = createPayoutScheduler
