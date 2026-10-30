// KDO server code (Firebase Cloud Functions).
// When someone leaves an emoji or a message on a story, the story's author gets a notification on their phone.
const functions = require('firebase-functions/v1');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();

exports.storyReaction = functions
  .region('europe-west1')
  .firestore.document('families/{fid}/storyComments/{cid}')
  .onCreate(async (snap, context) => {
    const comment = snap.data();
    const { fid } = context.params;
    const db = getFirestore();

    const story = await db.doc(`families/${fid}/stories/${comment.storyId}`).get();
    if (!story.exists) return;
    const authorId = story.data().by;
    // No notification for reacting to your own story
    if (!authorId || authorId === comment.by) return;

    const tokens = await db.collection(`families/${fid}/pushTokens`).where('uid', '==', authorId).get();
    if (tokens.empty) return;

    const who = (await db.doc(`families/${fid}/profiles/${comment.by}`).get()).data()?.name || "Quelqu'un";
    const result = await getMessaging().sendEachForMulticast({
      tokens: tokens.docs.map(d => d.data().token),
      data: { title: 'KDO', body: `${who} sur ta story : ${comment.text}`, url: './?story=me', tag: `story-${comment.storyId}` },
      webpush: { headers: { Urgency: 'high', TTL: '86400' } },
    });

    // Forget devices that no longer accept notifications (app removed, permission withdrawn...)
    await Promise.all(result.responses.map((r, i) => {
      const code = r.error?.code || '';
      if (!r.success && /registration-token-not-registered|invalid-registration-token|invalid-argument/.test(code)) return tokens.docs[i].ref.delete();
      return null;
    }));
  });
