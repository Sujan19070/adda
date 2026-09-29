import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { Alert } from 'react-native';

// Firestore documents max out at ~1 MB. Base64 inflates size by ~33%,
// so raw media must stay under ~700 KB. Images are compressed to fit
// easily; voice notes fit naturally; videos must be short (~10–15s).
const MAX_RAW_BYTES = 700 * 1024;

async function compressImage(uri) {
  const out = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 900 } }],
    { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );
  return {
    dataUri: 'data:image/jpeg;base64,' + out.base64,
    width: out.width,
    height: out.height,
  };
}

/** Pick a picture from the gallery → auto-compressed (smaller but clear). */
export async function pickChatImage() {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Permission needed', 'Allow photo access to send pictures.');
    return null;
  }
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.9,
  });
  if (res.canceled || !res.assets?.length) return null;
  return compressImage(res.assets[0].uri);
}

/** Camera button: opens the camera directly, sends the shot compressed. */
export async function takeChatPhoto() {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Permission needed', 'Allow camera access to take pictures.');
    return null;
  }
  const res = await ImagePicker.launchCameraAsync({ quality: 0.9 });
  if (res.canceled || !res.assets?.length) return null;
  return compressImage(res.assets[0].uri);
}

/** Pick a short video (must fit the free-database size limit). */
export async function pickChatVideo() {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Permission needed', 'Allow media access to send videos.');
    return null;
  }
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['videos'],
    videoMaxDuration: 15,
    videoQuality: 0, // low = smallest file (iOS)
  });
  if (res.canceled || !res.assets?.length) return null;

  const uri = res.assets[0].uri;
  const info = await FileSystem.getInfoAsync(uri, { size: true });
  if ((info.size || 0) > MAX_RAW_BYTES) {
    Alert.alert(
      'Video too large',
      'On the free database, videos must be roughly 10–15 seconds. Record a shorter clip, or we can enable Firebase Storage later for full-length videos.'
    );
    return null;
  }
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return { base64, mime: 'video/mp4' };
}

/** Read a recorded voice note file → size-checked base64. */
export async function audioFileToBase64(uri) {
  const info = await FileSystem.getInfoAsync(uri, { size: true });
  if ((info.size || 0) > MAX_RAW_BYTES) {
    Alert.alert('Voice note too long', 'Keep voice messages under ~2 minutes.');
    return null;
  }
  return FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

/** Write base64 media to a cache file so the audio/video player can open it. */
export async function base64ToCacheFile(base64, filename) {
  const path = FileSystem.cacheDirectory + filename;
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) {
    await FileSystem.writeAsStringAsync(path, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
  }
  return path;
}
