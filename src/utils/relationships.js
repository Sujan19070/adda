import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';
import { pushNotification } from './notify';
import { REL } from '../constants';

// Relationships live at users/{me}/relationships/{otherId}
//   { rel: 'friend'|'bestie'|'closeFriend', pinned: bool, updatedAt }
// Blocks live at users/{me}/blocks/{otherId} = { at }

const relCol = (uid) => collection(db, 'users', uid, 'relationships');
const relDoc = (uid, other) => doc(db, 'users', uid, 'relationships', other);
const blockDoc = (uid, other) => doc(db, 'users', uid, 'blocks', other);

/** All of my relationship docs → { otherId: {rel, pinned} }. */
export async function fetchMyRelationships() {
  const uid = auth.currentUser.uid;
  const snap = await getDocs(relCol(uid));
  const map = {};
  snap.forEach((d) => (map[d.id] = d.data()));
  return map;
}

/** Count how many people I've tagged with a given rel (for caps). */
export async function countRel(relKey) {
  const uid = auth.currentUser.uid;
  const snap = await getDocs(query(relCol(uid), where('rel', '==', relKey)));
  return snap.size;
}

/**
 * Set (or clear) a relationship label. Enforces bestie(1)/closeFriend(2)
 * caps. Returns { ok } or { ok:false, reason }.
 */
export async function setRelationship(otherId, relKey, existing) {
  const uid = auth.currentUser.uid;
  if (!relKey) {
    // clearing the label but keep pin state if pinned
    const cur = existing || (await getDoc(relDoc(uid, otherId))).data();
    if (cur?.pinned) {
      await setDoc(relDoc(uid, otherId), { pinned: true, updatedAt: serverTimestamp() });
    } else {
      await deleteDoc(relDoc(uid, otherId)).catch(() => {});
    }
    return { ok: true };
  }

  const cap = REL[relKey]?.max;
  if (cap != null) {
    const alreadyThis = existing?.rel === relKey;
    if (!alreadyThis) {
      const count = await countRel(relKey);
      if (count >= cap) {
        return {
          ok: false,
          reason: `You can only have ${cap} ${REL[relKey].label.toLowerCase()}${
            cap > 1 ? 's' : ''
          }.`,
        };
      }
    }
  }
  await setDoc(
    relDoc(uid, otherId),
    { rel: relKey, pinned: existing?.pinned || false, updatedAt: serverTimestamp() },
    { merge: true }
  );
  return { ok: true };
}

export async function togglePin(otherId, existing) {
  const uid = auth.currentUser.uid;
  const pinned = !existing?.pinned;
  await setDoc(
    relDoc(uid, otherId),
    { pinned, rel: existing?.rel || null, updatedAt: serverTimestamp() },
    { merge: true }
  );
  return pinned;
}

/* ---------------- blocking ---------------- */

export async function blockUser(otherId) {
  const uid = auth.currentUser.uid;
  await setDoc(blockDoc(uid, otherId), { at: serverTimestamp() });
}

export async function unblockUser(otherId) {
  const uid = auth.currentUser.uid;
  await deleteDoc(blockDoc(uid, otherId)).catch(() => {});
}

export async function isBlocked(otherId) {
  const uid = auth.currentUser.uid;
  const snap = await getDoc(blockDoc(uid, otherId));
  return snap.exists();
}

/** Set of ids I've blocked. */
export async function fetchMyBlocks() {
  const uid = auth.currentUser.uid;
  const snap = await getDocs(collection(db, 'users', uid, 'blocks'));
  const set = new Set();
  snap.forEach((d) => set.add(d.id));
  return set;
}

/**
 * True if messaging between me and other is blocked EITHER direction.
 * (I blocked them, or they blocked me.)
 */
export async function messagingBlocked(otherId) {
  const uid = auth.currentUser.uid;
  const [mine, theirs] = await Promise.all([
    getDoc(blockDoc(uid, otherId)),
    getDoc(blockDoc(otherId, uid)),
  ]);
  return mine.exists() || theirs.exists();
}

/* ---------------- friend requests ---------------- */
// Friend state lives at users/{me}/friends/{otherId} = { status, at }
//   status: 'pending_out' (I sent) | 'pending_in' (they sent) | 'accepted'
// Sending a request writes pending_out on my side and pending_in on theirs.
// Accepting flips both to 'accepted'. This is a connection layer only — it
// never gates messaging (blocking is the only wall).

const friendDoc = (uid, other) => doc(db, 'users', uid, 'friends', other);

export async function sendFriendRequest(otherId, myName) {
  const uid = auth.currentUser.uid;
  await setDoc(friendDoc(uid, otherId), { status: 'pending_out', at: serverTimestamp() });
  await setDoc(friendDoc(otherId, uid), { status: 'pending_in', at: serverTimestamp() });
  pushNotification(otherId, {
    type: 'friend_request',
    text: `${myName || 'Someone'} sent you a friend request`,
  });
}

export async function acceptFriendRequest(otherId, myName) {
  const uid = auth.currentUser.uid;
  await setDoc(friendDoc(uid, otherId), { status: 'accepted', at: serverTimestamp() });
  await setDoc(friendDoc(otherId, uid), { status: 'accepted', at: serverTimestamp() });
  pushNotification(otherId, {
    type: 'friend_accept',
    text: `${myName || 'Someone'} accepted your friend request 🎉`,
  });
}

export async function declineOrCancelFriend(otherId) {
  const uid = auth.currentUser.uid;
  await deleteDoc(friendDoc(uid, otherId)).catch(() => {});
  await deleteDoc(friendDoc(otherId, uid)).catch(() => {});
}

export async function removeFriend(otherId) {
  const uid = auth.currentUser.uid;
  await deleteDoc(friendDoc(uid, otherId)).catch(() => {});
  await deleteDoc(friendDoc(otherId, uid)).catch(() => {});
  // Also clear any relationship label since they're no longer friends
  await deleteDoc(relDoc(uid, otherId)).catch(() => {});
}

export async function getFriendStatus(otherId) {
  const uid = auth.currentUser.uid;
  const snap = await getDoc(friendDoc(uid, otherId));
  return snap.exists() ? snap.data().status : null; // null = not connected
}

export async function fetchMyFriends() {
  const uid = auth.currentUser.uid;
  const snap = await getDocs(collection(db, 'users', uid, 'friends'));
  const map = {};
  snap.forEach((d) => (map[d.id] = d.data().status));
  return map; // { otherId: status }
}

/* ---------------- mute ---------------- */
// Muted chats/groups live at users/{me}/mutes/{targetId} = { at }
export async function toggleMute(targetId) {
  const uid = auth.currentUser.uid;
  const ref = doc(db, 'users', uid, 'mutes', targetId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await deleteDoc(ref).catch(() => {});
    return false;
  }
  await setDoc(ref, { at: serverTimestamp() });
  return true;
}

export async function fetchMyMutes() {
  const uid = auth.currentUser.uid;
  const snap = await getDocs(collection(db, 'users', uid, 'mutes'));
  const set = new Set();
  snap.forEach((d) => set.add(d.id));
  return set;
}

/* ---------------- pins (works for BOTH DM chats and groups) ---------------- */
// Pinned chats/groups live at users/{me}/pins/{targetId} = { pinned, at }
// targetId is the chat's matchId (for DMs) or the group's id (for groups).
// This is separate from the older per-friend relationship "pinned" flag so
// existing pinned DM chats keep working; both are checked when reading.
export async function toggleChatPin(targetId, currentlyPinned) {
  const uid = auth.currentUser.uid;
  const pinned = !currentlyPinned;
  await setDoc(
    doc(db, 'users', uid, 'pins', targetId),
    { pinned, at: serverTimestamp() },
    { merge: true }
  );
  return pinned;
}

export async function fetchMyPins() {
  const uid = auth.currentUser.uid;
  const snap = await getDocs(collection(db, 'users', uid, 'pins'));
  const set = new Set();
  snap.forEach((d) => {
    if (d.data().pinned) set.add(d.id);
  });
  return set;
}
