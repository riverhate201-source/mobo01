'use strict';

// QA-046D-7 | GitHub runner UTC/KST 및 5분 폴링 시간 검증
// 테스트는 로컬 계산만 수행. Firebase·FCM 접근/원격 데이터 변경 없음.
const assert = require('node:assert/strict');
const {
    moboKSTDate,
    moboWebtoonDate,
    moboClockDue
} = require('./mobo-scheduler-clock.cjs');

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function moboNextFiveMinuteTick(now) {
    if (!Number.isFinite(now)) {
        throw new Error('유효하지 않은 실행 시각입니다.');
    }

    return Math.ceil(now / FIVE_MINUTES_MS) * FIVE_MINUTES_MS;
}

function moboTickSnapshot(now, serialTime, attendanceTime) {
    if (!Number.isFinite(now)) {
        throw new Error('유효하지 않은 실행 시각입니다.');
    }

    return {
        utc: new Date(now).toISOString().slice(0, 16),
        kst: new Date(now + KST_OFFSET_MS).toISOString().slice(0, 16),
        attendanceDate: moboKSTDate(now),
        webtoonDate: moboWebtoonDate(now),
        serialDue: moboClockDue(now, serialTime),
        attendanceDue: moboClockDue(now, attendanceTime)
    };
}

// GitHub의 staging 자동 QA 커밋 경로는 반드시 발송 불가
function moboAssertSafeAutoPreview(config) {
    if (
        !config ||
        config.ref !== 'refs/heads/staging' ||
        config.event !== 'push' ||
        config.mode !== 'PREVIEW' ||
        config.liveConfirm !== 'NO'
    ) {
        throw new Error('staging 자동 QA는 PREVIEW 전용입니다.');
    }
    return true;
}

function runSelfTest() {
    const kst = (date, time) =>
        Date.parse(date + 'T' + time + ':00+09:00');

    const dateA = '2026-11-12';
    const dateB = '2026-11-13';

    // GitHub runner의 UTC epoch와 한국 시간 계산은 서로 일치해야 함
    assert.equal(
        new Date(kst(dateA, '22:05')).toISOString().slice(0, 16),
        '2026-11-12T13:05'
    );
    assert.deepEqual(
        moboTickSnapshot(kst(dateA, '22:05'), '22:00', '22:30'),
        {
            utc: '2026-11-12T13:05',
            kst: '2026-11-12T22:05',
            attendanceDate: dateA,
            webtoonDate: dateB,
            serialDue: true,
            attendanceDue: false
        }
    );
    console.log('PASS: GitHub UTC와 KST +9시간 계산');

    // 정상적인 5분 주기에서는 같은 20분 구간에 여러 번 접촉
    for (const time of ['22:00', '22:05', '22:10', '22:15']) {
        assert.equal(moboClockDue(kst(dateA, time), '22:00'), true);
    }
    assert.equal(moboClockDue(kst(dateA, '21:55'), '22:00'), false);
    assert.equal(moboClockDue(kst(dateA, '22:20'), '22:00'), false);
    assert.equal(moboClockDue(kst(dateA, '22:25'), '22:00'), false);
    console.log('PASS: 연재 알림 20분 발송 범위 및 지연 제외');

    // 5분 주기라도 22:33 같은 사용자 시각은 22:35에 감지 가능
    assert.equal(
        moboNextFiveMinuteTick(kst(dateA, '22:33')),
        kst(dateA, '22:35')
    );
    assert.equal(moboClockDue(kst(dateA, '22:35'), '22:33'), true);
    assert.equal(moboClockDue(kst(dateA, '22:50'), '22:33'), true);
    assert.equal(moboClockDue(kst(dateA, '22:55'), '22:33'), false);
    console.log('PASS: 사용자 지정 22:33 및 5분 주기 폴링');

    // GitHub job이 22:19에 시작하면 허용, 22:20이면 차단
    assert.equal(moboClockDue(kst(dateA, '22:19'), '22:00'), true);
    assert.equal(moboClockDue(kst(dateA, '22:20'), '22:00'), false);
    assert.equal(moboClockDue(kst(dateA, '23:00'), '22:00'), false);
    console.log('PASS: GitHub 실행 지연 시 오래된 알림 발송 차단');

    // 22시 작품 날짜는 바뀌지만 출석 기록은 자정 기준
    assert.equal(moboWebtoonDate(kst(dateA, '22:05')), dateB);
    assert.equal(moboKSTDate(kst(dateA, '22:05')), dateA);
    assert.equal(moboKSTDate(kst(dateB, '00:00')), dateB);
    assert.equal(moboClockDue(kst(dateB, '00:00'), '23:55'), false);
    console.log('PASS: 작품 날짜 전환과 실제 출석 자정 구분');

    // 다음 실행이 지난날의 후보를 다시 보낼 수 없어야 함
    assert.equal(moboClockDue(kst(dateB, '00:05'), '23:55'), false);
    console.log('PASS: 자정 이후 전날 출석 알림 후보 차단');

    const safeConfig = {
        ref: 'refs/heads/staging',
        event: 'push',
        mode: 'PREVIEW',
        liveConfirm: 'NO'
    };
    assert.equal(moboAssertSafeAutoPreview(safeConfig), true);

    for (const unsafe of [
        { ...safeConfig, ref: 'refs/heads/main' },
        { ...safeConfig, mode: 'LIVE' },
        { ...safeConfig, liveConfirm: 'YES' },
        { ...safeConfig, event: 'schedule' }
    ]) {
        assert.throws(
            () => moboAssertSafeAutoPreview(unsafe),
            /PREVIEW 전용/
        );
    }
    console.log('PASS: staging 자동 커밋 검사는 PREVIEW 전용');

    const runnerNow = Date.now();
    const snapshot = moboTickSnapshot(runnerNow, '22:00', '22:30');

    assert.equal(Number.isFinite(runnerNow), true);
    assert.equal(snapshot.attendanceDate.length, 10);
    console.log('Runner UTC:', snapshot.utc);
    console.log('Runner KST:', snapshot.kst);
    console.log('Runner 작품 날짜:', snapshot.webtoonDate);

    console.log('QA-046D-7 · GitHub runner 시간·주기 검증 PASS');
    console.log('실제 FCM 발송: 없음');
    console.log('실제 Firestore 읽기/쓰기: 없음');
    console.log('5분 예약 실행 활성화: 없음');
}

if (require.main === module) {
    try {
        runSelfTest();
    } catch (error) {
        console.error('QA-046D-7 실패:', error.message);
        process.exitCode = 1;
    }
}

module.exports = {
    moboNextFiveMinuteTick,
    moboTickSnapshot,
    moboAssertSafeAutoPreview
};
