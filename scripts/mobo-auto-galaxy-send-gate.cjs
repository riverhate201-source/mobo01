'use strict';
// QA-046D-36: inert until a separate approved QA sender entrypoint is deployed.
// No Firebase initialization, no Netlify entrypoint, no scheduled invocation here.
const assert = require('node:assert/strict');
const {moboAssertQANetlifyReadOnlyConfig} =
    require('./mobo-auto-netlify-runtime-identity.cjs');
const {moboRunScopedServerPreview} =
    require('./mobo-auto-preview-runtime.cjs');
const {moboNetlifyPreviewContext} =
    require('./mobo-netlify-preview-adapter.cjs');
const {moboKSTDate, moboClockDue} =
    require('./mobo-scheduler-clock.cjs');
const {moboCanSendSchedule} =
    require('./mobo-live-guard.cjs');
const {claimDeliveryOnce} =
    require('./mobo-push-dedupe.cjs');
const {moboCompleteClaimedSend} =
    require('./mobo-auto-send-result.cjs');
const {moboBuildSerialNotificationBody} =
    require('./mobo-auto-notification-text.cjs');

const QA_ORIGIN = 'https://mobo-push-qa.netlify.app';
const QA_SENDER = 'mobo-qa-sender@mobo-qa-2026.iam.gserviceaccount.com';
const KINDS = Object.freeze(['attendance','serial','expire']);
const UID = /^[A-Za-z0-9_-]{8,128}$/;
const WINDOW_MS = 20 * 60 * 1000;

// Separate sender account must be provisioned only after explicit approval.
// Existing read-only service account is *never* accepted for actual sends.
function moboAssertQAGalaxySendGate(env) {
    moboAssertQANetlifyReadOnlyConfig(env);
    if (env.MOBO_QA_SEND_ACTIVE !== 'YES' ||
        env.MOBO_QA_SEND_APPROVAL !== 'APPROVED_GALAXY_ONLY' ||
        env.MOBO_QA_SEND_MODE !== 'QA_LIVE' ||
        env.MOBO_QA_SEND_MAX !== '1' ||
        !KINDS.includes(env.MOBO_QA_SEND_KIND) ||
        !UID.test(env.MOBO_QA_TEST_TARGET_UID || '') ||
        env.MOBO_QA_TEST_TARGET_UID !== env.MOBO_AUTO_TEST_UID) {
        throw new Error('QA_GALAXY_SEND_NOT_APPROVED');
    }
    let sender;
    try {
        sender = JSON.parse(env.MOBO_QA_SEND_SA_JSON);
    } catch {
        throw new Error('QA_GALAXY_SENDER_CREDENTIAL_NOT_READY');
    }
    if (!sender || sender.project_id !== 'mobo-qa-2026' ||
        sender.client_email !== QA_SENDER) {
        throw new Error('QA_GALAXY_SENDER_IDENTITY_MISMATCH');
    }
    return true;
}

function attendanceStillDue(sub, now) {
    if (!sub || sub.enabled !== true || sub.attendance !== true ||
        sub.timezone !== 'Asia/Seoul' ||
        typeof sub.token !== 'string' || sub.token.length < 20 ||
        !moboClockDue(now, sub.attendanceTime, WINDOW_MS)) return null;
    const status = sub.attendanceStatus;
    const date = moboKSTDate(now);
    if (!status || typeof status.date !== 'string' ||
        !/^20\d\d-\d\d-\d\d$/.test(status.date)) return null;
    const stamp = Date.parse(status.date + 'T00:00:00Z');
    if (!Number.isFinite(stamp) ||
        new Date(stamp).toISOString().slice(0,10) !== status.date ||
        status.date > date) return null;
    const missingLezhin = status.date < date || status.lezhin === false;
    const missingBomtoon = status.date < date || status.bomtoon === false;
    if (status.date === date &&
        (typeof status.lezhin !== 'boolean' ||
         typeof status.bomtoon !== 'boolean')) return null;
    if (!missingLezhin && !missingBomtoon) return null;
    return {missingLezhin, missingBomtoon};
}

function scheduleStillDue(kind, sub, schedule, now) {
    if (!sub || !schedule || !Array.isArray(schedule.days)) return 0;
    const day = moboKSTDate(now);
    let count = 0;
    for (const entry of schedule.days) {
        if (typeof entry !== 'string') continue;
        const m = /^(20\d\d-\d\d-\d\d)~(0|[1-9]\d{0,4})~([0-4])$/.exec(entry);
        if (!m || m[1] !== day) continue;
        const n = kind === 'serial' ? Number(m[2]) : Number(m[3]);
        if (!Number.isSafeInteger(n) || n < 1 || n > 10000) continue;
        const item = {kind, date:day, entry, count:n};
        if (moboCanSendSchedule(item, sub, schedule, now)) count += n;
    }
    return count;
}

function moboBuildQAGalaxyMessage({token, kind, count=0,
    missingLezhin=false, missingBomtoon=false, date, sub, schedule}) {
    if (!KINDS.includes(kind) || typeof token !== 'string' ||
        token.length < 20) throw new Error('QA_GALAXY_MESSAGE_INVALID');
    let title, body;
    if (kind === 'attendance') {
        const missing = [
            ...(missingLezhin ? ['레진'] : []),
            ...(missingBomtoon ? ['봄툰'] : [])
        ];
        if (!missing.length) throw new Error('QA_GALAXY_NO_MISSING_ATTENDANCE');
        title = 'MoBo 미출석 알림 ⏰ [QA]';
        body = '모보에서 ' + missing.join('·') +
            ' 출석 확인이 아직 남아 있어요.';
    } else {
        if (!Number.isSafeInteger(count) || count < 1 || count > 10000) {
            throw new Error('QA_GALAXY_COUNT_INVALID');
        }
        title = kind === 'serial' ? 'MoBo 연재 알림 📚 [QA]' :
            'MoBo 재화 소멸 알림 ⏰ [QA]';
        body = kind === 'serial' ?
            moboBuildSerialNotificationBody(count, date, sub, schedule) :
            count + '개 플랫폼의 재화 소멸 예정 내역을 확인해 주세요.';
    }
    return {
        token,
        notification:{title,body},
        webpush:{
            headers:{TTL:'600',Urgency:'high'},
            notification:{
                icon:QA_ORIGIN + '/icon.png',
                badge:QA_ORIGIN + '/notification-badge.png'
            },
            fcmOptions:{link:QA_ORIGIN + '/'}
        }
    };
}

// This is a capability-injected testable handler, not an HTTP route.
// Even a trusted caller cannot send without ALL QA environment gates.
async function moboQAGalaxySendOnce({env,db,send,clock=Date.now,kind}) {
    moboAssertQAGalaxySendGate(env);
    if (kind !== env.MOBO_QA_SEND_KIND ||
        typeof db?.collection !== 'function' ||
        typeof send !== 'function' || typeof clock !== 'function') {
        throw new Error('QA_GALAXY_CALL_INVALID');
    }
    const uid = env.MOBO_AUTO_TEST_UID;
    const now = clock();
    if (!Number.isSafeInteger(now)) throw new Error('QA_GALAXY_CLOCK_INVALID');
    const initial = await moboRunScopedServerPreview({
        db,env,context:moboNetlifyPreviewContext(now),log:()=>{}
    });
    const key = kind === 'attendance' ? 'attendanceDue' :
        (kind === 'serial' ? 'serialDue' : 'expireDue');
    if (initial[key] < 1) return {status:'NOT_DUE', sent:0};
    // Never use cached PREVIEW alone to authorize a send.
    const freshTime = clock();
    if (!Number.isSafeInteger(freshTime) ||
        moboKSTDate(freshTime) !== initial.date) {
        return {status:'TIME_CHANGED',sent:0};
    }
    const checked = await moboRunScopedServerPreview({
        db,env,context:moboNetlifyPreviewContext(freshTime),log:()=>{}
    });
    if (checked[key] < 1) return {status:'NO_LONGER_DUE',sent:0};

    const ref = db.collection('pushSubscriptions').doc(uid);
    const snapshot = await ref.get();
    const sub = snapshot.exists ? snapshot.data() : null;
    const justBeforeClaim = clock();
    if (!Number.isSafeInteger(justBeforeClaim) ||
        moboKSTDate(justBeforeClaim) !== initial.date) {
        return {status:'TIME_CHANGED',sent:0};
    }
    let extra = {};
    let serialSchedule = null;
    if (kind === 'attendance') {
        const missing = attendanceStillDue(sub, justBeforeClaim);
        if (!missing) return {status:'NO_LONGER_DUE',sent:0};
        extra = missing;
    } else {
        const sc = await db.collection('pushSchedules').doc(uid).get();
        const schedule = sc.exists ? sc.data() : null;
        const count = scheduleStillDue(kind,sub,schedule,justBeforeClaim);
        if (count < 1) return {status:'NO_LONGER_DUE',sent:0};
        extra = {count};
        if (kind === 'serial') serialSchedule = schedule;
    }
    // QA-046D-39: Firestore reads can be delayed. Do NOT claim/send using
    // the clock sampled before the latest await. Recheck the actual time
    // immediately before the atomic claim and cancel if the window expired.
    const finalNow = clock();
    const targetClock = kind === 'attendance'
        ? sub.attendanceTime : sub.serialTime;
    if (!Number.isSafeInteger(finalNow) ||
        moboKSTDate(finalNow) !== initial.date ||
        !moboClockDue(finalNow, targetClock, WINDOW_MS)) {
        return {status:'WINDOW_EXPIRED_BEFORE_CLAIM',sent:0};
    }
    const date = moboKSTDate(finalNow);
    const msg = moboBuildQAGalaxyMessage({
        token:sub.token,kind,date,sub,schedule:serialSchedule,...extra
    });
    // Atomic create: concurrent Netlify instances cannot both claim the
    // same uid+KST date+kind. Uncertain FCM outcomes never auto-retry.
    if (!await claimDeliveryOnce(db,uid,date,kind)) {
        return {status:'ALREADY_CLAIMED',sent:0};
    }
    await moboCompleteClaimedSend({
        db,uid,date,kind,send:()=>send(msg)
    });
    return {status:'FCM_ACCEPTED',sent:1};
}

// Standalone tests: in-memory Firestore and fake send ONLY.
async function runSelfTest() {
    const uid='QaGalaxySafetyUid_12345678',day='2026-11-17';
    const kst=(t)=>Date.parse(day+'T'+t+':00+09:00');
    const baseSub={
        enabled:true,timezone:'Asia/Seoul',serial:true,expire:true,
        attendance:true,serialTime:'22:00',attendanceTime:'22:30',
        expireDays:3,token:'QA_FAKE_TOKEN_1234567890123456789',
        attendanceStatus:{date:day,lezhin:false,bomtoon:true}
    };
    const baseSchedule={version:2,timezone:'Asia/Seoul',
        serialTime:'22:00',expireDays:3,days:[day+'~2~1']};
    const env={
        SITE_ID:'b1680059-2ea4-4120-9f29-62c4298f9ef7',
        SITE_NAME:'mobo-push-qa',URL:QA_ORIGIN,
        MOBO_NETLIFY_QA_PREVIEW:'YES',MOBO_AUTO_MODE:'PREVIEW',
        MOBO_AUTO_KIND:'SCHEDULE',MOBO_PREVIEW_CLOCK:'NOW',
        MOBO_AUTO_LIVE_CONFIRM:'NO',
        MOBO_QA_SCHEDULE_PROFILE:'READ_ONLY_FUTURE',
        MOBO_QA_NETLIFY_APPROVAL:'NOT_DEPLOYED',
        MOBO_AUTO_TEST_UID:uid,
        MOBO_FIREBASE_SERVICE_ACCOUNT:JSON.stringify({
            project_id:'mobo-qa-2026',
            client_email:'mobo-qa-readonly@mobo-qa-2026.iam.gserviceaccount.com'
        }),
        MOBO_QA_SEND_ACTIVE:'YES',
        MOBO_QA_SEND_APPROVAL:'APPROVED_GALAXY_ONLY',
        MOBO_QA_SEND_MODE:'QA_LIVE',
        MOBO_QA_SEND_MAX:'1',
        MOBO_QA_SEND_KIND:'attendance',
        MOBO_QA_TEST_TARGET_UID:uid,
        MOBO_QA_SEND_SA_JSON:JSON.stringify({
            project_id:'mobo-qa-2026',client_email:QA_SENDER
        })
    };
    function fakeDB(sub=baseSub,schedule=baseSchedule) {
        const data=new Map([
            ['pushSubscriptions/'+uid,sub],
            ['pushSchedules/'+uid,schedule]
        ]);
        const visited=[];
        return {
            data,visited,
            collection(name) {
                assert.ok(['pushSubscriptions','pushSchedules',
                    'pushDeliveryClaims'].includes(name));
                return {doc(id) {
                    if (name!=='pushDeliveryClaims') assert.equal(id,uid);
                    const path=name+'/'+id;
                    return {
                        async get() {
                            visited.push(path);
                            return {id,exists:data.has(path),data:()=>data.get(path)};
                        },
                        async create(value) {
                            assert.equal(name,'pushDeliveryClaims');
                            if (data.has(path)) {
                                const e=new Error('exists');e.code=6;throw e;
                            }
                            data.set(path,{...value});
                        },
                        async update(value) {
                            assert.equal(name,'pushDeliveryClaims');
                            if (!data.has(path)) throw new Error('missing claim');
                            data.set(path,{...data.get(path),...value});
                        }
                    };
                }};
            }
        };
    }
    assert.equal(moboAssertQAGalaxySendGate(env),true);
    for (const bad of [
        {MOBO_QA_SEND_ACTIVE:'NO'},
        {MOBO_QA_SEND_APPROVAL:'NOT_APPROVED'},
        {MOBO_QA_SEND_MODE:'PREVIEW'},
        {MOBO_QA_SEND_MAX:'2'},
        {MOBO_QA_SEND_KIND:'ALL'},
        {MOBO_QA_TEST_TARGET_UID:'SomeOtherGalaxyUid_12345678'},
        {SITE_NAME:'mobo-demo'},
        {MOBO_AUTO_MODE:'LIVE'},
        {MOBO_AUTO_LIVE_CONFIRM:'YES'},
        {MOBO_QA_SEND_SA_JSON:'not-json'},
        {MOBO_QA_SEND_SA_JSON:JSON.stringify({
            project_id:'mobo-qa-2026',
            client_email:'mobo-qa-readonly@mobo-qa-2026.iam.gserviceaccount.com'
        })},
        {MOBO_QA_SEND_SA_JSON:JSON.stringify({
            project_id:'mobo-demo',client_email:QA_SENDER
        })}
    ]) {
        assert.throws(()=>moboAssertQAGalaxySendGate(
            {...env,...bad}
        ),/QA|Netlify/);
    }
    assert.throws(()=>moboAssertQAGalaxySendGate({
        ...env,MOBO_QA_SEND_ACTIVE:undefined
    }),/QA/);
    console.log('PASS: only QA site, one Galaxy UID, separate sender, explicit approval');

    let sends=0, last=null;
    const db=fakeDB();
    const opts={env,db,kind:'attendance',clock:()=>kst('22:35'),
        send:async msg=>{sends++;last=msg;}};
    const sent=await moboQAGalaxySendOnce(opts);
    assert.deepEqual(sent,{status:'FCM_ACCEPTED',sent:1});
    assert.equal(sends,1);
    assert.equal(last.webpush.fcmOptions.link,QA_ORIGIN+'/');
    assert.equal(last.webpush.notification.icon,QA_ORIGIN+'/icon.png');
    assert.equal(last.webpush.notification.badge,
        QA_ORIGIN+'/notification-badge.png');
    assert.equal(last.notification.title.includes('[QA]'),true);
    assert.equal(db.visited.every(p=>p.startsWith('pushSubscriptions/'+uid) ||
        p.startsWith('pushSchedules/'+uid)),true);
    const claims=[...db.data].filter(([p])=>p.startsWith('pushDeliveryClaims/'));
    assert.equal(claims.length,1);
    assert.equal(claims[0][1].status,'sent');
    assert.equal(JSON.stringify(claims).includes(baseSub.token),false);
    const replay=await moboQAGalaxySendOnce(opts);
    assert.deepEqual(replay,{status:'ALREADY_CLAIMED',sent:0});
    assert.equal(sends,1);
    console.log('PASS: one QA FCM candidate, atomic claim, duplicate blocked, QA deep link');

    const completed=fakeDB({
        ...baseSub,attendanceStatus:{date:day,lezhin:true,bomtoon:true}
    });
    const complete=await moboQAGalaxySendOnce({...opts,db:completed});
    assert.equal(complete.sent,0);
    assert.equal(sends,1);
    assert.equal([...completed.data.keys()].some(k=>k.startsWith(
        'pushDeliveryClaims/')),false);
    const early=await moboQAGalaxySendOnce({
        ...opts,db:fakeDB(),clock:()=>kst('22:29')
    });
    assert.equal(early.sent,0);
    console.log('PASS: already attended, before window => zero sends or claims');

    const db2=fakeDB();
    const concurrency=await Promise.all([
        moboQAGalaxySendOnce({...opts,db:db2}),
        moboQAGalaxySendOnce({...opts,db:db2})
    ]);
    assert.equal(concurrency.reduce((n,r)=>n+r.sent,0),1);
    assert.equal(sends,2);
    console.log('PASS: simultaneous five-minute callers => at most one FCM attempt');

    const db3=fakeDB();
    await assert.rejects(moboQAGalaxySendOnce({
        ...opts,db:db3,send:async()=>{throw Error('FCM UNKNOWN');}
    }),/FCM_RESULT_UNCERTAIN/);
    const uncertain=[...db3.data].find(([p])=>p.startsWith(
        'pushDeliveryClaims/'))[1];
    assert.equal(uncertain.status,'needs_review');
    const after=await moboQAGalaxySendOnce({...opts,db:db3});
    assert.equal(after.sent,0);
    console.log('PASS: FCM uncertainty => needs_review, no automatic retry');

    const db4=fakeDB();
    const scheduled=await moboQAGalaxySendOnce({
        ...opts,db:db4,kind:'serial',clock:()=>kst('22:05'),
        env:{...env,MOBO_QA_SEND_KIND:'serial'}
    });
    assert.equal(scheduled.sent,1);
    assert.equal(db4.data.get('pushSchedules/'+uid).days.length,1);
    const exp=await moboQAGalaxySendOnce({
        ...opts,db:db4,kind:'expire',clock:()=>kst('22:05'),
        env:{...env,MOBO_QA_SEND_KIND:'expire'}
    });
    assert.equal(exp.sent,1);
    assert.equal(sends,4);
    console.log('PASS: serial/expire both due => independent kind/day claims');

    // QA-046E-2 | Real QA sender path uses existing opt-in formatter.
    // Synthetic Firestore + fake sends only. Never contacts FCM.
    const titledSchedule = {
        ...baseSchedule,
        days:[day+'~5~1'],
        serialTitlesByDate:{
            [day]:[
                '레진 · 작품 A','봄툰 · 작품 B',
                '리디 · 작품 C','네 번째 작품'
            ],
            '2026-11-18':['다른 날짜 작품']
        }
    };
    const titleTestMessages = [];
    const checkQASerial = async (sub,schedule=titledSchedule) => {
        const outcome=await moboQAGalaxySendOnce({
            env:{...env,MOBO_QA_SEND_KIND:'serial'},
            db:fakeDB(sub,schedule),
            kind:'serial',clock:()=>kst('22:05'),
            send:async message=>titleTestMessages.push(message)
        });
        assert.deepEqual(outcome,{status:'FCM_ACCEPTED',sent:1});
        return titleTestMessages.at(-1).notification.body;
    };
    const optInText=await checkQASerial({...baseSub,serialTitles:true});
    assert.equal(
        optInText,
        '확인할 연재 작품 5개가 있어요!\n' +
        '레진 · 작품 A\n봄툰 · 작품 B\n리디 · 작품 C\n' +
        '외 2개 작품은 모보에서 확인해 주세요.'
    );
    assert.equal(optInText.includes('네 번째 작품'),false);
    assert.equal(optInText.includes('다른 날짜 작품'),false);
    const optOutText=await checkQASerial({...baseSub,serialTitles:false});
    assert.equal(optOutText,'확인할 연재 작품 5개가 있어요!');
    const legacyText=await checkQASerial(
        {...baseSub,serialTitles:true},
        {...baseSchedule,days:[day+'~5~1']}
    );
    assert.equal(legacyText,'확인할 연재 작품 5개가 있어요!');
    assert.equal(
        moboBuildQAGalaxyMessage({
            token:baseSub.token,kind:'expire',count:1
        }).notification.body,
        '1개 플랫폼의 재화 소멸 예정 내역을 확인해 주세요.'
    );
    console.log('QA-046E-2 PASS: Galaxy opt-in 3 titles, OFF/legacy fallback');


    // QA-046D-39 | A database delay may cross the 20-minute cutoff after
    // the last subscription/schedule read. No claim should be created.
    const laggedDb=fakeDB();
    const laggedTimes=['22:35','22:35','22:35','22:51'];
    let tick=0;
    const lagged=await moboQAGalaxySendOnce({
        ...opts,db:laggedDb,
        clock:()=>kst(laggedTimes[Math.min(tick++,laggedTimes.length-1)])
    });
    assert.deepEqual(lagged,{
        status:'WINDOW_EXPIRED_BEFORE_CLAIM',sent:0
    });
    assert.equal([...laggedDb.data.keys()].some(k=>k.startsWith(
        'pushDeliveryClaims/')),false);
    assert.equal(sends,4);
    const laggedScheduleDb=fakeDB();
    const laggedScheduleTimes=['22:05','22:05','22:05','22:21'];
    let laggedScheduleTick=0;
    const laggedSchedule=await moboQAGalaxySendOnce({
        ...opts,db:laggedScheduleDb,kind:'serial',
        env:{...env,MOBO_QA_SEND_KIND:'serial'},
        clock:()=>kst(laggedScheduleTimes[Math.min(
            laggedScheduleTick++,laggedScheduleTimes.length-1)])
    });
    assert.deepEqual(laggedSchedule,{
        status:'WINDOW_EXPIRED_BEFORE_CLAIM',sent:0
    });
    assert.equal([...laggedScheduleDb.data.keys()].some(k=>k.startsWith(
        'pushDeliveryClaims/')),false);
    assert.equal(sends,4);
    console.log('PASS: slow Firestore crossing window => zero FCM and zero claim');

    const fs=require('node:fs'),path=require('node:path');
    const root=path.resolve(__dirname,'..');
    assert.equal(fs.existsSync(path.join(
        root,'netlify/functions/mobo-qa-readonly.mjs')),false);
    console.log('PASS: Netlify scheduled entrypoint removed; sender disabled');
    console.log('QA-046D-36 PASS: no real Firestore writes or FCM sends');
}
if (require.main===module) {
    runSelfTest().catch(e=>{console.error('QA-046D-36 failed:',e.code||
        e.message);process.exitCode=1;});
}
module.exports={moboAssertQAGalaxySendGate,moboBuildQAGalaxyMessage,
    moboQAGalaxySendOnce};
