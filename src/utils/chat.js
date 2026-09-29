import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';
import { AVATAR_BY_ID } from '../anonAvatars';

// A chat thread id encodes BOTH participants (sorted) AND the identity mode,
// so the same two people can hold a separate "real" thread and "anon" thread.
//   real  →  {uidA}_{uidB}
//   anon  →  {uidA}_{uidB}__anon
export function chatId(a, b, identity) {
  const base = [a, b].sort().join('_');
  return identity === 'anon' ? `${base}__anon` : base;
}

// Opens (creating if needed) the chat thread with `otherId` for the given
// identity, then hands back the matchId + display info for navigation.
// In anonymous threads the *stored* profile for me is my anon name/avatar,
// so the other person never sees my real name — but my real uid is still in
// `users[]` under the hood so blocking works on the account.
export async function ensureChat(otherId, otherProfile, myProfile, identity) {
  const uid = auth.currentUser.uid;
  if (!otherId) throw new Error('No recipient — their profile did not load yet.');
  if (otherId === uid) throw new Error("You can't message yourself.");

  const id = chatId(uid, otherId, identity);
  const ref = doc(db, 'matches', id);
  const snap = await getDoc(ref);

  const anon = identity === 'anon';
  const av = anon ? AVATAR_BY_ID[myProfile?.anonAvatar] : null;

  const myShownName = anon ? myProfile?.anonName || 'Anonymous' : myProfile?.name || 'You';
  const myShownPhoto = anon ? null : myProfile?.photoBase64 || null;

  // A doc "exists" but might be malformed if it was created by an older
  // version of this flow (missing `users`, or missing my/their entry in
  // `profiles`). Treat that the same as "needs (re)creating" instead of
  // silently opening a broken thread.
  const data = snap.exists() ? snap.data() : null;
  const needsInit =
    !data ||
    !Array.isArray(data.users) ||
    data.users.length !== 2 ||
    !data.users.includes(uid) ||
    !data.users.includes(otherId);

  if (needsInit) {
    await setDoc(
      ref,
      {
        users: [uid, otherId].sort(),
        identity: anon ? 'anon' : 'real',
        profiles: {
          [uid]: {
            name: myShownName,
            photoBase64: myShownPhoto,
            anon,
            anonAvatar: anon ? myProfile?.anonAvatar || 'a01' : null,
          },
          [otherId]: {
            name: otherProfile?.name || 'Match',
            photoBase64: otherProfile?.photoBase64 || null,
            anon: false,
            anonAvatar: null,
          },
        },
        createdAt: serverTimestamp(),
        lastMessage: data?.lastMessage ?? null,
        lastMessageAt: data?.lastMessageAt ?? null,
      },
      { merge: true }
    );
  } else if (anon) {
    // keep my anon display fresh in case I changed my anon identity
    await setDoc(
      ref,
      {
        profiles: {
          [uid]: {
            name: myShownName,
            photoBase64: null,
            anon: true,
            anonAvatar: myProfile?.anonAvatar || 'a01',
          },
        },
      },
      { merge: true }
    );
  }

  return {
    matchId: id,
    otherName: otherProfile?.name || 'Match',
    otherPhoto: otherProfile?.photoBase64 || null,
    identity: anon ? 'anon' : 'real',
  };
}
