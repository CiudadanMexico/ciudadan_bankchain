const express = require("express")
const router = express.Router()

const agencyController = require("../controllers/agency.controller")
const requireAdmin = require("../middlewares/requireAdmin")

router.get("/", agencyController.list)
router.post("/", requireAdmin, agencyController.register)
router.post("/sync", requireAdmin, agencyController.syncFromStrapi)

module.exports = router
