import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';
import { fonts, useTheme } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ensureChat } from '../utils/chat';
import { pushNotification } from '../utils/notify';
import { REL, GOALS } from '../constants';
import {
  blockUser,
  setRelationship,
  togglePin,
  getFriendStatus,
  sendFriendRequest,
  acceptFriendRequest,
  removeFriend,
} from '../utils/relationships';
import { doc as fbDoc, getDoc as fbGetDoc } from 'firebase/firestore';

const ACTIVE_WINDOW_MS = 10 * 60 * 1000;

export default function UserProfileScreen({ route, navigation }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const uid = auth.currentUser.uid;
  const { userId } = route.params;

  const [profile, setProfile] = useState(null);
  const [myProfile, setMyProfile] = useState(null);
  const [liked, setLiked] = useState(false);
  const [relation, setRelation] = useState(null); // { rel, pinned }
  const [friendStatus, setFriendStatus] = useState(null);

  useEffect(() => {
    getDoc(doc(db, 'users', uid)).then((s) => s.exists() && setMyProfile(s.data()));
    getDoc(doc(db, 'swipes', `${uid}_${userId}`)).then(
      (s) => s.exists() && s.data().liked && setLiked(true)
    );
    fbGetDoc(fbDoc(db, 'users', uid, 'relationships', userId)).then(
      (s) => s.exists() && setRelation(s.data())
    );
    getFriendStatus(userId).then(setFriendStatus).catch(() => {});
    const unsub = onSnapshot(doc(db, 'users', userId), (snap) => {
      if (snap.exists())
        setProfile(snap.data({ serverTimestamps: 'estimate' }));
    });
    return unsub;
  }, [uid, userId]);

  if (!profile) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.jaam} />
      </View>
    );
  }

  const isMe = userId === uid;
  const activeNow =
    profile.showActive !== false &&
    profile.lastActiveAt?.toMillis?.() &&
    Date.now() - profile.lastActiveAt.toMillis() < ACTIVE_WINDOW_MS;

  const startChat = async (identity) => {
    try {
      const info = await ensureChat(
        userId,
        { name: profile.name, photoBase64: profile.photoBase64 },
        myProfile,
        identity
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

  const openChat = () => {
    Alert.alert('Message', 'How do you want to chat?', [
      { text: 'As myself', onPress: () => startChat('real') },
      {
        text: `Anonymously (${myProfile?.anonName || 'set name in Profile'})`,
        onPress: () => startChat('anon'),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const like = async () => {
    if (liked) return;
    setLiked(true);
    try {
      await setDoc(doc(db, 'swipes', `${uid}_${userId}`), {
        swiperId: uid,
        targetId: userId,
        liked: true,
        createdAt: serverTimestamp(),
      });
      const theirs = await getDoc(doc(db, 'swipes', `${userId}_${uid}`));
      if (theirs.exists() && theirs.data().liked) {
        const id = [uid, userId].sort().join('_');
        await setDoc(
          doc(db, 'matches', id),
          {
            users: [uid, userId].sort(),
            profiles: {
              [uid]: {
                name: myProfile?.name || 'You',
                photoBase64: myProfile?.photoBase64 || null,
              },
              [userId]: {
                name: profile.name,
                photoBase64: profile.photoBase64 || null,
              },
            },
            createdAt: serverTimestamp(),
            lastMessage: null,
            lastMessageAt: null,
          },
          { merge: true }
        );
        pushNotification(userId, {
          type: 'match',
          text: `${myProfile?.name || 'Someone'} matched with you — say hi!`,
        });
        Alert.alert("It's a match!", `You and ${profile.name} liked each other.`, [
          { text: 'Keep browsing', style: 'cancel' },
          { text: 'Send a message', onPress: openChat },
        ]);
      } else {
        pushNotification(userId, {
          type: 'like',
          text: `${myProfile?.name || 'Someone'} liked your profile ♥`,
        });
      }
    } catch (e) {
      console.warn('Like failed', e);
    }
  };

  const onFriendPress = async () => {
    if (friendStatus === 'accepted') {
      Alert.alert(profile.name, 'You are friends.', [
        {
          text: 'Remove friend',
          style: 'destructive',
          onPress: async () => {
            setFriendStatus(null);
            setRelation((r) => ({ ...(r || {}), rel: null }));
            await removeFriend(userId);
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    } else if (friendStatus === 'pending_in') {
      setFriendStatus('accepted');
      await acceptFriendRequest(userId, myProfile?.name);
    } else if (friendStatus === 'pending_out') {
      Alert.alert('Request sent', 'Waiting for them to accept.');
    } else {
      setFriendStatus('pending_out');
      await sendFriendRequest(userId, myProfile?.name);
    }
  };

  const friendLabel = () => {
    if (friendStatus === 'accepted') return { icon: 'people', text: 'Friends' };
    if (friendStatus === 'pending_out') return { icon: 'time-outline', text: 'Pending' };
    if (friendStatus === 'pending_in') return { icon: 'person-add', text: 'Accept request' };
    return { icon: 'person-add-outline', text: 'Add friend' };
  };

  const applyRel = async (relKey) => {
    const next = relation?.rel === relKey ? null : relKey;
    const res = await setRelationship(userId, next, relation);
    if (!res.ok) return Alert.alert('Limit reached', res.reason);
    setRelation((r) => ({ ...(r || {}), rel: next }));
  };

  const doPin = async () => {
    const pinned = await togglePin(userId, relation);
    setRelation((r) => ({ ...(r || {}), pinned }));
  };

  const confirmBlock = () =>
    Alert.alert(
      `Block ${profile.name}?`,
      "They won't be able to message you, and you won't see each other's new messages.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            await blockUser(userId);
            navigation.goBack();
          },
        },
      ]
    );

  return (
    <ScrollView
      style={styles.safe}
      contentContainerStyle={[styles.scroll, { paddingBottom: 48 + insets.bottom }]}
    >
      <View style={styles.photoWrap}>
        {profile.photoBase64 ? (
          <Image source={{ uri: profile.photoBase64 }} style={styles.photo} />
        ) : (
          <View style={[styles.photo, styles.photoPh]}>
            <Text style={styles.photoInit}>
              {profile.name?.[0]?.toUpperCase() || '?'}
            </Text>
          </View>
        )}
        <View style={styles.statusPill}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: activeNow ? colors.active : colors.away },
            ]}
          />
          <Text style={styles.statusText}>{activeNow ? 'Active now' : 'Away'}</Text>
        </View>
      </View>

      <Text style={styles.name}>
        {profile.name}
        {profile.age ? `, ${profile.age}` : ''}
      </Text>
      {!!profile.username && <Text style={styles.handle}>@{profile.username}</Text>}
      {!!profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}

      <View style={styles.details}>
        {!!profile.job && <Detail styles={styles} colors={colors} icon="briefcase-outline" text={profile.job} />}
        {!!profile.university && (
          <Detail styles={styles} colors={colors} icon="school-outline" text={profile.university} />
        )}
        {!!profile.location && (
          <Detail styles={styles} colors={colors} icon="location-outline" text={`Lives in ${profile.location}`} />
        )}
        {!!profile.hometown && (
          <Detail styles={styles} colors={colors} icon="home-outline" text={`From ${profile.hometown}`} />
        )}
        {!!profile.height && (
          <Detail styles={styles} colors={colors} icon="resize-outline" text={profile.height} />
        )}
        {!!profile.zodiac && (
          <Detail styles={styles} colors={colors} icon="star-outline" text={profile.zodiac} />
        )}
        {!!profile.languages && (
          <Detail styles={styles} colors={colors} icon="language-outline" text={profile.languages} />
        )}
      </View>

      {!!profile.goal && (
        <View style={styles.goalPill}>
          <Text style={styles.goalText}>
            💘 {GOALS.find((g) => g.key === profile.goal)?.label || profile.goal}
          </Text>
        </View>
      )}

      {(profile.interests || []).length > 0 && (
        <View style={styles.interestWrap}>
          {profile.interests.map((it) => (
            <View key={it} style={styles.interestChip}>
              <Text style={styles.interestText}>{it}</Text>
            </View>
          ))}
        </View>
      )}

      {!!profile.firstDate && (
        <View style={styles.promptCard}>
          <Text style={styles.promptQ}>My ideal first date is…</Text>
          <Text style={styles.promptA}>{profile.firstDate}</Text>
        </View>
      )}

      {!isMe && (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.msgBtn} onPress={openChat}>
            <Ionicons name="chatbubble-outline" size={18} color="#fff" />
            <Text style={styles.msgText}>Message</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.likeBtn, friendStatus === 'accepted' && styles.likeBtnDone]}
            onPress={onFriendPress}
          >
            <Ionicons
              name={friendLabel().icon}
              size={18}
              color={friendStatus === 'accepted' ? '#fff' : colors.jaam}
            />
            <Text style={[styles.likeText, friendStatus === 'accepted' && { color: '#fff' }]}>
              {friendLabel().text}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {!isMe && friendStatus === 'accepted' && (
        <>
          <Text style={styles.relTitle}>Add to your circle</Text>
          <View style={styles.relRow}>
            {Object.values(REL).map((r) => {
              const on = relation?.rel === r.key;
              return (
                <TouchableOpacity
                  key={r.key}
                  style={[styles.relChip, on && styles.relChipOn]}
                  onPress={() => applyRel(r.key)}
                >
                  <Text style={[styles.relChipText, on && { color: '#fff' }]}>
                    {r.emoji} {r.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.relRow}>
            <TouchableOpacity
              style={[styles.relChip, relation?.pinned && styles.relChipOn]}
              onPress={doPin}
            >
              <Text style={[styles.relChipText, relation?.pinned && { color: '#fff' }]}>
                📌 {relation?.pinned ? 'Pinned' : 'Pin chat'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.blockChip} onPress={confirmBlock}>
              <Ionicons name="ban-outline" size={15} color={colors.danger} />
              <Text style={styles.blockChipText}>Block</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </ScrollView>
  );
}

function Detail({ styles, colors, icon, text }) {
  return (
    <View style={styles.detailRow}>
      <Ionicons name={icon} size={16} color={colors.jaam} />
      <Text style={styles.detailText}>{text}</Text>
    </View>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    center: {
      flex: 1,
      backgroundColor: colors.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scroll: { alignItems: 'center', padding: 24, paddingBottom: 48 },
    photoWrap: { position: 'relative' },
    photo: { width: 160, height: 160, borderRadius: 80 },
    photoPh: {
      backgroundColor: colors.jaamSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    photoInit: { fontFamily: fonts.display, fontSize: 72, color: colors.jaam },
    statusPill: {
      position: 'absolute',
      bottom: -6,
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.pill,
      borderRadius: 999,
      paddingHorizontal: 11,
      paddingVertical: 5,
    },
    statusDot: { width: 8, height: 8, borderRadius: 4 },
    statusText: { fontSize: 11, fontWeight: '700', color: colors.pillText },
    handle: { fontSize: 14, color: colors.jaam, fontWeight: '700', marginTop: 3 },
    name: {
      fontFamily: fonts.display,
      fontSize: 27,
      color: colors.ink,
      marginTop: 16,
    },
    bio: {
      marginTop: 8,
      fontSize: 14,
      color: colors.muted,
      textAlign: 'center',
      lineHeight: 21,
      paddingHorizontal: 12,
    },
    details: { marginTop: 14, gap: 8, alignItems: 'center' },
    detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    detailText: { fontSize: 14, color: colors.ink, fontWeight: '500' },
    goalPill: {
      marginTop: 16, backgroundColor: colors.jaamSoft, borderRadius: 999,
      paddingHorizontal: 16, paddingVertical: 8,
    },
    goalText: { color: colors.jaam, fontWeight: '800', fontSize: 13 },
    interestWrap: {
      flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16,
      justifyContent: 'center',
    },
    interestChip: {
      borderWidth: 1.5, borderColor: colors.line, borderRadius: 999,
      paddingHorizontal: 14, paddingVertical: 7,
    },
    interestText: { fontSize: 13, color: colors.ink, fontWeight: '600' },
    promptCard: {
      marginTop: 18, alignSelf: 'stretch', backgroundColor: colors.card,
      borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 16,
    },
    promptQ: { fontSize: 12, color: colors.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
    promptA: { fontSize: 15, color: colors.ink, marginTop: 6, lineHeight: 21, fontStyle: 'italic' },
    actions: { flexDirection: 'row', gap: 12, marginTop: 24 },
    relTitle: {
      fontFamily: fonts.displayMedium,
      fontSize: 13,
      color: colors.muted,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginTop: 26,
      marginBottom: 10,
      alignSelf: 'flex-start',
    },
    relRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignSelf: 'stretch', marginBottom: 4 },
    relChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 1.5,
      borderColor: colors.line,
      backgroundColor: colors.card,
      borderRadius: 999,
      paddingHorizontal: 15,
      paddingVertical: 9,
    },
    relChipOn: { backgroundColor: colors.jaam, borderColor: colors.jaam },
    relChipText: { fontSize: 13, fontWeight: '700', color: colors.ink },
    blockChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 1.5,
      borderColor: colors.danger,
      borderRadius: 999,
      paddingHorizontal: 15,
      paddingVertical: 9,
    },
    blockChipText: { fontSize: 13, fontWeight: '700', color: colors.danger },
    msgBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.jaam,
      borderRadius: 999,
      paddingHorizontal: 26,
      paddingVertical: 13,
    },
    msgText: { color: '#fff', fontWeight: '800', fontSize: 14 },
    likeBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1.5,
      borderColor: colors.jaam,
      borderRadius: 999,
      paddingHorizontal: 26,
      paddingVertical: 13,
    },
    likeBtnDone: { backgroundColor: colors.shiuli, borderColor: colors.shiuli },
    likeText: { color: colors.jaam, fontWeight: '800', fontSize: 14 },
  });
