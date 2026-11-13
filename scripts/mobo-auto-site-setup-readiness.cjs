'use strict';

// QA-046D-31 | Independent QA Netlify deployment setup preflight.
// This script neither reads Netlify account data nor deploys anything.
// Only staged repository paths and synthetic provider snapshots are checked.
// Never print user IDs, API keys, Firebase credentials or full env values.
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {normalizedOrigin} = require('./mobo-auto-qa-site-boundary.cjs');
const {moboCheckNoActiveNetlifySchedule} =
    require('./mobo-auto-netlify-cutover-contract.cjs');

const REPO = 'riverhate201-source/mobo01';
const QA_BRANCH = 'staging';
const MAIN_BRANCH = 'main';
const QA_PROJECT = 'mobo-qa-2026';
const SITE_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

// Netlify-provided fields are read from the service itself after connection.
// Do NOT fill in guessed values, or commit actual site IDs/credentials here.
const REQUIRED_RUNTIME_VARIABLES = Object.freeze([
    'MOBO_QA_EXPECTED_SITE_ID',
    'MOBO_MAIN_SITE_ID',
    'MOBO_QA_EXPECTED_ORIGIN',
    'MOBO_MAIN_ORIGIN',
    'MOBO_MAIN_FIREBASE_PROJECT',
    'MOBO_QA_SCHEDULE_PROFILE',
    'MOBO_QA_NETLIFY_APPROVAL',
    'MOBO_NETLIFY_QA_PREVIEW',
    'MOBO_AUTO_MODE',
    'MOBO_AUTO_KIND',
    'MOBO_PREVIEW_CLOCK',
    'MOBO_AUTO_LIVE_CONFIRM',
    'MOBO_AUTO_TEST_UID',
    'MOBO_FIREBASE_SERVICE_ACCOUNT'
]);
const NETLIFY_PROVIDED = Object.freeze([
    'NETLIFY', 'CONTEXT', 'SITE_ID', 'URL'
]);

function moboValidateTwoNetlifySites({qa, main} = {}) {
    if (!qa || !main || typeof qa !== 'object' || typeof main !== 'object') {
        throw new Error('QA Netlify 사이트 실제 메타데이터 없음');
    }
    for (const site of [qa,main]) {
        if (typeof site.id !== 'string' || !SITE_ID.test(site.id) ||
            typeof site.repo !== 'string' ||
            site.repo !== REPO ||
            typeof site.productionBranch !== 'string' ||
            typeof site.url !== 'string') {
            throw new Error('QA Netlify 사이트 메타데이터 불일치');
        }
    }
    if (qa.id === main.id) {
        throw new Error('QA Netlify 사이트 ID가 정식 사이트와 동일');
    }
    if (qa.productionBranch !== QA_BRANCH ||
        main.productionBranch !== MAIN_BRANCH) {
        throw new Error('QA Netlify 사이트 게시 브랜치 분리 실패');
    }
    if (normalizedOrigin(qa.url) === normalizedOrigin(main.url)) {
        throw new Error('QA Netlify 사이트 배포 주소 중복');
    }
    return Object.freeze({
        qaBranch:QA_BRANCH,
        mainBranch:MAIN_BRANCH,
        independentIds:true,
        independentOrigins:true,
        qaProject:QA_PROJECT
    });
}

function moboReviewQARepoSetup({files, workflow, actualNetlifySites = null}) {
    if (!Array.isArray(files) ||
        files.some(f=>typeof f!=='string') ||
        typeof workflow !== 'string') {
        throw new Error('QA Netlify 준비 검사 입력 오류');
    }

    const problems=[];
    const add=(condition, reason)=>{
        if (!condition) problems.push(reason);
    };
    const activeNetlify=moboCheckNoActiveNetlifySchedule(files);
    add(activeNetlify.safe,'Netlify 함수 또는 배포 설정 신규 등록 검토 필요');

    // No secrets / local state may be accidentally shipped with the repository.
    const suspicious=files.filter(f=>
        /(?:^|\/)\.env(?:\..*)?$/.test(f) ||
        /(?:^|\/)\.netlify(?:\/|$)/.test(f) ||
        /(?:^|\/)(?:service-account|firebase-admin-key)[^/]*\.json$/i.test(f) ||
        /^netlify\/functions\//.test(f)
    );
    add(suspicious.length===0,'QA 저장소 내 민감 파일/배포 파일 점검 필요');

    add(workflow.includes("if: github.ref == 'refs/heads/staging'"),
        'GitHub Actions staging 브랜치 제한 누락');
    add(/permissions:\s*\n\s*contents:\s*read\b/.test(workflow),
        'GitHub Actions 최소 읽기 권한 누락');
    add(workflow.includes('secrets.MOBO_QA_FIREBASE_SERVICE_ACCOUNT'),
        'QA Firebase 전용 GitHub secret 연결 누락');
    add(!workflow.includes('secrets.MOBO_FIREBASE_SERVICE_ACCOUNT'),
        '일반 Firebase secret을 참조하는 위험 경로 발견');
    add(!/^\s*schedule\s*:/m.test(workflow),
        'GitHub Actions 자동 cron 무단 추가');
    add(!/^\s*MOBO_AUTO_MODE:\s*LIVE\b/m.test(workflow),
        'GitHub Actions LIVE 설정 활성화');
    add(!/^\s*MOBO_AUTO_LIVE_CONFIRM:\s*YES\b/m.test(workflow),
        'GitHub Actions LIVE 승인 활성화');
    add(!/--approved-qa-write\b/.test(workflow),
        '일회성 원격 쓰기 재활성화 발견');

    let providerShapeValid=false;
    if (actualNetlifySites !== null) {
        try {
            moboValidateTwoNetlifySites(actualNetlifySites);
            providerShapeValid=true;
        } catch {
            problems.push('QA Netlify 두 사이트의 게시 브랜치·주소 분리 실패');
        }
    }

    // This tool cannot read real Netlify account/site metadata:
    // synthetic metadata PASS is NOT "external provider verification".
    return Object.freeze({
        codeSafety:problems.length===0 ? 'PASS' : 'FAIL',
        detectedProblems:problems,
        netlifyFunctionPresent:!activeNetlify.safe,
        providerMetadataFormatValid:providerShapeValid,
        realNetlifyAccountVerified:false,
        requiredRuntimeVariableNames:REQUIRED_RUNTIME_VARIABLES,
        netlifyProvidedVariableNames:NETLIFY_PROVIDED,
        release:'BLOCKED',
        next:'실제 Netlify 계정의 QA/정식 사이트 정보 읽기 전용 확인 및 별도 배포 승인 필요'
    });
}

function syntheticPair() {
    return {
        qa:{
            id:'11111111-1111-4111-8111-111111111111',
            url:'https://qa-example.netlify.app',
            productionBranch:'staging',
            repo:REPO
        },
        main:{
            id:'22222222-2222-4222-8222-222222222222',
            url:'https://main-example.netlify.app',
            productionBranch:'main',
            repo:REPO
        }
    };
}
function memoryWorkflow(){
    return [
        'on:',
        '  push:',
        '    branches:',
        '      - staging',
        'permissions:',
        '  contents: read',
        'jobs:',
        '  qa:',
        "    if: github.ref == 'refs/heads/staging'",
        '    steps:',
        '      - name: Test',
        '        env:',
        '          MOBO_FIREBASE_SERVICE_ACCOUNT: \${{ secrets.MOBO_QA_FIREBASE_SERVICE_ACCOUNT }}',
        '          MOBO_AUTO_MODE: PREVIEW',
        "          MOBO_AUTO_LIVE_CONFIRM: 'NO'"
    ].join('\n');
}

function runSelfTest() {
    const pair=syntheticPair();
    assert.deepEqual(moboValidateTwoNetlifySites(pair),{
        qaBranch:QA_BRANCH,mainBranch:MAIN_BRANCH,
        independentIds:true,independentOrigins:true,
        qaProject:QA_PROJECT
    });
    for(const mutation of [
        {qa:{...pair.qa,id:pair.main.id}},
        {qa:{...pair.qa,url:pair.main.url}},
        {qa:{...pair.qa,productionBranch:'main'}},
        {main:{...pair.main,productionBranch:'staging'}},
        {qa:{...pair.qa,repo:'another/repository'}},
        {qa:{...pair.qa,id:'not-a-site-id'}},
        {qa:{...pair.qa,url:'http://qa-example.netlify.app'}},
        {main:null}
    ]) {
        assert.throws(()=>moboValidateTwoNetlifySites({
            ...pair,...mutation
        }),/QA |QA Netlify|사이트/);
    }
    console.log('PASS: QA=staging·정식=main, 사이트 ID·주소 분리 계약');

    const fakeReview=moboReviewQARepoSetup({
        files:['scripts/qa-check.cjs','.github/workflows/qa.yml'],
        workflow:memoryWorkflow(),actualNetlifySites:pair
    });
    assert.equal(fakeReview.codeSafety,'PASS');
    assert.equal(fakeReview.providerMetadataFormatValid,true);
    assert.equal(fakeReview.realNetlifyAccountVerified,false);
    assert.equal(fakeReview.release,'BLOCKED');
    assert.equal(fakeReview.requiredRuntimeVariableNames.length,14);
    assert.equal(fakeReview.netlifyProvidedVariableNames.length,4);
    console.log('PASS: 가상 사이트 정보가 유효해도 실제 Netlify 확인·배포는 차단');

    for(const badFile of [
        '.env', '.env.production', '.netlify/state.json',
        'service-account.json', 'netlify/functions/mobo-scheduled.mjs'
    ]) {
        const changed=moboReviewQARepoSetup({
            files:['scripts/qa-check.cjs',badFile],
            workflow:memoryWorkflow()
        });
        assert.equal(changed.codeSafety,'FAIL');
        assert.equal(changed.release,'BLOCKED');
    }
    for(const unsafeLine of [
        '  schedule:',
        '          MOBO_AUTO_MODE: LIVE',
        '          MOBO_AUTO_LIVE_CONFIRM: YES',
        '          node scripts/mobo-auto-remote-write-once.cjs --approved-qa-write'
    ]) {
        const changed=moboReviewQARepoSetup({
            files:[],
            workflow:memoryWorkflow()+'\n'+unsafeLine
        });
        assert.equal(changed.codeSafety,'FAIL');
    }
    console.log('PASS: 자격 증명 파일·무단 예약·LIVE·원격 쓰기 회귀 차단');

    const root=path.resolve(__dirname,'..');
    const files=execFileSync('git',['ls-files'],{
        cwd:root,encoding:'utf8',timeout:5000
    }).trim().split(/\r?\n/).filter(Boolean);
    const workflow=fs.readFileSync(path.join(root,
        '.github/workflows/mobo-auto-pc-test.yml'),'utf8');
    const current=moboReviewQARepoSetup({files,workflow});
    assert.equal(current.codeSafety,'PASS',
        '저장소 준비 검사 실패: '+current.detectedProblems.join(', '));
    assert.equal(current.realNetlifyAccountVerified,false);
    assert.equal(current.netlifyFunctionPresent,false);
    assert.equal(current.release,'BLOCKED');
    console.log('PASS: 현재 GitHub staging의 배포/민감 파일·실행 범위 안전');
    console.log('현재 상태: 실제 Netlify 사이트 연결 여부 미검증 / 배포 승인 BLOCKED');
    console.log('QA-046D-31 · Netlify QA site setup readiness PASS');
    console.log('실제 Netlify/Firebase/FCM 접속·쓰기·배포 없음');
}

if(require.main===module){
    try {
        runSelfTest();
    } catch(err) {
        console.error('QA-046D-31 실패:',
            err instanceof assert.AssertionError ?
                'QA 환경 검증 실패' : err.message);
        process.exitCode=1;
    }
}

module.exports={
    moboValidateTwoNetlifySites,
    moboReviewQARepoSetup
};
