'use strict';

// QA-046D-18 | 5분 배치의 트랜잭션 기반 실행 잠금(fencing generation)
// 로컬 메모리 트랜잭션으로만 테스트. Firestore/FCM 연결, 원격 쓰기 없음.
// 체크포인트/FCM 원자성 보장은 별도 단계. lease가 claim을 대체하지 않음.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { moboCheckpointDocId } =
    require('./mobo-auto-firestore-checkpoint.cjs');
const { moboCheckpointScope, moboRunResumableBatch,
    moboCreateMemoryCheckpointStore } =
    require('./mobo-auto-resume-checkpoint.cjs');
const { claimDeliveryOnce, markDeliverySent } =
    require('./mobo-push-dedupe.cjs');

const QA_PROJECT = 'mobo-qa-2026';
const COLLECTION = 'qaPushBatchLeases';
const MAX_LEASE_MS = 25000;
const MIN_LEASE_MS = 5000;
const BUFFER_MS = 5000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validOwner(owner) {
    if (typeof owner !== 'string' || !UUID.test(owner)) {
        throw new Error('QA 실행 잠금 소유자 형식 오류');
    }
    return owner;
}

function validLeaseLength(ms) {
    if (!Number.isSafeInteger(ms) ||
        ms < MIN_LEASE_MS || ms > MAX_LEASE_MS) {
        throw new Error('QA 실행 잠금 만료시간 오류');
    }
    return ms;
}

function validRecord(value, scope) {
    if (!value || typeof value !== 'object' ||
        value.version !== 1 || value.scope !== scope ||
        !['active', 'released'].includes(value.status) ||
        !Number.isSafeInteger(value.generation) ||
        value.generation < 1 ||
        !Number.isSafeInteger(value.expiresAt) ||
        value.expiresAt < 0) {
        throw new Error('QA 실행 잠금 저장 기록 오류');
    }
    validOwner(value.owner);
    return value;
}

function validateHandle(handle) {
    if (!handle || typeof handle !== 'object' ||
        !Number.isSafeInteger(handle.generation) ||
        handle.generation < 1) {
        throw new Error('QA 실행 잠금 소유 토큰 오류');
    }
    validOwner(handle.owner);
    return handle;
}

function moboCreateFirestoreRunLease(db, options = {}) {
    const {
        projectId,
        writesEnabled = false,
        clock = Date.now,
        leaseMs = 20000
    } = options;
    if (projectId !== QA_PROJECT) {
        throw new Error('QA 실행 잠금 Firebase 프로젝트 불일치');
    }
    if (!db || typeof db.collection !== 'function' ||
        typeof db.runTransaction !== 'function' ||
        typeof clock !== 'function' ||
        typeof writesEnabled !== 'boolean') {
        throw new Error('QA 실행 잠금 저장 설정 오류');
    }
    validLeaseLength(leaseMs);

    function refFor(scope) {
        // 공통 checkpoint scope 형식 검사 및 단방향 해시
        return db.collection(COLLECTION).doc(moboCheckpointDocId(scope));
    }
    function writable() {
        if (!writesEnabled) {
            throw new Error('QA 실행 잠금 쓰기 잠금: 별도 승인 필요');
        }
    }
    function now() {
        const value = clock();
        if (!Number.isSafeInteger(value) || value < 0) {
            throw new Error('QA 실행 잠금 시계 오류');
        }
        return value;
    }
    function held(record, token, time) {
        return record?.status === 'active' &&
            record.owner === token.owner &&
            record.generation === token.generation &&
            record.expiresAt > time;
    }

    return {
        leaseMs,

        async acquire(scope, owner = crypto.randomUUID()) {
            writable();
            validOwner(owner);
            const ref = refFor(scope);
            return db.runTransaction(async tx => {
                const snapshot = await tx.get(ref);
                const previous = snapshot.exists
                    ? validRecord(snapshot.data(), scope) : null;
                const time = now();
                if (previous?.status === 'active' &&
                    previous.expiresAt > time) {
                    return null;
                }
                if (previous?.generation === Number.MAX_SAFE_INTEGER) {
                    throw new Error('QA 실행 잠금 세대 수 초과');
                }
                const generation = (previous?.generation ?? 0) + 1;
                tx.set(ref, {
                    version: 1,
                    scope,
                    owner,
                    generation,
                    status: 'active',
                    expiresAt: time + leaseMs
                });
                return Object.freeze({owner, generation});
            });
        },

        async verify(scope, token) {
            validateHandle(token);
            const ref = refFor(scope);
            const snapshot = await ref.get();
            if (!snapshot.exists) return false;
            return held(validRecord(snapshot.data(), scope), token, now());
        },

        async renew(scope, token) {
            writable();
            validateHandle(token);
            const ref = refFor(scope);
            return db.runTransaction(async tx => {
                const snapshot = await tx.get(ref);
                const previous = snapshot.exists
                    ? validRecord(snapshot.data(), scope) : null;
                const time = now();
                if (!held(previous, token, time)) return false;
                tx.set(ref, {...previous, expiresAt: time + leaseMs});
                return true;
            });
        },

        async release(scope, token) {
            writable();
            validateHandle(token);
            const ref = refFor(scope);
            return db.runTransaction(async tx => {
                const snapshot = await tx.get(ref);
                const previous = snapshot.exists
                    ? validRecord(snapshot.data(), scope) : null;
                const time = now();
                if (!held(previous, token, time)) return false;
                tx.set(ref, {...previous, status: 'released'});
                return true;
            });
        }
    };
}

// 승인된 작업 소유자만 작업을 시작. 중단/오류 시에도 release 시도.
// run()이 받는 verify()는 외부 효과(발송/claim) 전에 호출해야 한다.
// lease 단독으로 exactly-once 발송을 보장하지 않음: 영속 claim은 필수.
async function moboWithRunLease(lease, scope, run, owner = crypto.randomUUID()) {
    if (!lease || typeof lease.acquire !== 'function' ||
        typeof lease.verify !== 'function' ||
        typeof lease.release !== 'function' ||
        typeof run !== 'function') {
        throw new Error('QA 실행 잠금 실행 인수 오류');
    }
    const token = await lease.acquire(scope, owner);
    if (token === null) {
        return {skipped: true, reason: 'LEASE_HELD'};
    }
    let failed = null;
    let result;
    try {
        const verify = async () => {
            if (!await lease.verify(scope, token)) {
                throw new Error('QA 실행 잠금 소유권 상실: 중단');
            }
        };
        // QA-046D-24 | 동일한 소유 토큰을 영속 체크포인트 트랜잭션에도 전달.
        // 기존 단일 인자 콜백과 호환되는 선택적 두 번째 인자.
        result = await run(verify, token);
        await verify();
    } catch (error) {
        failed = error;
    }
    let released = false;
    try {
        released = await lease.release(scope, token);
    } catch (error) {
        if (!failed) failed = error;
    }
    if (failed) throw failed;
    if (!released) {
        throw new Error('QA 실행 잠금 해제 전 소유권 만료: 결과 확인 필요');
    }
    return {skipped: false, result};
}

function fakeDb() {
    const records = new Map();
    let serial = Promise.resolve();
    let writes = 0;
    const db = {
        collection(name) {
            assert.equal(name, COLLECTION);
            return {
                doc(id) {
                    assert.match(id, /^[a-f0-9]{64}$/);
                    return {
                        id,
                        async get() {
                            const value = records.get(id);
                            return {
                                exists: value !== undefined,
                                data: () => value ? {...value} : undefined
                            };
                        }
                    };
                }
            };
        },
        runTransaction(fn) {
            const action = async () => {
                const mutations = [];
                const tx = {
                    get: ref => ref.get(),
                    set(ref, value) { mutations.push([ref.id, {...value}]); }
                };
                const result = await fn(tx);
                for (const [id, value] of mutations) {
                    records.set(id, value);
                    writes++;
                }
                return result;
            };
            const pending = serial.then(action);
            serial = pending.then(() => {}, () => {});
            return pending;
        }
    };
    return {db, records, getWrites: () => writes};
}

function fakeSchedules(size) {
    const rows = Array.from({length: size}, (_, i) => ({
        id: 'QaUser_' + String(i).padStart(6, '0')
    }));
    return {
        collection(name) {
            assert.equal(name, 'pushSchedules');
            return {
                orderBy(field) {
                    assert.equal(field, '__name__');
                    let after = null;
                    const chain = {
                        startAfter(id) { after = id; return chain; },
                        limit(n) {
                            return {
                                async get() {
                                    const index = after === null ? 0 :
                                        rows.findIndex(x => x.id > after);
                                    return {docs: index === -1 ? [] :
                                        rows.slice(index, index + n)};
                                }
                            };
                        }
                    };
                    return chain;
                }
            };
        }
    };
}

function fakeClaims() {
    const docs = new Map();
    return {
        docs,
        collection(name) {
            assert.equal(name, 'pushDeliveryClaims');
            return {
                doc(id) {
                    return {
                        async create(item) {
                            if (docs.has(id)) {
                                const err = new Error('already exists');
                                err.code = 6;
                                throw err;
                            }
                            docs.set(id, {...item});
                        },
                        async update(change) {
                            if (!docs.has(id)) throw new Error('missing claim');
                            docs.set(id, {...docs.get(id), ...change});
                        }
                    };
                }
            };
        }
    };
}

async function runSelfTest() {
    const date = '2026-11-12';
    const tick = Date.parse('2026-11-12T22:05:00+09:00');
    const scope = moboCheckpointScope(date, 'serial', tick);
    const sameDateOtherKind = moboCheckpointScope(date, 'expire', tick);
    const db = fakeDb();
    let time = tick;
    const options = {
        projectId: QA_PROJECT, writesEnabled: true,
        leaseMs: 20000, clock: () => time
    };
    const readOnly = moboCreateFirestoreRunLease(db.db, {
        ...options, writesEnabled: false
    });
    await assert.rejects(readOnly.acquire(scope), /쓰기 잠금/);
    await assert.rejects(readOnly.renew(scope, {
        owner: crypto.randomUUID(), generation: 1
    }), /쓰기 잠금/);
    assert.equal(db.getWrites(), 0);
    assert.throws(() =>
        moboCreateFirestoreRunLease(db.db, {
            ...options, projectId: 'mobo-prod'
        }), /프로젝트 불일치/);
    assert.throws(() =>
        moboCreateFirestoreRunLease(db.db, {
            ...options, leaseMs: 30000
        }), /만료시간/);
    console.log('PASS: 쓰기 기본 잠금·QA Firebase 프로젝트·최대 25초 제한');

    const lease = moboCreateFirestoreRunLease(db.db, options);
    const ownerA = crypto.randomUUID();
    const ownerB = crypto.randomUUID();
    const concurrently = await Promise.all([
        lease.acquire(scope, ownerA),
        lease.acquire(scope, ownerB)
    ]);
    assert.equal(concurrently.filter(Boolean).length, 1);
    const first = concurrently.find(Boolean);
    assert.equal(await lease.verify(scope, first), true);
    assert.equal(await lease.acquire(scope, crypto.randomUUID()), null);
    // 날짜/알림 종류가 다르면 별도 잠금
    const other = await lease.acquire(sameDateOtherKind);
    assert.equal(other.generation, 1);
    assert.equal(await lease.release(sameDateOtherKind, other), true);
    console.log('PASS: 같은 tick 2개 동시 시작 중 하나만 획득');

    time += 5000;
    assert.equal(await lease.renew(scope, first), true);
    time += 19000;
    assert.equal(await lease.acquire(scope, crypto.randomUUID()), null);
    time += 1000; // renew 이후 20초 경과
    assert.equal(await lease.verify(scope, first), false);
    const successor = await lease.acquire(scope);
    assert.equal(successor.generation, first.generation + 1);
    assert.equal(await lease.release(scope, first), false);
    assert.equal(await lease.renew(scope, first), false);
    assert.equal(await lease.verify(scope, successor), true);
    assert.equal(await lease.release(scope, successor), true);
    assert.equal(await lease.verify(scope, successor), false);
    const next = await lease.acquire(scope);
    assert.equal(next.generation, successor.generation + 1);
    assert.equal(await lease.release(scope, next), true);
    console.log('PASS: 잠금 만료 후 승계, 이전 소유자의 갱신·해제 차단');
    assert.equal(await lease.verify(scope, first), false);

    const malformedScope = moboCheckpointScope(date, 'attendance', tick);
    const malformedKey = moboCheckpointDocId(malformedScope);
    db.records.set(malformedKey, {scope: malformedScope, generation: 'bad'});
    await assert.rejects(lease.acquire(malformedScope), /저장 기록 오류/);
    console.log('PASS: 손상된 잠금 기록을 새 잠금으로 덮지 않고 차단');

    // 간단한 실전 흐름 모의: 같은 scope를 두 실행이 처리하려고 하면
    // lease 소유자만 배치 처리. 기존 claim이 두 번째 중복발송도 막는다.
    const jobScope = moboCheckpointScope(date, 'serial', tick + 5 * 60 * 1000);
    const checkpoints = moboCreateMemoryCheckpointStore();
    const schedules = fakeSchedules(23);
    const claims = fakeClaims();
    let inspected = 0;
    let begin;
    const entered = new Promise(resolve => {begin = resolve;});
    let unblock;
    const blocked = new Promise(resolve => {unblock = resolve;});
    const exec = async (verify, stall) => moboRunResumableBatch({
        db: schedules, store: checkpoints,
        date, kind: 'serial', tickAt: tick + 5 * 60 * 1000,
        batchOptions: {pageSize: 5, maxPages: 6, parallel: 2, budgetMs: 10000},
        visit: async doc => {
            await verify();
            if (stall && doc.id === 'QaUser_000000') {
                begin();
                await blocked;
                await verify();
            }
            inspected++;
            if (await claimDeliveryOnce(claims, doc.id, date, 'serial')) {
                await markDeliverySent(claims, doc.id, date, 'serial');
            }
        }
    });

    const runnerA = moboWithRunLease(
        lease, jobScope, verify => exec(verify, true)
    );
    await entered;
    const runnerB = await moboWithRunLease(
        lease, jobScope, verify => exec(verify, false)
    );
    assert.deepEqual(runnerB, {skipped: true, reason: 'LEASE_HELD'});
    unblock();
    const done = await runnerA;
    assert.equal(done.skipped, false);
    assert.equal(done.result.completed, true);
    assert.equal(inspected, 23);
    assert.equal(claims.docs.size, 23);
    assert.equal(
        [...claims.docs.values()].filter(x => x.status === 'sent').length,
        23
    );
    console.log('PASS: 23명 가상 배치 동시 진입 차단·원자적 claim 유지');

    const resume = await moboWithRunLease(
        lease, jobScope, verify => exec(verify, false)
    );
    assert.equal(resume.result.alreadyCompleted, true);
    assert.equal(inspected, 23);
    console.log('PASS: 완료 배치 재시작 시 중복 작업 없음');

    // lease를 획득한 상태에서도 시계가 지나 만료된 경우 결과를
    // 성공으로 처리하지 않음. 다음 소유자가 들어와 이전 것은 퇴장.
    const staleScope = moboCheckpointScope(
        date, 'attendance', tick + 5 * 60 * 1000
    );
    await assert.rejects(
        moboWithRunLease(lease, staleScope, async verify => {
            await verify();
            time += 21000;
            await verify();
        }),
        /소유권 상실/
    );
    const newHolder = await lease.acquire(staleScope);
    assert.equal(newHolder.generation, 2);
    assert.equal(await lease.release(staleScope, newHolder), true);
    console.log('PASS: 작업 중 잠금 만료 시 성공 처리 금지 및 승계');

    console.log('QA-046D-18 · lease 소유권·만료·동시 실행 PASS');
    console.log('실제 Firebase 읽기/쓰기·FCM 발송: 없음');
    console.log('실제 다중 사용자 실행 및 체크포인트 영속 연결: 아직 미연결');
}

if (require.main === module) {
    runSelfTest().catch(error => {
        console.error('QA-046D-18 실패:', error.message);
        process.exitCode = 1;
    });
}
module.exports = {moboCreateFirestoreRunLease, moboWithRunLease};
