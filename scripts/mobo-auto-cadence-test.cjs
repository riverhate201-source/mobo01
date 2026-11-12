'use strict';

// QA-046D-3 | 5분 간격 폴링 및 중복 방지 회귀 테스트
// 메모리 DB만 사용: Firebase 접속 / 푸시 발송 / 원격 쓰기 없음
const assert = require('node:assert/strict');
const {
    moboKSTDate,
    moboWebtoonDate,
    moboClockDue
} = require('./mobo-scheduler-clock.cjs');
const {
    makeDeliveryKey,
    claimDeliveryOnce,
    markDeliverySent
} = require('./mobo-push-dedupe.cjs');

const uidA = 'GalaxyQaExampleUid_123';
const uidB = 'PcQaExampleUid_123456';
const uidC = 'OtherQaExampleUid_123';
const uidD = 'MidnightExampleUid_123';
const dateA = '2026-11-12';
const dateB = '2026-11-13';
const records = new Map();

function kst(date, time) {
    return Date.parse(date + 'T' + time + ':00+09:00');
}

// Firestore의 create(이미 존재하면 실패) / update를 메모리로 재현
const fakeDb = {
    collection(name) {
        assert.equal(name, 'pushDeliveryClaims');
        return {
            doc(id) {
                return {
                    async create(data) {
                        if (records.has(id)) {
                            const error = new Error('Already exists');
                            error.code = 6;
                            throw error;
                        }
                        records.set(id, { ...data });
                    },
                    async update(patch) {
                        assert.ok(records.has(id));
                        records.set(id, { ...records.get(id), ...patch });
                    }
                };
            }
        };
    }
};

// 지정한 구간을 5분마다 검사. 알림과 DB는 메모리에서만 모의 처리
async function pollFiveMinutes({
    kind,
    clock,
    start,
    end,
    uid = uidA,
    sendDate,
    enabled = true,
    incomplete = true
}) {
    let eligible = 0;
    let claimed = 0;

    for (let now = start; now <= end; now += 5 * 60 * 1000) {
        const date = moboKSTDate(now);

        if (
            !enabled ||
            (sendDate && sendDate !== date) ||
            (kind === 'attendance' && !incomplete) ||
            !moboClockDue(now, clock)
        ) continue;

        eligible++;

        if (await claimDeliveryOnce(fakeDb, uid, date, kind)) {
            claimed++;
            await markDeliverySent(fakeDb, uid, date, kind);
        }
    }

    return { eligible, claimed };
}

async function main() {
    // 현재 서버 저장 구조: 연재·재화는 serialTime 공유
    // 별도의 22:00 연재 시각은 아직 앱 저장 구조에 반영되지 않음
    const serialExampleClock = '22:00';
    const sharedScheduleClock = '20:00';
    const attendanceClock = '22:30';

    const serial = await pollFiveMinutes({
        kind: 'serial',
        clock: serialExampleClock,
        start: kst(dateA, '21:55'),
        end: kst(dateA, '22:25'),
        sendDate: dateA
    });
    assert.deepEqual(serial, { eligible: 4, claimed: 1 });

    // 동일 조건으로 다시 폴링해도 재발송하지 않음
    const repeated = await pollFiveMinutes({
        kind: 'serial',
        clock: serialExampleClock,
        start: kst(dateA, '22:00'),
        end: kst(dateA, '22:15'),
        sendDate: dateA
    });
    assert.deepEqual(repeated, { eligible: 4, claimed: 0 });
    console.log('PASS: 연재 알림 5분 간격 반복 실행 → 하루 1회');

    const attendance = await pollFiveMinutes({
        kind: 'attendance',
        clock: attendanceClock,
        start: kst(dateA, '22:25'),
        end: kst(dateA, '22:55')
    });
    assert.deepEqual(attendance, { eligible: 4, claimed: 1 });
    console.log('PASS: 미출석 알림 반복 실행 → 하루 1회');

    const expire = await pollFiveMinutes({
        kind: 'expire',
        clock: sharedScheduleClock,
        start: kst(dateA, '19:55'),
        end: kst(dateA, '20:25'),
        sendDate: dateA
    });
    assert.deepEqual(expire, { eligible: 4, claimed: 1 });
    console.log('PASS: 재화 소멸 알림 반복 실행 → 하루 1회');

    // 두 종류의 알림은 같은 날짜라도 별도로 관리
    assert.notEqual(
        makeDeliveryKey(uidA, dateA, 'serial'),
        makeDeliveryKey(uidA, dateA, 'attendance')
    );
    assert.notEqual(
        makeDeliveryKey(uidA, dateA, 'serial'),
        makeDeliveryKey(uidA, dateA, 'expire')
    );
    console.log('PASS: 연재·출석·재화 중복 키 분리');

    // 사용자 지정 시각이 5분 단위가 아니어도 다음 폴링에 포함
    const customTime = await pollFiveMinutes({
        kind: 'attendance',
        clock: '22:33',
        uid: uidB,
        start: kst(dateA, '22:30'),
        end: kst(dateA, '22:55')
    });
    assert.deepEqual(customTime, { eligible: 4, claimed: 1 });
    console.log('PASS: 22:33처럼 임의 분 설정도 5분 폴링으로 처리');

    const completed = await pollFiveMinutes({
        kind: 'attendance',
        clock: attendanceClock,
        uid: uidC,
        incomplete: false,
        start: kst(dateA, '22:25'),
        end: kst(dateA, '22:55')
    });
    assert.deepEqual(completed, { eligible: 0, claimed: 0 });

    const disabled = await pollFiveMinutes({
        kind: 'serial',
        clock: serialExampleClock,
        uid: uidC,
        enabled: false,
        start: kst(dateA, '21:55'),
        end: kst(dateA, '22:25')
    });
    assert.deepEqual(disabled, { eligible: 0, claimed: 0 });

    const wrongDate = await pollFiveMinutes({
        kind: 'expire',
        clock: sharedScheduleClock,
        uid: uidB,
        sendDate: dateB,
        start: kst(dateA, '19:55'),
        end: kst(dateA, '20:25')
    });
    assert.deepEqual(wrongDate, { eligible: 0, claimed: 0 });
    console.log('PASS: 출석 완료·알림 OFF·저장된 발송 날짜 불일치 제외');

    const nextDay = await pollFiveMinutes({
        kind: 'serial',
        clock: serialExampleClock,
        start: kst(dateB, '21:55'),
        end: kst(dateB, '22:25'),
        sendDate: dateB
    });
    assert.deepEqual(nextDay, { eligible: 4, claimed: 1 });
    assert.notEqual(
        makeDeliveryKey(uidA, dateA, 'serial'),
        makeDeliveryKey(uidA, dateB, 'serial')
    );
    console.log('PASS: 다음 날 새 발송 허용');

    // 겹치는 두 작업이 동시에 claim을 요청해도 한 번만 허용
    const concurrent = await Promise.all([
        claimDeliveryOnce(fakeDb, uidC, dateA, 'attendance'),
        claimDeliveryOnce(fakeDb, uidC, dateA, 'attendance')
    ]);
    assert.deepEqual(concurrent.sort(), [false, true]);
    console.log('PASS: 동시 폴링 중복 발송 권한 차단');

    // 자정 경계: 23:55 알림이 00:05에 다시 뜨면 안 됨
    const midnight = await pollFiveMinutes({
        kind: 'attendance',
        uid: uidD,
        clock: '23:55',
        start: kst(dateA, '23:50'),
        end: kst(dateB, '00:15')
    });
    assert.deepEqual(midnight, { eligible: 1, claimed: 1 });

    assert.equal(
        moboWebtoonDate(kst(dateA, '22:05')),
        dateB
    );
    assert.equal(
        moboKSTDate(kst(dateA, '22:05')),
        dateA
    );
    console.log('PASS: 22시 작품 날짜 변경·출석 자정 경계 유지');

    // 모든 가상 발송은 로컬 메모리 기록으로만 처리
    assert.equal(records.size, 7);
    assert.equal(
        [...records.values()].filter(x => x.status === 'claimed').length,
        1 // 동시 실행 키는 의도적으로 markDeliverySent 생략
    );

    console.log('QA-046D-3 · 5분 간격 실행 시뮬레이션 PASS');
    console.log('테스트 발송 성공 모의 기록: ' + records.size + '건');
    console.log('실제 FCM 발송: 없음');
    console.log('실제 Firestore 읽기/쓰기: 없음');
    console.log('예약 실행 활성화: 없음');
}

main().catch(error => {
    console.error('QA-046D-3 실패:', error.message);
    process.exitCode = 1;
});
