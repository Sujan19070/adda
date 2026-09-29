import Constants from 'expo-constants';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { auth, GOOGLE_WEB_CLIENT_ID } from '../../firebaseConfig';

/**
 * Google Sign-In via @react-native-google-signin (native module) +
 * Firebase credential exchange.
 *
 * IMPORTANT: the native module does not exist inside Expo Go, so there
 * this throws 'EXPO_GO' and the UI shows a friendly explanation. It works
 * in the EAS-built APK / development build once you have:
 *   1. Enabled Google as a sign-in provider in Firebase Console
 *   2. Pasted the provider's Web client ID into firebaseConfig.js
 *   3. Registered an Android app (package + SHA-1 from `eas credentials`)
 *      in Firebase Console (see README "Google Sign-In setup")
 */
export async function signInWithGoogle() {
  if (Constants.executionEnvironment === 'storeClient') {
    // Running inside the Expo Go app from the Play Store
    throw new Error('EXPO_GO');
  }

  let GoogleSignin;
  try {
    GoogleSignin =
      require('@react-native-google-signin/google-signin').GoogleSignin;
  } catch {
    throw new Error('EXPO_GO');
  }

  GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  // Clear any cached account choice so the picker always shows ALL the
  // Google accounts on the phone and lets the user choose.
  try {
    await GoogleSignin.signOut();
  } catch {}

  const result = await GoogleSignin.signIn();
  const idToken = result?.data?.idToken ?? result?.idToken;
  if (!idToken) throw new Error('Google did not return an ID token.');

  const credential = GoogleAuthProvider.credential(idToken);
  return signInWithCredential(auth, credential);
  // Google accounts arrive with emailVerified === true, so they skip
  // the email-verification gate automatically.
}
