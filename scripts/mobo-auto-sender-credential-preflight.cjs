'use strict';
// QA-046D-38: optional sender credentials diagnostic.
// Never sends FCM, creates a Firestore claim, or modifies user data.
const assert=require('node:assert/strict');
const {moboAssertQANetlifyReadOnlyConfig}=
    require('./mobo-auto-netlify-runtime-identity.cjs');
const {moboReadScopedSources}=require('./mobo-auto-source-scope.cjs');

const QA_PROJECT='mobo-qa-2026';
const QA_SENDER='mobo-qa-sender@mobo-qa-2026.iam.gserviceaccount.com';
const ENABLED='AUTH_READ_ONLY';

// Always perform identity checks before evaluating credential secrets.
function validateSenderPreflightEnvironment(env){
    moboAssertQANetlifyReadOnlyConfig(env);
    if (env.MOBO_QA_SENDER_PREFLIGHT!==ENABLED ||
        env.MOBO_QA_SEND_ACTIVE==='YES' ||
        env.MOBO_AUTO_MODE!=='PREVIEW' ||
        env.MOBO_AUTO_LIVE_CONFIRM!=='NO') {
        throw new Error('QA_SENDER_PREFLIGHT_NOT_ENABLED');
    }
    let sender;
    try {
        sender=JSON.parse(env.MOBO_QA_SEND_SA_JSON);
    } catch {
        throw new Error('QA_SENDER_JSON_INVALID');
    }
    if (!sender || sender.type!=='service_account' ||
        sender.project_id!==QA_PROJECT ||
        sender.client_email!==QA_SENDER ||
        typeof sender.private_key!=='string' ||
        !sender.private_key.startsWith('-----BEGIN PRIVATE KEY-----\n') ||
        !sender.private_key.includes('\n-----END PRIVATE KEY-----') ||
        typeof sender.private_key_id!=='string' ||
        sender.private_key_id.length<8) {
        throw new Error('QA_SENDER_ACCOUNT_IDENTITY_OR_KEY_INVALID');
    }
    return sender;
}

async function moboProbeQASenderCredentialReadOnly({
    env,credentialFactory,dbFactory
}){
    // The scheduled wrapper only runs this on explicit opt-in.
    const sender=validateSenderPreflightEnvironment(env);
    if(typeof credentialFactory!=='function' ||
       typeof dbFactory!=='function'){
        throw new Error('QA_SENDER_PREFLIGHT_ADAPTER_INVALID');
    }
    const credential=credentialFactory(sender);
    if(!credential || typeof credential.getAccessToken!=='function'){
        throw new Error('QA_SENDER_CREDENTIAL_INVALID');
    }
    // OAuth token minting verifies the private key can authenticate.
    // The OAuth access token must NEVER be logged or returned.
    const token=await credential.getAccessToken();
    if(!token || typeof token.access_token!=='string' ||
        token.access_token.length<20 ||
        !Number.isFinite(token.expires_in) || token.expires_in<=0){
        throw new Error('QA_SENDER_OAUTH_INVALID');
    }
    // Same credential, restricted Firestore read of only two documents.
    const db=await dbFactory(sender,credential);
    const {subscriptions,schedules}=await moboReadScopedSources(
        db,env.MOBO_AUTO_TEST_UID
    );
    if(subscriptions.size!==1 || schedules.size!==1){
        throw new Error('QA_SENDER_SCOPED_DOCUMENTS_NOT_FOUND');
    }
    return Object.freeze({
        status:'AUTH_AND_FIRESTORE_READ_OK',
        project:'QA',
        scopedDocuments:2,
        fcm:'NOT_TESTED',
        firestoreWrite:'NOT_TESTED',
        readOnly:true
    });
}

// Self test uses fake credentials and an in-memory database ONLY.
async function runSelfTest(){
    const uid='GalaxyQaSenderUnit_1234567890';
    const sourceEnv={
        SITE_ID:'b1680059-2ea4-4120-9f29-62c4298f9ef7',
        SITE_NAME:'mobo-push-qa',
        URL:'https://mobo-push-qa.netlify.app',
        MOBO_NETLIFY_QA_PREVIEW:'YES',
        MOBO_AUTO_MODE:'PREVIEW',
        MOBO_AUTO_KIND:'SCHEDULE',
        MOBO_PREVIEW_CLOCK:'NOW',
        MOBO_AUTO_LIVE_CONFIRM:'NO',
        MOBO_QA_SCHEDULE_PROFILE:'READ_ONLY_FUTURE',
        MOBO_QA_NETLIFY_APPROVAL:'NOT_DEPLOYED',
        MOBO_AUTO_TEST_UID:uid,
        MOBO_FIREBASE_SERVICE_ACCOUNT:JSON.stringify({
            project_id:QA_PROJECT,
            client_email:'mobo-qa-readonly@mobo-qa-2026.iam.gserviceaccount.com'
        }),
        MOBO_QA_SENDER_PREFLIGHT:'AUTH_READ_ONLY',
        MOBO_QA_SEND_SA_JSON:JSON.stringify({
            type:'service_account',project_id:QA_PROJECT,
            client_email:QA_SENDER,private_key_id:'EXAMPLE_KEY_ID_1234',
            private_key:'-----BEGIN PRIVATE KEY-----\nFAKE_TEST_ONLY\n-----END PRIVATE KEY-----\n'
        })
    };
    let minted=0,reads=[];
    const mockCred=()=>({
        async getAccessToken(){
            minted++;
            return {access_token:'FAKE_ACCESS_TOKEN_12345678901234567890',
                    expires_in:3600};
        }
    });
    const mockDB=()=>({
        collection(col) {
            assert.ok(['pushSubscriptions','pushSchedules'].includes(col),
                'Only the two explicitly approved collections are readable');
            return {
                get(){throw Error('FORBIDDEN_COLLECTION_SCAN');},
                doc(target){
                    assert.equal(target,uid);
                    return {async get(){
                        reads.push(col);
                        return {id:uid,exists:true,data:()=>({})};
                    }};
                }
            };
        }
    });
    const run=(env,cred=mockCred,db=mockDB)=>
        moboProbeQASenderCredentialReadOnly({
            env,credentialFactory:cred,dbFactory:db
        });
    const result=await run(sourceEnv);
    assert.deepEqual(result,{
        status:'AUTH_AND_FIRESTORE_READ_OK',
        project:'QA',scopedDocuments:2,
        fcm:'NOT_TESTED',firestoreWrite:'NOT_TESTED',readOnly:true
    });
    assert.equal(minted,1);
    assert.deepEqual(reads.sort(),['pushSchedules','pushSubscriptions']);
    assert.equal(JSON.stringify(result).includes('TOKEN'),false);
    console.log('PASS: OAuth credential and QA one-UID reads, no secret logging');

    for(const bad of [
        {MOBO_QA_SENDER_PREFLIGHT:undefined},
        {MOBO_QA_SENDER_PREFLIGHT:'LIVE'},
        {MOBO_QA_SEND_ACTIVE:'YES'},
        {SITE_ID:'wrong-netlify-site'},
        {MOBO_AUTO_MODE:'LIVE'},
        {MOBO_AUTO_LIVE_CONFIRM:'YES'},
        {MOBO_QA_SEND_SA_JSON:'invalid'},
        {MOBO_QA_SEND_SA_JSON:JSON.stringify({
            ...JSON.parse(sourceEnv.MOBO_QA_SEND_SA_JSON),
            client_email:'mobo-qa-readonly@mobo-qa-2026.iam.gserviceaccount.com'
        })},
        {MOBO_QA_SEND_SA_JSON:JSON.stringify({
            ...JSON.parse(sourceEnv.MOBO_QA_SEND_SA_JSON),
            project_id:'mobo-demo'
        })}
    ]) {
        await assert.rejects(run({...sourceEnv,...bad}),
            /QA|Netlify/);
    }
    assert.equal(minted,1,'Invalid environments cannot mint OAuth tokens');
    console.log('PASS: production site, wrong account, LIVE, missing opt-in => blocked');

    await assert.rejects(run(sourceEnv,()=>({
        async getAccessToken(){return {access_token:'x',expires_in:1};}
    })),/QA_SENDER_OAUTH_INVALID/);
    await assert.rejects(run(sourceEnv,mockCred,()=>({
        collection(){return {doc(){return {async get(){
            return {exists:false};
        }}}}}
    })),/QA_SENDER_SCOPED_DOCUMENTS_NOT_FOUND/);
    console.log('PASS: failed authentication and missing QA documents => blocked');

    const deployed=require('node:fs').readFileSync(
        require('node:path').resolve(__dirname,
            '../netlify/functions/mobo-qa-readonly.mjs'),'utf8'
    );
    for(const forbidden of ['getMessaging(','.send(','.create(','.set(','.update(']){
        assert.equal(deployed.includes(forbidden),false,
            'No FCM/send/write is allowed in deployed scheduler');
    }
    assert.ok(deployed.includes("env.MOBO_QA_SENDER_PREFLIGHT === 'AUTH_READ_ONLY'"),
        'Explicit preflight opt-in required');
    console.log('PASS: Netlify 5-minute function stays read-only');
    console.log('QA-046D-38 PASS: memory only; actual sender OAuth remains untested');
}
if(require.main===module){
    runSelfTest().catch(error=>{
        console.error('QA-046D-38 failed:',error.code || error.message);
        process.exitCode=1;
    });
}
module.exports={
    validateSenderPreflightEnvironment,
    moboProbeQASenderCredentialReadOnly
};
