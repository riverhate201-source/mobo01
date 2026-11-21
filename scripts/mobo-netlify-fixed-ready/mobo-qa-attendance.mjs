// QA-046X | Deployment template only, NOT under netlify/functions.
// After explicit approval, deploy as netlify/functions/mobo-qa-attendance.mjs
// on the separate mobo-push-qa published site only.
import fixedRuntime from '../../scripts/mobo-auto-fixed-qa-runtime.cjs';

// QA-only: make Firebase Admin dependencies explicit for Netlify packaging.
// Importing these modules does not initialize Firebase or send notifications.
import * as firebaseAdminApp from 'firebase-admin/app';
import * as firebaseAdminFirestore from 'firebase-admin/firestore';
import * as firebaseAdminMessaging from 'firebase-admin/messaging';

export default async function handler(request) {
    // Prevent a silently incomplete Netlify function bundle.
    if (typeof firebaseAdminApp.getApps !== 'function' ||
        typeof firebaseAdminFirestore.getFirestore !== 'function' ||
        typeof firebaseAdminMessaging.getMessaging !== 'function') {
        throw new Error('QA Firebase Admin SDK bundle is incomplete');
    }
    const result = await fixedRuntime.moboHandleQAFixedScheduled({
        slot: 'ATTENDANCE',
        request
    });
    console.info('MoBo QA 22:30 scheduler:', result.status);
}

export const config = {
    schedule: '30 13 * * *' // Every day 22:30 Asia/Seoul
};
