import * as Location from 'expo-location';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';
import { Alert } from 'react-native';

// Request permission + fetch the device's current coordinates, then save them
// on the user's profile so the "near me" filter can compute distances.
export async function updateMyLocation() {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Location off',
        'Allow location access to use the "Near me" filter.'
      );
      return null;
    }
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    await setDoc(
      doc(db, 'users', auth.currentUser.uid),
      { geo: coords, geoUpdatedAt: serverTimestamp() },
      { merge: true }
    );
    return coords;
  } catch (e) {
    console.warn('Location failed', e);
    return null;
  }
}

// Haversine distance in kilometres between two {lat,lng} points.
export function distanceKm(a, b) {
  if (!a || !b) return Infinity;
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}
