'use strict';

// QA-046W | Future isolated Netlify QA site's two-slot scheduler adapter.
// This is NOT a Netlify Function: no cron, no deployment, no FCM send by itself.
// Test-only FCM dispatch requires multiple explicit runtime gates.
// Nothing in this module targets normal MoBo users or the production site.
const assert = require('node:assert/strict');
const {moboPlanFixedScheduledPreview} =
    require('./mobo-auto-fixed-scheduled-contract.cjs');
const {moboAssertQANetlifyRuntimeIdentity} =
    require('./mobo-auto-netlify-runtime-identity.cjs');
const {moboAssertScopedUID} = require('./mobo-auto-source-scope.cjs');

async function moboDefaultQATestDispatch(kind) {
    // The existing dispatcher contains scoped Firestore and FCM logic.
    // Import it ONLY after all identity and opt-in checks pass.
    const {runAutoDispatch} = require('./mobo-auto-dispatch.cjs');
    return runAutoDispatch(kind);
}

function moboAssertFixedQATestSendAuthorized(env) {
    moboAssertQANetlifyRuntimeIdentity(env);
    if (!env || env.MOBO_QA_FIXED_SEND_CONFIRM !== 'YES' ||
        env.MOBO_QA_FIXED_SLOT_CONFIRM !== 'YES' ||
        env.MOBO_AUTO_LIVE_CONFIRM !== 'YES' ||
        env.MOBO_AUTO_MODE !== 'LIVE' ||
        env.MOBO_QA_SCHEDULE_PROFILE !== 'QA_SINGLE_DEVICE_LIVE') {
        throw new Error('QA 한 기기 자동 알림 발송 승인이 없습니다');
    }
    // Exact UID guard: never scan every push subscription.
    moboAssertScopedUID(env.MOBO_AUTO_TEST_UID);
    let credential;
    try {
        credential = JSON.parse(env.MOBO_FIREBASE_SERVICE_ACCOUNT);
    } catch {
        throw new Error('QA 발송용 Firebase 인증 정보가 없습니다');
    }
    if (!credential || credential.project_id !== 'mobo-qa-2026') {
        throw new Error('QA Firebase 프로젝트만 허용합니다');
    }
    return true;
}

async function moboHandleQAFixedScheduled({
    slot, request, env = process.env, clock = Date.now,
    dispatch = moboDefaultQATestDispatch
}) {
    // Mandatory immutable Netlify runtime site identity.
    moboAssertQANetlifyRuntimeIdentity(env);
    if (!request || typeof request.json !== 'function') {
        throw new Error('Netlify 예약 요청이 아닙니다');
    }
    const event = await request.json();
    const now = clock();
    const plan = moboPlanFixedScheduledPreview({slot,event,now});
    if (plan.status !== 'ON_TIME_PREVIEW') {
        return Object.freeze({
            mode:'PREVIEW',status:plan.status,dispatchedKinds:[]
        });
    }
    // Note: the timing contract is *never* authorization to send.
    // Until an explicit separate QA-only approval, do no reads or writes.
    if (env.MOBO_QA_FIXED_SEND_CONFIRM !== 'YES') {
        return Object.freeze({
            mode:'PREVIEW',status:'QA_SEND_DISABLED',dispatchedKinds:[]
        });
    }
    moboAssertFixedQATestSendAuthorized(env);
    if (typeof dispatch !== 'function') {
        throw new Error('QA 발송 엔진이 없습니다');
    }
    // One invocation at 22:00: SERIAL_EXPIRE; one at 22:30: ATTENDANCE.
    // The dispatcher enforces the exact QA UID, per-kind time, dedupe,
    // FCM result handling and the extra combined-send opt-in.
    const kind = slot === 'SERIAL_EXPIRE' ? 'SERIAL_EXPIRE':'ATTENDANCE';
    await dispatch(kind);
    return Object.freeze({
        mode:'QA_SINGLE_DEVICE_LIVE',
        status:'QA_DISPATCH_COMPLETED',
        dispatchedKinds:[kind]
    });
}

async function runSelfTest() {
    const at=(day,time)=>Date.parse(day+'T'+time+':00+09:00');
    const day='2026-11-20';
    const qaEnv={
        SITE_ID:'b1680059-2ea4-4120-9f29-62c4298f9ef7',
        SITE_NAME:'mobo-push-qa',
        URL:'https://mobo-push-qa.netlify.app',
        MOBO_QA_FIXED_SEND_CONFIRM:'YES',
        MOBO_QA_FIXED_SLOT_CONFIRM:'YES',
        MOBO_AUTO_LIVE_CONFIRM:'YES',
        MOBO_AUTO_MODE:'LIVE',
        MOBO_QA_SCHEDULE_PROFILE:'QA_SINGLE_DEVICE_LIVE',
        MOBO_AUTO_TEST_UID:'SyntheticGalaxyQa_12345678',
        MOBO_FIREBASE_SERVICE_ACCOUNT:JSON.stringify({
            project_id:'mobo-qa-2026'
        })
    };
    const cases=[
        {slot:'SERIAL_EXPIRE',time:'22:00'},
        {slot:'ATTENDANCE',time:'22:30'}
    ];
    let called=0;
    for (const item of cases) {
        const now=at(day,item.time);
        const request={json:async()=>({
            next_run:new Date(now+86400000).toISOString()
        })};
        const captured=[];
        const dispatch=async kind=>{called++;captured.push(kind);};
        const input={slot:item.slot,request,clock:()=>now,dispatch};
        assert.deepEqual(await moboHandleQAFixedScheduled({
            ...input,env:{...qaEnv,MOBO_QA_FIXED_SEND_CONFIRM:'NO'}
        }),{
            mode:'PREVIEW',status:'QA_SEND_DISABLED',dispatchedKinds:[]
        });
        assert.equal(captured.length,0);
        assert.deepEqual(await moboHandleQAFixedScheduled({
            ...input,env:qaEnv
        }),{
            mode:'QA_SINGLE_DEVICE_LIVE',status:'QA_DISPATCH_COMPLETED',
            dispatchedKinds:[item.slot]
        });
        assert.deepEqual(captured,[item.slot]);
        assert.equal((await moboHandleQAFixedScheduled({
            ...input,env:qaEnv,clock:()=>now+1200000
        })).status,'STALE_SKIP');
        assert.equal(captured.length,1);
        for (const override of [
            {MOBO_AUTO_MODE:'PREVIEW'},
            {MOBO_AUTO_LIVE_CONFIRM:'NO'},
            {MOBO_QA_FIXED_SLOT_CONFIRM:'NO'},
            {MOBO_QA_SCHEDULE_PROFILE:'READ_ONLY_FUTURE'},
            {MOBO_AUTO_TEST_UID:''},
            {SITE_ID:'another-netlify-site'},
            {MOBO_FIREBASE_SERVICE_ACCOUNT:JSON.stringify({
                project_id:'mobo-production'
            })}
        ]) {
            await assert.rejects(()=>moboHandleQAFixedScheduled({
                ...input,env:{...qaEnv,...override}
            }),/QA /);
        }
    }
    assert.equal(called,2);
    console.log('QA-046W PASS: 22:00 combined, 22:30 attendance adapters');
    console.log('PASS: Netlify QA site/UID/Firebase + five independent LIVE gates');
    console.log('PASS: preview default, wrong site, stale cron, legacy and unset gates');
    console.log('Actual Firebase reads/writes and FCM messages: 0');
    console.log('NOT INSTALLED: Netlify Functions / actual cron / all-user dispatch');
}

if (require.main===module) {
    runSelfTest().catch(error=>{
        console.error('QA-046W FAIL:',error.message);
        process.exitCode=1;
    });
}
module.exports={
    moboAssertFixedQATestSendAuthorized,
    moboHandleQAFixedScheduled
};
