
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// ==========================================
// MoBo QA-044E-3A
// 자동 알림 대상 계산 · 조회 전용
// 푸시 발송 X / Firestore 수정 X
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

    const [subscriptions, schedules] = await Promise.all([
        db.collection('pushSubscriptions').get(),
        db.collection('pushSchedules').get()
    ]);

    const subscribers = new Map(
        subscriptions.docs.map(doc => [doc.id, doc.data()])
    );

    const now = Date.now();
    const nowKST = new Date(now + 9 * 3600000)
        .toISOString()
        .slice(0, 16)
        .replace('T', ' ');

    const result = {
        subscriptions: subscriptions.size,
        schedules: schedules.size,
        validPairs: 0,
        skippedPairs: 0,
        invalidEntries: 0,
        dueSerial: 0,
        dueExpire: 0,
        upcoming24hSerial: 0,
        upcoming24hExpire: 0
    };

    function parseEntry(entry) {
        if (typeof entry !== 'string') return null;

        const match = entry.match(
            /^(20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01]))~(0|[1-9]\d{0,4})~([0-4])$/
        );

        if (!match) return null;

        const date = match[1];
        const serial = Number(match[2]);
        const expire = Number(match[3]);
        const parsedDate = new Date(date + 'T00:00:00Z');

        if (
            !Number.isFinite(parsedDate.getTime()) ||
            parsedDate.toISOString().slice(0, 10) !== date ||
            serial > 10000 ||
            (serial === 0 && expire === 0)
        ) return null;

        return { date, serial, expire };
    }

    for (const doc of schedules.docs) {
        const schedule = doc.data();
        const sub = subscribers.get(doc.id);

        const validTime =
            typeof sub?.serialTime === 'string' &&
            /^([01]\d|2[0-3]):[0-5]\d$/.test(sub.serialTime);

        if (
            !sub ||
            sub.enabled !== true ||
            sub.timezone !== 'Asia/Seoul' ||
            typeof sub.token !== 'string' ||
            sub.token.length < 20 ||
            schedule.version !== 2 ||
            schedule.timezone !== 'Asia/Seoul' ||
            !validTime ||
            sub.serialTime !== schedule.serialTime ||
            sub.expireDays !== schedule.expireDays ||
            !Array.isArray(schedule.days) ||
            schedule.days.length > 14
        ) {
            result.skippedPairs++;
            continue;
        }

        result.validPairs++;

        for (const entry of schedule.days) {
            const day = parseEntry(entry);

            if (!day) {
                result.invalidEntries++;
                continue;
            }

            // 저장된 날짜와 사용자 설정 시간을
            // 한국 시간 기준 발송 시각으로 변환
            const sendAt = Date.parse(
                `${day.date}T${sub.serialTime}:00+09:00`
            );

            if (!Number.isFinite(sendAt)) {
                result.invalidEntries++;
                continue;
            }

            const minutesAfter = (now - sendAt) / 60000;

            // 예정 시각부터 20분까지
            // 실제 자동 발송 후보로 계산
            if (minutesAfter >= 0 && minutesAfter < 20) {
                if (sub.serial === true && day.serial > 0) {
                    result.dueSerial++;
                }

                if (sub.expire === true && day.expire > 0) {
                    result.dueExpire++;
                }
            }

            // 향후 24시간 알림 후보도 미리 확인
            if (minutesAfter < 0 && minutesAfter >= -1440) {
                if (sub.serial === true && day.serial > 0) {
                    result.upcoming24hSerial++;
                }

                if (sub.expire === true && day.expire > 0) {
                    result.upcoming24hExpire++;
                }
            }
        }
    }

    console.log('MoBo QA-044E-3A · 자동 발송 후보 계산');
    console.log('현재 한국 시간:', nowKST);
    console.table(result);

    console.log('실제 푸시 발송: 없음');
    console.log('Firestore 데이터 변경: 없음');
    console.log('QA-044E-3A 계산 완료');
}

main().catch(error => {
    console.error('QA-044E-3A 실패:', error.message);
    process.exitCode = 1;
});
