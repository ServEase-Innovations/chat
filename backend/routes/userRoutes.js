const express = require("express");
const {
  registerUser,
  authUser,
  allUsers,
  findOrCreateUser,
  searchUsersForAdmin,
} = require("../controllers/userControllers");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/admin-search", searchUsersForAdmin);
router.route("/").get(protect, allUsers);
router.route("/").post(registerUser);
router.post("/login", authUser);
router.post("/find-or-create", findOrCreateUser);


module.exports = router;
