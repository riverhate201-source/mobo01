'use strict';

// MoBo QA-046D-22 | Netlify Scheduled PREVIEW: 지연/조기/중복 호출 보호
// Netlify 함수로 배포하지 않는 QA 전용 공통 모듈.
// 실제 Firebase 쓰기·FCM 전송·예약 등록은 없음.
const assert = require('node:assert/strict');
const {
    moboCreateNetlifyPreviewHandler
} = require('./mobo-netlify-preview-adapter.cjs');
const {
    moboRunScopedServerPreview
} = require('./mobo-auto-preview-runtime.cjs');
const {moboKSTDate} = require('./mobo-scheduler-clock.cjs');

const FIVE_MINUTES = 5 * 60 * 1000;
const MAX_START_DELAY_MS = 4 * 60 * 1000;

// next_run은 **다음** 예약 실행 시각. 이번 tick 시각이 아니다.
// 예약 스케줄이 정확히 5분 간격인 경우에만 이번 tick = next_run - 5분.
// 이 계약은 실제 cron 연결 이후 재검증해야 한다.
function moboDecideScheduledPreview(context) {
    if (!context || context.mode !== 'PREVIEW' ||
        context.kind !== 'SCHEDULE' ||
        !Number.isSafeInteger(context.now) ||
        context.now < 0 ||
        context.kstDate !== moboKSTDate(context.now)) {
        throw new Error('QA 예약 PREVIEW 실행 정보 오류');
    }

    if (context.nextRun === null) {
        return {
            permitted: true,
            status: 'MANUAL_PREVIEW_ONLY',
            scheduledAt: null
        };
    }
    if (typeof context.nextRun !== 'string') {
        throw new Error('QA 예약 PREVIEW next_run 형식 오류');
    }
    const nextRunMs = Date.parse(context.nextRun);
    if (!Number.isSafeInteger(nextRunMs) ||
        nextRunMs % FIVE_MINUTES !== 0 ||
        new Date(nextRunMs).toISOString() !== context.nextRun) {
        throw new Error('QA 예약 PREVIEW next_run 5분 경계 오류');
    }

    const scheduledAt = nextRunMs - FIVE_MINUTES;
    if (context.now < scheduledAt) {
        return {permitted: false, status: 'EARLY_INVOCATION', scheduledAt};
    }
    if (context.now - scheduledAt >= MAX_START_DELAY_MS) {
        return {permitted: false, status: 'STALE_INVOCATION', scheduledAt};
    }
    return {permitted: true, status: 'ON_TIME_PREVIEW', scheduledAt};
}

// 중복 요청이 같은 Node 인스턴스에 동시에 들어온 경우에만
// 중복 읽기를 줄인다. 인스턴스가 다르면 독립 실행됨.
// 실제 LIVE에서는 Firestore 영속 claim과 lease를 따로 반드시 적용.
function moboCreateGuardedScheduledPreviewHandler({
    db, env, clock = Date.now, log = () => {}
}) {
    if (typeof log !== 'function' || !db) {
        throw new Error('QA 예약 PREVIEW 실행 준비 오류');
    }
    const inFlight = new Set();
    return moboCreateNetlifyPreviewHandler({
        env, clock, log,
        runPreview: async context => {
            const decision = moboDecideScheduledPreview(context);
            if (!decision.permitted) {
                log('QA scheduled PREVIEW skipped', {
                    reason: decision.status, date: context.kstDate
                });
                return;
            }
            const tickKey = context.nextRun === null
                ? 'manual|' + Math.floor(context.now / FIVE_MINUTES)
                : 'scheduled|' + decision.scheduledAt;
            if (inFlight.has(tickKey)) {
                log('QA scheduled PREVIEW duplicate in-process', {
                    reason: 'DUPLICATE_IN_FLIGHT',
                    date: context.kstDate
                });
                return;
            }

            inFlight.add(tickKey);
            try {
                await moboRunScopedServerPreview({
                    db, env, context, log
                });
            } finally {
                inFlight.delete(tickKey);
            }
        }
    });
}

function qaEnvironment() {
    return {
        MOBO_NETLIFY_QA_PREVIEW: 'YES',
        MOBO_AUTO_MODE: 'PREVIEW',
        MOBO_AUTO_KIND: 'SCHEDULE',
        MOBO_PREVIEW_CLOCK: 'NOW',
        MOBO_AUTO_LIVE_CONFIRM: 'NO',
        MOBO_AUTO_TEST_UID: 'QA_Galaxy_Example_123456',
        MOBO_FIREBASE_SERVICE_ACCOUNT: JSON.stringify({
            project_id: 'mobo-qa-2026'
        })
    };
}

function makeFakeDB(env, data = {}) {
    const reads = [];
    const sub = data.subscription ?? {
        enabled: true,
        serial: true, expire: true, attendance: true,
        timezone: 'Asia/Seoul',
        token: 'FAKE_TEST_TOKEN_NEVER_LOG_OR_SEND_123456789',
        serialTime: '22:00', expireDays: 3, attendanceTime: '22:30',
        attendanceStatus: {
            date: '2026-11-13', lezhin: false, bomtoon: true
        }
    };
    const schedule = data.schedule ?? {
        version: 2, timezone: 'Asia/Seoul',
        serialTime: '22:00', expireDays: 3,
        days: ['2026-11-13~2~1']
    };
    let blocker = data.blocker ?? null;
    let failOnce = Boolean(data.failOnce);
    return {
        reads,
        collection(name) {
            assert.ok(['pushSchedules', 'pushSubscriptions'].includes(name));
            return {
                get() {throw new Error('FULL_COLLECTION_SCAN_FORBIDDEN');},
                doc(uid) {
                    assert.equal(uid, env.MOBO_AUTO_TEST_UID);
                    return {
                        async get() {
                            reads.push(name);
                            if (blocker) await blocker;
                            if (failOnce) {
                                failOnce = false;
                                throw new Error('SYNTHETIC_READ_FAILURE');
                            }
                            const value = name === 'pushSchedules'
                                ? schedule : sub;
                            return {
                                id: uid,
                                exists: true,
                                data() { return value; }
                            };
                        },
                        async create() {throw new Error('WRITE_FORBIDDEN');},
                        async update() {throw new Error('WRITE_FORBIDDEN');},
                        async delete() {throw new Error('WRITE_FORBIDDEN');}
                    };
                }
            };
        },
        runTransaction() {throw new Error('TRANSACTION_FORBIDDEN');}
    };
}

async function runSelfTest() {
    const env = qaEnvironment();
    const kst = (date,time) =>
        Date.parse(date + 'T' + time + ':00+09:00');
    const next = (date,time) =>
        new Date(kst(date,time)).toISOString();
    const createContext = (date,time,nextDate,nextTime) => ({
        mode: 'PREVIEW',
        kind: 'SCHEDULE',
        now: kst(date,time),
        kstDate: date,
        nextRun: nextTime === null ? null : next(nextDate,nextTime)
    });

    const onTime = createContext(
        '2026-11-13','22:05','2026-11-13','22:10'
    );
    assert.deepEqual(moboDecideScheduledPreview(onTime), {
        permitted: true, status: 'ON_TIME_PREVIEW',
        scheduledAt: kst('2026-11-13','22:05')
    });
    assert.equal(moboDecideScheduledPreview({
        ...onTime, now: kst('2026-11-13','22:08')
    }).permitted, true);
    assert.equal(moboDecideScheduledPreview({
        ...onTime, now: kst('2026-11-13','22:09')
    }).status, 'STALE_INVOCATION');
    assert.equal(moboDecideScheduledPreview({
        ...onTime, now: kst('2026-11-13','22:04')
    }).status, 'EARLY_INVOCATION');
    console.log('PASS: 5분 예약 시각과 실제 도착 시각 분리·조기/지연 실행 차단');

    const manual = {
        ...onTime, nextRun: null
    };
    assert.equal(moboDecideScheduledPreview(manual).status,
        'MANUAL_PREVIEW_ONLY');
    for (const ctx of [
        {...onTime, mode:'LIVE'},
        {...onTime, kstDate:'2026-11-12'},
        {...onTime, nextRun:'2026-11-13T13:11:00.000Z'}
    ]) {
        assert.throws(() => moboDecideScheduledPreview(ctx), /QA 예약 PREVIEW/);
    }
    console.log('PASS: 수동 Run now는 PREVIEW만 허용·잘못된 시간/모드 거부');

    let time = kst('2026-11-13','22:05');
    const logs = [];
    const db = makeFakeDB(env);
    const handler = moboCreateGuardedScheduledPreviewHandler({
        db, env, clock: () => time,
        log: (...x) => logs.push(x)
    });
    const request = {
        json: async () => ({
            next_run: next('2026-11-13','22:10')
        })
    };
    await handler(request);
    assert.equal(db.reads.length, 2);
    assert.ok(logs.some(([label, result]) =>
        label === 'MoBo server QA read-only preview' &&
        result.serialDue === 2 && result.expireDue === 1));
    assert.equal(JSON.stringify(logs).includes(env.MOBO_AUTO_TEST_UID), false);
    console.log('PASS: 정상 예약 요청에서 해당 QA 기기 2개 문서만 읽기');

    time = kst('2026-11-13','22:09');
    const beforeStale = db.reads.length;
    await handler(request);
    assert.equal(db.reads.length, beforeStale);
    assert.ok(logs.some(([label, info]) =>
        label === 'QA scheduled PREVIEW skipped' &&
        info.reason === 'STALE_INVOCATION'));
    console.log('PASS: 4분 이상 지연된 예약 요청은 Firebase 조회 없이 제외');

    // 같은 인스턴스에 중복 요청이 동시에 들어오는 경우를 강제로 재현.
    let unblock;
    const held = new Promise(resolve => {unblock = resolve;});
    const pendingDb = makeFakeDB(env, {blocker:held});
    time = kst('2026-11-13','22:05');
    const overlaps = [];
    const pendingHandler = moboCreateGuardedScheduledPreviewHandler({
        db: pendingDb, env, clock: () => time,
        log: (...x) => overlaps.push(x)
    });
    const first = pendingHandler(request);
    await Promise.resolve();
    const second = pendingHandler(request);
    await second;
    assert.equal(pendingDb.reads.length, 2);
    assert.ok(overlaps.some(([label, info]) =>
        label === 'QA scheduled PREVIEW duplicate in-process' &&
        info.reason === 'DUPLICATE_IN_FLIGHT'));
    unblock();
    await first;
    await pendingHandler(request);
    assert.equal(pendingDb.reads.length, 4);
    console.log('PASS: 동시 중복 호출은 1회 조회, 완료 후 재호출은 읽기 전용 재검사');

    const errorDb = makeFakeDB(env, {failOnce:true});
    const errorHandler = moboCreateGuardedScheduledPreviewHandler({
        db:errorDb, env, clock:() => time
    });
    await assert.rejects(errorHandler(request), /SYNTHETIC_READ_FAILURE/);
    await errorHandler(request);
    assert.ok(errorDb.reads.length > 2);
    console.log('PASS: 조회 오류 후 잠금이 남지 않아 재검사 가능');

    // 오후 23:55와 다음 날 00:00에서도 5분 UTC cron 경계 사용.
    const rollover = createContext(
        '2026-11-13','23:55','2026-11-14','00:00'
    );
    const midnight = createContext(
        '2026-11-14','00:00','2026-11-14','00:05'
    );
    assert.equal(moboDecideScheduledPreview(rollover).permitted, true);
    assert.equal(moboDecideScheduledPreview(midnight).permitted, true);
    assert.notEqual(rollover.kstDate, midnight.kstDate);
    const midnightDB = makeFakeDB(env);
    const midnightHandler = moboCreateGuardedScheduledPreviewHandler({
        db: midnightDB, env, clock:() => kst('2026-11-14','00:00')
    });
    await midnightHandler({json:async()=>({
        next_run:next('2026-11-14','00:05')
    })});
    assert.equal(midnightDB.reads.length, 2);
    console.log('PASS: KST 자정과 UTC 5분 경계 통과·다음 날 후보 재평가');

    // 환경이 위험하면 콜백 진입 전 차단.
    for (const changed of [
        {MOBO_AUTO_MODE:'LIVE'},
        {MOBO_AUTO_LIVE_CONFIRM:'YES'},
        {MOBO_FIREBASE_SERVICE_ACCOUNT:'{"project_id":"mobo-prod"}'}
    ]) {
        const invalid = {...env, ...changed};
        const safeDb = makeFakeDB(invalid);
        const forbidden = moboCreateGuardedScheduledPreviewHandler({
            db:safeDb, env:invalid, clock:()=>time
        });
        await assert.rejects(forbidden(request), /Netlify QA PREVIEW 거부/);
        assert.equal(safeDb.reads.length, 0);
    }
    console.log('PASS: LIVE/실사용 Firebase 위험 설정 시 조회 이전 거부');

    console.log('QA-046D-22 · 예약 지연·중복 Netlify PREVIEW PASS');
    console.log('서버 인스턴스 간 중복은 별도 영속 lease/claim이 필요');
    console.log('Netlify 함수 배포·Firebase 쓰기·FCM 발송: 없음');
}

if (require.main === module) {
    runSelfTest().catch(error => {
        console.error('QA-046D-22 실패:', error.message);
        process.exitCode = 1;
    });
}

module.exports = {
    moboDecideScheduledPreview,
    moboCreateGuardedScheduledPreviewHandler
};
