const Blockchain = require("../core/blockchain")

const blockchain = new Blockchain()

const ADDRESS_A = "0x1ae18f80f94a017d479e30d6bb70d4ee8bd64b06"

blockchain.mint(ADDRESS_A, 1000, "CIT")

console.log("Balance inicial asignado:")
console.log(blockchain.balances)
