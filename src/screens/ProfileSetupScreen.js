import React, { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
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
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';
import { fonts, useTheme } from '../theme';
import { pickProfilePhoto } from '../utils/photo';
import { INTERESTS, GOALS, ZODIACS } from '../constants';
import SearchablePicker from '../components/SearchablePicker';
import { BD_INSTITUTIONS } from '../data/bdInstitutions';
import { BD_DISTRICTS, BD_DISTRICTS_UPAZILAS } from '../data/bdGeo';
import { updateMyLocation } from '../utils/location';

const GENDERS = [
  { label: 'Man', value: 'man' },
  { label: 'Woman', value: 'woman' },
  { label: 'Non-binary', value: 'other' },
];

const PREFERENCES = [
  { label: 'Men', value: 'man' },
  { label: 'Women', value: 'woman' },
  { label: 'Everyone', value: 'everyone' },
];

export default function ProfileSetupScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const isEdit = navigation.canGoBack();

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState(null);
  const [interestedIn, setInterestedIn] = useState(null);
  const [bio, setBio] = useState('');
  const [hometown, setHometown] = useState('');
  const [district, setDistrict] = useState('');
  const [upazila, setUpazila] = useState('');
  const [picker, setPicker] = useState(null); // 'uni'|'district'|'upazila'
  const [locSaved, setLocSaved] = useState(false);
  const [location, setLocation] = useState('');
  const [university, setUniversity] = useState('');
  const [job, setJob] = useState('');
  const [interests, setInterests] = useState([]);
  const [goal, setGoal] = useState(null);
  const [height, setHeight] = useState('');
  const [zodiac, setZodiac] = useState(null);
  const [languages, setLanguages] = useState('');
  const [firstDate, setFirstDate] = useState('');
  const [photoBase64, setPhotoBase64] = useState(null);
  const [busy, setBusy] = useState(false);

  // Prefill when editing an existing profile
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (snap.exists()) {
          const p = snap.data();
          setName(p.name || '');
          setAge(p.age ? String(p.age) : '');
          setGender(p.gender || null);
          setInterestedIn(p.interestedIn || null);
          setBio(p.bio || '');
          setUsername(p.username || '');
          setHometown(p.hometown || '');
          setDistrict(p.district || '');
          setUpazila(p.upazila || '');
          if (p.geo) setLocSaved(true);
          setLocation(p.location || '');
          setUniversity(p.university || '');
          setJob(p.job || '');
          setInterests(p.interests || []);
          setGoal(p.goal || null);
          setHeight(p.height || '');
          setZodiac(p.zodiac || null);
          setLanguages(p.languages || '');
          setFirstDate(p.firstDate || '');
          setPhotoBase64(p.photoBase64 || null);
        }
      } catch {
        // First-time setup — nothing to prefill.
      }
    })();
  }, []);

  const choosePhoto = async () => {
    const photo = await pickProfilePhoto();
    if (photo) setPhotoBase64(photo);
  };

  const save = async () => {
    const ageNum = parseInt(age, 10);
    if (!name.trim()) return Alert.alert('Add your name', 'Your name is what matches will see.');
    if (!ageNum || Number.isNaN(ageNum))
      return Alert.alert('Add your age', 'Enter your age as a number.');
    if (ageNum < 18)
      return Alert.alert('18+ only', 'You must be 18 or over to use Adda.');
    if (ageNum > 100) return Alert.alert('Check your age', 'That age looks unlikely.');
    if (!gender) return Alert.alert('Select gender', 'Choose how you identify.');
    if (!interestedIn)
      return Alert.alert('Select preference', 'Choose who you want to see.');

    const uname = username.trim().toLowerCase().replace(/^@+/, '');
    if (!uname) return Alert.alert('Pick a username', 'Choose a unique @username.');
    if (!/^[a-z0-9_]{3,20}$/.test(uname))
      return Alert.alert(
        'Invalid username',
        '3–20 characters: letters, numbers, or underscore only.'
      );

    setBusy(true);
    try {
      const uid = auth.currentUser.uid;

      // Uniqueness: is this username taken by someone else?
      const taken = await getDocs(
        query(collection(db, 'users'), where('username', '==', uname), limit(1))
      );
      if (!taken.empty && taken.docs[0].id !== uid) {
        setBusy(false);
        return Alert.alert('Username taken', 'Someone already has @' + uname + '. Try another.');
      }
      await setDoc(
        doc(db, 'users', uid),
        {
          name: name.trim(),
          username: uname,
          age: ageNum,
          gender,
          interestedIn,
          bio: bio.trim(),
          hometown: district || hometown.trim(),
          district,
          upazila,
          location: location.trim(),
          university: university.trim(),
          job: job.trim(),
          interests,
          goal,
          height: height.trim(),
          zodiac,
          languages: languages.trim(),
          firstDate: firstDate.trim(),
          photoBase64: photoBase64 || null,
          lastActiveAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      if (isEdit) navigation.goBack();
      // In first-time setup, App.js sees the new doc and switches to the tabs.
    } catch (e) {
      Alert.alert('Could not save', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={isEdit ? ['bottom'] : ['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {!isEdit && (
            <>
              <Text style={styles.title}>Tell us about you</Text>
              <Text style={styles.subtitle}>
                This is what people see before they swipe.
              </Text>
            </>
          )}

          <TouchableOpacity style={styles.photoWrap} onPress={choosePhoto}>
            {photoBase64 ? (
              <Image source={{ uri: photoBase64 }} style={styles.photo} />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Ionicons name="camera" size={30} color={colors.jaam} />
                <Text style={styles.photoHint}>Add a photo</Text>
              </View>
            )}
            <View style={styles.photoBadge}>
              <Ionicons name="pencil" size={14} color="#fff" />
            </View>
          </TouchableOpacity>

          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Your first name"
            placeholderTextColor={colors.muted}
          />

          <Text style={styles.label}>Username</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={(t) => setUsername(t.replace(/\s/g, ''))}
            placeholder="@yourname (unique)"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
          />

          <Text style={styles.label}>Age</Text>
          <TextInput
            style={styles.input}
            value={age}
            onChangeText={setAge}
            placeholder="18+"
            placeholderTextColor={colors.muted}
            keyboardType="number-pad"
            maxLength={3}
          />

          <Text style={styles.label}>I am a</Text>
          <View style={styles.chipRow}>
            {GENDERS.map((g) => (
              <Chip
                key={g.value}
                styles={styles}
                label={g.label}
                active={gender === g.value}
                onPress={() => setGender(g.value)}
              />
            ))}
          </View>

          <Text style={styles.label}>Show me</Text>
          <View style={styles.chipRow}>
            {PREFERENCES.map((p) => (
              <Chip
                key={p.value}
                styles={styles}
                label={p.label}
                active={interestedIn === p.value}
                onPress={() => setInterestedIn(p.value)}
              />
            ))}
          </View>

          <Text style={styles.label}>Hometown district</Text>
          <TouchableOpacity style={styles.selectBtn} onPress={() => setPicker('district')}>
            <Text style={styles.selectText}>{district || 'Select district'}</Text>
            <Ionicons name="chevron-down" size={18} color={colors.muted} />
          </TouchableOpacity>

          {!!district && (
            <>
              <Text style={styles.label}>Upazila</Text>
              <TouchableOpacity style={styles.selectBtn} onPress={() => setPicker('upazila')}>
                <Text style={styles.selectText}>{upazila || 'Select upazila'}</Text>
                <Ionicons name="chevron-down" size={18} color={colors.muted} />
              </TouchableOpacity>
            </>
          )}

          <Text style={styles.label}>Current location</Text>
          <TextInput
            style={styles.input}
            value={location}
            onChangeText={setLocation}
            placeholder="e.g. Dhaka"
            placeholderTextColor={colors.muted}
          />

          <TouchableOpacity
            style={[styles.selectBtn, locSaved && styles.selectBtnOn]}
            onPress={async () => {
              const g = await updateMyLocation();
              if (g) setLocSaved(true);
            }}
          >
            <Ionicons
              name={locSaved ? 'location' : 'location-outline'}
              size={18}
              color={locSaved ? '#fff' : colors.jaam}
            />
            <Text style={[styles.selectText, locSaved && { color: '#fff' }]}>
              {locSaved ? 'Location saved — enables Near me' : 'Share GPS location (for Near me)'}
            </Text>
          </TouchableOpacity>

          <Text style={styles.label}>University / College</Text>
          <TouchableOpacity style={styles.selectBtn} onPress={() => setPicker('uni')}>
            <Text style={styles.selectText} numberOfLines={1}>
              {university || 'Select institution'}
            </Text>
            <Ionicons name="chevron-down" size={18} color={colors.muted} />
          </TouchableOpacity>

          <Text style={styles.label}>Job</Text>
          <TextInput
            style={styles.input}
            value={job}
            onChangeText={setJob}
            placeholder="e.g. Student, Doctor, Engineer"
            placeholderTextColor={colors.muted}
          />

          <Text style={styles.label}>Relationship goal</Text>
          <View style={styles.chips}>
            {GOALS.map((g) => (
              <TouchableOpacity
                key={g.key}
                style={[styles.chip, goal === g.key && styles.chipActive]}
                onPress={() => setGoal(g.key)}
              >
                <Text style={[styles.chipText, goal === g.key && styles.chipTextActive]}>
                  {g.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Interests</Text>
          <View style={styles.chips}>
            {INTERESTS.map((it) => {
              const on = interests.includes(it);
              return (
                <TouchableOpacity
                  key={it}
                  style={[styles.chip, on && styles.chipActive]}
                  onPress={() =>
                    setInterests((arr) =>
                      arr.includes(it) ? arr.filter((x) => x !== it) : [...arr, it]
                    )
                  }
                >
                  <Text style={[styles.chipText, on && styles.chipTextActive]}>{it}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.label}>Height</Text>
          <TextInput
            style={styles.input}
            value={height}
            onChangeText={setHeight}
            placeholder={"e.g. 175 cm or 5ft 9in"}
            placeholderTextColor={colors.muted}
          />

          <Text style={styles.label}>Zodiac</Text>
          <View style={styles.chips}>
            {ZODIACS.map((z) => (
              <TouchableOpacity
                key={z}
                style={[styles.chip, zodiac === z && styles.chipActive]}
                onPress={() => setZodiac(zodiac === z ? null : z)}
              >
                <Text style={[styles.chipText, zodiac === z && styles.chipTextActive]}>
                  {z}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Languages</Text>
          <TextInput
            style={styles.input}
            value={languages}
            onChangeText={setLanguages}
            placeholder="e.g. Bangla, English"
            placeholderTextColor={colors.muted}
          />

          <Text style={styles.label}>My ideal first date is…</Text>
          <TextInput
            style={[styles.input, styles.bioInput]}
            value={firstDate}
            onChangeText={setFirstDate}
            placeholder="Tea at TSC and endless adda?"
            placeholderTextColor={colors.muted}
            multiline
            maxLength={200}
          />

          <Text style={styles.label}>Bio</Text>
          <TextInput
            style={[styles.input, styles.bioInput]}
            value={bio}
            onChangeText={setBio}
            placeholder="A line or two about you — what you love, what you're looking for."
            placeholderTextColor={colors.muted}
            multiline
            maxLength={300}
          />

          <TouchableOpacity
            style={[styles.button, busy && styles.buttonDisabled]}
            onPress={save}
            disabled={busy}
          >
            <Text style={styles.buttonText}>
              {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Start swiping'}
            </Text>
          </TouchableOpacity>
        </ScrollView>

        <SearchablePicker
          visible={picker === 'uni'}
          title="University / College"
          options={BD_INSTITUTIONS}
          allowClear
          onClose={() => setPicker(null)}
          onSelect={(v) => { setUniversity(v || ''); setPicker(null); }}
        />
        <SearchablePicker
          visible={picker === 'district'}
          title="District"
          options={BD_DISTRICTS}
          allowClear
          onClose={() => setPicker(null)}
          onSelect={(v) => { setDistrict(v || ''); setUpazila(''); setPicker(null); }}
        />
        <SearchablePicker
          visible={picker === 'upazila'}
          title="Upazila"
          options={district ? (BD_DISTRICTS_UPAZILAS[district] || []) : []}
          allowClear
          onClose={() => setPicker(null)}
          onSelect={(v) => { setUpazila(v || ''); setPicker(null); }}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Chip({ label, active, onPress, styles }) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scroll: { paddingHorizontal: 28, paddingBottom: 48 },
  title: { fontFamily: fonts.display, fontSize: 34, color: colors.ink, marginTop: 16 },
  subtitle: { marginTop: 6, fontSize: 14, color: colors.muted },
  photoWrap: { alignSelf: 'center', marginTop: 24 },
  photo: { width: 132, height: 165, borderRadius: 20 },
  photoPlaceholder: {
    width: 132,
    height: 165,
    borderRadius: 20,
    backgroundColor: colors.jaamSoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
  },
  photoHint: { marginTop: 8, color: colors.jaam, fontWeight: '600', fontSize: 13 },
  photoBadge: {
    position: 'absolute',
    right: -6,
    bottom: -6,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.jaam,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bg,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
    marginTop: 18,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 16,
    color: colors.ink,
  },
  bioInput: { minHeight: 96, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  chipActive: { backgroundColor: colors.jaam, borderColor: colors.jaam },
  chipText: { color: colors.ink, fontWeight: '600', fontSize: 14 },
  chipTextActive: { color: '#fff' },
  button: {
    marginTop: 32,
    backgroundColor: colors.jaam,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
