const express = require("express");
const { getOnlineUserIds } = require("../presenceStore");

const router = express.Router();

const adminIdOk = (q) => String(q || "") === String(process.env.ADMIN_MONGO_ID || "698ace8b8ea84c91bdc93678");

router.get("/online-ids", (req, res) => {
  if (!adminIdOk(req.query.adminId)) {
    return res.status(403).json({ message: "Forbidden" });
  }
  res.json({ online: getOnlineUserIds() });
});

module.exports = router;
