
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

// ==========================================
// MoBo QA-044E-3B
// 자동 푸시 중복 방지 공통 모듈
//
// 파일 단독 실행: 메모리 테스트만 수행
// 실제 발송: 없음
// Firestore 수정: 없음
// ==========================================

const COLLECTION = 'pushDeliveryClaims';

// 기기 + 날짜 + 알림 종류를 하나의 식별자로 변환
function makeDeliveryKey(uid, date, kind) {
    if (
        typeof uid !== 'string' ||
        !/^[A-Za-z0-9_-]{8,128}$/.test(uid)
    ) {
        throw new Error('UID 형식이 올바르지 않아요.');
    }

    if (
        typeof date !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(date)
    ) {
        throw new Error('날짜 형식이 올바르지 않아요.');
    }

    const parsed = new Date(date + 'T00:00:00Z');

    if (
        !Number.isFinite(parsed.getTime()) ||
        parsed.toISOString().slice(0, 10) !== date
    ) {
        throw new Error('존재하지 않는 날짜예요.');
    }

    if (!['serial', 'expire'].includes(kind)) {
        throw new Error('알림 종류가 올바르지 않아요.');
    }

    return crypto
        .createHash('sha256')
        .update(`mobo-v1|${uid}|${date}|${kind}`)
        .digest('hex');
}

// 첫 번째 실행만 처리 권한 확보
async function claimDeliveryOnce(db, uid, date, kind) {
    const id = makeDeliveryKey(uid, date, kind);

    const ref = db.collection(COLLECTION).doc(id);

    try {
        // 이미 존재하는 문서는 덮어쓰지 않음
        await ref.create({
            version: 1,
            date,
            kind,
            status: 'claimed',
            claimedAt: new Date().toISOString()
        });

        return true;

    } catch (error) {
        // Firestore ALREADY_EXISTS
        if (
            error.code === 6 ||
            error.code === 'already-exists'
        ) {
            return false;
        }

        // 다른 오류를 중복으로 오인하지 않음
        throw error;
    }
}

// 실제 FCM 발송 요청 성공 후 상태 기록용
async function markDeliverySent(db, uid, date, kind) {
    const id = makeDeliveryKey(uid, date, kind);

    await db.collection(COLLECTION).doc(id).update({
        status: 'sent',
        sentAt: new Date().toISOString()
    });
}

// ==========================================
// QA-044E-3B-1 | 메모리 기반 자체 테스트
// Firebase 접속 및 데이터 변경 없음
// ==========================================

async function runSelfTest() {
    const records = new Set();

    // Firestore create 동작을 흉내 낸 테스트 객체
    const fakeDb = {
        collection() {
            return {
                doc(id) {
                    return {
                        async create() {
                            if (records.has(id)) {
                                const error = new Error('Already exists');
                                error.code = 6;
                                throw error;
                            }

                            records.add(id);
                        }
                    };
                }
            };
        }
    };

    const pc = 'PcExampleUid_12345';
    const galaxy = 'GalaxyExampleUid_12345';
    const date = '2026-11-10';

    // 같은 조건이면 항상 같은 키
    assert.equal(
        makeDeliveryKey(pc, date, 'serial'),
        makeDeliveryKey(pc, date, 'serial')
    );

    // 다른 기기라면 다른 키
    assert.notEqual(
        makeDeliveryKey(pc, date, 'serial'),
        makeDeliveryKey(galaxy, date, 'serial')
    );

    // 다른 알림 종류라면 다른 키
    assert.notEqual(
        makeDeliveryKey(pc, date, 'serial'),
        makeDeliveryKey(pc, date, 'expire')
    );

    // 다른 날짜라면 다른 키
    assert.notEqual(
        makeDeliveryKey(pc, date, 'serial'),
        makeDeliveryKey(pc, '2026-11-11', 'serial')
    );

    // 첫 번째 실행은 처리 권한 확보
    assert.equal(
        await claimDeliveryOnce(fakeDb, pc, date, 'serial'),
        true
    );

    // 같은 알림의 두 번째 실행은 차단
    assert.equal(
        await claimDeliveryOnce(fakeDb, pc, date, 'serial'),
        false
    );

    // 다른 기기에는 별도 처리 허용
    assert.equal(
        await claimDeliveryOnce(fakeDb, galaxy, date, 'serial'),
        true
    );

    // 다른 알림 종류도 별도 처리 허용
    assert.equal(
        await claimDeliveryOnce(fakeDb, pc, date, 'expire'),
        true
    );

    // 동시에 두 번 실행되어도 한 번만 허용
    const results = await Promise.all([
        claimDeliveryOnce(fakeDb, pc, '2026-11-11', 'serial'),
        claimDeliveryOnce(fakeDb, pc, '2026-11-11', 'serial')
    ]);

    assert.deepEqual(results.sort(), [false, true]);

    console.log('MoBo QA-044E-3B · 중복 방지 자체 테스트');
    console.log('PASS: 동일 조건 키 일치');
    console.log('PASS: 다른 기기 구분');
    console.log('PASS: 다른 날짜 구분');
    console.log('PASS: 다른 알림 종류 구분');
    console.log('PASS: 첫 번째 실행 허용');
    console.log('PASS: 두 번째 실행 차단');
    console.log('PASS: 동시 실행 중복 차단');
    console.log('실제 푸시 발송: 없음');
    console.log('실제 Firestore 데이터 변경: 없음');
}

if (require.main === module) {
    runSelfTest().catch(error => {
        console.error('QA-044E-3B 테스트 실패:', error.message);
        process.exitCode = 1;
    });
}

module.exports = {
    makeDeliveryKey,
    claimDeliveryOnce,
    markDeliverySent
};
