import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { sendEmailVerification, signOut } from 'firebase/auth';
import { auth } from '../../firebaseConfig';
import { fonts, useTheme } from '../theme';

export default function VerifyEmailScreen({ onVerified }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [checking, setChecking] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const email = auth.currentUser?.email;

  const checkVerified = async () => {
    setChecking(true);
    try {
      await auth.currentUser.reload();
      if (auth.currentUser.emailVerified) {
        // Refresh the ID token so Firestore sees the verified flag too
        await auth.currentUser.getIdToken(true);
        onVerified?.();
      } else {
        Alert.alert(
          'Not verified yet',
          "We couldn't see the verification. Open the email we sent and tap the link, then try again. (Check the spam folder too.)"
        );
      }
    } finally {
      setChecking(false);
    }
  };

  const resend = async () => {
    if (cooldown > 0) return;
    try {
      await sendEmailVerification(auth.currentUser);
      setCooldown(60);
      const timer = setInterval(
        () =>
          setCooldown((c) => {
            if (c <= 1) clearInterval(timer);
            return c - 1;
          }),
        1000
      );
      Alert.alert('Sent', `A new verification email is on its way to ${email}.`);
    } catch (e) {
      Alert.alert(
        'Could not resend',
        e?.code?.includes('too-many-requests')
          ? 'Too many attempts — wait a few minutes and try again.'
          : e.message
      );
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <Ionicons name="mail-unread-outline" size={40} color={colors.jaam} />
        </View>
        <Text style={styles.title}>Verify your email</Text>
        <Text style={styles.text}>
          We sent a verification link to{'\n'}
          <Text style={styles.email}>{email}</Text>
          {'\n\n'}Open it, tap the link, then come back here. Your account only
          unlocks after it's confirmed.
        </Text>

        <TouchableOpacity
          style={[styles.button, checking && { opacity: 0.6 }]}
          onPress={checkVerified}
          disabled={checking}
        >
          <Text style={styles.buttonText}>
            {checking ? 'Checking…' : "I've verified — continue"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={resend} disabled={cooldown > 0}>
          <Text style={[styles.link, cooldown > 0 && { opacity: 0.5 }]}>
            {cooldown > 0 ? `Resend email (${cooldown}s)` : 'Resend email'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => signOut(auth)}>
          <Text style={styles.signOut}>Use a different account</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  iconWrap: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.jaamSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 28,
    color: colors.ink,
    marginTop: 20,
  },
  text: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 21,
    color: colors.muted,
    textAlign: 'center',
  },
  email: { color: colors.ink, fontWeight: '700' },
  button: {
    marginTop: 26,
    backgroundColor: colors.jaam,
    borderRadius: 999,
    paddingVertical: 15,
    paddingHorizontal: 34,
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  link: { marginTop: 20, color: colors.jaam, fontWeight: '700', fontSize: 14 },
  signOut: { marginTop: 16, color: colors.muted, fontSize: 13 },
});
