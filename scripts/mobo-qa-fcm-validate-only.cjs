'use strict';
// QA-046D-40 | FCM validate-only (dry-run) capability check.
// Explicit QA-only opt-in; no real messages, Firestore writes or dedupe claims.
const assert=require('node:assert/strict');
const {moboAssertQANetlifyReadOnlyConfig}=
    require('./mobo-auto-netlify-runtime-identity.cjs');
const {moboReadScopedSources}=require('./mobo-auto-source-scope.cjs');

const PROJECT='mobo-qa-2026';
const EMAIL='mobo-qa-sender@mobo-qa-2026.iam.gserviceaccount.com';
const ORIGIN='https://mobo-push-qa.netlify.app';

function validateQAFcmDryRunEnv(env) {
    moboAssertQANetlifyReadOnlyConfig(env);
    if(env.MOBO_QA_FCM_VALIDATE_ONLY!=='YES' ||
        env.MOBO_QA_SENDER_PREFLIGHT!=='OFF' ||
        env.MOBO_QA_SEND_ACTIVE==='YES' ||
        env.MOBO_QA_SEND_APPROVAL==='APPROVED_GALAXY_ONLY' ||
        env.MOBO_QA_SEND_MODE==='QA_LIVE' ||
        env.MOBO_AUTO_MODE!=='PREVIEW' ||
        env.MOBO_AUTO_LIVE_CONFIRM!=='NO') {
        throw Error('QA_FCM_VALIDATE_ONLY_NOT_APPROVED');
    }
    let credential;
    try {credential=JSON.parse(env.MOBO_QA_SEND_SA_JSON);}
    catch {throw Error('QA_FCM_SENDER_JSON_INVALID');}
    if(!credential || credential.type!=='service_account' ||
        credential.project_id!==PROJECT ||
        credential.client_email!==EMAIL ||
        typeof credential.private_key!=='string' ||
        !credential.private_key.startsWith('-----BEGIN PRIVATE KEY-----\n') ||
        typeof credential.private_key_id!=='string' ||
        credential.private_key_id.length<8) {
        throw Error('QA_FCM_SENDER_IDENTITY_INVALID');
    }
    return credential;
}

async function moboValidateQAFcmWithoutDelivery({env, createClient}) {
    const sender=validateQAFcmDryRunEnv(env);
    if(typeof createClient!=='function') throw Error('QA_FCM_CLIENT_REQUIRED');
    const {db,messaging}=await createClient(sender);
    if(!messaging || typeof messaging.send!=='function') {
        throw Error('QA_FCM_MESSAGING_ADAPTER_INVALID');
    }
    // No collection-level reads; no other user accounts are accessed.
    const {subscriptions,schedules}=await moboReadScopedSources(
        db,env.MOBO_AUTO_TEST_UID
    );
    if(subscriptions.size!==1 || schedules.size!==1) {
        throw Error('QA_FCM_TEST_USER_NOT_REGISTERED');
    }
    const sub=subscriptions.docs[0].data();
    if(!sub || sub.enabled!==true || sub.timezone!=='Asia/Seoul' ||
        typeof sub.token!=='string' || sub.token.length<20) {
        throw Error('QA_FCM_TEST_TOKEN_INVALID');
    }
    // QA-safe payload; dryRun=true is literal and cannot be overridden.
    const message={
        token:sub.token,
        notification:{
            title:'MoBo FCM 검증 [QA]',
            body:'검증 전용 요청입니다. 실제 알림은 발송되지 않습니다.'
        },
        webpush:{
            headers:{TTL:'60'},
            notification:{
                icon:ORIGIN+'/icon.png',
                badge:ORIGIN+'/notification-badge.png'
            },
            fcmOptions:{link:ORIGIN+'/'}
        }
    };
    // Firebase Admin Messaging.send(message, true) validates on FCM;
    // unlike send(message), it does not deliver any notification.
    const response=await messaging.send(message, true);
    if(typeof response!=='string' || response.length===0) {
        throw Error('QA_FCM_VALIDATE_ONLY_RESPONSE_INVALID');
    }
    // Never log or return the FCM ID, token, uid, or credential.
    return Object.freeze({
        status:'FCM_VALIDATE_ONLY_OK',project:'QA',
        validatedAccounts:1,notificationSent:false,
        firestoreWrites:0,claimsCreated:0
    });
}

// Lazy Firebase imports avoid network and require() in offline tests.
// No implicit launch and no Netlify function registered by this module.
async function moboRunQAFcmDryRunOnNetlify(env) {
    return moboValidateQAFcmWithoutDelivery({
        env,
        createClient:async sender=>{
            const {getApps,initializeApp,cert}=require('firebase-admin/app');
            const {getFirestore}=require('firebase-admin/firestore');
            const {getMessaging}=require('firebase-admin/messaging');
            let app=getApps().find(a=>a.name==='mobo-qa-fcm-validate-only');
            if(!app) {
                app=initializeApp({
                    credential:cert(sender),projectId:PROJECT
                },'mobo-qa-fcm-validate-only');
            }
            return {db:getFirestore(app),messaging:getMessaging(app)};
        }
    });
}

async function runSelfTest() {
    const uid='GalaxyQAFcmValidateUid_1234',token='QA_FAKE_FCM_TOKEN_123456789012345';
    const credential={
        type:'service_account',project_id:PROJECT,
        client_email:EMAIL,private_key_id:'FAKE_KEY_1234567',
        private_key:'-----BEGIN PRIVATE KEY-----\nTESTONLY\n-----END PRIVATE KEY-----\n'
    };
    const env={
        SITE_ID:'b1680059-2ea4-4120-9f29-62c4298f9ef7',
        SITE_NAME:'mobo-push-qa',URL:ORIGIN,
        MOBO_NETLIFY_QA_PREVIEW:'YES',MOBO_AUTO_MODE:'PREVIEW',
        MOBO_AUTO_KIND:'SCHEDULE',MOBO_PREVIEW_CLOCK:'NOW',
        MOBO_AUTO_LIVE_CONFIRM:'NO',
        MOBO_QA_SCHEDULE_PROFILE:'READ_ONLY_FUTURE',
        MOBO_QA_NETLIFY_APPROVAL:'NOT_DEPLOYED',
        MOBO_AUTO_TEST_UID:uid,
        MOBO_FIREBASE_SERVICE_ACCOUNT:JSON.stringify({
            project_id:PROJECT,client_email:'mobo-qa-readonly@mobo-qa-2026.iam.gserviceaccount.com'
        }),
        MOBO_QA_SEND_SA_JSON:JSON.stringify(credential),
        MOBO_QA_SENDER_PREFLIGHT:'OFF',
        MOBO_QA_FCM_VALIDATE_ONLY:'YES'
    };
    let sends=0, reads=[];
    const fakeClient=async provided=>{
        assert.equal(provided.client_email,EMAIL);
        return {
            db:{collection(name){
                assert.ok(['pushSubscriptions','pushSchedules'].includes(name));
                return {doc(id){
                    assert.equal(id,uid);
                    return {async get(){
                        reads.push(name);
                        return {
                            id,exists:true,data:()=>name==='pushSubscriptions'?
                                {enabled:true,timezone:'Asia/Seoul',token}: {days:[]}
                        };
                    }};
                }};
            }},
            messaging:{async send(message,dryRun){
                sends++;
                assert.equal(dryRun,true);
                assert.equal(message.token,token);
                assert.equal(message.webpush.fcmOptions.link,ORIGIN+'/');
                return 'projects/mobo-qa-2026/messages/FAKE_DRY_RUN';
            }}
        };
    };
    const result=await moboValidateQAFcmWithoutDelivery({
        env,createClient:fakeClient
    });
    assert.deepEqual(result,{
        status:'FCM_VALIDATE_ONLY_OK',project:'QA',
        validatedAccounts:1,notificationSent:false,
        firestoreWrites:0,claimsCreated:0
    });
    assert.equal(sends,1);
    assert.deepEqual(reads.sort(),['pushSchedules','pushSubscriptions']);
    assert.equal(JSON.stringify(result).includes(token),false);
    console.log('PASS: one QA test UID, FCM dryRun=true, no writes or delivery');

    for(const mutation of [
        {MOBO_QA_FCM_VALIDATE_ONLY:'OFF'},
        {MOBO_QA_FCM_VALIDATE_ONLY:undefined},
        {MOBO_QA_SENDER_PREFLIGHT:'AUTH_READ_ONLY'},
        {MOBO_QA_SEND_ACTIVE:'YES'},
        {MOBO_QA_SEND_MODE:'QA_LIVE'},
        {MOBO_AUTO_MODE:'LIVE'},
        {MOBO_AUTO_LIVE_CONFIRM:'YES'},
        {SITE_ID:'invalid-qa-site'},
        {MOBO_QA_SEND_SA_JSON:JSON.stringify({...credential,project_id:'not-qa'})},
        {MOBO_QA_SEND_SA_JSON:JSON.stringify({...credential,client_email:
            'mobo-qa-readonly@mobo-qa-2026.iam.gserviceaccount.com'})}
    ]) {
        await assert.rejects(
            moboValidateQAFcmWithoutDelivery({
                env:{...env,...mutation},
                createClient:async()=>{throw Error('UNSAFE_CLIENT_CALLED');}
            }),/QA|Netlify/);
    }
    assert.equal(sends,1);
    console.log('PASS: other sites, wrong sender, LIVE, missing opt-in blocked');

    const noToken=async()=>({
        db:{collection(name){return {doc(id){return {async get(){
            return {id,exists:true,data:()=>name==='pushSubscriptions'?
                {enabled:true,timezone:'Asia/Seoul',token:'SHORT'}:{days:[]}};
        }}}}}},
        messaging:{async send(){throw Error('FCM_SHOULD_NOT_BE_CALLED');}}
    });
    await assert.rejects(
        moboValidateQAFcmWithoutDelivery({env,createClient:noToken}),
        /QA_FCM_TEST_TOKEN_INVALID/
    );
    const fcmError=async()=>({
        ...(await fakeClient(credential)),
        messaging:{async send(message,dryRun){
            assert.equal(dryRun,true);
            throw Error('FCM_FAKE_REJECTION');
        }}
    });
    await assert.rejects(
        moboValidateQAFcmWithoutDelivery({env,createClient:fcmError}),
        /FCM_FAKE_REJECTION/
    );
    const fs=require('node:fs'),path=require('node:path');
    assert.equal(fs.existsSync(path.resolve(
        __dirname,'../netlify/functions/mobo-qa-readonly.mjs')),false);
    assert.ok(fs.readFileSync(__filename,'utf8')
        .includes('messaging.send(message, true)'));
    console.log('PASS: deployed wrapper opt-in only, literal true validation');
    console.log('QA-046D-40 OFFLINE PASS: no real Firebase/FCM calls');
}
if(require.main===module){
    runSelfTest().catch(e=>{
        console.error('QA-046D-40 offline failure:',e.code||e.message);
        process.exitCode=1;
    });
}
module.exports={
    validateQAFcmDryRunEnv,
    moboValidateQAFcmWithoutDelivery,
    moboRunQAFcmDryRunOnNetlify
};
