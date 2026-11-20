// QA-046X | Deployment template only, NOT under netlify/functions.
// After explicit approval, deploy as netlify/functions/mobo-qa-attendance.mjs
// on the separate mobo-push-qa published site only.
import fixedRuntime from '../../scripts/mobo-auto-fixed-qa-runtime.cjs';

export default async function handler(request) {
    const result = await fixedRuntime.moboHandleQAFixedScheduled({
        slot: 'ATTENDANCE',
        request
    });
    console.info('MoBo QA 22:30 scheduler:', result.status);
}

export const config = {
    schedule: '30 13 * * *' // Every day 22:30 Asia/Seoul
};
