'use strict';

// QA-046D-17 | Firestore 체크포인트 영속 어댑터 설계
// 기본은 쓰기 비활성. GitHub QA에서는 모의 트랜잭션만 검증.
// 이 모듈 자체는 firebase-admin을 초기화하거나 원격 호출하지 않음.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { moboAssertScopedUID } = require('./mobo-auto-source-scope.cjs');
const { moboCheckpointScope } = require('./mobo-auto-resume-checkpoint.cjs');

const QA_PROJECT = 'mobo-qa-2026';
const COLLECTION = 'qaPushBatchCheckpoints';
const RECORD_VERSION = 1;

function moboCheckpointDocId(scope) {
    // scope에는 개인 식별자가 없지만, 문서 ID에 날짜/시각을 직접 노출하지 않음.
    validateScope(scope);
    return crypto.createHash('sha256')
        .update('mobo-qa-checkpoint-v1|' + scope)
        .digest('hex');
}

function validateScope(scope) {
    if (typeof scope !== 'string') {
        throw new Error('QA 체크포인트 scope 형식 오류');
    }
    // 임의 문자열 금지. 반드시 5분 tick / 날짜 / kind 계약을 충족.
    const match = /^mobo-qa-v1\|(\d{4}-\d{2}-\d{2})\|(serial|expire|attendance)\|(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)$/.exec(scope);
    if (!match) throw new Error('QA 체크포인트 scope 형식 오류');
    if (moboCheckpointScope(match[1], match[2], Date.parse(match[3])) !== scope) {
        throw new Error('QA 체크포인트 scope 불일치');
    }
    return scope;
}

function validateRecord(value, scope) {
    if (!value || typeof value !== 'object' ||
        value.version !== RECORD_VERSION || value.scope !== scope ||
        typeof value.completed !== 'boolean' ||
        !Object.hasOwn(value, 'cursor')) {
        throw new Error('QA 체크포인트 저장 기록 오류');
    }
    if (value.cursor !== null) moboAssertScopedUID(value.cursor);
    if (value.updatedAt !== undefined &&
        (typeof value.updatedAt !== 'string' ||
         !Number.isFinite(Date.parse(value.updatedAt)))) {
        throw new Error('QA 체크포인트 수정 시각 오류');
    }
    return {cursor: value.cursor, completed: value.completed};
}

function moboCreateFirestoreCheckpointStore(db, opts = {}) {
    const {projectId, writesEnabled = false, nowISO = () => new Date().toISOString()} = opts;

    // 프로젝트 ID는 실제 Firebase app.options.projectId 등을 호출자가 확인 후 제공.
    if (projectId !== QA_PROJECT) {
        throw new Error('QA 체크포인트 프로젝트 불일치');
    }
    if (!db || typeof db.collection !== 'function' ||
        typeof db.runTransaction !== 'function') {
        throw new Error('QA 체크포인트 Firestore API 누락');
    }
    if (typeof nowISO !== 'function' || typeof writesEnabled !== 'boolean') {
        throw new Error('QA 체크포인트 옵션 오류');
    }

    function getRef(scope) {
        validateScope(scope);
        return db.collection(COLLECTION).doc(moboCheckpointDocId(scope));
    }

    function assertWritesAllowed() {
        if (!writesEnabled) {
            throw new Error('QA 체크포인트 실제 저장 잠김: 별도 승인 필요');
        }
    }

    function makeRecord(scope, cursor, completed) {
        const stamp = nowISO();
        if (typeof stamp !== 'string' ||
            !Number.isFinite(Date.parse(stamp))) {
            throw new Error('QA 체크포인트 저장 시각 오류');
        }
        return {
            version: RECORD_VERSION,
            scope,
            cursor,
            completed,
            updatedAt: stamp
        };
    }

    return {
        async load(scope) {
            const ref = getRef(scope);
            const snap = await ref.get();
            if (!snap.exists) return null;
            return validateRecord(snap.data(), scope);
        },

        async commit(scope, cursor) {
            assertWritesAllowed();
            moboAssertScopedUID(cursor);
            const ref = getRef(scope);
            return db.runTransaction(async tx => {
                const snap = await tx.get(ref);
                const prev = snap.exists
                    ? validateRecord(snap.data(), scope)
                    : {cursor: null, completed: false};

                if (prev.completed ||
                    (prev.cursor !== null && cursor <= prev.cursor)) {
                    return false;
                }
                tx.set(ref, makeRecord(scope, cursor, false));
                return true;
            });
        },

        async finish(scope, cursor) {
            assertWritesAllowed();
            if (cursor !== null) moboAssertScopedUID(cursor);
            const ref = getRef(scope);
            return db.runTransaction(async tx => {
                const snap = await tx.get(ref);
                const prev = snap.exists
                    ? validateRecord(snap.data(), scope)
                    : {cursor: null, completed: false};
                if (prev.completed) return false;

                if (prev.cursor !== null &&
                    (cursor === null || cursor < prev.cursor)) {
                    throw new Error('QA 체크포인트 완료 커서 역행 차단');
                }
                tx.set(ref, makeRecord(scope, cursor, true));
                return true;
            });
        }
    };
}

function makeFakeFirestore() {
    const data = new Map();
    const counts = {transactions: 0, writes: 0};
    // 간단한 직렬 트랜잭션 에뮬레이션. 실제 경쟁에서는 Firestore가
    // 충돌을 감지해 트랜잭션을 재시도해야 하며, QA는 불변식만 검증.
    let serial = Promise.resolve();
    const db = {
        collection(name) {
            assert.equal(name, COLLECTION);
            return {
                doc(key) {
                    assert.match(key, /^[a-f0-9]{64}$/);
                    return {
                        key,
                        async get() {
                            const found = data.get(key);
                            return {
                                exists: found !== undefined,
                                data: () => found ? {...found} : undefined
                            };
                        }
                    };
                }
            };
        },
        runTransaction(fn) {
            const action = async () => {
                counts.transactions++;
                const writes = [];
                const tx = {
                    get(ref) { return ref.get(); },
                    set(ref, record) {
                        writes.push([ref.key, {...record}]);
                    }
                };
                const result = await fn(tx);
                for (const [key, value] of writes) {
                    data.set(key, value);
                    counts.writes++;
                }
                return result;
            };
            const result = serial.then(action);
            serial = result.then(() => {}, () => {});
            return result;
        }
    };
    return {db, data, counts};
}

async function runSelfTest() {
    const date = '2026-11-12';
    const tick = Date.parse('2026-11-12T22:05:00+09:00');
    const scope = moboCheckpointScope(date, 'serial', tick);
    const otherKind = moboCheckpointScope(date, 'expire', tick);
    assert.notEqual(moboCheckpointDocId(scope), moboCheckpointDocId(otherKind));
    assert.equal(moboCheckpointDocId(scope).length, 64);
    for (const invalid of ['xyz', 'mobo-qa-v1|bad', scope.replace('22:05', '22:07')]) {
        assert.throws(() => moboCheckpointDocId(invalid), /scope|시간/);
    }
    console.log('PASS: scope 검증 및 SHA-256 문서 키 분리');

    const fake = makeFakeFirestore();
    const readOnly = moboCreateFirestoreCheckpointStore(fake.db, {
        projectId: QA_PROJECT
    });
    assert.equal(await readOnly.load(scope), null);
    await assert.rejects(
        readOnly.commit(scope, 'QaUser_000001'), /실제 저장 잠김/
    );
    await assert.rejects(readOnly.finish(scope, null), /실제 저장 잠김/);
    assert.equal(fake.counts.writes, 0);
    assert.throws(() =>
        moboCreateFirestoreCheckpointStore(fake.db, {
            projectId: 'mobo-prod', writesEnabled: true
        }),
    /프로젝트 불일치/);
    console.log('PASS: 기본 쓰기 잠금 및 실제 프로젝트 ID 거부');

    const options = {
        projectId: QA_PROJECT,
        writesEnabled: true,
        nowISO: () => '2026-11-12T13:05:00.000Z'
    };
    const first = moboCreateFirestoreCheckpointStore(fake.db, options);
    assert.equal(await first.commit(scope, 'QaUser_000010'), true);
    assert.deepEqual(await first.load(scope), {
        cursor: 'QaUser_000010', completed: false
    });

    // 새 인스턴스가 같은 Firestore 문서에서 이어받는다.
    const second = moboCreateFirestoreCheckpointStore(fake.db, options);
    assert.deepEqual(await second.load(scope), {
        cursor: 'QaUser_000010', completed: false
    });
    assert.equal(await second.commit(scope, 'QaUser_000005'), false);
    assert.equal(await first.commit(scope, 'QaUser_000010'), false);
    assert.equal(await second.commit(scope, 'QaUser_000020'), true);
    assert.deepEqual(await first.load(scope), {
        cursor: 'QaUser_000020', completed: false
    });
    console.log('PASS: 재시작 후 저장된 커서 조회·역행/중복 갱신 차단');

    const concurrent = await Promise.all([
        first.commit(scope, 'QaUser_000030'),
        second.commit(scope, 'QaUser_000025'),
        first.commit(scope, 'QaUser_000028')
    ]);
    assert.deepEqual(concurrent, [true, false, false]);
    assert.equal((await first.load(scope)).cursor, 'QaUser_000030');
    await assert.rejects(
        first.finish(scope, 'QaUser_000020'), /역행/
    );
    assert.equal(await second.finish(scope, 'QaUser_000030'), true);
    assert.equal(await first.finish(scope, 'QaUser_000030'), false);
    assert.equal(await first.commit(scope, 'QaUser_000100'), false);
    assert.deepEqual(await first.load(scope), {
        cursor: 'QaUser_000030', completed: true
    });
    console.log('PASS: 동시 갱신 시 단조 커서/완료 잠금 유지');

    const emptyScope = moboCheckpointScope(date, 'attendance', tick);
    assert.equal(await first.finish(emptyScope, null), true);
    assert.deepEqual(await second.load(emptyScope), {
        cursor: null, completed: true
    });
    assert.equal(await second.commit(emptyScope, 'QaUser_000001'), false);
    console.log('PASS: 대상 없는 실행도 완료로 기록·재시작 시 유지');

    const key = moboCheckpointDocId(otherKind);
    fake.data.set(key, {
        version: RECORD_VERSION, scope: 'unrelated',
        cursor: 'QaUser_000001', completed: false
    });
    await assert.rejects(
        first.load(otherKind), /저장 기록 오류/
    );
    assert.equal(fake.counts.transactions > 0, true);
    console.log('PASS: 저장 기록 변조·잘못된 scope 발견 시 중단');

    console.log('QA-046D-17 · Firestore checkpoint adapter PASS');
    console.log('실제 Firestore 연결 및 쓰기: 없음');
    console.log('Firebase 프로젝트 QA를 포함한 실사용 연결: 아직 미승인');
}

if (require.main === module) {
    runSelfTest().catch(error => {
        console.error('QA-046D-17 실패:', error.message);
        process.exitCode = 1;
    });
}
module.exports = {
    moboCheckpointDocId,
    moboCreateFirestoreCheckpointStore
};
