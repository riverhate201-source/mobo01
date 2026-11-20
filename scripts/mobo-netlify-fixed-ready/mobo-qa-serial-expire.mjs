// QA-046X | Deployment template only, NOT under netlify/functions.
// After explicit approval, deploy as netlify/functions/mobo-qa-serial-expire.mjs
// on the separate mobo-push-qa published site only.
import fixedRuntime from '../../scripts/mobo-auto-fixed-qa-runtime.cjs';

export default async function handler(request) {
    const result = await fixedRuntime.moboHandleQAFixedScheduled({
        slot: 'SERIAL_EXPIRE',
        request
    });
    console.info('MoBo QA 22:00 scheduler:', result.status);
}

export const config = {
    schedule: '0 13 * * *' // Every day 22:00 Asia/Seoul
};
