import React, { useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';
import { fonts, useTheme } from '../theme';
import { createGroup, seedAndJoinGroups, joinGroup } from '../utils/groups';
import { toggleMute, fetchMyMutes } from '../utils/relationships';

const EMOJI_CHOICES = ['💬', '🎨', '🎵', '✈️', '⚽', '🎮', '📚', '💘', '😂', '🌙', '🔥', '🍜'];

export default function GroupsScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const uid = auth.currentUser.uid;

  const [groups, setGroups] = useState([]);
  const [mutes, setMutes] = useState(new Set());
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmoji, setNewEmoji] = useState('💬');

  useEffect(() => {
    // Ensure the 20 seed groups exist and I'm a member.
    seedAndJoinGroups();
    fetchMyMutes().then(setMutes).catch(() => {});

    const unsub = onSnapshot(
      query(collection(db, 'groups'), orderBy('createdAt', 'asc')),
      (snap) => {
        setGroups(
          snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }))
        );
      },
      (e) => console.warn('Groups listener failed', e)
    );
    return unsub;
  }, [uid]);

  const openGroup = async (g) => {
    await joinGroup(g.id).catch(() => {});
    navigation.navigate('GroupChat', { groupId: g.id, groupName: g.name, emoji: g.emoji });
  };

  const onLongPress = (g) =>
    Alert.alert(g.name, null, [
      {
        text: mutes.has(g.id) ? 'Unmute group' : 'Mute group',
        onPress: async () => {
          await toggleMute(g.id);
          setMutes(await fetchMyMutes());
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);

  const submitCreate = async () => {
    if (!newName.trim()) return;
    const id = await createGroup(newName, newEmoji);
    setCreating(false);
    setNewName('');
    setNewEmoji('💬');
    navigation.navigate('GroupChat', { groupId: id, groupName: newName.trim(), emoji: newEmoji });
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.row}
      onPress={() => openGroup(item)}
      onLongPress={() => onLongPress(item)}
      delayLongPress={350}
    >
      <View style={styles.emojiWrap}>
        <Text style={{ fontSize: 24 }}>{item.emoji || '💬'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{item.name}</Text>
          {item.adult && <Text style={styles.adultTag}>18+</Text>}
          {mutes.has(item.id) && (
            <Ionicons name="notifications-off" size={13} color={colors.muted} />
          )}
        </View>
        <Text style={styles.sub}>
          {item.seeded ? 'Public group' : 'Community group'} · tap to open
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.muted} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        data={groups}
        keyExtractor={(g) => g.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <TouchableOpacity style={styles.createBtn} onPress={() => setCreating(true)}>
            <Ionicons name="add-circle" size={22} color="#fff" />
            <Text style={styles.createText}>Create a group</Text>
          </TouchableOpacity>
        }
      />

      <Modal visible={creating} transparent animationType="slide">
        <View style={styles.back}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>New group</Text>
            <TextInput
              style={styles.input}
              value={newName}
              onChangeText={setNewName}
              placeholder="Group name"
              placeholderTextColor={colors.muted}
              maxLength={40}
              autoFocus
            />
            <Text style={styles.pickLabel}>Pick an icon</Text>
            <View style={styles.emojiRow}>
              {EMOJI_CHOICES.map((e) => (
                <TouchableOpacity
                  key={e}
                  style={[styles.emojiCell, newEmoji === e && styles.emojiCellOn]}
                  onPress={() => setNewEmoji(e)}
                >
                  <Text style={{ fontSize: 22 }}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setCreating(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, !newName.trim() && { opacity: 0.5 }]}
                onPress={submitCreate}
                disabled={!newName.trim()}
              >
                <Text style={styles.saveText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    list: { padding: 16 },
    createBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.jaam,
      borderRadius: 16,
      paddingVertical: 14,
      marginBottom: 14,
    },
    createText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.line,
      marginBottom: 10,
    },
    emojiWrap: {
      width: 50,
      height: 50,
      borderRadius: 25,
      backgroundColor: colors.jaamSoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    name: { fontSize: 16, fontWeight: '700', color: colors.ink },
    adultTag: {
      fontSize: 10,
      fontWeight: '800',
      color: '#fff',
      backgroundColor: colors.danger,
      borderRadius: 6,
      paddingHorizontal: 5,
      paddingVertical: 1,
      overflow: 'hidden',
    },
    sub: { fontSize: 12, color: colors.muted, marginTop: 2 },
    back: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
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
    sheetTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.ink, marginBottom: 14 },
    input: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 14,
      paddingHorizontal: 15,
      paddingVertical: 12,
      fontSize: 15,
      color: colors.ink,
    },
    pickLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.muted,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginTop: 16,
      marginBottom: 10,
    },
    emojiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    emojiCell: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: colors.card,
      borderWidth: 2,
      borderColor: colors.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emojiCellOn: { borderColor: colors.jaam },
    modalRow: { flexDirection: 'row', gap: 10, marginTop: 22 },
    cancelBtn: {
      flex: 1,
      borderWidth: 1.5,
      borderColor: colors.line,
      borderRadius: 999,
      paddingVertical: 13,
      alignItems: 'center',
    },
    cancelText: { color: colors.ink, fontWeight: '700' },
    saveBtn: {
      flex: 2,
      backgroundColor: colors.jaam,
      borderRadius: 999,
      paddingVertical: 13,
      alignItems: 'center',
    },
    saveText: { color: '#fff', fontWeight: '700' },
  });
