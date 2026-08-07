// core/blockchain.js
const { verifySignature, deriveAddress } = require("./crypto")
const crypto = require("crypto")
const { ec: EC } = require("elliptic")
const ec = new EC("secp256k1")

class Blockchain {

  /**
   * nodeWallet = { privateKey?, publicKey, address }
   */
  constructor(nodeWallet) {
    this.nodeAddress = nodeWallet && nodeWallet.address
    this.nodePrivateKey = nodeWallet && nodeWallet.privateKey // puede ser undefined si solo hay publicKey en .env
    this.nodePublicKey = nodeWallet && nodeWallet.publicKey

    this.chain = [this.createGenesisBlock()]
    this.mempool = []

    // 🪙 Multi-token balances
    this.balances = {}

    // 🔢 Nonce tracking
    this.nonces = {}
  }

  // -------------------------
  // 🔹 BLOQUE GÉNESIS
  // -------------------------
  createGenesisBlock() {
    return {
      index: 0,
      timestamp: Date.now(),
      transactions: [],
      previousHash: "0",
      hash: "GENESIS_BLOCK",
      producer: null,
      publicKey: null,
      signature: null
    }
  }

  getLatestBlock() {
    return this.chain[this.chain.length - 1]
  }

  // -------------------------
  // 🔹 BALANCES
  // -------------------------
  getBalance(address, token = "LABORY") {
    if (!this.balances[address]) return 0
    return this.balances[address][token] || 0
  }

  // -------------------------
  // 🔹 NONCES
  // -------------------------
  getNonce(address) {
    return this.nonces[address] || 0
  }

  incrementNonce(address) {
    this.nonces[address] = this.getNonce(address) + 1
  }

  // -------------------------
  // 🔹 MINT (para bootstrap o pruebas)
  // -------------------------
  mint(address, amount, token = "LABORY") {
    if (!this.balances[address]) {
      this.balances[address] = {}
    }
    if (!this.balances[address][token]) {
      this.balances[address][token] = 0
    }
    this.balances[address][token] += amount
  }

  // -------------------------
  // 🔹 ADD TRANSACTION
  // -------------------------
  addTransaction(tx) {
    // 1️⃣ Verificar firma de la transacción (user-signed)
    if (!verifySignature(tx)) {
      throw new Error("INVALID_SIGNATURE")
    }

    // 2️⃣ Verificar dirección derivada desde la publicKey incluida en la tx
    const derived = deriveAddress(tx.publicKey)
    if (derived !== tx.from) {
      throw new Error("ADDRESS_MISMATCH")
    }

    // 3️⃣ Verificar nonce correcto (anti-replay)
    if (tx.nonce !== this.getNonce(tx.from)) {
      throw new Error("INVALID_NONCE")
    }

    // 4️⃣ Verificar saldo suficiente (por token)
    if (this.getBalance(tx.from, tx.token) < tx.amount) {
      throw new Error("INSUFFICIENT_BALANCE")
    }

    // todo ok -> añadir a mempool
    this.mempool.push(tx)
  }

  // -------------------------
  // 🔹 APPLY TRANSACTION (estado)
  // -------------------------
  applyTransaction(tx) {
    if (!this.balances[tx.from]) this.balances[tx.from] = {}
    if (!this.balances[tx.to]) this.balances[tx.to] = {}

    if (!this.balances[tx.from][tx.token]) this.balances[tx.from][tx.token] = 0
    if (!this.balances[tx.to][tx.token]) this.balances[tx.to][tx.token] = 0

    this.balances[tx.from][tx.token] -= tx.amount
    this.balances[tx.to][tx.token] += tx.amount

    // actualizar nonce del emisor
    this.incrementNonce(tx.from)
  }

  // -------------------------
  // 🔹 HASH SIMPLE
  // -------------------------
  calculateHash(block) {
    return crypto
      .createHash("sha256")
      .update(
        String(block.index) +
        String(block.timestamp) +
        JSON.stringify(block.transactions) +
        String(block.previousHash)
      )
      .digest("hex")
  }

  // -------------------------
  // 🔹 FIRMAR BLOQUE (con clave del nodo)
  // -------------------------
  signBlock(hash) {
    if (!this.nodePrivateKey) {
      throw new Error("NODE_PRIVATE_KEY_NOT_AVAILABLE")
    }
    const key = ec.keyFromPrivate(this.nodePrivateKey)
    const signature = key.sign(hash)
    return signature.toDER("hex")
  }

  // -------------------------
  // 🔹 VERIFICAR FIRMA DE BLOQUE
  // -------------------------
  verifyBlockSignature(block) {
    // Checar integridad del hash primero
    const recalculated = this.calculateHash({
      index: block.index,
      timestamp: block.timestamp,
      transactions: block.transactions,
      previousHash: block.previousHash
    })
    if (recalculated !== block.hash) {
      return false
    }

    if (!block.signature || !block.publicKey) return false

    try {
      const key = ec.keyFromPublic(block.publicKey, "hex")
      return key.verify(block.hash, block.signature)
    } catch (err) {
      return false
    }
  }

  // -------------------------
  // 🔹 MINAR BLOQUE (firma incluida)
  // -------------------------
  mineBlock() {
    if (this.mempool.length === 0) {
      throw new Error("NO_TRANSACTIONS")
    }

    const block = {
      index: this.chain.length,
      timestamp: Date.now(),
      transactions: this.mempool,
      previousHash: this.getLatestBlock().hash,
      hash: ""
    }

    // calcular hash
    block.hash = this.calculateHash(block)

    // firmar bloque con la clave privada del nodo (si existe)
    if (this.nodePrivateKey) {
      block.producer = this.nodeAddress
      block.publicKey = this.nodePublicKey
      block.signature = this.signBlock(block.hash)
    } else {
      // nodo sin privateKey (solo lectura / no produce)
      block.producer = null
      block.publicKey = null
      block.signature = null
    }

    // aplicar transacciones al estado
    for (const tx of this.mempool) {
      this.applyTransaction(tx)
    }

    // anexar bloque y limpiar mempool
    this.chain.push(block)
    this.mempool = []

    return block
  }

  // -------------------------
  // 🔹 ACEPTAR BLOQUE EXTERNO (p2p)
  // -------------------------
  applyExternalBlock(block) {
    // Validaciones mínimas:
    // - index correcto (se espera index = this.chain.length)
    // - previousHash coincide
    // - hash correcto y firma válida
    if (block.index !== this.chain.length) {
      throw new Error("INVALID_BLOCK_INDEX")
    }

    if (block.previousHash !== this.getLatestBlock().hash) {
      throw new Error("INVALID_PREVIOUS_HASH")
    }

    if (!this.verifyBlockSignature(block)) {
      throw new Error("INVALID_BLOCK_SIGNATURE")
    }

    // Aplicar transacciones (las mismas reglas que local)
    for (const tx of block.transactions) {
      // aquí asumimos que las transacciones ya fueron validadas antes de incluir el bloque
      // pero por seguridad volvemos a comprobar firma y nonce/saldo
      if (!verifySignature(tx)) throw new Error("INVALID_TX_SIGNATURE_IN_BLOCK")
      const derived = deriveAddress(tx.publicKey)
      if (derived !== tx.from) throw new Error("ADDRESS_MISMATCH_IN_BLOCK")
      if (tx.nonce !== this.getNonce(tx.from)) throw new Error("INVALID_NONCE_IN_BLOCK")
      if (this.getBalance(tx.from, tx.token) < tx.amount) throw new Error("INSUFFICIENT_BALANCE_IN_BLOCK")

      this.applyTransaction(tx)
    }

    this.chain.push(block)
    return true
  }

}

module.exports = Blockchain