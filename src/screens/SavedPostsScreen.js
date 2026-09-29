import React, { useEffect, useState } from 'react';
import {
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
  orderBy,
  query,
} from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';
import { fonts, useTheme } from '../theme';
import { timeAgo } from './FeedScreen';
import { AVATAR_BY_ID } from '../anonAvatars';

export default function SavedPostsScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const uid = auth.currentUser.uid;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'users', uid, 'saved'), orderBy('savedAt', 'desc')),
      (snap) => {
        setItems(
          snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }))
        );
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [uid]);

  const unsave = (postId) =>
    deleteDoc(doc(db, 'users', uid, 'saved', postId)).catch(() => {});

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('Comments', { postId: item.postId })}
    >
      <View style={styles.head}>
        {item.anonymous ? (
          <View style={[styles.avatar, styles.anonAvatar, AVATAR_BY_ID[item.anonAvatar] && { backgroundColor: AVATAR_BY_ID[item.anonAvatar].bg }]}>
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
          <Text style={styles.author}>{item.authorName}</Text>
          <Text style={styles.time}>Saved {timeAgo(item.savedAt)}</Text>
        </View>
        <TouchableOpacity onPress={() => unsave(item.postId)}>
          <Ionicons name="bookmark" size={20} color={colors.jaam} />
        </TouchableOpacity>
      </View>
      {!!item.text && (
        <Text style={styles.text} numberOfLines={3}>
          {item.text}
        </Text>
      )}
      {!!item.photoBase64 && (
        <Image source={{ uri: item.photoBase64 }} style={styles.photo} />
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {!loading && items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="bookmark-outline" size={42} color={colors.muted} />
          <Text style={styles.emptyTitle}>Nothing saved yet</Text>
          <Text style={styles.emptyText}>
            Tap the bookmark on any post to keep it here.
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

const makeStyles = (colors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    list: { padding: 16 },
    card: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 16,
      padding: 13,
      marginBottom: 11,
    },
    head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    avatar: { width: 38, height: 38, borderRadius: 19 },
    anonAvatar: {
      backgroundColor: colors.jaamDark,
      alignItems: 'center',
      justifyContent: 'center',
    },
    anonQ: { color: '#fff', fontFamily: fonts.display, fontSize: 18 },
    avatarPh: {
      backgroundColor: colors.jaamSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarInit: { fontFamily: fonts.display, fontSize: 16, color: colors.jaam },
    author: { fontSize: 14, fontWeight: '700', color: colors.ink },
    time: { fontSize: 11, color: colors.muted, marginTop: 1 },
    text: { marginTop: 9, fontSize: 14, lineHeight: 20, color: colors.ink },
    photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: 12, marginTop: 9 },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    emptyTitle: {
      fontFamily: fonts.displayMedium,
      fontSize: 19,
      color: colors.ink,
      marginTop: 12,
    },
    emptyText: { marginTop: 6, color: colors.muted, fontSize: 13, textAlign: 'center' },
  });
