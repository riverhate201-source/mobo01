'use strict';

// QA-046D-20 | MoBo 서버 알림 출시 전 안전 점검
// Git 파일/워크플로 정적 점검만 수행. Firebase/FCM/Netlify API 호출 없음.
// 목적: 가상 QA PASS를 실제 발송 가능 상태로 오인하지 않게 차단.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const REQUIRED_STAGING_GUARDS = [
    "if: github.ref == 'refs/heads/staging'",
    "permissions:\n  contents: read",
    'MOBO_AUTO_MODE: PREVIEW',
    "MOBO_AUTO_LIVE_CONFIRM: 'NO'"
];

function checkDeploymentStatus({
    paths, workflow, dispatch, netlifyAdapter,
    checkpoint, lease, pipeline, ref = 'refs/heads/staging'
}) {
    if (!Array.isArray(paths) || [workflow, dispatch, netlifyAdapter,
        checkpoint, lease, pipeline].some(s => typeof s !== 'string')) {
        throw new Error('릴리스 게이트 입력 정보 오류');
    }
    const failures = [];
    function requirement(ok, label) {
        if (!ok) failures.push(label);
    }

    // 현재 staging 자동 QA 안전장치가 없어졌다면 CI 자체가 실패해야 한다.
    const autoPreview = workflow.split(
        '      - name: Auto PREVIEW after staging QA commit (no push sent)'
    )[1]?.split('\n      - name:')[0] ?? '';
    const qaAudit = workflow.split(
        '      - name: Audit recent QA delivery claims (read only)'
    )[1]?.split('\n      - name:')[0] ?? '';
    const guardResults = {
        stagingRef: ref === 'refs/heads/staging',
        stagingOnlyJob: workflow.includes(REQUIRED_STAGING_GUARDS[0]),
        readOnlyActionToken: workflow.includes(REQUIRED_STAGING_GUARDS[1]),
        previewOnlyAutoJob: autoPreview.includes("if: github.event_name == 'push'") &&
            autoPreview.includes('MOBO_AUTO_MODE: PREVIEW') &&
            autoPreview.includes("MOBO_AUTO_LIVE_CONFIRM: 'NO'"),
        readOnlyClaimAudit: qaAudit.includes("if: github.event_name == 'push'") &&
            qaAudit.includes('MOBO_AUTO_MODE: PREVIEW') &&
            qaAudit.includes("MOBO_AUTO_LIVE_CONFIRM: 'NO'"),
        noLiteralLiveMode: !/MOBO_AUTO_MODE:\s*LIVE\s*$/m.test(workflow),
        manualLiveClosed: (
            (workflow.match(/inputs\.run_mode == 'PREVIEW'/g) || []).length >= 2 &&
            (workflow.match(/inputs\.live_confirm == 'NO'/g) || []).length >= 2 &&
            workflow.includes('Reject manual LIVE or YES confirmation (locked)')
        ),
        noActiveCron: !/^\s+schedule\s*:/m.test(workflow),
        dispatcherRequiresQAProject: dispatch.includes(
            "serviceAccount.project_id !== 'mobo-qa-2026'"
        ),
        singleQAUidRequired: dispatch.includes('moboAssertScopedUID(TEST_UID)'),
        checkpointWriteLocked: checkpoint.includes('writesEnabled = false'),
        leaseWriteLocked: lease.includes('writesEnabled = false')
    };
    for (const [label, ok] of Object.entries(guardResults)) {
        requirement(ok, label);
    }
    if (failures.length > 0) {
        return {
            qaSafety: 'FAIL',
            release: 'BLOCKED',
            failures,
            blockers: ['QA 안전장치 회귀 발생: 발송/배포 금지'],
            guardResults
        };
    }

    // READY는 코드 유무만으로 판정할 수 없으며 실제 서버·기기 테스트가 필수.
    const hasRuntimeNetlifyFunction = paths.some(p =>
        /^netlify\/functions\/[^/]+\.(?:cjs|mjs|js|ts)$/.test(p)
    );
    const usesNewMultiuserBatch = dispatch.includes('moboRunResumableBatch(');
    const usesTransactionLease = dispatch.includes('moboWithRunLease(');
    const usesPersistentCheckpoint =
        dispatch.includes('moboCreateFirestoreCheckpointStore(');
    const hasNetlifyPreviewContract =
        netlifyAdapter.includes('moboCreateNetlifyPreviewHandler');
    const simulatedEndToEndOnly =
        pipeline.includes('makeFakeFirebase(') &&
        pipeline.includes('실제 Firebase/FCM 접근·실제 발송·원격 데이터 변경: 없음');

    const blockers = [];
    if (!hasRuntimeNetlifyFunction) {
        blockers.push('Netlify 서버 함수 진입점 미연결');
    }
    if (!usesNewMultiuserBatch) {
        blockers.push('실제 발송 엔진에 다중 사용자 배치 미연결');
    }
    if (!usesTransactionLease || !usesPersistentCheckpoint) {
        blockers.push('실제 발송 엔진에 실행 잠금/영속 체크포인트 미연결');
    }
    if (!hasNetlifyPreviewContract) {
        blockers.push('Netlify PREVIEW 계약 누락');
    }
    if (!simulatedEndToEndOnly) {
        blockers.push('통합 QA의 모의 테스트 구분을 재확인해야 함');
    }

    // 사람의 명시 승인/실제 서비스 검증은 파일로 대신할 수 없음.
    blockers.push('실제 5분 예약 실행·Firebase 트랜잭션·FCM 기기 도착 미검증');
    blockers.push('본 모보 적용 사용자 승인 전: LIVE 발송 절대 금지');
    blockers.push('외부 스케줄러 Actions 권한 분리·main 워크플로 위험 검토 필요');

    return {
        qaSafety: 'PASS',
        release: 'BLOCKED',
        failures: [],
        blockers,
        guardResults,
        integration: {
            hasRuntimeNetlifyFunction,
            hasNetlifyPreviewContract,
            usesNewMultiuserBatch,
            usesTransactionLease,
            usesPersistentCheckpoint,
            simulatedEndToEndOnly
        }
    };
}

function repoPaths() {
    return execFileSync('git', ['ls-files'], {
        cwd: ROOT, encoding: 'utf8', timeout: 5000
    }).trim().split(/\r?\n/).filter(Boolean);
}

function file(relPath) {
    return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function runSelfTest() {
    const inputs = {
        paths: repoPaths(),
        workflow: file('.github/workflows/mobo-auto-pc-test.yml'),
        dispatch: file('scripts/mobo-auto-dispatch.cjs'),
        netlifyAdapter: file('scripts/mobo-netlify-preview-adapter.cjs'),
        checkpoint: file('scripts/mobo-auto-firestore-checkpoint.cjs'),
        lease: file('scripts/mobo-auto-run-lease.cjs'),
        pipeline: file('scripts/mobo-auto-pipeline-integration.cjs'),
        ref: process.env.GITHUB_REF || 'refs/heads/staging'
    };
    const result = checkDeploymentStatus(inputs);

    // 보호 장치 없거나 범위를 벗어나는 변경이면 CI 실패.
    assert.equal(result.qaSafety, 'PASS',
        '릴리스 안전장치 손상: ' + result.failures.join(', '));
    assert.equal(result.release, 'BLOCKED');
    assert.ok(result.blockers.length >= 2);
    assert.equal(result.integration.simulatedEndToEndOnly, true);
    console.log('PASS: staging PREVIEW 가드·QA Firebase 제한·LIVE 잠금 유지');
    console.log('RELEASE BLOCKED: QA 코드 성공은 실제 알림 서비스 배포 허가가 아님');
    for (const blocker of result.blockers) {
        console.log('남은 조건: ' + blocker);
    }

    // 위험한 코드 변경을 감지하는 회귀 검증
    const unsafeChanges = [
        {ref: 'refs/heads/main'},
        {workflow: inputs.workflow.replace(
            "if: github.ref == 'refs/heads/staging'",
            "if: github.ref == 'refs/heads/main'"
        )},
        {workflow: inputs.workflow.replace(
            'permissions:\n  contents: read',
            'permissions:\n  contents: write'
        )},
        {workflow: inputs.workflow.replace(
            'MOBO_AUTO_MODE: PREVIEW',
            'MOBO_AUTO_MODE: LIVE'
        )},
        {workflow: inputs.workflow + '\n  schedule:\n    - cron: "* * * * *"\n'},
        {dispatch: inputs.dispatch.replace(
            "serviceAccount.project_id !== 'mobo-qa-2026'",
            "serviceAccount.project_id !== 'mobo-production'"
        )},
        {dispatch: inputs.dispatch.replace(
            'moboAssertScopedUID(TEST_UID)',
            '/* disabled UID gate */'
        )},
        {checkpoint: inputs.checkpoint.replace(
            'writesEnabled = false', 'writesEnabled = true'
        )},
        {lease: inputs.lease.replace(
            'writesEnabled = false', 'writesEnabled = true'
        )}
    ];
    for (const change of unsafeChanges) {
        const changed = checkDeploymentStatus({...inputs, ...change});
        assert.equal(changed.qaSafety, 'FAIL',
            '위험 변경을 감지하지 못함: ' + Object.keys(change)[0]);
        assert.equal(changed.release, 'BLOCKED');
    }
    console.log('PASS: 9가지 위험 변경 → QA 실패·출시 차단');

    // Netlify 함수가 나중에 생기더라도 사람 승인·실기기 검증은 자동 완료로 바뀌지 않음.
    const future = checkDeploymentStatus({
        ...inputs,
        paths: [...inputs.paths, 'netlify/functions/mobo-scheduled.cjs'],
        dispatch: inputs.dispatch + [
            'moboRunResumableBatch(',
            'moboWithRunLease(',
            'moboCreateFirestoreCheckpointStore('
        ].join('\n')
    });
    assert.equal(future.qaSafety, 'PASS');
    assert.equal(future.integration.hasRuntimeNetlifyFunction, true);
    assert.equal(future.release, 'BLOCKED');
    assert.ok(future.blockers.some(x => x.includes('기기 도착')));
    console.log('PASS: 서버 파일 추가 후에도 실제 기기 검증·승인 없으면 출시 차단');

    console.log('QA-046D-20 · 출시 전 안전 게이트 PASS / 출시 상태 BLOCKED');
    console.log('실제 Firebase·FCM·Netlify API 호출 및 쓰기: 없음');
}

if (require.main === module) {
    try {
        runSelfTest();
    } catch (error) {
        console.error('QA-046D-20 실패:', error.message);
        process.exitCode = 1;
    }
}

module.exports = {checkDeploymentStatus};
