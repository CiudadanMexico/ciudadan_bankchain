const { ec: EC } = require("elliptic")
const { hashTransaction } = require("./core/crypto")

const ec = new EC("secp256k1")

function createWallet() {
  const key = ec.genKeyPair()

  const privateKey = key.getPrivate("hex")
  const publicKey = key.getPublic("hex")
  const address = "0x" + require("crypto-js/sha256")(publicKey).toString().slice(-40)

  return { privateKey, publicKey, address }
}

function signTransaction(txData, privateKey) {
  const hash = hashTransaction(txData)
  const key = ec.keyFromPrivate(privateKey)
  return key.sign(hash).toDER("hex")
}

if (require.main === module) {
  console.log("WALLET A:", createWallet())
  console.log("WALLET B:", createWallet())
}

module.exports = { createWallet, signTransaction }
