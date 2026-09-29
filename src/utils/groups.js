import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';

// 20 built-in public groups. Everyone is auto-joined on first app open after
// this update. IDs are stable slugs so seeding is idempotent.
export const SEED_GROUPS = [
  { id: 'g_art', name: 'Art', emoji: '🎨' },
  { id: 'g_song', name: 'Song & Music', emoji: '🎵' },
  { id: 'g_travel', name: 'Travel', emoji: '✈️' },
  { id: 'g_meeting', name: 'Meetups', emoji: '🤝' },
  { id: 'g_sad', name: 'Sad', emoji: '😢' },
  { id: 'g_angry', name: 'Angry', emoji: '😠' },
  { id: 'g_happy', name: 'Happy', emoji: '😄' },
  { id: 'g_boys', name: 'Boys', emoji: '👦' },
  { id: 'g_girls', name: 'Girls', emoji: '👧' },
  { id: 'g_adult', name: 'Adult (18+)', emoji: '🔞', adult: true },
  { id: 'g_love', name: 'Love & Dating', emoji: '💘' },
  { id: 'g_study', name: 'Study & Career', emoji: '📚' },
  { id: 'g_gaming', name: 'Gaming', emoji: '🎮' },
  { id: 'g_foodie', name: 'Foodies', emoji: '🍜' },
  { id: 'g_movies', name: 'Movies & Series', emoji: '🎬' },
  { id: 'g_sports', name: 'Sports', emoji: '⚽' },
  { id: 'g_tech', name: 'Tech & Coding', emoji: '💻' },
  { id: 'g_memes', name: 'Memes & Fun', emoji: '😂' },
  { id: 'g_night', name: 'Night Owls', emoji: '🌙' },
  { id: 'g_confession', name: 'Confessions', emoji: '🤫' },
];

// Create any missing seed groups and join the current user to all of them.
// Cheap and safe to call on every app open (writes are merges).
export async function seedAndJoinGroups() {
  const uid = auth.currentUser.uid;
  const batch = writeBatch(db);
  SEED_GROUPS.forEach((g, i) => {
    batch.set(
      doc(db, 'groups', g.id),
      {
        name: g.name,
        emoji: g.emoji,
        adult: !!g.adult,
        public: true,
        seeded: true,
        // A FIXED date per group (not serverTimestamp). This runs on every app
        // launch; a fresh "now" each time made empty groups look brand new and
        // float above real conversations in the Chats list.
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
      },
      { merge: true }
    );
    batch.set(
      doc(db, 'groups', g.id, 'members', uid),
      { joinedAt: serverTimestamp() },
      { merge: true }
    );
  });
  await batch.commit().catch((e) => console.warn('Seed groups failed', e));
}

// Create a brand-new user group and add the creator as a member.
export async function createGroup(name, emoji) {
  const uid = auth.currentUser.uid;
  const ref = doc(collection(db, 'groups'));
  await setDoc(ref, {
    name: name.trim(),
    emoji: emoji || '💬',
    adult: false,
    public: true,
    seeded: false,
    createdBy: uid,
    createdAt: serverTimestamp(),
  });
  await setDoc(doc(db, 'groups', ref.id, 'members', uid), {
    joinedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function joinGroup(groupId) {
  const uid = auth.currentUser.uid;
  await setDoc(doc(db, 'groups', groupId, 'members', uid), {
    joinedAt: serverTimestamp(),
  });
}

export async function isGroupMember(groupId) {
  const uid = auth.currentUser.uid;
  const snap = await getDoc(doc(db, 'groups', groupId, 'members', uid));
  return snap.exists();
}
