
'use strict';

const assert = require('node:assert/strict');

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_WINDOW_MS = 20 * 60 * 1000;

// 실제 한국 날짜: 출석 및 재화 기준
function moboKSTDate(now) {
    if (!Number.isFinite(now)) {
        throw new Error('시각 값이 올바르지 않아요.');
    }

    return new Date(now + KST_OFFSET_MS)
        .toISOString()
        .slice(0, 10);
}

// 모보 작품 날짜: 오후 10시부터 다음 날
function moboWebtoonDate(now) {
    if (!Number.isFinite(now)) {
        throw new Error('시각 값이 올바르지 않아요.');
    }

    const local = new Date(now + KST_OFFSET_MS);

    if (local.getUTCHours() >= 22) {
        local.setTime(local.getTime() + DAY_MS);
    }

    return local.toISOString().slice(0, 10);
}

// 사용자 지정 시간부터 20분간 알림 후보 허용
function moboClockDue(
    now,
    clock,
    windowMs = DEFAULT_WINDOW_MS
) {
    if (
        !Number.isFinite(now) ||
        typeof clock !== 'string' ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(clock) ||
        !Number.isFinite(windowMs) ||
        windowMs <= 0
    ) return false;

    // 자정을 지나면 전날 출석 알림을 보내지 않음
    const today = moboKSTDate(now);

    const sendAt = Date.parse(
        `${today}T${clock}:00+09:00`
    );

    return now >= sendAt &&
        now - sendAt < windowMs;
}

// 읽기 전용 시간 계산 결과
function moboClockPreview(
    now,
    attendanceTime = '22:30'
) {
    return {
        attendanceDate: moboKSTDate(now),
        webtoonDate: moboWebtoonDate(now),
        serialDue: moboClockDue(now, '22:00'),
        attendanceDue: moboClockDue(
            now,
            attendanceTime
        )
    };
}

// QA-046D-1 | 메모리 기반 자체 테스트
async function runSelfTest() {
    const kst = (date, time) =>
        Date.parse(`${date}T${time}:00+09:00`);

    const day = '2026-11-12';

    assert.deepEqual(
        moboClockPreview(kst(day, '21:59')),
        {
            attendanceDate: day,
            webtoonDate: day,
            serialDue: false,
            attendanceDue: false
        }
    );

    assert.deepEqual(
        moboClockPreview(kst(day, '22:05')),
        {
            attendanceDate: day,
            webtoonDate: '2026-11-13',
            serialDue: true,
            attendanceDue: false
        }
    );

    assert.deepEqual(
        moboClockPreview(kst(day, '22:35')),
        {
            attendanceDate: day,
            webtoonDate: '2026-11-13',
            serialDue: false,
            attendanceDue: true
        }
    );

    assert.equal(
        moboClockDue(kst(day, '22:50'), '22:30'),
        false
    );

    assert.equal(
        moboClockDue(kst(day, '21:35'), '21:30'),
        true
    );

    assert.equal(
        moboClockDue(kst(day, '21:29'), '21:30'),
        false
    );

    // 자정이 지나면 전날 출석 알림은 종료
    assert.equal(
        moboClockDue(
            kst('2026-11-13', '00:05'),
            '23:55'
        ),
        false
    );

    // 월말 날짜 변경
    assert.equal(
        moboWebtoonDate(
            kst('2026-11-30', '22:00')
        ),
        '2026-12-01'
    );

    // 잘못된 시간 제외
    assert.equal(
        moboClockDue(kst(day, '22:35'), '25:00'),
        false
    );

    console.log('PASS: 22시 이전 작품 날짜 유지');
    console.log('PASS: 22시 이후 작품 날짜 다음 날');
    console.log('PASS: 출석 날짜는 자정까지 오늘 유지');
    console.log('PASS: 사용자 지정 출석 시간 판정');
    console.log('PASS: 발송 시간 범위 검사');
    console.log('PASS: 자정 이후 전날 출석 알림 차단');
    console.log('PASS: 월말 날짜 변경 및 잘못된 시간 제외');

    console.log('QA-046D-1 · 서버 시계 계산 PASS');
    console.log('실제 푸시 발송: 없음');
    console.log('Firestore 데이터 변경: 없음');
}

if (require.main === module) {
    runSelfTest().catch(error => {
        console.error(
            'QA-046D-1 실패:',
            error.message
        );
        process.exitCode = 1;
    });
}

module.exports = {
    moboKSTDate,
    moboWebtoonDate,
    moboClockDue,
    moboClockPreview
};
