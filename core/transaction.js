const { v4: uuidv4 } = require("uuid")

class Transaction {
  constructor(data) {
    this.id = uuidv4()
    this.type = data.type
    this.from = data.from
    this.to = data.to
    this.amount = data.amount
    this.timestamp = data.timestamp
    this.publicKey = data.publicKey
    this.signature = data.signature
  }
}

module.exports = Transaction
