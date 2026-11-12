'use strict';

// QA-046D-5 | LIVE 발송 직전 안전 조건
// 단독 실행은 메모리 검사만 수행. Firebase / FCM 사용 없음.
const assert = require('node:assert/strict');
const { moboKSTDate, moboClockDue } =
    require('./mobo-scheduler-clock.cjs');

const WINDOW_MS = 20 * 60 * 1000;

function moboCanSendSchedule(item, sub, schedule, now) {
    if (
        !item || !sub || !schedule ||
        !Number.isFinite(now) ||
        !['serial', 'expire'].includes(item.kind) ||
        sub.enabled !== true ||
        sub[item.kind] !== true ||
        sub.timezone !== 'Asia/Seoul' ||
        typeof sub.token !== 'string' ||
        sub.token.length < 20 ||
        schedule.version !== 2 ||
        schedule.timezone !== 'Asia/Seoul' ||
        schedule.serialTime !== sub.serialTime ||
        schedule.expireDays !== sub.expireDays ||
        !Array.isArray(schedule.days) ||
        schedule.days.length > 14 ||
        !schedule.days.includes(item.entry) ||
        item.date !== moboKSTDate(now)
    ) return false;

    return moboClockDue(now, sub.serialTime, WINDOW_MS);
}

function moboAttendanceStillDue(initial, latest) {
    return Boolean(
        initial &&
        latest &&
        initial.kind === 'attendance' &&
        latest.kind === 'attendance' &&
        typeof initial.date === 'string' &&
        latest.date === initial.date &&
        (
            latest.missingLezhin === true ||
            latest.missingBomtoon === true
        )
    );
}

function runSelfTest() {
    const kst = (date, time) =>
        Date.parse(date + 'T' + time + ':00+09:00');

    const date = '2026-11-12';
    const entry = date + '~3~2';
    const item = {
        uid: 'QaGalaxyTest_123',
        date, kind: 'serial', count: 3, entry
    };
    const sub = {
        enabled: true, serial: true, expire: true,
        timezone: 'Asia/Seoul',
        token: 'FakeToken_For_TestingOnly_12345678',
        serialTime: '22:00', expireDays: 3
    };
    const schedule = {
        version: 2, timezone: 'Asia/Seoul',
        serialTime: '22:00', expireDays: 3, days: [entry]
    };

    assert.equal(
        moboCanSendSchedule(item, sub, schedule, kst(date, '22:05')),
        true
    );
    assert.equal(
        moboCanSendSchedule(item, sub, schedule, kst(date, '21:59')),
        false
    );
    assert.equal(
        moboCanSendSchedule(item, sub, schedule, kst(date, '22:20')),
        false
    );
    assert.equal(
        moboCanSendSchedule(
            item, sub, schedule, kst('2026-11-13', '22:05')
        ),
        false
    );
    console.log('PASS: 연재·재화 발송 직전 시간 및 날짜 재확인');

    assert.equal(
        moboCanSendSchedule(
            item, { ...sub, serial: false }, schedule, kst(date, '22:05')
        ),
        false
    );
    assert.equal(
        moboCanSendSchedule(
            item, { ...sub, serialTime: '22:30' }, schedule,
            kst(date, '22:05')
        ),
        false
    );
    assert.equal(
        moboCanSendSchedule(
            item, sub, { ...schedule, days: [] }, kst(date, '22:05')
        ),
        false
    );
    assert.equal(
        moboCanSendSchedule(
            item, { ...sub, token: '' }, schedule, kst(date, '22:05')
        ),
        false
    );
    console.log('PASS: 알림 OFF·설정 변경·일정 삭제·토큰 누락 차단');

    const expireItem = { ...item, kind: 'expire', count: 2 };
    assert.equal(
        moboCanSendSchedule(
            expireItem, sub, schedule, kst(date, '22:05')
        ),
        true
    );
    assert.equal(
        moboCanSendSchedule(
            { ...item, kind: 'attendance' }, sub, schedule,
            kst(date, '22:05')
        ),
        false
    );
    console.log('PASS: 연재·재화 후보만 SCHEDULE 경로 허용');

    const initial = {
        date, kind: 'attendance',
        missingLezhin: true, missingBomtoon: true
    };
    assert.equal(
        moboAttendanceStillDue(
            initial, { ...initial, missingBomtoon: false }
        ),
        true
    );
    assert.equal(moboAttendanceStillDue(initial, null), false);
    assert.equal(
        moboAttendanceStillDue(
            initial, { ...initial, date: '2026-11-13' }
        ),
        false
    );
    assert.equal(
        moboAttendanceStillDue(
            initial,
            { ...initial, missingLezhin: false, missingBomtoon: false }
        ),
        false
    );
    console.log('PASS: 최신 출석 상태에 따른 발송 판단');

    console.log('QA-046D-5 · LIVE 사전 안전검사 PASS');
    console.log('실제 FCM 발송: 없음');
    console.log('실제 Firestore 읽기/쓰기: 없음');
}

if (require.main === module) {
    try {
        runSelfTest();
    } catch (error) {
        console.error('QA-046D-5 실패:', error.message);
        process.exitCode = 1;
    }
}

module.exports = {
    moboCanSendSchedule,
    moboAttendanceStillDue
};
