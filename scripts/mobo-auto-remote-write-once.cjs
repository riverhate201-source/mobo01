'use strict';

// QA-046D-28 | one-shot QA Firestore probe COMPLETED.
// 승인된 1회 실행 및 문서 2개 삭제 검증 후, 이 경로는 영구 비활성.
// 현재 파일은 memory-only verification; Firebase SDK를 import하지 않음.
const assert = require('node:assert/strict');
const {moboCheckpointScope} =
    require('./mobo-auto-resume-checkpoint.cjs');
const {moboKSTDate} = require('./mobo-scheduler-clock.cjs');

const QA_PROJECT = 'mobo-qa-2026';
const APPROVAL = 'QA-046D-28';
const APPROVED_COMMIT_SUBJECT =
    'QA-046D-28: approved isolated QA Firebase write/delete once';
const FIVE_MINUTES = 5 * 60 * 1000;
const NO_SECRETS_IN_LOGS = 'QA 전용 서버 검사';

function moboValidateApprovedQAWriteEnvironment(env) {
    if (!env || env.GITHUB_REF !== 'refs/heads/staging' ||
        env.GITHUB_EVENT_NAME !== 'push' ||
        env.GITHUB_RUN_ATTEMPT !== '1' ||
        !/^[a-f0-9]{40}$/i.test(env.GITHUB_SHA || '') ||
        env.MOBO_QA_WRITE_PROBE_MODE !== 'ISOLATED_WRITE_ONCE' ||
        env.MOBO_QA_WRITE_PROBE_APPROVAL !== APPROVAL ||
        env.MOBO_AUTO_MODE !== 'PREVIEW' ||
        env.MOBO_AUTO_LIVE_CONFIRM !== 'NO') {
        throw new Error('QA 전용 쓰기 승인/실행 조건 불일치');
    }
    let credentials;
    try {
        credentials = JSON.parse(env.MOBO_FIREBASE_SERVICE_ACCOUNT);
    } catch {
        throw new Error('QA 전용 Firebase 인증 환경 오류');
    }
    if (!credentials || credentials.project_id !== QA_PROJECT ||
        typeof credentials !== 'object') {
        throw new Error('QA 전용 Firebase 프로젝트 불일치');
    }
    // Credentials stay strictly internal; only the fixed project label exposed.
    return credentials;
}

function moboProbeScopeAt(timestamp) {
    if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
        throw new Error('QA 전용 쓰기 검사 시간 오류');
    }
    const tick = Math.floor(timestamp / FIVE_MINUTES) * FIVE_MINUTES;
    return moboCheckpointScope(moboKSTDate(tick), 'serial', tick);
}

function mockEnv(overrides = {}) {
    return {
        GITHUB_REF: 'refs/heads/staging',
        GITHUB_EVENT_NAME: 'push',
        GITHUB_RUN_ATTEMPT: '1',
        GITHUB_SHA: 'a'.repeat(40),
        MOBO_QA_WRITE_PROBE_MODE: 'ISOLATED_WRITE_ONCE',
        MOBO_QA_WRITE_PROBE_APPROVAL: APPROVAL,
        MOBO_AUTO_MODE: 'PREVIEW',
        MOBO_AUTO_LIVE_CONFIRM: 'NO',
        MOBO_FIREBASE_SERVICE_ACCOUNT: JSON.stringify({
            project_id: QA_PROJECT
        }),
        ...overrides
    };
}

function runSelfTest() {
    assert.equal(
        moboValidateApprovedQAWriteEnvironment(mockEnv()).project_id,
        QA_PROJECT
    );
    const invalidEnvs = [
        {GITHUB_REF: 'refs/heads/main'},
        {GITHUB_EVENT_NAME: 'workflow_dispatch'},
        {GITHUB_RUN_ATTEMPT: '2'},
        {GITHUB_SHA: 'bad'},
        {MOBO_QA_WRITE_PROBE_MODE: 'WRITE_ANYWHERE'},
        {MOBO_QA_WRITE_PROBE_APPROVAL: 'NO'},
        {MOBO_AUTO_MODE: 'LIVE'},
        {MOBO_AUTO_LIVE_CONFIRM: 'YES'},
        {MOBO_FIREBASE_SERVICE_ACCOUNT: JSON.stringify({
            project_id: 'mobo-web-2026'
        })},
        {MOBO_FIREBASE_SERVICE_ACCOUNT: 'not-json'}
    ];
    for (const change of invalidEnvs) {
        assert.throws(
            () => moboValidateApprovedQAWriteEnvironment(mockEnv(change)),
            /QA 전용/
        );
    }
    assert.ok(APPROVED_COMMIT_SUBJECT.startsWith(APPROVAL));
    assert.throws(moboRejectRepeatRemoteWrite, /재실행 금지/);
    const today = Date.parse('2026-11-13T00:01:00+09:00');
    const scope = moboProbeScopeAt(today);
    assert.ok(scope.includes('|2026-11-13|serial|'));
    console.log('PASS: 승인된 staging push 1회차·QA 프로젝트만 접근');
    console.log('PASS: 10개 불법 실행 환경 차단·원격 모듈 초기화 없음');
    console.log('PASS: 실행 시점별 새 5분 scope 생성·합성 커서만 사용');
    console.log('QA-046D-28 · 원격 쓰기 사전 검증 PASS (메모리만)');
}

// The approved write has already run successfully once. Any subsequent
// --approved-qa-write invocation is rejected without accessing Firebase.
function moboRejectRepeatRemoteWrite() {
    throw new Error('QA-046D-28 완료: 원격 쓰기 재실행 금지');
}

if (require.main === module) {
    if (process.argv.includes('--approved-qa-write')) {
        try {
            moboRejectRepeatRemoteWrite();
        } catch {
            console.error('QA-046D-28 완료: 원격 쓰기 재실행 차단');
            process.exitCode = 1;
        }
    } else {
        try {
            runSelfTest();
        } catch (error) {
            console.error('QA-046D-28 메모리 사전검증 실패:',
                NO_SECRETS_IN_LOGS);
            process.exitCode = 1;
        }
    }
}
module.exports = {
    moboValidateApprovedQAWriteEnvironment,
    moboProbeScopeAt
};
