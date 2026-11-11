
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

const {
    claimDeliveryOnce,
    markDeliverySent
} = require('./mobo-push-dedupe.cjs');

// ==========================================
// MoBo QA-044E-3C
// 자동 알림 대상 계산 + 중복 방지 + 발송
//
// 기본 모드: PREVIEW (발송 및 쓰기 없음)
// LIVE: 명시적 확인이 있을 때만 실행
// ==========================================


const MODE = process.env.MOBO_AUTO_MODE || 'PREVIEW';
const WINDOW_MS = 20 * 60 * 1000;
const TEST_UID = process.env.MOBO_AUTO_TEST_UID?.trim() || '';


const PREVIEW_CLOCK = process.env.MOBO_PREVIEW_CLOCK || 'NOW';

if (![
    'NOW',
    'TODAY_20_05',
    'TODAY_22_35'
].includes(PREVIEW_CLOCK)) {
    throw new Error('올바르지 않은 가상 시간 설정입니다.');
}

if (MODE === 'LIVE' && PREVIEW_CLOCK !== 'NOW') {
    throw new Error('LIVE에서는 가상 시간을 사용할 수 없습니다.');
}



function parseDay(entry) {
    if (typeof entry !== 'string') return null;

    const match = entry.match(
        /^(20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01]))~(0|[1-9]\d{0,4})~([0-4])$/
    );

    if (!match) return null;

    const date = match[1];
    const serial = Number(match[2]);
    const expire = Number(match[3]);
    const parsed = new Date(date + 'T00:00:00Z');

    if (
        !Number.isFinite(parsed.getTime()) ||
        parsed.toISOString().slice(0, 10) !== date ||
        serial > 10000 ||
        (serial === 0 && expire === 0)
    ) return null;

    return { date, serial, expire };
}

function validPair(sub, schedule) {
    return (
        sub &&
        schedule &&
        sub.enabled === true &&
        sub.timezone === 'Asia/Seoul' &&
        typeof sub.token === 'string' &&
        sub.token.length >= 20 &&
        /^([01]\d|2[0-3]):[0-5]\d$/.test(sub.serialTime) &&
        schedule.version === 2 &&
        schedule.timezone === 'Asia/Seoul' &&
        schedule.serialTime === sub.serialTime &&
        schedule.expireDays === sub.expireDays &&
        Array.isArray(schedule.days) &&
        schedule.days.length <= 14
    );
}

async function main() {
    if (!['PREVIEW', 'LIVE'].includes(MODE)) {
        throw new Error('지원하지 않는 실행 모드입니다.');
    }


    if (MODE === 'LIVE') {
        if (process.env.MOBO_AUTO_LIVE_CONFIRM !== 'YES') {
            throw new Error('LIVE 발송 확인 설정이 없습니다.');
        }

        if (!/^[A-Za-z0-9_-]{8,128}$/.test(TEST_UID)) {
            throw new Error('허용된 테스트 기기 UID가 없습니다.');
        }
    }


    const secret = process.env.MOBO_FIREBASE_SERVICE_ACCOUNT;

    if (!secret) {
        throw new Error('Firebase 인증 정보가 없습니다.');
    }

    const serviceAccount = JSON.parse(secret);

    if (serviceAccount.project_id !== 'mobo-qa-2026') {
        throw new Error('Firebase 프로젝트가 일치하지 않습니다.');
    }

    initializeApp({
        credential: cert(serviceAccount)
    });

    const db = getFirestore();

    const [subscriptions, schedules] = await Promise.all([
        db.collection('pushSubscriptions').get(),
        db.collection('pushSchedules').get()
    ]);

    const subscribers = new Map(
        subscriptions.docs.map(doc => [doc.id, doc.data()])
    );


    // QA-046C-1 | PREVIEW 전용 가상 시각
    let now = Date.now();

    if (MODE === 'PREVIEW' && PREVIEW_CLOCK !== 'NOW') {
        const todayKST = new Date(Date.now() + 9 * 3600000)
            .toISOString()
            .slice(0, 10);

        const previewTime =
            PREVIEW_CLOCK === 'TODAY_20_05'
                ? '20:05'
                : '22:35';

        now = Date.parse(
            `${todayKST}T${previewTime}:00+09:00`
        );
    }

    console.log(
        '알림 계산 기준 시각(KST):',
        new Date(now + 9 * 3600000)
            .toISOString()
            .slice(0, 16)
            .replace('T', ' ')
    );

    const candidates = [];


    const stats = {
        subscriptions: subscriptions.size,
        schedules: schedules.size,
        validPairs: 0,
        skippedPairs: 0,
        dueCandidates: 0,
        alreadyClaimed: 0,
        skippedAfterRecheck: 0,
        acceptedByFCM: 0,
        errors: 0
    };


    for (const doc of schedules.docs) {
        const uid = doc.id;


        // 테스트 UID가 지정되면 PREVIEW와 LIVE 모두 해당 기기만 확인
        if (TEST_UID && uid !== TEST_UID) {
            continue;
        }


        const schedule = doc.data();
        const sub = subscribers.get(uid);


        if (!validPair(sub, schedule)) {
            stats.skippedPairs++;
            continue;
        }

        stats.validPairs++;

        for (const entry of schedule.days) {
            const day = parseDay(entry);

            if (!day) continue;

            const sendAt = Date.parse(
                `${day.date}T${sub.serialTime}:00+09:00`
            );

            if (!Number.isFinite(sendAt)) continue;

            const elapsed = now - sendAt;

            // 지정 시각부터 20분 이내인 후보만 선택
            if (elapsed < 0 || elapsed >= WINDOW_MS) {
                continue;
            }

            if (sub.serial === true && day.serial > 0) {
                candidates.push({
                    uid, date: day.date, kind: 'serial',
                    count: day.serial, entry
                });
            }

            if (sub.expire === true && day.expire > 0) {
                candidates.push({
                    uid, date: day.date, kind: 'expire',
                    count: day.expire, entry
                });
            }
        }
    }

    stats.dueCandidates = candidates.length;

    console.log('MoBo QA-044E-3C · 자동 발송 엔진');
    console.log('실행 모드:', MODE);
    console.table(stats);

       if (MODE === 'PREVIEW') {

        // QA-046C-1 | 미출석 알림 대상 계산
        const todayKST = new Date(now + 9 * 3600000)
            .toISOString()
            .slice(0, 10);

        const attendanceStats = {
            attendanceEnabled: 0,
            outsideTimeWindow: 0,
            todayStatusMissing: 0,
            allCompleted: 0,
            dueNotifications: 0,
            missingLezhin: 0,
            missingBomtoon: 0
        };

        for (const doc of subscriptions.docs) {

            // 지정된 테스트 기기만 확인
            if (TEST_UID && doc.id !== TEST_UID) {
                continue;
            }

            const sub = doc.data();

            if (
                sub.enabled !== true ||
                sub.attendance !== true ||
                sub.timezone !== 'Asia/Seoul' ||
                typeof sub.token !== 'string' ||
                sub.token.length < 20 ||
                typeof sub.attendanceTime !== 'string' ||
                !/^([01]\d|2[0-3]):[0-5]\d$/.test(
                    sub.attendanceTime
                )
            ) {
                continue;
            }

            attendanceStats.attendanceEnabled++;

            const sendAt = Date.parse(
                `${todayKST}T${sub.attendanceTime}:00+09:00`
            );

            const elapsed = now - sendAt;

            // 설정 시각부터 20분 동안만 발송 후보
            if (
                !Number.isFinite(sendAt) ||
                elapsed < 0 ||
                elapsed >= WINDOW_MS
            ) {
                attendanceStats.outsideTimeWindow++;
                continue;
            }

            const status = sub.attendanceStatus;

            // 오늘 출석 상태가 확인된 경우만 테스트
            if (
                !status ||
                status.date !== todayKST ||
                typeof status.lezhin !== 'boolean' ||
                typeof status.bomtoon !== 'boolean'
            ) {
                attendanceStats.todayStatusMissing++;
                continue;
            }

            // 두 플랫폼 모두 출석했으면 알림 불필요
            if (status.lezhin && status.bomtoon) {
                attendanceStats.allCompleted++;
                continue;
            }

            attendanceStats.dueNotifications++;

            if (!status.lezhin) {
                attendanceStats.missingLezhin++;
            }

            if (!status.bomtoon) {
                attendanceStats.missingBomtoon++;
            }
        }

        console.log(
            'MoBo QA-046C-1 · 미출석 알림 미리보기'
        );

        console.log('출석 기준 날짜(KST):', todayKST);
        console.table(attendanceStats);

        console.log('미리보기 완료');
        console.log('실제 푸시 발송: 없음');
        console.log('Firestore 데이터 변경: 없음');
        return;
    }

    // LIVE 모드에서만 아래 코드 실행
    for (const item of candidates) {
        try {
            // 발송 직전 구독·일정 상태 다시 확인
            const [subDoc, scheduleDoc] = await Promise.all([
                db.collection('pushSubscriptions')
                    .doc(item.uid).get(),
                db.collection('pushSchedules')
                    .doc(item.uid).get()
            ]);

            const sub = subDoc.exists ? subDoc.data() : null;
            const schedule = scheduleDoc.exists
                ? scheduleDoc.data()
                : null;

            if (
                !validPair(sub, schedule) ||
                !schedule.days.includes(item.entry) ||
                sub[item.kind] !== true
            ) {
                stats.skippedAfterRecheck++;
                continue;
            }

            // 여러 실행 중 첫 번째만 처리 권한 확보
            const claimed = await claimDeliveryOnce(
                db, item.uid, item.date, item.kind
            );

            if (!claimed) {
                stats.alreadyClaimed++;
                continue;
            }

            const isSerial = item.kind === 'serial';

            const message = {
                token: sub.token,
                notification: {
                    title: isSerial
                        ? 'MoBo 연재 알림 📚'
                        : 'MoBo 재화 소멸 알림 ⏰',
                    body: isSerial
                        ? `확인할 연재 작품 ${item.count}개가 있어요!`
                        : `${item.count}개 플랫폼의 재화 소멸 예정 내역을 확인해 주세요.`
                },
                            webpush: {
                    headers: {
                        TTL: '120'
                    },

                    notification: {
                        icon: 'https://staging--mobo-demo.netlify.app/icon.png',
                        badge: 'https://staging--mobo-demo.netlify.app/notification-badge.png'
                    },

                    fcmOptions: {
                        link: 'https://staging--mobo-demo.netlify.app/'
                    }
                }
            };

            try {
                await getMessaging().send(message);

                await markDeliverySent(
                    db, item.uid, item.date, item.kind
                );

                stats.acceptedByFCM++;

            } catch (error) {
                // 중복 발송 위험을 피하기 위해
                // 실패한 claimed 기록은 자동 삭제하지 않음
                stats.errors++;
                console.error(
                    '발송 또는 상태 기록 실패:',
                    error.code || error.message
                );
            }

        } catch (error) {
            stats.errors++;
            console.error(
                '발송 대상 처리 실패:',
                error.code || error.message
            );
        }
    }

    console.log('MoBo 자동 발송 처리 결과');
    console.table(stats);

    if (stats.errors > 0) {
        throw new Error(
            '일부 처리 실패: 발송 기록 확인이 필요합니다.'
        );
    }

    console.log('자동 발송 작업 완료');
}

main().catch(error => {
    console.error('QA-044E-3C 실패:', error.message);
    process.exitCode = 1;
});
