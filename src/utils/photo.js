import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Alert } from 'react-native';

/**
 * Photos are resized + compressed hard and stored as base64 strings in
 * Firestore (well under the 1 MB doc limit), so the whole app runs on
 * Firebase's free plan with no Storage billing.
 */
async function pickAndCompress({ aspect, width, compress }) {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Permission needed', 'Allow photo access to pick a picture.');
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect,
    quality: 0.8,
  });

  if (result.canceled || !result.assets?.length) return null;

  const manipulated = await ImageManipulator.manipulateAsync(
    result.assets[0].uri,
    [{ resize: { width } }],
    { compress, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );

  return 'data:image/jpeg;base64,' + manipulated.base64;
}

/** Profile picture: 4:5 portrait, ~60–150 KB. */
export function pickProfilePhoto() {
  return pickAndCompress({ aspect: [4, 5], width: 500, compress: 0.35 });
}

/** Feed post picture: 4:3, slightly larger, ~80–200 KB. */
export function pickPostPhoto() {
  return pickAndCompress({ aspect: [4, 3], width: 640, compress: 0.4 });
}
