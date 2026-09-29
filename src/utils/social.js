import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';

// Saved posts live at users/{me}/saved/{postId} with a snapshot of the post
// so the Saved tab can render without re-reading every original post.
export async function toggleSavePost(postId, post) {
  const uid = auth.currentUser.uid;
  const ref = doc(db, 'users', uid, 'saved', postId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await deleteDoc(ref).catch(() => {});
    return false;
  }
  await setDoc(ref, {
    postId,
    authorName: post?.anonymous ? 'Anonymous' : post?.authorName || 'Someone',
    authorPhoto: post?.anonymous ? null : post?.authorPhoto || null,
    anonymous: !!post?.anonymous,
    anonAvatar: post?.anonAvatar || null,
    text: post?.text || '',
    photoBase64: post?.photoBase64 || null,
    savedAt: serverTimestamp(),
  });
  return true;
}

export async function isPostSaved(postId) {
  const uid = auth.currentUser.uid;
  const snap = await getDoc(doc(db, 'users', uid, 'saved', postId));
  return snap.exists();
}

// Reports pile up in a top-level `reports` collection for admin review.
export async function reportContent(kind, targetId, preview) {
  const uid = auth.currentUser.uid;
  await setDoc(doc(db, 'reports', `${kind}_${targetId}_${uid}`), {
    kind, // 'post' | 'comment' | 'user'
    targetId,
    preview: (preview || '').slice(0, 200),
    reportedBy: uid,
    createdAt: serverTimestamp(),
  });
}
