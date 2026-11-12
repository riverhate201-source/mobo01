'use strict';

// QA-046D-13 | 알림 기록 감사: 읽기 전용 / 자동 재발송·수정·삭제 없음
// 단독 실행은 메모리 테스트. --qa-read는 지정된 QA UID의 오늘·어제 6건만 조회.
const assert = require('node:assert/strict');
const { moboKSTDate } = require('./mobo-scheduler-clock.cjs');
const { makeDeliveryKey } = require('./mobo-push-dedupe.cjs');

const KINDS = Object.freeze(['serial', 'expire', 'attendance']);
const MAX_PENDING_MS = 30 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const QA_PROJECT = 'mobo-qa-2026';

function isISO(value) {
    if (typeof value !== 'string') return false;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) &&
        date.toISOString() === value;
}

function auditClaim(record, expectedDate, expectedKind, now) {
    if (record == null) return 'NO_CLAIM'; // 후보 없음과 누락은 구별 불가
    if (!record || typeof record !== 'object' ||
        record.version !== 1 ||
        record.date !== expectedDate ||
        record.kind !== expectedKind ||
        !isISO(record.claimedAt) ||
        !Number.isFinite(now) ||
        Date.parse(record.claimedAt) > now) {
        return 'REVIEW_INVALID_RECORD';
    }
    if (record.status === 'sent') {
        return isISO(record.sentAt) &&
            Date.parse(record.sentAt) >= Date.parse(record.claimedAt)
            ? 'FCM_ACCEPTED' : 'REVIEW_INVALID_RECORD';
    }
    if (record.status === 'needs_review') {
        return 'REVIEW_UNCERTAIN';
    }
    if (record.status === 'claimed') {
        return now - Date.parse(record.claimedAt) >= MAX_PENDING_MS
            ? 'REVIEW_STALE_CLAIM' : 'PENDING';
    }
    return 'REVIEW_INVALID_RECORD';
}

function recentKSTDates(now) {
    const today = moboKSTDate(now);
    const yesterday = new Date(
        Date.parse(today + 'T00:00:00Z') - DAY_MS
    ).toISOString().slice(0, 10);
    return [today, yesterday];
}

// 주입된 fakeDb에도 안전: 오직 doc(id).get() 사용
async function auditQAClaims(db, uid, now) {
    if (!db || !Number.isFinite(now)) throw new Error('감사 인수 오류');
    const dates = recentKSTDates(now);
    const rows = [];
    for (const date of dates) {
        for (const kind of KINDS) {
            const id = makeDeliveryKey(uid, date, kind);
            const snapshot = await db.collection('pushDeliveryClaims')
                .doc(id).get();
            const record = snapshot.exists ? snapshot.data() : null;
            rows.push({
                date, kind,
                status: auditClaim(record, date, kind, now)
            });
        }
    }
    return {
        reviewedDates: dates,
        totals: {
            accepted: rows.filter(x => x.status === 'FCM_ACCEPTED').length,
            pending: rows.filter(x => x.status === 'PENDING').length,
            noClaim: rows.filter(x => x.status === 'NO_CLAIM').length,
            needsReview: rows.filter(x => x.status.startsWith('REVIEW_')).length
        },
        // UID, 해시 문서 ID, 토큰, Firebase 인증값은 반환하거나 로깅하지 않음
        itemsNeedingReview: rows.filter(x => x.status.startsWith('REVIEW_'))
    };
}

function validateReadOnlyEnv(env) {
    if (env?.MOBO_CLAIM_AUDIT_MODE !== 'READ_ONLY' ||
        env?.MOBO_AUTO_MODE !== 'PREVIEW' ||
        env?.MOBO_AUTO_LIVE_CONFIRM !== 'NO' ||
        typeof env?.MOBO_AUTO_TEST_UID !== 'string' ||
        !/^[A-Za-z0-9_-]{8,128}$/.test(env.MOBO_AUTO_TEST_UID)) {
        throw new Error('QA 기록 조회 거부: 읽기 전용 조건 불일치');
    }

    let creds;
    try {
        creds = JSON.parse(env.MOBO_FIREBASE_SERVICE_ACCOUNT);
    } catch {
        throw new Error('QA 기록 조회 거부: 인증 정보 오류');
    }
    if (creds?.project_id !== QA_PROJECT) {
        throw new Error('QA 기록 조회 거부: 프로젝트 불일치');
    }
    return creds;
}

async function runQAReadAudit(env) {
    const credentials = validateReadOnlyEnv(env);
    // Firebase Admin SDK는 원격 읽기 실행 때만 로드
    const { initializeApp, cert } = require('firebase-admin/app');
    const { getFirestore } = require('firebase-admin/firestore');
    const app = initializeApp({ credential: cert(credentials) });
    const now = Date.now();
    try {
        const result = await auditQAClaims(
            getFirestore(app), env.MOBO_AUTO_TEST_UID, now
        );
        console.log('MoBo QA-046D-13 · 최근 QA 알림 기록 읽기 전용 보고');
        console.log('조회 날짜(KST):', result.reviewedDates.join(', '));
        console.log('FCM 승인 확인:', result.totals.accepted);
        console.log('처리 중인 기록:', result.totals.pending);
        console.log('기록 없음(발송 대상 여부 미판정):', result.totals.noClaim);
        console.log('수동 확인 필요한 기록:', result.totals.needsReview);
        for (const item of result.itemsNeedingReview) {
            // 토큰이나 UID 등 식별 정보를 표시하지 않음
            console.warn('수동 확인:', item.date, item.kind, item.status);
        }
        console.log('자동 재발송/기록 변경/삭제: 없음');
        return result;
    } finally {
        await app.delete();
    }
}

async function runSelfTest() {
    const now = Date.parse('2026-11-12T22:30:00+09:00');
    const uid = 'SyntheticQaUid_12345678';
    const [today, yesterday] = recentKSTDates(now);
    assert.deepEqual([today, yesterday], ['2026-11-12', '2026-11-11']);
    const claimedAt = new Date(now - 60 * 60 * 1000).toISOString();
    const freshAt = new Date(now - 5 * 60 * 1000).toISOString();
    const docs = new Map();
    const put = (date, kind, record) => {
        docs.set(makeDeliveryKey(uid, date, kind), record);
    };
    const record = (date, kind, claimed, status, extra = {}) => ({
        version: 1, date, kind, claimedAt: claimed, status, ...extra
    });
    put(today, 'serial', record(today, 'serial', claimedAt, 'sent', {
        sentAt: new Date(now - 59 * 60 * 1000).toISOString()
    }));
    put(today, 'expire', record(today, 'expire', freshAt, 'claimed'));
    put(today, 'attendance', record(
        today, 'attendance', claimedAt, 'needs_review',
        {reviewReason: 'FCM_SEND_RESULT_UNCERTAIN'}
    ));
    put(yesterday, 'serial', record(yesterday, 'serial', claimedAt, 'claimed'));
    put(yesterday, 'attendance', record(
        yesterday, 'attendance', claimedAt, 'sent',
        {sentAt: new Date(now - 59 * 60 * 1000).toISOString()}
    ));

    let reads = 0;
    const db = {
        collection(name) {
            assert.equal(name, 'pushDeliveryClaims');
            return {
                doc(id) {
                    return {
                        async get() {
                            reads++;
                            return {
                                exists: docs.has(id),
                                data: () => docs.get(id)
                            };
                        }
                    };
                }
            };
        }
    };

    const result = await auditQAClaims(db, uid, now);
    assert.equal(reads, 6);
    assert.deepEqual(result.totals, {
        accepted: 2, pending: 1, noClaim: 1, needsReview: 2
    });
    assert.deepEqual(result.itemsNeedingReview, [
        {date: today, kind: 'attendance', status: 'REVIEW_UNCERTAIN'},
        {date: yesterday, kind: 'serial', status: 'REVIEW_STALE_CLAIM'}
    ]);
    console.log('PASS: 지정 QA 기기 최근 2일 6건만 읽기');
    console.log('PASS: 정상·진행 중·미기록·확인 필요 상태 구분');

    assert.equal(auditClaim(record(today, 'serial', claimedAt, 'unknown'), today, 'serial', now), 'REVIEW_INVALID_RECORD');
    assert.equal(auditClaim(record(today, 'serial', new Date(now+1000).toISOString(), 'claimed'), today, 'serial', now), 'REVIEW_INVALID_RECORD');
    assert.equal(auditClaim(record(today, 'serial', claimedAt, 'sent'), today, 'serial', now), 'REVIEW_INVALID_RECORD');
    assert.equal(auditClaim(null, today, 'serial', now), 'NO_CLAIM');

    const env = {
        MOBO_CLAIM_AUDIT_MODE: 'READ_ONLY',
        MOBO_AUTO_MODE: 'PREVIEW',
        MOBO_AUTO_LIVE_CONFIRM: 'NO',
        MOBO_AUTO_TEST_UID: uid,
        MOBO_FIREBASE_SERVICE_ACCOUNT: JSON.stringify({
            project_id: QA_PROJECT
        })
    };
    assert.equal(validateReadOnlyEnv(env).project_id, QA_PROJECT);
    for (const change of [
        {MOBO_CLAIM_AUDIT_MODE: 'WRITE'},
        {MOBO_AUTO_MODE: 'LIVE'},
        {MOBO_AUTO_LIVE_CONFIRM: 'YES'},
        {MOBO_AUTO_TEST_UID: ''},
        {MOBO_FIREBASE_SERVICE_ACCOUNT: '{"project_id":"mobo-prod"}'}
    ]) {
        assert.throws(
            () => validateReadOnlyEnv({ ...env, ...change }),
            /QA 기록 조회 거부/
        );
    }
    console.log('PASS: LIVE·실사용 프로젝트·잘못된 상태 잠금');
    console.log('QA-046D-13 · 기록 상태 감사 PASS');
    console.log('실제 FCM/Firestore 접근 없음 · 자동 재발송 없음');
}

if (require.main === module) {
    const runner = process.argv.includes('--qa-read')
        ? runQAReadAudit(process.env)
        : runSelfTest();
    runner.catch(error => {
        console.error('QA-046D-13 실패:', error.message);
        process.exitCode = 1;
    });
}
module.exports = {
    auditClaim, recentKSTDates, auditQAClaims, validateReadOnlyEnv
};
