
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

const {
    claimDeliveryOnce,
    markDeliverySent
} = require('./mobo-push-dedupe.cjs');

const {
    moboKSTDate,
    moboWebtoonDate,
    moboClockDue
} = require('./mobo-scheduler-clock.cjs');

const {
    moboCanSendSchedule,
    moboAttendanceStillDue
} = require('./mobo-live-guard.cjs');

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
// QA-046C-3B-2 | LIVE 발송 종류 구분
const NOTIFICATION_KIND =
    process.env.MOBO_AUTO_KIND || 'SCHEDULE';

if (!['SCHEDULE', 'ATTENDANCE'].includes(NOTIFICATION_KIND)) {
    throw new Error('올바르지 않은 발송 종류입니다.');
}
if (![
    'NOW',
    'TODAY_20_05',
    'TODAY_22_05',
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

// ==========================================
// QA-046C-2 | 출석 상태 공통 판단
// ==========================================

// ==========================================
// QA-046C-3A | 출석 상태 및 날짜 판단
// ==========================================

function moboClassifyAttendance(status, date) {
    if (
        !status ||
        typeof status.date !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(status.date)
    ) return null;

    const parsed = new Date(
        status.date + 'T00:00:00Z'
    );

    if (
        !Number.isFinite(parsed.getTime()) ||
        parsed.toISOString().slice(0, 10) !== status.date ||
        status.date > date
    ) return null;

    // 마지막 출석 상태가 이전 날짜라면
    // 오늘 출석을 완료하지 않은 것으로 판단
    if (status.date < date) {
        return {
            due: true,
            missingLezhin: true,
            missingBomtoon: true
        };
    }

    // 오늘의 기록은 두 플랫폼 상태를 확인
    if (
        typeof status.lezhin !== 'boolean' ||
        typeof status.bomtoon !== 'boolean'
    ) return null;

    const missingLezhin = !status.lezhin;
    const missingBomtoon = !status.bomtoon;

    return {
        due: missingLezhin || missingBomtoon,
        missingLezhin,
        missingBomtoon
    };
}


/**
 * QA-046C-3B-1
 * 미출석 알림 발송 후보 계산
 * Firebase 읽기/쓰기 및 푸시 발송 없음
 */
function moboGetAttendanceCandidate(sub, now) {
    if (
        !sub ||
        sub.enabled !== true ||
        sub.attendance !== true ||
        sub.timezone !== 'Asia/Seoul' ||
        typeof sub.token !== 'string' ||
        sub.token.length < 20 ||
        typeof sub.attendanceTime !== 'string' ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(
            sub.attendanceTime
        )
    ) return null;

    const date = moboKSTDate(now);

    // QA-046D-2 | 자정 날짜 및 사용자 지정 시간 공통 판정
    if (!moboClockDue(now, sub.attendanceTime, WINDOW_MS)) {
        return null;
    }

    const result = moboClassifyAttendance(
        sub.attendanceStatus,
        date
    );

    if (!result || !result.due) return null;

    return {
        date,
        kind: 'attendance',
        missingLezhin: result.missingLezhin,
        missingBomtoon: result.missingBomtoon
    };
}

// QA-046D-2 | 실제 날짜(재화·출석)와 저장된 발송 날짜 비교
function moboScheduleEntryDue(date, clock, now) {
    return date === moboKSTDate(now) &&
        moboClockDue(now, clock, WINDOW_MS);
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
        const todayKST = moboKSTDate(Date.now());

        const previewTimes = {
            TODAY_20_05: '20:05',
            TODAY_22_05: '22:05',
            TODAY_22_35: '22:35'
        };
        const previewTime = previewTimes[PREVIEW_CLOCK];

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

    console.log('연재 기준 날짜(KST):', moboWebtoonDate(now));
    console.log('실제 날짜(KST):', moboKSTDate(now));

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

            // QA-046D-2 | 일정에 저장된 실제 발송일만 판정
            // 자정 이후 전날 발송 건을 다음 날로 넘기지 않음
            if (!moboScheduleEntryDue(day.date, sub.serialTime, now)) {
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
        const todayKST = moboKSTDate(now);

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

            // QA-046D-2 | LIVE 후보와 동일한 시계 함수 사용
            if (!moboClockDue(now, sub.attendanceTime, WINDOW_MS)) {
                attendanceStats.outsideTimeWindow++;
                continue;
            }

                        // QA-046C-2 | 공통 함수로 출석 판단
            const result = moboClassifyAttendance(
                sub.attendanceStatus,
                todayKST
            );

            if (!result) {
                attendanceStats.todayStatusMissing++;
                continue;
            }

            if (!result.due) {
                attendanceStats.allCompleted++;
                continue;
            }

            // 플랫폼이 둘 다 미출석이어도 알림은 1건
            attendanceStats.dueNotifications++;

            if (result.missingLezhin) {
                attendanceStats.missingLezhin++;
            }

                        if (result.missingBomtoon) {
                attendanceStats.missingBomtoon++;
            }
        }

        console.log(
            'MoBo QA-046C-1 · 미출석 알림 미리보기'
        );
        console.log('출석 기준 날짜(KST):', todayKST);
        console.table(attendanceStats);
                // ==========================================
        // QA-046C-2 | 가상 출석 4가지 테스트
        // 실제 사용자 데이터 변경 없음
        // ==========================================

        const assert = require('node:assert/strict');

        const testCases = [
            {
                name: '레진만 미출석',
                lezhin: false,
                bomtoon: true,
                expected: {
                    due: true,
                    missingLezhin: true,
                    missingBomtoon: false
                }
            },
            {
                name: '봄툰만 미출석',
                lezhin: true,
                bomtoon: false,
                expected: {
                    due: true,
                    missingLezhin: false,
                    missingBomtoon: true
                }
            },
            {
                name: '둘 다 미출석',
                lezhin: false,
                bomtoon: false,
                expected: {
                    due: true,
                    missingLezhin: true,
                    missingBomtoon: true
                }
            },
            {
                name: '둘 다 출석 완료',
                lezhin: true,
                bomtoon: true,
                expected: {
                    due: false,
                    missingLezhin: false,
                    missingBomtoon: false
                }
            }
        ];

        console.log(
            'MoBo QA-046C-2 · 가상 출석 조건 테스트'
        );

        for (const testCase of testCases) {
            const actual = moboClassifyAttendance(
                {
                    date: todayKST,
                    lezhin: testCase.lezhin,
                    bomtoon: testCase.bomtoon
                },
                todayKST
            );

            assert.deepEqual(
                actual,
                testCase.expected,
                `${testCase.name} 판단 오류`
            );

            console.log(
                `PASS: ${testCase.name} → ` +
                (actual.due
                    ? '알림 후보 1건'
                    : '알림 없음')
            );
        }

        // 출석 기록이 없다면 무조건 미출석으로
        // 판단하지 않고 후보에서 제외
        assert.equal(
            moboClassifyAttendance(null, todayKST),
            null
        );

        console.log('PASS: 출석 상태 누락은 후보 제외');
        console.log('QA-046C-2 · 전체 테스트 PASS');

                // QA-046C-3A | 날짜 변경 테스트

        const yesterdayKST = new Date(
            Date.parse(todayKST + 'T00:00:00Z') -
            86400000
        ).toISOString().slice(0, 10);

        const tomorrowKST = new Date(
            Date.parse(todayKST + 'T00:00:00Z') +
            86400000
        ).toISOString().slice(0, 10);

        // 어제 모두 출석했어도 오늘은 새 출석일
        assert.deepEqual(
            moboClassifyAttendance(
                {
                    date: yesterdayKST,
                    lezhin: true,
                    bomtoon: true
                },
                todayKST
            ),
            {
                due: true,
                missingLezhin: true,
                missingBomtoon: true
            }
        );

        console.log(
            'PASS: 이전 날짜 출석 기록 → 오늘 미출석'
        );

        // 미래 날짜는 잘못된 알림을 피하기 위해 제외
        assert.equal(
            moboClassifyAttendance(
                {
                    date: tomorrowKST,
                    lezhin: false,
                    bomtoon: false
                },
                todayKST
            ),
            null
        );

        console.log(
            'PASS: 미래 날짜 출석 기록 제외'
        );

        console.log(
            'QA-046C-3A · 날짜 판단 테스트 PASS'
        );   
           
            

        // ==========================================
        // QA-046C-3B-1 | 발송 후보 함수 검증
        // ==========================================

        const testTime = time => Date.parse(
            `${todayKST}T${time}:00+09:00`
        );

        const fakeSubscription = {
            enabled: true,
            attendance: true,
            timezone: 'Asia/Seoul',
            token: 'QA_TEST_TOKEN_123456789012345',
            attendanceTime: '22:30',
            attendanceStatus: {
                date: todayKST,
                lezhin: false,
                bomtoon: true
            }
        };

        // 레진만 미출석 → 발송 대상
        const due = moboGetAttendanceCandidate(
            fakeSubscription,
            testTime('22:35')
        );

        assert.deepEqual(due, {
            date: todayKST,
            kind: 'attendance',
            missingLezhin: true,
            missingBomtoon: false
        });

        // 둘 다 출석 완료 → 발송하지 않음
        assert.equal(
            moboGetAttendanceCandidate(
                {
                    ...fakeSubscription,
                    attendanceStatus: {
                        date: todayKST,
                        lezhin: true,
                        bomtoon: true
                    }
                },
                testTime('22:35')
            ),
            null
        );

        // 미출석 알림 OFF → 발송하지 않음
        assert.equal(
            moboGetAttendanceCandidate(
                { ...fakeSubscription, attendance: false },
                testTime('22:35')
            ),
            null
        );

        // 아직 설정 시간이 되지 않음
        assert.equal(
            moboGetAttendanceCandidate(
                fakeSubscription,
                testTime('22:29')
            ),
            null
        );

        // 20분 발송 허용 구간이 종료됨
        assert.equal(
            moboGetAttendanceCandidate(
                fakeSubscription,
                testTime('22:50')
            ),
            null
        );

        // 어제 출석 기록만 있어도 오늘 미출석으로 판단
        const yesterdayDue = moboGetAttendanceCandidate(
            {
                ...fakeSubscription,
                attendanceStatus: {
                    date: yesterdayKST,
                    lezhin: true,
                    bomtoon: true
                }
            },
            testTime('22:35')
        );

        assert.equal(yesterdayDue?.missingLezhin, true);
        assert.equal(yesterdayDue?.missingBomtoon, true);

        // 실제 Firebase 데이터에 대해 기존 PREVIEW와
        // 새로운 발송 후보 계산의 결과가 일치해야 함
        const candidatesFromNewEngine =
            subscriptions.docs.filter(doc => {
                if (TEST_UID && doc.id !== TEST_UID) {
                    return false;
                }

                return moboGetAttendanceCandidate(
                    doc.data(),
                    now
                ) !== null;
            }).length;

        assert.equal(
            candidatesFromNewEngine,
            attendanceStats.dueNotifications,
            '미출석 후보 계산 결과 불일치'
        );

        console.log('PASS: 연재·출석 알림 유형 분리');
        console.log('PASS: 출석 완료 사용자 제외');
        console.log('PASS: 미출석 알림 OFF 제외');
        console.log('PASS: 발송 시간 전후 차단');
        console.log('PASS: 이전 날짜 출석 기록 처리');
        console.log('PASS: 실제 서버 후보 계산 일치');
        console.log(
            'QA-046C-3B-1 · 발송 후보 계산 PASS'
        );

        // QA-046D-2 | 실제 발송일·모보 요일·자정 경계 회귀 테스트
        const clockKST = (date, time) =>
            Date.parse(`${date}T${time}:00+09:00`);
        const dayA = '2026-11-12';
        const dayB = '2026-11-13';

        assert.equal(
            moboScheduleEntryDue(dayA, '20:00', clockKST(dayA, '20:05')),
            true
        );
        assert.equal(
            moboScheduleEntryDue(dayA, '22:00', clockKST(dayA, '22:05')),
            true
        );
        assert.equal(
            moboScheduleEntryDue(dayB, '22:00', clockKST(dayA, '22:05')),
            false
        );
        assert.equal(
            moboScheduleEntryDue(dayA, '22:00', clockKST(dayA, '22:35')),
            false
        );
        assert.equal(
            moboScheduleEntryDue(dayA, '23:55', clockKST(dayB, '00:05')),
            false
        );
        assert.equal(
            moboWebtoonDate(clockKST(dayA, '22:05')),
            dayB
        );
        assert.equal(
            moboKSTDate(clockKST(dayA, '22:05')),
            dayA
        );

        console.log('PASS: 실제 발송일과 연재 요일 날짜 구분');
        console.log('PASS: 기존 사용자 지정 연재 시간 유지');
        console.log('PASS: 자정 이후 전날 알림 후보 차단');
        console.log('QA-046D-2 · 공통 시계 연결 PASS');

        console.log('미리보기 완료');
        console.log('실제 푸시 발송: 없음');
        console.log('Firestore 데이터 변경: 없음');
        return;
    }

    // LIVE 모드에서만 아래 코드 실행

    // LIVE 모드에서만 아래 코드 실행

    // QA-046C-3B-2 | 미출석 알림 전용 발송
    if (MODE === 'LIVE' && NOTIFICATION_KIND === 'ATTENDANCE') {

        // LIVE는 기존 안전장치에 따라 테스트 UID만 사용
        const ref = db.collection('pushSubscriptions')
            .doc(TEST_UID);

        // 발송 직전 실제 서버 상태 확인
        const snapshot = await ref.get();

        const candidate = moboGetAttendanceCandidate(
            snapshot.exists ? snapshot.data() : null,
            Date.now()
        );

        if (!candidate) {
            console.log(
                'QA-046C-3B-2: 미출석 알림 대상 없음 · 발송 0건'
            );
            return;
        }

        // QA-046D-5 | 출석 상태를 먼저 재조회한 뒤 claim 생성
        // 이미 출석 완료했다면 불필요한 중복 방지 기록을 남기지 않음
        const latestSnapshot = await ref.get();
        const latestSub = latestSnapshot.exists
            ? latestSnapshot.data()
            : null;

        const latest = moboGetAttendanceCandidate(
            latestSub,
            Date.now()
        );

        if (!moboAttendanceStillDue(candidate, latest)) {
            console.log(
                'QA-046D-5: 최신 출석 상태 변경 · claim 없이 발송 취소'
            );
            return;
        }

        // 가장 최근까지 미출석일 때만 원자적으로 발송 권한 확보
        const claimed = await claimDeliveryOnce(
            db,
            TEST_UID,
            candidate.date,
            'attendance'
        );

        if (!claimed) {
            console.log(
                'QA-046C-3B-2: 이미 처리된 알림 · 중복 차단'
            );
            return;
        }

        const missing = [];

        if (latest.missingLezhin) missing.push('레진');
        if (latest.missingBomtoon) missing.push('봄툰');

        const message = {
            token: latestSub.token,
            notification: {
                title: 'MoBo 미출석 알림 ⏰',
                body:
                    `모보에서 ${missing.join('·')} 출석 확인이 ` +
                    '아직 남아 있어요. 자정 전에 확인해 주세요.'
            },
            webpush: {
                headers: {
                    TTL: '600',
                    Urgency: 'high'
                },
                notification: {
                    icon:
                        'https://staging--mobo-demo.netlify.app/icon.png',
                    badge:
                        'https://staging--mobo-demo.netlify.app/notification-badge.png'
                },
                fcmOptions: {
                    link:
                        'https://staging--mobo-demo.netlify.app/'
                }
            }
        };

        // 실제 발송은 LIVE + ATTENDANCE + YES일 때만 도달
        await getMessaging().send(message);

        await markDeliverySent(
            db,
            TEST_UID,
            latest.date,
            'attendance'
        );

        console.log(
            'QA-046C-3B-2: FCM 미출석 알림 발송 요청 성공'
        );

        return;
    }

    // 기존 연재·재화 LIVE 발송 경로 유지
    
    // 기존 연재·재화 LIVE 발송 경로 유지
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

            // QA-046D-5 | 실제 발송 직전에 설정과 발송 시간 재확인
            // GitHub 실행이 늦어져 20분 범위를 벗어나면 보내지 않음
            if (
                !validPair(sub, schedule) ||
                !moboCanSendSchedule(item, sub, schedule, Date.now())
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
                        icon:
                            'https://staging--mobo-demo.netlify.app/icon.png',
                        badge:
                            'https://staging--mobo-demo.netlify.app/notification-badge.png'
                    },
                    fcmOptions: {
                        link:
                            'https://staging--mobo-demo.netlify.app/'
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
