'use strict';

// MoBo QA-046D-25 | runtime environment and GitHub workflow preflight.
// Static local analysis only: never start the old workflows, never initialize
// firebase-admin, never log credentials, UID, token, or connected services.
// Does not authorize LIVE or any change on main / Netlify production.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {moboAssertNetlifyQAEnvironment} =
    require('./mobo-netlify-preview-adapter.cjs');

const ROOT = path.resolve(__dirname, '..');
const QA_PROJECT = 'mobo-qa-2026';
const STAGING = 'refs/heads/staging';
const CURRENT = '.github/workflows/mobo-auto-pc-test.yml';
const LEGACY = Object.freeze({
    'mobo-auto-preview.yml': 'mobo-auto-preview.cjs',
    'mobo-push-preview.yml': 'mobo-push-preview.cjs',
    'mobo-dedupe-firestore-test.yml': 'mobo-dedupe-firestore-test.cjs',
    'mobo-test-push.yml': 'mobo-test-push.cjs'
});

function safeSource(name) {
    // Relative paths only; no untrusted arbitrary filename or URL.
    if (typeof name !== 'string' ||
        !/^(?:scripts\/[a-z0-9-]+\.cjs|\.github\/workflows\/[a-z0-9-]+\.yml)$/.test(name)) {
        throw new Error('QA preflight 검사 경로 오류');
    }
    return fs.readFileSync(path.join(ROOT,name),'utf8');
}

function checked(condition, message) {
    if (!condition) throw new Error('QA preflight 차단: '+message);
}

function validateQAReadOnlyEnv(env) {
    // Also ensures the service account's declared project ID matches QA.
    moboAssertNetlifyQAEnvironment(env);
    checked(typeof env.MOBO_FIREBASE_SERVICE_ACCOUNT === 'string' &&
        env.MOBO_FIREBASE_SERVICE_ACCOUNT.length < 100000,
        '인증 문자열 크기 오류');
    checked(env.MOBO_AUTO_MODE === 'PREVIEW' &&
        env.MOBO_AUTO_LIVE_CONFIRM === 'NO', 'PREVIEW 경로만 허용');
    return Object.freeze({mode:'PREVIEW', project:'QA', scope:'SINGLE_UID_READ'});
}

function checkCIWorkflow(text, reference = STAGING) {
    checked(typeof text === 'string', '워크플로 내용 없음');
    const checks = {
        stagingRef: reference === STAGING,
        stagingPush: /push:\s*\n\s*branches:\s*\n\s*-\s*staging\b/.test(text),
        jobRestricted: text.includes("if: github.ref == 'refs/heads/staging'"),
        minimalToken: /permissions:\s*\n\s*contents:\s*read\b/.test(text) &&
            !/^\s*(?:actions|id-token|packages|deployments):\s*write\s*$/m.test(text),
        noCron: !/^\s*schedule:\s*$/m.test(text),
        noLiteralLive: !/^\s*MOBO_AUTO_MODE:\s*LIVE\s*$/m.test(text),
        noLiteralConfirm: !/^\s*MOBO_AUTO_LIVE_CONFIRM:\s*YES\s*$/m.test(text),
        noSendOnce: !/^\s*MOBO_SEND_MODE:\s*SEND_ONCE\s*$/m.test(text),
        qaSecrets: text.includes('secrets.MOBO_QA_FIREBASE_SERVICE_ACCOUNT') &&
            text.includes('secrets.MOBO_QA_GALAXY_TEST_UID'),
        noGeneralSecret: !/secrets\.MOBO_FIREBASE_SERVICE_ACCOUNT\b/.test(text),
        manualLiveRejected: text.includes(
            'Reject manual LIVE or YES confirmation (locked)') &&
            (text.match(/inputs\.run_mode == 'PREVIEW'/g) || []).length >= 2 &&
            (text.match(/inputs\.live_confirm == 'NO'/g) || []).length >= 2
    };
    return {
        passed:Object.values(checks).every(Boolean),
        failed:Object.entries(checks).filter(([,ok])=>!ok).map(([name])=>name),
        checks
    };
}

function inspectLegacyWorkflow(workflowName, yaml, scriptText) {
    checked(Object.hasOwn(LEGACY,workflowName), '알 수 없는 구형 워크플로');
    checked(typeof yaml === 'string' && typeof scriptText === 'string',
        '구형 워크플로 코드 오류');
    const usesGeneralSecret = /secrets\.MOBO_FIREBASE_SERVICE_ACCOUNT\b/.test(yaml);
    const targetsProdProject = scriptText.includes("'mobo-web-2026'");
    const writeOps = /\.create\(|\.delete\(|claimDeliveryOnce\(|markDeliverySent\(/.test(
        scriptText
    );
    const canExplicitlySend = yaml.includes('SEND_ONCE') &&
        /getMessaging\(\)\.send\(/.test(scriptText);
    const restrictsStaging = yaml.includes(
        "if: github.ref == 'refs/heads/staging'");
    const manualOnly = /\bworkflow_dispatch:\s*(?:\n|$)/.test(yaml) &&
        !/^\s*schedule:\s*$/m.test(yaml) &&
        !/^\s*push:\s*$/m.test(yaml);
    return {
        workflowName,
        manualOnly,
        restrictsStaging,
        usesGeneralSecret,
        targetsProdProject,
        hasDatabaseWriteOperations:writeOps,
        canExplicitlySend,
        requiresManualReview:
            !manualOnly || usesGeneralSecret || targetsProdProject ||
            writeOps || canExplicitlySend || !restrictsStaging
    };
}

function makeTestEnv() {
    return {
        MOBO_NETLIFY_QA_PREVIEW:'YES',
        MOBO_AUTO_MODE:'PREVIEW',
        MOBO_AUTO_KIND:'SCHEDULE',
        MOBO_PREVIEW_CLOCK:'NOW',
        MOBO_AUTO_LIVE_CONFIRM:'NO',
        MOBO_AUTO_TEST_UID:'SyntheticQaDevice_12345678',
        MOBO_FIREBASE_SERVICE_ACCOUNT:JSON.stringify({
            project_id: QA_PROJECT
        })
    };
}

function runSelfTest() {
    const workflow = safeSource(CURRENT);
    const current = checkCIWorkflow(
        workflow, process.env.GITHUB_REF || STAGING
    );
    checked(current.passed,
        'staging CI 안전 조건 누락: '+current.failed.join(', '));
    console.log('PASS: staging 전용 QA·최소 GitHub 권한·비예약·PREVIEW 확인');

    // Inject representative security regressions. Each MUST fail closed.
    const dangerous = [
        {reference:'refs/heads/main'},
        {yaml:workflow.replace('      - staging', '      - main')},
        {yaml:workflow.replace(
            "if: github.ref == 'refs/heads/staging'",
            "if: github.ref == 'refs/heads/main'"
        )},
        {yaml:workflow.replace('  contents: read','  contents: write')},
        {yaml:workflow+'\n  schedule:\n    - cron: "*/5 * * * *"\n'},
        {yaml:workflow+'\n      MOBO_AUTO_MODE: LIVE\n'},
        {yaml:workflow+'\n      MOBO_AUTO_LIVE_CONFIRM: YES\n'},
        {yaml:workflow+'\n      MOBO_SEND_MODE: SEND_ONCE\n'},
        {yaml:workflow.replace(
            'secrets.MOBO_QA_FIREBASE_SERVICE_ACCOUNT',
            'secrets.MOBO_FIREBASE_SERVICE_ACCOUNT'
        )},
        {yaml:workflow.replace(
            'Reject manual LIVE or YES confirmation (locked)',
            'Removed safety block'
        )}
    ];
    for(const x of dangerous){
        const candidate = checkCIWorkflow(
            x.yaml ?? workflow, x.reference ?? STAGING
        );
        assert.equal(candidate.passed,false,
            'Failed to reject: '+Object.keys(x).join(','));
    }
    console.log('PASS: 10가지 위험 워크플로 변경을 자동 차단');

    const env = makeTestEnv();
    assert.deepEqual(validateQAReadOnlyEnv(env),{
        mode:'PREVIEW',project:'QA',scope:'SINGLE_UID_READ'
    });
    for(const change of [
        {MOBO_AUTO_MODE:'LIVE'},
        {MOBO_AUTO_LIVE_CONFIRM:'YES'},
        {MOBO_NETLIFY_QA_PREVIEW:'NO'},
        {MOBO_AUTO_TEST_UID:''},
        {MOBO_PREVIEW_CLOCK:'TODAY_22_05'},
        {MOBO_FIREBASE_SERVICE_ACCOUNT:JSON.stringify({
            project_id:'mobo-web-2026'
        })}
    ]){
        assert.throws(()=>validateQAReadOnlyEnv({...env,...change}),
            /Netlify QA PREVIEW 거부|QA preflight 차단/);
    }
    console.log('PASS: QA 서비스 계정·단일 기기·읽기 전용 모드 검증');

    const legacy = [];
    for(const [name,script] of Object.entries(LEGACY)){
        const report = inspectLegacyWorkflow(
            name,
            safeSource('.github/workflows/'+name),
            safeSource('scripts/'+script)
        );
        legacy.push(report);
    }
    const byName = Object.fromEntries(
        legacy.map(x=>[x.workflowName,x])
    );
    assert.equal(byName['mobo-auto-preview.yml'].targetsProdProject,true);
    assert.equal(byName['mobo-push-preview.yml'].usesGeneralSecret,true);
    assert.equal(byName['mobo-dedupe-firestore-test.yml']
        .hasDatabaseWriteOperations,true);
    assert.equal(byName['mobo-test-push.yml'].canExplicitlySend,true);
    console.log('PASS: 이전 수동 워크플로의 서비스 프로젝트/쓰기/발송 위험 분류');

    // These are legacy manual actions, not automatically executed today.
    // Report their number and purpose, never log credentials or tokens.
    for(const entry of legacy.filter(x=>x.requiresManualReview)){
        const reasons = [];
        if(entry.usesGeneralSecret) reasons.push('일반 Firebase secret');
        if(entry.targetsProdProject) reasons.push('본 서비스 프로젝트 코드');
        if(entry.hasDatabaseWriteOperations) reasons.push('DB 쓰기 동작');
        if(entry.canExplicitlySend) reasons.push('수동 SEND_ONCE');
        if(!entry.restrictsStaging) reasons.push('브랜치 제한 없음');
        console.log('REVIEW: '+entry.workflowName+' / '+reasons.join(', '));
    }
    const strictReleaseBlocked = legacy.some(x=>x.requiresManualReview);
    assert.equal(strictReleaseBlocked,true);
    console.log('PASS: 구형 수동 워크플로 검토 전 LIVE 활성화 금지');

    // Current new QA gate also remains intentionally release-blocked.
    const gate = safeSource('scripts/mobo-auto-release-gate.cjs');
    checked(gate.includes("release: 'BLOCKED'") &&
        gate.includes('RELEASE BLOCKED'), '기존 출시 차단 상태 손상');
    console.log('QA-046D-25 · 서버 환경·권한 preflight PASS');
    console.log('RELEASE BLOCKED: 구형 수동 워크플로 및 실제 서버 통합 검토 필요');
    console.log('GitHub Secrets 원문 출력: 없음 / 실제 Firebase 접속: 없음');
    console.log('FCM 발송·DB 변경·Netlify 배포: 없음');
}

if(require.main===module){
    try{
        runSelfTest();
    }catch(error){
        console.error('QA-046D-25 실패:',error.message);
        process.exitCode=1;
    }
}

module.exports={
    checkCIWorkflow,inspectLegacyWorkflow,validateQAReadOnlyEnv
};
