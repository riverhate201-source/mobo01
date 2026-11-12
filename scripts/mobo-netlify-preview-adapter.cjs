'use strict';

// MoBo QA-046D-11 | Netlify Scheduled Function용 읽기 전용 연결 계층
// 아직 netlify/functions에 배포하지 않으며 이 파일만으로 예약 실행되지 않음.
// 실제 호출은 별도 Netlify QA 사이트에서 승인된 wrapper를 연결한 후에만 가능.
const assert = require('node:assert/strict');
const { moboKSTDate, moboWebtoonDate } =
    require('./mobo-scheduler-clock.cjs');

const QA_PROJECT = 'mobo-qa-2026';
const QA_ENV = Object.freeze({
    MOBO_NETLIFY_QA_PREVIEW: 'YES',
    MOBO_AUTO_MODE: 'PREVIEW',
    MOBO_AUTO_KIND: 'SCHEDULE',
    MOBO_PREVIEW_CLOCK: 'NOW',
    MOBO_AUTO_LIVE_CONFIRM: 'NO'
});

function moboAssertNetlifyQAEnvironment(env) {
    for (const [key, required] of Object.entries(QA_ENV)) {
        if (!env || env[key] !== required) {
            throw new Error('Netlify QA PREVIEW 거부: ' + key);
        }
    }

    if (
        typeof env.MOBO_AUTO_TEST_UID !== 'string' ||
        !/^[A-Za-z0-9_-]{8,128}$/.test(env.MOBO_AUTO_TEST_UID)
    ) {
        throw new Error('Netlify QA PREVIEW 거부: 테스트 UID 누락');
    }

    let projectId = '';
    try {
        projectId = JSON.parse(env.MOBO_FIREBASE_SERVICE_ACCOUNT).project_id;
    } catch {
        throw new Error('Netlify QA PREVIEW 거부: Firebase 인증값 누락');
    }
    if (projectId !== QA_PROJECT) {
        throw new Error('Netlify QA PREVIEW 거부: QA Firebase 프로젝트 불일치');
    }
    return true;
}

// Netlify Request의 next_run은 '다음 예약 실행 시각'이며
// 이번 알림 판정 시각으로 사용하면 안 됨.
function moboNetlifyPreviewContext(now, nextRun) {
    if (!Number.isFinite(now)) {
        throw new Error('Netlify QA PREVIEW 거부: 현재 시각 오류');
    }
    let nextRunTime = null;
    if (nextRun != null) {
        if (typeof nextRun !== 'string' || !Number.isFinite(Date.parse(nextRun))) {
            throw new Error('Netlify QA PREVIEW 거부: next_run 오류');
        }
        nextRunTime = new Date(nextRun).toISOString();
    }
    return {
        mode: 'PREVIEW',
        kind: 'SCHEDULE',
        now,
        kstDate: moboKSTDate(now),
        webtoonDate: moboWebtoonDate(now),
        nextRun: nextRunTime
    };
}

// runPreview는 Netlify 사이트에서 연결할 QA PREVIEW 진입점.
// dispatch에 실제 LIVE/쓰기 함수가 전달되더라도 환경 검사 통과 전엔 실행 안 함.
function moboCreateNetlifyPreviewHandler({
    runPreview, env = process.env, clock = Date.now, log = console.log
}) {
    if (typeof runPreview !== 'function') {
        throw new Error('Netlify QA PREVIEW 거부: 실행 함수 누락');
    }
    return async function netlifyScheduledPreview(request) {
        moboAssertNetlifyQAEnvironment(env);

        const payload = request && typeof request.json === 'function'
            ? await request.json()
            : {};
        if (payload === null || typeof payload !== 'object' ||
            Array.isArray(payload)) {
            throw new Error('Netlify QA PREVIEW 거부: 예약 요청 형식 오류');
        }
        const context = moboNetlifyPreviewContext(
            clock(),
            payload.next_run ?? null
        );
        // next_run은 로깅 전용. 실제 현재 날짜 기준으로만 계산.
        log('MoBo Netlify QA PREVIEW', {
            mode: context.mode,
            kind: context.kind,
            kstDate: context.kstDate,
            webtoonDate: context.webtoonDate,
            nextRun: context.nextRun
        });
        await runPreview(context);
    };
}

async function runSelfTest() {
    const kst = (date, time) =>
        Date.parse(date + 'T' + time + ':00+09:00');
    const fakeEnvironment = {
        ...QA_ENV,
        MOBO_AUTO_TEST_UID: 'GalaxyPreviewQaUid_12345678',
        MOBO_FIREBASE_SERVICE_ACCOUNT: JSON.stringify({
            project_id: QA_PROJECT
        })
    };
    assert.equal(moboAssertNetlifyQAEnvironment(fakeEnvironment), true);
    let count = 0;
    const called = [];
    const handler = moboCreateNetlifyPreviewHandler({
        env: fakeEnvironment,
        clock: () => kst('2026-11-12', '22:05'),
        log: (...args) => called.push(args),
        runPreview: async (context) => {
            count++;
            assert.deepEqual(context, {
                mode: 'PREVIEW',
                kind: 'SCHEDULE',
                now: kst('2026-11-12', '22:05'),
                kstDate: '2026-11-12',
                webtoonDate: '2026-11-13',
                nextRun: '2026-11-12T13:10:00.000Z'
            });
        }
    });
    const response = await handler({
        json: async () => ({next_run: '2026-11-12T13:10:00Z'})
    });
    assert.equal(response, undefined);
    assert.equal(count, 1);
    assert.equal(called.length, 1);
    console.log('PASS: Netlify 예약 요청은 현재 KST 기준 PREVIEW로 변환');

    // 잘못된 설정에서는 콜백 자체가 실행되지 않도록 검사
    for (const override of [
        {MOBO_AUTO_MODE: 'LIVE'},
        {MOBO_AUTO_KIND: 'ATTENDANCE'},
        {MOBO_AUTO_LIVE_CONFIRM: 'YES'},
        {MOBO_AUTO_TEST_UID: ''},
        {MOBO_NETLIFY_QA_PREVIEW: 'NO'},
        {MOBO_FIREBASE_SERVICE_ACCOUNT: '{"project_id":"mobo-prod"}'}
    ]) {
        const unsafe = moboCreateNetlifyPreviewHandler({
            env: {...fakeEnvironment, ...override},
            clock: () => kst('2026-11-12', '22:05'),
            log: () => {},
            runPreview: () => {throw new Error('UNSAFE CALLBACK EXECUTED');}
        });
        await assert.rejects(
            unsafe({json: async () => ({})}),
            /Netlify QA PREVIEW 거부/
        );
    }
    assert.equal(count, 1);
    console.log('PASS: LIVE/잘못된 Firebase 프로젝트/UID 설정 사전 차단');

    // 다음 실행 예정시각(next_run)은 발송 날짜로 오인하지 않음
    assert.equal(
        moboNetlifyPreviewContext(
            kst('2026-11-12','23:58'),
            '2026-11-13T00:05:00Z'
        ).kstDate,
        '2026-11-12'
    );
    assert.throws(
        () => moboNetlifyPreviewContext(NaN, null),
        /현재 시각/
    );
    console.log('PASS: next_run과 실제 현재 시각 구분');

    console.log('QA-046D-11 · Netlify PREVIEW adapter PASS');
    console.log('실제 Netlify 배포 및 예약 실행: 없음');
    console.log('Firebase 조회/변경 및 FCM 발송: 없음');
}

if (require.main === module) {
    runSelfTest().catch(error => {
        console.error('QA-046D-11 실패:', error.message);
        process.exitCode = 1;
    });
}

module.exports = {
    moboAssertNetlifyQAEnvironment,
    moboNetlifyPreviewContext,
    moboCreateNetlifyPreviewHandler
};
