'use strict';

// QA-046D-32 | Independent Netlify QA site's runtime identity preflight.
// A contract only: no Netlify scheduled function, Firebase calls, or FCM send.
// Netlify Functions runtime guarantees SITE_ID, SITE_NAME and URL; build-only
// NETLIFY / CONTEXT variables must not be required by a deployed function.
const assert = require('node:assert/strict');

const QA_SITE_ID = 'b1680059-2ea4-4120-9f29-62c4298f9ef7';
const QA_SITE_NAME = 'mobo-push-qa';
const QA_ORIGIN = 'https://mobo-push-qa.netlify.app';
const QA_PROJECT = 'mobo-qa-2026';
const QA_READER = 'mobo-qa-readonly@mobo-qa-2026.iam.gserviceaccount.com';
const UID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

function moboAssertQANetlifyRuntimeIdentity(env) {
    // Compare against the actual Netlify-issued values, not user supplied
    // MOBO_QA_EXPECTED_* values from the same runtime environment.
    if (!env || env.SITE_ID !== QA_SITE_ID ||
        env.SITE_NAME !== QA_SITE_NAME ||
        env.URL !== QA_ORIGIN) {
        throw new Error('QA Netlify 서버 신원 확인 실패');
    }
    return true;
}

function moboAssertQANetlifyReadOnlyConfig(env) {
    moboAssertQANetlifyRuntimeIdentity(env);
    if (env.MOBO_NETLIFY_QA_PREVIEW !== 'YES' ||
        env.MOBO_AUTO_MODE !== 'PREVIEW' ||
        env.MOBO_AUTO_KIND !== 'SCHEDULE' ||
        env.MOBO_PREVIEW_CLOCK !== 'NOW' ||
        env.MOBO_AUTO_LIVE_CONFIRM !== 'NO' ||
        env.MOBO_QA_SCHEDULE_PROFILE !== 'READ_ONLY_FUTURE' ||
        env.MOBO_QA_NETLIFY_APPROVAL !== 'NOT_DEPLOYED' ||
        !UID_PATTERN.test(env.MOBO_AUTO_TEST_UID || '')) {
        throw new Error('QA 읽기 전용 서버 설정이 준비되지 않음');
    }
    let credential;
    try {
        credential = JSON.parse(env.MOBO_FIREBASE_SERVICE_ACCOUNT);
    } catch {
        throw new Error('QA Firebase 인증 형식 오류');
    }
    if (!credential || credential.project_id !== QA_PROJECT ||
        credential.client_email !== QA_READER) {
        throw new Error('QA Firebase 읽기 전용 계정 불일치');
    }
    return Object.freeze({site:'QA', mode:'READ_ONLY_PREVIEW', eligible:true});
}

function fakeEnv(overrides={}) {
    return {
        SITE_ID:QA_SITE_ID,
        SITE_NAME:QA_SITE_NAME,
        URL:QA_ORIGIN,
        MOBO_NETLIFY_QA_PREVIEW:'YES',
        MOBO_AUTO_MODE:'PREVIEW',
        MOBO_AUTO_KIND:'SCHEDULE',
        MOBO_PREVIEW_CLOCK:'NOW',
        MOBO_AUTO_LIVE_CONFIRM:'NO',
        MOBO_QA_SCHEDULE_PROFILE:'READ_ONLY_FUTURE',
        MOBO_QA_NETLIFY_APPROVAL:'NOT_DEPLOYED',
        MOBO_AUTO_TEST_UID:'SyntheticGalaxyQA_12345678',
        MOBO_FIREBASE_SERVICE_ACCOUNT:JSON.stringify({
            project_id:QA_PROJECT, client_email:QA_READER
        }),
        ...overrides
    };
}

function runSelfTest() {
    assert.equal(moboAssertQANetlifyRuntimeIdentity(fakeEnv()),true);
    assert.deepEqual(moboAssertQANetlifyReadOnlyConfig(fakeEnv()),{
        site:'QA',mode:'READ_ONLY_PREVIEW',eligible:true
    });
    const badValues = [
        {SITE_ID:'00000000-0000-4000-8000-000000000000'},
        {SITE_ID:undefined}, {SITE_NAME:'mobo-demo'},
        {URL:'https://mobo-demo.netlify.app'},
        {URL:'http://mobo-push-qa.netlify.app'},
        {URL:'https://mobo-push-qa.netlify.app.evil.test'},
        {MOBO_NETLIFY_QA_PREVIEW:'NO'},
        {MOBO_AUTO_MODE:'LIVE'},
        {MOBO_AUTO_KIND:'ATTENDANCE'},
        {MOBO_PREVIEW_CLOCK:'TODAY_22_05'},
        {MOBO_AUTO_LIVE_CONFIRM:'YES'},
        {MOBO_QA_SCHEDULE_PROFILE:'LIVE'},
        {MOBO_QA_NETLIFY_APPROVAL:'APPROVED'},
        {MOBO_AUTO_TEST_UID:''},
        {MOBO_AUTO_TEST_UID:'invalid/uid'},
        {MOBO_FIREBASE_SERVICE_ACCOUNT:'invalid json'},
        {MOBO_FIREBASE_SERVICE_ACCOUNT:JSON.stringify({
            project_id:'mobo-production',client_email:QA_READER
        })},
        {MOBO_FIREBASE_SERVICE_ACCOUNT:JSON.stringify({
            project_id:QA_PROJECT,client_email:'firebase-adminsdk@example.test'
        })}
    ];
    for(const overrides of badValues){
        assert.throws(()=>moboAssertQANetlifyReadOnlyConfig(
            fakeEnv(overrides)),/QA /);
    }
    console.log('PASS: 독립 QA Netlify 사이트 ID·이름·주소와 QA 읽기 계정만 허용');
    console.log('PASS: LIVE·본 서비스·잘못된 UID·다른 Firebase 계정 차단');
    console.log('QA-046D-32 PASS: 실제 예약 함수 등록·Firebase 호출·FCM 발송 없음');
}

if (require.main === module) runSelfTest();
module.exports = {
    moboAssertQANetlifyRuntimeIdentity,
    moboAssertQANetlifyReadOnlyConfig
};
