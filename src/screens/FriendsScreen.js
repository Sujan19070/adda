import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';
import { fonts, useTheme } from '../theme';
import { fetchMyFriends, removeFriend } from '../utils/relationships';
import { ensureChat } from '../utils/chat';

export default function FriendsScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const uid = auth.currentUser.uid;

  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [myProfile, setMyProfile] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      getDoc(doc(db, 'users', uid)).then((s) => s.exists() && setMyProfile(s.data()));
      const statuses = await fetchMyFriends();
      const acceptedIds = Object.entries(statuses)
        .filter(([, status]) => status === 'accepted')
        .map(([id]) => id);
      const profiles = await Promise.all(
        acceptedIds.map(async (fid) => {
          const snap = await getDoc(doc(db, 'users', fid));
          if (!snap.exists()) return null;
          const d = snap.data();
          return {
            id: fid,
            name: d.name || 'Adda user',
            username: d.username || '',
            photoBase64: d.photoBase64 || null,
            university: d.university || '',
          };
        })
      );
      setFriends(profiles.filter(Boolean).sort((a, b) => a.name.localeCompare(b.name)));
    } catch (e) {
      console.warn('Load friends failed', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase().replace(/^@+/, '');
    if (!q) return friends;
    return friends.filter(
      (f) => f.name.toLowerCase().includes(q) || f.username.toLowerCase().includes(q)
    );
  }, [friends, search]);

  const messageFriend = async (friend) => {
    try {
      const info = await ensureChat(
        friend.id,
        { name: friend.name, photoBase64: friend.photoBase64 },
        myProfile,
        'real'
      );
      navigation.navigate('Chat', info);
    } catch (e) {
      Alert.alert('Could not open chat', e?.message || 'Please try again.');
    }
  };

  const confirmRemove = (friend) =>
    Alert.alert('Remove friend', `Remove ${friend.name} from your friends?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await removeFriend(friend.id);
          load();
        },
      },
    ]);

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.row}
      onPress={() => navigation.navigate('UserProfile', { userId: item.id, name: item.name })}
      activeOpacity={0.8}
    >
      {item.photoBase64 ? (
        <Image source={{ uri: item.photoBase64 }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarPh]}>
          <Text style={styles.avatarInit}>{item.name[0]?.toUpperCase() || '?'}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.sub} numberOfLines={1}>
          {item.username ? `@${item.username}` : ''}
          {item.username && item.university ? ' · ' : ''}
          {item.university}
        </Text>
      </View>
      <TouchableOpacity style={styles.iconBtn} onPress={() => messageFriend(item)} hitSlop={8}>
        <Ionicons name="chatbubble-outline" size={20} color={colors.jaam} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.iconBtn} onPress={() => confirmRemove(item)} hitSlop={8}>
        <Ionicons name="person-remove-outline" size={20} color={colors.danger} />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search your friends"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
        />
      </View>

      {loading ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Loading your friends…</Text>
        </View>
      ) : visible.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="people-outline" size={40} color={colors.muted} />
          <Text style={styles.emptyText}>
            {friends.length === 0
              ? 'No friends yet — add some from Discover or a profile.'
              : 'No matches.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(f) => f.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <Text style={styles.count}>
              {friends.length} {friends.length === 1 ? 'friend' : 'friends'}
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
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 11,
      marginHorizontal: 16,
      marginTop: 12,
      marginBottom: 4,
    },
    searchInput: { flex: 1, fontSize: 15, color: colors.ink },
    list: { padding: 16 },
    count: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.muted,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 10,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.line,
      padding: 12,
      marginBottom: 10,
    },
    avatar: { width: 46, height: 46, borderRadius: 23 },
    avatarPh: { backgroundColor: colors.jaamSoft, alignItems: 'center', justifyContent: 'center' },
    avatarInit: { fontFamily: fonts.display, fontSize: 18, color: colors.jaam },
    name: { fontSize: 15.5, fontWeight: '700', color: colors.ink },
    sub: { fontSize: 12.5, color: colors.muted, marginTop: 2 },
    iconBtn: { padding: 6 },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 30 },
    emptyText: { color: colors.muted, fontSize: 15, textAlign: 'center' },
  });
