class State {
  constructor() {
    this.balances = {}
  }

  getBalance(address, token) {
    if (!this.balances[address]) return 0
    return this.balances[address][token] || 0
  }

  mint(address, amount, token) {
    if (!this.balances[address]) {
      this.balances[address] = {}
    }

    if (!this.balances[address][token]) {
      this.balances[address][token] = 0
    }

    this.balances[address][token] += amount
  }

  transfer(from, to, amount, token) {
    if (this.getBalance(from, token) < amount) {
      throw new Error("INSUFFICIENT_BALANCE")
    }

    this.balances[from][token] -= amount

    if (!this.balances[to]) {
      this.balances[to] = {}
    }

    if (!this.balances[to][token]) {
      this.balances[to][token] = 0
    }

    this.balances[to][token] += amount
  }
}

module.exports = State
