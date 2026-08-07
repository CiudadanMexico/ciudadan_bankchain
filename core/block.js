const SHA256 = require("crypto-js/sha256")

class Block {
  constructor(index, previousHash, transactions, validator) {
    this.index = index
    this.previousHash = previousHash
    this.timestamp = Date.now()
    this.transactions = transactions
    this.validator = validator
    this.hash = this.calculateHash()
  }

  calculateHash() {
    return SHA256(
      this.index +
      this.previousHash +
      this.timestamp +
      JSON.stringify(this.transactions) +
      this.validator
    ).toString()
  }
}

module.exports = Block
