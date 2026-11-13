// MoBo QA-046D-33: ONLY isolated Netlify QA site, no FCM, no writes.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { moboAssertQANetlifyReadOnlyConfig } =
    require('../../scripts/mobo-auto-netlify-runtime-identity.cjs');
const { moboCheckSafeScheduledPayload, moboCreateUndeployedQAScheduleHandler } =
    require('../../scripts/mobo-auto-netlify-cutover-contract.cjs');

// Netlify executes only the QA site's published staging deployment.
// This schedule invokes read-only PREVIEW. It never dispatches a push.
export const config = { schedule: '*/5 * * * *' };

const PREVIEW_ONLY = Object.freeze({
    MOBO_NETLIFY_QA_PREVIEW:'YES',
    MOBO_AUTO_MODE:'PREVIEW',
    MOBO_AUTO_KIND:'SCHEDULE',
    MOBO_PREVIEW_CLOCK:'NOW',
    MOBO_AUTO_LIVE_CONFIRM:'NO',
    MOBO_QA_SCHEDULE_PROFILE:'READ_ONLY_FUTURE',
    MOBO_QA_NETLIFY_APPROVAL:'NOT_DEPLOYED'
});

function safeQAEnvironment() {
    // A LIVE override, even if supplied through the Netlify UI, fails closed.
    for (const [key, value] of Object.entries(PREVIEW_ONLY)) {
        if (process.env[key] !== undefined && process.env[key] !== value) {
            throw new Error('QA_PREVIEW_RUNTIME_CONFIG_MISMATCH');
        }
    }
    return { ...process.env, ...PREVIEW_ONLY };
}

export default async function qaScheduledReadOnly(request) {
    try {
        const env = safeQAEnvironment();
        // Verify real Netlify runtime site ID, origin, Firebase project
        // and read-only service-account identity before any network call.
        moboAssertQANetlifyReadOnlyConfig(env);
        const payload = await request.json();
        const check = moboCheckSafeScheduledPayload(payload, Date.now());
        if (!check.decision.permitted) {
            console.log('MoBo QA scheduled PREVIEW skipped', {
                status:check.decision.status, readOnly:true
            });
            return;
        }
        // Only after validation do we initialize the Firestore read client.
        let app = getApps().find(a => a.name === 'mobo-qa-readonly-preview');
        if (!app) {
            app = initializeApp({
                credential:cert(JSON.parse(env.MOBO_FIREBASE_SERVICE_ACCOUNT)),
                projectId:'mobo-qa-2026'
            }, 'mobo-qa-readonly-preview');
        }
        const handler = moboCreateUndeployedQAScheduleHandler({
            db:getFirestore(app), env, clock:Date.now,
            log:(label, summary) => console.log(label, summary)
        });
        const result = await handler({json:async () => payload});
        console.log('MoBo QA scheduled PREVIEW result', result);
    } catch {
        // Never print Firebase credentials, FCM tokens, UIDs or raw responses.
        console.error('MoBo QA scheduled PREVIEW failed (redacted)');
        throw new Error('MOBO_QA_READ_ONLY_SCHEDULE_FAILED');
    }
}
