require("dotenv").config()

module.exports = {
  NODE_PORT: process.env.NODE_PORT || 66633,
  NODE_ID: process.env.NODE_ID || "node-1",
  BLOCK_TIME_MS: parseInt(process.env.BLOCK_TIME_MS) || 6000
}
