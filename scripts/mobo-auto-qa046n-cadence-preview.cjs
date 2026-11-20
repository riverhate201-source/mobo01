'use strict';

// QA-046N revised for the fixed-time product design (2 times/day).
// Entirely offline: NO cron registration, Netlify function, Firestore,
// FCM or network requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    FIXED_SLOTS,
    moboFixedPreviewSnapshot,
    moboFixedSlotDue
} = require('./mobo-auto-fixed-time-policy.cjs');

const DAY_MS = 86400000;
const START_DAY_UTC = Date.parse('2026-11-20T00:00:00.000Z');

function simulateThirtyDays() {
    const counts = {serial:0,expire:0,attendance:0,invocations:0};
    for (let day = 0; day < 30; day++) {
        const date = new Date(START_DAY_UTC + day * DAY_MS)
            .toISOString().slice(0,10);
        for (const slot of FIXED_SLOTS) {
            const utcTime = slot.kind === 'SERIAL_EXPIRE'
                ? '13:00:00.000Z' : '13:30:00.000Z';
            const now = Date.parse(date+'T'+utcTime);
            const snapshot = moboFixedPreviewSnapshot(now);
            assert.equal(snapshot.kstDate,date);
            if (slot.kind === 'SERIAL_EXPIRE') {
                assert.equal(slot.utcCron,'0 13 * * *');
                assert.equal(snapshot.webtoonDate,new Date(
                    START_DAY_UTC+(day+1)*DAY_MS
                ).toISOString().slice(0,10));
                assert.equal(snapshot.serialDue,true);
                assert.equal(snapshot.expireDue,true);
                assert.equal(snapshot.attendanceDue,false);
                counts.serial++;
                counts.expire++;
            } else {
                assert.equal(slot.utcCron,'30 13 * * *');
                assert.equal(snapshot.serialDue,false);
                assert.equal(snapshot.expireDue,false);
                assert.equal(snapshot.attendanceDue,true);
                counts.attendance++;
            }
            counts.invocations++;
        }
    }
    assert.deepEqual(counts,{
        serial:30,expire:30,attendance:30,invocations:60
    });

    const kst=(day,time)=>Date.parse(day+'T'+time+':00+09:00');
    assert.equal(moboFixedSlotDue('serial',kst('2026-11-20','21:59')),false);
    assert.equal(moboFixedSlotDue('serial',kst('2026-11-20','22:00')),true);
    assert.equal(moboFixedSlotDue('attendance',kst('2026-11-20','22:30')),true);
    assert.equal(moboFixedSlotDue('attendance',kst('2026-11-21','00:00')),false);

    // Disabled scheduler and deployment guard; no 5-minute cron.
    const root=path.resolve(__dirname,'..');
    const workflow=fs.readFileSync(path.join(root,
        '.github/workflows/mobo-auto-pc-test.yml'),'utf8');
    assert.doesNotMatch(workflow,/^\s*schedule\s*:/m);
    assert.equal(fs.existsSync(path.join(root,'netlify.toml')),false);
    assert.equal(fs.existsSync(path.join(root,'netlify/functions')),false);
    return {...counts,cronInstalled:false,functionsDeployed:0,
        firebaseWrites:0,pushSent:0};
}

if (require.main === module) {
    try {
        const results=simulateThirtyDays();
        assert.equal(results.invocations,60);
        console.log('QA-046N PASS: 30 days / 60 fixed-time synthetic executions');
        console.log('PASS: 22:00 serial+expire, 22:30 attendance, UTC+9 and rollover');
        console.log('No cron registration, no Netlify Functions, FCM sends: 0');
        console.log('QA-046N remains OFFLINE; automatic scheduling NOT ACTIVE');
    } catch (e) {
        console.error('QA-046N FAIL:',e.message);
        process.exitCode=1;
    }
}

module.exports={simulateThirtyDays};
