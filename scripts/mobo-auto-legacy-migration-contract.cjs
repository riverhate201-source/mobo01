'use strict';

// QA-046D-26 | 구형 수동 GitHub Actions를 QA 안전 경로로 전환할 대체안 검사.
// 이 모듈은 기존 .github/workflows 파일을 수정/삭제/실행하지 않음.
// 실제 전환은 사용자 검토 후 별도로 진행. 현재는 안전한 초안의 계약만 검사.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {inspectLegacyWorkflow}=
    require('./mobo-auto-runtime-preflight.cjs');

const ROOT=path.resolve(__dirname,'..');
const PLANS=Object.freeze({
    'mobo-auto-preview.yml':Object.freeze({
        purpose:'single QA device preview',
        script:'scripts/mobo-auto-preview-runtime.cjs --qa-read',
        kind:'READ_ONLY_PREVIEW'
    }),
    'mobo-push-preview.yml':Object.freeze({
        purpose:'single QA device Firestore read-only transaction',
        script:'scripts/mobo-auto-readonly-transaction.cjs --qa-read',
        kind:'READ_ONLY_TRANSACTION'
    }),
    'mobo-dedupe-firestore-test.yml':Object.freeze({
        purpose:'offline dedupe validation only',
        script:'scripts/mobo-auto-pipeline-integration.cjs',
        kind:'MEMORY_ONLY'
    }),
    'mobo-test-push.yml':Object.freeze({
        purpose:'offline push behavior validation only',
        script:'scripts/mobo-auto-send-result.cjs',
        kind:'MEMORY_ONLY'
    })
});

function moboBuildSafeManualWorkflow(name) {
    const plan=PLANS[name];
    if(!plan)throw new Error('QA 구형 작업 대체 프로필 오류');
    // This is a generated *string*, not saved or deployed.
    const remote=plan.kind.startsWith('READ_ONLY');
    const env=remote ? [
        '        env:',
        '          MOBO_FIREBASE_SERVICE_ACCOUNT: \${{ secrets.MOBO_QA_FIREBASE_SERVICE_ACCOUNT }}',
        '          MOBO_AUTO_TEST_UID: \${{ secrets.MOBO_QA_GALAXY_TEST_UID }}',
        "          MOBO_NETLIFY_QA_PREVIEW: 'YES'",
        '          MOBO_AUTO_MODE: PREVIEW',
        '          MOBO_AUTO_KIND: SCHEDULE',
        '          MOBO_PREVIEW_CLOCK: NOW',
        "          MOBO_AUTO_LIVE_CONFIRM: 'NO'",
        ...(plan.kind==='READ_ONLY_TRANSACTION'?
            ['          MOBO_QA_TRANSACTION_MODE: READ_ONLY']:[])
    ]:[];
    return [
        '# QA-046D-26 contract draft. NOT deployed or enabled.',
        'name: MoBo QA Safe Manual '+plan.kind,
        'on:',
        '  workflow_dispatch:',
        'permissions:',
        '  contents: read',
        'jobs:',
        '  safe-manual:',
        "    if: github.ref == 'refs/heads/staging'",
        '    runs-on: ubuntu-latest',
        '    timeout-minutes: 10',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - uses: actions/setup-node@v4',
        '        with:',
        "          node-version: '22'",
        ...(remote?[
            '      - name: Install Firebase Admin SDK',
            '        run: npm install --no-save --no-package-lock --ignore-scripts firebase-admin@13'
        ]:[]),
        '      - name: QA safe verification',
        ...env,
        '        run: |',
        '          test "$GITHUB_REF" = "refs/heads/staging"',
        '          node '+plan.script,
        ''
    ].join('\n');
}

function moboCheckSafeManualWorkflow(yaml, profileName) {
    if(!Object.hasOwn(PLANS,profileName) || typeof yaml!=='string') {
        return false;
    }
    const expected=PLANS[profileName];
    // Fail closed: exact script, explicit staging branch, no non-QA secrets
    // and no hidden steps that start old production-oriented entrypoints.
    const runLines=yaml.split(/\r?\n/).filter(line=>
        /^\s*(?:node |run:\s*node |[-]\s*name:)/.test(line)
    );
    const allowedRunLines=runLines.filter(x=>
        x.includes('node '+expected.script)
    );
    return (
        yaml.includes('  workflow_dispatch:') &&
        yaml.includes('  contents: read') &&
        yaml.includes("if: github.ref == 'refs/heads/staging'") &&
        allowedRunLines.length===1 &&
        !/\b(?:SEND_ONCE|MOBO_AUTO_MODE:\s*LIVE|MOBO_AUTO_LIVE_CONFIRM:\s*YES)\b/.test(yaml) &&
        !/secrets\.MOBO_FIREBASE_SERVICE_ACCOUNT\b/.test(yaml) &&
        !/mobo-(?:test-push|dedupe-firestore-test|auto-preview|push-preview)\.cjs/.test(yaml) &&
        !/^\s*(?:schedule|push):\s*$/m.test(yaml) &&
        !/^\s*(?:actions|id-token|contents):\s*write\s*$/m.test(yaml) &&
        (expected.kind==='MEMORY_ONLY' ||
            yaml.includes('secrets.MOBO_QA_FIREBASE_SERVICE_ACCOUNT')) &&
        (expected.kind!=='MEMORY_ONLY' ||
            !/secrets\./.test(yaml))
    );
}

function runSelfTest() {
    const names=Object.keys(PLANS);
    assert.equal(names.length,4);
    for(const name of names){
        const current=fs.readFileSync(path.join(
            ROOT,'.github/workflows',name
        ),'utf8');
        const currentScript={
            'mobo-auto-preview.yml':'mobo-auto-preview.cjs',
            'mobo-push-preview.yml':'mobo-push-preview.cjs',
            'mobo-dedupe-firestore-test.yml':'mobo-dedupe-firestore-test.cjs',
            'mobo-test-push.yml':'mobo-test-push.cjs'
        }[name];
        const source=fs.readFileSync(path.join(
            ROOT,'scripts',currentScript
        ),'utf8');
        const existing=inspectLegacyWorkflow(name,current,source);
        assert.equal(existing.requiresManualReview,true);
        const draft=moboBuildSafeManualWorkflow(name);
        assert.equal(moboCheckSafeManualWorkflow(draft,name),true);

        // Adversarial substitutions must fail validation before applying.
        const mutated=[
            draft.replace('refs/heads/staging','refs/heads/main'),
            draft.replace('  contents: read','  contents: write'),
            draft.replace('  workflow_dispatch:','  schedule:'),
            draft.replace('node '+PLANS[name].script,
                'node scripts/mobo-test-push.cjs'),
            draft+'\n          MOBO_AUTO_MODE: LIVE\n',
            draft+'\n          MOBO_AUTO_LIVE_CONFIRM: YES\n',
            draft+'\n          MOBO_SEND_MODE: SEND_ONCE\n',
            draft+'\n          FCM_TOKEN: \${{ secrets.MOBO_FIREBASE_SERVICE_ACCOUNT }}\n'
        ];
        for(const candidate of mutated){
            assert.equal(moboCheckSafeManualWorkflow(candidate,name),false);
        }
    }
    console.log('PASS: 구형 수동 작업 4개 → 읽기 전용/메모리 전용 대체안 생성');
    console.log('PASS: 각 대체안의 위험한 변형 8가지 × 4개 차단');
    console.log('QA-046D-26 · legacy migration safety contract PASS');
    console.log('기존 워크플로 변경/비활성화/실행 없음');
    console.log('실제 Firebase 쓰기·FCM 발송·Netlify 배포 없음');
}
if(require.main===module){
    try{runSelfTest();}catch(error){
        console.error('QA-046D-26 migration 검사 실패:',error.message);
        process.exitCode=1;
    }
}
module.exports={
    moboBuildSafeManualWorkflow,moboCheckSafeManualWorkflow
};
