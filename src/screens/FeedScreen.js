import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';
import { fonts, useTheme } from '../theme';
import { pickPostPhoto } from '../utils/photo';
import { pushNotification } from '../utils/notify';
import { MOODS, MOOD_BY_KEY } from '../constants';
import { toggleSavePost, reportContent } from '../utils/social';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AVATAR_BY_ID } from '../anonAvatars';
import SearchablePicker from '../components/SearchablePicker';
import AnonBanner from '../components/AnonBanner';
import { BD_INSTITUTIONS } from '../data/bdInstitutions';
import { BD_DISTRICTS } from '../data/bdGeo';
import { distanceKm } from '../utils/location';
import MentionInput, { MentionText } from '../components/MentionInput';
import { detectAdultImage } from '../utils/moderation';

export const REACTIONS = [
  { type: 'love', emoji: '❤️', label: 'Love' },
  { type: 'like', emoji: '👍', label: 'Like' },
  { type: 'haha', emoji: '😂', label: 'Haha' },
  { type: 'wow', emoji: '😮', label: 'Wow' },
  { type: 'sad', emoji: '😢', label: 'Sad' },
  { type: 'angry', emoji: '😠', label: 'Angry' },
  { type: 'hot', emoji: '🥵', label: 'Hot' },
];

// Extra reactions revealed by the "+" button.
export const EXTRA_REACTIONS = [
  { type: 'fire', emoji: '🔥', label: 'Fire' },
  { type: 'cry', emoji: '😭', label: 'Cry' },
  { type: 'love_eyes', emoji: '😍', label: 'Adore' },
  { type: 'clap', emoji: '👏', label: 'Clap' },
  { type: 'think', emoji: '🤔', label: 'Hmm' },
  { type: 'party', emoji: '🥳', label: 'Party' },
  { type: 'skull', emoji: '💀', label: 'Dead' },
  { type: 'heart_hands', emoji: '🫶', label: 'Care' },
];

export const ALL_REACTIONS = [...REACTIONS, ...EXTRA_REACTIONS];
const EMOJI = Object.fromEntries(ALL_REACTIONS.map((r) => [r.type, r.emoji]));

const FILTERS = [
  { label: 'All posts', value: 'all' },
  { label: 'Text only', value: 'text' },
  { label: 'Photos only', value: 'photo' },
];

export default function FeedScreen({ navigation }) {
  const { colors, anonMode, toggleAnon } = useTheme();
  const styles = makeStyles(colors);
  const uid = auth.currentUser.uid;

  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [myProfile, setMyProfile] = useState(null);
  const [unread, setUnread] = useState(0);

  const [showComposer, setShowComposer] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [pickerFor, setPickerFor] = useState(null);
  const [showExtra, setShowExtra] = useState(false);
  const [reactorsFor, setReactorsFor] = useState(null);
  const [commentsFor, setCommentsFor] = useState(null);

  const [text, setText] = useState('');
  const [photo, setPhoto] = useState(null);
  const [posting, setPosting] = useState(false);
  const [postMoods, setPostMoods] = useState([]); // moods chosen for the new post
  const [savedIds, setSavedIds] = useState(new Set());
  const [moodFilter, setMoodFilter] = useState([]);
  const [fDistrict, setFDistrict] = useState('');
  const [fUniversity, setFUniversity] = useState('');
  const [fNearMe, setFNearMe] = useState(false);
  const [feedPicker, setFeedPicker] = useState(null); // 'uni'|'district'

  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [replyTo, setReplyTo] = useState(null); // comment being replied to

  useEffect(() => {
    getDoc(doc(db, 'users', uid)).then((s) => s.exists() && setMyProfile(s.data()));

    const unsubPosts = onSnapshot(
      query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(50)),
      (snap) => {
        setPosts(
          snap.docs.map((d) => ({
            id: d.id,
            ...d.data({ serverTimestamps: 'estimate' }),
          }))
        );
        setLoading(false);
      },
      () => setLoading(false)
    );

    const unsubBell = onSnapshot(
      query(
        collection(db, 'users', uid, 'notifications'),
        where('read', '==', false),
        limit(30)
      ),
      (snap) => setUnread(snap.size),
      () => {}
    );

    return () => {
      unsubPosts();
      unsubBell();
    };
  }, [uid]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users', uid, 'saved'), (snap) => {
      setSavedIds(new Set(snap.docs.map((d) => d.id)));
    });
    return unsub;
  }, [uid]);

  useEffect(() => {
    if (!commentsFor) return;
    const unsub = onSnapshot(
      query(
        collection(db, 'posts', commentsFor.id, 'comments'),
        orderBy('createdAt', 'asc'),
        limit(100)
      ),
      (snap) =>
        setComments(
          snap.docs.map((d) => ({
            id: d.id,
            ...d.data({ serverTimestamps: 'estimate' }),
          }))
        )
    );
    return unsub;
  }, [commentsFor?.id]);

  const myName = myProfile?.name || 'Someone';


  const goToProfile = (userId, name) => {
    if (userId === uid) {
      navigation.navigate('Profile');
    } else {
      navigation.navigate('UserProfile', { userId, name });
    }
  };

  const publish = async () => {
    const trimmed = text.trim();
    if (!trimmed && !photo) return;
    if (postMoods.length === 0) {
      return Alert.alert('Pick a mood', 'Choose at least one mood for your post.');
    }
    setPosting(true);
    try {
      // Auto-detect adult/explicit imagery before posting.
      let moods = postMoods;
      const adultChosen = moods.includes('adult');
      if (photo && !adultChosen) {
        // Only screen when the user did NOT choose the adult (18+) mood.
        // Choosing adult mood is an explicit opt-in to post mature content.
        const check = await detectAdultImage(photo);
        if (check.block) {
          setPosting(false);
          return Alert.alert(
            'Mark it 18+ to post this',
            'This photo appears to contain nudity or explicit content. To post it, select the 🔞 Adult (18+) mood — it will then only be shown to people who’ve turned on adult content. Otherwise, please choose a different image.'
          );
        }
        if (check.flag) {
          moods = [...moods, 'adult'];
          Alert.alert(
            'Marked 18+',
            'This photo looked mature, so your post was automatically marked 18+ and will only show to people who’ve turned on adult content.'
          );
        }
      }
      await addDoc(collection(db, 'posts'), {
        authorId: uid, // kept private-ish; UI hides it when anonymous
        authorName: anonMode ? (myProfile?.anonName || 'Anonymous') : myName,
        authorPhoto: anonMode ? null : myProfile?.photoBase64 || null,
        anonymous: anonMode,
        anonAvatar: anonMode ? (myProfile?.anonAvatar || 'a01') : null,
        type: photo ? 'photo' : 'text',
        text: trimmed,
        photoBase64: photo || null,
        moods,
        isAdult: moods.includes('adult'),
        authorDistrict: anonMode ? null : myProfile?.district || null,
        authorUniversity: anonMode ? null : myProfile?.university || null,
        authorGeo: anonMode ? null : myProfile?.geo || null,
        reactions: {},
        commentCount: 0,
        createdAt: serverTimestamp(),
      });
      setText('');
      setPhoto(null);
      setPostMoods([]);
      setShowComposer(false);
    } catch (e) {
      console.warn('Post failed', e);
    } finally {
      setPosting(false);
    }
  };

  const setReaction = async (post, type) => {
    setPickerFor(null);
    const mine = post.reactions?.[uid]?.type;
    try {
      if (mine === type) {
        await updateDoc(doc(db, 'posts', post.id), {
          [`reactions.${uid}`]: deleteField(),
        });
      } else {
        await updateDoc(doc(db, 'posts', post.id), {
          [`reactions.${uid}`]: {
            type,
            name: myName,
            photo: myProfile?.photoBase64 || null,
          },
        });
        pushNotification(post.authorId, {
          type: 'reaction',
          text: `${myName} reacted ${EMOJI[type]} to your post`,
          postText: post.text || '(photo)',
          postId: post.id,
        });
      }
    } catch (e) {
      console.warn('Reaction failed', e);
    }
  };

  const sendComment = async () => {
    const trimmed = commentText.trim();
    if (!trimmed || !commentsFor) return;
    setCommentText('');
    try {
      const finalText = replyTo ? `@${replyTo.authorName} ${trimmed}` : trimmed;
      await addDoc(collection(db, 'posts', commentsFor.id, 'comments'), {
        authorId: uid,
        authorName: myName,
        authorPhoto: myProfile?.photoBase64 || null,
        text: finalText,
        replyToId: replyTo?.id || null,
        replyToName: replyTo?.authorName || null,
        reactions: {},
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'posts', commentsFor.id), {
        commentCount: increment(1),
      });
      // Notify post author
      pushNotification(commentsFor.authorId, {
        type: 'comment',
        text: `${myName} commented: "${trimmed.slice(0, 60)}"`,
        postText: commentsFor.text || '(photo)',
        postId: commentsFor.id,
      });
      // Notify the person being replied to (if different)
      if (replyTo && replyTo.authorId !== commentsFor.authorId) {
        pushNotification(replyTo.authorId, {
          type: 'comment',
          text: `${myName} replied to you: "${trimmed.slice(0, 60)}"`,
          postId: commentsFor.id,
        });
      }
      setReplyTo(null);
    } catch (e) {
      console.warn('Comment failed', e);
    }
  };

  const reactComment = async (commentId, type) => {
    if (!commentsFor) return;
    const ref = doc(db, 'posts', commentsFor.id, 'comments', commentId);
    const c = comments.find((x) => x.id === commentId);
    const mine = c?.reactions?.[uid];
    try {
      await updateDoc(ref, {
        [`reactions.${uid}`]: mine === type ? deleteField() : type,
      });
    } catch (e) {
      console.warn('Comment reaction failed', e);
    }
  };

  const visible = posts.filter((p) => {
    if (filter !== 'all' && p.type !== filter) return false;
    // Adult posts only show when 'adult' is explicitly in the mood filter
    if (p.isAdult && !moodFilter.includes('adult')) return false;
    // If mood filters are set, post must match at least one
    if (moodFilter.length > 0) {
      const pm = p.moods || [];
      if (!moodFilter.some((m) => pm.includes(m))) return false;
    }
    if (fDistrict && p.authorDistrict !== fDistrict) return false;
    if (fUniversity && p.authorUniversity !== fUniversity) return false;
    if (fNearMe) {
      if (!myProfile?.geo || !p.authorGeo) return false;
      if (distanceKm(myProfile.geo, p.authorGeo) > 25) return false;
    }
    return true;
  });

  const toggleArr = (arr, val, setter) =>
    setter(arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]);

  const renderPost = ({ item }) => {
    const entries = Object.entries(item.reactions || {});
    const mine = item.reactions?.[uid]?.type;
    const topEmojis = [...new Set(entries.map(([, r]) => EMOJI[r.type]))].slice(0, 3);
    const anon = !!item.anonymous;
    const displayName = anon ? (item.authorName || 'Anonymous') : item.authorName;
    const anonAv = anon ? AVATAR_BY_ID[item.anonAvatar] : null;
    const savedNow = savedIds.has(item.id);

    const openComments = () => navigation.navigate('Comments', { postId: item.id });
    const reportThis = () =>
      Alert.alert('Report post', 'Report this post to the Adda team?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Report',
          style: 'destructive',
          onPress: async () => {
            await reportContent('post', item.id, item.text || '');
            Alert.alert('Reported', 'Thanks — our team will review it.');
          },
        },
      ]);

    const isMine = item.authorId === uid;
    const deleteThis = () =>
      Alert.alert('Delete post', 'Delete this post permanently? This can’t be undone.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'posts', item.id));
            } catch (e) {
              console.warn('Delete post failed', e);
              Alert.alert('Could not delete', 'Please try again.');
            }
          },
        },
      ]);

    return (
      <View style={styles.post}>
        <View style={styles.postHead}>
          {anon ? (
            <View style={[styles.avatar, styles.anonAvatar, anonAv && { backgroundColor: anonAv.bg }]}>
              <Text style={styles.anonQ}>{anonAv ? anonAv.emoji : '?'}</Text>
            </View>
          ) : (
            <TouchableOpacity onPress={() => goToProfile(item.authorId, item.authorName)}>
              {item.authorPhoto ? (
                <Image source={{ uri: item.authorPhoto }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPh]}>
                  <Text style={styles.avatarInit}>
                    {displayName?.[0]?.toUpperCase() || '?'}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          )}
          <View style={{ flex: 1 }}>
            {anon ? (
              <Text style={styles.author}>{displayName}</Text>
            ) : (
              <TouchableOpacity onPress={() => goToProfile(item.authorId, item.authorName)}>
                <Text style={styles.author}>{displayName}</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.time}>
              {anon ? 'Identity hidden · ' : ''}
              {timeAgo(item.createdAt)}
            </Text>
          </View>
          {anon && (
            <View style={styles.anonBadge}>
              <Ionicons name="eye-off-outline" size={12} color={colors.jaam} />
              <Text style={styles.anonBadgeText}>Anon</Text>
            </View>
          )}
          <TouchableOpacity style={styles.saveIcon} onPress={() => toggleSavePost(item.id, item)}>
            <Ionicons
              name={savedNow ? 'bookmark' : 'bookmark-outline'}
              size={19}
              color={savedNow ? colors.jaam : colors.muted}
            />
          </TouchableOpacity>
        </View>

        {(item.moods || []).length > 0 && (
          <View style={styles.postMoods}>
            {item.moods.map((mk) => {
              const m = MOOD_BY_KEY[mk];
              if (!m) return null;
              return (
                <View key={mk} style={styles.postMoodBadge}>
                  <Text style={styles.postMoodText}>{m.emoji} {m.label}</Text>
                </View>
              );
            })}
          </View>
        )}
        {!!item.text && (
          <MentionText text={item.text} style={styles.postText} mentionStyle={styles.mentionHl} />
        )}
        {!!item.photoBase64 && (
          <Image source={{ uri: item.photoBase64 }} style={styles.postPhoto} />
        )}

        {entries.length > 0 && (
          <TouchableOpacity
            style={styles.reactSummary}
            onPress={() => setReactorsFor(item)}
          >
            <Text style={styles.reactSummaryText}>
              {topEmojis.join(' ')} {entries.length} — see who reacted
            </Text>
          </TouchableOpacity>
        )}

        {pickerFor === item.id && (
          <View style={styles.pickerWrap}>
            <View style={styles.pickerRow}>
              {(showExtra ? ALL_REACTIONS : REACTIONS).map((r) => (
                <TouchableOpacity
                  key={r.type}
                  style={styles.pickerItem}
                  onPress={() => {
                    setReaction(item, r.type);
                    setShowExtra(false);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.pickerBubble, mine === r.type && styles.pickerBubbleSel]}>
                    <Text style={{ fontSize: 25 }}>{r.emoji}</Text>
                  </View>
                  <Text style={styles.pickerLabel}>{r.label}</Text>
                </TouchableOpacity>
              ))}
              {!showExtra && (
                <TouchableOpacity
                  style={styles.pickerItem}
                  onPress={() => setShowExtra(true)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.pickerBubble, styles.pickerPlus]}>
                    <Ionicons name="add" size={24} color={colors.jaam} />
                  </View>
                  <Text style={styles.pickerLabel}>More</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, mine && styles.actionBtnActive]}
            onPress={() => {
              setPickerFor(pickerFor === item.id ? null : item.id);
              setShowExtra(false);
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.actionBtnText}>
              {mine ? EMOJI[mine] : '♡'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={openComments}>
            <Text style={styles.actionBtnText}>💬 {item.commentCount || 0}</Text>
          </TouchableOpacity>
          {isMine ? (
            <TouchableOpacity style={styles.actionBtn} onPress={deleteThis}>
              <Text style={[styles.actionBtnText, { color: colors.danger }]}>🗑 Delete</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.actionBtn} onPress={reportThis}>
              <Text style={styles.actionBtnText}>⚑ Report</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.wordmark}>
          adda<Text style={styles.wordmarkDot}> ♥</Text>
        </Text>
        <View style={styles.headerBtns}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => setShowFilter(true)}>
            <Ionicons name="options-outline" size={20} color={colors.jaam} />
            {filter !== 'all' && <View style={styles.dot} />}
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
          <TouchableOpacity
            style={[styles.iconBtn, styles.plusBtn]}
            onPress={() => setShowComposer(true)}
          >
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <SearchablePicker
        visible={feedPicker === 'uni'}
        title="University / College"
        options={BD_INSTITUTIONS}
        allowClear
        onClose={() => setFeedPicker(null)}
        onSelect={(v) => { setFUniversity(v || ''); setFeedPicker(null); }}
      />
      <SearchablePicker
        visible={feedPicker === 'district'}
        title="District"
        options={BD_DISTRICTS}
        allowClear
        onClose={() => setFeedPicker(null)}
        onSelect={(v) => { setFDistrict(v || ''); setFeedPicker(null); }}
      />

      <AnonBanner />

      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        renderItem={renderPost}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator size="large" color={colors.jaam} style={{ marginTop: 40 }} />
          ) : (
            <View style={styles.empty}>
              <Ionicons name="newspaper-outline" size={40} color={colors.muted} />
              <Text style={styles.emptyTitle}>The feed is quiet</Text>
              <Text style={styles.emptyText}>
                Tap + in the corner to share the first post.
              </Text>
            </View>
          )
        }
      />

      {/* Composer */}
      <Modal visible={showComposer} transparent animationType="slide">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
          <Pressable style={styles.sheetBack} onPress={() => setShowComposer(false)}>
            <Pressable style={styles.sheet} onPress={() => {}}>
              <View style={styles.handle} />
              <Text style={styles.sheetTitle}>New post</Text>
              <MentionInput
                value={text}
                onChangeText={setText}
                placeholder="Share something with everyone… use @ to mention"
                style={{ alignSelf: 'stretch' }}
                inputStyle={styles.composerInput}
                maxLength={500}
                autoFocus
              />
              {!!photo && <Image source={{ uri: photo }} style={styles.preview} />}

              <Text style={styles.moodLabel}>How are you feeling? (pick 1+)</Text>
              <View style={styles.moodWrap}>
                {MOODS.map((m) => {
                  const on = postMoods.includes(m.key);
                  return (
                    <TouchableOpacity
                      key={m.key}
                      style={[styles.moodChip, on && styles.moodChipOn]}
                      onPress={() => toggleArr(postMoods, m.key, setPostMoods)}
                    >
                      <Text style={[styles.moodChipText, on && { color: '#fff' }]}>
                        {m.emoji} {m.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                style={styles.anonToggle}
                onPress={toggleAnon}
              >
                <Ionicons
                  name={anonMode ? 'eye-off' : 'eye-off-outline'}
                  size={18}
                  color={anonMode ? colors.jaam : colors.muted}
                />
                <Text style={[styles.anonToggleText, anonMode && { color: colors.jaam }]}>
                  Post anonymously
                </Text>
                <View style={[styles.anonSwitch, anonMode && styles.anonSwitchOn]}>
                  <View style={[styles.anonKnob, anonMode && styles.anonKnobOn]} />
                </View>
              </TouchableOpacity>

              <View style={styles.composerRow}>
                <TouchableOpacity
                  style={styles.photoBtn}
                  onPress={async () => {
                    const p = await pickPostPhoto();
                    if (p) setPhoto(p);
                  }}
                >
                  <Ionicons name="image-outline" size={19} color={colors.jaam} />
                  <Text style={styles.photoBtnText}>
                    {photo ? 'Change photo' : 'Add photo'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.postBtn,
                    (posting || (!text.trim() && !photo)) && { opacity: 0.5 },
                  ]}
                  onPress={publish}
                  disabled={posting || (!text.trim() && !photo)}
                >
                  <Text style={styles.postBtnText}>
                    {posting ? 'Posting…' : 'Post'}
                  </Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Filter */}
      <Modal visible={showFilter} transparent animationType="fade">
        <Pressable style={styles.sheetBack} onPress={() => setShowFilter(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Filter posts</Text>
            {FILTERS.map((f) => (
              <TouchableOpacity
                key={f.value}
                style={styles.filterRow}
                onPress={() => setFilter(f.value)}
              >
                <Ionicons
                  name={filter === f.value ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={colors.jaam}
                />
                <Text style={styles.filterText}>{f.label}</Text>
              </TouchableOpacity>
            ))}

            <Text style={styles.moodLabel}>Filter by mood (pick any)</Text>
            <View style={styles.moodWrap}>
              {MOODS.map((m) => {
                const on = moodFilter.includes(m.key);
                return (
                  <TouchableOpacity
                    key={m.key}
                    style={[styles.moodChip, on && styles.moodChipOn]}
                    onPress={() => toggleArr(moodFilter, m.key, setMoodFilter)}
                  >
                    <Text style={[styles.moodChipText, on && { color: '#fff' }]}>
                      {m.emoji} {m.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.moodLabel}>By district</Text>
            <TouchableOpacity style={styles.feedSelect} onPress={() => setFeedPicker('district')}>
              <Text style={styles.feedSelectText}>{fDistrict || 'Any district'}</Text>
              <Ionicons name="chevron-down" size={18} color={colors.muted} />
            </TouchableOpacity>

            <Text style={styles.moodLabel}>By university / college</Text>
            <TouchableOpacity style={styles.feedSelect} onPress={() => setFeedPicker('uni')}>
              <Text style={styles.feedSelectText} numberOfLines={1}>
                {fUniversity || 'Any institution'}
              </Text>
              <Ionicons name="chevron-down" size={18} color={colors.muted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.feedSelect, fNearMe && { backgroundColor: colors.jaam, borderColor: colors.jaam }]}
              onPress={() => setFNearMe((v) => !v)}
            >
              <Ionicons name={fNearMe ? 'location' : 'location-outline'} size={18} color={fNearMe ? '#fff' : colors.jaam} />
              <Text style={[styles.feedSelectText, fNearMe && { color: '#fff' }]}>
                {fNearMe ? 'Near me: ON (within 25 km)' : 'Near me'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.applyMoodBtn}
              onPress={() => setShowFilter(false)}
            >
              <Text style={styles.applyMoodText}>Show results</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Who reacted */}
      <Modal visible={!!reactorsFor} transparent animationType="slide">
        <Pressable style={styles.sheetBack} onPress={() => setReactorsFor(null)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Reactions</Text>
            {Object.entries(reactorsFor?.reactions || {}).map(([ruid, r]) => (
              <TouchableOpacity
                key={ruid}
                style={styles.reactorRow}
                onPress={() => {
                  setReactorsFor(null);
                  goToProfile(ruid, r.name);
                }}
              >
                {r.photo ? (
                  <Image source={{ uri: r.photo }} style={styles.reactorAvatar} />
                ) : (
                  <View style={[styles.reactorAvatar, styles.avatarPh]}>
                    <Text style={styles.reactorInit}>
                      {(r.name || '?')[0].toUpperCase()}
                    </Text>
                  </View>
                )}
                <Text style={styles.reactorName}>
                  {ruid === uid ? 'You' : r.name || 'Someone'}
                </Text>
                <Text style={{ fontSize: 20 }}>{EMOJI[r.type]}</Text>
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Comments — Facebook style */}
      <Modal visible={!!commentsFor} transparent animationType="slide">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
          <Pressable style={styles.sheetBack} onPress={() => setCommentsFor(null)}>
            <Pressable style={[styles.sheet, styles.commentSheet]} onPress={() => {}}>
              <View style={styles.handle} />
              <Text style={styles.sheetTitle}>Comments</Text>
              <FlatList
                data={comments}
                keyExtractor={(item) => item.id}
                style={{ flexGrow: 0 }}
                ListEmptyComponent={
                  <Text style={styles.noComments}>
                    No comments yet — start the adda.
                  </Text>
                }
                renderItem={({ item }) => (
                  <View style={styles.commentRow}>
                    <TouchableOpacity
                      onPress={() => {
                        setCommentsFor(null);
                        goToProfile(item.authorId, item.authorName);
                      }}
                    >
                      {item.authorPhoto ? (
                        <Image
                          source={{ uri: item.authorPhoto }}
                          style={styles.commentAvatar}
                        />
                      ) : (
                        <View style={[styles.commentAvatar, styles.avatarPh]}>
                          <Text style={styles.commentAvatarInit}>
                            {(item.authorName || '?')[0].toUpperCase()}
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                    <View style={styles.commentBubbleWrap}>
                      <View style={styles.commentBubble}>
                        <TouchableOpacity
                          onPress={() => {
                            setCommentsFor(null);
                            goToProfile(item.authorId, item.authorName);
                          }}
                        >
                          <Text style={styles.commentAuthor}>
                            {item.authorId === uid ? 'You' : item.authorName}
                          </Text>
                        </TouchableOpacity>
                        <Text style={styles.commentText}>{item.text}</Text>
                      </View>
                      <View style={styles.commentActions}>
                        <Text style={styles.commentTime}>{timeAgo(item.createdAt)}</Text>
                        <TouchableOpacity onPress={() => reactComment(item.id, 'love')}>
                          <Text style={[styles.commentAct, item.reactions?.[uid] === 'love' && styles.commentActOn]}>
                            {item.reactions?.[uid] === 'love' ? '❤️ Loved' : '♡ Love'}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => reactComment(item.id, 'haha')}>
                          <Text style={[styles.commentAct, item.reactions?.[uid] === 'haha' && styles.commentActOn]}>
                            😂
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setReplyTo(item)}>
                          <Text style={styles.commentAct}>↩ Reply</Text>
                        </TouchableOpacity>
                        {Object.keys(item.reactions || {}).length > 0 && (
                          <Text style={styles.commentReactCount}>
                            {Object.values(item.reactions).map((t) => EMOJI[t] || '❤️').join('')}{' '}
                            {Object.keys(item.reactions).length}
                          </Text>
                        )}
                      </View>
                    </View>
                  </View>
                )}
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
              <View style={styles.commentInputRow}>
                <TextInput
                  style={styles.commentInput}
                  value={commentText}
                  onChangeText={setCommentText}
                  placeholder="Write a comment…"
                  placeholderTextColor={colors.muted}
                  maxLength={300}
                />
                <TouchableOpacity
                  style={[styles.sendBtn, !commentText.trim() && { opacity: 0.4 }]}
                  onPress={sendComment}
                  disabled={!commentText.trim()}
                >
                  <Ionicons name="arrow-up" size={19} color="#fff" />
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

export function timeAgo(ts) {
  const ms = ts?.toMillis?.();
  if (!ms) return 'just now';
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
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
      paddingBottom: 10,
    },
    wordmark: { fontFamily: fonts.display, fontSize: 30, color: colors.jaam },
    wordmarkDot: { color: colors.shiuli, fontSize: 14 },
    headerBtns: { flexDirection: 'row', gap: 10, alignItems: 'center' },
    iconBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 1.5,
      borderColor: colors.line,
      backgroundColor: colors.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    plusBtn: { backgroundColor: colors.jaam, borderColor: colors.jaam },
    dot: {
      position: 'absolute',
      top: 7,
      right: 7,
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
    list: { paddingHorizontal: 16, paddingBottom: 24 },
    post: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 18,
      padding: 14,
      marginBottom: 12,
    },
    postHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    avatar: { width: 40, height: 40, borderRadius: 20 },
    avatarPh: {
      backgroundColor: colors.jaamSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarInit: { fontFamily: fonts.display, fontSize: 18, color: colors.jaam },
    anonAvatar: {
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: colors.jaamDark, alignItems: 'center', justifyContent: 'center',
    },
    anonQ: { color: '#fff', fontFamily: fonts.display, fontSize: 20, lineHeight: 24 },
    anonBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: colors.jaamSoft, borderRadius: 999,
      paddingHorizontal: 9, paddingVertical: 4, marginRight: 4,
    },
    anonBadgeText: { fontSize: 11, fontWeight: '700', color: colors.jaam },
    saveIcon: { padding: 4 },
    author: { fontSize: 14, fontWeight: '700', color: colors.ink },
    time: { fontSize: 11, color: colors.muted, marginTop: 1 },
    postText: { marginTop: 10, fontSize: 14, lineHeight: 21, color: colors.ink },
    mentionHl: { color: colors.jaam, fontWeight: '700' },
    postPhoto: { width: '100%', aspectRatio: 4 / 3, borderRadius: 12, marginTop: 10 },
    reactSummary: { marginTop: 10 },
    reactSummaryText: { fontSize: 12.5, color: colors.muted, fontWeight: '600' },
    pickerRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 4,
      marginTop: 12,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 24,
      paddingVertical: 8,
      paddingHorizontal: 10,
      alignSelf: 'flex-start',
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 4,
    },
    pickerWrap: { alignSelf: 'flex-start', maxWidth: '100%' },
    pickerItem: { alignItems: 'center', paddingHorizontal: 3 },
    pickerPlus: { backgroundColor: colors.jaamSoft, borderWidth: 1, borderColor: colors.line },
    pickerBubble: {
      width: 44, height: 44, borderRadius: 22,
      alignItems: 'center', justifyContent: 'center',
    },
    pickerBubbleSel: { backgroundColor: colors.jaamSoft },
    pickerLabel: { fontSize: 10, color: colors.muted, fontWeight: '700', marginTop: 1 },
    actionRow: { flexDirection: 'row', gap: 10, marginTop: 11 },
    reactBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: colors.jaamSoft, borderRadius: 999,
      paddingHorizontal: 16, paddingVertical: 8,
    },
    reactBtnActive: { backgroundColor: colors.jaam },
    reactBtnText: { fontSize: 13, fontWeight: '800', color: colors.jaam },
    reactBtnTextActive: { color: '#fff' },
    actionBtn: {
      backgroundColor: colors.jaamSoft,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 7,
    },
    actionBtnActive: { backgroundColor: colors.jaam },
    actionBtnText: { fontSize: 12.5, fontWeight: '700', color: colors.ink },
    empty: { alignItems: 'center', padding: 32 },
    emptyTitle: {
      fontFamily: fonts.displayMedium,
      fontSize: 19,
      color: colors.ink,
      marginTop: 12,
    },
    emptyText: { marginTop: 6, color: colors.muted, fontSize: 13, textAlign: 'center' },
    sheetBack: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.bg,
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      padding: 20,
      paddingBottom: 30,
    },
    handle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.line,
      alignSelf: 'center',
      marginBottom: 10,
    },
    sheetTitle: {
      fontFamily: fonts.display,
      fontSize: 20,
      color: colors.ink,
      marginBottom: 10,
    },
    composerInput: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 14,
      padding: 14,
      fontSize: 15,
      color: colors.ink,
      minHeight: 90,
      textAlignVertical: 'top',
    },
    preview: { width: '100%', aspectRatio: 4 / 3, borderRadius: 12, marginTop: 10 },
    moodLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.muted,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginTop: 14,
      marginBottom: 8,
    },
    moodWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    moodChip: {
      borderWidth: 1.5,
      borderColor: colors.line,
      backgroundColor: colors.card,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    moodChipOn: { backgroundColor: colors.jaam, borderColor: colors.jaam },
    moodChipText: { fontSize: 12.5, fontWeight: '600', color: colors.ink },
    applyMoodBtn: {
      backgroundColor: colors.jaam,
      borderRadius: 999,
      paddingVertical: 13,
      alignItems: 'center',
      marginTop: 16,
    },
    applyMoodText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    postMoods: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
    postMoodBadge: {
      backgroundColor: colors.jaamSoft,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    postMoodText: { fontSize: 11.5, color: colors.jaam, fontWeight: '700' },
    feedSelect: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      gap: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line,
      borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginTop: 4,
    },
    feedSelectText: { fontSize: 14, color: colors.ink, fontWeight: '600', flex: 1 },
    anonToggle: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      marginTop: 14, paddingVertical: 4,
    },
    anonToggleText: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.muted },
    anonSwitch: {
      width: 42, height: 24, borderRadius: 12, backgroundColor: colors.line,
      padding: 3, justifyContent: 'center',
    },
    anonSwitchOn: { backgroundColor: colors.jaam },
    anonKnob: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff' },
    anonKnobOn: { alignSelf: 'flex-end' },
    anonBanner: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: colors.jaamDark, paddingHorizontal: 16, paddingVertical: 9,
    },
    anonBannerText: { flex: 1, color: '#fff', fontSize: 12.5, fontWeight: '600' },
    anonBannerOff: { color: '#fff', fontSize: 12.5, fontWeight: '800', textDecorationLine: 'underline' },
    composerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 14,
    },
    photoBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    photoBtnText: { color: colors.jaam, fontWeight: '600', fontSize: 13 },
    postBtn: {
      backgroundColor: colors.jaam,
      borderRadius: 999,
      paddingHorizontal: 24,
      paddingVertical: 10,
    },
    postBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    filterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
    },
    filterText: { fontSize: 15, color: colors.ink, fontWeight: '600' },
    reactorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 9,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
    },
    reactorAvatar: { width: 40, height: 40, borderRadius: 20 },
    reactorInit: { fontFamily: fonts.display, fontSize: 17, color: colors.jaam },
    reactorName: { flex: 1, fontSize: 14.5, color: colors.ink, fontWeight: '600' },
    commentSheet: { maxHeight: '75%' },
    noComments: { color: colors.muted, fontSize: 13.5, paddingVertical: 14 },
    commentRow: { flexDirection: 'row', gap: 9, marginBottom: 10 },
    commentAvatar: { width: 36, height: 36, borderRadius: 18 },
    commentAvatarInit: { fontFamily: fonts.display, fontSize: 15, color: colors.jaam },
    commentBubbleWrap: { flex: 1 },
    commentBubble: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 16,
      borderTopLeftRadius: 4,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    commentAuthor: { fontSize: 12.5, fontWeight: '800', color: colors.jaam },
    commentText: { fontSize: 13.5, color: colors.ink, marginTop: 2, lineHeight: 19 },
    commentTime: { fontSize: 10.5, color: colors.muted },
    commentActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      marginTop: 5,
      marginLeft: 12,
      flexWrap: 'wrap',
    },
    commentAct: { fontSize: 11.5, color: colors.muted, fontWeight: '700' },
    commentActOn: { color: colors.jaam },
    commentReactCount: { fontSize: 11.5, color: colors.jaam, fontWeight: '700' },
    replyBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.jaamSoft,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 7,
      marginTop: 8,
    },
    replyBarText: { fontSize: 12.5, color: colors.jaam, fontWeight: '600', flex: 1 },
    commentInputRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
    commentInput: {
      flex: 1,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 999,
      paddingHorizontal: 15,
      paddingVertical: 10,
      fontSize: 14,
      color: colors.ink,
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
