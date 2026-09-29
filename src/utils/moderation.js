// Adult-image detection using Google Cloud Vision SafeSearch.
//
// SETUP (one time):
//   1. Google Cloud Console → same project as your Firebase app.
//   2. Enable the "Cloud Vision API".
//   3. Create an API key (APIs & Services → Credentials → Create API key).
//      Recommended: restrict the key to the Cloud Vision API only.
//   4. Paste the key into VISION_API_KEY below.
//
// Vision returns a likelihood for each category:
//   UNKNOWN | VERY_UNLIKELY | UNLIKELY | POSSIBLE | LIKELY | VERY_LIKELY
//
// If no key is set, detection is skipped (posts go through as normal) so the
// app keeps working — you opt in by adding a key.

const VISION_API_KEY = ''; // <-- paste your Cloud Vision API key here

const RANK = {
  UNKNOWN: 0,
  VERY_UNLIKELY: 0,
  UNLIKELY: 1,
  POSSIBLE: 2,
  LIKELY: 3,
  VERY_LIKELY: 4,
};

// Strip a data URI prefix ("data:image/jpeg;base64,....") to raw base64.
function rawBase64(dataUri) {
  if (!dataUri) return null;
  const comma = dataUri.indexOf(',');
  return comma >= 0 ? dataUri.slice(comma + 1) : dataUri;
}

// Returns { checked, adult, racy, block, flag, error }.
//   checked → whether detection actually ran (false if no key / failure)
//   block   → treat as explicit; refuse to post
//   flag    → borderline; auto-mark the post as 18+
export async function detectAdultImage(dataUri) {
  const content = rawBase64(dataUri);
  if (!VISION_API_KEY || !content) {
    return { checked: false, adult: false, racy: false, block: false, flag: false };
  }
  try {
    const res = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${VISION_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              image: { content },
              features: [{ type: 'SAFE_SEARCH_DETECTION' }],
            },
          ],
        }),
      }
    );
    const data = await res.json();
    const safe = data?.responses?.[0]?.safeSearchAnnotation;
    if (!safe) {
      return { checked: false, adult: false, racy: false, block: false, flag: false };
    }
    const adultRank = RANK[safe.adult] ?? 0;
    const racyRank = RANK[safe.racy] ?? 0;

    // BLOCK any nudity/explicit content for everyone, regardless of the mood
    // chosen. "adult" LIKELY or VERY_LIKELY means nudity/sexual content →
    // blocked outright. Very racy (VERY_LIKELY) is also blocked.
    const block = adultRank >= 3 || racyRank >= 4;
    // Only mildly-suggestive images (racy = LIKELY, but not nude) get flagged
    // 18+ rather than blocked.
    const flag = !block && racyRank >= 3;

    return {
      checked: true,
      adult: adultRank >= 3,
      racy: racyRank >= 3,
      block,
      flag,
      levels: { adult: safe.adult, racy: safe.racy },
    };
  } catch (e) {
    console.warn('SafeSearch failed', e);
    // On any error, don't block the user — just skip the check.
    return { checked: false, adult: false, racy: false, block: false, flag: false, error: true };
  }
}
