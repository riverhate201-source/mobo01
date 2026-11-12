'use strict';

// QA-046D-6 | 알림 유형별 LIVE 분리
// 자체 테스트는 메모리 전용: Firebase/FCM 접속 및 데이터 변경 없음
const assert = require('node:assert/strict');

const KINDS = Object.freeze([
    'SCHEDULE',  // PREVIEW 전용: 연재 + 재화 후보 조회
    'SERIAL',
    'EXPIRE',
    'ATTENDANCE'
]);

function moboValidateKind(kind) {
    if (!KINDS.includes(kind)) {
        throw new Error('올바르지 않은 발송 종류입니다.');
    }
    return kind;
}

function moboAssertExplicitLiveKind(mode, kind) {
    moboValidateKind(kind);

    if (mode === 'LIVE' && kind === 'SCHEDULE') {
        throw new Error(
            'LIVE에서는 SCHEDULE 일괄 발송을 사용할 수 없습니다. ' +
            'SERIAL, EXPIRE 또는 ATTENDANCE를 명시해야 합니다.'
        );
    }
}

function moboIsSelectedScheduleItem(itemKind, dispatchKind) {
    moboValidateKind(dispatchKind);
    if (itemKind !== 'serial' && itemKind !== 'expire') {
        return false;
    }

    return dispatchKind === 'SCHEDULE' ||
        (dispatchKind === 'SERIAL' && itemKind === 'serial') ||
        (dispatchKind === 'EXPIRE' && itemKind === 'expire');
}

function runSelfTest() {
    const kinds = ['serial', 'expire', 'attendance'];
    const selected = type =>
        kinds.filter(kind => moboIsSelectedScheduleItem(kind, type));

    assert.deepEqual(selected('SCHEDULE'), ['serial', 'expire']);
    assert.deepEqual(selected('SERIAL'), ['serial']);
    assert.deepEqual(selected('EXPIRE'), ['expire']);
    assert.deepEqual(selected('ATTENDANCE'), []);
    console.log('PASS: 연재·재화·미출석 경로 분리');

    assert.doesNotThrow(() =>
        moboAssertExplicitLiveKind('PREVIEW', 'SCHEDULE')
    );
    assert.throws(
        () => moboAssertExplicitLiveKind('LIVE', 'SCHEDULE'),
        /LIVE에서는 SCHEDULE/
    );
    console.log('PASS: SCHEDULE 일괄 LIVE 발송 차단');

    for (const kind of ['SERIAL', 'EXPIRE', 'ATTENDANCE']) {
        assert.doesNotThrow(() =>
            moboAssertExplicitLiveKind('LIVE', kind)
        );
    }
    assert.throws(
        () => moboValidateKind('ALL'),
        /올바르지 않은 발송 종류/
    );
    assert.throws(
        () => moboValidateKind(''),
        /올바르지 않은 발송 종류/
    );
    console.log('PASS: 명시한 발송 종류만 허용');

    assert.equal(moboIsSelectedScheduleItem('attendance', 'SERIAL'), false);
    assert.equal(moboIsSelectedScheduleItem('serial', 'EXPIRE'), false);
    assert.equal(moboIsSelectedScheduleItem('expire', 'SERIAL'), false);
    console.log('PASS: 다른 알림 종류 혼합 발송 차단');

    console.log('QA-046D-6 · 알림 종류별 LIVE 분리 PASS');
    console.log('실제 FCM 발송: 없음');
    console.log('Firestore 데이터 변경: 없음');
    console.log('예약 실행: 없음');
}

if (require.main === module) {
    try {
        runSelfTest();
    } catch (error) {
        console.error('QA-046D-6 테스트 실패:', error.message);
        process.exitCode = 1;
    }
}

module.exports = {
    moboValidateKind,
    moboAssertExplicitLiveKind,
    moboIsSelectedScheduleItem
};
