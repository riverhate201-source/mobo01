
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// QA-044E-1 | Firestore 조회 전용
// 실제 푸시 발송 및 서버 데이터 수정 없음

async function main() {
    const json = process.env.MOBO_FIREBASE_SERVICE_ACCOUNT;

    if (!json) {
        throw new Error(
            'GitHub Firebase 인증 정보가 설정되지 않았어요.'
        );
    }

    const serviceAccount = JSON.parse(json);

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
        subscriptions.docs.map(doc => [
            doc.id, doc.data()
        ])
    );

    // 한국 시간 기준 오늘과 내일
    const kstDate = offset =>
        new Date(
            Date.now() +
            9 * 3600000 +
            offset * 86400000
        ).toISOString().slice(0, 10);

    const today = kstDate(0);
    const tomorrow = kstDate(1);

    const result = {
        registeredDevices: subscriptions.size,
        scheduleDocuments: schedules.size,
        eligibleDevices: 0,
        mismatchedOrInactive: 0,
        invalidDateEntries: 0,
        todaySerialNotifications: 0,
        todayExpireNotifications: 0,
        tomorrowSerialNotifications: 0,
        tomorrowExpireNotifications: 0
    };

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

    for (const doc of schedules.docs) {
        const schedule = doc.data();
        const sub = subscribers.get(doc.id);

        if (
            !sub ||
            sub.enabled !== true ||
            typeof sub.token !== 'string' ||
            sub.token.length < 20 ||
            schedule.version !== 2 ||
            schedule.timezone !== 'Asia/Seoul' ||
            sub.serialTime !== schedule.serialTime ||
            sub.expireDays !== schedule.expireDays ||
            !Array.isArray(schedule.days) ||
            schedule.days.length > 14
        ) {
            result.mismatchedOrInactive++;
            continue;
        }

        result.eligibleDevices++;

        for (const entry of schedule.days) {
            const day = parseDay(entry);

            if (!day) {
                result.invalidDateEntries++;
                continue;
            }

            if (day.date === today) {
                if (sub.serial === true && day.serial > 0) {
                    result.todaySerialNotifications++;
                }

                if (sub.expire === true && day.expire > 0) {
                    result.todayExpireNotifications++;
                }
            }

            if (day.date === tomorrow) {
                if (sub.serial === true && day.serial > 0) {
                    result.tomorrowSerialNotifications++;
                }

                if (sub.expire === true && day.expire > 0) {
                    result.tomorrowExpireNotifications++;
                }
            }
        }
    }

    console.log('MoBo QA-044E-1 · Firebase 서버 조회');
    console.log('한국 시간 기준:', today, '/', tomorrow);
    console.table(result);
    console.log('실제 푸시 발송: 없음');
    console.log('Firestore 데이터 변경: 없음');
}

main().catch(error => {
    console.error('QA-044E-1 실패:', error.message);
    process.exitCode = 1;
});
