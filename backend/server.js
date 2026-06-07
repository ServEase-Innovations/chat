const express = require("express");
const connectDB = require("./config/db");
const dotenv = require("dotenv");
const cors = require("cors");
const {
  parseCorsOrigins,
  corsOriginCallback,
  getSocketIoCorsConfig,
  assertCorsOriginsProduction,
} = require("./lib/corsOrigins");
const userRoutes = require("./routes/userRoutes");
const chatRoutes = require("./routes/chatRoutes");
const messageRoutes = require("./routes/messageRoutes");
const presenceRoutes = require("./routes/presenceRoutes");
const { setIO } = require("./socketInstance");
const { addSocketForUser, removeSocket, getOnlineUserIds } = require("./presenceStore");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");
const requestMetrics = require("./middleware/requestMetrics");
const {
  getMetrics,
  metricsContentType,
  socketIoConnectionsTotal,
  socketIoDisconnectsTotal,
} = require("./monitoring/prometheus");
const path = require("path");

dotenv.config();

if (process.env.NODE_ENV === "production") {
  assertCorsOriginsProduction();
}

connectDB();
const app = express();
const allowedCorsOrigins = parseCorsOrigins();

app.use(
  cors({
    origin: corsOriginCallback(allowedCorsOrigins),
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Origin",
      "X-Requested-With",
      "Content-Type",
      "Accept",
      "Authorization",
    ],
    credentials: true,
    optionsSuccessStatus: 204,
  })
);

app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "chat",
    uptime: process.uptime(),
  });
});

app.get("/ready", (_req, res) => {
  const mongoose = require("mongoose");
  const ready = mongoose.connection.readyState === 1;
  res.status(ready ? 200 : 503).json({
    status: ready ? "ready" : "not_ready",
    service: "chat",
  });
});

app.get("/metrics", async (_req, res, next) => {
  try {
    res.set("Content-Type", metricsContentType);
    res.end(await getMetrics());
  } catch (err) {
    next(err);
  }
});

app.use((req, res, next) => {
  req.user = {
    _id: "admin-001",  // or dynamic
    name: "RonitMaity",
  };
  next();
});


app.use("/api/user", userRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/message", messageRoutes);
app.use("/api/presence", presenceRoutes);

// --------------------------deployment------------------------------

const __dirname1 = path.resolve();

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname1, "/frontend/build")));

  app.get("*", (req, res) =>
    res.sendFile(path.resolve(__dirname1, "frontend", "build", "index.html"))
  );
} else {
  app.get("/", (req, res) => {
    res.send("API is running..");
  });
}

// --------------------------deployment------------------------------

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const server = app.listen(
  PORT,
  console.log(`Server running on PORT ${PORT}`)
);

const io = require("socket.io")(server, {
  pingTimeout: 60000,
  cors: getSocketIoCorsConfig(),
});

setIO(io);

const broadcastPresence = () => {
  const list = getOnlineUserIds();
  io.to("admins").emit("presence:update", { online: list });
};

io.on("connection", (socket) => {
  socketIoConnectionsTotal.inc();
  console.log("Socket connected", socket.id);

  /**
   * Register who this connection is, join per-user and/or admin room, track presence.
   * Payload: { userId: string, role?: 'admin' | 'user' }
   */
  socket.on("setup", (payload) => {
    if (!payload || !payload.userId) return;
    const { userId, role } = payload;
    if (role === "admin" || String(userId) === (process.env.ADMIN_MONGO_ID || "698ace8b8ea84c91bdc93678")) {
      socket.join("admins");
    }
    addSocketForUser(userId, socket.id);
    socket.data.userId = String(userId);
    socket.join(`user:${String(userId)}`);
    console.log("setup", userId, role || "user");
    broadcastPresence();
  });

  socket.on("join chat", (room) => {
    if (room == null) return;
    const id = String(room);
    socket.join(id);
  });

  socket.on("typing", (room) => {
    if (room != null) socket.to(String(room)).emit("typing");
  });

  socket.on("stop typing", (room) => {
    if (room != null) socket.to(String(room)).emit("stop typing");
  });

  // Optional client relay: HTTP handler now rebroadcasts `message recieved` so clients
  // can omit this when using POST /api/message. Kept for older clients.
  socket.on("new message", (newMessage) => {
    const chatId = newMessage && newMessage.chat && (newMessage.chat._id || newMessage.chat);
    if (!chatId) return;
    const id = String(chatId);
    socket.to(id).emit("message recieved", newMessage);
  });

  socket.on("disconnect", () => {
    socketIoDisconnectsTotal.inc();
    removeSocket(socket.id);
    console.log("Socket disconnect", socket.id);
    broadcastPresence();
  });
});

