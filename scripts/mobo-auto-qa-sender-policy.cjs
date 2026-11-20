'use strict';

// QA-046Y | Separate Firebase sender credential for a single QA Galaxy.
// Pure validation only: no Firebase initialization, FCM, Firestore, or deploy.
const assert = require('node:assert/strict');
const SENDER_EMAIL = 'mobo-qa-sender@mobo-qa-2026.iam.gserviceaccount.com';
const PROJECT_ID = 'mobo-qa-2026';

function moboSelectScopedQACredential(env, mode) {
    if (!env || !['PREVIEW','LIVE'].includes(mode)) {
        throw new Error('QA Firebase 실행 모드가 올바르지 않습니다');
    }
    const live = mode === 'LIVE';
    const secret = live ?
        env.MOBO_QA_SEND_SA_JSON : env.MOBO_FIREBASE_SERVICE_ACCOUNT;
    if (typeof secret !== 'string' || !secret.trim()) {
        throw new Error(live ?
            'QA 전용 발송 계정 인증 정보 누락' : 'QA 조회 계정 인증 정보 누락');
    }
    let account;
    try {
        account = JSON.parse(secret);
    } catch {
        throw new Error('QA Firebase 인증 정보 형식 오류');
    }
    if (!account || account.project_id !== PROJECT_ID) {
        throw new Error('QA Firebase 프로젝트 불일치');
    }
    if (live && (
        account.client_email !== SENDER_EMAIL ||
        account.type !== 'service_account' ||
        typeof account.private_key !== 'string' ||
        !account.private_key.startsWith('-----BEGIN PRIVATE KEY-----\n') ||
        !account.private_key.includes('\n-----END PRIVATE KEY-----')
    )) {
        throw new Error('QA 전용 발송 서비스 계정 검증 실패');
    }
    // Never log the raw credential, key, token, or UID.
    return account;
}

function runSelfTest() {
    const base = {
        project_id:PROJECT_ID,
        client_email:SENDER_EMAIL,
        type:'service_account',
        private_key:'-----BEGIN PRIVATE KEY-----\nQA_FAKE\n-----END PRIVATE KEY-----\n'
    };
    const env = {
        MOBO_QA_SEND_SA_JSON:JSON.stringify(base),
        MOBO_FIREBASE_SERVICE_ACCOUNT:JSON.stringify({
            project_id:PROJECT_ID,
            client_email:'mobo-qa-readonly@mobo-qa-2026.iam.gserviceaccount.com'
        })
    };
    assert.equal(moboSelectScopedQACredential(env,'LIVE').client_email,SENDER_EMAIL);
    assert.equal(moboSelectScopedQACredential(env,'PREVIEW').project_id,PROJECT_ID);
    for (const [override,mode] of [
        [{MOBO_QA_SEND_SA_JSON:''},'LIVE'],
        [{MOBO_QA_SEND_SA_JSON:'not-json'},'LIVE'],
        [{MOBO_QA_SEND_SA_JSON:env.MOBO_FIREBASE_SERVICE_ACCOUNT},'LIVE'],
        [{MOBO_QA_SEND_SA_JSON:JSON.stringify({...base,
            client_email:'other@example.test'})},'LIVE'],
        [{MOBO_QA_SEND_SA_JSON:JSON.stringify({...base,
            project_id:'mobo-main'})},'LIVE'],
        [{MOBO_QA_SEND_SA_JSON:JSON.stringify({...base,
            private_key:''})},'LIVE'],
        [{MOBO_FIREBASE_SERVICE_ACCOUNT:''},'PREVIEW'],
        [{MOBO_FIREBASE_SERVICE_ACCOUNT:JSON.stringify({
            project_id:'mobo-main'})},'PREVIEW']
    ]) {
        assert.throws(()=>moboSelectScopedQACredential({...env,...override},mode),/QA /);
    }
    assert.throws(()=>moboSelectScopedQACredential(env,'UNKNOWN'),/QA /);
    console.log('QA-046Y PASS: PREVIEW read credential; LIVE dedicated sender only');
    console.log('PASS: wrong project, read-only sender, missing key and invalid config denied');
    console.log('Zero Firebase/FCM/Firestore access; no secret output');
}

if (require.main === module) runSelfTest();
module.exports={moboSelectScopedQACredential,SENDER_EMAIL,PROJECT_ID};
