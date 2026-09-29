import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';

/**
 * Writes an in-app notification to users/{toUid}/notifications.
 * Fire-and-forget: failures never block the action that triggered them.
 * Skips self-notifications.
 */
export function pushNotification(toUid, data) {
  const me = auth.currentUser;
  if (!me || !toUid || toUid === me.uid) return;
  addDoc(collection(db, 'users', toUid, 'notifications'), {
    ...data, // { type: 'reaction'|'comment'|'match', text, postText? }
    fromId: me.uid,
    read: false,
    createdAt: serverTimestamp(),
  }).catch(() => {});
}
