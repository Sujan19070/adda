import React, { useEffect, useState } from 'react';
import {
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { fonts, useTheme } from '../theme';
import { fetchMentionCandidates, searchUsersByUsername } from '../utils/mentions';

// A text input that powers @mentions. When the user types "@" followed by
// text, a suggestion list appears (friends + recent chats, then username
// matches). Selecting someone inserts "@Nickname " — always the display name,
// even if they were found by username. onMention collects the mentioned users
// so the parent can send notifications.
export default function MentionInput({
  value,
  onChangeText,
  onMention,
  placeholder,
  style,
  inputStyle,
  multiline = true,
  maxLength = 1000,
  autoFocus = false,
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const [candidates, setCandidates] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [query, setQuery] = useState(null); // active "@..." query, or null

  // Preload friends + recent chats once (retry-safe if auth wasn't ready).
  useEffect(() => {
    let tries = 0;
    const load = () => {
      fetchMentionCandidates()
        .then((list) => {
          if (list && list.length) setCandidates(list);
          else if (tries++ < 3) setTimeout(load, 800);
        })
        .catch(() => {
          if (tries++ < 3) setTimeout(load, 800);
        });
    };
    load();
  }, []);

  // Recompute suggestions whenever the active @query changes.
  useEffect(() => {
    if (query == null) {
      setSuggestions([]);
      return;
    }
    const q = query.toLowerCase();
    const base = candidates.filter(
      (c) =>
        !q ||
        (c.name || '').toLowerCase().includes(q) ||
        (c.username || '').toLowerCase().includes(q)
    );
    // Show friends/recent instantly. Then, if there's any typed text, also
    // search all users so people who aren't friends/recent still appear.
    setSuggestions(base.slice(0, 6));
    if (q.length >= 1) {
      searchUsersByUsername(q)
        .then((extra) => {
          const seen = new Set(base.map((b) => b.id));
          const merged = [...base, ...extra.filter((e) => !seen.has(e.id))];
          setSuggestions(merged.slice(0, 6));
        })
        .catch(() => {});
    }
  }, [query, candidates]);

  // Detect the "@word" the user is currently typing. We read it from the END
  // of the text rather than a tracked caret position — this is reliable in
  // release/Hermes builds where selection events can lag behind text changes.
  const detectQuery = (text) => {
    const m = text.match(/(?:^|\s)@([\w]*)$/);
    return m ? m[1] : null;
  };

  const handleChange = (text) => {
    onChangeText(text);
    setQuery(detectQuery(text));
  };

  const pick = (person) => {
    // Replace the trailing "@query" with "@Nickname " (always the display name).
    const replaced = value.replace(/(^|\s)@([\w]*)$/, `$1@${person.name} `);
    onChangeText(replaced);
    setQuery(null);
    onMention && onMention(person);
  };

  return (
    <View style={style}>
      {suggestions.length > 0 && (
        <View style={styles.popup}>
          <FlatList
            data={suggestions}
            keyExtractor={(i) => i.id}
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: 220 }}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.row} onPress={() => pick(item)}>
                {item.photo ? (
                  <Image source={{ uri: item.photo }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarPh]}>
                    <Text style={styles.avatarInit}>
                      {(item.name || '?')[0].toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.name}</Text>
                  {!!item.username && <Text style={styles.handle}>@{item.username}</Text>}
                </View>
              </TouchableOpacity>
            )}
          />
        </View>
      )}
      <TextInput
        style={inputStyle}
        value={value}
        onChangeText={handleChange}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        multiline={multiline}
        maxLength={maxLength}
        autoFocus={autoFocus}
      />
    </View>
  );
}

// Renders a message/comment string with @Nickname mentions highlighted.
export function MentionText({ text, style, mentionStyle }) {
  if (!text) return null;
  // Split on @Name tokens (name may contain spaces up to 24 chars, stops at
  // punctuation/end). We highlight "@Word" and "@Word Word" heuristically by
  // matching @ followed by letters/digits/underscore/space (greedy-limited).
  const parts = [];
  const regex = /@([A-Za-z0-9_]+(?:\s[A-Za-z0-9_]+)?)/g;
  let last = 0;
  let m;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push({ t: text.slice(last, m.index), mention: false });
    parts.push({ t: m[0], mention: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ t: text.slice(last), mention: false });

  return (
    <Text style={style}>
      {parts.map((p, i) =>
        p.mention ? (
          <Text key={i} style={mentionStyle}>
            {p.t}
          </Text>
        ) : (
          <Text key={i}>{p.t}</Text>
        )
      )}
    </Text>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
    popup: {
      position: 'absolute',
      bottom: '100%',
      left: 0,
      right: 0,
      marginBottom: 6,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 14,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOpacity: 0.15,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
    },
    avatar: { width: 34, height: 34, borderRadius: 17 },
    avatarPh: {
      backgroundColor: colors.jaamSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarInit: { fontFamily: fonts.display, fontSize: 15, color: colors.jaam },
    name: { fontSize: 14, fontWeight: '700', color: colors.ink },
    handle: { fontSize: 12, color: colors.jaam, marginTop: 1 },
  });
