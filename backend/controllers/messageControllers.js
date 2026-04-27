const asyncHandler = require("express-async-handler");
const Message = require("../models/messageModel");
const User = require("../models/userModel");
const Chat = require("../models/chatModel");
const { getIO } = require("../socketInstance");

//@description     Get all Messages
//@route           GET /api/Message/:chatId
//@access          Protected
const allMessages = asyncHandler(async (req, res) => {
  const messages = await Message.find({ chat: req.params.chatId })
    .populate("sender", "name email")
    .populate("chat");

  res.json(messages);
});


//@description     Create New Message
//@route           POST /api/Message/
//@access          Protected
const sendMessage = asyncHandler(async (req, res) => {
  const { content, chatId, senderId } = req.body;

  if (!content || !chatId) {
    console.log("Invalid data passed into request");
    return res.sendStatus(400);
  }

  const newMessage = {
  sender: senderId,
  content,
  chat: chatId,
};

  try {
    var message = await Message.create(newMessage);

    message = await Message.findById(message._id)
      .populate("sender", "name pic email")
      .populate("chat");

    message = await User.populate(message, {
      path: "chat.users",
      select: "name pic email",
    });

    await Chat.findByIdAndUpdate(req.body.chatId, { latestMessage: message._id });

    const adminMongoId = String(process.env.ADMIN_MONGO_ID || "698ace8b8ea84c91bdc93678");
    const senderIdStr = String(
      (message.sender && message.sender._id) || message.sender
    );
    const preview =
      content && String(content).trim() ? String(content).trim().slice(0, 200) : "";

    const io = getIO();
    if (io) {
      let base;
      if (message && typeof message.toObject === "function") {
        try {
          base = message.toObject();
        } catch (e) {
          base = null;
        }
      } else {
        base = message || null;
      }
      const payload = base
        ? { ...base, _emitChatId: String(chatId) }
        : {
            _id: message && message._id,
            content,
            chat: String(chatId),
            _emitChatId: String(chatId),
            sender: { _id: senderIdStr, name: (message.sender && message.sender.name) || "User" },
          };
      // Everyone in the chat view gets the full message (incl. sender, for de-dupe in clients).
      io.to(String(chatId)).emit("message recieved", payload);
      let userList = (message.chat && message.chat.users) || [];
      if (!userList.length) {
        const cdoc = await Chat.findById(chatId).lean();
        userList = (cdoc && cdoc.users) || [];
      }
      for (const uid of userList) {
        const peer = String((uid && uid._id) || uid);
        if (peer && peer !== senderIdStr) {
            io.to(`user:${peer}`).emit("chat notification", {
              chatId: String(chatId),
              message: payload,
              preview,
              fromName: (message.sender && message.sender.name) || "User",
            });
        }
      }
      const fromAdmin = senderIdStr === adminMongoId;
      io.to("admins").emit("admin chat activity", {
        type: "new_message",
        chatId: String(chatId),
        preview,
        fromName: (message.sender && message.sender.name) || (fromAdmin ? "Admin" : "User"),
        fromCustomer: !fromAdmin,
      });
    }

    res.json(message);
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
});

module.exports = { allMessages, sendMessage };
