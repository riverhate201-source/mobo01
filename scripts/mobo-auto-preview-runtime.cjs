'use strict';

// MoBo QA-046D-21 | Netlify 예약 함수와 QA Firebase를 연결할 읽기 전용 공통 진입점.
// 본 파일은 Netlify에 배포하지 않으며 LIVE 발송·Firestore 수정 API가 없다.
// --qa-read 옵션은 GitHub staging CI에서 QA Firebase의 지정 UID 두 문서만 읽는다.
const assert = require('node:assert/strict');
const {moboKSTDate, moboClockDue} = require('./mobo-scheduler-clock.cjs');
const {moboReadScopedSources} = require('./mobo-auto-source-scope.cjs');
const {moboCanSendSchedule} = require('./mobo-live-guard.cjs');
const {
    moboAssertNetlifyQAEnvironment,
    moboNetlifyPreviewContext,
    moboCreateNetlifyPreviewHandler
} = require('./mobo-netlify-preview-adapter.cjs');

const WINDOW_MS = 20 * 60 * 1000;
const QA_PROJECT = 'mobo-qa-2026';

function parseScheduleEntry(entry) {
    if (typeof entry !== 'string') return null;
    const match = entry.match(
        /^(20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01]))~(0|[1-9]\d{0,4})~([0-4])$/
    );
    if (!match) return null;
    const date = match[1], serial = Number(match[2]);
    const expire = Number(match[3]);
    const parsed = Date.parse(date + 'T00:00:00Z');
    if (!Number.isFinite(parsed) ||
        new Date(parsed).toISOString().slice(0, 10) !== date ||
        serial > 10000 || (serial === 0 && expire === 0)) return null;
    return {date, serial, expire};
}

function attendanceStatusPreview(sub, now) {
    if (!sub || sub.enabled !== true ||
        sub.attendance !== true || sub.timezone !== 'Asia/Seoul' ||
        typeof sub.token !== 'string' || sub.token.length < 20 ||
        !moboClockDue(now, sub.attendanceTime, WINDOW_MS)) {
        return null;
    }
    const status = sub.attendanceStatus;
    const today = moboKSTDate(now);
    if (!status || typeof status.date !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(status.date)) return null;
    const parsed = Date.parse(status.date + 'T00:00:00Z');
    if (!Number.isFinite(parsed) ||
        new Date(parsed).toISOString().slice(0, 10) !== status.date ||
        status.date > today) return null;

    const missing = status.date < today
        ? {lezhin: true, bomtoon: true}
        : (
            typeof status.lezhin === 'boolean' &&
            typeof status.bomtoon === 'boolean'
        ) ? {lezhin: !status.lezhin, bomtoon: !status.bomtoon} : null;
    if (!missing || (!missing.lezhin && !missing.bomtoon)) return null;
    return missing;
}

function validatePreviewContext(context) {
    if (!context || context.mode !== 'PREVIEW' ||
        context.kind !== 'SCHEDULE' ||
        !Number.isFinite(context.now) ||
        context.kstDate !== moboKSTDate(context.now)) {
        throw new Error('QA PREVIEW 실행 컨텍스트 오류');
    }
}

// 실제 Firebase/Netlify 진입점은 db와 context만 전달한다.
// 읽기 전용 단일 UID: pushSubscriptions/{uid}, pushSchedules/{uid}
// 개인 정보(UID, 토큰, 저장된 작품 내역)는 결과 객체/로그에 포함하지 않음.
async function moboRunScopedServerPreview({
    db, context, env, log = () => {}
}) {
    moboAssertNetlifyQAEnvironment(env);
    validatePreviewContext(context);
    if (typeof log !== 'function') {
        throw new Error('QA PREVIEW 로그 함수 오류');
    }

    const {subscriptions, schedules} =
        await moboReadScopedSources(db, env.MOBO_AUTO_TEST_UID);

    const subscription = subscriptions.docs[0]?.data() ?? null;
    const schedule = schedules.docs[0]?.data() ?? null;
    const result = {
        mode: 'PREVIEW',
        date: context.kstDate,
        subscriptions: subscriptions.size,
        schedules: schedules.size,
        scheduleValid: false,
        serialDue: 0,
        expireDue: 0,
        attendanceDue: 0,
        missingLezhin: false,
        missingBomtoon: false
    };

    const validPair = Boolean(
        subscription && schedule &&
        subscription.enabled === true &&
        subscription.timezone === 'Asia/Seoul' &&
        typeof subscription.token === 'string' &&
        subscription.token.length >= 20 &&
        /^([01]\d|2[0-3]):[0-5]\d$/.test(subscription.serialTime) &&
        schedule.version === 2 &&
        schedule.timezone === 'Asia/Seoul' &&
        schedule.serialTime === subscription.serialTime &&
        schedule.expireDays === subscription.expireDays &&
        Array.isArray(schedule.days) &&
        schedule.days.length <= 14
    );
    result.scheduleValid = validPair;

    if (validPair) {
        for (const entry of schedule.days) {
            const day = parseScheduleEntry(entry);
            if (!day || day.date !== context.kstDate) continue;
            for (const [kind, count] of [
                ['serial', day.serial], ['expire', day.expire]
            ]) {
                if (count < 1) continue;
                const item = {
                    date: day.date, entry, kind, count
                };
                if (moboCanSendSchedule(
                    item, subscription, schedule, context.now
                )) {
                    if (kind === 'serial') result.serialDue += count;
                    else result.expireDue += count;
                }
            }
        }
    }

    const missing = attendanceStatusPreview(subscription, context.now);
    if (missing) {
        result.attendanceDue = 1;
        result.missingLezhin = missing.lezhin;
        result.missingBomtoon = missing.bomtoon;
    }

    // summary는 집계 숫자·날짜만 포함. 토큰, UID, 객체 원문 출력 금지.
    log('MoBo server QA read-only preview', result);
    return result;
}

// 추후 Netlify 함수의 wrapper에서 재사용 가능한 호출 생성기.
// 실제 5분 예약 등록 또는 Live 발송을 이 함수에서 하지 않음.
function moboCreateScopedNetlifyPreviewHandler({
    db, env, clock = Date.now, log = () => {}
}) {
    return moboCreateNetlifyPreviewHandler({
        env, clock, log,
        runPreview: context =>
            moboRunScopedServerPreview({db, env, context, log})
    });
}

function fakeEnv(overrides = {}) {
    return {
        MOBO_NETLIFY_QA_PREVIEW: 'YES',
        MOBO_AUTO_MODE: 'PREVIEW',
        MOBO_AUTO_KIND: 'SCHEDULE',
        MOBO_PREVIEW_CLOCK: 'NOW',
        MOBO_AUTO_LIVE_CONFIRM: 'NO',
        MOBO_AUTO_TEST_UID: 'GalaxyPreviewQaUid_12345678',
        MOBO_FIREBASE_SERVICE_ACCOUNT: JSON.stringify({
            project_id: QA_PROJECT
        }),
        ...overrides
    };
}

function fakeScopedDb(env, sub = null, schedule = null) {
    const reads = [];
    return {
        reads,
        collection(name) {
            assert.ok(['pushSubscriptions', 'pushSchedules'].includes(name));
            return {
                get() { throw new Error('COLLECTION_SCAN_FORBIDDEN'); },
                doc(uid) {
                    assert.equal(uid, env.MOBO_AUTO_TEST_UID);
                    return {
                        async get() {
                            reads.push(name);
                            const data = name === 'pushSubscriptions'
                                ? sub : schedule;
                            return {
                                id: uid,
                                exists: data !== null,
                                data: () => data
                            };
                        },
                        async create() { throw new Error('WRITE_FORBIDDEN'); },
                        async update() { throw new Error('WRITE_FORBIDDEN'); },
                        async delete() { throw new Error('WRITE_FORBIDDEN'); }
                    };
                }
            };
        },
        runTransaction() { throw new Error('TRANSACTION_FORBIDDEN'); }
    };
}

async function runSelfTest() {
    const env = fakeEnv();
    const day = '2026-11-12';
    const t = clock => Date.parse(day + 'T' + clock + ':00+09:00');
    const entry = day + '~3~2';
    const subscription = {
        enabled: true, serial: true, expire: true, attendance: true,
        timezone: 'Asia/Seoul',
        token: 'NOT_REAL_FCM_TOKEN_FOR_TEST_ONLY_1234567890',
        serialTime: '22:00', expireDays: 3, attendanceTime: '22:30',
        attendanceStatus: {
            date: day, lezhin: false, bomtoon: true
        }
    };
    const schedule = {
        version: 2, timezone: 'Asia/Seoul',
        serialTime: '22:00', expireDays: 3,
        days: [entry]
    };
    const db = fakeScopedDb(env, subscription, schedule);
    const logs = [];
    const makeContext = clock =>
        moboNetlifyPreviewContext(t(clock), null);

    const scheduled = await moboRunScopedServerPreview({
        db, env, context: makeContext('22:05'),
        log: (...args) => logs.push(args)
    });
    assert.equal(scheduled.serialDue, 3);
    assert.equal(scheduled.expireDue, 2);
    assert.equal(scheduled.attendanceDue, 0);
    assert.equal(scheduled.scheduleValid, true);
    assert.equal(db.reads.length, 2);
    assert.equal(JSON.stringify(logs).includes(subscription.token), false);
    assert.equal(JSON.stringify(logs).includes(env.MOBO_AUTO_TEST_UID), false);
    console.log('PASS: 22:05 연재 3개·재화 2개 계산, 단일 UID 두 문서만 읽기');

    const attendance = await moboRunScopedServerPreview({
        db, env, context: makeContext('22:35')
    });
    assert.equal(attendance.serialDue, 0);
    assert.equal(attendance.expireDue, 0);
    assert.equal(attendance.attendanceDue, 1);
    assert.equal(attendance.missingLezhin, true);
    assert.equal(attendance.missingBomtoon, false);
    console.log('PASS: 22:35 출석 미완료만 별도 판정');

    const disabled = fakeScopedDb(env, {
        ...subscription, enabled: false
    }, schedule);
    const disabledResult = await moboRunScopedServerPreview({
        db: disabled, env, context: makeContext('22:05')
    });
    assert.equal(disabledResult.serialDue, 0);
    assert.equal(disabledResult.expireDue, 0);
    assert.equal(disabledResult.attendanceDue, 0);
    const noneDb = fakeScopedDb(env);
    const none = await moboRunScopedServerPreview({
        db: noneDb, env, context: makeContext('22:05')
    });
    assert.equal(none.scheduleValid, false);
    assert.equal(none.subscriptions, 0);
    assert.equal(none.schedules, 0);
    console.log('PASS: 알림 OFF 및 구독·일정 문서 누락 시 0건');

    const future = await moboRunScopedServerPreview({
        db, env, context: moboNetlifyPreviewContext(
            Date.parse('2026-11-13T00:05:00+09:00'), null
        )
    });
    assert.equal(future.serialDue, 0);
    assert.equal(future.expireDue, 0);
    assert.equal(future.attendanceDue, 0);
    console.log('PASS: 자정 이후 전날 연재·출석 후보 제외');

    const wrappedLogs = [];
    const wrapped = moboCreateScopedNetlifyPreviewHandler({
        db, env,
        clock: () => t('22:05'),
        log: (...args) => wrappedLogs.push(args)
    });
    await wrapped({
        json: async () => ({next_run: '2026-11-12T13:10:00.000Z'})
    });
    assert.equal(wrappedLogs.length, 2);
    assert.equal(wrappedLogs[1][1].serialDue, 3);
    assert.equal(wrappedLogs[1][1].expireDue, 2);
    console.log('PASS: Netlify 예약 payload → 읽기 전용 서버 진입점 통합');

    for (const change of [
        {MOBO_AUTO_MODE: 'LIVE'},
        {MOBO_AUTO_LIVE_CONFIRM: 'YES'},
        {MOBO_NETLIFY_QA_PREVIEW: 'NO'},
        {MOBO_AUTO_KIND: 'ATTENDANCE'},
        {MOBO_AUTO_TEST_UID: ''},
        {MOBO_FIREBASE_SERVICE_ACCOUNT: JSON.stringify({
            project_id: 'mobo-production'
        })}
    ]) {
        const blockedDb = fakeScopedDb({...env,...change});
        const unsafe = moboCreateScopedNetlifyPreviewHandler({
            db: blockedDb, env: {...env, ...change},
            clock: () => t('22:05')
        });
        await assert.rejects(
            unsafe({json: async () => ({})}),
            /Netlify QA PREVIEW 거부/
        );
        assert.equal(blockedDb.reads.length, 0);
    }
    console.log('PASS: LIVE·실서비스·잘못된 UID는 Firebase 읽기 전 차단');

    const corrupt = fakeScopedDb(env, subscription, {
        ...schedule, days: ['2026-02-30~1~0','wrong entry']
    });
    const corruptResult = await moboRunScopedServerPreview({
        db: corrupt, env, context: makeContext('22:05')
    });
    assert.equal(corruptResult.serialDue, 0);
    assert.equal(corruptResult.expireDue, 0);
    assert.equal(parseScheduleEntry('2026-02-30~1~0'), null);
    assert.equal(parseScheduleEntry('2026-11-12~10001~1'), null);
    console.log('PASS: 잘못된 날짜·수량은 발송 후보에서 제외');

    console.log('QA-046D-21 · server PREVIEW entrypoint PASS');
    console.log('실제 Firebase/Netlify API 호출·쓰기·FCM 전송: 없음');
}

// 별도 명시 옵션을 사용할 때만 실제 QA Firebase 문서 두 개를 읽음.
// 사전 환경 검사 완료 전에는 SDK 초기화도 하지 않음.
async function runQARead() {
    const env = process.env;
    moboAssertNetlifyQAEnvironment(env);
    const credentials = JSON.parse(env.MOBO_FIREBASE_SERVICE_ACCOUNT);
    const {initializeApp, cert} = require('firebase-admin/app');
    const {getFirestore} = require('firebase-admin/firestore');
    const app = initializeApp({
        credential: cert(credentials),
        projectId: QA_PROJECT
    });
    try {
        const result = await moboRunScopedServerPreview({
            db: getFirestore(app),
            env,
            context: moboNetlifyPreviewContext(Date.now(), null),
            log: (label, summary) => {
                console.log(label);
                console.log('기준 날짜(KST):', summary.date);
                console.log('연재/재화/출석 후보 수:',
                    summary.serialDue, summary.expireDue,
                    summary.attendanceDue);
                console.log('Firebase 읽기 전용: YES');
            }
        });
        assert.equal(result.mode, 'PREVIEW');
        console.log('QA-046D-21 · 실제 QA Firebase 지정 UID 읽기 성공');
        console.log('실제 FCM/Firestore 쓰기: 없음');
    } finally {
        await app.delete();
    }
}

if (require.main === module) {
    const task = process.argv.includes('--qa-read')
        ? runQARead() : runSelfTest();
    task.catch(error => {
        console.error('QA-046D-21 실패:', error.message);
        process.exitCode = 1;
    });
}

module.exports = {
    parseScheduleEntry,
    attendanceStatusPreview,
    moboRunScopedServerPreview,
    moboCreateScopedNetlifyPreviewHandler
};
