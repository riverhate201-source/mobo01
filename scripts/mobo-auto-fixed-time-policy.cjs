'use strict';

// QA-046O | Fixed notification slots, intended for future deployment.
// This module DOES NOT install cron, read Firestore or send FCM.
// Previous per-user schedules must be re-synced before fixed-time delivery.
const assert = require('node:assert/strict');
const {moboKSTDate, moboWebtoonDate, moboClockDue} =
    require('./mobo-scheduler-clock.cjs');

const FIXED_SERIAL_TIME = '22:00';
const FIXED_ATTENDANCE_TIME = '22:30';
const MAX_DELIVERY_LAG_MS = 20 * 60 * 1000;

const FIXED_SLOTS = Object.freeze([
    Object.freeze({
        kind: 'SERIAL_EXPIRE',
        kstTime: FIXED_SERIAL_TIME,
        utcCron: '0 13 * * *'
    }),
    Object.freeze({
        kind: 'ATTENDANCE',
        kstTime: FIXED_ATTENDANCE_TIME,
        utcCron: '30 13 * * *'
    })
]);

function moboFixedTimeForKind(kind) {
    if (kind === 'serial' || kind === 'expire') {
        return FIXED_SERIAL_TIME;
    }
    if (kind === 'attendance') return FIXED_ATTENDANCE_TIME;
    throw new Error('지원하지 않는 고정 알림 종류');
}

function moboFixedSlotDue(kind, now) {
    const fixedTime = moboFixedTimeForKind(kind);
    return moboClockDue(now, fixedTime, MAX_DELIVERY_LAG_MS);
}

// Reject stale user-specific time data: old 20:00 schedule entries
// represent a different webtoon day and must NOT be reused at 22:00.
function moboFixedSubscriptionReady(kind, sub, schedule = null) {
    if (!sub || sub.enabled !== true ||
        sub.timezone !== 'Asia/Seoul') return false;
    if (kind === 'attendance') {
        return sub.attendance === true &&
            sub.attendanceTime === FIXED_ATTENDANCE_TIME;
    }
    if (kind !== 'serial' && kind !== 'expire') return false;
    return sub[kind] === true &&
        sub.serialTime === FIXED_SERIAL_TIME &&
        schedule?.version === 2 &&
        schedule?.timezone === 'Asia/Seoul' &&
        schedule.serialTime === FIXED_SERIAL_TIME &&
        schedule.expireDays === sub.expireDays &&
        Array.isArray(schedule.days) &&
        schedule.days.length <= 14;
}

function moboFixedPreviewSnapshot(now) {
    if (!Number.isFinite(now)) throw new Error('알림 시각 오류');
    return Object.freeze({
        kstDate: moboKSTDate(now),
        webtoonDate: moboWebtoonDate(now),
        serialDue: moboFixedSlotDue('serial', now),
        expireDue: moboFixedSlotDue('expire', now),
        attendanceDue: moboFixedSlotDue('attendance', now)
    });
}

function runSelfTest() {
    const kst = (day, time) =>
        Date.parse(day + 'T' + time + ':00+09:00');
    const date = '2026-11-20';
    assert.equal(FIXED_SLOTS.length, 2);
    assert.deepEqual(FIXED_SLOTS.map(s => s.utcCron),
        ['0 13 * * *','30 13 * * *']);
    assert.equal(new Date(kst(date,'22:00')).toISOString(),
        '2026-11-20T13:00:00.000Z');
    assert.equal(new Date(kst(date,'22:30')).toISOString(),
        '2026-11-20T13:30:00.000Z');

    const serial = moboFixedPreviewSnapshot(kst(date,'22:00'));
    assert.equal(serial.serialDue,true);
    assert.equal(serial.expireDue,true);
    assert.equal(serial.attendanceDue,false);
    assert.equal(serial.webtoonDate,'2026-11-21');
    assert.equal(serial.kstDate,date);

    const attendance = moboFixedPreviewSnapshot(kst(date,'22:30'));
    assert.equal(attendance.serialDue,false);
    assert.equal(attendance.expireDue,false);
    assert.equal(attendance.attendanceDue,true);
    assert.equal(attendance.kstDate,date);

    assert.equal(moboFixedSlotDue('serial',kst(date,'21:59')),false);
    assert.equal(moboFixedSlotDue('serial',kst(date,'22:19')),true);
    assert.equal(moboFixedSlotDue('serial',kst(date,'22:20')),false);
    assert.equal(moboFixedSlotDue('attendance',kst(date,'22:49')),true);
    assert.equal(moboFixedSlotDue('attendance',kst(date,'22:50')),false);
    assert.equal(moboFixedSlotDue('attendance',kst('2026-11-21','00:05')),false);
    assert.throws(()=>moboFixedSlotDue('UNKNOWN',kst(date,'22:00')),
        /지원하지/);

    const sub = {
        enabled:true, timezone:'Asia/Seoul',
        serial:true, expire:true, attendance:true,
        serialTime:'22:00', attendanceTime:'22:30', expireDays:1
    };
    const schedule = {
        version:2,timezone:'Asia/Seoul',
        serialTime:'22:00',expireDays:1,days:[date+'~3~1']
    };
    assert.equal(moboFixedSubscriptionReady('serial',sub,schedule),true);
    assert.equal(moboFixedSubscriptionReady('expire',sub,schedule),true);
    assert.equal(moboFixedSubscriptionReady('attendance',sub),true);
    assert.equal(moboFixedSubscriptionReady('serial',
        {...sub,serialTime:'20:00'},schedule),false);
    assert.equal(moboFixedSubscriptionReady('serial',
        sub,{...schedule,serialTime:'20:00'}),false);
    assert.equal(moboFixedSubscriptionReady('attendance',
        {...sub,attendanceTime:'21:30'}),false);
    assert.equal(moboFixedSubscriptionReady('serial',
        {...sub,serial:false},schedule),false);
    assert.equal(moboFixedSubscriptionReady('attendance',
        {...sub,attendance:false}),false);

    console.log('QA-046O PASS: fixed 22:00 / 22:30 KST = 13:00 / 13:30 UTC');
    console.log('PASS: time windows, 22:00 webtoon rollover, midnight');
    console.log('PASS: OFF flags and legacy unsynced time data rejected');
    console.log('No cron/deploy/Firebase reads or writes/FCM sends');
}

if (require.main === module) runSelfTest();

module.exports = {
    FIXED_SERIAL_TIME, FIXED_ATTENDANCE_TIME, FIXED_SLOTS,
    moboFixedTimeForKind, moboFixedSlotDue,
    moboFixedSubscriptionReady, moboFixedPreviewSnapshot
};
