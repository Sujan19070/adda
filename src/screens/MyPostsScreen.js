import React, { useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';
import { fonts, useTheme } from '../theme';
import { timeAgo } from './FeedScreen';
import { AVATAR_BY_ID } from '../anonAvatars';

const EMOJI = Object.fromEntries(
  [
    { type: 'love', emoji: '❤️' },
    { type: 'like', emoji: '👍' },
    { type: 'haha', emoji: '😂' },
    { type: 'wow', emoji: '😮' },
    { type: 'sad', emoji: '😢' },
    { type: 'angry', emoji: '😠' },
    { type: 'hot', emoji: '🥵' },
  ].map((r) => [r.type, r.emoji])
);

export default function MyPostsScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const uid = auth.currentUser.uid;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // All posts authored by me. We sort client-side (by createdAt) so this
    // works without a Firestore composite index.
    const unsub = onSnapshot(
      query(collection(db, 'posts'), where('authorId', '==', uid)),
      (snap) => {
        const rows = snap.docs.map((d) => ({
          id: d.id,
          ...d.data({ serverTimestamps: 'estimate' }),
        }));
        rows.sort(
          (a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)
        );
        setItems(rows);
        setLoading(false);
      },
      (e) => {
        console.warn('My posts listener failed', e);
        setLoading(false);
      }
    );
    return unsub;
  }, [uid]);

  const deletePost = (postId) =>
    Alert.alert('Delete post', 'Delete this post permanently? This can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteDoc(doc(db, 'posts', postId)).catch(() => {}),
      },
    ]);

  const renderItem = ({ item }) => {
    const reactCount = Object.keys(item.reactions || {}).length;
    const emojis = [
      ...new Set(Object.values(item.reactions || {}).map((r) => EMOJI[r?.type] || '❤️')),
    ].slice(0, 3);
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('Comments', { postId: item.id })}
        activeOpacity={0.8}
      >
        <View style={styles.head}>
          {item.anonymous ? (
            <View
              style={[
                styles.avatar,
                styles.anonAvatar,
                AVATAR_BY_ID[item.anonAvatar] && { backgroundColor: AVATAR_BY_ID[item.anonAvatar].bg },
              ]}
            >
              <Text style={styles.anonQ}>{AVATAR_BY_ID[item.anonAvatar]?.emoji || '?'}</Text>
            </View>
          ) : item.authorPhoto ? (
            <Image source={{ uri: item.authorPhoto }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPh]}>
              <Text style={styles.avatarInit}>
                {(item.authorName || '?')[0].toUpperCase()}
              </Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>
              {item.anonymous ? item.authorName || 'Anonymous' : 'You'}
            </Text>
            <Text style={styles.time}>
              {timeAgo(item.createdAt)}
              {item.isAdult ? '  ·  🔞 18+' : ''}
            </Text>
          </View>
          <TouchableOpacity onPress={() => deletePost(item.id)} hitSlop={8}>
            <Ionicons name="trash-outline" size={19} color={colors.danger} />
          </TouchableOpacity>
        </View>

        {!!item.text && <Text style={styles.text}>{item.text}</Text>}
        {!!item.photoBase64 && (
          <Image source={{ uri: item.photoBase64 }} style={styles.photo} />
        )}

        <View style={styles.footer}>
          <Text style={styles.footMeta}>
            {emojis.join('')} {reactCount > 0 ? reactCount : 'No reactions'}
          </Text>
          <Text style={styles.footMeta}>💬 {item.commentCount || 0}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {loading ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Loading your posts…</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="albums-outline" size={40} color={colors.muted} />
          <Text style={styles.emptyText}>You haven’t posted anything yet.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <Text style={styles.count}>
              {items.length} {items.length === 1 ? 'post' : 'posts'}
            </Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    list: { padding: 16 },
    count: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.muted,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 12,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.line,
      padding: 14,
      marginBottom: 12,
    },
    head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    avatar: { width: 40, height: 40, borderRadius: 20 },
    avatarPh: { backgroundColor: colors.jaamSoft, alignItems: 'center', justifyContent: 'center' },
    avatarInit: { fontFamily: fonts.display, fontSize: 17, color: colors.jaam },
    anonAvatar: { alignItems: 'center', justifyContent: 'center' },
    anonQ: { fontSize: 20 },
    name: { fontSize: 15, fontWeight: '700', color: colors.ink },
    time: { fontSize: 12, color: colors.muted, marginTop: 1 },
    text: { marginTop: 10, fontSize: 14, lineHeight: 21, color: colors.ink },
    photo: { width: '100%', height: 220, borderRadius: 14, marginTop: 10 },
    footer: {
      flexDirection: 'row',
      gap: 16,
      marginTop: 12,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.line,
    },
    footMeta: { fontSize: 13, color: colors.muted, fontWeight: '600' },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 30 },
    emptyText: { color: colors.muted, fontSize: 15, textAlign: 'center' },
  });
