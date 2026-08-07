const fs = require("fs")
const path = require("path")
const { ec: EC } = require("elliptic")
const SHA256 = require("crypto-js/sha256")
require("dotenv").config()

const ec = new EC("secp256k1")

const walletPath = path.join(__dirname, "../nodeWallet.json")

function loadOrCreateWallet() {

  let privateKey = process.env.NODE_PRIVATE_KEY

  // 🔐 SI YA HAY PRIVATE KEY EN .ENV
  if (privateKey) {
    const key = ec.keyFromPrivate(privateKey)
    const publicKey = key.getPublic("hex")
    const address = "0x" + SHA256(publicKey).toString().slice(-40)

    const wallet = { publicKey, address }

    fs.writeFileSync(walletPath, JSON.stringify(wallet, null, 2))

    console.log("Node wallet loaded from ENV.")
    return { privateKey, publicKey, address }
  }

  // 🔁 SI EXISTE JSON PERO NO HAY ENV
  if (fs.existsSync(walletPath)) {
    const data = JSON.parse(fs.readFileSync(walletPath))
    if (data.publicKey) {
      console.log("Node wallet loaded from JSON (no private key stored).")
      return {
        privateKey: null,
        publicKey: data.publicKey,
        address: data.address
      }
    }
  }

  // 🆕 SI NO EXISTE NADA → GENERAR NUEVA
  console.log("Generating new node wallet...")

  const key = ec.genKeyPair()
  privateKey = key.getPrivate("hex")
  const publicKey = key.getPublic("hex")
  const address = "0x" + SHA256(publicKey).toString().slice(-40)

  // Guardar public info en JSON
  fs.writeFileSync(walletPath, JSON.stringify({ publicKey, address }, null, 2))

  console.log("⚠️ SAVE THIS PRIVATE KEY IN YOUR .env:")
  console.log(privateKey)

  return { privateKey, publicKey, address }
}

module.exports = loadOrCreateWallet
