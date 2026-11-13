'use strict';

// QA-046D-27 | 실제 QA Firestore 쓰기 검증을 위한 격리·정리 계약.
// 단독 실행은 메모리 Firestore만 사용. Firebase Admin SDK import 없음.
// 별도 승인 전에는 어떤 원격 쓰기 CLI / GitHub Actions 단계도 연결 금지.
const assert = require('node:assert/strict');
const {moboCheckpointDocId} = require('./mobo-auto-firestore-checkpoint.cjs');
const {moboCheckpointScope} = require('./mobo-auto-resume-checkpoint.cjs');
const {moboCreateFirestoreRunLease} = require('./mobo-auto-run-lease.cjs');
const {moboCreateFencedCheckpointStore} =
    require('./mobo-auto-fenced-checkpoint.cjs');

const QA_PROJECT = 'mobo-qa-2026';
const PROBE_ROOT = 'qaSchedulerWriteProbes';
const PROBE_UID = 'QaProbeSyntheticCursor_00000001';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function moboPlanQAWriteProbe({projectId, runId, scope}) {
    if(projectId !== QA_PROJECT) {
        throw new Error('QA 쓰기 실험 프로젝트 불일치');
    }
    if(typeof runId !== 'string' || !UUID_V4.test(runId)) {
        throw new Error('QA 쓰기 실험 고유 실행 ID 오류');
    }
    const key = moboCheckpointDocId(scope);
    const base = PROBE_ROOT + '/' + runId;
    return Object.freeze({
        projectId:QA_PROJECT,
        runId,
        scope,
        leaseCollection:base + '/leases',
        checkpointCollection:base + '/checkpoints',
        key,
        documentCount:2
    });
}

function moboCreateIsolatedProbeDB(db, plan) {
    if(!db || typeof db.collection !== 'function' ||
        typeof db.runTransaction !== 'function') {
        throw new Error('QA 쓰기 실험 DB API 오류');
    }
    const paths = Object.freeze({
        qaPushBatchLeases:plan.leaseCollection,
        qaPushBatchCheckpoints:plan.checkpointCollection
    });
    return {
        collection(name) {
            if(!Object.hasOwn(paths,name)) {
                throw new Error('QA 쓰기 실험 허용 외 컬렉션 접근 차단');
            }
            const col=db.collection(paths[name]);
            return {
                doc(id) {
                    if(id !== plan.key) {
                        throw new Error('QA 쓰기 실험 문서 경계 위반');
                    }
                    return col.doc(id);
                }
            };
        },
        runTransaction(callback) {
            return db.runTransaction(callback);
        }
    };
}

function checkProbeSnapshot(snap, expectedScope, type, owner) {
    if(!snap.exists) return false;
    const data=snap.data();
    if(!data || data.version !== 1 ||
        data.scope !== expectedScope) {
        throw new Error('QA 쓰기 실험 정리 중 다른 기록 발견: 삭제 중단');
    }
    if(type === 'lease' && data.owner !== owner) {
        throw new Error('QA 쓰기 실험 정리 중 다른 소유자 발견: 삭제 중단');
    }
    if(type === 'checkpoint' &&
        data.cursor !== PROBE_UID) {
        throw new Error('QA 쓰기 실험 정리 중 다른 커서 발견: 삭제 중단');
    }
    if(!snap.updateTime) {
        throw new Error('QA 쓰기 실험 문서 갱신 시각 없음: 삭제 중단');
    }
    return true;
}

// 후속 승인된 원격 실행에서도 실제 사용자 컬렉션을 건드리지 않도록
// 오직 격리된 2개 경로만 접근. 삭제는 updateTime precondition 사용.
// 이전의 동일 ID 문서가 있으면 덮어쓰기/삭제하지 않고 즉시 중단.
async function moboRunIsolatedWriteProbe({
    db, projectId, runId, scope, writesEnabled = false,
    clock = Date.now, nowISO = () => new Date(clock()).toISOString(),
    onAfterRelease = async () => {}
}) {
    if(writesEnabled !== true) {
        throw new Error('QA 쓰기 실험 원격 쓰기 잠김: 명시적 승인 필요');
    }
    if(typeof clock !== 'function' || typeof nowISO !== 'function' ||
        typeof onAfterRelease !== 'function') {
        throw new Error('QA 쓰기 실험 시계/테스트 설정 오류');
    }
    const plan=moboPlanQAWriteProbe({projectId,runId,scope});
    const mapped=moboCreateIsolatedProbeDB(db,plan);
    const leaseRef=db.collection(plan.leaseCollection).doc(plan.key);
    const checkpointRef=db.collection(plan.checkpointCollection).doc(plan.key);

    const originals=await Promise.all([leaseRef.get(),checkpointRef.get()]);
    if(originals.some(snapshot=>snapshot.exists)) {
        throw new Error('QA 쓰기 실험 동일 실행 문서 존재: 덮어쓰기 금지');
    }
    let token=null;
    let result=null;
    let probeError=null;
    let cleanupError=null;
    let cleanupCount=0;
    try {
        const lease=moboCreateFirestoreRunLease(mapped,{
            projectId:QA_PROJECT,writesEnabled:true,
            clock,leaseMs:20000
        });
        token=await lease.acquire(scope);
        if(!token) throw new Error('QA 쓰기 실험 잠금 획득 실패');
        const fenced=moboCreateFencedCheckpointStore(mapped,{
            projectId:QA_PROJECT,writesEnabled:true,token,clock,nowISO
        });
        assert.equal(await fenced.commit(scope,PROBE_UID),true);
        assert.equal(await fenced.finish(scope,PROBE_UID),true);
        assert.equal(await lease.release(scope,token),true);
        await onAfterRelease({plan});
        result={leaseTested:true,fencedCheckpointTested:true};
    }catch(error){
        probeError=error;
    }finally{
        // Lease 획득 후 서버 응답 실패를 포함해 부분 성공을 정리해야 한다.
        // 단, 다른 프로세스가 문서를 변경했다면 안전을 위해 삭제 중단.
        try{
            for(const [type,ref] of [
                ['checkpoint',checkpointRef],['lease',leaseRef]
            ]){
                const snap=await ref.get();
                if(!snap.exists) continue;
                if(!token) {
                    throw new Error('QA 쓰기 실험 기록 소유권 불명확: 삭제 중단');
                }
                checkProbeSnapshot(snap,scope,type,token.owner);
                await ref.delete({lastUpdateTime:snap.updateTime});
                cleanupCount++;
            }
            const remaining=await Promise.all([
                leaseRef.get(),checkpointRef.get()
            ]);
            if(remaining.some(s=>s.exists)) {
                throw new Error('QA 쓰기 실험 정리 후 문서 남음');
            }
        }catch(error){
            cleanupError=error;
        }
    }
    if(probeError && cleanupError) {
        throw new AggregateError([probeError,cleanupError],
            'QA 쓰기 실험/정리 모두 실패: 수동 검토 필요');
    }
    if(cleanupError) throw cleanupError;
    if(probeError) throw probeError;
    return Object.freeze({
        ...result,cleaned:cleanupCount===2,
        deletedDocs:cleanupCount,project:'QA'
    });
}

// Memory-only Firestore API with transaction serialization and optimistic
// delete preconditions. Real Firestore may retry transactions on conflict;
// the contract only verifies expected invariants, not real IAM permissions.
function makeMemoryFirestore() {
    const items=new Map();
    const stats={writes:0,deletes:0,transactions:0};
    let serial=Promise.resolve();
    let failNthTransaction=0;
    let beforeDelete=null;
    function ref(path,id) {
        if(!path.startsWith(PROBE_ROOT+'/')) {
            throw new Error('SIMULATED_UNAUTHORIZED_COLLECTION');
        }
        const key=path+'/'+id;
        return {
            path:key,
            async get() {
                const value=items.get(key);
                return {
                    exists:Boolean(value),
                    data:()=>value ? {...value.data}:undefined,
                    updateTime:value?.updateTime
                };
            },
            async delete(opts) {
                if(beforeDelete) await beforeDelete(key);
                const prior=items.get(key);
                if(!prior || prior.updateTime!==opts?.lastUpdateTime) {
                    throw new Error('SIMULATED_DELETE_PRECONDITION_CONFLICT');
                }
                items.delete(key);stats.deletes++;
            }
        };
    }
    return {
        items,stats,
        setFailNthTransaction(n){failNthTransaction=n;},
        setBeforeDelete(fn){beforeDelete=fn;},
        db:{
            collection(path) {
                return {doc(id) {return ref(path,id);}};
            },
            runTransaction(callback) {
                const run=async()=>{
                    stats.transactions++;
                    if(stats.transactions===failNthTransaction) {
                        throw new Error('SIMULATED_FIRESTORE_TRANSACTION_ERROR');
                    }
                    const updates=[];
                    const tx={
                        get:ref=>ref.get(),
                        set(ref,data){updates.push([ref.path,{...data}]);}
                    };
                    const result=await callback(tx);
                    for(const [key,data] of updates) {
                        items.set(key,{
                            data,updateTime:stats.writes+1
                        });
                        stats.writes++;
                    }
                    return result;
                };
                const pending=serial.then(run);
                serial=pending.then(()=>{},()=>{});
                return pending;
            }
        }
    };
}

async function runSelfTest() {
    const uuid='00000000-0000-4000-8000-000000000001';
    const tick=Date.parse('2026-11-12T22:05:00+09:00');
    const scope=moboCheckpointScope('2026-11-12','serial',tick);
    const p=moboPlanQAWriteProbe({
        projectId:QA_PROJECT,runId:uuid,scope
    });
    assert.equal(p.documentCount,2);
    assert.ok(p.leaseCollection.startsWith(PROBE_ROOT+'/'+uuid));
    assert.notEqual(p.leaseCollection,p.checkpointCollection);
    assert.equal(p.key.length,64);
    for(const bad of [
        {projectId:'mobo-web-2026',runId:uuid,scope},
        {projectId:QA_PROJECT,runId:'not-uuid',scope},
        {projectId:QA_PROJECT,runId:uuid,scope:'invalid'}
    ]) assert.throws(()=>moboPlanQAWriteProbe(bad),
        /프로젝트|실행 ID|scope/);
    console.log('PASS: QA 프로젝트·랜덤 실행 ID·격리된 두 문서만 허용');

    const fake=makeMemoryFirestore();
    await assert.rejects(moboRunIsolatedWriteProbe({
        db:fake.db,projectId:QA_PROJECT,runId:uuid,scope
    }),/원격 쓰기 잠김/);
    assert.equal(fake.stats.writes,0);
    assert.equal(fake.items.size,0);
    console.log('PASS: 별도 승인 전 쓰기 기본 잠금·아무 문서도 생성 안 함');

    const success=await moboRunIsolatedWriteProbe({
        db:fake.db,projectId:QA_PROJECT,runId:uuid,scope,
        writesEnabled:true,clock:()=>tick,
        nowISO:()=>new Date(tick).toISOString()
    });
    assert.deepEqual(success,{
        leaseTested:true,fencedCheckpointTested:true,
        cleaned:true,deletedDocs:2,project:'QA'
    });
    assert.equal(fake.items.size,0);
    assert.equal(fake.stats.writes,4); // lease acquire / checkpoint commit+finish / release
    assert.equal(fake.stats.deletes,2);
    console.log('PASS: 잠금 획득→체크포인트 처리→해제→QA 문서 2개 삭제');

    // Preexisting document should never be modified or deleted.
    const collision=makeMemoryFirestore();
    const already=p.leaseCollection+'/'+p.key;
    collision.items.set(already,{
        data:{version:1,scope,owner:'somebody-else'},
        updateTime:1
    });
    await assert.rejects(moboRunIsolatedWriteProbe({
        db:collision.db,projectId:QA_PROJECT,runId:uuid,scope,
        writesEnabled:true,clock:()=>tick
    }),/동일 실행 문서 존재/);
    assert.equal(collision.items.size,1);
    assert.equal(collision.stats.writes,0);
    assert.equal(collision.stats.deletes,0);
    console.log('PASS: 실행 ID 충돌 시 기존 문서 수정·삭제 거부');

    const partial=makeMemoryFirestore();
    partial.setFailNthTransaction(2);
    await assert.rejects(moboRunIsolatedWriteProbe({
        db:partial.db,projectId:QA_PROJECT,runId:uuid,scope,
        writesEnabled:true,clock:()=>tick
    }),/SIMULATED_FIRESTORE_TRANSACTION_ERROR/);
    assert.equal(partial.items.size,0);
    assert.equal(partial.stats.deletes,1);
    console.log('PASS: 체크포인트 저장 실패 시 선행 잠금 문서만 회수');

    // A malicious/stale outsider replacement before cleanup must NOT be deleted.
    const tampered=makeMemoryFirestore();
    await assert.rejects(moboRunIsolatedWriteProbe({
        db:tampered.db,projectId:QA_PROJECT,runId:uuid,scope,
        writesEnabled:true,clock:()=>tick,
        onAfterRelease:async ({plan})=>{
            const id=plan.leaseCollection+'/'+plan.key;
            const prior=tampered.items.get(id);
            tampered.items.set(id,{
                data:{...prior.data,owner:'other-runner'},
                updateTime:999
            });
        }
    }),/다른 소유자/);
    assert.equal(tampered.items.size,1); // do not delete changed lease
    assert.equal(tampered.stats.deletes,1); // own checkpoint deleted
    console.log('PASS: 다른 소유자가 기록 변경 시 삭제 중단·검토 필요 판정');

    // Retry with a fresh id cannot interact with the previous one's records.
    const other=moboPlanQAWriteProbe({
        projectId:QA_PROJECT,
        runId:'00000000-0000-4000-8000-000000000002',scope
    });
    assert.notEqual(other.leaseCollection,p.leaseCollection);
    assert.notEqual(other.checkpointCollection,p.checkpointCollection);
    const sandbox=moboCreateIsolatedProbeDB(fake.db,p);
    assert.throws(()=>sandbox.collection('pushSubscriptions'),/허용 외/);
    assert.throws(()=>sandbox.collection('pushDeliveryClaims'),/허용 외/);
    assert.throws(()=>sandbox.collection('qaPushBatchLeases')
        .doc('different-id'),/문서 경계/);
    console.log('PASS: 타 사용자 구독·일정·발송 claim 컬렉션 접근 차단');

    console.log('QA-046D-27 · QA Firebase 쓰기/정리 계약 메모리 PASS');
    console.log('실제 Firebase SDK 호출/원격 문서 생성/삭제: 없음');
    console.log('실제 실행 경로는 사용자 승인 전 미연결');
}
if(require.main===module) {
    runSelfTest().catch(error=>{
        console.error('QA-046D-27 실패:',error.message);
        process.exitCode=1;
    });
}
module.exports={
    moboPlanQAWriteProbe,
    moboCreateIsolatedProbeDB,
    moboRunIsolatedWriteProbe
};
