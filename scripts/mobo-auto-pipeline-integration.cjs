'use strict';

// QA-046D-19 | 알림 대상 판정→실행 잠금→배치→체크포인트→FCM 결과→중복 방지 통합
// 실제 파일 및 함수 연결로 검사하되 모의 Firestore / 모의 FCM만 사용.
// 본 스크립트는 정식 발송 작업을 시작하지 않으며 원격 접근하지 않음.
const assert = require('node:assert/strict');
const {moboKSTDate, moboWebtoonDate} =
    require('./mobo-scheduler-clock.cjs');
const {moboCanSendSchedule} =
    require('./mobo-live-guard.cjs');
const {moboCheckpointScope, moboRunResumableBatch} =
    require('./mobo-auto-resume-checkpoint.cjs');
const {moboCreateFirestoreCheckpointStore} =
    require('./mobo-auto-firestore-checkpoint.cjs');
const {moboCreateFirestoreRunLease, moboWithRunLease} =
    require('./mobo-auto-run-lease.cjs');
const {claimDeliveryOnce, makeDeliveryKey} =
    require('./mobo-push-dedupe.cjs');
const {moboCompleteClaimedSend} =
    require('./mobo-auto-send-result.cjs');

const DAY = '2026-11-12';
const QA_PROJECT = 'mobo-qa-2026';
const ENTRY = DAY + '~3~1';
const UID = n => 'QaUser_' + String(n).padStart(6, '0');
const TOKEN = 'SYNTHETIC_TOKEN_NOT_A_REAL_DEVICE_123456';
const kst = (time) => Date.parse(DAY + 'T' + time + ':00+09:00');

function makeFakeFirebase(size) {
    const collections = new Map([
        ['pushSubscriptions', new Map()],
        ['pushSchedules', new Map()],
        ['pushDeliveryClaims', new Map()],
        ['qaPushBatchCheckpoints', new Map()],
        ['qaPushBatchLeases', new Map()]
    ]);
    for (let i = 0; i < size; i++) {
        collections.get('pushSubscriptions').set(UID(i), {
            enabled: i !== 4,
            serial: true, expire: true,
            timezone: 'Asia/Seoul',
            token: i === 6 ? '' : TOKEN,
            serialTime: '22:00',
            expireDays: 3
        });
        collections.get('pushSchedules').set(UID(i), {
            version: 2,
            timezone: 'Asia/Seoul',
            serialTime: '22:00',
            expireDays: 3,
            days: [ENTRY]
        });
    }

    let txSerial = Promise.resolve();
    const counts = {reads: 0, writes: 0, transactions: 0};
    function requireCollection(name) {
        assert.ok(collections.has(name), 'unexpected collection');
        return collections.get(name);
    }
    function snapshot(id, value) {
        return {
            id, exists: value !== undefined,
            data: () => value === undefined ? undefined : structuredClone(value)
        };
    }
    const db = {
        collection(name) {
            const records = requireCollection(name);
            return {
                doc(id) {
                    const ref = {
                        id, name,
                        async get() {
                            counts.reads++;
                            return snapshot(id, records.get(id));
                        },
                        async create(value) {
                            if (records.has(id)) {
                                const err = new Error('Already exists');
                                err.code = 6;
                                throw err;
                            }
                            records.set(id, structuredClone(value));
                            counts.writes++;
                        },
                        async update(value) {
                            if (!records.has(id)) throw new Error('Missing claim');
                            records.set(id, {
                                ...records.get(id), ...structuredClone(value)
                            });
                            counts.writes++;
                        }
                    };
                    return ref;
                },
                orderBy(field) {
                    assert.equal(name, 'pushSchedules');
                    assert.equal(field, '__name__');
                    let cursor = null;
                    const q = {
                        startAfter(id) { cursor = id; return q; },
                        limit(number) {
                            assert.ok(number > 0 && number <= 50);
                            return {
                                async get() {
                                    counts.reads++;
                                    const ids = [...records.keys()].sort();
                                    const rows = cursor === null ? ids :
                                        ids.filter(id => id > cursor);
                                    const docs = rows.slice(0, number).map(id => ({
                                        id, data: () => structuredClone(records.get(id))
                                    }));
                                    return {docs};
                                }
                            };
                        }
                    };
                    return q;
                }
            };
        },
        runTransaction(fn) {
            const action = async () => {
                counts.transactions++;
                const changes = [];
                const tx = {
                    get: ref => ref.get(),
                    set: (ref, value) =>
                        changes.push([ref.name, ref.id, structuredClone(value)])
                };
                const result = await fn(tx);
                for (const [name, id, value] of changes) {
                    requireCollection(name).set(id, value);
                    counts.writes++;
                }
                return result;
            };
            const result = txSerial.then(action);
            txSerial = result.then(() => {}, () => {});
            return result;
        }
    };
    return {db, collections, counts};
}

async function runSelfTest() {
    const firebase = makeFakeFirebase(24);
    const {db, collections, counts} = firebase;
    const checkpoints = moboCreateFirestoreCheckpointStore(db, {
        projectId: QA_PROJECT, writesEnabled: true,
        nowISO: () => new Date(kst('22:05')).toISOString()
    });
    let now = kst('22:05');
    const lease = moboCreateFirestoreRunLease(db, {
        projectId: QA_PROJECT, writesEnabled: true,
        leaseMs: 20000, clock: () => now
    });
    assert.equal(moboKSTDate(now), DAY);
    assert.equal(moboWebtoonDate(now), '2026-11-13');

    let simulatedCrash = true;
    let changedAtRecheck = false;
    let firstCall = true;
    let notifyEntered;
    const entered = new Promise(resolve => { notifyEntered = resolve; });
    let allowFirst;
    const unblock = new Promise(resolve => { allowFirst = resolve; });
    let observedAttempts = 0;
    let uncertainResults = 0;
    let claimDuplicates = 0;
    let rejectedByLatestState = 0;
    const sendingByUID = new Map();
    const visitedByUID = new Map();

    async function visitor(doc, verify, pause) {
        await verify();
        visitedByUID.set(doc.id, (visitedByUID.get(doc.id) ?? 0) + 1);
        if (pause && doc.id === UID(0) && firstCall) {
            firstCall = false;
            notifyEntered();
            await unblock;
            await verify();
        }
        // 저장된 첫 후보를 판단한 뒤, 발송 전에 설정이 바뀌는 상황.
        if (doc.id === UID(8) && !changedAtRecheck) {
            changedAtRecheck = true;
            collections.get('pushSchedules').get(doc.id).days = [];
        }
        if (doc.id === UID(11) && simulatedCrash) {
            simulatedCrash = false;
            throw new Error('SIMULATED_PROCESS_INTERRUPTED_BEFORE_CLAIM');
        }
        const [subSnap, scheduleSnap] = await Promise.all([
            db.collection('pushSubscriptions').doc(doc.id).get(),
            db.collection('pushSchedules').doc(doc.id).get()
        ]);
        if (!subSnap.exists || !scheduleSnap.exists) return;
        const candidate = {
            uid: doc.id, date: DAY, kind: 'serial',
            entry: ENTRY, count: 3
        };
        const allowed = moboCanSendSchedule(
            candidate, subSnap.data(), scheduleSnap.data(), now
        );
        if (!allowed) {
            rejectedByLatestState++;
            return;
        }

        await verify();
        if (!await claimDeliveryOnce(db, doc.id, DAY, 'serial')) {
            claimDuplicates++;
            return;
        }

        try {
            await moboCompleteClaimedSend({
                db, uid: doc.id, date: DAY, kind: 'serial',
                send: async () => {
                    observedAttempts++;
                    sendingByUID.set(doc.id,
                        (sendingByUID.get(doc.id) ?? 0) + 1
                    );
                    if (doc.id === UID(14)) {
                        throw new Error('SIMULATED_FCM_UNCERTAIN');
                    }
                }
            });
        } catch (error) {
            // FCM 결과 불명확은 기록 후 수동 검토로 남겨둔다.
            if (error.code === 'FCM_RESULT_UNCERTAIN') {
                uncertainResults++;
                return;
            }
            throw error;
        }
    }

    async function runTick(tickAt, pause = false) {
        const scope = moboCheckpointScope(DAY, 'serial', tickAt);
        return moboWithRunLease(lease, scope, verify =>
            moboRunResumableBatch({
                db, store: checkpoints, date: DAY, kind: 'serial',
                tickAt, batchOptions: {
                    pageSize: 5, maxPages: 6, parallel: 1, budgetMs: 15000
                },
                visit: doc => visitor(doc, verify, pause)
            })
        );
    }

    // 동시에 진입하면 1개 작업만 실행.
    const first = runTick(kst('22:05'), true);
    await entered;
    assert.deepEqual(await runTick(kst('22:05')), {
        skipped: true, reason: 'LEASE_HELD'
    });
    unblock();
    await assert.rejects(
        first, /SIMULATED_PROCESS_INTERRUPTED_BEFORE_CLAIM/
    );
    const checkpointKey = [...collections.get('qaPushBatchCheckpoints').keys()][0];
    const saved = collections.get('qaPushBatchCheckpoints').get(checkpointKey);
    assert.equal(saved.cursor, UID(9));
    assert.equal(saved.completed, false);
    assert.equal(visitedByUID.get(UID(0)), 1);
    console.log('PASS: 동시 진입 차단·중단 전 완료한 2개 페이지 체크포인트 기록');

    const recovered = await runTick(kst('22:05'));
    assert.equal(recovered.skipped, false);
    assert.equal(recovered.result.completed, true);
    assert.equal(visitedByUID.get(UID(0)), 1);
    assert.equal(visitedByUID.get(UID(10)), 2);
    assert.equal(visitedByUID.get(UID(11)), 2);
    const checkpointsRecords = [...collections.get('qaPushBatchCheckpoints').values()];
    assert.equal(checkpointsRecords.length, 1);
    assert.equal(checkpointsRecords[0].completed, true);
    const alreadyCompleted = await runTick(kst('22:05'));
    assert.equal(alreadyCompleted.result.alreadyCompleted, true);
    console.log('PASS: 중단 후 완료 페이지 건너뛰고 재개·완료된 tick 재실행 무해');

    // 24명 중 4,6,8번 제외, 14번은 결과 불명확 상태.
    const claims = collections.get('pushDeliveryClaims');
    assert.equal(claims.size, 21);
    assert.equal(observedAttempts, 21);
    assert.equal(uncertainResults, 1);
    assert.equal(
        [...claims.values()].filter(r => r.status === 'sent').length,
        20
    );
    assert.equal(
        claims.get(makeDeliveryKey(UID(14), DAY, 'serial')).status,
        'needs_review'
    );
    for (const n of [4,6,8]) {
        assert.equal(claims.has(makeDeliveryKey(UID(n), DAY, 'serial')), false);
    }
    assert.equal(sendingByUID.get(UID(14)), 1);
    assert.equal(claimDuplicates, 0);
    assert.ok(rejectedByLatestState >= 3);
    console.log('PASS: 사용자 설정 변경·토큰 누락 차단 및 FCM 미확정 수동검토');
    console.log('PASS: 정상 처리 20건·확인 필요 1건·중복 발송 0건 (모두 가상)');

    // 5분 뒤에는 새로운 실행 scope로 전체 후보를 다시 검사하지만,
    // 이미 claim된 대상은 기존 Firestore 중복 키 때문에 재발송하지 않음.
    now = kst('22:10');
    const nextTick = await runTick(kst('22:10'));
    assert.equal(nextTick.result.completed, true);
    assert.equal(observedAttempts, 21);
    assert.equal(claimDuplicates, 21);
    assert.equal(
        collections.get('qaPushBatchCheckpoints').size, 2
    );
    console.log('PASS: 다음 5분 tick 전체 재검사에서도 중복 요청 0건');

    // 20분 발송 시간 범위가 끝나면 오래된 후보를 재발송하지 않음.
    now = kst('22:20');
    const outsideWindow = await runTick(kst('22:20'));
    assert.equal(outsideWindow.result.completed, true);
    assert.equal(observedAttempts, 21);
    assert.equal(claimDuplicates, 21);
    console.log('PASS: 20분 발송 가능 시간 종료 후 추가 요청 없음');

    assert.equal(
        [...claims.values()].some(r =>
            typeof r.token === 'string' ||
            r.status === 'claimed'
        ), false
    );
    assert.ok(counts.transactions > 0);
    assert.ok(counts.reads > 0);
    console.log('QA-046D-19 · 통합 모의 알림 파이프라인 PASS');
    console.log('실제 Firebase/FCM 접근·실제 발송·원격 데이터 변경: 없음');
    console.log('정식 다중 사용자 서버 및 Netlify 예약 호출: 아직 미연결');
}

if (require.main === module) {
    runSelfTest().catch(error => {
        console.error('QA-046D-19 실패:', error.message);
        process.exitCode = 1;
    });
}

module.exports = {makeFakeFirebase};
