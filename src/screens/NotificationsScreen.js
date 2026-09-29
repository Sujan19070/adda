import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';
import { fonts, useTheme } from '../theme';
import { timeAgo } from './FeedScreen';

const TYPE_ICON = {
  mention: 'at',
  friend_request: 'person-add',
  friend_accept: 'people',
  like: 'heart-circle',
  reaction: 'heart',
  comment: 'chatbubble-ellipses',
  match: 'sparkles',
  message: 'mail',
};

export default function NotificationsScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const uid = auth.currentUser.uid;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'users', uid, 'notifications'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const unsub = onSnapshot(q, (snap) => {
      setItems(
        snap.docs.map((d) => ({
          id: d.id,
          ...d.data({ serverTimestamps: 'estimate' }),
        }))
      );
      setLoading(false);

      // Mark everything unread as read
      const unread = snap.docs.filter((d) => d.data().read === false);
      if (unread.length) {
        const batch = writeBatch(db);
        unread.forEach((d) => batch.update(d.ref, { read: true }));
        batch.commit().catch(() => {});
      }
    });
    return unsub;
  }, [uid]);

  const openTarget = (item) => {
    if (item.postId) {
      navigation.navigate('Comments', { postId: item.postId });
    } else if (['match', 'like', 'friend_request', 'friend_accept'].includes(item.type)) {
      // fromId is the other user — open their profile
      if (item.fromId) navigation.navigate('UserProfile', { userId: item.fromId });
    }
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={[styles.row, !item.read && styles.rowUnread]}
      onPress={() => openTarget(item)}
    >
      <View style={styles.iconWrap}>
        <Ionicons
          name={TYPE_ICON[item.type] || 'notifications'}
          size={18}
          color={colors.jaam}
        />
      </View>
      <View style={styles.tx}>
        <Text style={styles.text}>{item.text}</Text>
        {!!item.postText && (
          <Text style={styles.quote} numberOfLines={1}>
            "{item.postText}"
          </Text>
        )}
        <Text style={styles.time}>{timeAgo(item.createdAt)}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {!loading && items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="notifications-off-outline" size={42} color={colors.muted} />
          <Text style={styles.emptyTitle}>Nothing yet</Text>
          <Text style={styles.emptyText}>
            Reactions, comments, and matches will show up here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
        />
      )}
    </SafeAreaView>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  list: { padding: 16 },
  row: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    padding: 13,
    marginBottom: 9,
  },
  rowUnread: { borderColor: colors.jaam },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.jaamSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tx: { flex: 1 },
  text: { fontSize: 13.5, color: colors.ink, lineHeight: 19 },
  quote: { fontSize: 12, color: colors.muted, marginTop: 3, fontStyle: 'italic' },
  time: { fontSize: 11, color: colors.muted, marginTop: 4 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: {
    fontFamily: fonts.displayMedium,
    fontSize: 19,
    color: colors.ink,
    marginTop: 12,
  },
  emptyText: {
    marginTop: 6,
    color: colors.muted,
    fontSize: 13,
    textAlign: 'center',
  },
});
