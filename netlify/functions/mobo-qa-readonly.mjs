// MoBo QA-046D-33: ONLY isolated Netlify QA site, no FCM, no writes.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { moboAssertQANetlifyReadOnlyConfig } =
    require('../../scripts/mobo-auto-netlify-runtime-identity.cjs');
const { moboCheckSafeScheduledPayload, moboCreateUndeployedQAScheduleHandler } =
    require('../../scripts/mobo-auto-netlify-cutover-contract.cjs');
const { moboProbeQASenderCredentialReadOnly } =
    require('../../scripts/mobo-auto-sender-credential-preflight.cjs');
const { moboRunQAFcmDryRunOnNetlify } =
    require('../../scripts/mobo-qa-fcm-validate-only.cjs');
const { moboRunOneShotGalaxyAttendanceOnNetlify } =
    require('../../scripts/mobo-qa-attendance-one-shot.cjs');

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
        // Optional AUTH-only QA check. No FCM, writes, or additional routes.
        // Requires explicit Production-only flag, otherwise zero effect.
        if (env.MOBO_QA_SENDER_PREFLIGHT === 'AUTH_READ_ONLY') {
            try {
                const diagnostic=await moboProbeQASenderCredentialReadOnly({
                    env,
                    credentialFactory:cert,
                    dbFactory:(_sender,credential)=>{
                        let senderApp=getApps().find(
                            a => a.name === 'mobo-qa-sender-credential-preflight'
                        );
                        if (!senderApp) {
                            senderApp=initializeApp({
                                credential,projectId:'mobo-qa-2026'
                            },'mobo-qa-sender-credential-preflight');
                        }
                        return getFirestore(senderApp);
                    }
                });
                console.log('MoBo QA sender AUTH preflight', diagnostic);
            } catch {
                // Credential/token/UID contents are never printed.
                // Do not fail or interrupt the original read-only QA schedule.
                console.error('MoBo QA sender AUTH preflight FAILED (redacted)');
            }
        }
        // QA-046D-40: optional FCM backend validation only.
        // Requires explicit opt-in; does not deliver notifications or write DB.
        if (env.MOBO_QA_FCM_VALIDATE_ONLY === 'YES') {
            try {
                const validation=await moboRunQAFcmDryRunOnNetlify(env);
                console.log('MoBo QA sender FCM validate-only', validation);
            } catch {
                console.error('MoBo QA sender FCM validate-only FAILED (redacted)');
            }
        }
        // QA-046D-41: only a specifically armed date+22:35 slot can send.
        // Without BOTH opt-in settings this never initializes a sender.
        if (env.MOBO_QA_ATTENDANCE_TRIAL &&
            env.MOBO_QA_ATTENDANCE_TRIAL !== 'OFF') {
            try {
                const trial=await moboRunOneShotGalaxyAttendanceOnNetlify(env);
                console.log('MoBo QA Galaxy attendance one-shot',trial);
            } catch {
                console.error('MoBo QA Galaxy attendance one-shot BLOCKED (redacted)');
            }
        }
    } catch {
        // Never print Firebase credentials, FCM tokens, UIDs or raw responses.
        console.error('MoBo QA scheduled PREVIEW failed (redacted)');
        throw new Error('MOBO_QA_READ_ONLY_SCHEDULE_FAILED');
    }
}
