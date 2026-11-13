'use strict';

// QA-046D-29 | Netlify 5-minute scheduled QA PREVIEW handoff, NOT deployable.
// No netlify/functions entrypoint or cron is installed by this module.
// Firebase is an injected read-only adapter; no FCM, transaction or write APIs.
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const path = require('node:path');
const {moboAssertNetlifyQAEnvironment, moboNetlifyPreviewContext} =
    require('./mobo-netlify-preview-adapter.cjs');
const {moboDecideScheduledPreview, moboCreateGuardedScheduledPreviewHandler} =
    require('./mobo-auto-scheduled-preview-guard.cjs');
const {moboValidateLeasedBatchBudget} =
    require('./mobo-auto-cross-instance-budget.cjs');

const CRON_UTC = '*/5 * * * *';
const FIVE_MINUTES_MS = 5 * 60 * 1000;
const NETLIFY_SCHEDULE_LIMIT_MS = 30000;
const QA_PROJECT = 'mobo-qa-2026';
const KST = (day, clock) => Date.parse(day + 'T' + clock + ':00+09:00');

function moboValidateNetlifyCutoverBudget(options = {}) {
    const {cron = CRON_UTC, maxRunMs = NETLIFY_SCHEDULE_LIMIT_MS,
        batchBudgetMs = 12000, leaseMs = 20000,
        bufferMs = 5000} = options;
    if (cron !== CRON_UTC ||
        maxRunMs !== NETLIFY_SCHEDULE_LIMIT_MS ||
        !Number.isSafeInteger(batchBudgetMs) ||
        !Number.isSafeInteger(leaseMs) ||
        !Number.isSafeInteger(bufferMs) ||
        batchBudgetMs + bufferMs >= leaseMs ||
        leaseMs + bufferMs > maxRunMs) {
        throw new Error('QA Netlify 5분/30초 실행 제한 불일치');
    }
    moboValidateLeasedBatchBudget({
        budgetMs: batchBudgetMs, leaseMs, bufferMs
    });
    return Object.freeze({
        cron, timezone:'UTC', maxRunMs, batchBudgetMs,
        leaseMs, bufferMs, delivery:'PREVIEW_ONLY'
    });
}

function moboCheckSafeScheduledPayload(payload, now) {
    if (!payload || typeof payload !== 'object' ||
        Array.isArray(payload) ||
        Object.keys(payload).length !== 1 ||
        typeof payload.next_run !== 'string') {
        throw new Error('QA Netlify 예약 payload: next_run 필수');
    }
    // Scheduled invocations must carry next_run. Never silently treat
    // a missing value as a manual "Run now" invocation.
    const raw = payload.next_run;
    if (!/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.000)?Z$/.test(raw)) {
        throw new Error('QA Netlify 예약 payload: UTC ISO 시각 오류');
    }
    const parsed = Date.parse(raw);
    if (!Number.isSafeInteger(parsed) ||
        parsed % FIVE_MINUTES_MS !== 0) {
        throw new Error('QA Netlify 예약 payload: 5분 경계 오류');
    }
    const canonical = new Date(parsed).toISOString();
    if (raw !== canonical && raw !== canonical.replace('.000Z', 'Z')) {
        // e.g. 2026-02-30 must not be normalized into a March tick.
        throw new Error('QA Netlify 예약 payload: 유효하지 않은 날짜');
    }
    const context = moboNetlifyPreviewContext(now, raw);
    const decision = moboDecideScheduledPreview(context);
    if (decision.status === 'MANUAL_PREVIEW_ONLY') {
        throw new Error('QA Netlify 예약 payload: 수동 모드 차단');
    }
    return Object.freeze({context, decision});
}

function moboAssertQAOnlySchedulerEnv(env) {
    moboAssertNetlifyQAEnvironment(env);
    if (env.MOBO_QA_SCHEDULE_PROFILE !== 'READ_ONLY_FUTURE' ||
        env.MOBO_QA_NETLIFY_APPROVAL !== 'NOT_DEPLOYED') {
        throw new Error('QA Netlify 스케줄러 연결 승인 전 차단');
    }
    return true;
}

// Future wrapper factory: it can be unit-tested here but is never
// exported from netlify/functions or registered with Netlify.
function moboCreateUndeployedQAScheduleHandler({
    db, env, clock = Date.now, log = () => {}
}) {
    if (!db || typeof log !== 'function' || typeof clock !== 'function') {
        throw new Error('QA Netlify 스케줄러 모듈 설정 오류');
    }
    const previewHandler = moboCreateGuardedScheduledPreviewHandler({
        db, env, clock, log
    });
    return async request => {
        // Fail closed before database reads. This is only a contract test,
        // not proof of real Netlify site identity / production isolation.
        moboAssertQAOnlySchedulerEnv(env);
        if (!request || typeof request.json !== 'function') {
            throw new Error('QA Netlify 예약 요청 인터페이스 오류');
        }
        const payload = await request.json();
        const {decision, context} =
            moboCheckSafeScheduledPayload(payload, clock());
        if (!decision.permitted) {
            log('QA Netlify invocation rejected before Firestore', {
                reason:decision.status,
                date:context.kstDate
            });
            return {status:decision.status,readOnly:true,skipped:true};
        }
        // Existing QA preview handler re-checks time and holds in-process
        // duplicate calls; cross-instance LIVE requires durable lease/claim.
        await previewHandler({json: async () => payload});
        return {status:'QA_READ_ONLY_PREVIEW',readOnly:true,skipped:false};
    };
}

function moboCheckNoActiveNetlifySchedule(repoPaths) {
    if (!Array.isArray(repoPaths)) {
        throw new Error('QA Netlify 배포 경로 확인 실패');
    }
    const active = repoPaths.filter(p =>
        /^netlify\/functions\/.+\.(?:js|cjs|mjs|ts|mts)$/.test(p) ||
        p === 'netlify.toml'
    );
    return {
        safe: active.length === 0,
        count: active.length,
        release:'BLOCKED',
        reason: active.length > 0 ?
            'Netlify 함수/설정이 검토 없이 추가됨' :
            '아직 Netlify 예약 함수가 배포되지 않음'
    };
}

function fakeEnv() {
    return {
        MOBO_NETLIFY_QA_PREVIEW:'YES',
        MOBO_AUTO_MODE:'PREVIEW',
        MOBO_AUTO_KIND:'SCHEDULE',
        MOBO_PREVIEW_CLOCK:'NOW',
        MOBO_AUTO_LIVE_CONFIRM:'NO',
        MOBO_QA_SCHEDULE_PROFILE:'READ_ONLY_FUTURE',
        MOBO_QA_NETLIFY_APPROVAL:'NOT_DEPLOYED',
        MOBO_AUTO_TEST_UID:'SyntheticGalaxyQA_123456',
        MOBO_FIREBASE_SERVICE_ACCOUNT:JSON.stringify({
            project_id:QA_PROJECT
        })
    };
}

function fakeDB(env, waitFor=null) {
    const reads=[];
    const sub={
        enabled:true,serial:true,expire:true,attendance:true,
        timezone:'Asia/Seoul',serialTime:'22:00',
        expireDays:3,attendanceTime:'22:30',
        attendanceStatus:{
            date:'2026-11-13',lezhin:false,bomtoon:true
        },
        token:'SYNTHETIC_NOT_A_REAL_FCM_TOKEN_123456'
    };
    const schedule={
        version:2,timezone:'Asia/Seoul',
        serialTime:'22:00',expireDays:3,
        days:['2026-11-13~2~1']
    };
    return {
        reads,
        collection(name) {
            assert.ok(['pushSubscriptions','pushSchedules'].includes(name));
            return {
                get(){throw Error('WIDE_SCAN_FORBIDDEN');},
                doc(uid) {
                    assert.equal(uid,env.MOBO_AUTO_TEST_UID);
                    return {
                        async get() {
                            reads.push(name);
                            if (waitFor) await waitFor;
                            return {
                                exists:true,
                                data:()=>name==='pushSchedules'?
                                    schedule:sub
                            };
                        },
                        async create(){throw Error('WRITE_FORBIDDEN');},
                        async update(){throw Error('WRITE_FORBIDDEN');},
                        async delete(){throw Error('WRITE_FORBIDDEN');}
                    };
                }
            };
        },
        runTransaction(){throw Error('WRITE_TX_FORBIDDEN');}
    };
}

async function runSelfTest() {
    const contract=moboValidateNetlifyCutoverBudget();
    assert.equal(contract.cron,CRON_UTC);
    assert.equal(contract.maxRunMs,30000);
    assert.equal(contract.batchBudgetMs,12000);
    for (const values of [
        {cron:'* * * * *'},
        {maxRunMs:60000},
        {batchBudgetMs:16000},
        {leaseMs:15000},
        {leaseMs:27000},
        {bufferMs:2000}
    ]) {
        assert.throws(()=>moboValidateNetlifyCutoverBudget(values),
            /제한|실행 예산/);
    }
    console.log('PASS: UTC 매 5분 cron · Netlify 30초 · 배치/lease 예산 검증');

    const day='2026-11-13', at=KST(day,'22:05');
    const next=new Date(KST(day,'22:10')).toISOString();
    const check=moboCheckSafeScheduledPayload({next_run:next},at);
    assert.equal(check.decision.status,'ON_TIME_PREVIEW');
    assert.equal(check.context.kstDate,day);
    assert.equal(check.context.webtoonDate,'2026-11-14');

    for(const bad of [
        {},{next_run:null},{next_run:'bad'},
        {next_run:'2026-11-13T13:11:00.000Z'},
        {next_run:'2026-11-13T13:10:00+00:00'},
        {next_run:next, mode:'LIVE'},
        [next],{next_run:'2026-02-30T13:10:00.000Z'}
    ]) {
        assert.throws(()=>moboCheckSafeScheduledPayload(bad,at),
            /QA Netlify 예약 payload/);
    }
    console.log('PASS: 누락·변조 next_run 거부, KST 22시 연재일 전환 보존');

    const env=fakeEnv();
    let time=at;
    const db=fakeDB(env);
    const logged=[];
    const handler=moboCreateUndeployedQAScheduleHandler({
        db,env,clock:()=>time,
        log:(...args)=>logged.push(args)
    });
    const request={json:async()=>({next_run:next})};
    const ok=await handler(request);
    assert.deepEqual(ok,{
        status:'QA_READ_ONLY_PREVIEW',readOnly:true,skipped:false
    });
    assert.deepEqual(db.reads,[
        'pushSubscriptions','pushSchedules'
    ]);
    assert.ok(logged.some(([label,s])=>
        label==='MoBo server QA read-only preview' &&
        s.serialDue===2 && s.expireDue===1));
    assert.equal(JSON.stringify(logged).includes(env.MOBO_AUTO_TEST_UID),false);
    console.log('PASS: QA 후보 계산 및 1 UID 두 문서만 읽기, 민감 정보 미출력');

    time=KST(day,'22:04');
    const early=await handler(request);
    assert.equal(early.status,'EARLY_INVOCATION');
    assert.equal(db.reads.length,2);
    time=KST(day,'22:09');
    const stale=await handler(request);
    assert.equal(stale.status,'STALE_INVOCATION');
    assert.equal(db.reads.length,2);
    console.log('PASS: 예약 조기/4분 지연 시 Firebase 접근 전 제외');

    const readBefore=db.reads.length;
    for (const changed of [
        {MOBO_AUTO_MODE:'LIVE'},
        {MOBO_AUTO_LIVE_CONFIRM:'YES'},
        {MOBO_QA_NETLIFY_APPROVAL:'APPROVED_FOR_LIVE'},
        {MOBO_QA_SCHEDULE_PROFILE:'LIVE'},
        {MOBO_FIREBASE_SERVICE_ACCOUNT:JSON.stringify({
            project_id:'mobo-web-2026'
        })}
    ]) {
        const badEnv={...env,...changed};
        const badDb=fakeDB(badEnv);
        const badHandler=moboCreateUndeployedQAScheduleHandler({
            db:badDb,env:badEnv,clock:()=>at
        });
        await assert.rejects(badHandler(request),
            /QA Netlify|Netlify QA PREVIEW/);
        assert.equal(badDb.reads.length,0);
    }
    assert.equal(db.reads.length,readBefore);
    console.log('PASS: LIVE/실서비스/부적절한 배포 프로필은 0건 조회');

    // Two overlapping events in same runtime: only one set of read ops.
    time=at;
    let unblock;
    const barrier=new Promise(resolve=>{unblock=resolve;});
    const delayedDB=fakeDB(env,barrier);
    const audit=[];
    const delayed=moboCreateUndeployedQAScheduleHandler({
        db:delayedDB,env,clock:()=>time,
        log:(...args)=>audit.push(args)
    });
    const run1=delayed(request);
    await Promise.resolve();
    await Promise.resolve();
    const run2=delayed(request);
    await run2;
    assert.equal(delayedDB.reads.length,2);
    assert.ok(audit.some(([label])=>
        label==='QA scheduled PREVIEW duplicate in-process'));
    unblock();
    await run1;
    console.log('PASS: 같은 인스턴스 동시 호출 중복 읽기 방지');

    const root=path.resolve(__dirname,'..');
    const paths=execFileSync('git',['ls-files'],{
        cwd:root,encoding:'utf8',timeout:5000
    }).split(/\r?\n/).filter(Boolean);
    const status=moboCheckNoActiveNetlifySchedule(paths);
    assert.equal(status.safe,true);
    assert.equal(status.release,'BLOCKED');
    for(const extra of [
        ['netlify/functions/qa-scheduled.mjs'],
        ['netlify.toml']
    ]){
        assert.equal(moboCheckNoActiveNetlifySchedule(
            [...paths,...extra]
        ).safe,false);
    }
    console.log('PASS: 앱 Netlify 예약 배포 미등록 및 예상 밖 신규 함수 감지');

    console.log('QA-046D-29 · Netlify 5분 예약 연결 계약 PASS');
    console.log('Netlify 예약 등록·Firebase 쓰기·FCM·main 변경: 없음');
}
if(require.main===module) {
    runSelfTest().catch(error=>{
        console.error('QA-046D-29 실패:',error.message);
        process.exitCode=1;
    });
}
module.exports={
    moboValidateNetlifyCutoverBudget,
    moboCheckSafeScheduledPayload,
    moboAssertQAOnlySchedulerEnv,
    moboCreateUndeployedQAScheduleHandler,
    moboCheckNoActiveNetlifySchedule
};
