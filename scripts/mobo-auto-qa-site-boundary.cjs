'use strict';

// MoBo QA-046D-30 | 독립 QA Netlify 사이트 환경 경계 사전검사.
// 아직 Netlify 함수로 배포하지 않으며 LIVE/FCM/Firestore 쓰기 없음.
// 모든 인수는 명시적 주입; 환경 변수/secret을 로그에 출력하지 않는다.
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const path = require('node:path');
const {moboAssertNetlifyQAEnvironment} =
    require('./mobo-netlify-preview-adapter.cjs');
const {moboValidateNetlifyCutoverBudget,
    moboCheckNoActiveNetlifySchedule} =
    require('./mobo-auto-netlify-cutover-contract.cjs');

const QA_PROJECT = 'mobo-qa-2026';
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RESERVED = new Set([
    'MOBO_AUTO_MODE','MOBO_AUTO_LIVE_CONFIRM','MOBO_AUTO_KIND',
    'MOBO_NETLIFY_QA_PREVIEW','MOBO_PREVIEW_CLOCK'
]);

function normalizedOrigin(value) {
    if (typeof value !== 'string' || value.length > 253) {
        throw new Error('QA 사이트 주소 형식 오류');
    }
    let parsed;
    try {
        parsed = new URL(value);
    } catch {
        throw new Error('QA 사이트 주소 형식 오류');
    }
    if (parsed.protocol !== 'https:' || !parsed.hostname ||
        parsed.username || parsed.password ||
        parsed.port || parsed.search || parsed.hash ||
        parsed.pathname !== '/' ||
        /^(localhost|127\.0\.0\.1)$/.test(parsed.hostname)) {
        throw new Error('QA 사이트 주소 형식 오류');
    }
    return parsed.origin;
}

function moboAssertIsolatedQANetlifySite(env) {
    // CONTEXT=production is required by Netlify Scheduled Functions, BUT it
    // must be on a different Netlify site from the real MoBo application.
    // These environment variables alone are not proof of deployment identity;
    // actual Netlify account/site metadata must be verified before deploying.
    if (!env || env.NETLIFY !== 'true' ||
        env.CONTEXT !== 'production') {
        throw new Error('QA 별도 Netlify 게시 환경 확인 실패');
    }
    moboAssertNetlifyQAEnvironment(env);

    const ids = [
        env.SITE_ID,
        env.MOBO_QA_EXPECTED_SITE_ID,
        env.MOBO_MAIN_SITE_ID
    ];
    if (!ids.every(v => typeof v === 'string' && ID_PATTERN.test(v)) ||
        ids[0] !== ids[1] || ids[0] === ids[2]) {
        throw new Error('QA/정식 Netlify 사이트 ID 분리 실패');
    }

    const current = normalizedOrigin(env.URL);
    const expected = normalizedOrigin(env.MOBO_QA_EXPECTED_ORIGIN);
    const production = normalizedOrigin(env.MOBO_MAIN_ORIGIN);
    if (current !== expected || current === production) {
        throw new Error('QA/정식 Netlify 사이트 주소 분리 실패');
    }
    if (env.MOBO_MAIN_FIREBASE_PROJECT === QA_PROJECT ||
        typeof env.MOBO_MAIN_FIREBASE_PROJECT !== 'string' ||
        env.MOBO_MAIN_FIREBASE_PROJECT.length < 4) {
        throw new Error('QA/정식 Firebase 프로젝트 경계 설정 오류');
    }
    if (env.MOBO_QA_SCHEDULE_PROFILE !== 'READ_ONLY_FUTURE' ||
        env.MOBO_QA_NETLIFY_APPROVAL !== 'NOT_DEPLOYED') {
        throw new Error('QA Netlify 자동 실행 배포 승인 전 차단');
    }
    for(const key of RESERVED){
        if (typeof env[key] !== 'string') {
            throw new Error('QA Netlify PREVIEW 설정 누락');
        }
    }
    return Object.freeze({
        project:'QA',
        mode:'PREVIEW_ONLY',
        siteIdentity:'CONFIG_MATCH_ONLY',
        deployAllowed:false,
        liveAllowed:false,
        reason:'실제 Netlify 사이트 분리 확인·배포 승인 필요'
    });
}

function moboBuildQAIsolationReadiness({
    env, filePaths, runtimeAvailable = false
}) {
    const report = {
        qaProjectOnly:false,
        isolatedSiteConfigured:false,
        runtimeEntrypointRegistered:false,
        automatedScheduleActivated:false,
        deployAllowed:false,
        liveAllowed:false,
        blockers:[]
    };
    try {
        moboAssertIsolatedQANetlifySite(env);
        report.qaProjectOnly = true;
        report.isolatedSiteConfigured = true;
    } catch {
        report.blockers.push('QA Netlify 독립 사이트 실제 설정 확인 필요');
    }
    const registration = moboCheckNoActiveNetlifySchedule(filePaths);
    if (!registration.safe) {
        report.blockers.push('Netlify 예약 함수/설정 변경을 별도 검토해야 함');
    } else {
        report.blockers.push('Netlify 예약 함수 아직 미배포');
    }
    if (runtimeAvailable) {
        report.blockers.push('실제 QA 사이트의 ID·DNS·환경변수 외부 검증 필요');
    }
    report.blockers.push('실제 5분 예약 호출·FCM 기기 테스트·사용자 배포 승인 남음');
    return report;
}

function fakeEnv(overrides={}) {
    return {
        NETLIFY:'true',
        CONTEXT:'production',
        SITE_ID:'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        MOBO_QA_EXPECTED_SITE_ID:'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        MOBO_MAIN_SITE_ID:'fbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        URL:'https://mobo-qa-example.netlify.app',
        MOBO_QA_EXPECTED_ORIGIN:'https://mobo-qa-example.netlify.app',
        MOBO_MAIN_ORIGIN:'https://mobo-main-example.netlify.app',
        MOBO_MAIN_FIREBASE_PROJECT:'mobo-web-2026',
        MOBO_QA_SCHEDULE_PROFILE:'READ_ONLY_FUTURE',
        MOBO_QA_NETLIFY_APPROVAL:'NOT_DEPLOYED',
        MOBO_NETLIFY_QA_PREVIEW:'YES',
        MOBO_AUTO_MODE:'PREVIEW',
        MOBO_AUTO_KIND:'SCHEDULE',
        MOBO_PREVIEW_CLOCK:'NOW',
        MOBO_AUTO_LIVE_CONFIRM:'NO',
        MOBO_AUTO_TEST_UID:'SyntheticGalaxyQA_12345678',
        MOBO_FIREBASE_SERVICE_ACCOUNT:JSON.stringify({
            project_id:QA_PROJECT
        }),
        ...overrides
    };
}

function runSelfTest() {
    const valid=fakeEnv();
    const result=moboAssertIsolatedQANetlifySite(valid);
    assert.equal(result.deployAllowed,false);
    assert.equal(result.liveAllowed,false);
    assert.equal(result.mode,'PREVIEW_ONLY');
    assert.equal(result.siteIdentity,'CONFIG_MATCH_ONLY');
    assert.equal(
        moboValidateNetlifyCutoverBudget().delivery,'PREVIEW_ONLY'
    );
    console.log('PASS: 두 개의 독립 Netlify 사이트 ID·주소·QA Firebase 설정 일치');

    const unsafe=[
        {NETLIFY:'false'},
        {CONTEXT:'branch-deploy'},
        {CONTEXT:'deploy-preview'},
        {SITE_ID:valid.MOBO_MAIN_SITE_ID},
        {SITE_ID:'not-a-site-id'},
        {MOBO_QA_EXPECTED_SITE_ID:valid.MOBO_MAIN_SITE_ID},
        {MOBO_MAIN_SITE_ID:valid.SITE_ID},
        {URL:valid.MOBO_MAIN_ORIGIN},
        {URL:'http://mobo-qa-example.netlify.app'},
        {URL:'https://mobo-qa-example.netlify.app.evil.test'},
        {URL:'https://mobo-qa-example.netlify.app/path'},
        {MOBO_QA_EXPECTED_ORIGIN:valid.MOBO_MAIN_ORIGIN},
        {MOBO_MAIN_ORIGIN:valid.URL},
        {MOBO_MAIN_FIREBASE_PROJECT:QA_PROJECT},
        {MOBO_QA_SCHEDULE_PROFILE:'LIVE'},
        {MOBO_QA_NETLIFY_APPROVAL:'APPROVED'},
        {MOBO_NETLIFY_QA_PREVIEW:'NO'},
        {MOBO_AUTO_MODE:'LIVE'},
        {MOBO_AUTO_LIVE_CONFIRM:'YES'},
        {MOBO_AUTO_TEST_UID:''},
        {MOBO_FIREBASE_SERVICE_ACCOUNT:JSON.stringify({
            project_id:'mobo-web-2026'
        })}
    ];
    for(const delta of unsafe){
        assert.throws(()=>moboAssertIsolatedQANetlifySite(
            fakeEnv(delta)
        ),/QA|Netlify/);
    }
    console.log('PASS: QA/정식 사이트 혼동·LIVE 등 위험 환경 21종 사전 차단');

    const root=path.resolve(__dirname,'..');
    const files=execFileSync('git',['ls-files'],{
        cwd:root, encoding:'utf8',timeout:5000
    }).split(/\r?\n/).filter(Boolean);
    const status=moboBuildQAIsolationReadiness({
        env:valid,filePaths:files
    });
    assert.equal(status.isolatedSiteConfigured,true);
    assert.equal(status.qaProjectOnly,true);
    assert.equal(status.automatedScheduleActivated,false);
    assert.equal(status.deployAllowed,false);
    assert.equal(status.liveAllowed,false);
    assert.ok(status.blockers.some(v=>v.includes('별도 검토')));
    assert.ok(files.includes('netlify/functions/mobo-qa-readonly.mjs'));
    console.log('PASS: QA 읽기 전용 예약 함수 등록 후에도 실제 실행/출시 승인 BLOCKED');

    const missing=moboBuildQAIsolationReadiness({
        env:{},filePaths:files
    });
    assert.equal(missing.qaProjectOnly,false);
    assert.ok(missing.blockers.some(v=>v.includes('독립 사이트')));
    const unexpected=moboBuildQAIsolationReadiness({
        env:valid,filePaths:[...files,'netlify/functions/qa-schedule.mjs'],
        runtimeAvailable:true
    });
    assert.ok(unexpected.blockers.some(v=>v.includes('별도 검토')));
    assert.equal(unexpected.deployAllowed,false);
    console.log('PASS: 미설정/예상 외 Netlify 배포 파일 감지·배포 거부');

    // The environment and hostname comparison is a *config preflight* only.
    // Site ID cannot be authenticated by local process.env alone.
    console.log('QA-046D-30 · QA Netlify site boundary contract PASS');
    console.log('RELEASE BLOCKED: Netlify 실제 계정/site ID 별도 검증 전');
    console.log('QA 예약 함수는 소스에 등록. 실제 배포 검증/FCM/Firestore 쓰기 없음');
}
if (require.main === module) {
    try {
        runSelfTest();
    } catch(error) {
        console.error('QA-046D-30 검사 실패:',error.message);
        process.exitCode=1;
    }
}
module.exports={
    normalizedOrigin,
    moboAssertIsolatedQANetlifySite,
    moboBuildQAIsolationReadiness
};
