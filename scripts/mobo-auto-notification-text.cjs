'use strict';

// QA-046E | Opt-in serial title summary. Pure formatting; no Firebase access.
// Old schedules and opt-out subscribers keep their original notification text.
const assert = require('node:assert/strict');

function moboBuildSerialNotificationBody(count, date, sub, schedule) {
    const fallback = '확인할 연재 작품 ' + count + '개가 있어요!';

    if (
        !Number.isSafeInteger(count) ||
        count < 1 ||
        sub?.serialTitles !== true ||
        typeof date !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(date)
    ) return fallback;

    const byDate = schedule?.serialTitlesByDate;
    if (
        !byDate ||
        typeof byDate !== 'object' ||
        Array.isArray(byDate) ||
        !Object.prototype.hasOwnProperty.call(byDate, date)
    ) return fallback;

    const values = byDate[date];
    if (!Array.isArray(values)) return fallback;

    const names = [];
    for (const raw of values.slice(0, 3)) {
        if (typeof raw !== 'string') continue;
        // Do not permit newline/control-character injection into the notification.
        const name = Array.from(
            raw.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
        ).slice(0, 68).join('');
        if (name) names.push(name);
        if (names.length >= Math.min(3, count)) break;
    }

    if (names.length === 0) return fallback;

    const lines = [fallback, ...names];
    const remaining = Math.max(0, count - names.length);
    if (remaining > 0) {
        lines.push('외 ' + remaining + '개 작품은 모보에서 확인해 주세요.');
    }
    return lines.join('\n');
}

function runSelfTest() {
    const date = '2026-11-20';
    const optIn = {serialTitles:true};
    const optOut = {serialTitles:false};
    const schedule = {
        serialTitlesByDate: {
            [date]: ['레진 · 작품 A', '봄툰 · 작품 B', '리디 · 작품 C'],
            '2026-11-21': ['다른 날짜의 작품']
        }
    };
    const base = '확인할 연재 작품 5개가 있어요!';

    assert.equal(moboBuildSerialNotificationBody(5,date,optOut,schedule),base);
    assert.equal(moboBuildSerialNotificationBody(5,date,{},schedule),base);
    assert.equal(moboBuildSerialNotificationBody(5,date,optIn,{}),base);
    assert.equal(moboBuildSerialNotificationBody(5,'2026-11-22',optIn,schedule),base);
    assert.equal(moboBuildSerialNotificationBody(5,date,optIn,{}),base);
    assert.equal(
        moboBuildSerialNotificationBody(5,date,optIn,schedule),
        base+'\n레진 · 작품 A\n봄툰 · 작품 B\n리디 · 작품 C'+
        '\n외 2개 작품은 모보에서 확인해 주세요.'
    );
    assert.equal(
        moboBuildSerialNotificationBody(1,date,optIn,schedule),
        '확인할 연재 작품 1개가 있어요!\n레진 · 작품 A'
    );
    assert.equal(
        moboBuildSerialNotificationBody(3,date,optIn,{
            serialTitlesByDate:{[date]:['작품 A','작품 B','작품 C','작품 D']}
        }).split('\n').filter(s => s.startsWith('작품 ')).length,
        3
    );
    assert.equal(
        moboBuildSerialNotificationBody(2,date,optIn,{
            serialTitlesByDate:{[date]:['첫째\n둘째','두번째']}
        }).includes('첫째 둘째'),
        true
    );
    assert.equal(
        moboBuildSerialNotificationBody(2,date,optIn,{
            serialTitlesByDate:{[date]:[null,{},'정상 제목']}
        }),
        '확인할 연재 작품 2개가 있어요!\n정상 제목\n'+
        '외 1개 작품은 모보에서 확인해 주세요.'
    );
    assert.equal(
        moboBuildSerialNotificationBody(5,date,optIn,{
            serialTitlesByDate:{[date]:'잘못된 형식'}
        }), base
    );
    assert.equal(
        moboBuildSerialNotificationBody(5,date,optIn,{
            serialTitlesByDate: Object.create({[date]:['상속된 제목']})
        }),base
    );
    const long = '가'.repeat(100);
    assert.equal(
        moboBuildSerialNotificationBody(1,date,optIn,{
            serialTitlesByDate:{[date]:[long]}
        }).split('\n')[1].length,
        68
    );
    console.log('QA-046E: title opt-in, legacy fallback, max-3, sanitization PASS');
}

if (require.main === module) runSelfTest();
module.exports = {moboBuildSerialNotificationBody};
