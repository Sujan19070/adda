import {
  collection,
  getDoc,
  getDocs,
  doc,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';

// Builds the list of people to suggest when someone types "@".
// Priority: my friends first, then people I've recently chatted with, then
// (as the user keeps typing) a username lookup across all users.
export async function fetchMentionCandidates() {
  const uid = auth.currentUser.uid;
  const map = {}; // id -> { id, name, username, photo, rank }

  // Friends
  try {
    const fr = await getDocs(collection(db, 'users', uid, 'friends'));
    const friendIds = fr.docs
      .filter((d) => d.data().status === 'accepted')
      .map((d) => d.id);
    await Promise.all(
      friendIds.map(async (fid) => {
        const p = await getDoc(doc(db, 'users', fid));
        if (p.exists()) {
          const d = p.data();
          map[fid] = { id: fid, name: d.name, username: d.username, photo: d.photoBase64 || null, rank: 0 };
        }
      })
    );
  } catch {}

  // Recent chats (DM threads I'm in)
  try {
    const chats = await getDocs(
      query(collection(db, 'matches'), where('users', 'array-contains', uid))
    );
    const others = [];
    chats.forEach((d) => {
      const data = d.data();
      if (data.identity === 'anon') return; // don't suggest anon threads
      const o = data.users.find((u) => u !== uid);
      if (o && !map[o]) others.push(o);
    });
    await Promise.all(
      others.slice(0, 20).map(async (oid) => {
        const p = await getDoc(doc(db, 'users', oid));
        if (p.exists()) {
          const d = p.data();
          map[oid] = { id: oid, name: d.name, username: d.username, photo: d.photoBase64 || null, rank: 1 };
        }
      })
    );
  } catch {}

  return Object.values(map).sort((a, b) => a.rank - b.rank);
}

// Look up users by username prefix (for mentioning people who aren't friends
// or recent chats). Firestore can't do prefix search natively, so we pull a
// capped set and filter client-side.
export async function searchUsersByUsername(prefix) {
  const p = prefix.trim().toLowerCase().replace(/^@+/, '');
  if (!p) return [];
  try {
    const snap = await getDocs(query(collection(db, 'users'), limit(200)));
    const out = [];
    snap.forEach((d) => {
      const data = d.data();
      const uname = (data.username || '').toLowerCase();
      const name = (data.name || '').toLowerCase();
      if (uname.startsWith(p) || uname.includes(p) || name.includes(p)) {
        out.push({ id: d.id, name: data.name, username: data.username, photo: data.photoBase64 || null });
      }
    });
    return out.slice(0, 8);
  } catch {
    return [];
  }
}
