const { test } = require("node:test")
const assert = require("node:assert")

const { parseAmount, assertToken, assertAddress } = require("../core/amounts")

test("parseAmount acepta enteros positivos (number y string)", () => {
  assert.strictEqual(parseAmount(5), 5)
  assert.strictEqual(parseAmount("150"), 150)
  assert.strictEqual(parseAmount("007"), 7)
})

test("parseAmount rechaza floats", () => {
  assert.throws(() => parseAmount(10.5), /AMOUNT_NOT_INTEGER/)
  assert.throws(() => parseAmount("10.5"), /INVALID_AMOUNT_FORMAT/)
  assert.throws(() => parseAmount("10,5"), /INVALID_AMOUNT_FORMAT/)
})

test("parseAmount rechaza negativos y cero", () => {
  assert.throws(() => parseAmount(-5), /AMOUNT_NOT_POSITIVE/)
  assert.throws(() => parseAmount(0), /AMOUNT_NOT_POSITIVE/)
  assert.throws(() => parseAmount("-5"), /INVALID_AMOUNT_FORMAT/)
})

test("parseAmount rechaza no-numéricos", () => {
  assert.throws(() => parseAmount("abc"), /INVALID_AMOUNT_FORMAT/)
  assert.throws(() => parseAmount(""), /INVALID_AMOUNT_FORMAT/)
  assert.throws(() => parseAmount(null), /INVALID_AMOUNT_FORMAT/)
  assert.throws(() => parseAmount(undefined), /INVALID_AMOUNT_FORMAT/)
  assert.throws(() => parseAmount(NaN), /AMOUNT_NOT_INTEGER/)
  assert.throws(() => parseAmount(Infinity), /AMOUNT_NOT_INTEGER/)
})

test("assertToken normaliza a mayúsculas", () => {
  assert.strictEqual(assertToken("labory"), "LABORY")
  assert.throws(() => assertToken(""), /INVALID_TOKEN/)
  assert.throws(() => assertToken(123), /INVALID_TOKEN/)
})

test("assertAddress valida formato 0x + 40 hex", () => {
  assert.strictEqual(assertAddress("0x" + "a".repeat(40)), "0x" + "a".repeat(40))
  assert.throws(() => assertAddress("0x123"), /INVALID_ADDRESS/)
  assert.throws(() => assertAddress("0x" + "g".repeat(40)), /INVALID_ADDRESS/)
  assert.throws(() => assertAddress(null), /INVALID_ADDRESS/)
})
