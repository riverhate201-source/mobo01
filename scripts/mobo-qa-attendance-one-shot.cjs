'use strict';
// QA-046D-41: explicitly armed one-day, one-five-minute-slot Galaxy attendance trial.
// No Netlify route; no cron; nothing runs unless the scheduled QA wrapper opts in.
// A minimum of TWO separate env approvals is required. FCM is never invoked
// from dry-run/read-only modes. Never log UID, FCM token or JSON keys.
const assert=require('node:assert/strict');
const {moboKSTDate}=require('./mobo-scheduler-clock.cjs');
const {moboAssertQANetlifyReadOnlyConfig}=
    require('./mobo-auto-netlify-runtime-identity.cjs');
const {moboQAGalaxySendOnce}=require('./mobo-auto-galaxy-send-gate.cjs');

const QA_PROJECT='mobo-qa-2026';
const QA_SENDER='mobo-qa-sender@mobo-qa-2026.iam.gserviceaccount.com';
const QA_SLOT='22:35';
const CONFIRM='YES_I_APPROVE_ONE_QA_PUSH';
const ARM=/^APPROVE\|(20\d\d-\d\d-\d\d)\|22:35\|ATTENDANCE$/;

function moboAssertTrialApproval(env,now){
    if(!env || !Number.isSafeInteger(now) || now<0){
        throw Error('QA_TRIAL_CONTEXT_INVALID');
    }
    if(env.MOBO_QA_ATTENDANCE_TRIAL===undefined ||
       env.MOBO_QA_ATTENDANCE_TRIAL==='OFF') {
        return {armed:false,reason:'OFF'};
    }
    // Neither a single accidental YES nor a mistakenly pasted date can send.
    if(env.MOBO_QA_TEST_SEND_CONFIRM!==CONFIRM ||
       env.MOBO_QA_SENDER_PREFLIGHT!=='OFF' ||
       env.MOBO_QA_FCM_VALIDATE_ONLY!=='OFF' ||
       env.MOBO_QA_SEND_ACTIVE==='YES') {
        throw Error('QA_TRIAL_EXPLICIT_APPROVAL_REQUIRED');
    }
    moboAssertQANetlifyReadOnlyConfig(env);
    const match=ARM.exec(env.MOBO_QA_ATTENDANCE_TRIAL);
    if(!match || !Number.isFinite(Date.parse(match[1]+'T00:00:00Z')) ||
       new Date(match[1]+'T00:00:00Z').toISOString().slice(0,10)!==match[1]){
        throw Error('QA_TRIAL_DATE_OR_SLOT_INVALID');
    }
    const currentDate=moboKSTDate(now);
    const currentSlot=new Date(now+9*3600000).toISOString().slice(11,16);
    if(match[1]!==currentDate || currentSlot!==QA_SLOT){
        return {armed:false,reason:'OUTSIDE_APPROVED_DATE_OR_SLOT'};
    }
    let sender;
    try{sender=JSON.parse(env.MOBO_QA_SEND_SA_JSON);}
    catch{throw Error('QA_TRIAL_SENDER_JSON_INVALID');}
    if(!sender || sender.type!=='service_account' ||
       sender.project_id!==QA_PROJECT ||
       sender.client_email!==QA_SENDER ||
       typeof sender.private_key!=='string' ||
       !sender.private_key.startsWith('-----BEGIN PRIVATE KEY-----\n') ||
       typeof sender.private_key_id!=='string' ||
       sender.private_key_id.length<8){
        throw Error('QA_TRIAL_SENDER_CREDENTIAL_INVALID');
    }
    return {armed:true,kind:'attendance',sender};
}

function pinnedOneGalaxyEnv(env){
    return {
        ...env,
        MOBO_QA_SEND_ACTIVE:'YES',
        MOBO_QA_SEND_APPROVAL:'APPROVED_GALAXY_ONLY',
        MOBO_QA_SEND_MODE:'QA_LIVE',
        MOBO_QA_SEND_MAX:'1',
        MOBO_QA_SEND_KIND:'attendance',
        MOBO_QA_TEST_TARGET_UID:env.MOBO_AUTO_TEST_UID
    };
}

async function moboRunOneShotGalaxyAttendance({
    env,clock=Date.now,createClient,dispatch=moboQAGalaxySendOnce
}){
    if(typeof clock!=='function')throw Error('QA_TRIAL_CLOCK_REQUIRED');
    const now=clock();
    const approval=moboAssertTrialApproval(env,now);
    if(!approval.armed){
        return {status:approval.reason,sent:0};
    }
    if(typeof createClient!=='function' || typeof dispatch!=='function'){
        throw Error('QA_TRIAL_SENDER_ADAPTER_REQUIRED');
    }
    const {db,send}=await createClient(approval.sender);
    if(!db || typeof send!=='function'){
        throw Error('QA_TRIAL_SENDER_NOT_READY');
    }
    // The existing Galaxy handler re-reads the exact UID, checks attendance
    // before claim, atomically creates a date/kind claim and records FCM status.
    const result=await dispatch({
        env:pinnedOneGalaxyEnv(env),db,send,clock,kind:'attendance'
    });
    if(!result || !Number.isInteger(result.sent) ||
       result.sent<0 || result.sent>1 ||
       typeof result.status!=='string'){
        throw Error('QA_TRIAL_RESULT_INVALID');
    }
    // Never include tokens, user identities or response IDs in the logs.
    return {status:result.status,sent:result.sent,qa:true};
}

async function moboRunOneShotGalaxyAttendanceOnNetlify(env){
    return moboRunOneShotGalaxyAttendance({
        env,
        createClient:async sender=>{
            const {cert,initializeApp,getApps}=require('firebase-admin/app');
            const {getFirestore}=require('firebase-admin/firestore');
            const {getMessaging}=require('firebase-admin/messaging');
            let app=getApps().find(a=>a.name==='mobo-qa-attendance-one-shot');
            if(!app){
                app=initializeApp({
                    credential:cert(sender),projectId:QA_PROJECT
                },'mobo-qa-attendance-one-shot');
            }
            return {db:getFirestore(app),send:message=>getMessaging(app).send(message)};
        }
    });
}

// In-memory-only contract tests; not a real FCM/Firestore operation.
async function runSelfTest(){
    const uid='GalaxyQaOneShotUid_1234567890';
    const day='2026-11-17';
    const kst=time=>Date.parse(day+'T'+time+':00+09:00');
    const sender={
        type:'service_account',
        project_id:QA_PROJECT,
        client_email:QA_SENDER,
        private_key_id:'FAKE_TEST_KEY_1234',
        private_key:'-----BEGIN PRIVATE KEY-----\nMOCK_ONLY\n-----END PRIVATE KEY-----\n'
    };
    const env={
        SITE_ID:'b1680059-2ea4-4120-9f29-62c4298f9ef7',
        SITE_NAME:'mobo-push-qa',URL:'https://mobo-push-qa.netlify.app',
        MOBO_NETLIFY_QA_PREVIEW:'YES',MOBO_AUTO_MODE:'PREVIEW',
        MOBO_AUTO_KIND:'SCHEDULE',MOBO_PREVIEW_CLOCK:'NOW',
        MOBO_AUTO_LIVE_CONFIRM:'NO',
        MOBO_QA_SCHEDULE_PROFILE:'READ_ONLY_FUTURE',
        MOBO_QA_NETLIFY_APPROVAL:'NOT_DEPLOYED',
        MOBO_AUTO_TEST_UID:uid,
        MOBO_FIREBASE_SERVICE_ACCOUNT:JSON.stringify({
            project_id:QA_PROJECT,
            client_email:'mobo-qa-readonly@mobo-qa-2026.iam.gserviceaccount.com'
        }),
        MOBO_QA_SEND_SA_JSON:JSON.stringify(sender),
        MOBO_QA_SENDER_PREFLIGHT:'OFF',
        MOBO_QA_FCM_VALIDATE_ONLY:'OFF',
        MOBO_QA_ATTENDANCE_TRIAL:'APPROVE|2026-11-17|22:35|ATTENDANCE',
        MOBO_QA_TEST_SEND_CONFIRM:CONFIRM
    };
    let clients=0,dispatches=0,last=null;
    const client=async cred=>{
        clients++;
        assert.equal(cred.client_email,QA_SENDER);
        return {db:{collection:()=>{}},send:async()=>{}};
    };
    const dispatch=async x=>{
        dispatches++;last=x;
        assert.equal(x.kind,'attendance');
        assert.equal(x.env.MOBO_AUTO_MODE,'PREVIEW');
        assert.equal(x.env.MOBO_QA_SEND_ACTIVE,'YES');
        assert.equal(x.env.MOBO_QA_TEST_TARGET_UID,uid);
        assert.equal(x.env.MOBO_QA_SEND_MAX,'1');
        return {status:'FCM_ACCEPTED',sent:1};
    };
    const run=(overrides={},clock=()=>kst('22:35'))=>
        moboRunOneShotGalaxyAttendance({
            env:{...env,...overrides},clock,createClient:client,dispatch
        });
    assert.deepEqual(await run({MOBO_QA_ATTENDANCE_TRIAL:'OFF'}),
        {status:'OFF',sent:0});
    assert.deepEqual(await run({MOBO_QA_ATTENDANCE_TRIAL:undefined}),
        {status:'OFF',sent:0});
    assert.deepEqual(await run({},()=>kst('22:34')),
        {status:'OUTSIDE_APPROVED_DATE_OR_SLOT',sent:0});
    assert.deepEqual(await run({},()=>kst('22:40')),
        {status:'OUTSIDE_APPROVED_DATE_OR_SLOT',sent:0});
    assert.deepEqual(await run({},()=>Date.parse(
        '2026-11-18T22:35:00+09:00')),
        {status:'OUTSIDE_APPROVED_DATE_OR_SLOT',sent:0});
    assert.equal(clients,0);
    assert.equal(dispatches,0);
    console.log('PASS: OFF, wrong date, early/late schedule => no client or FCM');

    for(const bad of [
        {MOBO_QA_TEST_SEND_CONFIRM:undefined},
        {MOBO_QA_TEST_SEND_CONFIRM:'YES'},
        {MOBO_QA_SENDER_PREFLIGHT:'AUTH_READ_ONLY'},
        {MOBO_QA_FCM_VALIDATE_ONLY:'YES'},
        {MOBO_QA_SEND_ACTIVE:'YES'},
        {MOBO_QA_ATTENDANCE_TRIAL:'APPROVE|2026-11-17|22:35|SERIAL'},
        {MOBO_QA_ATTENDANCE_TRIAL:'APPROVE|2026-02-30|22:35|ATTENDANCE'},
        {SITE_NAME:'mobo-demo'},
        {MOBO_AUTO_MODE:'LIVE'},
        {MOBO_AUTO_LIVE_CONFIRM:'YES'},
        {MOBO_AUTO_TEST_UID:''},
        {MOBO_QA_SEND_SA_JSON:'not-json'},
        {MOBO_QA_SEND_SA_JSON:JSON.stringify({
            ...sender,project_id:'not-qa'
        })},
        {MOBO_QA_SEND_SA_JSON:JSON.stringify({
            ...sender,client_email:'mobo-qa-readonly@mobo-qa-2026.iam.gserviceaccount.com'
        })}
    ]){
        await assert.rejects(run(bad),/QA|Netlify/);
    }
    assert.equal(clients,0);
    assert.equal(dispatches,0);
    console.log('PASS: wrong credentials, missing two-key approval => zero FCM');

    const result=await run();
    assert.deepEqual(result,{status:'FCM_ACCEPTED',sent:1,qa:true});
    assert.equal(clients,1);
    assert.equal(dispatches,1);
    assert.equal(last.env.MOBO_QA_SEND_KIND,'attendance');
    assert.equal(last.env.MOBO_QA_TEST_TARGET_UID,uid);
    const notDue=await moboRunOneShotGalaxyAttendance({
        env,clock:()=>kst('22:35'),createClient:client,
        dispatch:async()=>({status:'NOT_DUE',sent:0})
    });
    assert.deepEqual(notDue,{status:'NOT_DUE',sent:0,qa:true});
    assert.equal(clients,2);
    console.log('PASS: one Galaxy attendance kind only; zero due => no delivery');

    const fs=require('node:fs'),path=require('node:path');
    assert.equal(fs.existsSync(path.resolve(__dirname,
        '../netlify/functions/mobo-qa-readonly.mjs')),false);
    console.log('PASS: no deployed Netlify function; one-shot gate dormant');
    console.log('QA-046D-41 OFFLINE PASS: no FCM sends / remote Firestore writes');
}
if(require.main===module){
    runSelfTest().catch(e=>{
        console.error('QA-046D-41 test failed:',e.code||e.message);
        process.exitCode=1;
    });
}
module.exports={moboAssertTrialApproval,moboRunOneShotGalaxyAttendance,
    moboRunOneShotGalaxyAttendanceOnNetlify};
