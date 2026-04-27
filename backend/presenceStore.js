const socketIdToUserId = new Map();
const userIdRefCount = new Map();

/**
 * A user is "online" for chat when at least one socket has emitted `setup` with that userId.
 * Multiple tabs = multiple socket ids, one ref each.
 */
function addSocketForUser(userId, socketId) {
  if (!userId || !socketId) return;
  const uid = String(userId);
  if (socketIdToUserId.has(socketId)) {
    removeSocket(socketId);
  }
  socketIdToUserId.set(socketId, uid);
  userIdRefCount.set(uid, (userIdRefCount.get(uid) || 0) + 1);
}

function removeSocket(socketId) {
  const uid = socketIdToUserId.get(socketId);
  if (!uid) return null;
  socketIdToUserId.delete(socketId);
  const next = (userIdRefCount.get(uid) || 1) - 1;
  if (next <= 0) {
    userIdRefCount.delete(uid);
  } else {
    userIdRefCount.set(uid, next);
  }
  return uid;
}

function isUserOnline(userId) {
  return userIdRefCount.has(String(userId));
}

function getOnlineUserIds() {
  return Array.from(userIdRefCount.keys());
}

module.exports = {
  addSocketForUser,
  removeSocket,
  isUserOnline,
  getOnlineUserIds,
};
