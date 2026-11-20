'use strict';

// QA-046N: 24-hour simulation of a future 5-minute QA schedule.
// Offline only: NO cron activation, Netlify deployment, Firebase access,
// FCM send, or persistent writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {moboCheckSafeScheduledPayload} =
    require('./mobo-auto-netlify-cutover-contract.cjs');
const {moboClockDue, moboKSTDate, moboWebtoonDate} =
    require('./mobo-scheduler-clock.cjs');
const {moboNextFiveMinuteTick} =
    require('./mobo-scheduler-tick-check.cjs');

const FIVE = 5 * 60 * 1000;
const KST = (date, clock) =>
    Date.parse(date + 'T' + clock + ':00+09:00');

function simulateOneDay() {
    const start = KST('2026-11-20', '00:00');
    let checked = 0;
    let serial2000 = 0;
    let serial2233 = 0;
    let attendance2230 = 0;

    // Use synthetic ticks. They DO NOT contact a scheduler or database.
    for (let i = 0; i < 288; i++) {
        const now = start + i * FIVE;
        const nextRun = new Date(now + FIVE).toISOString();
        const {context, decision} = moboCheckSafeScheduledPayload(
            {next_run: nextRun}, now
        );
        assert.equal(decision.status, 'ON_TIME_PREVIEW');
        assert.equal(decision.permitted, true);
        assert.equal(decision.scheduledAt, now);
        assert.equal(context.mode, 'PREVIEW');
        assert.equal(context.kind, 'SCHEDULE');
        assert.equal(context.kstDate, moboKSTDate(now));
        assert.equal(moboNextFiveMinuteTick(now), now);

        serial2000 += Number(moboClockDue(now, '20:00'));
        serial2233 += Number(moboClockDue(now, '22:33'));
        attendance2230 += Number(moboClockDue(now, '22:30'));
        checked++;
    }

    assert.equal(checked, 288);
    assert.equal(serial2000, 4);       // 20:00, 20:05, 20:10, 20:15
    assert.equal(serial2233, 4);       // 22:35, 22:40, 22:45, 22:50
    assert.equal(attendance2230, 4); // 22:30, 22:35, 22:40, 22:45
    assert.equal(moboWebtoonDate(KST('2026-11-20', '21:55')),
        '2026-11-20');
    assert.equal(moboWebtoonDate(KST('2026-11-20', '22:00')),
        '2026-11-21');
    assert.equal(moboKSTDate(KST('2026-11-20', '22:00')),
        '2026-11-20');

    // The next UTC tick after 23:55 KST is 00:00 the next KST day.
    const boundary = moboCheckSafeScheduledPayload(
        {next_run:new Date(KST('2026-11-21','00:00')).toISOString()},
        KST('2026-11-20','23:55')
    );
    assert.equal(boundary.decision.status, 'ON_TIME_PREVIEW');
    assert.equal(boundary.context.kstDate, '2026-11-20');

    const nextDay = moboCheckSafeScheduledPayload(
        {next_run:new Date(KST('2026-11-21','00:05')).toISOString()},
        KST('2026-11-21','00:00')
    );
    assert.equal(nextDay.context.kstDate, '2026-11-21');
    assert.equal(moboClockDue(KST('2026-11-21','00:05'),
        '23:55'), false);

    // A future scheduler must fail closed on early, stale or LIVE payloads.
    const onTimeNext = new Date(KST('2026-11-20','22:10')).toISOString();
    assert.equal(moboCheckSafeScheduledPayload(
        {next_run:onTimeNext}, KST('2026-11-20','22:08')
    ).decision.status, 'ON_TIME_PREVIEW');
    assert.equal(moboCheckSafeScheduledPayload(
        {next_run:onTimeNext}, KST('2026-11-20','22:04')
    ).decision.status, 'EARLY_INVOCATION');
    assert.equal(moboCheckSafeScheduledPayload(
        {next_run:onTimeNext}, KST('2026-11-20','22:09')
    ).decision.status, 'STALE_INVOCATION');
    for (const bad of [
        {next_run:onTimeNext, mode:'LIVE'},
        {next_run:onTimeNext, send:true},
        {}
    ]) {
        assert.throws(() => moboCheckSafeScheduledPayload(
            bad, KST('2026-11-20','22:05')
        ), /QA Netlify/);
    }

    // Confirm that this is ONLY a simulation; no timer was registered.
    const root = path.resolve(__dirname, '..');
    const workflow = fs.readFileSync(path.join(root,
        '.github/workflows/mobo-auto-pc-test.yml'),'utf8');
    assert.doesNotMatch(workflow, /^\s*schedule\s*:/m);
    assert.equal(fs.existsSync(path.join(root,'netlify.toml')),false);
    assert.equal(fs.existsSync(path.join(root,'netlify/functions')),false);

    return {checked,serial2000,serial2233,attendance2230,
        remoteReads:0,remoteWrites:0,pushSent:0,cronInstalled:false};
}

if (require.main === module) {
    try {
        const result = simulateOneDay();
        assert.equal(result.checked,288);
        console.log('QA-046N PASS: 288 synthetic 5-minute ticks');
        console.log('PASS: 20:00, 22:33, 22:30 windows and 22:00 webtoon rollover');
        console.log('PASS: early/stale/LIVE guards; no active cron/Netlify function');
        console.log('Remote Firebase reads/writes: 0/0; FCM sends: 0');
        console.log('QA-046N status: OFFLINE PREVIEW VERIFIED; SCHEDULE NOT ACTIVE');
    } catch (error) {
        console.error('QA-046N FAIL:', error.message);
        process.exitCode=1;
    }
}

module.exports = {simulateOneDay};
