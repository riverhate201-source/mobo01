
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

// ==========================================
// MoBo QA-044E-2 | 지정 기기 테스트 푸시
// DRY_RUN: 실제 알림 발송 없음
// SEND_ONCE: 지정한 기기에 1회 발송
// ==========================================

async function main() {
    const secret = process.env.MOBO_FIREBASE_SERVICE_ACCOUNT;
    const uid = process.env.MOBO_TEST_UID?.trim();
    const mode = process.env.MOBO_SEND_MODE || 'DRY_RUN';

    if (!secret || !uid) {
        throw new Error('필수 GitHub Secret이 없어요.');
    }

    if (!['DRY_RUN', 'SEND_ONCE'].includes(mode)) {
        throw new Error('올바르지 않은 실행 모드예요.');
    }

    const serviceAccount = JSON.parse(secret);

    if (serviceAccount.project_id !== 'mobo-qa-2026') {
        throw new Error('Firebase 프로젝트가 일치하지 않아요.');
    }

    initializeApp({
        credential: cert(serviceAccount)
    });

    // 전체 사용자 조회 X
    // 지정한 UID의 구독 문서만 조회
    const snapshot = await getFirestore()
        .collection('pushSubscriptions')
        .doc(uid)
        .get();

    if (!snapshot.exists) {
        throw new Error('테스트 기기 등록 문서가 없어요.');
    }

    const subscription = snapshot.data();

    if (
        subscription.enabled !== true ||
        typeof subscription.token !== 'string' ||
        subscription.token.length < 20
    ) {
        throw new Error('테스트 기기의 알림이 활성화되지 않았어요.');
    }

    const message = {
        token: subscription.token,

        notification: {
            title: 'MoBo 테스트 알림 💗',
            body: '모보의 푸시 알림이 정상적으로 도착했어요!'
        },

        webpush: {
            headers: {
                TTL: '60'
            }
        }
    };

    const dryRun = mode !== 'SEND_ONCE';

    console.log('MoBo QA-044E-2');
    console.log('대상: 지정된 테스트 기기 1대');
    console.log('실행 모드:', mode);

    // 테스트 모드에서는 발송 없이 FCM 검증
    // 실제 발송 모드는 명시적 선택이 필요
    await getMessaging().send(message, dryRun);

    if (dryRun) {
        console.log('PASS: FCM 발송 요청 검증 완료');
        console.log('실제 알림 발송: 없음');
    } else {
        console.log('PASS: FCM 메시지 접수 완료');
        console.log('발송 요청 수: 1건');
        console.log('실제 수신 여부는 기기에서 확인 필요');
    }

    console.log('Firestore 데이터 변경: 없음');
}

main().catch(error => {
    console.error(
        'MoBo 테스트 실패:',
        error.code || error.name || 'unknown-error'
    );
    process.exitCode = 1;
});
