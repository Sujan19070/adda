import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fonts, useTheme } from '../theme';

// A tap-to-open modal that filters a big list by typed text. Used anywhere a
// long dataset (universities, districts, upazilas) needs a searchable select.
export default function SearchablePicker({
  visible,
  title,
  options,
  onSelect,
  onClose,
  allowClear,
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((o) => o.toLowerCase().includes(needle));
  }, [q, options]);

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.back}>
        <View style={styles.sheet}>
          <View style={styles.handleRow}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.muted} />
            </TouchableOpacity>
          </View>

          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={colors.muted} />
            <TextInput
              style={styles.searchInput}
              value={q}
              onChangeText={setQ}
              placeholder="Search…"
              placeholderTextColor={colors.muted}
              autoFocus
            />
          </View>

          {allowClear && (
            <TouchableOpacity
              style={styles.clearRow}
              onPress={() => {
                onSelect(null);
                setQ('');
              }}
            >
              <Ionicons name="close-circle-outline" size={18} color={colors.danger} />
              <Text style={styles.clearText}>Clear selection</Text>
            </TouchableOpacity>
          )}

          <FlatList
            data={filtered}
            keyExtractor={(item, i) => item + i}
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: 380 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.row}
                onPress={() => {
                  onSelect(item);
                  setQ('');
                }}
              >
                <Text style={styles.rowText}>{item}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text style={styles.empty}>No matches for “{q}”.</Text>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
    back: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.bg,
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      padding: 20,
      paddingBottom: 30,
      maxHeight: '85%',
    },
    handleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14,
    },
    title: { fontFamily: fonts.display, fontSize: 22, color: colors.ink },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginBottom: 8,
    },
    searchInput: { flex: 1, fontSize: 15, color: colors.ink },
    clearRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 12,
    },
    clearText: { color: colors.danger, fontWeight: '700', fontSize: 14 },
    row: {
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
    },
    rowText: { fontSize: 15, color: colors.ink },
    empty: { color: colors.muted, fontSize: 14, textAlign: 'center', paddingVertical: 24 },
  });
