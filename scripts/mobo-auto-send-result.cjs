'use strict';

// QA-046D-12 | 이미 claim한 알림의 FCM 결과/기록 오류 분리
// 상태가 불명확한 경우 재발송을 허용하지 않고 needs_review로 보존
// 단독 실행은 로컬 메모리 테스트: Firebase·FCM 통신 없음
const assert = require('node:assert/strict');
const {
    claimDeliveryOnce,
    markDeliverySent,
    markDeliveryNeedsReview,
    makeDeliveryKey
} = require('./mobo-push-dedupe.cjs');

function makeOutcomeError(code, acceptedByFCM, cause) {
    const err = new Error(code);
    err.code = code;
    // true: FCM이 요청을 받아들인 사실 확인됨
    // null: 발송 성공 여부 확인 안 됨. 실패로 확정하지 않음
    err.fcmAccepted = acceptedByFCM;
    err.cause = cause;
    return err;
}

// claimDeliveryOnce(true) 이후에만 호출. 여기에서 claim을 해제하거나 재발송하지 않음.
async function moboCompleteClaimedSend({ db, uid, date, kind, send }) {
    if (!db || typeof send !== 'function') {
        throw new Error('발송 실행 정보가 올바르지 않습니다.');
    }

    try {
        await send();
    } catch (error) {
        try {
            await markDeliveryNeedsReview(db, uid, date, kind);
        } catch (reviewError) {
            // Firestore 업데이트 실패해도 최초 claim이 남아 중복 재발송 차단
            throw makeOutcomeError(
                'FCM_RESULT_UNCERTAIN_REVIEW_WRITE_FAILED',
                null,
                { sendError: error, reviewError }
            );
        }
        throw makeOutcomeError('FCM_RESULT_UNCERTAIN', null, error);
    }

    // FCM 요청 성공과 발송 기록 실패는 서로 다른 상태!
    try {
        await markDeliverySent(db, uid, date, kind);
    } catch (error) {
        throw makeOutcomeError(
            'FCM_ACCEPTED_STATUS_WRITE_FAILED',
            true,
            error
        );
    }

    return { fcmAccepted: true, status: 'sent' };
}

function fakeDb(opts = {}) {
    const docs = new Map();
    return {
        docs,
        collection(name) {
            assert.equal(name, 'pushDeliveryClaims');
            return {
                doc(id) {
                    return {
                        async create(data) {
                            if (docs.has(id)) {
                                const err = new Error('already exists');
                                err.code = 6;
                                throw err;
                            }
                            docs.set(id, { ...data });
                        },
                        async update(update) {
                            if (!docs.has(id)) {
                                throw new Error('missing claim');
                            }
                            if (update.status === 'sent' && opts.failSentWrite) {
                                throw new Error('simulated status write error');
                            }
                            if (
                                update.status === 'needs_review' &&
                                opts.failReviewWrite
                            ) {
                                throw new Error('simulated review write error');
                            }
                            docs.set(id, { ...docs.get(id), ...update });
                        }
                    };
                }
            };
        }
    };
}

async function runSelfTest() {
    const uid = 'QaGalaxyExample_123456';
    const date = '2026-11-12';
    const token = 'SECRET_FAKE_TOKEN_SHOULD_NOT_PERSIST';

    // 정상 FCM 승인, 정상 sent 기록
    const success = fakeDb();
    assert.equal(await claimDeliveryOnce(success, uid, date, 'serial'), true);
    let successSends = 0;
    assert.deepEqual(
        await moboCompleteClaimedSend({
            db: success, uid, date, kind: 'serial',
            send: async () => { successSends++; }
        }),
        { fcmAccepted: true, status: 'sent' }
    );
    assert.equal(successSends, 1);
    assert.equal(success.docs.get(makeDeliveryKey(uid, date, 'serial')).status, 'sent');
    assert.equal(await claimDeliveryOnce(success, uid, date, 'serial'), false);
    console.log('PASS: 정상 발송 승인 → sent, 동일 알림 재발송 차단');

    // FCM send가 에러를 반환하면 성공 여부 불명확 → 재발송 금지
    const uncertain = fakeDb();
    assert.equal(await claimDeliveryOnce(uncertain, uid, date, 'attendance'), true);
    let uncertainSends = 0;
    await assert.rejects(
        moboCompleteClaimedSend({
            db: uncertain, uid, date, kind: 'attendance',
            send: async () => {
                uncertainSends++;
                throw new Error(token);
            }
        }),
        error => error.code === 'FCM_RESULT_UNCERTAIN' &&
            error.fcmAccepted === null
    );
    const record = uncertain.docs.get(makeDeliveryKey(uid, date, 'attendance'));
    assert.equal(record.status, 'needs_review');
    assert.equal(record.reviewReason, 'FCM_SEND_RESULT_UNCERTAIN');
    assert.equal(JSON.stringify(record).includes(token), false);
    assert.equal(uncertainSends, 1);
    assert.equal(await claimDeliveryOnce(uncertain, uid, date, 'attendance'), false);
    console.log('PASS: FCM 오류 → needs_review, 토큰 미저장, 중복 차단');

    // FCM 성공했지만 Firestore sent 기록만 실패한 경우
    const accepted = fakeDb({ failSentWrite: true });
    assert.equal(await claimDeliveryOnce(accepted, uid, date, 'expire'), true);
    let acceptedSends = 0;
    await assert.rejects(
        moboCompleteClaimedSend({
            db: accepted, uid, date, kind: 'expire',
            send: async () => { acceptedSends++; }
        }),
        error => error.code === 'FCM_ACCEPTED_STATUS_WRITE_FAILED' &&
            error.fcmAccepted === true
    );
    assert.equal(acceptedSends, 1);
    assert.equal(accepted.docs.get(makeDeliveryKey(uid, date, 'expire')).status, 'claimed');
    assert.equal(await claimDeliveryOnce(accepted, uid, date, 'expire'), false);
    console.log('PASS: FCM 승인 후 기록 실패는 발송 성공 가능성 유지');

    // FCM 오류 + review 기록 실패 -> claim 자체는 잔존
    const doubleFailure = fakeDb({ failReviewWrite: true });
    assert.equal(
        await claimDeliveryOnce(doubleFailure, uid, '2026-11-13', 'serial'),
        true
    );
    await assert.rejects(
        moboCompleteClaimedSend({
            db: doubleFailure, uid, date: '2026-11-13', kind: 'serial',
            send: async () => { throw new Error('network timeout'); }
        }),
        error => error.code === 'FCM_RESULT_UNCERTAIN_REVIEW_WRITE_FAILED' &&
            error.fcmAccepted === null
    );
    assert.equal(
        doubleFailure.docs.get(makeDeliveryKey(uid, '2026-11-13', 'serial')).status,
        'claimed'
    );
    assert.equal(
        await claimDeliveryOnce(doubleFailure, uid, '2026-11-13', 'serial'),
        false
    );
    console.log('PASS: FCM/상태 기록 이중 실패에도 중복 발송 차단');

    console.log('QA-046D-12 · FCM 결과·claim 상태 검증 PASS');
    console.log('자동 재발송: 없음 / 실제 FCM 전송: 없음 / 원격 DB 변경: 없음');
}

if (require.main === module) {
    runSelfTest().catch(error => {
        console.error('QA-046D-12 실패:', error.message);
        process.exitCode = 1;
    });
}

module.exports = { moboCompleteClaimedSend };
