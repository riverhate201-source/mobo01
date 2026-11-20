'use strict';

// QA-046M: The independent QA server sends the message; the installed
// staging PWA is the click destination. Never use for final release.
const QA_APP_ORIGIN = 'https://staging--mobo-demo.netlify.app';
const QA_SERVER_ORIGIN = 'https://mobo-push-qa.netlify.app';

function moboQAPushTargets() {
    return Object.freeze({
        icon: QA_APP_ORIGIN + '/icon.png',
        badge: QA_APP_ORIGIN + '/notification-badge.png',
        link: QA_APP_ORIGIN + '/'
    });
}

function moboAssertQAPushTargets(targets) {
    if (!targets || typeof targets !== 'object') {
        throw new Error('QA 알림 대상 주소가 없습니다.');
    }
    const expected = moboQAPushTargets();
    for (const key of ['icon', 'badge', 'link']) {
        if (targets[key] !== expected[key] ||
            targets[key].startsWith(QA_SERVER_ORIGIN + '/')) {
            throw new Error('QA 알림의 앱 연결 주소가 올바르지 않습니다.');
        }
    }
    return true;
}

if (require.main === module) {
    const assert = require('node:assert/strict');
    const targets = moboQAPushTargets();
    assert.equal(moboAssertQAPushTargets(targets), true);
    assert.throws(() => moboAssertQAPushTargets({
        ...targets, link: QA_SERVER_ORIGIN + '/'
    }), /올바르지/);
    assert.throws(() => moboAssertQAPushTargets({
        ...targets, icon: 'https://resplendent-medovik-85b508.netlify.app/icon.png'
    }), /올바르지/);
    console.log('QA-046M PASS: staging PWA link/icon/badge, QA server and final release excluded');
}

module.exports = {
    QA_APP_ORIGIN,
    moboQAPushTargets,
    moboAssertQAPushTargets
};
