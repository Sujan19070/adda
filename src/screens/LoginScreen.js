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
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../firebaseConfig';
import { signInWithGoogle } from '../utils/googleAuth';
import { fonts, useTheme } from '../theme';

export default function LoginScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  const googleLogin = async () => {
    setGoogleBusy(true);
    try {
      await signInWithGoogle();
    } catch (e) {
      if (e?.message === 'EXPO_GO') {
        Alert.alert(
          'Not available in Expo Go',
          'Google Sign-In uses native code, so it only works in the installed APK or a development build — not inside Expo Go. Use email for now; the button will work in the APK you build with EAS.'
        );
      } else if (e?.code !== 'SIGN_IN_CANCELLED' && e?.code !== '12501') {
        Alert.alert('Google sign-in failed', e?.message || 'Try again.');
      }
    } finally {
      setGoogleBusy(false);
    }
  };

  const login = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Missing details', 'Enter your email and password to sign in.');
      return;
    }
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (e) {
      Alert.alert('Could not sign in', friendlyAuthError(e));
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
          <Text style={styles.wordmark}>
            adda<Text style={styles.wordmarkDot}> ♥</Text>
          </Text>
          <Text style={styles.tagline}>আড্ডা জমুক, মন মিলুক — hang out, hearts meet</Text>
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
            autoComplete="email"
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            placeholderTextColor={colors.muted}
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.button, busy && styles.buttonDisabled]}
            onPress={login}
            disabled={busy}
          >
            <Text style={styles.buttonText}>{busy ? 'Signing in…' : 'Sign in'}</Text>
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            style={[styles.googleButton, googleBusy && styles.buttonDisabled]}
            onPress={googleLogin}
            disabled={googleBusy}
          >
            <Text style={styles.googleG}>G</Text>
            <Text style={styles.googleText}>
              {googleBusy ? 'Connecting…' : 'Continue with Google'}
            </Text>
          </TouchableOpacity>

          <Pressable onPress={() => navigation.navigate('Signup')} style={styles.switchRow}>
            <Text style={styles.switchText}>
              New here? <Text style={styles.switchLink}>Create an account</Text>
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function friendlyAuthError(e) {
  const code = e?.code || '';
  if (code.includes('invalid-credential') || code.includes('wrong-password'))
    return 'Email or password is incorrect.';
  if (code.includes('user-not-found')) return 'No account found with that email.';
  if (code.includes('invalid-email')) return 'That email address looks invalid.';
  if (code.includes('email-already-in-use'))
    return 'An account with this email already exists. Try signing in instead.';
  if (code.includes('weak-password'))
    return 'Password is too weak — use at least 6 characters.';
  if (code.includes('network-request-failed'))
    return 'Network error. Check your internet connection.';
  if (code.includes('too-many-requests'))
    return 'Too many attempts. Wait a moment and try again.';
  return e?.message || 'Something went wrong. Try again.';
}

const makeStyles = (colors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 24 },
  wordmark: { fontFamily: fonts.display, fontSize: 64, color: colors.jaam },
  wordmarkDot: { color: colors.shiuli, fontSize: 30 },
  tagline: { marginTop: 6, fontSize: 14, color: colors.muted },
  form: { flex: 1.4, paddingHorizontal: 28, paddingTop: 12 },
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
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.line },
  dividerText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  googleButton: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 999,
    paddingVertical: 14,
  },
  googleG: { fontSize: 18, fontWeight: '900', color: '#4285F4' },
  googleText: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  switchRow: { marginTop: 18, alignItems: 'center' },
  switchText: { color: colors.muted, fontSize: 14 },
  switchLink: { color: colors.jaam, fontWeight: '700' },
});
