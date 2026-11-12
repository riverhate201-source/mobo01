'use strict';

// QA-046D-15 | 여러 사용자 대상 읽기 전용 배치/커서/시간 제한 검증.
// 실제 FCM·Firestore 쓰기는 이 모듈에 없음. 모든 실행은 메모리 테스트.
// 정식 연결 시 마지막 커서의 영속 저장과 중단 복구가 별도로 필요.
const assert = require('node:assert/strict');
const { moboAssertScopedUID } = require('./mobo-auto-source-scope.cjs');
const {
    claimDeliveryOnce, markDeliverySent, makeDeliveryKey
} = require('./mobo-push-dedupe.cjs');

const MAX_PAGE_SIZE = 50;
const MAX_PAGES = 6;
const MAX_PARALLEL = 4;
const SAFE_BUDGET_MS = 25000;

function positiveInteger(value, max, name) {
    if (!Number.isInteger(value) || value < 1 || value > max) {
        throw new Error('QA 배치 설정 오류: ' + name);
    }
    return value;
}

function moboValidateBatchOptions(opts = {}) {
    const pageSize = positiveInteger(opts.pageSize ?? 25, MAX_PAGE_SIZE, 'pageSize');
    const maxPages = positiveInteger(opts.maxPages ?? 4, MAX_PAGES, 'maxPages');
    const parallel = positiveInteger(opts.parallel ?? 2, MAX_PARALLEL, 'parallel');
    const budgetMs = positiveInteger(opts.budgetMs ?? 20000, SAFE_BUDGET_MS, 'budgetMs');
    const startAfter = opts.startAfter ?? null;
    if (startAfter !== null) moboAssertScopedUID(startAfter);
    const onPageCommitted = opts.onPageCommitted;
    if (onPageCommitted !== undefined && typeof onPageCommitted !== 'function') {
        throw new Error('QA 배치 설정 오류: onPageCommitted');
    }
    return { pageSize, maxPages, parallel, budgetMs, startAfter, onPageCommitted };
}

// Firestore 서버 query 계약: 정렬된 문서 ID 기준으로 pageSize개만 조회.
// 문서의 원문·토큰·UID 목록은 결과 로그에 내보내지 않는다.
async function moboReadSchedulePage(db, afterId, pageSize) {
    positiveInteger(pageSize, MAX_PAGE_SIZE, 'pageSize');
    if (afterId !== null) moboAssertScopedUID(afterId);
    if (!db || typeof db.collection !== 'function') {
        throw new Error('QA 배치 DB 연결 없음');
    }
    let query = db.collection('pushSchedules').orderBy('__name__');
    if (afterId !== null) query = query.startAfter(afterId);
    const result = await query.limit(pageSize).get();
    if (!Array.isArray(result?.docs) || result.docs.length > pageSize) {
        throw new Error('QA 배치 페이지 응답 오류');
    }
    let previous = afterId;
    for (const doc of result.docs) {
        moboAssertScopedUID(doc?.id);
        if (previous !== null && doc.id <= previous) {
            throw new Error('QA 배치 페이지 정렬/커서 오류');
        }
        previous = doc.id;
    }
    return result.docs;
}

// 한 페이지가 완전히 처리되어야만 커서를 다음 위치로 옮긴다.
// 작업 중 실패하면 기존 커서로 다시 시도할 수 있다.
// 중복 발송 여부는 영속 Firestore claim으로 별도 보장해야 한다.
async function moboRunBoundedBatch(db, visit, opts = {}, clock = Date.now) {
    if (typeof visit !== 'function' || typeof clock !== 'function') {
        throw new Error('QA 배치 콜백 설정 오류');
    }
    const settings = moboValidateBatchOptions(opts);
    const deadline = clock() + settings.budgetMs;
    let cursor = settings.startAfter;
    let pages = 0;
    let examined = 0;
    let completed = true;
    let reason = 'END_OF_DATA';

    for (let p = 0; p < settings.maxPages; p++) {
        if (clock() >= deadline) {
            completed = false;
            reason = 'TIME_BUDGET';
            break;
        }

        const docs = await moboReadSchedulePage(db, cursor, settings.pageSize);
        if (clock() >= deadline && docs.length > 0) {
            completed = false;
            reason = 'TIME_BUDGET';
            break;
        }
        if (docs.length === 0) break;

        // 고정된 worker 개수만 실행. Promise.all 모든 worker 종료 후
        // 성공한 경우에만 페이지 커서를 갱신.
        let next = 0;
        let pageError = null;
        async function worker() {
            // 한 작업이 실패한 뒤에는 새 사용자 처리를 시작하지 않음.
            // 이미 시작된 작업은 모두 종료된 후 오류를 반환.
            while (next < docs.length && pageError === null) {
                if (clock() >= deadline) {
                    pageError = new Error('QA 배치 시간 초과: 페이지 미확정');
                    break;
                }
                const doc = docs[next++];
                try {
                    await visit(doc);
                } catch (error) {
                    pageError = error;
                }
            }
        }
        await Promise.all(
            Array.from(
                { length: Math.min(settings.parallel, docs.length) },
                () => worker()
            )
        );
        if (pageError !== null) throw pageError;

        // QA-046D-16 | 페이지 내 모든 작업이 성공한 뒤에만
        // 외부 체크포인트 저장 콜백 실행. 실패 시 다음 페이지로 진행 금지.
        // 저장 계층(향후 Firestore)은 이 배치 함수 밖에서 주입.
        const nextCursor = docs[docs.length - 1].id;
        if (settings.onPageCommitted) {
            await settings.onPageCommitted(Object.freeze({
                cursor: nextCursor,
                pageNumber: pages + 1,
                examined: examined + docs.length
            }));
        }

        examined += docs.length;
        pages++;
        cursor = nextCursor;

        if (docs.length < settings.pageSize) break;

        // 다음 페이지 존재 여부를 모르므로 경계에서 종료할 때는
        // cursor를 다음 호출에 전달하고 더 읽을 수 있음을 표시.
        if (p === settings.maxPages - 1) {
            completed = false;
            reason = 'PAGE_LIMIT';
        }
    }

    return {
        cursor, pages, examined, completed, reason,
        // 실제 전체 사용자 규모/기준 시각 정확도는 이 테스트의 범위 밖.
        pageSize: settings.pageSize
    };
}

function fakeScheduleDB(count) {
    const docs = Array.from({ length: count }, (_, i) => ({
        id: 'QaUser_' + String(i).padStart(6, '0')
    }));
    let pagesRead = 0;
    let maxQueryLimit = 0;
    const db = {
        collection(name) {
            assert.equal(name, 'pushSchedules');
            return {
                orderBy(field) {
                    assert.equal(field, '__name__');
                    let after = null;
                    const query = {
                        startAfter(uid) {
                            after = uid;
                            return query;
                        },
                        limit(count) {
                            maxQueryLimit = Math.max(maxQueryLimit, count);
                            return {
                                async get() {
                                    pagesRead++;
                                    const start = after === null
                                        ? 0
                                        : docs.findIndex(x => x.id > after);
                                    const rows = start === -1 ? [] : docs.slice(start, start + count);
                                    return { docs: rows };
                                }
                            };
                        }
                    };
                    return query;
                }
            };
        }
    };
    return { db, getStats: () => ({ pagesRead, maxQueryLimit }) };
}

function fakeClaimsDB() {
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
                                const err = new Error('Already exists');
                                err.code = 6;
                                throw err;
                            }
                            docs.set(id, { ...record });
                        },
                        async update(record) {
                            if (!docs.has(id)) throw new Error('missing claim');
                            docs.set(id, { ...docs.get(id), ...record });
                        }
                    };
                }
            };
        }
    };
}

async function runSelfTest() {
    assert.throws(() => moboValidateBatchOptions({ pageSize: 100 }), /pageSize/);
    assert.throws(() => moboValidateBatchOptions({ parallel: 10 }), /parallel/);
    assert.throws(() => moboValidateBatchOptions({ budgetMs: 30000 }), /budgetMs/);
    assert.throws(() => moboValidateBatchOptions({ startAfter: 'bad/id' }), /UID/);
    const source = fakeScheduleDB(525);
    const seen = new Set();
    let next = null;
    let scans = 0;
    let maxActive = 0;
    let active = 0;
    do {
        const result = await moboRunBoundedBatch(
            source.db,
            async doc => {
                active++;
                maxActive = Math.max(maxActive, active);
                await Promise.resolve();
                assert.ok(!seen.has(doc.id));
                seen.add(doc.id);
                active--;
            },
            { pageSize: 25, maxPages: 4, parallel: 3, startAfter: next }
        );
        assert.ok(result.examined <= 100);
        scans++;
        next = result.cursor;
        if (result.completed) break;
        assert.equal(result.reason, 'PAGE_LIMIT');
    } while (scans < 10);
    assert.equal(seen.size, 525);
    assert.equal(maxActive <= 3, true);
    assert.equal(maxActive > 1, true);
    assert.equal(source.getStats().maxQueryLimit, 25);
    console.log('PASS: 525명 25건 페이지·최대 3개 동시작업·커서 순회');

    // 서로 겹쳐 실행하더라도 Firestore 원자적 claim은 최대 한 번만 성공.
    const claims = fakeClaimsDB();
    const overlapping = fakeScheduleDB(80);
    const date = '2026-11-12';
    let claimed = 0;
    await Promise.all([1, 2, 3].map(() =>
        moboRunBoundedBatch(
            overlapping.db,
            async doc => {
                if (await claimDeliveryOnce(claims, doc.id, date, 'serial')) {
                    claimed++;
                    await markDeliverySent(claims, doc.id, date, 'serial');
                }
            },
            { pageSize: 20, maxPages: 6, parallel: 4 }
        )
    ));
    assert.equal(claimed, 80);
    assert.equal(claims.docs.size, 80);
    assert.ok(
        [...claims.docs.entries()].every(([id, record]) =>
            record.status === 'sent' &&
            /^[a-f0-9]{64}$/.test(id)
        )
    );
    assert.equal(makeDeliveryKey('QaUser_000001', date, 'serial').length, 64);
    console.log('PASS: 3개 중복 실행·80명·동일 날짜 알림 claim 단일 성공');

    // 페이지 처리 중 실패 시 cursor를 진행했다고 보고하지 않는다.
    const failure = fakeScheduleDB(30);
    const badDoc = 'QaUser_000005';
    await assert.rejects(
        moboRunBoundedBatch(failure.db, async doc => {
            if (doc.id === badDoc) throw new Error('QA_VISITOR_ERROR');
        }, { pageSize: 10, parallel: 2 }),
        /QA_VISITOR_ERROR/
    );
    console.log('PASS: 페이지 작업 실패 시 커서 미확정·호출 실패 감지');

    // 실패를 반환할 때 이미 시작된 병렬 작업이 남아있지 않아야 함.
    const gate = fakeScheduleDB(10);
    let inFlight = 0;
    let peakInFlight = 0;
    const failFast = await moboRunBoundedBatch(
        gate.db,
        async doc => {
            inFlight++;
            peakInFlight = Math.max(peakInFlight, inFlight);
            try {
                if (doc.id === 'QaUser_000000') {
                    await Promise.resolve();
                    throw new Error('SIMULATED_PAGE_FAILURE');
                }
                await new Promise(resolve => setImmediate(resolve));
            } finally {
                inFlight--;
            }
        },
        {pageSize: 10, parallel: 3}
    ).then(
        () => null,
        error => error
    );
    assert.match(failFast?.message ?? '', /SIMULATED_PAGE_FAILURE/);
    assert.equal(inFlight, 0);
    assert.ok(peakInFlight > 1);
    console.log('PASS: 병렬 페이지 오류 후 진행 중 작업 전부 종료');

    // 남은 시간 내에 시작 못 하면 다음 페이지를 시도하지 않는다.
    let fakeTime = 0;
    const timed = fakeScheduleDB(100);
    const timedResult = await moboRunBoundedBatch(
        timed.db, async () => { fakeTime += 2000; },
        { pageSize: 5, maxPages: 4, parallel: 1, budgetMs: 4000 },
        () => fakeTime
    ).catch(error => {
        assert.match(error.message, /시간 초과/);
        return null;
    });
    assert.equal(timedResult, null);
    console.log('PASS: 실행 예산 초과 시 작업 중단·미완료 감지');

    const empty = fakeScheduleDB(0);
    const emptyResult = await moboRunBoundedBatch(
        empty.db, async () => { throw new Error('must not run'); }
    );
    assert.equal(emptyResult.completed, true);
    assert.equal(emptyResult.examined, 0);
    console.log('PASS: 데이터 없음은 정상 완료로 구분');

    console.log('QA-046D-15 · 다중 사용자 배치/중복/시간 제한 PASS');
    console.log('실제 Firebase/FCM 호출 없음 · 사용자 데이터 변경 없음');
    console.log('커서 영속화와 실사용 다중 발송: 아직 연결하지 않음');
}

if (require.main === module) {
    runSelfTest().catch(err => {
        console.error('QA-046D-15 실패:', err.message);
        process.exitCode = 1;
    });
}
module.exports = {
    moboValidateBatchOptions,
    moboReadSchedulePage,
    moboRunBoundedBatch
};
