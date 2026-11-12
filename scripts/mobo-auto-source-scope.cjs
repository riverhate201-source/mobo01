'use strict';

// QA-046D-14 | QA 스케줄러 데이터 읽기 범위 제한
// TEST_UID가 없으면 전체 DB를 스캔하는 대신 실행을 거부.
// Firebase SDK 직접 호출은 주입된 db만 사용. 단독 실행은 메모리 테스트.
const assert = require('node:assert/strict');

const UID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

function moboAssertScopedUID(uid) {
    if (typeof uid !== 'string' || !UID_PATTERN.test(uid)) {
        throw new Error('QA 대상 UID 없음/형식 오류: 전체 조회 차단');
    }
    return uid;
}

async function moboReadScopedSources(db, uid) {
    moboAssertScopedUID(uid);
    if (!db || typeof db.collection !== 'function') {
        throw new Error('QA 읽기 데이터베이스 연결 없음');
    }

    // 단일 기기 문서만 읽음: 전체 컬렉션 .get() 사용 금지.
    const [sub, schedule] = await Promise.all([
        db.collection('pushSubscriptions').doc(uid).get(),
        db.collection('pushSchedules').doc(uid).get()
    ]);

    function toQueryLike(snapshot) {
        if (!snapshot || typeof snapshot.exists !== 'boolean' ||
            snapshot.exists && (snapshot.id !== uid ||
                typeof snapshot.data !== 'function')) {
            throw new Error('QA 단일 문서 응답이 올바르지 않습니다.');
        }
        const docs = snapshot.exists ? [snapshot] : [];
        return { docs, size: docs.length };
    }

    return {
        subscriptions: toQueryLike(sub),
        schedules: toQueryLike(schedule)
    };
}

async function runSelfTest() {
    const uid = 'SyntheticQaUid_123456789';
    const reads = [];
    const values = {
        pushSubscriptions: { enabled: true, timezone: 'Asia/Seoul' },
        pushSchedules: { version: 2, days: [] }
    };
    const fakeDb = {
        collection(name) {
            assert.ok(Object.hasOwn(values, name));
            return {
                get() { throw new Error('FORBIDDEN COLLECTION SCAN'); },
                doc(requestedUID) {
                    assert.equal(requestedUID, uid);
                    return {
                        async get() {
                            reads.push(name);
                            return {
                                id: uid,
                                exists: true,
                                data() { return values[name]; }
                            };
                        }
                    };
                }
            };
        }
    };
    const result = await moboReadScopedSources(fakeDb, uid);
    assert.equal(result.subscriptions.size, 1);
    assert.equal(result.schedules.size, 1);
    assert.equal(result.subscriptions.docs[0].id, uid);
    assert.deepEqual(
        reads.sort(),
        ['pushSchedules', 'pushSubscriptions']
    );
    console.log('PASS: 전체 컬렉션 조회 없이 구독·일정 2개 문서만 조회');

    // 없는 일정/구독은 빈 스냅샷으로 처리. 전체 검색으로 대체하지 않음.
    const missingDb = {
        collection(name) {
            return {
                get() { throw new Error('FORBIDDEN COLLECTION SCAN'); },
                doc() {
                    return {
                        async get() {
                            return {
                                id: uid,
                                exists: name === 'pushSubscriptions',
                                data() { return {enabled: false}; }
                            };
                        }
                    };
                }
            };
        }
    };
    const missing = await moboReadScopedSources(missingDb, uid);
    assert.equal(missing.subscriptions.size, 1);
    assert.equal(missing.schedules.size, 0);
    assert.deepEqual(missing.schedules.docs, []);
    console.log('PASS: 데이터가 없어도 전체 읽기로 우회하지 않음');

    for (const bad of ['', null, 'x', 'invalid/uid', 'a'.repeat(129)]) {
        await assert.rejects(
            moboReadScopedSources(fakeDb, bad),
            /전체 조회 차단/
        );
    }
    console.log('PASS: UID 미설정/비정상인 경우 fail-closed');

    const badResponseDb = {
        collection() {
            return {
                doc() {
                    return {
                        async get() {
                            return { id: 'OtherUid_123456', exists: true,
                                data: () => ({}) };
                        }
                    };
                }
            };
        }
    };
    await assert.rejects(
        moboReadScopedSources(badResponseDb, uid),
        /단일 문서 응답/
    );
    console.log('PASS: 다른 UID 문서 반환 시 즉시 차단');

    const failureDb = {
        collection() {
            return {
                doc() {
                    return {
                        async get() { throw new Error('QA_FIRESTORE_READ_FAILED'); }
                    };
                }
            };
        }
    };
    await assert.rejects(
        moboReadScopedSources(failureDb, uid),
        /QA_FIRESTORE_READ_FAILED/
    );
    console.log('PASS: Firestore 조회 실패를 빈 결과로 숨기지 않음');

    console.log('QA-046D-14 · UID 범위 제한·전체 스캔 방지 PASS');
    console.log('원격 Firebase 접근: 없음 / 실제 FCM 발송: 없음');
}

if (require.main === module) {
    runSelfTest().catch(error => {
        console.error('QA-046D-14 실패:', error.message);
        process.exitCode = 1;
    });
}

module.exports = {
    moboAssertScopedUID,
    moboReadScopedSources
};
