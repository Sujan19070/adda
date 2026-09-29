// ─────────────────────────────────────────────────────────────
// PASTE YOUR FIREBASE CONFIG HERE
//
// 1. Go to https://console.firebase.google.com
// 2. Create a project → Project settings → "Your apps" → add a
//    WEB app (</> icon). Yes, WEB — the JS SDK uses the web
//    config even inside a React Native app.
// 3. Copy the config object it shows you and replace the
//    placeholder values below.
// ─────────────────────────────────────────────────────────────
import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyBZIuYGLhb_A3ZCYBEzY9zS77dMPGBZPsw",
  authDomain: "adda-17e12.firebaseapp.com",
  projectId: "adda-17e12",
  storageBucket: "adda-17e12.firebasestorage.app",
  messagingSenderId: "1096409081427",
  appId: "1:1096409081427:web:4e15d6c58bf58279b5c8a6",
  measurementId: "G-D3NR25BLH3"
};

// Avoid re-initializing when Metro hot-reloads
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Auth with persistent login (survives app restarts)
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

// Firestore database
export const db = getFirestore(app);

// For Google Sign-In: Firebase Console → Authentication → Sign-in method →
// Google → enable it, then copy the "Web client ID" shown there.
export const GOOGLE_WEB_CLIENT_ID =
  '1096409081427-92uiudo5vrqducq4o6kmu8kcm8kdkjuj.apps.googleusercontent.com';

export default app;
