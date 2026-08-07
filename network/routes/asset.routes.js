const express = require("express")
const router = express.Router()

const assets = require("../controllers/asset.controller")

router.get("/", assets.getAssets)
router.get("/:address", assets.getAssets)

module.exports = router
