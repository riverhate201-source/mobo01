'use strict';

// QA-046D-16 | 5분 실행 단위 체크포인트 / 재개 계약
// 이 파일은 메모리 검사 전용. Firestore 체크포인트 저장은 아직 연결하지 않음.
// 실제 FCM 전송, 원격 DB 읽기/쓰기, 사용자 데이터 접근 없음.
const assert = require('node:assert/strict');
const { moboRunBoundedBatch } = require('./mobo-auto-multiuser-batch.cjs');
const { moboAssertScopedUID } = require('./mobo-auto-source-scope.cjs');
const { moboKSTDate } = require('./mobo-scheduler-clock.cjs');
const { makeDeliveryKey, claimDeliveryOnce, markDeliverySent } =
    require('./mobo-push-dedupe.cjs');

const FIVE_MINUTES = 5 * 60 * 1000;
const TEST_VALIDATION_UID = 'MoboScopeTest_1234567';

// 날짜+종류만으로 묶으면 다음 5분 실행에서 새 대상자가 누락될 수 있음.
// 매 5분 tick을 독립 scope로 하되 그 tick이 실패한 경우에만 이어서 진행.
function moboCheckpointScope(date, kind, tickAt) {
    makeDeliveryKey(TEST_VALIDATION_UID, date, kind);
    if (!Number.isSafeInteger(tickAt) ||
        tickAt < 0 ||
        tickAt % FIVE_MINUTES !== 0 ||
        moboKSTDate(tickAt) !== date) {
        throw new Error('QA 체크포인트 시간/날짜 불일치');
    }
    return 'mobo-qa-v1|' + date + '|' + kind + '|' +
        new Date(tickAt).toISOString();
}

// 실제 저장은 반드시 원자적 비교·저장을 지원하는 외부 store로 연결.
// 여기서는 테스트 가능한 인메모리 store만 제공한다.
function moboCreateMemoryCheckpointStore() {
    const records = new Map();
    return {
        async load(scope) {
            const r = records.get(scope);
            return r ? { ...r } : null;
        },
        async commit(scope, cursor) {
            moboAssertScopedUID(cursor);
            const prev = records.get(scope);
            if (prev?.completed || (prev?.cursor && cursor <= prev.cursor)) {
                return false; // 늦게 완료된 작업으로 커서를 뒤로 되돌리지 않음
            }
            records.set(scope, {cursor, completed: false});
            return true;
        },
        async finish(scope, cursor) {
            if (cursor !== null) moboAssertScopedUID(cursor);
            const prev = records.get(scope);
            if (prev?.completed) return false;
            if (prev?.cursor && (!cursor || cursor < prev.cursor)) {
                throw new Error('QA 체크포인트 완료 커서 역행 차단');
            }
            records.set(scope, {cursor, completed: true});
            return true;
        }
    };
}

function validateCheckpointRecord(saved) {
    if (saved === null) return {cursor: null, completed: false};
    if (!saved || typeof saved !== 'object' ||
        typeof saved.completed !== 'boolean') {
        throw new Error('QA 체크포인트 저장값 형식 오류');
    }
    if (saved.cursor !== null) moboAssertScopedUID(saved.cursor);
    return {cursor: saved.cursor, completed: saved.completed};
}

// 이 함수는 batch를 호출하지만 FCM/Firestore를 직접 호출하지 않는다.
// 저장 오류가 발생하면 멈춘다. 부분 완료 작업은 영속 claim으로 중복 방지.
async function moboRunResumableBatch({
    db, visit, store, date, kind, tickAt, batchOptions = {}, clock = Date.now,
    assertActive = async () => {}
}) {
    const scope = moboCheckpointScope(date, kind, tickAt);
    if (typeof visit !== 'function' || typeof assertActive !== 'function') {
        throw new Error('QA 배치 작업/잠금 검증 콜백 오류');
    }
    if (!store || typeof store.load !== 'function' ||
        typeof store.commit !== 'function' ||
        typeof store.finish !== 'function') {
        throw new Error('QA 체크포인트 저장 계층 누락');
    }
    if (Object.hasOwn(batchOptions, 'startAfter') ||
        Object.hasOwn(batchOptions, 'onPageCommitted')) {
        throw new Error('QA 체크포인트 수동 커서 덮어쓰기 차단');
    }
    // QA-046D-23 | 만료된 lease의 작업이 이어서 실행되는 것을 방지.
    // 프로덕션에서는 체크포인트 쓰기와 fencing 비교를 같은 트랜잭션에
    // 묶어야 하며, 이 검사는 그 원자적 검사를 대체하지 않음.
    await assertActive();
    const state = validateCheckpointRecord(await store.load(scope));
    if (state.completed) {
        return { completed: true, alreadyCompleted: true, pages: 0 };
    }

    const result = await moboRunBoundedBatch(
        db,
        async doc => {
            await assertActive();
            await visit(doc);
            await assertActive();
        },
        {
            ...batchOptions,
            startAfter: state.cursor,
            onPageCommitted: async ({cursor}) => {
                await assertActive();
                const committed = await store.commit(scope, cursor);
                // 다른 실행이 먼저 앞으로 진행한 경우라도 현재 작업이
                // 완료된 것으로 착각하고 finish하지 않도록 중단
                if (committed !== true) {
                    throw new Error('QA 체크포인트 선행 실행 충돌: 재조회 필요');
                }
                await assertActive();
            }
        },
        clock
    );

    // 짧은 마지막 페이지 또는 빈 페이지까지 읽은 경우에만 tick 완료.
    // 저장 실패는 오류로 전파되어 다음 재시도에 진입하도록 한다.
    if (result.completed) {
        await assertActive();
        const saved = await store.finish(scope, result.cursor);
        if (saved !== true) {
            throw new Error('QA 체크포인트 완료 경쟁: 재조회 필요');
        }
        await assertActive();
    }
    return {...result, alreadyCompleted: false};
}

function makeSource(size) {
    const rows = Array.from({length:size}, (_,i) => ({
        id: 'QaUser_' + String(i).padStart(6, '0')
    }));
    let reads = 0;
    return {
        getReads: () => reads,
        collection(name) {
            assert.equal(name, 'pushSchedules');
            return {
                orderBy(key) {
                    assert.equal(key, '__name__');
                    let after = null;
                    const query = {
                        startAfter(id) { after = id; return query; },
                        limit(n) {
                            assert.ok(n <= 50);
                            return {
                                async get() {
                                    reads++;
                                    const start = after === null ? 0 :
                                        rows.findIndex(x => x.id > after);
                                    return {docs: start < 0 ? [] :
                                        rows.slice(start, start+n)};
                                }
                            };
                        }
                    };
                    return query;
                }
            };
        }
    };
}

function makeClaimsDB() {
    const docs = new Map();
    return {
        docs,
        collection(name) {
            assert.equal(name, 'pushDeliveryClaims');
            return {
                doc(id) {
                    return {
                        async create(record) {
                            if (docs.has(id)) {
                                const error = new Error('Already exists');
                                error.code = 6;
                                throw error;
                            }
                            docs.set(id, {...record});
                        },
                        async update(patch) {
                            assert.ok(docs.has(id));
                            docs.set(id, {...docs.get(id), ...patch});
                        }
                    };
                }
            };
        }
    };
}

async function runSelfTest() {
    const date = '2026-11-12';
    const kind = 'serial';
    const tickAt = Date.parse('2026-11-12T22:05:00+09:00');
    const nextTick = tickAt + FIVE_MINUTES;
    const scope = moboCheckpointScope(date, kind, tickAt);
    assert.notEqual(scope, moboCheckpointScope(date, kind, nextTick));
    assert.notEqual(scope, moboCheckpointScope(date, 'expire', tickAt));
    assert.throws(() => moboCheckpointScope(
        '2026-11-13', kind, tickAt
    ), /시간\/날짜/);
    assert.throws(() => moboCheckpointScope(
        date, kind, tickAt+1000
    ), /시간\/날짜/);
    assert.throws(() => moboCheckpointScope(
        date, 'SCHEDULE', tickAt
    ), /알림 종류/);
    console.log('PASS: 매 5분 실행·날짜·알림 종류별 체크포인트 격리');

    const store = moboCreateMemoryCheckpointStore();
    const source = makeSource(27);
    const claims = makeClaimsDB();
    const calls = new Map();
    let crash = true;

    async function sendOnce(doc) {
        calls.set(doc.id, (calls.get(doc.id) || 0) + 1);
        if (doc.id === 'QaUser_000012' && crash) {
            crash = false;
            throw new Error('SIMULATED_INTERRUPT');
        }
        if (await claimDeliveryOnce(claims, doc.id, date, kind)) {
            await markDeliverySent(claims, doc.id, date, kind);
        }
    }
    const opts = {
        db: source, visit: sendOnce, store, date, kind, tickAt,
        batchOptions: {pageSize:5, maxPages:6, parallel:1}
    };
    await assert.rejects(
        moboRunResumableBatch(opts),
        /SIMULATED_INTERRUPT/
    );
    assert.equal((await store.load(scope)).cursor, 'QaUser_000009');
    assert.equal((await store.load(scope)).completed, false);
    const retry = await moboRunResumableBatch(opts);
    assert.equal(retry.completed, true);
    assert.equal(claims.docs.size, 27);
    assert.equal(
        [...claims.docs.values()].filter(x => x.status === 'sent').length,
        27
    );
    assert.equal(
        [...calls.values()].reduce((a,b) => a+b, 0), 30
    ); // 미확정 페이지 10~12번 재방문, 완료 페이지 0~9번 제외
    assert.equal((await store.load(scope)).completed, true);
    const beforeSkipReads = source.getReads();
    const skipped = await moboRunResumableBatch(opts);
    assert.equal(skipped.alreadyCompleted, true);
    assert.equal(source.getReads(), beforeSkipReads);
    console.log('PASS: 두 페이지 완료 후 중단 → 10번부터 이어 27명 처리');
    console.log('PASS: 완료된 5분 실행은 불필요한 재조회 없음');

    // 체크포인트 저장이 실패하면 진행을 멈추고 마지막 저장값만 유지.
    // 방문 함수는 영속적인 claim을 통해 재방문 시 중복을 막음.
    const source2 = makeSource(13);
    const claim2 = makeClaimsDB();
    const baseStore2 = moboCreateMemoryCheckpointStore();
    const scope2 = moboCheckpointScope(date, 'attendance', tickAt);
    let failSave = true;
    let accepted = 0;
    const fragileStore = {
        load: k => baseStore2.load(k),
        async commit(k, cursor) {
            if (failSave && cursor === 'QaUser_000009') {
                failSave = false;
                throw new Error('SIMULATED_CHECKPOINT_WRITE_FAILURE');
            }
            return baseStore2.commit(k, cursor);
        },
        finish: (k, cursor) => baseStore2.finish(k, cursor)
    };
    const opts2 = {
        db: source2, store: fragileStore, date,
        kind: 'attendance', tickAt,
        batchOptions: {pageSize:5, parallel:2},
        visit: async doc => {
            if (await claimDeliveryOnce(claim2, doc.id, date, 'attendance')) {
                accepted++;
                await markDeliverySent(claim2, doc.id, date, 'attendance');
            }
        }
    };
    await assert.rejects(
        moboRunResumableBatch(opts2),
        /SIMULATED_CHECKPOINT_WRITE_FAILURE/
    );
    assert.equal((await baseStore2.load(scope2)).cursor, 'QaUser_000004');
    const recovered = await moboRunResumableBatch(opts2);
    assert.equal(recovered.completed, true);
    assert.equal(accepted, 13);
    assert.equal(claim2.docs.size, 13);
    assert.equal((await baseStore2.load(scope2)).completed, true);
    console.log('PASS: 체크포인트 저장 실패 → 이전 커서 재개·중복 claim 차단');

    // 동시에 완료된 워커가 뒤늦게 이전 커서를 저장해도 역행 금지.
    const store3 = moboCreateMemoryCheckpointStore();
    assert.equal(await store3.commit(scope, 'QaUser_000020'), true);
    assert.equal(await store3.commit(scope, 'QaUser_000010'), false);
    assert.equal((await store3.load(scope)).cursor, 'QaUser_000020');
    await assert.rejects(
        store3.finish(scope, 'QaUser_000015'), /역행/
    );
    assert.equal(await store3.finish(scope, 'QaUser_000020'), true);
    assert.equal(await store3.commit(scope, 'QaUser_000025'), false);
    console.log('PASS: 늦게 저장된 오래된 커서로 진행 상태 역행 방지');

    // 다음 5분은 새 scope. 당일 신규 사용자나 변경된 알림 후보를
    // 처음부터 다시 검사할 수 있고 영속 claim으로 중복을 차단한다.
    const nextResult = await moboRunResumableBatch({
        ...opts, tickAt: nextTick
    });
    assert.equal(nextResult.completed, true);
    assert.equal(claims.docs.size, 27);
    assert.equal(
        [...claims.docs.values()].filter(x => x.status === 'sent').length,
        27
    );
    console.log('PASS: 다음 5분 실행에서 새 순회 가능·중복 수신 권한 없음');

    const failedStore = {
        load: async () => { throw new Error('SIMULATED_LOAD_FAILURE'); },
        commit: async () => {},
        finish: async () => {}
    };
    await assert.rejects(
        moboRunResumableBatch({...opts, store:failedStore}),
        /SIMULATED_LOAD_FAILURE/
    );
    await assert.rejects(
        moboRunResumableBatch({
            ...opts, batchOptions:{startAfter:'QaUser_000100'}
        }),
        /수동 커서/
    );
    console.log('PASS: 저장소 읽기 실패·수동 커서 덮어쓰기 차단');

    console.log('QA-046D-16 · 중단 복구/중복 방지 체크포인트 PASS');
    console.log('실제 DB 체크포인트 영속 저장 및 Netlify 예약: 아직 미연결');
    console.log('실제 Firebase/FCM 읽기·쓰기·발송: 없음');
}
if (require.main === module) {
    runSelfTest().catch(error => {
        console.error('QA-046D-16 실패:', error.message);
        process.exitCode = 1;
    });
}
module.exports = {
    moboCheckpointScope,
    moboCreateMemoryCheckpointStore,
    moboRunResumableBatch
};
