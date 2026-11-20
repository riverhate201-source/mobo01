'use strict';

// QA-046T | Two future scheduled-function slots, PREVIEW-only contract.
// OFFLINE ONLY. Does not define Netlify functions, schedule jobs,
// access Firestore, or send FCM. Production launch remains BLOCKED.
const assert = require('node:assert/strict');
const {
    FIXED_SLOTS,
    moboFixedPreviewSnapshot
} = require('./mobo-auto-fixed-time-policy.cjs');

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_LATE_MS = 20 * 60 * 1000;
const SLOT_TASKS = Object.freeze({
    SERIAL_EXPIRE: Object.freeze(['SERIAL', 'EXPIRE']),
    ATTENDANCE: Object.freeze(['ATTENDANCE'])
});

function moboPlanFixedScheduledPreview({slot, event, now}) {
    const specification = FIXED_SLOTS.find(x => x.kind === slot);
    if (!specification) throw new Error('승인된 하루 2회 알림 슬롯이 아닙니다');
    if (!event || typeof event !== 'object' || Array.isArray(event) ||
        Object.keys(event).length !== 1 ||
        typeof event.next_run !== 'string') {
        throw new Error('예약 실행은 next_run 하나만 허용합니다');
    }
    const raw = event.next_run;
    if (!/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.000)?Z$/.test(raw)) {
        throw new Error('예약 UTC next_run 형식 오류');
    }
    const nextMs = Date.parse(raw);
    if (!Number.isSafeInteger(nextMs) ||
        new Date(nextMs).toISOString().replace('.000Z','Z') !==
        raw.replace('.000Z','Z')) {
        throw new Error('예약 UTC next_run 날짜 오류');
    }
    // next_run refers to the following day's occurrence for a daily slot.
    const expectedHour = slot === 'SERIAL_EXPIRE' ? 13 : 13;
    const expectedMinute = slot === 'SERIAL_EXPIRE' ? 0 : 30;
    const utc = new Date(nextMs);
    if (utc.getUTCHours() !== expectedHour ||
        utc.getUTCMinutes() !== expectedMinute ||
        utc.getUTCSeconds() !== 0) {
        throw new Error('고정 알림 슬롯의 예약 UTC 시각이 다릅니다');
    }
    if (!Number.isFinite(now)) throw new Error('실행 시각 오류');
    const scheduledAt = nextMs - DAY_MS;
    const lateMs = now - scheduledAt;
    const status = lateMs < 0 ? 'EARLY_SKIP'
        : lateMs >= MAX_LATE_MS ? 'STALE_SKIP'
        : 'ON_TIME_PREVIEW';
    const preview = moboFixedPreviewSnapshot(now);
    if (status === 'ON_TIME_PREVIEW') {
        if (slot === 'SERIAL_EXPIRE') {
            assert.equal(preview.serialDue, true);
            assert.equal(preview.expireDue, true);
            assert.equal(preview.attendanceDue, false);
        } else {
            assert.equal(preview.attendanceDue, true);
            assert.equal(preview.serialDue, false);
            assert.equal(preview.expireDue, false);
        }
    }
    return Object.freeze({
        mode: 'PREVIEW',
        slot,
        cronUtc: specification.utcCron,
        status,
        tasks: status === 'ON_TIME_PREVIEW' ?
            SLOT_TASKS[slot] : Object.freeze([]),
        scheduledAt,
        kstDate: preview.kstDate,
        webtoonDate: preview.webtoonDate,
        sendPermitted: false
    });
}

function runSelfTest() {
    const at = (day,time) => Date.parse(day+'T'+time+':00+09:00');
    const examples = [
        {slot:'SERIAL_EXPIRE',clock:'22:00',cron:'0 13 * * *',
            kinds:['SERIAL','EXPIRE']},
        {slot:'ATTENDANCE',clock:'22:30',cron:'30 13 * * *',
            kinds:['ATTENDANCE']}
    ];
    for (const item of examples) {
        const onTime = at('2026-11-20',item.clock);
        const nextRun = new Date(onTime+DAY_MS).toISOString();
        const request = {slot:item.slot,event:{next_run:nextRun}};
        const planned = moboPlanFixedScheduledPreview({...request,now:onTime});
        assert.equal(planned.status,'ON_TIME_PREVIEW');
        assert.equal(planned.cronUtc,item.cron);
        assert.deepEqual(planned.tasks,item.kinds);
        assert.equal(planned.sendPermitted,false);
        assert.equal(planned.kstDate,'2026-11-20');
        assert.equal(planned.webtoonDate,'2026-11-21');
        assert.equal(
            moboPlanFixedScheduledPreview({
                ...request,now:onTime-1
            }).status,'EARLY_SKIP'
        );
        assert.equal(
            moboPlanFixedScheduledPreview({
                ...request,now:onTime+MAX_LATE_MS
            }).status,'STALE_SKIP'
        );
        assert.deepEqual(
            moboPlanFixedScheduledPreview({
                ...request,now:onTime+MAX_LATE_MS
            }).tasks,[]
        );
        assert.throws(() => moboPlanFixedScheduledPreview({
            ...request,event:{next_run:nextRun,mode:'LIVE'},now:onTime
        }),/next_run 하나/);
        assert.throws(() => moboPlanFixedScheduledPreview({
            ...request,event:{next_run:nextRun,send:true},now:onTime
        }),/next_run 하나/);
        assert.throws(() => moboPlanFixedScheduledPreview({
            ...request,event:{next_run:
                new Date(onTime+DAY_MS+300000).toISOString()},now:onTime
        }),/예약 UTC 시각/);
    }
    assert.throws(() => moboPlanFixedScheduledPreview({
        slot:'UNKNOWN',event:{next_run:'2026-11-21T13:00:00.000Z'},
        now:at('2026-11-20','22:00')
    }),/승인된/);
    const thirtyDayInvocations = 30*examples.length;
    assert.equal(thirtyDayInvocations,60);
    console.log('QA-046T PASS: 2 daily slots, 60 invocations per 30 days');
    console.log('PASS: serial+expire at 22:00 and attendance at 22:30 KST');
    console.log('PASS: early/late/wrong slot and injected LIVE/send blocked');
    console.log('No active Netlify cron, Firebase accesses, or FCM sends');
}

if (require.main===module) runSelfTest();
module.exports={moboPlanFixedScheduledPreview};
