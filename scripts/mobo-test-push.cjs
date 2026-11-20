
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const { moboBuildSerialNotificationBody } =
    require('./mobo-auto-notification-text.cjs');

const { moboQAPushTargets, moboAssertQAPushTargets } =
    require('./mobo-qa-push-targets.cjs');
const QA_PUSH_TARGETS = moboQAPushTargets();
moboAssertQAPushTargets(QA_PUSH_TARGETS);

// ==========================================
// MoBo QA-044E-2 | 지정 기기 테스트 푸시
// DRY_RUN: 실제 알림 발송 없음
// SEND_ONCE: 지정한 기기에 1회 발송
// ==========================================


// QA-046E-3 | 실데이터를 읽어 FCM 검증 또는 명시적 수동 QA 발송에서 사용할 본문 생성
// QA-046E-4 | 실제 수신 시험은 Galaxy + 명시적 YES만 허용.
function moboAssertManualTitleSendGate(mode, kind, device, approval) {
    if (kind === 'SERIAL_TITLES_QA' && mode === 'SEND_ONCE' &&
        (device !== 'GALAXY' || approval !== 'YES')) {
        throw new Error('작품명 실제 발송은 갤럭시 1대 승인시에만 가능해요.');
    }
    return true;
}

function moboBuildTitleDryRunBody(sub, schedule, now) {
    if (sub?.serialTitles !== true || sub?.serial !== true) {
        throw new Error('작품명 표시 설정을 먼저 켜야 해요.');
    }
    const currentKST = new Date(now + 9 * 3600000)
        .toISOString().slice(0, 10);
    const matches = Array.isArray(schedule?.days)
        ? schedule.days.flatMap(entry => {
            if (typeof entry !== 'string') return [];
            const m = /^(20\d{2}-\d{2}-\d{2})~([1-9]\d{0,4})~([0-4])$/.exec(entry);
            if (!m || m[1] < currentKST) return [];
            const count = Number(m[2]);
            const titles = schedule?.serialTitlesByDate?.[m[1]];
            if (!Number.isSafeInteger(count) || count > 10000 ||
                !Array.isArray(titles) || titles.length < 1) return [];
            return [{date:m[1],count}];
        })
        : [];
    matches.sort((a,b) => a.date.localeCompare(b.date));
    if (!matches.length) {
        throw new Error('작품명 검증용 예정 일정이 없어요.');
    }
    const {date,count} = matches[0];
    const body = moboBuildSerialNotificationBody(count,date,sub,schedule);
    if (!body.startsWith('확인할 연재 작품 ' + count + '개가 있어요!\n')) {
        throw new Error('작품명 검증 문구 생성에 실패했어요.');
    }
    return body;
}

function moboRunTitleDryRunSelfTest() {
    const now=Date.parse('2026-11-20T10:00:00+09:00');
    const sub={serial:true,serialTitles:true};
    const schedule={
        days:['2026-11-19~1~0','2026-11-20~5~0','2026-11-21~2~0'],
        serialTitlesByDate:{
            '2026-11-19':['어제 작품'],
            '2026-11-20':[
                '레진 · 작품 A','봄툰 · 작품 B',
                '리디 · 작품 C','레진 · 네 번째 작품'
            ],
            '2026-11-21':['내일 작품']
        }
    };
    const body=moboBuildTitleDryRunBody(sub,schedule,now);
    assert.equal(body,
        '확인할 연재 작품 5개가 있어요!\n' +
        '레진 · 작품 A\n봄툰 · 작품 B\n리디 · 작품 C\n' +
        '외 2개 작품은 모보에서 확인해 주세요.');
    assert.equal(body.includes('어제 작품'),false);
    assert.equal(body.includes('네 번째 작품'),false);
    assert.equal(body.includes('내일 작품'),false);
    assert.throws(()=>moboBuildTitleDryRunBody(
        {...sub,serialTitles:false},schedule,now),
        /작품명 표시 설정/);
    assert.throws(()=>moboBuildTitleDryRunBody(
        sub,{days:[],serialTitlesByDate:{}},now),
        /예정 일정/);
    assert.equal(moboAssertManualTitleSendGate(
        'DRY_RUN','SERIAL_TITLES_QA','GALAXY','NO'),true);
    assert.equal(moboAssertManualTitleSendGate(
        'SEND_ONCE','SERIAL_TITLES_QA','GALAXY','YES'),true);
    assert.throws(()=>moboAssertManualTitleSendGate(
        'SEND_ONCE','SERIAL_TITLES_QA','GALAXY','NO'),/승인/);
    assert.throws(()=>moboAssertManualTitleSendGate(
        'SEND_ONCE','SERIAL_TITLES_QA','PC','YES'),/승인/);
    console.log('QA-046E-4 PASS: Galaxy one-shot requires explicit YES; PC blocked');
    console.log('QA-046E-3 PASS: dry-run 3 titles, current date, OFF/empty blocked');
}

async function main() {
    const secret = process.env.MOBO_FIREBASE_SERVICE_ACCOUNT;
    const uid = process.env.MOBO_TEST_UID?.trim();
    const mode = process.env.MOBO_SEND_MODE || 'DRY_RUN';
    const messageKind =
        process.env.MOBO_TEST_MESSAGE_KIND || 'STANDARD';
    if (!secret || !uid) {
        throw new Error('필수 GitHub Secret이 없어요.');
    }

    if (!['DRY_RUN', 'SEND_ONCE'].includes(mode)) {
        throw new Error('올바르지 않은 실행 모드예요.');
    }
    if (!['STANDARD', 'ATTENDANCE_QA', 'SERIAL_TITLES_QA'].includes(messageKind)) {
        throw new Error('올바르지 않은 테스트 알림 종류예요.');
    }
    moboAssertManualTitleSendGate(
        mode, messageKind,
        process.env.MOBO_TEST_DEVICE,
        process.env.MOBO_QA_TITLES_SEND_CONFIRM
    );

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

        // QA-045G-7 | 발송 대상 식별값 확인
    // UID와 FCM 토큰 원문은 출력하지 않음
    const fingerprint = (value) =>
        createHash('sha256')
            .update(value, 'utf8')
            .digest('hex')
            .slice(0, 12);

    console.log('QA 발송 대상 확인');
    console.log('UID 식별값:', fingerprint(uid));
    console.log(
        'FCM 토큰 식별값:',
        fingerprint(subscription.token)
    );

       // QA-046C-3C | 실제 출석 기록과 무관한 가상 알림
    const attendanceQa = messageKind === 'ATTENDANCE_QA';
    const serialTitlesQa = messageKind === 'SERIAL_TITLES_QA';
    let serialQaBody = '';
    if (serialTitlesQa) {
        const scheduleSnapshot = await getFirestore()
            .collection('pushSchedules').doc(uid).get();
        if (!scheduleSnapshot.exists) {
            throw new Error('작품명 검증용 일정 문서가 없어요.');
        }
        serialQaBody = moboBuildTitleDryRunBody(
            subscription, scheduleSnapshot.data(), Date.now()
        );
    }

    const message = {
        token: subscription.token,

        notification: {
            title: serialTitlesQa
                ? 'MoBo 연재 알림 📚 [QA · 검증 전용]'
                : attendanceQa
                    ? 'MoBo 미출석 알림 ⏰ [QA]'
                    : 'MoBo 테스트 알림 💗',

            body: serialTitlesQa
                ? serialQaBody
                : attendanceQa
                    ? '가상 테스트: 레진·봄툰 출석 확인이 남아 있어요. 실제 출석 기록과 무관합니다.'
                    : '모보의 푸시 알림이 정상적으로 도착했어요!'
        },

            webpush: {
            // QA-045I | 백그라운드 푸시 전달 테스트
headers: {
    TTL: '600',
    Urgency: 'high'
},

            notification: {
                icon: QA_PUSH_TARGETS.icon,
                badge: QA_PUSH_TARGETS.badge
            },

            fcmOptions: {
                link: QA_PUSH_TARGETS.link
            }
        }
    };

    const dryRun = mode !== 'SEND_ONCE';

    console.log('MoBo QA-044E-2');
    console.log('대상: 지정된 테스트 기기 1대');
    console.log('실행 모드:', mode);
    console.log('테스트 알림 종류:', messageKind);

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


// QA-045H-3 | 테스트 실패 원인 진단
// 사전에 정의된 안전한 오류 메시지만 출력
// UID, FCM 토큰, 서비스 계정 정보는 출력하지 않음
if (process.argv.includes('--qa-serial-payload-self-test')) {
    moboRunTitleDryRunSelfTest();
} else main().catch(error => {
    const knownMessages = new Set([
        '필수 GitHub Secret이 없어요.',
        '올바르지 않은 실행 모드예요.',
        '올바르지 않은 테스트 알림 종류예요.',
        'Firebase 프로젝트가 일치하지 않아요.',
        '테스트 기기 등록 문서가 없어요.',
        '테스트 기기의 알림이 활성화되지 않았어요.',
        '작품명 실제 발송은 갤럭시 1대 승인시에만 가능해요.',
        '작품명 검증용 일정 문서가 없어요.',
        '작품명 표시 설정을 먼저 켜야 해요.',
        '작품명 검증용 예정 일정이 없어요.',
        '작품명 검증 문구 생성에 실패했어요.'
    ]);

    const reason = knownMessages.has(error?.message)
        ? error.message
        : (error?.code || error?.name || 'unknown-error');

    console.error('❌ MoBo 테스트 실패:', reason);

    process.exitCode = 1;
});

