// Shared app constants.

// Post moods. `adult` is hidden by default and only shown when a user
// explicitly filters for it. Every post must carry at least one mood.
export const MOODS = [
  { key: 'lovely', label: 'Feeling lovely', emoji: '🥰' },
  { key: 'happy', label: 'Happy', emoji: '😄' },
  { key: 'excited', label: 'Excited', emoji: '🤩' },
  { key: 'grateful', label: 'Grateful', emoji: '🙏' },
  { key: 'alone', label: 'Alone', emoji: '🌙' },
  { key: 'bored', label: 'Bored', emoji: '😑' },
  { key: 'tired', label: 'Tired', emoji: '😴' },
  { key: 'crying', label: 'Crying', emoji: '😭' },
  { key: 'frustrated', label: 'Frustrated', emoji: '😤' },
  { key: 'angry', label: 'Angry', emoji: '😠' },
  { key: 'adult', label: 'Adult', emoji: '🔞', adult: true },
];

export const MOOD_BY_KEY = Object.fromEntries(MOODS.map((m) => [m.key, m]));

// Relationship labels a user can apply to others. bestie is capped at 1,
// closeFriend at 2 — enforced in the UI. These only affect *your* filtering
// and pinning; they never gate messaging.
export const REL = {
  friend: { key: 'friend', label: 'Friend', emoji: '🙂', max: null },
  bestie: { key: 'bestie', label: 'Bestie', emoji: '⭐', max: 1 },
  closeFriend: { key: 'closeFriend', label: 'Close friend', emoji: '💛', max: 2 },
};


// Dating profile options
export const INTERESTS = [
  'Music', 'Movies', 'Travel', 'Foodie', 'Gaming', 'Reading', 'Fitness',
  'Photography', 'Art', 'Coding', 'Cricket', 'Football', 'Coffee', 'Nature',
  'Dancing', 'Cooking', 'Startups', 'Anime', 'Pets', 'Volunteering',
];

export const GOALS = [
  { key: 'serious', label: 'Serious relationship' },
  { key: 'casual', label: 'Casual' },
  { key: 'friends', label: 'New friends' },
  { key: 'notsure', label: 'Still figuring out' },
];

export const ZODIACS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra',
  'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
];
