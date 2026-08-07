const EC = require("elliptic").ec
const SHA256 = require("crypto-js/sha256")

const ec = new EC("secp256k1")

function hashTransaction(txData) {
  const canonical = {
    type: txData.type,
    from: txData.from,
    to: txData.to,
    amount: String(txData.amount),
    token: txData.token,
    nonce: txData.nonce,
    publicKey: txData.publicKey,
    timestamp: txData.timestamp
  }
  return SHA256(JSON.stringify(canonical)).toString()
}

function verifySignature(tx) {
  try {
    const key = ec.keyFromPublic(tx.publicKey, "hex")
    const hash = hashTransaction(tx)
    return key.verify(hash, tx.signature)
  } catch (err) {
    return false
  }
}

function deriveAddress(publicKey) {
  return "0x" + SHA256(publicKey).toString().slice(-40)
}

module.exports = {
  verifySignature,
  deriveAddress,
  hashTransaction
}
