'use strict';

// QA-046D-8 | 외부 스케줄러용 PREVIEW 전용 실행 계약
// 이 파일은 GitHub API 요청을 직접 보내지 않습니다.
// 단독 실행: 메모리 검증만 수행 / Firebase·FCM 접근 없음
const assert = require('node:assert/strict');

const DISPATCH_INPUTS = Object.freeze({
    execution_profile: 'EXTERNAL_PREVIEW',
    target_device: 'GALAXY',
    preview_clock: 'NOW',
    notification_kind: 'SCHEDULE',
    run_mode: 'PREVIEW',
    live_confirm: 'NO'
});

// 외부 서비스가 GitHub workflow_dispatch를 호출할 때 사용할 페이로드
// 인증 토큰을 이 파일이나 GitHub 로그에 저장하지 않습니다.
function moboExternalPreviewPayload() {
    return {
        ref: 'staging',
        inputs: { ...DISPATCH_INPUTS }
    };
}

const EXPECTED_ENV = Object.freeze({
    GITHUB_REF: 'refs/heads/staging',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    MOBO_EXTERNAL_PROFILE: 'EXTERNAL_PREVIEW',
    MOBO_EXTERNAL_TARGET: 'GALAXY',
    MOBO_EXTERNAL_CLOCK: 'NOW',
    MOBO_EXTERNAL_KIND: 'SCHEDULE',
    MOBO_EXTERNAL_MODE: 'PREVIEW',
    MOBO_EXTERNAL_CONFIRM: 'NO',
    MOBO_AUTO_MODE: 'PREVIEW',
    MOBO_AUTO_KIND: 'SCHEDULE',
    MOBO_PREVIEW_CLOCK: 'NOW',
    MOBO_AUTO_LIVE_CONFIRM: 'NO'
});

function moboValidateExternalPreviewEnvironment(env) {
    for (const [key, expected] of Object.entries(EXPECTED_ENV)) {
        if (env?.[key] !== expected) {
            // 사용자 지정 값을 로그에 출력하지 않음
            throw new Error(
                '외부 PREVIEW 호출 차단: 허용되지 않은 ' + key
            );
        }
    }

    if (
        typeof env.MOBO_AUTO_TEST_UID !== 'string' ||
        !/^[A-Za-z0-9_-]{8,128}$/.test(env.MOBO_AUTO_TEST_UID)
    ) {
        throw new Error('외부 PREVIEW 호출 차단: QA 기기 식별값 없음');
    }
    return true;
}

function moboExampleAllowedEnvironment() {
    return {
        GITHUB_REF: 'refs/heads/staging',
        GITHUB_EVENT_NAME: 'workflow_dispatch',
        MOBO_EXTERNAL_PROFILE: DISPATCH_INPUTS.execution_profile,
        MOBO_EXTERNAL_TARGET: DISPATCH_INPUTS.target_device,
        MOBO_EXTERNAL_CLOCK: DISPATCH_INPUTS.preview_clock,
        MOBO_EXTERNAL_KIND: DISPATCH_INPUTS.notification_kind,
        MOBO_EXTERNAL_MODE: DISPATCH_INPUTS.run_mode,
        MOBO_EXTERNAL_CONFIRM: DISPATCH_INPUTS.live_confirm,
        MOBO_AUTO_MODE: 'PREVIEW',
        MOBO_AUTO_KIND: 'SCHEDULE',
        MOBO_PREVIEW_CLOCK: 'NOW',
        MOBO_AUTO_LIVE_CONFIRM: 'NO',
        MOBO_AUTO_TEST_UID: 'GalaxyQaExample_123'
    };
}

function runSelfTest() {
    const payload = moboExternalPreviewPayload();
    assert.deepEqual(payload, {
        ref: 'staging',
        inputs: {
            execution_profile: 'EXTERNAL_PREVIEW',
            target_device: 'GALAXY',
            preview_clock: 'NOW',
            notification_kind: 'SCHEDULE',
            run_mode: 'PREVIEW',
            live_confirm: 'NO'
        }
    });
    console.log('PASS: 외부 API 요청은 staging PREVIEW 전용');

    const good = moboExampleAllowedEnvironment();
    assert.equal(
        moboValidateExternalPreviewEnvironment(good),
        true
    );

    const rejected = [
        { GITHUB_REF: 'refs/heads/main' },
        { GITHUB_EVENT_NAME: 'schedule' },
        { MOBO_EXTERNAL_PROFILE: 'MANUAL' },
        { MOBO_EXTERNAL_TARGET: 'PC' },
        { MOBO_EXTERNAL_CLOCK: 'TODAY_22_35' },
        { MOBO_EXTERNAL_KIND: 'ATTENDANCE' },
        { MOBO_EXTERNAL_MODE: 'LIVE' },
        { MOBO_EXTERNAL_CONFIRM: 'YES' },
        { MOBO_AUTO_MODE: 'LIVE' },
        { MOBO_AUTO_KIND: 'ATTENDANCE' },
        { MOBO_PREVIEW_CLOCK: 'TODAY_22_05' },
        { MOBO_AUTO_LIVE_CONFIRM: 'YES' },
        { MOBO_AUTO_TEST_UID: '' }
    ];

    for (const update of rejected) {
        assert.throws(
            () => moboValidateExternalPreviewEnvironment({
                ...good, ...update
            }),
            /외부 PREVIEW 호출 차단/
        );
    }
    console.log('PASS: LIVE·main·잘못된 입력·QA UID 누락 차단');
    console.log('QA-046D-8 · 외부 PREVIEW 호출 계약 PASS');
    console.log('실제 푸시 발송: 없음');
    console.log('Firestore 데이터 변경: 없음');
    console.log('외부 예약 실행 활성화: 없음');
}

if (require.main === module) {
    try {
        if (process.argv.includes('--check-invocation')) {
            moboValidateExternalPreviewEnvironment(process.env);
            console.log('QA-046D-8: 외부 PREVIEW 실행 가드 PASS');
        } else {
            runSelfTest();
        }
    } catch (error) {
        console.error('QA-046D-8 실패:', error.message);
        process.exitCode = 1;
    }
}

module.exports = {
    moboExternalPreviewPayload,
    moboValidateExternalPreviewEnvironment
};
