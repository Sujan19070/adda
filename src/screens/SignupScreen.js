import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { auth } from '../../firebaseConfig';
import { fonts, useTheme } from '../theme';
import { friendlyAuthError } from './LoginScreen';

export default function SignupScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const signup = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Missing details', 'Enter an email and a password to create your account.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Weak password', 'Use at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Passwords differ', 'The two passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      // Real email verification: the account exists but stays locked
      // behind the VerifyEmail gate until the link is clicked.
      await sendEmailVerification(cred.user);
      // App.js now routes to the VerifyEmail screen automatically.
    } catch (e) {
      Alert.alert('Could not create account', friendlyAuthError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
      >
        <View style={styles.hero}>
          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.subtitle}>Your profile comes next — this is just the key.</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="At least 6 characters"
            placeholderTextColor={colors.muted}
            secureTextEntry
          />

          <Text style={styles.label}>Confirm password</Text>
          <TextInput
            style={styles.input}
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Same password again"
            placeholderTextColor={colors.muted}
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.button, busy && styles.buttonDisabled]}
            onPress={signup}
            disabled={busy}
          >
            <Text style={styles.buttonText}>
              {busy ? 'Creating account…' : 'Create account'}
            </Text>
          </TouchableOpacity>

          <Pressable onPress={() => navigation.goBack()} style={styles.switchRow}>
            <Text style={styles.switchText}>
              Already have an account? <Text style={styles.switchLink}>Sign in</Text>
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  hero: { paddingTop: 48, paddingHorizontal: 28 },
  title: { fontFamily: fonts.display, fontSize: 34, color: colors.ink },
  subtitle: { marginTop: 8, fontSize: 14, color: colors.muted, lineHeight: 20 },
  form: { flex: 1, paddingHorizontal: 28, paddingTop: 8 },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
    marginTop: 16,
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
  button: {
    marginTop: 28,
    backgroundColor: colors.jaam,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  switchRow: { marginTop: 20, alignItems: 'center' },
  switchText: { color: colors.muted, fontSize: 14 },
  switchLink: { color: colors.jaam, fontWeight: '700' },
});
