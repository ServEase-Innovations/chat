const express = require("express");
const { getOnlineUserIds } = require("../presenceStore");
const User = require("../models/userModel");

const router = express.Router();

const adminIdOk = (q) => String(q || "") === String(process.env.ADMIN_MONGO_ID || "698ace8b8ea84c91bdc93678");

router.get("/online-ids", async (req, res) => {
  if (!adminIdOk(req.query.adminId)) {
    return res.status(403).json({ message: "Forbidden" });
  }
  try {
    const onlineIds = getOnlineUserIds();
    const users = await User.find({ _id: { $in: onlineIds } })
      .select("name")
      .lean();
    const nameById = new Map(users.map((u) => [String(u._id), u.name || null]));

    const onlineUsers = onlineIds.map((id) => ({
      id,
      name: nameById.get(String(id)) || id,
    }));

    // Keep `online` for backward compatibility, add enriched objects in `onlineUsers`.
    res.json({ online: onlineIds, onlineUsers });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[presence] online-ids error", error);
    res.status(500).json({ message: "Could not fetch online users" });
  }
});

module.exports = router;
