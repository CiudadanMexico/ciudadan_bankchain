const express = require("express")
const router = express.Router()

const bc = require("../controllers/blockchain.controller")

router.get("/chain", bc.getChain)
router.get("/mempool", bc.getMempool)
router.post("/mine", bc.mine)
router.post("/block/apply", bc.applyExternalBlock)

module.exports = router
