'use strict';
// QA-046D-33 | static test of the ONLY permitted Netlify QA scheduler.
// No Netlify execution, Firebase calls or live push.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const file=rel=>fs.readFileSync(path.join(ROOT,rel),'utf8');

function runSelfTest(){
    const fn=file('netlify/functions/mobo-qa-readonly.mjs');
    const pkg=JSON.parse(file('package.json'));
    assert.equal(pkg.private,true);
    assert.equal(pkg.dependencies['firebase-admin'],'13.10.0');
    for(const fragment of [
        "schedule: '*/5 * * * *'",
        'moboAssertQANetlifyReadOnlyConfig(env)',
        'moboCheckSafeScheduledPayload(payload, Date.now())',
        'moboCreateUndeployedQAScheduleHandler({',
        'credential:cert(JSON.parse(env.MOBO_FIREBASE_SERVICE_ACCOUNT))',
        "projectId:'mobo-qa-2026'",
        "MOBO_AUTO_MODE:'PREVIEW'",
        "MOBO_AUTO_LIVE_CONFIRM:'NO'",
        "MOBO_QA_NETLIFY_APPROVAL:'NOT_DEPLOYED'"
    ]) assert.ok(fn.includes(fragment),'QA schedule contract missing');
    for(const forbidden of [
        'getMessaging(', 'sendEach(', '.send(', '.set(', '.update(',
        '.delete(', 'MOBO_AUTO_MODE:LIVE', "schedule: '* * * * *'"
    ]) assert.equal(fn.includes(forbidden),false,'Unexpected LIVE/send/write code');
    const allowed=file('scripts/mobo-auto-site-setup-readiness.cjs');
    assert.ok(allowed.includes(
        "approvedQAFunction='netlify/functions/mobo-qa-readonly.mjs'"));
    assert.ok(allowed.includes("f==='netlify.toml'"));
    const identity=file('scripts/mobo-auto-netlify-runtime-identity.cjs');
    assert.ok(identity.includes('b1680059-2ea4-4120-9f29-62c4298f9ef7'));
    assert.ok(identity.includes('mobo-qa-readonly@mobo-qa-2026.iam.gserviceaccount.com'));
    console.log('PASS: QA 사이트·읽기 전용 서비스 계정·5분 cron 고정');
    console.log('PASS: 예기치 않은 Netlify 함수/FCM/쓰기/LIVE 차단');
    console.log('QA-046D-33 static PASS; 실제 Netlify 배포/5분 실행은 별도 확인 필요');
}
if(require.main===module)runSelfTest();
module.exports={runSelfTest};
