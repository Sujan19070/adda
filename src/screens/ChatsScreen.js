import React, { useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  TextInput,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  collection,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';
import { fonts, useTheme } from '../theme';
import {
  fetchMyRelationships,
  fetchMyFriends,
  setRelationship,
  toggleMute,
  fetchMyMutes,
  toggleChatPin,
  fetchMyPins,
} from '../utils/relationships';
import { AVATAR_BY_ID } from '../anonAvatars';
import AnonBanner from '../components/AnonBanner';
import { REL } from '../constants';

const FILTERS = [
  { key: 'all', label: 'All chats' },
  { key: 'pinned', label: '📌 Pinned' },
  { key: 'friend', label: '🙂 Friends' },
  { key: 'bestie', label: '⭐ Bestie' },
  { key: 'closeFriend', label: '💛 Close friend' },
  { key: 'area', label: '📍 Same area' },
];

export default function ChatsScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const uid = auth.currentUser.uid;

  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rels, setRels] = useState({});
  const [friends, setFriends] = useState({});
  const [myArea, setMyArea] = useState(null);
  const [profilesById, setProfilesById] = useState({});
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [unread, setUnread] = useState(0);
  const [tagFor, setTagFor] = useState(null); // long-pressed chat → menu
  const [mutes, setMutes] = useState(new Set());
  const [pins, setPins] = useState(new Set());
  const [groups, setGroups] = useState([]);

  const loadRels = () => {
    fetchMyRelationships().then(setRels).catch(() => {});
    fetchMyFriends().then(setFriends).catch(() => {});
    fetchMyMutes().then(setMutes).catch(() => {});
    fetchMyPins().then(setPins).catch(() => {});
  };

  useEffect(() => {
    loadRels();

    const q = query(collection(db, 'matches'), where('users', 'array-contains', uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => {
          const data = d.data({ serverTimestamps: 'estimate' });
          const otherId = data.users.find((u) => u !== uid);
          const other = data.profiles?.[otherId] || {};
          const lastMs = data.lastMessageAt?.toMillis?.() ?? 0;
          const readMs = data.reads?.[uid]?.toMillis?.() ?? 0;
          const lastFromOther =
            data.lastMessage != null && lastMs > 0 && lastMs > readMs;
          return {
            id: d.id,
            otherId,
            otherName: other.name || 'Match',
            otherPhoto: other.photoBase64 || null,
            otherAnon: !!other.anon,
            otherAnonAvatar: other.anonAvatar || null,
            identity: data.identity === 'anon' ? 'anon' : 'real',
            lastMessage: data.lastMessage,
            unread: lastFromOther,
            lastAt: lastMs,
            sortAt: lastMs || data.createdAt?.toMillis?.() || 0,
          };
        });
        setChats(items);
        setLoading(false);
      },
      (e) => {
        console.warn('Chats listener failed', e);
        setLoading(false);
      }
    );

    const unsubBell = onSnapshot(
      query(collection(db, 'users', uid, 'notifications'), where('read', '==', false)),
      (snap) => setUnread(snap.size),
      () => {}
    );

    // Groups the user belongs to (public groups auto-join). We show them in
    // the same Chats list, reading each group's own lastMessage/lastMessageAt
    // (kept up to date by GroupChatScreen on every send) — no per-group
    // subscription needed.
    const unsubGroups = onSnapshot(
      collection(db, 'groups'),
      (snap) => {
        setGroups(
          snap.docs.map((d) => {
            const g = d.data();
            // Unread uses the confirmed server times only...
            const lastMs = g.lastMessageAt?.toMillis?.() ?? 0;
            const readMs = g.reads?.[uid]?.toMillis?.() ?? 0;
            // ...while ordering/time use an estimate, so a group you just
            // wrote in jumps to the top immediately.
            const est = d.data({ serverTimestamps: 'estimate' });
            const lastAt = est.lastMessageAt?.toMillis?.() ?? 0;
            return {
              id: d.id,
              isGroup: true,
              name: g.name || 'Group',
              emoji: g.emoji || '💬',
              lastMessage: g.lastMessage || null,
              unread: g.lastMessage != null && lastMs > 0 && lastMs > readMs,
              lastAt,
              // A group nobody has written in has no activity: it sorts by its
              // last MESSAGE only (never by when it was created), so it sits
              // below real conversations.
              sortAt: lastAt,
            };
          })
        );
      },
      () => {}
    );

    return () => {
      unsub();
      unsubBell();
      unsubGroups();
    };
  }, [uid]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      const map = {};
      snap.forEach((d) => {
        const p = d.data();
        map[d.id] = { area: p.location || p.hometown || '', username: p.username || '' };
        if (d.id === uid) setMyArea(p.location || p.hometown || null);
      });
      setProfilesById(map);
    });
    return unsub;
  }, [uid]);

  const matchesSearch = (c) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase().replace(/^@+/, '');
    if (c.isGroup) return (c.name || '').toLowerCase().includes(q);
    const name = (c.otherName || '').toLowerCase();
    const uname = (profilesById[c.otherId]?.username || '').toLowerCase();
    return name.includes(q) || uname.includes(q);
  };

  const passesFilter = (c) => {
    const rel = rels[c.otherId];
    if (filter === 'all') return true;
    if (filter === 'pinned') return isPinned(c);
    if (filter === 'friend') return rel?.rel === 'friend';
    if (filter === 'bestie') return rel?.rel === 'bestie';
    if (filter === 'closeFriend') return rel?.rel === 'closeFriend';
    if (filter === 'area') {
      const theirs = profilesById[c.otherId]?.area;
      return myArea && theirs && theirs.toLowerCase() === myArea.toLowerCase();
    }
    return true;
  };

  // Pinned if either the new unified pin store OR (for DMs) the older
  // per-friend relationship pin flag says so — keeps existing pinned DMs
  // showing pinned while all new pins (DM or group) use the unified store.
  const isPinned = (item) =>
    pins.has(item.id) || (!item.isGroup && !!rels[item.otherId]?.pinned);

  const dmList = [...chats].filter(passesFilter).filter(matchesSearch);
  // Groups appear only in the "All" view alongside DMs (pinned groups still
  // show even when a specific filter like "Friends" is active, since pinning
  // isn't a friend-only concept).
  const groupList = (filter === 'all' || filter === 'pinned' ? groups : []).filter(
    (g) => (filter === 'pinned' ? isPinned(g) : true) && matchesSearch(g)
  );
  const sorted = [...dmList, ...groupList].sort((a, b) => {
    const pa = isPinned(a) ? 1 : 0;
    const pb = isPinned(b) ? 1 : 0;
    if (pa !== pb) return pb - pa;
    const diff = (b.sortAt || 0) - (a.sortAt || 0);
    if (diff !== 0) return diff;
    return (a.isGroup ? a.name : a.otherName || '').localeCompare(
      b.isGroup ? b.name : b.otherName || ''
    );
  });

  const openChat = (item) => {
    if (item.isGroup) {
      navigation.navigate('GroupChat', {
        groupId: item.id,
        groupName: item.name,
        emoji: item.emoji,
      });
      return;
    }
    navigation.navigate('Chat', {
      matchId: item.id,
      otherName: item.otherName,
      otherPhoto: item.otherPhoto,
      identity: item.identity,
    });
  };

  // Long-press to tag — only allowed for accepted friends
  const onLongPress = (item) => {
    setTagFor(item); // menu handles group vs friend-gating + mute inside
  };

  const doMute = async () => {
    if (!tagFor) return;
    await toggleMute(tagFor.id);
    const s2 = await fetchMyMutes();
    setMutes(s2);
    setTagFor(null);
  };

  const applyTag = async (relKey) => {
    if (!tagFor) return;
    const existing = rels[tagFor.otherId];
    const next = existing?.rel === relKey ? null : relKey;
    const res = await setRelationship(tagFor.otherId, next, existing);
    if (!res.ok) {
      Alert.alert('Limit reached', res.reason);
      return;
    }
    loadRels();
    setTagFor(null);
  };

  const applyPin = async () => {
    if (!tagFor) return;
    await toggleChatPin(tagFor.id, isPinned(tagFor));
    const s2 = await fetchMyPins();
    setPins(s2);
    setTagFor(null);
  };

  const renderItem = ({ item }) => {
    if (item.isGroup) {
      return (
        <TouchableOpacity
          style={styles.row}
          onPress={() => openChat(item)}
          onLongPress={() => onLongPress(item)}
          delayLongPress={350}
        >
          <View style={[styles.avatar, styles.groupAvatar]}>
            <Text style={{ fontSize: 26 }}>{item.emoji || '💬'}</Text>
          </View>
          <View style={styles.rowText}>
            <View style={styles.nameRow}>
              <Text style={[styles.name, item.unread && styles.nameUnread]} numberOfLines={1}>
                {item.name}
              </Text>
              <View style={styles.groupPill}>
                <Text style={styles.groupPillText}>Group</Text>
              </View>
              {isPinned(item) && <Text style={styles.tag}>📌</Text>}
              {mutes.has(item.id) && (
                <Ionicons name="notifications-off" size={12} color={colors.muted} />
              )}
            </View>
            <Text
              style={[styles.preview, item.unread && styles.previewUnread]}
              numberOfLines={1}
            >
              {item.lastMessage || 'Tap to join the conversation'}
            </Text>
          </View>
          <View style={styles.rightCol}>
            {!!item.lastAt && (
              <Text style={[styles.timeText, item.unread && styles.timeTextUnread]}>
                {formatListTime(item.lastAt)}
              </Text>
            )}
            {item.unread ? (
              <View style={styles.unreadDot} />
            ) : (
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            )}
          </View>
        </TouchableOpacity>
      );
    }

    const rel = rels[item.otherId];
    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => openChat(item)}
        onLongPress={() => onLongPress(item)}
        delayLongPress={350}
      >
        {item.otherAnon ? (
          <View style={[styles.avatar, styles.avatarPlaceholder, AVATAR_BY_ID[item.otherAnonAvatar] && { backgroundColor: AVATAR_BY_ID[item.otherAnonAvatar].bg }]}>
            <Text style={{ fontSize: 24 }}>{AVATAR_BY_ID[item.otherAnonAvatar]?.emoji || '?'}</Text>
          </View>
        ) : item.otherPhoto ? (
          <Image source={{ uri: item.otherPhoto }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarInitial}>
              {item.otherName[0]?.toUpperCase() || '?'}
            </Text>
          </View>
        )}
        <View style={styles.rowText}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, item.unread && styles.nameUnread]} numberOfLines={1}>
              {item.otherName}
            </Text>
            {rel?.rel === 'bestie' && <Text style={styles.tag}>⭐</Text>}
            {rel?.rel === 'closeFriend' && <Text style={styles.tag}>💛</Text>}
            {rel?.rel === 'friend' && <Text style={styles.tag}>🙂</Text>}
            {isPinned(item) && <Text style={styles.tag}>📌</Text>}
            {item.identity === 'anon' && <Text style={styles.tag}>🕶️</Text>}
            {mutes.has(item.id) && <Ionicons name="notifications-off" size={12} color={colors.muted} />}
          </View>
          <Text
            style={[styles.preview, item.unread && styles.previewUnread]}
            numberOfLines={1}
          >
            {item.lastMessage || 'You matched — say hi!'}
          </Text>
        </View>
        <View style={styles.rightCol}>
          {!!item.lastAt && (
            <Text style={[styles.timeText, item.unread && styles.timeTextUnread]}>
              {formatListTime(item.lastAt)}
            </Text>
          )}
          {item.unread ? (
            <View style={styles.unreadDot}>
              <Ionicons name="ellipse" size={11} color="#fff" />
            </View>
          ) : (
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Chats</Text>
        <View style={styles.headerBtns}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => navigation.navigate('Groups')}
          >
            <Ionicons name="people-circle-outline" size={22} color={colors.jaam} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => setShowFilter(true)}>
            <Ionicons name="options-outline" size={20} color={colors.jaam} />
            {filter !== 'all' && <View style={styles.filterDot} />}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => navigation.navigate('Notifications')}
          >
            <Ionicons name="notifications-outline" size={20} color={colors.jaam} />
            {unread > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <AnonBanner />

      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search name, @username or group"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
        />
        {!!search && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={colors.muted} />
          </TouchableOpacity>
        )}
      </View>

      {!loading && sorted.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="chatbubbles-outline" size={44} color={colors.muted} />
          <Text style={styles.emptyTitle}>No conversations here</Text>
          <Text style={styles.emptyText}>
            Message anyone from Discover — no friend request needed. Chats land here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
        />
      )}

      {/* Filter sheet */}
      <Modal visible={showFilter} transparent animationType="fade">
        <TouchableOpacity
          style={styles.sheetBack}
          activeOpacity={1}
          onPress={() => setShowFilter(false)}
        >
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Filter chats</Text>
            {FILTERS.map((f) => (
              <TouchableOpacity
                key={f.key}
                style={styles.filterRow}
                onPress={() => {
                  setFilter(f.key);
                  setShowFilter(false);
                }}
              >
                <Ionicons
                  name={filter === f.key ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={colors.jaam}
                />
                <Text style={styles.filterText}>{f.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Long-press menu: pin + mute (any chat/group) + friend tagging (friends only) */}
      <Modal visible={!!tagFor} transparent animationType="fade">
        <TouchableOpacity
          style={styles.sheetBack}
          activeOpacity={1}
          onPress={() => setTagFor(null)}
        >
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>{tagFor?.isGroup ? tagFor?.name : tagFor?.otherName}</Text>

            <TouchableOpacity style={styles.filterRow} onPress={applyPin}>
              <Text style={{ fontSize: 18 }}>📌</Text>
              <Text style={styles.filterText}>
                {tagFor && isPinned(tagFor) ? 'Unpin' : 'Pin to top'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.filterRow} onPress={doMute}>
              <Ionicons
                name={mutes.has(tagFor?.id) ? 'notifications' : 'notifications-off'}
                size={20}
                color={colors.jaam}
              />
              <Text style={styles.filterText}>
                {mutes.has(tagFor?.id) ? 'Unmute' : 'Mute this chat'}
              </Text>
            </TouchableOpacity>

            {tagFor && !tagFor.isGroup && tagFor.identity !== 'anon' && friends[tagFor.otherId] === 'accepted' ? (
              <>
                <Text style={styles.sheetHint}>Tag this friend</Text>
                {Object.values(REL).map((r) => {
                  const on = rels[tagFor?.otherId]?.rel === r.key;
                  return (
                    <TouchableOpacity key={r.key} style={styles.filterRow} onPress={() => applyTag(r.key)}>
                      <Text style={{ fontSize: 18 }}>{r.emoji}</Text>
                      <Text style={styles.filterText}>{r.label}</Text>
                      {on && (
                        <Ionicons name="checkmark-circle" size={18} color={colors.jaam} style={{ marginLeft: 'auto' }} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </>
            ) : (
              tagFor && !tagFor.isGroup && tagFor.identity !== 'anon' && (
                <Text style={styles.sheetHint}>
                  Add as a friend to tag them Bestie / Close friend.
                </Text>
              )
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

// Small WhatsApp-style time for the right side of a chat row:
// today → "3:42 PM", yesterday → "Yesterday", this week → "Mon", else "12/9/26".
function formatListTime(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const now = new Date();
  const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (days <= 0) {
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m} ${ampm}`;
  }
  if (days === 1) return 'Yesterday';
  if (days < 7) return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
  return `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`;
}

const makeStyles = (colors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 24,
      paddingTop: 6,
      paddingBottom: 12,
    },
    title: { fontFamily: fonts.display, fontSize: 30, color: colors.ink },
    headerBtns: { flexDirection: 'row', gap: 10 },
    iconBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      borderWidth: 1.5,
      borderColor: colors.line,
      backgroundColor: colors.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterDot: {
      position: 'absolute',
      top: 8,
      right: 8,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.shiuli,
    },
    badge: {
      position: 'absolute',
      top: -4,
      right: -4,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: colors.shiuli,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
    badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
    searchBar: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line,
      borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11,
      marginHorizontal: 16, marginBottom: 12,
    },
    searchInput: { flex: 1, fontSize: 15, color: colors.ink },
    list: { paddingHorizontal: 16, paddingBottom: 24 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: 18,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.line,
    },
    sep: { height: 10 },
    avatar: { width: 56, height: 56, borderRadius: 28 },
    avatarPlaceholder: {
      backgroundColor: colors.jaamSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarInitial: { fontFamily: fonts.display, fontSize: 24, color: colors.jaam },
    groupAvatar: { backgroundColor: colors.jaamSoft, alignItems: 'center', justifyContent: 'center' },
    groupPill: {
      backgroundColor: colors.jaamSoft, borderRadius: 6,
      paddingHorizontal: 6, paddingVertical: 1,
    },
    groupPillText: { fontSize: 10, fontWeight: '800', color: colors.jaam },
    rowText: { flex: 1, marginLeft: 14 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    name: { fontSize: 16, fontWeight: '700', color: colors.ink, flexShrink: 1 },
    nameUnread: { fontWeight: '900' },
    tag: { fontSize: 12 },
    preview: { marginTop: 3, fontSize: 13, color: colors.muted },
    previewUnread: { color: colors.ink, fontWeight: '700' },
    rightCol: { alignItems: 'flex-end', justifyContent: 'center', gap: 6, marginLeft: 8 },
    timeText: { fontSize: 11.5, color: colors.muted },
    timeTextUnread: { color: colors.jaam, fontWeight: '700' },
    unreadDot: {
      minWidth: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
    },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    emptyTitle: {
      fontFamily: fonts.displayMedium,
      fontSize: 20,
      color: colors.ink,
      marginTop: 14,
    },
    emptyText: {
      marginTop: 6,
      color: colors.muted,
      fontSize: 14,
      textAlign: 'center',
      lineHeight: 20,
    },
    sheetBack: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.bg,
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      padding: 22,
      paddingBottom: 34,
    },
    handle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.line,
      alignSelf: 'center',
      marginBottom: 12,
    },
    sheetTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.ink },
    sheetHint: { fontSize: 13, color: colors.muted, marginTop: 2, marginBottom: 6 },
    filterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 13,
    },
    filterText: { fontSize: 15, color: colors.ink, fontWeight: '600' },
  });
