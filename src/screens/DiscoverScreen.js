import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';
import { fonts, useTheme } from '../theme';
import { ensureChat } from '../utils/chat';
import SearchablePicker from '../components/SearchablePicker';
import AnonBanner from '../components/AnonBanner';
import { BD_INSTITUTIONS } from '../data/bdInstitutions';
import { BD_DISTRICTS, BD_DISTRICTS_UPAZILAS } from '../data/bdGeo';
import { updateMyLocation, distanceKm } from '../utils/location';
import { pushNotification } from '../utils/notify';
import {
  fetchMyBlocks,
  fetchMyFriends,
  sendFriendRequest,
  acceptFriendRequest,
  removeFriend,
  blockUser,
} from '../utils/relationships';

const ACTIVE_WINDOW_MS = 10 * 60 * 1000;

const EMPTY_FILTERS = {
  status: 'all',
  district: '',
  upazila: '',
  nearMe: false,
  hometown: '',
  location: '',
  university: '',
  job: '',
};

export default function DiscoverScreen({ navigation }) {
  const { colors, anonMode } = useTheme();
  const styles = makeStyles(colors);
  const uid = auth.currentUser.uid;

  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [friends, setFriends] = useState({}); // { otherId: 'pending_out'|'pending_in'|'accepted' }
  const [blockedIds, setBlockedIds] = useState(new Set());
  const [myProfile, setMyProfile] = useState(null);

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [picker, setPicker] = useState(null); // 'uni' | 'district' | 'upazila'
  const [myGeo, setMyGeo] = useState(null);

  const [matchWith, setMatchWith] = useState(null);
  const [matchId, setMatchId] = useState(null);

  useEffect(() => {
    getDoc(doc(db, 'users', uid)).then((s) => { if (s.exists()) { setMyProfile(s.data()); setMyGeo(s.data().geo || null); } });
    fetchMyBlocks().then(setBlockedIds).catch(() => {});
    fetchMyFriends().then(setFriends).catch(() => {});

    const unsub = onSnapshot(
      query(collection(db, 'users'), limit(200)),
      (snap) => {
        const list = [];
        snap.forEach((d) => {
          if (d.id === uid) return;
          if (blockedIds.has(d.id)) return; // hide people I've blocked
          list.push({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) });
        });
        setMembers(list);
        setLoading(false);
      },
      (e) => {
        console.warn('Members listener failed', e);
        setLoading(false);
      }
    );
    return unsub;
  }, [uid, blockedIds]);

  const isActive = (m) => {
    if (m.showActive === false) return false; // user hid their active status
    const ms = m.lastActiveAt?.toMillis?.();
    return !!ms && Date.now() - ms < ACTIVE_WINDOW_MS;
  };

  const matchesText = (value, needle) =>
    !needle.trim() ||
    (value || '').toLowerCase().includes(needle.trim().toLowerCase());

  const visible = useMemo(
    () =>
      members.filter((m) => {
        if (search.trim()) {
          const q = search.trim().toLowerCase().replace(/^@+/, '');
          const name = (m.name || '').toLowerCase();
          const uname = (m.username || '').toLowerCase();
          if (!name.includes(q) && !uname.includes(q)) return false;
        }
        if (filters.status === 'active' && !isActive(m)) return false;
        if (filters.status === 'inactive' && isActive(m)) return false;
        if (filters.district && m.district !== filters.district) return false;
        if (filters.upazila && m.upazila !== filters.upazila) return false;
        if (!matchesText(m.university, filters.university)) return false;
        if (!matchesText(m.job, filters.job)) return false;
        if (filters.nearMe) {
          if (!myGeo || !m.geo) return false;
          if (distanceKm(myGeo, m.geo) > 25) return false; // within 25 km
        }
        return true;
      }),
    [members, filters, myGeo, search]
  );

  const activeFilterCount =
    (filters.status !== 'all' ? 1 : 0) +
    (filters.nearMe ? 1 : 0) +
    ['district', 'upazila', 'university', 'job'].filter((k) =>
      (filters[k] || '').toString().trim()
    ).length;

  const openProfile = (member) =>
    navigation.navigate('UserProfile', { userId: member.id, name: member.name });

  const openChat = async (member) => {
    try {
      const info = await ensureChat(
        member.id,
        { name: member.name, photoBase64: member.photoBase64 },
        myProfile,
        anonMode ? 'anon' : 'real'
      );
      navigation.navigate('Chat', info);
    } catch (e) {
      console.warn('Open chat failed', e);
      Alert.alert(
        'Could not open chat',
        e?.message || 'Something went wrong. Check your connection and try again.'
      );
    }
  };

  const addFriend = async (member) => {
    setFriends((f) => ({ ...f, [member.id]: 'pending_out' }));
    try {
      await sendFriendRequest(member.id, myProfile?.name);
    } catch (e) {
      console.warn('Friend request failed', e);
    }
  };

  const acceptFriend = async (member) => {
    setFriends((f) => ({ ...f, [member.id]: 'accepted' }));
    try {
      await acceptFriendRequest(member.id, myProfile?.name);
    } catch (e) {
      console.warn('Accept failed', e);
    }
  };

  const friendMenu = (member) => {
    const status = friends[member.id];
    if (status === 'accepted') {
      Alert.alert(member.name, 'You are friends.', [
        {
          text: 'Remove friend',
          style: 'destructive',
          onPress: async () => {
            setFriends((f) => {
              const n = { ...f };
              delete n[member.id];
              return n;
            });
            await removeFriend(member.id);
          },
        },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            await blockUser(member.id);
            setBlockedIds((b) => new Set(b).add(member.id));
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    } else if (status === 'pending_in') {
      acceptFriend(member);
    } else if (status === 'pending_out') {
      Alert.alert('Request sent', 'Waiting for them to accept.');
    } else {
      addFriend(member);
    }
  };

  const friendBtnLabel = (status) => {
    if (status === 'accepted') return { icon: 'people', text: 'Friends' };
    if (status === 'pending_out') return { icon: 'time-outline', text: 'Pending' };
    if (status === 'pending_in') return { icon: 'person-add', text: 'Accept' };
    return { icon: 'person-add-outline', text: 'Add' };
  };

  const renderMember = ({ item }) => {
    const active = isActive(item);
    const status = friends[item.id];
    const fb = friendBtnLabel(status);
    const meta = [item.job, item.university, item.location || item.hometown]
      .filter(Boolean)
      .join(' · ');
    return (
      <View style={styles.row}>
        <TouchableOpacity onPress={() => openProfile(item)}>
          <View>
            {item.photoBase64 ? (
              <Image source={{ uri: item.photoBase64 }} style={styles.rowAvatar} />
            ) : (
              <View style={[styles.rowAvatar, styles.rowAvatarPh]}>
                <Text style={styles.rowAvatarInit}>
                  {item.name?.[0]?.toUpperCase() || '?'}
                </Text>
              </View>
            )}
            <View
              style={[
                styles.activeDot,
                { backgroundColor: active ? colors.active : colors.away },
              ]}
            />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.rowBody}
          onPress={() => openProfile(item)}
        >
          <Text style={styles.rowName} numberOfLines={1}>
            {item.name}
            {item.age ? `, ${item.age}` : ''}
          </Text>
          {!!meta && (
            <Text style={styles.rowMeta} numberOfLines={1}>
              {meta}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.msgBtn} onPress={() => openChat(item)}>
          <Ionicons name="chatbubble-outline" size={16} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.friendBtn, status === 'accepted' && styles.friendBtnDone]}
          onPress={() => friendMenu(item)}
        >
          <Ionicons
            name={fb.icon}
            size={15}
            color={status === 'accepted' ? '#fff' : colors.jaam}
          />
          <Text style={[styles.friendBtnText, status === 'accepted' && { color: '#fff' }]}>
            {fb.text}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Discover</Text>
        <TouchableOpacity
          style={styles.filterBtn}
          onPress={() => {
            setDraft(filters);
            setShowFilters(true);
          }}
        >
          <Ionicons name="options-outline" size={18} color={colors.jaam} />
          <Text style={styles.filterBtnText}>Filters</Text>
          {activeFilterCount > 0 && (
            <View style={styles.filterCount}>
              <Text style={styles.filterCountText}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name or @username"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
        />
        {!!search && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={colors.muted} />
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.subtitle}>
        {loading
          ? 'Loading members…'
          : `${visible.length} of ${members.length} members · tap 💬 to message anyone`}
      </Text>

      <AnonBanner />

      {loading ? (
        <ActivityIndicator size="large" color={colors.jaam} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          renderItem={renderMember}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="search-outline" size={40} color={colors.muted} />
              <Text style={styles.emptyTitle}>No members match</Text>
              <Text style={styles.emptyText}>Try clearing a filter or two.</Text>
            </View>
          }
        />
      )}

      <Modal visible={showFilters} transparent animationType="slide">
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Filter members</Text>

            <Text style={styles.label}>Status</Text>
            <View style={styles.chips}>
              {[
                { label: 'All', value: 'all' },
                { label: 'Active', value: 'active' },
                { label: 'Inactive', value: 'inactive' },
              ].map((s) => (
                <TouchableOpacity
                  key={s.value}
                  style={[styles.chip, draft.status === s.value && styles.chipSel]}
                  onPress={() => setDraft({ ...draft, status: s.value })}
                >
                  <Text
                    style={[
                      styles.chipText,
                      draft.status === s.value && styles.chipTextSel,
                    ]}
                  >
                    {s.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Near me (within 25 km)</Text>
            <TouchableOpacity
              style={[styles.selectBtn, draft.nearMe && styles.selectBtnOn]}
              onPress={async () => {
                if (!draft.nearMe) {
                  const g = await updateMyLocation();
                  if (g) {
                    setMyGeo(g);
                    setDraft({ ...draft, nearMe: true });
                  }
                } else {
                  setDraft({ ...draft, nearMe: false });
                }
              }}
            >
              <Ionicons
                name={draft.nearMe ? 'location' : 'location-outline'}
                size={18}
                color={draft.nearMe ? '#fff' : colors.jaam}
              />
              <Text style={[styles.selectText, draft.nearMe && { color: '#fff' }]}>
                {draft.nearMe ? 'On — showing people near you' : 'Use my location'}
              </Text>
            </TouchableOpacity>

            <Text style={styles.label}>District (hometown)</Text>
            <TouchableOpacity style={styles.selectBtn} onPress={() => setPicker('district')}>
              <Text style={styles.selectText}>{draft.district || 'Any district'}</Text>
              <Ionicons name="chevron-down" size={18} color={colors.muted} />
            </TouchableOpacity>

            {!!draft.district && (
              <>
                <Text style={styles.label}>Upazila</Text>
                <TouchableOpacity style={styles.selectBtn} onPress={() => setPicker('upazila')}>
                  <Text style={styles.selectText}>{draft.upazila || 'Any upazila'}</Text>
                  <Ionicons name="chevron-down" size={18} color={colors.muted} />
                </TouchableOpacity>
              </>
            )}

            <Text style={styles.label}>University / College</Text>
            <TouchableOpacity style={styles.selectBtn} onPress={() => setPicker('uni')}>
              <Text style={styles.selectText} numberOfLines={1}>
                {draft.university || 'Any institution'}
              </Text>
              <Ionicons name="chevron-down" size={18} color={colors.muted} />
            </TouchableOpacity>

            <Text style={styles.label}>Job</Text>
            <TextInput
              style={styles.input}
              value={draft.job}
              onChangeText={(t) => setDraft({ ...draft, job: t })}
              placeholder="e.g. Doctor, Engineer"
              placeholderTextColor={colors.muted}
            />

            <View style={styles.sheetRow}>
              <TouchableOpacity
                style={styles.clearBtn}
                onPress={() => setDraft(EMPTY_FILTERS)}
              >
                <Text style={styles.clearText}>Clear all</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.applyBtn}
                onPress={() => {
                  setFilters(draft);
                  setShowFilters(false);
                }}
              >
                <Text style={styles.applyText}>Show results</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <SearchablePicker
        visible={picker === 'uni'}
        title="University / College"
        options={BD_INSTITUTIONS}
        allowClear
        onClose={() => setPicker(null)}
        onSelect={(v) => { setDraft({ ...draft, university: v || '' }); setPicker(null); }}
      />
      <SearchablePicker
        visible={picker === 'district'}
        title="District"
        options={BD_DISTRICTS}
        allowClear
        onClose={() => setPicker(null)}
        onSelect={(v) => { setDraft({ ...draft, district: v || '', upazila: '' }); setPicker(null); }}
      />
      <SearchablePicker
        visible={picker === 'upazila'}
        title="Upazila"
        options={draft.district ? (BD_DISTRICTS_UPAZILAS[draft.district] || []) : []}
        allowClear
        onClose={() => setPicker(null)}
        onSelect={(v) => { setDraft({ ...draft, upazila: v || '' }); setPicker(null); }}
      />

      <Modal visible={!!matchWith} transparent animationType="fade">
        <View style={styles.matchOverlay}>
          <Text style={styles.matchTitle}>It's a match!</Text>
          <Text style={styles.matchSub}>
            You and {matchWith?.name} liked each other.
          </Text>
          <View style={styles.matchPhotos}>
            <MatchPhoto styles={styles} uri={myProfile?.photoBase64} name={myProfile?.name} />
            <View style={styles.matchHeart}>
              <Ionicons name="heart" size={22} color="#fff" />
            </View>
            <MatchPhoto styles={styles} uri={matchWith?.photoBase64} name={matchWith?.name} />
          </View>
          <TouchableOpacity
            style={styles.matchButton}
            onPress={() => {
              const other = matchWith;
              const id = matchId;
              setMatchWith(null);
              setMatchId(null);
              navigation.navigate('Chat', {
                matchId: id,
                otherName: other.name,
                otherPhoto: other.photoBase64 || null,
              });
            }}
          >
            <Text style={styles.matchButtonText}>Send a message</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setMatchWith(null);
              setMatchId(null);
            }}
          >
            <Text style={styles.matchKeepText}>Keep browsing</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function MatchPhoto({ styles, uri, name }) {
  if (uri) return <Image source={{ uri }} style={styles.matchPhoto} />;
  return (
    <View style={[styles.matchPhoto, styles.matchPhotoPh]}>
      <Text style={styles.matchPhotoInit}>{name?.[0]?.toUpperCase() || '?'}</Text>
    </View>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 6,
    },
    title: { fontFamily: fonts.display, fontSize: 30, color: colors.ink },
    subtitle: {
      paddingHorizontal: 20,
      color: colors.muted,
      fontSize: 12,
      marginTop: 2,
      marginBottom: 10,
    },
    searchBar: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line,
      borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11,
      marginHorizontal: 20, marginTop: 10,
    },
    searchInput: { flex: 1, fontSize: 15, color: colors.ink },
    filterBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 1.5,
      borderColor: colors.jaam,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    filterBtnText: { color: colors.jaam, fontWeight: '700', fontSize: 13 },
    filterCount: {
      backgroundColor: colors.shiuli,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
    filterCountText: { color: '#fff', fontSize: 11, fontWeight: '800' },
    list: { paddingHorizontal: 14, paddingBottom: 24 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 16,
      paddingHorizontal: 11,
      paddingVertical: 9,
      marginBottom: 8,
    },
    rowAvatar: { width: 48, height: 48, borderRadius: 24 },
    rowAvatarPh: {
      backgroundColor: colors.jaamSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowAvatarInit: { fontFamily: fonts.display, fontSize: 21, color: colors.jaam },
    activeDot: {
      position: 'absolute',
      right: -1,
      bottom: -1,
      width: 14,
      height: 14,
      borderRadius: 7,
      borderWidth: 2.5,
      borderColor: colors.card,
    },
    rowBody: { flex: 1, minWidth: 0 },
    rowName: { fontSize: 15, fontWeight: '800', color: colors.ink },
    rowMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
    msgBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.jaam,
      alignItems: 'center',
      justifyContent: 'center',
    },
    friendBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      borderRadius: 999,
      borderWidth: 1.5,
      borderColor: colors.jaam,
      paddingHorizontal: 12,
      height: 36,
    },
    friendBtnDone: { backgroundColor: colors.jaam, borderColor: colors.jaam },
    friendBtnText: { fontSize: 12.5, fontWeight: '700', color: colors.jaam },
    empty: { alignItems: 'center', padding: 36 },
    emptyTitle: {
      fontFamily: fonts.displayMedium,
      fontSize: 19,
      color: colors.ink,
      marginTop: 12,
    },
    emptyText: { marginTop: 6, color: colors.muted, fontSize: 13 },
    sheetBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.bg,
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      padding: 22,
      paddingBottom: 34,
    },
    sheetHandle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.line,
      alignSelf: 'center',
      marginBottom: 12,
    },
    sheetTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.ink },
    label: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.muted,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginTop: 14,
      marginBottom: 6,
    },
    chips: { flexDirection: 'row', gap: 8 },
    chip: {
      paddingHorizontal: 15,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.card,
    },
    chipSel: { backgroundColor: colors.jaam, borderColor: colors.jaam },
    chipText: { fontSize: 13, fontWeight: '600', color: colors.ink },
    chipTextSel: { color: '#fff' },
    selectBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      gap: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line,
      borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
    },
    selectBtnOn: { backgroundColor: colors.jaam, borderColor: colors.jaam },
    selectText: { fontSize: 14, color: colors.ink, fontWeight: '600', flex: 1 },
    input: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 11,
      fontSize: 14,
      color: colors.ink,
    },
    sheetRow: { flexDirection: 'row', gap: 10, marginTop: 22 },
    clearBtn: {
      flex: 1,
      borderWidth: 1.5,
      borderColor: colors.line,
      borderRadius: 999,
      paddingVertical: 13,
      alignItems: 'center',
    },
    clearText: { color: colors.ink, fontWeight: '700' },
    applyBtn: {
      flex: 2,
      backgroundColor: colors.jaam,
      borderRadius: 999,
      paddingVertical: 13,
      alignItems: 'center',
    },
    applyText: { color: '#fff', fontWeight: '700' },
    matchOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
    },
    matchTitle: { fontFamily: fonts.display, fontSize: 44, color: '#fff' },
    matchSub: { marginTop: 8, color: 'rgba(255,255,255,0.8)', fontSize: 15 },
    matchPhotos: { flexDirection: 'row', alignItems: 'center', marginVertical: 34 },
    matchPhoto: {
      width: 108,
      height: 108,
      borderRadius: 54,
      borderWidth: 3,
      borderColor: '#fff',
    },
    matchPhotoPh: {
      backgroundColor: colors.jaamSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    matchPhotoInit: { fontFamily: fonts.display, fontSize: 44, color: colors.jaam },
    matchHeart: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.shiuli,
      alignItems: 'center',
      justifyContent: 'center',
      marginHorizontal: -14,
      zIndex: 2,
      borderWidth: 3,
      borderColor: colors.overlay,
    },
    matchButton: {
      backgroundColor: '#fff',
      borderRadius: 999,
      paddingHorizontal: 40,
      paddingVertical: 15,
    },
    matchButtonText: { color: colors.jaamDark, fontWeight: '800', fontSize: 16 },
    matchKeepText: { color: 'rgba(255,255,255,0.85)', marginTop: 18, fontSize: 15 },
  });
