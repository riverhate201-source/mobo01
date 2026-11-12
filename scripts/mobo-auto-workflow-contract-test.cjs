'use strict';

// QA-046D-9 | 외부 PREVIEW 워크플로와 실행 가드의 연결 회귀 테스트
// 로컬 파일/자식 Node 프로세스만 사용. GitHub API·Firebase·FCM 호출 없음.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { moboExternalPreviewPayload } = require('./mobo-auto-external-trigger.cjs');

const root = path.resolve(__dirname, '..');
const workflowPath = path.join(root, '.github/workflows/mobo-auto-pc-test.yml');
const guardPath = path.join(__dirname, 'mobo-auto-external-trigger.cjs');

function containsLine(text, expected) {
    assert.ok(
        text.split('\n').some(line => line.trim() === expected.trim()),
        'Workflow line absent: ' + expected
    );
}

function readStep(workflow, stepName, nextName) {
    const start = workflow.indexOf('      - name: ' + stepName);
    const end = workflow.indexOf('      - name: ' + nextName, start + 1);
    assert.ok(start >= 0 && end > start, 'Expected workflow steps missing');
    return workflow.slice(start, end);
}

function invokeGuard(env) {
    return spawnSync(
        process.execPath,
        [guardPath, '--check-invocation'],
        {
            cwd: root,
            env,
            encoding: 'utf8',
            timeout: 5000
        }
    );
}

function runSelfTest() {
    const wf = fs.readFileSync(workflowPath, 'utf8');

    // workflow_dispatch is registered on the default branch. Execution is
    // intentionally targeted to staging and the job must recheck its ref.
    containsLine(wf, 'workflow_dispatch:');
    containsLine(wf, "if: github.ref == 'refs/heads/staging'");
    containsLine(wf, "default: 'MANUAL'");
    containsLine(wf, '- EXTERNAL_PREVIEW');
    assert.ok(!/^\s+schedule\s*:/m.test(wf));
    console.log('PASS: staging-only job and no active cron');

    const external = readStep(
        wf,
        'External scheduler PREVIEW only (never sends push)',
        'Run Galaxy automatic notification test'
    );

    containsLine(
        external,
        "if: \${{ github.event_name == 'workflow_dispatch' && inputs.execution_profile == 'EXTERNAL_PREVIEW' }}"
    );

    const required = [
        'MOBO_AUTO_MODE: PREVIEW',
        'MOBO_AUTO_KIND: SCHEDULE',
        'MOBO_PREVIEW_CLOCK: NOW',
        "MOBO_AUTO_LIVE_CONFIRM: 'NO'",
        'MOBO_AUTO_TEST_UID: \${{ secrets.MOBO_QA_GALAXY_TEST_UID }}',
        'MOBO_EXTERNAL_PROFILE: \${{ inputs.execution_profile }}',
        'MOBO_EXTERNAL_TARGET: \${{ inputs.target_device }}',
        'MOBO_EXTERNAL_CLOCK: \${{ inputs.preview_clock }}',
        'MOBO_EXTERNAL_KIND: \${{ inputs.notification_kind }}',
        'MOBO_EXTERNAL_MODE: \${{ inputs.run_mode }}',
        'MOBO_EXTERNAL_CONFIRM: \${{ inputs.live_confirm }}'
    ];
    for (const line of required) {
        containsLine(external, line);
    }
    assert.ok(
        external.indexOf('node scripts/mobo-auto-external-trigger.cjs --check-invocation') <
        external.indexOf('node scripts/mobo-auto-dispatch.cjs'),
        'External guard must run before Firebase PREVIEW'
    );
    console.log('PASS: external workflow forced PREVIEW and validates inputs first');

    const manual = wf.slice(
        wf.indexOf('      - name: Run Galaxy automatic notification test')
    );
    assert.equal(
        (manual.match(/inputs\.execution_profile != 'EXTERNAL_PREVIEW'/g) || []).length,
        2,
        'Both manual device jobs must be excluded for external profile'
    );
    console.log('PASS: external profile does not enter manual LIVE job');

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

    const baseEnv = {
        GITHUB_REF: 'refs/heads/staging',
        GITHUB_EVENT_NAME: 'workflow_dispatch',
        MOBO_EXTERNAL_PROFILE: payload.inputs.execution_profile,
        MOBO_EXTERNAL_TARGET: payload.inputs.target_device,
        MOBO_EXTERNAL_CLOCK: payload.inputs.preview_clock,
        MOBO_EXTERNAL_KIND: payload.inputs.notification_kind,
        MOBO_EXTERNAL_MODE: payload.inputs.run_mode,
        MOBO_EXTERNAL_CONFIRM: payload.inputs.live_confirm,
        MOBO_AUTO_MODE: 'PREVIEW',
        MOBO_AUTO_KIND: 'SCHEDULE',
        MOBO_PREVIEW_CLOCK: 'NOW',
        MOBO_AUTO_LIVE_CONFIRM: 'NO',
        MOBO_AUTO_TEST_UID: 'GalaxyQaSyntheticUid_12345'
    };

    const good = invokeGuard(baseEnv);
    assert.equal(
        good.status, 0,
        'Valid invocation should pass: ' + (good.stderr || '').slice(0, 100)
    );
    assert.match(good.stdout, /외부 PREVIEW 실행 가드 PASS/);

    const rejected = [
        { GITHUB_REF: 'refs/heads/main' },
        { MOBO_EXTERNAL_MODE: 'LIVE' },
        { MOBO_AUTO_MODE: 'LIVE' },
        { MOBO_EXTERNAL_CONFIRM: 'YES' },
        { MOBO_AUTO_LIVE_CONFIRM: 'YES' },
        { MOBO_AUTO_TEST_UID: '' }
    ];

    for (const override of rejected) {
        const result = invokeGuard({ ...baseEnv, ...override });
        assert.notEqual(result.status, 0, 'Unsafe invocation must fail');
        assert.match(result.stderr, /외부 PREVIEW 호출 차단/);
    }
    console.log('PASS: actual Node entrypoint rejects unsafe invocation');

    console.log('QA-046D-9 · external workflow integration contract PASS');
    console.log('Authorization / external scheduler NOT connected or validated');
    console.log('Actual workflow_dispatch API call: none');
    console.log('FCM delivery and Firestore writes: none');
}

if (require.main === module) {
    try {
        runSelfTest();
    } catch (error) {
        console.error('QA-046D-9 FAIL:', error.message);
        process.exitCode = 1;
    }
}
