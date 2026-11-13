'use strict';

// QA-046D-24 | Firestore checkpoint 쓰기와 lease generation 검증을
// 하나의 트랜잭션에서 시행하는 방어 계층.
// 단독 실행: 메모리 Firebase 에뮬레이터, 실제 읽기/쓰기/FCM 없음.
// 실서버 연결 및 원격 쓰기 기본 잠금 상태 유지.
const assert = require('node:assert/strict');
const {moboCheckpointDocId} =
    require('./mobo-auto-firestore-checkpoint.cjs');
const {moboCreateFirestoreRunLease, moboWithRunLease} =
    require('./mobo-auto-run-lease.cjs');
const {moboCheckpointScope, moboRunResumableBatch} =
    require('./mobo-auto-resume-checkpoint.cjs');
const {moboAssertScopedUID} =
    require('./mobo-auto-source-scope.cjs');
const {makeFakeFirebase} =
    require('./mobo-auto-pipeline-integration.cjs');

const QA_PROJECT = 'mobo-qa-2026';
const CHECKPOINT_COLLECTION = 'qaPushBatchCheckpoints';
const LEASE_COLLECTION = 'qaPushBatchLeases';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function moboValidFencingToken(token) {
    if (!token || typeof token !== 'object' ||
        typeof token.owner !== 'string' ||
        !UUID.test(token.owner) ||
        !Number.isSafeInteger(token.generation) ||
        token.generation < 1) {
        throw new Error('QA fencing 소유 토큰 오류');
    }
    return {owner: token.owner, generation: token.generation};
}

function validateRecord(value, scope) {
    if (!value || typeof value !== 'object' ||
        value.version !== 1 ||
        value.scope !== scope ||
        typeof value.completed !== 'boolean' ||
        !Object.hasOwn(value, 'cursor')) {
        throw new Error('QA fenced checkpoint 저장값 오류');
    }
    if (value.cursor !== null) moboAssertScopedUID(value.cursor);
    return {cursor: value.cursor, completed: value.completed};
}

function moboCreateFencedCheckpointStore(db, opts = {}) {
    const {
        projectId,
        writesEnabled = false,
        token,
        clock = Date.now,
        nowISO = () => new Date().toISOString()
    } = opts;
    if (projectId !== QA_PROJECT) {
        throw new Error('QA fenced checkpoint Firebase 프로젝트 불일치');
    }
    if (!db || typeof db.collection !== 'function' ||
        typeof db.runTransaction !== 'function' ||
        typeof writesEnabled !== 'boolean' ||
        typeof clock !== 'function' ||
        typeof nowISO !== 'function') {
        throw new Error('QA fenced checkpoint 설정 오류');
    }
    const owner = moboValidFencingToken(token);

    function refs(scope) {
        // checkpoint scope를 해시로 변환하면서 날짜/종류/tick 형식 확인
        const key = moboCheckpointDocId(scope);
        return {
            checkpoint: db.collection(CHECKPOINT_COLLECTION).doc(key),
            lease: db.collection(LEASE_COLLECTION).doc(key)
        };
    }
    function now() {
        const time = clock();
        if (!Number.isSafeInteger(time) || time < 0) {
            throw new Error('QA fenced checkpoint 기준 시간 오류');
        }
        return time;
    }
    function assertAllowed() {
        if (writesEnabled !== true) {
            throw new Error('QA fenced checkpoint 실제 쓰기 잠금: 승인 필요');
        }
    }
    function ensureOwner(snap, scope) {
        if (!snap?.exists) {
            throw new Error('QA fencing 소유권 없음: lease 문서 누락');
        }
        const value = snap.data();
        if (!value || value.version !== 1 ||
            value.scope !== scope || value.status !== 'active' ||
            value.owner !== owner.owner ||
            value.generation !== owner.generation ||
            !Number.isSafeInteger(value.expiresAt) ||
            value.expiresAt <= now()) {
            throw new Error('QA fencing 소유권 상실: checkpoint 쓰기 차단');
        }
    }
    function makeRecord(scope, cursor, completed) {
        const updatedAt = nowISO();
        if (typeof updatedAt !== 'string' ||
            !Number.isFinite(Date.parse(updatedAt))) {
            throw new Error('QA fenced checkpoint 기록 시각 오류');
        }
        return {
            version: 1, scope, cursor, completed, updatedAt
        };
    }

    return {
        async load(scope) {
            // 읽기 전용 load는 외부 효과 없음. 페이지 쓰기는 항상 아래
            // tx.get(lease) + tx.get(checkpoint)에서 소유권 다시 확인.
            const {checkpoint} = refs(scope);
            const snap = await checkpoint.get();
            return snap.exists ? validateRecord(snap.data(), scope) : null;
        },

        async commit(scope, cursor) {
            assertAllowed();
            moboAssertScopedUID(cursor);
            const {checkpoint, lease} = refs(scope);
            return db.runTransaction(async tx => {
                // Firestore는 둘 다 같은 transaction 안에서 조회하여
                // 잠금 승계와 checkpoint 갱신 사이의 충돌을 감지한다.
                const leaseSnap = await tx.get(lease);
                const priorSnap = await tx.get(checkpoint);
                ensureOwner(leaseSnap, scope);
                const prior = priorSnap.exists
                    ? validateRecord(priorSnap.data(), scope)
                    : {cursor: null, completed: false};
                if (prior.completed ||
                    (prior.cursor !== null && cursor <= prior.cursor)) {
                    return false;
                }
                tx.set(checkpoint, makeRecord(scope, cursor, false));
                return true;
            });
        },

        async finish(scope, cursor) {
            assertAllowed();
            if (cursor !== null) moboAssertScopedUID(cursor);
            const {checkpoint, lease} = refs(scope);
            return db.runTransaction(async tx => {
                const leaseSnap = await tx.get(lease);
                const priorSnap = await tx.get(checkpoint);
                ensureOwner(leaseSnap, scope);
                const prior = priorSnap.exists
                    ? validateRecord(priorSnap.data(), scope)
                    : {cursor: null, completed: false};
                if (prior.completed) return false;
                if (prior.cursor !== null &&
                    (cursor === null || cursor < prior.cursor)) {
                    throw new Error('QA fenced checkpoint 커서 역행 차단');
                }
                tx.set(checkpoint, makeRecord(scope, cursor, true));
                return true;
            });
        }
    };
}

async function runSelfTest() {
    const date = '2026-11-12';
    const t = time => Date.parse(date + 'T' + time + ':00+09:00');
    const tick = t('22:05');
    const scope = moboCheckpointScope(date, 'serial', tick);
    const source = makeFakeFirebase(12);
    let now = tick;
    const lease = moboCreateFirestoreRunLease(source.db, {
        projectId: QA_PROJECT, writesEnabled: true,
        clock: () => now, leaseMs: 20000
    });

    const tokenA = await lease.acquire(scope);
    assert.ok(tokenA);
    const common = {
        projectId: QA_PROJECT, token: tokenA,
        clock: () => now, nowISO: () => new Date(now).toISOString()
    };
    const locked = moboCreateFencedCheckpointStore(source.db, common);
    await assert.rejects(locked.commit(scope, 'QaUser_000001'),
        /실제 쓰기 잠금/);
    await assert.rejects(locked.finish(scope, null),
        /실제 쓰기 잠금/);
    assert.equal(await locked.load(scope), null);
    assert.throws(() => moboCreateFencedCheckpointStore(source.db, {
        ...common, projectId: 'mobo-production', writesEnabled: true
    }), /프로젝트 불일치/);
    assert.throws(() => moboCreateFencedCheckpointStore(source.db, {
        ...common, token: {owner:'invalid',generation:1}
    }), /토큰 오류/);
    console.log('PASS: 기본 쓰기 잠금·QA 프로젝트·소유 토큰 검증');

    const storeA = moboCreateFencedCheckpointStore(source.db, {
        ...common, writesEnabled: true
    });
    assert.equal(await storeA.commit(scope, 'QaUser_000004'), true);
    assert.deepEqual(await storeA.load(scope), {
        cursor:'QaUser_000004', completed:false
    });
    assert.equal(await storeA.commit(scope, 'QaUser_000003'), false);
    console.log('PASS: 유효한 lease로만 커서 전진, 커서 역행은 차단');

    // 사전에 verify가 true였어도 commit 직전 lease가 만료될 수 있다.
    assert.equal(await lease.verify(scope,tokenA),true);
    now += 21000;
    const tokenB = await lease.acquire(scope);
    assert.equal(tokenB.generation, tokenA.generation + 1);
    const snapshotBefore = source.fakeCheckpointCount ??
        source.collections.get(CHECKPOINT_COLLECTION).size;
    await assert.rejects(storeA.commit(scope,'QaUser_000008'),
        /소유권 상실/);
    await assert.rejects(storeA.finish(scope,'QaUser_000008'),
        /소유권 상실/);
    assert.equal(source.collections.get(CHECKPOINT_COLLECTION).size,
        snapshotBefore);
    assert.equal((await storeA.load(scope)).cursor,'QaUser_000004');
    console.log('PASS: lease 검증 직후 승계돼도 원자적 transaction이 이전 소유자 쓰기 차단');

    const storeB = moboCreateFencedCheckpointStore(source.db, {
        ...common, token:tokenB, writesEnabled: true
    });
    assert.equal(await storeB.commit(scope, 'QaUser_000009'), true);
    assert.equal(await storeB.finish(scope, 'QaUser_000009'), true);
    assert.equal(await storeB.commit(scope,'QaUser_000011'), false);
    assert.equal((await storeB.load(scope)).completed,true);
    console.log('PASS: 후임 서버 체크포인트 완료·구서버 덮어쓰기 방지');

    // 실행기에서 두 번째 callback 인자로 실제 소유 token이 전달되는지,
    // 기존 중단 복구 엔진이 fencedStore와 호환되는지 확인.
    const nextTick = t('22:10');
    const anotherScope = moboCheckpointScope(date,'expire',nextTick);
    now = nextTick;
    const seen = new Set();
    const runner = await moboWithRunLease(
        lease,anotherScope,async (verify,token) => {
            const store = moboCreateFencedCheckpointStore(source.db,{
                projectId:QA_PROJECT, token, writesEnabled:true,
                clock:()=>now, nowISO:()=>new Date(now).toISOString()
            });
            return moboRunResumableBatch({
                db:source.db,store,date,kind:'expire',tickAt:nextTick,
                assertActive:verify,
                batchOptions:{
                    pageSize:4,maxPages:4,parallel:2,budgetMs:12000
                },
                visit:async doc=>{
                    await verify();
                    seen.add(doc.id);
                }
            });
        }
    );
    assert.equal(runner.skipped,false);
    assert.equal(runner.result.completed,true);
    assert.equal(seen.size,12);
    assert.equal(source.collections.get(CHECKPOINT_COLLECTION).size,2);
    assert.equal((await storeB.load(scope)).completed,true);
    console.log('PASS: 실제 lease token → fenced store → 기존 복구 배치 통합');

    // 저장 기록이 손상되면 자동 초기화 대신 차단.
    const damagedScope = moboCheckpointScope(date,'attendance',nextTick);
    const damagedToken = await lease.acquire(damagedScope);
    const damagedStore = moboCreateFencedCheckpointStore(source.db,{
        projectId:QA_PROJECT,token:damagedToken,writesEnabled:true,
        clock:()=>now
    });
    source.collections.get(CHECKPOINT_COLLECTION).set(
        moboCheckpointDocId(damagedScope),
        {version:1,scope:'WRONG_SCOPE',cursor:null,completed:false}
    );
    await assert.rejects(damagedStore.commit(damagedScope,'QaUser_000002'),
        /저장값 오류/);
    assert.equal(await lease.release(damagedScope,damagedToken),true);
    console.log('PASS: 비정상 checkpoint 기록도 fail-closed');

    console.log('QA-046D-24 · Firestore checkpoint atomic fencing PASS');
    console.log('주의: FCM 전송 자체는 DB transaction과 원자화할 수 없음');
    console.log('실제 Firebase/FCM/Netlify 접근·쓰기·배포 없음');
}

if (require.main === module) {
    runSelfTest().catch(error=>{
        console.error('QA-046D-24 실패:',error.message);
        process.exitCode=1;
    });
}
module.exports={moboCreateFencedCheckpointStore};
