'use strict';

// QA-046D-26 | Firebase QA 실제 '읽기 전용' 트랜잭션 사전 점검.
// --qa-read일 때만 정확히 하나의 QA UID와 현재 tick 체크포인트
// 총 4개 문서를 읽는다. Firestore writes, messaging, collection scans 없음.
// Secret·UID·token·원문·체크포인트 문서 ID를 로그에 내보내지 않는다.
// 이 테스트는 서비스 계정 IAM의 쓰기 권한 부재를 증명하지는 않는다.
const assert = require('node:assert/strict');
const {moboKSTDate} = require('./mobo-scheduler-clock.cjs');
const {moboCheckpointScope} = require('./mobo-auto-resume-checkpoint.cjs');
const {moboCheckpointDocId} = require('./mobo-auto-firestore-checkpoint.cjs');
const {moboAssertScopedUID} = require('./mobo-auto-source-scope.cjs');
const {moboAssertNetlifyQAEnvironment} =
    require('./mobo-netlify-preview-adapter.cjs');

const QA_PROJECT = 'mobo-qa-2026';
const FIVE_MINUTES = 5 * 60 * 1000;
const READ_ONLY = Object.freeze({readOnly: true, maxAttempts: 1});

function moboReadOnlyTxnScope(now, kind = 'serial') {
    if (!Number.isSafeInteger(now) || now < 0) {
        throw new Error('QA 트랜잭션 현재 시각 오류');
    }
    if (!['serial','expire','attendance'].includes(kind)) {
        throw new Error('QA 트랜잭션 알림 종류 오류');
    }
    const tick = Math.floor(now / FIVE_MINUTES) * FIVE_MINUTES;
    return moboCheckpointScope(moboKSTDate(tick),kind,tick);
}

function ensureSnapshot(snapshot) {
    if (!snapshot || typeof snapshot.exists !== 'boolean') {
        throw new Error('QA 읽기 전용 트랜잭션 문서 응답 오류');
    }
    return snapshot.exists;
}

async function moboReadQAReadOnlyTransaction({
    db, uid, now, projectId
}) {
    if (projectId !== QA_PROJECT) {
        throw new Error('QA 트랜잭션 프로젝트 불일치');
    }
    moboAssertScopedUID(uid);
    if (!db || typeof db.collection !== 'function' ||
        typeof db.runTransaction !== 'function') {
        throw new Error('QA 트랜잭션 DB API 오류');
    }
    const scope = moboReadOnlyTxnScope(now);
    const scopeId = moboCheckpointDocId(scope);
    const refs = [
        db.collection('pushSubscriptions').doc(uid),
        db.collection('pushSchedules').doc(uid),
        db.collection('qaPushBatchLeases').doc(scopeId),
        db.collection('qaPushBatchCheckpoints').doc(scopeId)
    ];
    // Read-only Firestore transaction explicitly prevents this code path
    // from creating/changing/deleting any documents.
    const found = await db.runTransaction(async tx => {
        if (!tx || typeof tx.get !== 'function') {
            throw new Error('QA 트랜잭션 읽기 API 오류');
        }
        const snapshots = [];
        for(const ref of refs) {
            snapshots.push(await tx.get(ref));
        }
        return snapshots.map(ensureSnapshot);
    }, READ_ONLY);
    if (!Array.isArray(found) || found.length !== 4 ||
        found.some(v => typeof v !== 'boolean')) {
        throw new Error('QA 읽기 전용 트랜잭션 결과 오류');
    }
    return Object.freeze({
        mode: 'READ_ONLY_TRANSACTION',
        checkedDocs: 4,
        subscriptionFound: found[0],
        scheduleFound: found[1],
        leaseFound: found[2],
        checkpointFound: found[3]
    });
}

function fakeReadOnlyDB(uid, {failIndex = -1, records = [true,true,false,false]} = {}) {
    const reads=[];
    let txCalls=0;
    const db={
        collection(name) {
            assert.ok([
                'pushSubscriptions','pushSchedules',
                'qaPushBatchLeases','qaPushBatchCheckpoints'
            ].includes(name));
            return {
                get() { throw new Error('FORBIDDEN_WIDE_SCAN'); },
                doc(id) {
                    if(name === 'pushSubscriptions' || name === 'pushSchedules') {
                        assert.equal(id,uid);
                    } else {
                        assert.match(id,/^[a-f0-9]{64}$/);
                    }
                    return Object.freeze({name,id});
                }
            };
        },
        async runTransaction(callback, options) {
            txCalls++;
            assert.deepEqual(options,READ_ONLY);
            const tx=Object.freeze({
                async get(ref) {
                    const n=reads.length;
                    if(n===failIndex) throw new Error('QA_FIRESTORE_READ_FAILURE');
                    reads.push(ref.name);
                    return {exists:records[n] ?? false};
                }
            });
            return callback(tx);
        }
    };
    return {db,reads,getTransactions:()=>txCalls};
}

async function runSelfTest() {
    const uid='SyntheticQA_Galaxy_123456';
    const now=Date.parse('2026-11-13T09:05:00+09:00');
    const source=fakeReadOnlyDB(uid);
    const result=await moboReadQAReadOnlyTransaction({
        db:source.db,uid,now,projectId:QA_PROJECT
    });
    assert.deepEqual(result,{
        mode:'READ_ONLY_TRANSACTION',checkedDocs:4,
        subscriptionFound:true,scheduleFound:true,
        leaseFound:false,checkpointFound:false
    });
    assert.deepEqual(source.reads,[
        'pushSubscriptions','pushSchedules',
        'qaPushBatchLeases','qaPushBatchCheckpoints'
    ]);
    assert.equal(source.getTransactions(),1);
    assert.equal(Object.keys(result).some(x=>/uid|token|id/i.test(x)),false);
    console.log('PASS: QA 단일 UID·현재 tick 4개 문서만 읽는 readOnly transaction');

    // Late/early calls around midnight use KST and 5-minute boundaries.
    const before=Date.parse('2026-11-13T23:59:30+09:00');
    const after=Date.parse('2026-11-14T00:00:01+09:00');
    const prevScope=moboReadOnlyTxnScope(before);
    const nextScope=moboReadOnlyTxnScope(after);
    assert.notEqual(prevScope,nextScope);
    assert.ok(prevScope.includes('|2026-11-13|'));
    assert.ok(nextScope.includes('|2026-11-14|'));
    assert.notEqual(
        moboReadOnlyTxnScope(now,'serial'),
        moboReadOnlyTxnScope(now,'expire')
    );
    console.log('PASS: 자정·알림 종류별 tick scope 격리');

    const failing=fakeReadOnlyDB(uid,{failIndex:2});
    await assert.rejects(moboReadQAReadOnlyTransaction({
        db:failing.db,uid,now,projectId:QA_PROJECT
    }),/QA_FIRESTORE_READ_FAILURE/);
    assert.equal(failing.getTransactions(),1);
    console.log('PASS: Firestore 읽기 실패를 정상 0건으로 숨기지 않음');

    // Invalid project and malformed UID must fail before creating references.
    let accessed=0;
    const forbidden={
        collection(){accessed++;throw new Error('MUST_NOT_ACCESS_DB');},
        runTransaction(){accessed++;throw new Error('MUST_NOT_RUN_TX');}
    };
    for(const candidate of [
        {uid,projectId:'mobo-web-2026'},
        {uid:'',projectId:QA_PROJECT},
        {uid:'not/uid',projectId:QA_PROJECT}
    ]) {
        await assert.rejects(moboReadQAReadOnlyTransaction({
            db:forbidden,now,...candidate
        }),/프로젝트 불일치|전체 조회 차단/);
    }
    assert.equal(accessed,0);
    console.log('PASS: 본 서비스 프로젝트·잘못된 UID는 DB 접근 전 차단');

    assert.throws(()=>moboReadOnlyTxnScope(NaN),/시각/);
    assert.throws(()=>moboReadOnlyTxnScope(now,'unknown'),/종류/);
    const missing=fakeReadOnlyDB(uid,{
        records:[false,false,false,false]
    });
    const empty=await moboReadQAReadOnlyTransaction({
        db:missing.db,uid,now,projectId:QA_PROJECT
    });
    assert.equal(empty.checkedDocs,4);
    assert.equal(empty.subscriptionFound,false);
    assert.equal(empty.scheduleFound,false);
    console.log('PASS: 문서 없음과 트랜잭션 실패 상태 구분');

    console.log('QA-046D-26 · 실제 QA Firebase read-only tx 경로 모의 PASS');
    console.log('모의 테스트에는 외부 Firebase/FCM/Netlify 접근 없음');
}

// Remote read is opt-in from the staging GitHub QA action only.
// Initializes Firebase after strict preflight. No messaging SDK imported.
async function runQAReadOnly() {
    const env=process.env;
    if(env.GITHUB_REF!=='refs/heads/staging' ||
        env.MOBO_QA_TRANSACTION_MODE!=='READ_ONLY') {
        throw new Error('QA 트랜잭션 GitHub staging 읽기 전용 조건 오류');
    }
    moboAssertNetlifyQAEnvironment(env);
    const credentials=JSON.parse(env.MOBO_FIREBASE_SERVICE_ACCOUNT);
    assert.equal(credentials.project_id,QA_PROJECT);
    const {initializeApp,cert}=require('firebase-admin/app');
    const {getFirestore}=require('firebase-admin/firestore');
    const app=initializeApp({
        credential:cert(credentials),projectId:QA_PROJECT
    });
    try{
        const result=await moboReadQAReadOnlyTransaction({
            db:getFirestore(app),
            uid:env.MOBO_AUTO_TEST_UID,
            now:Date.now(),
            projectId:QA_PROJECT
        });
        // Aggregate metadata only: no IDs, user data or token in logs.
        console.log('QA 실제 Firebase transaction 읽기 완료');
        console.log('읽은 문서 참조 수:',result.checkedDocs);
        console.log('QA 구독/일정 존재:',
            result.subscriptionFound,result.scheduleFound);
        console.log('QA lease/checkpoint 문서 존재:',
            result.leaseFound,result.checkpointFound);
        console.log('실제 Firestore 쓰기/FCM 발송: 없음');
        console.log('주의: 실제 Firebase 서비스 계정의 IAM 쓰기권한은 별도 검토');
    }finally{
        await app.delete();
    }
}

if(require.main===module){
    (process.argv.includes('--qa-read')
        ? runQAReadOnly():runSelfTest())
        .catch(error=>{
            // Do not print raw Firebase error objects (may contain sensitive info).
            const safe=error?.message;
            const allowed=/^QA |^Firebase 프로젝트|^QA 트랜잭션|^Firebase 인증/.test(safe??'');
            console.error('QA-046D-26 실패:',
                allowed?safe:'읽기 전용 트랜잭션 검사 실패');
            process.exitCode=1;
        });
}

module.exports={
    moboReadOnlyTxnScope,
    moboReadQAReadOnlyTransaction
};
