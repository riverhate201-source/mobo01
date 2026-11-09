
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const {
    makeDeliveryKey,
    claimDeliveryOnce,
    markDeliverySent
} = require('./mobo-push-dedupe.cjs');

// ==========================================
// MoBo QA-044E-3B-2
// 실제 Firestore 중복 방지 검증
//
// 테스트 전용 임시 문서 1개 사용
// 종료 시 임시 문서 삭제
// 실제 푸시 발송 없음
// ==========================================

async function main() {
    const secret = process.env.MOBO_FIREBASE_SERVICE_ACCOUNT;

    if (!secret) {
        throw new Error('Firebase 인증 정보가 없어요.');
    }

    const serviceAccount = JSON.parse(secret);

    if (serviceAccount.project_id !== 'mobo-web-2026') {
        throw new Error('Firebase 프로젝트가 일치하지 않아요.');
    }

    initializeApp({
        credential: cert(serviceAccount)
    });

    const db = getFirestore();

    // 실제 사용자의 UID 대신 일회성 가상 UID 사용
    const uid =
        'MoBoQA3B_' + crypto.randomBytes(16).toString('hex');

    // 한국 시간 기준 테스트 날짜
    const date = new Date(Date.now() + 9 * 3600000)
        .toISOString()
        .slice(0, 10);

    const kind = 'serial';

    const id = makeDeliveryKey(uid, date, kind);

    const ref = db
        .collection('pushDeliveryClaims')
        .doc(id);

    console.log('MoBo QA-044E-3B-2');
    console.log('실제 Firestore 동시 요청 테스트 시작');
    console.log('실제 푸시 발송: 없음');
    console.log('테스트 문서 ID:', id);

    try {
        // 실제 Firestore에 5건 동시 요청
        const settled = await Promise.allSettled(
            Array.from({ length: 5 }, () =>
                claimDeliveryOnce(db, uid, date, kind)
            )
        );

        const failures = settled.filter(
            item => item.status === 'rejected'
        );

        if (failures.length > 0) {
            throw failures[0].reason;
        }

        const results = settled.map(item => item.value);

        const accepted = results.filter(
            value => value === true
        ).length;

        const blocked = results.filter(
            value => value === false
        ).length;

        assert.equal(accepted, 1);
        assert.equal(blocked, 4);

        console.log('PASS: 5건 동시 요청 중 1건 성공');
        console.log('PASS: 나머지 4건 중복 차단');

        // Firestore에 생성된 상태 확인
        const snapshot = await ref.get();

        assert.equal(snapshot.exists, true);
        assert.equal(snapshot.data().status, 'claimed');

        console.log('PASS: Firestore 처리 기록 생성');

        // 같은 조건으로 다시 요청
        const retry = await claimDeliveryOnce(
            db, uid, date, kind
        );

        assert.equal(retry, false);

        console.log('PASS: 재실행 중복 차단');

        // 실제 메시지는 보내지 않고 상태 변경만 검증
        await markDeliverySent(db, uid, date, kind);

        const sentSnapshot = await ref.get();

        assert.equal(
            sentSnapshot.data().status,
            'sent'
        );

        console.log('PASS: 발송 완료 상태 기록');

    } finally {
        // 이 실행에서 생성한 가상 UID의
        // 테스트 문서만 정리
        await ref.delete();

        const remaining = await ref.get();

        assert.equal(remaining.exists, false);

        console.log('PASS: 임시 테스트 문서 삭제 확인');
    }

    console.log('실제 푸시 발송: 없음');
    console.log('기존 구독·일정 데이터 변경: 없음');
    console.log('QA-044E-3B-2 테스트 완료');
}

main().catch(error => {
    console.error(
        'QA-044E-3B-2 실패:',
        error.message
    );
    process.exitCode = 1;
});
