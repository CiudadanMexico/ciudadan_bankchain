const MAX_AMOUNT = Number.MAX_SAFE_INTEGER

const ADDRESS_RE = /^0x[0-9a-f]{40}$/

function parseAmount(value, { allowZero = false } = {}) {
  let n

  if (typeof value === "number") {
    n = value
  } else if (typeof value === "string") {
    const s = value.trim()
    if (!/^\d+$/.test(s)) throw new Error("INVALID_AMOUNT_FORMAT")
    n = Number(s)
  } else {
    throw new Error("INVALID_AMOUNT_FORMAT")
  }

  if (!Number.isFinite(n) || !Number.isSafeInteger(n)) throw new Error("AMOUNT_NOT_INTEGER")
  if (n < 0 || (n === 0 && !allowZero)) throw new Error("AMOUNT_NOT_POSITIVE")
  if (n > MAX_AMOUNT) throw new Error("AMOUNT_TOO_LARGE")

  return n
}

function assertToken(token) {
  if (typeof token !== "string" || !token.trim()) throw new Error("INVALID_TOKEN")
  return token.trim().toUpperCase()
}

function assertAddress(address) {
  if (typeof address !== "string" || !ADDRESS_RE.test(address)) throw new Error("INVALID_ADDRESS")
  return address
}

module.exports = { parseAmount, assertToken, assertAddress, ADDRESS_RE }
