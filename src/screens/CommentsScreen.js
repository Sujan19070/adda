import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useHeaderHeight } from '@react-navigation/elements';
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';
import { fonts, useTheme } from '../theme';
import { useBottomInset } from '../utils/insets';
import { pushNotification } from '../utils/notify';
import { reportContent, toggleSavePost } from '../utils/social';
import { timeAgo } from './FeedScreen';
import { AVATAR_BY_ID } from '../anonAvatars';
import MentionInput, { MentionText } from '../components/MentionInput';

const EMOJI = { love: '❤️', like: '👍', haha: '😂', wow: '😮', sad: '😢', angry: '😠' };
const COMMENT_REACTIONS = [
  { type: 'love', emoji: '❤️' },
  { type: 'like', emoji: '👍' },
  { type: 'haha', emoji: '😂' },
  { type: 'wow', emoji: '😮' },
  { type: 'sad', emoji: '😢' },
  { type: 'angry', emoji: '😠' },
];

export default function CommentsScreen({ route, navigation }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const uid = auth.currentUser.uid;
  const { postId } = route.params;
  const headerHeight = useHeaderHeight();
  const bottomInset = useBottomInset();

  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [myProfile, setMyProfile] = useState(null);
  const [saved, setSaved] = useState(false);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [mentioned, setMentioned] = useState([]);
  const [reactPickerFor, setReactPickerFor] = useState(null);
  const [whoReacted, setWhoReacted] = useState(null); // comment whose reactors we show
  const [reactorNames, setReactorNames] = useState({}); // uid -> name

  useEffect(() => {
    const unsubPost = onSnapshot(doc(db, 'posts', postId), (s) => {
      if (s.exists()) setPost({ id: s.id, ...s.data({ serverTimestamps: 'estimate' }) });
      else navigation.goBack();
    });
    const unsubComments = onSnapshot(
      query(collection(db, 'posts', postId, 'comments'), orderBy('createdAt', 'asc')),
      (snap) =>
        setComments(
          snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }))
        )
    );
    const unsubMe = onSnapshot(doc(db, 'users', uid), (s) => {
      if (s.exists()) setMyProfile(s.data());
    });
    const unsubSaved = onSnapshot(doc(db, 'users', uid, 'saved', postId), (s) =>
      setSaved(s.exists())
    );
    return () => {
      unsubPost();
      unsubComments();
      unsubMe();
      unsubSaved();
    };
  }, [postId, uid]);

  const myName = myProfile?.name || 'Someone';

  useEffect(() => {
    if (!whoReacted) return;
    const ids = Object.keys(whoReacted.reactions || {});
    Promise.all(
      ids.map(async (rid) => {
        if (rid === uid) return [rid, 'You'];
        try {
          const p2 = await getDoc(doc(db, 'users', rid));
          return [rid, p2.exists() ? p2.data().name || 'Someone' : 'Someone'];
        } catch {
          return [rid, 'Someone'];
        }
      })
    ).then((pairs) => setReactorNames(Object.fromEntries(pairs)));
  }, [whoReacted, uid]);

  // Split into top-level comments and their replies
  const { tops, threadReplies } = useMemo(() => {
    const tops = [];
    const byId = Object.fromEntries(comments.map((c) => [c.id, c]));
    const directChildren = {};
    comments.forEach((c) => {
      if (c.replyToId) (directChildren[c.replyToId] ||= []).push(c);
      else tops.push(c);
    });
    // Walk up the reply chain to find which TOP comment each reply belongs to.
    const rootOf = (c) => {
      let cur = c;
      let guard = 0;
      while (cur.replyToId && byId[cur.replyToId] && guard < 50) {
        cur = byId[cur.replyToId];
        guard++;
      }
      return cur.id;
    };
    // All replies (any depth) grouped under their top comment, in time order.
    const threadReplies = {};
    comments.forEach((c) => {
      if (!c.replyToId) return;
      const root = rootOf(c);
      (threadReplies[root] ||= []).push(c);
    });
    Object.values(threadReplies).forEach((arr) =>
      arr.sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0))
    );
    return { tops, threadReplies };
  }, [comments]);

  const goToProfile = (userId, name) => {
    if (userId === uid) navigation.navigate('Profile');
    else navigation.navigate('UserProfile', { userId, name });
  };

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setText('');
    const anon = post?.anonymous ? false : false; // comments are never anonymous
    try {
      await addDoc(collection(db, 'posts', postId, 'comments'), {
        authorId: uid,
        authorName: myName,
        authorPhoto: myProfile?.photoBase64 || null,
        text: replyTo ? `@${replyTo.authorName} ${trimmed}` : trimmed,
        replyToId: replyTo?.id || null,
        replyToName: replyTo?.authorName || null,
        reactions: {},
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'posts', postId), { commentCount: increment(1) });
      if (post?.authorId && post.authorId !== uid) {
        pushNotification(post.authorId, {
          type: 'comment',
          text: `${myName} commented: "${trimmed.slice(0, 60)}"`,
          postId,
        });
      }
      if (replyTo && replyTo.authorId !== uid && replyTo.authorId !== post?.authorId) {
        pushNotification(replyTo.authorId, {
          type: 'comment',
          text: `${myName} replied to you: "${trimmed.slice(0, 60)}"`,
          postId,
        });
      }
      // Notify anyone @mentioned (whose nickname appears in the text)
      const notified = new Set([post?.authorId, replyTo?.authorId, uid]);
      mentioned.forEach((mn) => {
        if (mn.name && trimmed.includes('@' + mn.name) && !notified.has(mn.id)) {
          notified.add(mn.id);
          pushNotification(mn.id, {
            type: 'mention',
            text: `${myName} mentioned you: "${trimmed.slice(0, 60)}"`,
            postId,
          });
        }
      });
      setMentioned([]);
      setReplyTo(null);
    } catch (e) {
      console.warn('Comment failed', e);
    }
  };

  const reactComment = async (c, type) => {
    const mine = c.reactions?.[uid];
    try {
      await updateDoc(doc(db, 'posts', postId, 'comments', c.id), {
        [`reactions.${uid}`]: mine === type ? deleteField() : type,
      });
    } catch (e) {
      console.warn('React failed', e);
    }
  };

  const deleteComment = (c) =>
    Alert.alert('Delete comment', 'Remove this comment?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteDoc(doc(db, 'posts', postId, 'comments', c.id)).catch(() => {});
          await updateDoc(doc(db, 'posts', postId), { commentCount: increment(-1) }).catch(
            () => {}
          );
        },
      },
    ]);

  const reportPost = () =>
    Alert.alert('Report post', 'Report this post to the Adda team?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Report',
        style: 'destructive',
        onPress: async () => {
          await reportContent('post', postId, post?.text || '');
          Alert.alert('Reported', 'Thanks — our team will review it.');
        },
      },
    ]);

  const isAnon = !!post?.anonymous;
  const authorName = isAnon ? 'Anonymous' : post?.authorName;

  const renderComment = (c, isReply = false) => {
    const reactCount = Object.keys(c.reactions || {}).length;
    const mine = c.reactions?.[uid];
    return (
      <View key={c.id} style={[styles.commentRow, isReply && styles.replyRow]}>
        <TouchableOpacity onPress={() => goToProfile(c.authorId, c.authorName)}>
          {c.authorPhoto ? (
            <Image source={{ uri: c.authorPhoto }} style={styles.cAvatar} />
          ) : (
            <View style={[styles.cAvatar, styles.cAvatarPh]}>
              <Text style={styles.cAvatarInit}>
                {(c.authorName || '?')[0].toUpperCase()}
              </Text>
            </View>
          )}
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.cBubble}>
            <TouchableOpacity onPress={() => goToProfile(c.authorId, c.authorName)}>
              <Text style={styles.cName}>
                {c.authorId === uid ? 'You' : c.authorName}
              </Text>
            </TouchableOpacity>
            <MentionText text={c.text} style={styles.cText} mentionStyle={styles.mentionHl} />
          </View>
          {reactPickerFor === c.id && (
            <View style={styles.cReactPicker}>
              {COMMENT_REACTIONS.map((r) => (
                <TouchableOpacity
                  key={r.type}
                  style={[styles.cReactOpt, mine === r.type && styles.cReactOptSel]}
                  onPress={() => {
                    reactComment(c, r.type);
                    setReactPickerFor(null);
                  }}
                >
                  <Text style={{ fontSize: 22 }}>{r.emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <View style={styles.cActions}>
            <Text style={styles.cTime}>{timeAgo(c.createdAt)}</Text>
            <TouchableOpacity
              style={[styles.cReactBtn, mine && styles.cReactBtnOn]}
              onPress={() => setReactPickerFor(reactPickerFor === c.id ? null : c.id)}
              activeOpacity={0.7}
            >
              {mine ? (
                <Text style={{ fontSize: 14 }}>{EMOJI[mine]}</Text>
              ) : (
                <Ionicons name="happy-outline" size={15} color={colors.muted} />
              )}
              <Text style={[styles.cReactBtnText, mine && styles.cReactBtnTextOn]}>
                {mine ? 'Reacted' : 'React'}
              </Text>
            </TouchableOpacity>
            {reactCount > 0 && (
              <TouchableOpacity onPress={() => setWhoReacted(c)}>
                <Text style={styles.cReactCount}>
                  {[...new Set(Object.values(c.reactions || {}).map((t) => EMOJI[t] || '❤️'))].join('')} {reactCount}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => setReplyTo(c)}>
              <Text style={styles.cReply}>Reply</Text>
            </TouchableOpacity>
            {c.authorId === uid && (
              <TouchableOpacity onPress={() => deleteComment(c)}>
                <Text style={styles.cDelete}>Delete</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior="padding"
      keyboardVerticalOffset={headerHeight}
    >
      <FlatList
        data={tops}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View>
            {renderComment(item)}
            {(threadReplies[item.id] || []).map((r) => renderComment(r, true))}
          </View>
        )}
        ListHeaderComponent={
          post ? (
            <View style={styles.postCard}>
              <View style={styles.postHead}>
                {isAnon ? (
                  <View style={[styles.pAvatar, styles.anonAvatar, AVATAR_BY_ID[post.anonAvatar] && { backgroundColor: AVATAR_BY_ID[post.anonAvatar].bg }]}>
                    <Text style={styles.anonQ}>{AVATAR_BY_ID[post.anonAvatar]?.emoji || '?'}</Text>
                  </View>
                ) : (
                  <TouchableOpacity onPress={() => goToProfile(post.authorId, post.authorName)}>
                    {post.authorPhoto ? (
                      <Image source={{ uri: post.authorPhoto }} style={styles.pAvatar} />
                    ) : (
                      <View style={[styles.pAvatar, styles.cAvatarPh]}>
                        <Text style={styles.cAvatarInit}>
                          {(authorName || '?')[0].toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.pName}>{authorName}</Text>
                  <Text style={styles.pMeta}>
                    {isAnon ? 'Identity hidden · ' : ''}
                    {timeAgo(post.createdAt)}
                  </Text>
                </View>
                {isAnon && (
                  <View style={styles.anonBadge}>
                    <Ionicons name="eye-off-outline" size={12} color={colors.jaam} />
                    <Text style={styles.anonBadgeText}>Anon</Text>
                  </View>
                )}
              </View>

              {!!post.text && <Text style={styles.pText}>{post.text}</Text>}
              {!!post.photoBase64 && (
                <Image source={{ uri: post.photoBase64 }} style={styles.pPhoto} />
              )}

              <View style={styles.pActions}>
                <TouchableOpacity
                  style={styles.pAction}
                  onPress={() => toggleSavePost(postId, post)}
                >
                  <Ionicons
                    name={saved ? 'bookmark' : 'bookmark-outline'}
                    size={18}
                    color={saved ? colors.jaam : colors.muted}
                  />
                  <Text style={[styles.pActionText, saved && { color: colors.jaam }]}>
                    {saved ? 'Saved' : 'Save'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.pAction} onPress={reportPost}>
                  <Ionicons name="flag-outline" size={18} color={colors.muted} />
                  <Text style={styles.pActionText}>Report</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.commentsHeader}>COMMENTS</Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <Text style={styles.noComments}>No comments yet — start the adda.</Text>
        }
      />

      {!!replyTo && (
        <View style={styles.replyBar}>
          <Text style={styles.replyBarText} numberOfLines={1}>
            Replying to @{replyTo.authorName}
          </Text>
          <TouchableOpacity onPress={() => setReplyTo(null)}>
            <Ionicons name="close" size={16} color={colors.muted} />
          </TouchableOpacity>
        </View>
      )}

      <View style={[styles.inputRow, { paddingBottom: 12 + bottomInset }]}>
        <MentionInput
          value={text}
          onChangeText={setText}
          onMention={(p2) => setMentioned((m) => [...m, p2])}
          placeholder="Write a comment… use @ to mention"
          style={{ flex: 1 }}
          inputStyle={styles.input}
          maxLength={500}
        />
        <TouchableOpacity
          style={[styles.sendBtn, !text.trim() && { opacity: 0.4 }]}
          onPress={send}
          disabled={!text.trim()}
        >
          <Ionicons name="send" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
      <Modal visible={!!whoReacted} transparent animationType="slide">
        <TouchableOpacity
          style={styles.whoBack}
          activeOpacity={1}
          onPress={() => setWhoReacted(null)}
        >
          <View style={styles.whoSheet}>
            <View style={styles.whoHandle} />
            <Text style={styles.whoTitle}>Reactions</Text>
            {whoReacted &&
              Object.entries(whoReacted.reactions || {}).map(([ruid, type]) => (
                <View key={ruid} style={styles.whoRow}>
                  <Text style={{ fontSize: 22 }}>{EMOJI[type] || '❤️'}</Text>
                  <Text style={styles.whoName}>
                    {reactorNames[ruid] || (ruid === uid ? 'You' : 'Someone')}
                  </Text>
                </View>
              ))}
            {whoReacted && Object.keys(whoReacted.reactions || {}).length === 0 && (
              <Text style={styles.whoEmpty}>No reactions yet.</Text>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.bg },
    list: { padding: 16, paddingBottom: 20 },
    postCard: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 18,
      padding: 14,
      marginBottom: 8,
    },
    postHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    pAvatar: { width: 44, height: 44, borderRadius: 22 },
    anonAvatar: {
      backgroundColor: colors.jaamDark,
      alignItems: 'center',
      justifyContent: 'center',
    },
    anonQ: { color: '#fff', fontFamily: fonts.display, fontSize: 22 },
    cAvatarPh: {
      backgroundColor: colors.jaamSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pName: { fontSize: 15, fontWeight: '800', color: colors.ink },
    pMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
    anonBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.jaamSoft,
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 4,
    },
    anonBadgeText: { fontSize: 11, fontWeight: '700', color: colors.jaam },
    pText: { marginTop: 10, fontSize: 15, lineHeight: 22, color: colors.ink },
    pPhoto: { width: '100%', aspectRatio: 4 / 3, borderRadius: 12, marginTop: 10 },
    pActions: {
      flexDirection: 'row',
      gap: 20,
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.line,
    },
    pAction: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    pActionText: { fontSize: 13, fontWeight: '700', color: colors.muted },
    commentsHeader: {
      marginTop: 14,
      fontSize: 12,
      fontWeight: '800',
      color: colors.muted,
      letterSpacing: 1,
    },
    commentRow: { flexDirection: 'row', gap: 9, marginBottom: 12 },
    replyRow: { marginTop: 8, marginBottom: 4, marginLeft: 34 },
    cAvatar: { width: 36, height: 36, borderRadius: 18 },
    cAvatarInit: { fontFamily: fonts.display, fontSize: 15, color: colors.jaam },
    cBubble: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 16,
      borderTopLeftRadius: 4,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    cName: { fontSize: 13, fontWeight: '800', color: colors.ink },
    cText: { fontSize: 14, color: colors.ink, marginTop: 2, lineHeight: 20 },
    mentionHl: { color: colors.jaam, fontWeight: '700' },
    whoBack: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    whoSheet: {
      backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24,
      padding: 20, paddingBottom: 32, maxHeight: '70%',
    },
    whoHandle: {
      width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line,
      alignSelf: 'center', marginBottom: 12,
    },
    whoTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.ink, marginBottom: 12 },
    whoRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10,
      borderBottomWidth: 1, borderBottomColor: colors.line,
    },
    whoName: { fontSize: 15, color: colors.ink, fontWeight: '600' },
    whoEmpty: { color: colors.muted, fontSize: 14, paddingVertical: 12 },
    cActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      marginTop: 6,
      marginLeft: 8,
    },
    cTime: { fontSize: 11, color: colors.muted },
    cReactCount: { fontSize: 12, color: colors.jaam, fontWeight: '700' },
    cReactBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      paddingHorizontal: 11, paddingVertical: 5, borderRadius: 999,
      borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card,
    },
    cReactBtnOn: { backgroundColor: colors.jaamSoft, borderColor: colors.jaam },
    cReactBtnText: { fontSize: 12.5, fontWeight: '700', color: colors.muted },
    cReactBtnTextOn: { color: colors.jaam },
    cReactPicker: {
      flexDirection: 'row', gap: 4, alignSelf: 'flex-start',
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line,
      borderRadius: 22, paddingHorizontal: 8, paddingVertical: 6,
      marginTop: 6, marginLeft: 8,
      shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 }, elevation: 3,
    },
    cReactOpt: { padding: 5, borderRadius: 999 },
    cReactOptSel: { backgroundColor: colors.jaamSoft },
    cReply: { fontSize: 12.5, color: colors.jaam, fontWeight: '800' },
    cDelete: { fontSize: 12.5, color: colors.danger, fontWeight: '700' },
    noComments: { color: colors.muted, fontSize: 14, textAlign: 'center', marginTop: 20 },
    replyBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.jaamSoft,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    replyBarText: { fontSize: 13, color: colors.jaam, fontWeight: '600', flex: 1 },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
      padding: 12,
      borderTopWidth: 1,
      borderTopColor: colors.line,
      backgroundColor: colors.bg,
    },
    input: {
      flex: 1,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 22,
      paddingHorizontal: 16,
      paddingVertical: 10,
      fontSize: 14,
      color: colors.ink,
      maxHeight: 100,
    },
    sendBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: colors.jaam,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
