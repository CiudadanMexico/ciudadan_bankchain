// core/blockchain.js
const { verifySignature, deriveAddress } = require("./crypto")
const { parseAmount, assertToken, assertAddress } = require("./amounts")
const {
  BLOCK_REWARD,
  TREASURY_RATIO,
  TREASURY_ADDRESS,
  RESERVE_ADDRESS,
  NATIVE_TOKEN,
  WEEKLY_MS,
  MONTHLY_MS
} = require("../config/economic")
const crypto = require("crypto")
const { ec: EC } = require("elliptic")
const ec = new EC("secp256k1")

const FACTOR_TARGETS = new Set([2, 3, 4, 7])
const PAYOUT_FREQUENCIES = new Set(["weekly", "monthly"])

class Blockchain {

  /**
   * nodeWallet = { privateKey?, publicKey, address }
   * store      = instancia de core/store (persistencia SQLite) o null
   */
  constructor(nodeWallet, store) {
    this.nodeAddress = nodeWallet && nodeWallet.address
    this.nodePrivateKey = nodeWallet && nodeWallet.privateKey // puede ser undefined si solo hay publicKey en .env
    this.nodePublicKey = nodeWallet && nodeWallet.publicKey

    this.store = store || null
    this.balances = {}
    this.nonces = {}
    this.mempool = []
    this._agencyCache = {}
    this._startedAt = Date.now()

    this._restore()
  }

  // -------------------------
  // 🔹 RESTAURACIÓN DESDE PERSISTENCIA
  // -------------------------
  _restore() {
    if (!this.store) {
      this.chain = [this.createGenesisBlock()]
      return
    }

    const blocks = this.store.loadBlocks()
    const snapshot = this.store.loadSnapshot()

    if (blocks.length === 0) {
      this.chain = [this.createGenesisBlock()]
      return
    }

    // el génesis no se persiste: se reconstruye si falta
    this.chain = blocks[0].index === 0 ? blocks : [this.createGenesisBlock(), ...blocks]

    if (snapshot && snapshot.blockIndex === blocks[blocks.length - 1].index) {
      // snapshot fresco → restaurar estado directamente
      this.balances = snapshot.balances
      this.nonces = snapshot.nonces
    } else {
      // sin snapshot válido → replay de todas las transacciones
      this.balances = {}
      this.nonces = {}
      for (const block of blocks) {
        for (const tx of block.transactions) {
          this.applyTransaction(tx)
        }
      }
    }
  }

  _persist(block) {
    if (!this.store) return
    if (block) this.store.saveBlock(block)
    this.store.saveSnapshot({
      balances: this.balances,
      nonces: this.nonces,
      latestBlockIndex: this.getLatestBlock().index
    })
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
  getBalance(address, token = NATIVE_TOKEN) {
    const t = assertToken(token)
    if (!this.balances[address]) return 0
    return this.balances[address][t] || 0
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
  // 🔹 MINT (para bootstrap o pruebas) — se registra on-chain
  // -------------------------
  mint(address, amount, token = NATIVE_TOKEN) {
    const a = assertAddress(address)
    const n = parseAmount(amount)
    const t = assertToken(token)

    const tx = {
      type: "mint",
      from: null,
      to: a,
      amount: n,
      token: t,
      timestamp: Date.now()
    }

    this._buildAndApplyBlock([tx])
    return n
  }

  // -------------------------
  // 🔹 REWARDS (economía)
  // -------------------------
  buildRewardTransactions() {
    const treasuryShare = Math.floor(BLOCK_REWARD * TREASURY_RATIO)
    const producerShare = BLOCK_REWARD - treasuryShare
    const timestamp = Date.now()
    const txs = []

    if (this.nodeAddress && producerShare > 0) {
      txs.push({
        type: "reward",
        from: null,
        to: this.nodeAddress,
        amount: producerShare,
        token: NATIVE_TOKEN,
        timestamp
      })
    }
    if (treasuryShare > 0) {
      txs.push({
        type: "reward",
        from: null,
        to: TREASURY_ADDRESS,
        amount: treasuryShare,
        token: NATIVE_TOKEN,
        timestamp
      })
    }
    return txs
  }

  // -------------------------
  // 🔹 ADD TRANSACTION
  // -------------------------
  addTransaction(tx) {
    if (!tx || typeof tx !== "object") throw new Error("MISSING_TRANSACTION")
    if (tx.type !== "transfer") throw new Error("INVALID_TX_TYPE")
    assertAddress(tx.from)
    assertAddress(tx.to)
    const amount = parseAmount(tx.amount)
    const token = assertToken(tx.token)

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
    if (this.getBalance(tx.from, token) < amount) {
      throw new Error("INSUFFICIENT_BALANCE")
    }

    // todo ok -> añadir a mempool
    this.mempool.push(tx)
  }

  // -------------------------
  // 🔹 APPLY TRANSACTION (estado)
  // -------------------------
  _applyTo(tx, state) {
    const amount = parseAmount(tx.amount)
    const token = assertToken(tx.token)

    if (tx.type === "reward" || tx.type === "mint" || tx.from == null) {
      // crédito sin débito (emisiones del sistema)
      if (!state.balances[tx.to]) state.balances[tx.to] = {}
      state.balances[tx.to][token] = (state.balances[tx.to][token] || 0) + amount
      return
    }

    assertAddress(tx.from)
    assertAddress(tx.to)

    if (!state.balances[tx.from]) state.balances[tx.from] = {}
    if (!state.balances[tx.to]) state.balances[tx.to] = {}

    const fromBalance = state.balances[tx.from][token] || 0
    if (fromBalance < amount) throw new Error("INSUFFICIENT_BALANCE")

    state.balances[tx.from][token] = fromBalance - amount
    state.balances[tx.to][token] = (state.balances[tx.to][token] || 0) + amount

    if (tx.type === "transfer") state.nonces[tx.from] = (state.nonces[tx.from] || 0) + 1
  }

  applyTransaction(tx) {
    this._applyTo(tx, this)
  }

  // -------------------------
  // 🔹 AUDITORÍA: replay del ledger vs estado actual
  // -------------------------
  audit() {
    const blocks = this.store ? this.store.loadBlocks() : this.chain.slice(1)
    const replay = { balances: {}, nonces: {} }

    for (const block of blocks) {
      for (const tx of block.transactions) {
        this._applyTo(tx, replay)
      }
    }

    const balancesMatch = JSON.stringify(replay.balances) === JSON.stringify(this.balances)
    const noncesMatch = JSON.stringify(replay.nonces) === JSON.stringify(this.nonces)

    const totals = {}
    for (const balances of Object.values(this.balances)) {
      for (const [token, amount] of Object.entries(balances)) {
        totals[token] = (totals[token] || 0) + amount
      }
    }

    return {
      ok: balancesMatch && noncesMatch,
      blocks: blocks.length,
      totals,
      balancesMatch,
      noncesMatch
    }
  }

  // -------------------------
  // 🔹 HISTORIAL DE UNA WALLET
  // -------------------------
  getTransactionHistory(address) {
    assertAddress(address)
    const txs = []
    for (const block of this.chain) {
      for (const tx of block.transactions) {
        if (tx.from === address || tx.to === address) {
          txs.push({
            ...tx,
            blockIndex: block.index,
            blockHash: block.hash,
            blockTimestamp: block.timestamp
          })
        }
      }
    }
    return txs
  }

  // -------------------------
  // 🔹 REGISTRO DE AGENCIAS (subsidios)
  // -------------------------
  getAgency(address) {
    const fromStore = this.store ? this.store.getAgency(address) : null
    return fromStore || this._agencyCache[address] || null
  }

  setAgency(record) {
    this._agencyCache[record.address] = record
    if (this.store) return this.store.upsertAgency(record)
    return record
  }

  listAgencies() {
    const merged = new Map()
    if (this.store) {
      for (const r of this.store.listAgencies()) merged.set(r.address, r)
    }
    for (const [address, r] of Object.entries(this._agencyCache)) merged.set(address, r)
    return [...merged.values()]
  }

  // -------------------------
  // 🔹 PAGO CON SUBSIDIO (spec: taxi / marketplace)
  // -------------------------
  executeSubsidizedPayment({
    carteraOrigen,
    carteraDestino,
    carteraAgencia,
    montoLaborysUsuario,
    subsidio,
    token = NATIVE_TOKEN
  }) {
    const user = assertAddress(carteraOrigen)
    const dest = assertAddress(carteraDestino)
    const agency = assertAddress(carteraAgencia)
    const monto = parseAmount(montoLaborysUsuario)
    const sub = parseAmount(subsidio, { allowZero: true })
    const t = assertToken(token)

    const agencyRec = this.getAgency(agency)
    if (!agencyRec) throw new Error("UNKNOWN_AGENCY")

    // nivel_subsidio == subsidio / monto_laborys_usuario
    if (sub / monto !== agencyRec.nivel_subsidio) {
      throw new Error("SUBSIDY_RATIO_MISMATCH")
    }

    if (this.getBalance(user, t) < monto) throw new Error("INSUFFICIENT_BALANCE")
    if (this.getBalance(agency, t) < sub) throw new Error("INSUFFICIENT_AGENCY_BALANCE")

    const timestamp = Date.now()
    const txs = [
      { type: "payment", from: user, to: dest, amount: monto, token: t, timestamp },
      { type: "payment", from: agency, to: dest, amount: sub, token: t, timestamp }
    ]

    return this._buildAndApplyBlock(txs)
  }

  // -------------------------
  // 🔹 EARN_LABORYS (tarea / anuncio)
  // -------------------------
  executeEarn({ tipo, carteraAgencia, carteraDestino, monto, originId, token = NATIVE_TOKEN }) {
    if (tipo !== "tarea" && tipo !== "anuncio") throw new Error("INVALID_EARN_TYPE")
    if (!originId) throw new Error("ORIGIN_ID_REQUIRED")

    const agency = assertAddress(carteraAgencia)
    const dest = assertAddress(carteraDestino)
    const amt = parseAmount(monto)
    const t = assertToken(token)

    if (this.store && this.store.hasClaim(originId)) throw new Error("ORIGIN_ALREADY_EARNED")
    if (this.getBalance(agency, t) < amt) throw new Error("INSUFFICIENT_AGENCY_BALANCE")

    const timestamp = Date.now()
    const txs = [{ type: "earn", from: agency, to: dest, amount: amt, token: t, timestamp, originId }]
    const block = this._buildAndApplyBlock(txs)

    if (this.store) this.store.saveClaim(originId, block.index)
    return block
  }

  // -------------------------
  // 🔹 TOKENS DE INVERSIÓN (CIT)
  // -------------------------
  registerTokenContract(contract) {
    if (!contract || typeof contract.id !== "string" || !contract.id) throw new Error("INVALID_CONTRACT_ID")
    if (!FACTOR_TARGETS.has(contract.factorTarget)) throw new Error("INVALID_FACTOR_TARGET")
    if (!PAYOUT_FREQUENCIES.has(contract.payoutFrequency)) throw new Error("INVALID_PAYOUT_FREQUENCY")

    for (const r of ["fixedRate", "variableRate", "commissionRate"]) {
      const v = contract[r]
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1) {
        throw new Error("INVALID_RATE_" + r.toUpperCase())
      }
    }

    const minAmount = parseAmount(contract.minAmount != null ? contract.minAmount : 1)
    const maxAmount = parseAmount(contract.maxAmount != null ? contract.maxAmount : Number.MAX_SAFE_INTEGER)

    if (!this.store) throw new Error("PERSISTENCE_DISABLED")

    const record = {
      id: contract.id,
      name: contract.name || contract.id,
      factorTarget: contract.factorTarget,
      payoutFrequency: contract.payoutFrequency,
      fixedRate: contract.fixedRate,
      variableRate: contract.variableRate,
      commissionRate: contract.commissionRate,
      minAmount,
      maxAmount,
      createdAt: Date.now()
    }

    this.store.saveTokenContract(record)
    return record
  }

  listTokenContracts() {
    return this.store ? this.store.listTokenContracts() : []
  }

  invest({ owner, contractId, amount }) {
    const o = assertAddress(owner)
    const amt = parseAmount(amount)
    if (!this.store) throw new Error("PERSISTENCE_DISABLED")

    const contract = this.store.getTokenContract(contractId)
    if (!contract) throw new Error("UNKNOWN_TOKEN_CONTRACT")
    if (amt < contract.minAmount) throw new Error("BELOW_MIN_AMOUNT")
    if (amt > contract.maxAmount) throw new Error("ABOVE_MAX_AMOUNT")
    if (this.getBalance(o, NATIVE_TOKEN) < amt) throw new Error("INSUFFICIENT_BALANCE")

    const id = crypto.randomUUID()
    const timestamp = Date.now()
    const tx = {
      type: "tokenlock",
      from: o,
      to: RESERVE_ADDRESS,
      amount: amt,
      token: NATIVE_TOKEN,
      timestamp,
      contractId
    }

    const block = this._buildAndApplyBlock([tx])

    const position = {
      id,
      contractId,
      owner: o,
      principal: amt,
      createdAt: timestamp,
      lastPayoutAt: timestamp,
      totalPayout: 0,
      matured: false,
      maturedAt: null
    }
    this.store.saveTokenPosition(position)

    return { position, block }
  }

  listTokenPositions(owner) {
    return this.store ? this.store.listTokenPositions(owner) : []
  }

  processTokenPayouts({ now = Date.now() } = {}) {
    if (!this.store) throw new Error("PERSISTENCE_DISABLED")

    const contracts = new Map(this.store.listTokenContracts().map((c) => [c.id, c]))
    const positions = this.store.listTokenPositions()
    const txs = []
    const payouts = []
    const updatedPositions = []

    for (const pos of positions) {
      if (pos.matured) continue

      const contract = contracts.get(pos.contractId)
      if (!contract) continue

      const periodMs = contract.payoutFrequency === "monthly" ? MONTHLY_MS : WEEKLY_MS
      if (now - pos.lastPayoutAt < periodMs) continue

      const yieldTarget = pos.principal * (contract.factorTarget - 1)
      const remaining = yieldTarget - pos.totalPayout
      if (remaining <= 0) {
        pos.matured = true
        pos.maturedAt = now
        updatedPositions.push(pos)
        continue
      }

      const gross = Math.round(pos.principal * (contract.fixedRate + contract.variableRate))
      const net = Math.max(0, Math.round(gross * (1 - contract.commissionRate)))
      const paid = Math.min(net, remaining)
      const matured = paid >= remaining

      pos.totalPayout += paid
      pos.lastPayoutAt = now
      pos.matured = matured
      pos.maturedAt = matured ? now : pos.maturedAt

      txs.push({
        type: "tokenpayout",
        from: TREASURY_ADDRESS,
        to: pos.owner,
        amount: paid,
        token: NATIVE_TOKEN,
        timestamp: now,
        positionId: pos.id
      })

      if (matured) {
        txs.push({
          type: "tokenreturn",
          from: RESERVE_ADDRESS,
          to: pos.owner,
          amount: pos.principal,
          token: NATIVE_TOKEN,
          timestamp: now,
          positionId: pos.id
        })
      }

      updatedPositions.push(pos)
      payouts.push({ id: pos.id, paid, matured })
    }

    if (txs.length === 0) return { block: null, payouts: [] }

    const totalYield = txs.reduce((s, tx) => (tx.type === "tokenpayout" ? s + tx.amount : s), 0)
    const totalReturn = txs.reduce((s, tx) => (tx.type === "tokenreturn" ? s + tx.amount : s), 0)

    if (this.getBalance(TREASURY_ADDRESS, NATIVE_TOKEN) < totalYield) {
      throw new Error("INSUFFICIENT_TREASURY")
    }
    if (this.getBalance(RESERVE_ADDRESS, NATIVE_TOKEN) < totalReturn) {
      throw new Error("INSUFFICIENT_RESERVE")
    }

    const block = this._buildAndApplyBlock(txs)
    for (const pos of updatedPositions) this.store.saveTokenPosition(pos)
    return { block, payouts }
  }

  // -------------------------
  // 🔹 PAYOUTS (desde tesorería)
  // -------------------------
  executePayouts(recipients, token = NATIVE_TOKEN) {
    const t = assertToken(token)

    if (!Array.isArray(recipients) || recipients.length === 0) {
      throw new Error("RECIPIENTS_REQUIRED")
    }

    const items = recipients.map((r) => ({
      address: assertAddress(r && r.address),
      amount: parseAmount(r && r.amount)
    }))

    const total = items.reduce((sum, it) => sum + it.amount, 0)
    if (this.getBalance(TREASURY_ADDRESS, t) < total) {
      throw new Error("INSUFFICIENT_TREASURY")
    }

    const timestamp = Date.now()
    const txs = items.map((it) => ({
      type: "payout",
      from: TREASURY_ADDRESS,
      to: it.address,
      amount: it.amount,
      token: t,
      timestamp
    }))

    return this._buildAndApplyBlock(txs)
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
  // 🔹 CONSTRUIR Y APLICAR UN BLOQUE
  // -------------------------
  _buildAndApplyBlock(txs) {
    const block = {
      index: this.chain.length,
      timestamp: Date.now(),
      transactions: txs,
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
    for (const tx of txs) {
      this.applyTransaction(tx)
    }

    // anexar bloque (no toca el mempool: solo mineBlock lo consume)
    this.chain.push(block)

    this._persist(block)
    return block
  }

  // -------------------------
  // 🔹 MINAR BLOQUE (firma incluida)
  // -------------------------
  mineBlock() {
    if (this.mempool.length === 0) {
      throw new Error("NO_TRANSACTIONS")
    }

    const txs = [...this.buildRewardTransactions(), ...this.mempool]
    const block = this._buildAndApplyBlock(txs)
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
    const SYSTEM_TYPES = new Set(["reward", "mint", "payout", "payment", "earn", "tokenlock", "tokenpayout", "tokenreturn"])
    for (const tx of block.transactions) {
      if (SYSTEM_TYPES.has(tx.type)) {
        // transacciones de sistema: solo verificar saldo del emisor (reward/mint no debitan)
        if (tx.type !== "reward" && tx.type !== "mint") {
          const amount = parseAmount(tx.amount)
          const token = assertToken(tx.token)
          if (this.getBalance(tx.from, token) < amount) {
            throw new Error("INSUFFICIENT_BALANCE_IN_BLOCK")
          }
        }
        this.applyTransaction(tx)
        continue
      }

      // transacciones de usuario: re-verificar firma, nonce y saldo
      if (!verifySignature(tx)) throw new Error("INVALID_TX_SIGNATURE_IN_BLOCK")
      const derived = deriveAddress(tx.publicKey)
      if (derived !== tx.from) throw new Error("ADDRESS_MISMATCH_IN_BLOCK")
      if (tx.nonce !== this.getNonce(tx.from)) throw new Error("INVALID_NONCE_IN_BLOCK")
      if (this.getBalance(tx.from, tx.token) < parseAmount(tx.amount)) throw new Error("INSUFFICIENT_BALANCE_IN_BLOCK")

      this.applyTransaction(tx)
    }

    this.chain.push(block)
    this._persist(block)
    return true
  }

  // -------------------------
  // 🔹 EXPORT DEL LEDGER (Fase 5: respaldo / reconstrucción por Strapi o backoffice)
  // -------------------------
  exportLedger() {
    const blocks = this.store ? this.store.loadBlocks() : this.chain.slice(1)
    const hasGenesis = blocks.length > 0 && blocks[0].index === 0
    const chain = hasGenesis ? blocks : [this.createGenesisBlock(), ...blocks]

    const aux = this.store
      ? {
          agencies: this.store.listAgencies(),
          tokenContracts: this.store.listTokenContracts(),
          tokenPositions: this.store.listTokenPositions()
        }
      : { agencies: this.listAgencies(), tokenContracts: [], tokenPositions: [] }

    return {
      format: "ciudadan-ledger-export",
      version: 1,
      contract: "CONTRATO_API v1",
      exportedAt: new Date().toISOString(),
      node: this.nodeAddress,
      latestBlock: this.getLatestBlock().index,
      blocks: chain.length,
      balances: this.balances,
      nonces: this.nonces,
      chain,
      aux
    }
  }

}

module.exports = Blockchain
