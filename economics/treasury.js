module.exports = {
  mint(state, to, amount) {
    state.updateBalance(to, amount)
  },

  transfer(state, from, to, amount) {
    if (state.getBalance(from) < amount)
      throw new Error("Insufficient balance")

    state.updateBalance(from, -amount)
    state.updateBalance(to, amount)
  }
}
