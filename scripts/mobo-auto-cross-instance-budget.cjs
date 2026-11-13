'use strict';

// MoBo QA-046D-23 | 서버 간 lease 승계 + 배치 시간 예산 + checkpoint + claim 통합
// 가짜 Firestore/FCM 승인만 사용. 실제 외부 시스템 접근 및 푸시 발송 없음.
// 쓰기 가능한 옵션은 메모리 DB에만 주입하며 Netlify와 연결하지 않는다.
const assert = require('node:assert/strict');
const {
    moboCreateFirestoreRunLease,
    moboWithRunLease
} = require('./mobo-auto-run-lease.cjs');
const {moboCreateFirestoreCheckpointStore} =
    require('./mobo-auto-firestore-checkpoint.cjs');
const {moboCheckpointScope, moboRunResumableBatch} =
    require('./mobo-auto-resume-checkpoint.cjs');
const {moboDecideScheduledPreview} =
    require('./mobo-auto-scheduled-preview-guard.cjs');
const {makeFakeFirebase} =
    require('./mobo-auto-pipeline-integration.cjs');
const {moboCanSendSchedule} = require('./mobo-live-guard.cjs');
const {claimDeliveryOnce, markDeliverySent, makeDeliveryKey} =
    require('./mobo-push-dedupe.cjs');

const PROJECT = 'mobo-qa-2026';
const DAY = '2026-11-12';
const KST = (time) => Date.parse(DAY + 'T' + time + ':00+09:00');
const UID = number => 'QaUser_' + String(number).padStart(6, '0');
const ENTRY = DAY + '~3~1';
const SAFE_BUFFER_MS = 5000;

function moboValidateLeasedBatchBudget({
    leaseMs, budgetMs, bufferMs = SAFE_BUFFER_MS
}) {
    if (!Number.isSafeInteger(leaseMs) ||
        !Number.isSafeInteger(budgetMs) ||
        !Number.isSafeInteger(bufferMs) ||
        budgetMs <= 0 || bufferMs < SAFE_BUFFER_MS ||
        budgetMs > 25000 || leaseMs > 25000 || leaseMs < 5000 ||
        budgetMs + bufferMs >= leaseMs) {
        throw new Error('QA 서버 실행 예산이 lease보다 길거나 여유가 부족함');
    }
    return {leaseMs, budgetMs, bufferMs};
}

// 예약 시각을 확정한 다음에만 lease 획득; 첫 외부 효과 전 소유권 검사.
// 프로덕션용 API 아님: 현재 checkout에서도 실제 FCM/Firestore 쓰기를 하지 않음.
async function moboRunLeasedSyntheticTick({
    db, checkpoint, lease, context, kind, visit,
    budgetMs = 12000, pageSize = 4, maxPages = 6,
    parallel = 1, budgetClock = () => 0
}) {
    const decision = moboDecideScheduledPreview(context);
    if (!decision.permitted || decision.scheduledAt === null) {
        return {skipped: true, reason: decision.status};
    }
    moboValidateLeasedBatchBudget({
        leaseMs: lease.leaseMs, budgetMs
    });
    if (!['serial', 'expire'].includes(kind)) {
        throw new Error('QA 다중 사용자 알림 종류 오류');
    }

    const scope = moboCheckpointScope(context.kstDate, kind,
        decision.scheduledAt);

    return moboWithRunLease(lease, scope, verify =>
        moboRunResumableBatch({
            db, store: checkpoint, date: context.kstDate, kind,
            tickAt: decision.scheduledAt, assertActive: verify,
            batchOptions: {
                pageSize, maxPages, parallel, budgetMs
            },
            clock: budgetClock,
            visit: doc => visit(doc, verify)
        })
    );
}

function previewContext(now, scheduledAt) {
    return {
        mode: 'PREVIEW', kind: 'SCHEDULE', now,
        kstDate: DAY,
        nextRun: new Date(scheduledAt + 5 * 60 * 1000).toISOString()
    };
}

function makeSyntheticState(size = 12) {
    const fake = makeFakeFirebase(size);
    let now = KST('22:05');
    const lease = moboCreateFirestoreRunLease(fake.db, {
        projectId: PROJECT, writesEnabled: true,
        leaseMs: 20000, clock: () => now
    });
    const checkpoint = moboCreateFirestoreCheckpointStore(fake.db, {
        projectId: PROJECT, writesEnabled: true,
        nowISO: () => new Date(now).toISOString()
    });
    const sent = new Map();
    const guardDecisions = new Map();
    function counters() {
        return {
            writes: fake.counts.writes,
            leases: fake.collections.get('qaPushBatchLeases').size,
            claims: fake.collections.get('pushDeliveryClaims').size
        };
    }
    async function send(doc, kind, verify) {
        await verify();
        const [sub, schedule] = await Promise.all([
            fake.db.collection('pushSubscriptions').doc(doc.id).get(),
            fake.db.collection('pushSchedules').doc(doc.id).get()
        ]);
        const item = {date: DAY, kind, entry: ENTRY};
        if (!moboCanSendSchedule(item, sub.data(), schedule.data(), now)) {
            guardDecisions.set(doc.id + '|' + kind, 'NOT_DUE');
            return;
        }
        await verify();
        if (!await claimDeliveryOnce(fake.db, doc.id, DAY, kind)) {
            guardDecisions.set(doc.id + '|' + kind, 'CLAIM_EXISTS');
            return;
        }
        // 모의 FCM 승인: 실제 메시징 SDK를 전혀 호출하지 않음.
        sent.set(doc.id + '|' + kind, (sent.get(doc.id + '|' + kind) || 0) + 1);
        await markDeliverySent(fake.db, doc.id, DAY, kind);
    }
    return {
        fake, lease, checkpoint, sent, guardDecisions,
        getNow: () => now,
        setNow: value => { now = value; },
        counters, send
    };
}

async function runSelfTest() {
    // 비슷한 크기의 timeout과 lease를 함께 사용하면 잘못된 완료 처리 위험.
    moboValidateLeasedBatchBudget({
        leaseMs:20000, budgetMs:12000
    });
    for (const invalid of [
        {leaseMs:20000,budgetMs:15000},
        {leaseMs:20000,budgetMs:20000},
        {leaseMs:26000,budgetMs:12000},
        {leaseMs:20000,budgetMs:-1},
        {leaseMs:20000,budgetMs:12000,bufferMs:1000}
    ]) {
        assert.throws(() => moboValidateLeasedBatchBudget(invalid),
            /실행 예산/);
    }
    console.log('PASS: 작업 시간 + 안전 여유 < lease, 위험한 설정 차단');

    const state = makeSyntheticState(12);
    let entered;
    const reachedFirst = new Promise(resolve => { entered = resolve; });
    let releaseA;
    const gateA = new Promise(resolve => { releaseA = resolve; });
    let activeA = true;
    const context = previewContext(KST('22:05'), KST('22:05'));

    // 서버 A가 첫 사용자를 읽고 멈춰있는 상황
    const a = moboRunLeasedSyntheticTick({
        db:state.fake.db, checkpoint:state.checkpoint,
        lease:state.lease, context, kind:'serial',
        visit:async (doc, verify) => {
            if (doc.id === UID(0) && activeA) {
                activeA = false;
                entered();
                await gateA;
            }
            await state.send(doc, 'serial', verify);
        }
    });
    await reachedFirst;

    // 두 번째 서버가 같은 tick을 동시에 시작하면 lease 획득 실패
    const bBefore = await moboRunLeasedSyntheticTick({
        db:state.fake.db, checkpoint:state.checkpoint,
        lease:state.lease, context, kind:'serial',
        visit:doc => state.send(doc, 'serial', async () => {})
    });
    assert.deepEqual(bBefore, {
        skipped: true, reason:'LEASE_HELD'
    });
    assert.equal(state.counters().claims, 0);
    console.log('PASS: 두 서버 동일 tick 충돌 시 최초 실행만 처리');

    // 서버 A가 응답하지 않는 동안 lease가 만료되고 B로 승계
    state.setNow(KST('22:05') + 21000);
    const newContext = previewContext(state.getNow(), KST('22:05'));
    const b = await moboRunLeasedSyntheticTick({
        db:state.fake.db, checkpoint:state.checkpoint,
        lease:state.lease, context:newContext, kind:'serial',
        visit:(doc, verify) => state.send(doc, 'serial', verify)
    });
    assert.equal(b.skipped, false);
    assert.equal(b.result.completed, true);
    releaseA();
    await assert.rejects(a, /소유권 상실/);
    const serialClaims = state.fake.collections.get('pushDeliveryClaims');
    assert.equal(serialClaims.size, 10); // 4번 OFF, 6번 토큰 누락
    assert.equal([...state.sent.values()].reduce((a,b)=>a+b,0), 10);
    assert.ok([...state.sent.values()].every(count => count === 1));
    assert.equal(
        state.fake.collections.get('qaPushBatchCheckpoints').size, 1
    );
    console.log('PASS: A 정지·lease 만료·B 승계 후 A의 추가 발송 차단');
    console.log('PASS: 정상 모의 알림 10건, 중복 모의 발송 0건');

    // 서버 C가 승계된 실행을 다시 처리해도 완료 체크포인트로 건너뜀.
    const c = await moboRunLeasedSyntheticTick({
        db:state.fake.db, checkpoint:state.checkpoint,
        lease:state.lease, context:newContext, kind:'serial',
        visit:() => {throw new Error('ALREADY_DONE_MUST_NOT_RUN');}
    });
    assert.equal(c.result.alreadyCompleted, true);
    assert.equal(state.counters().claims, 10);
    console.log('PASS: 동일 tick 재시작 시 완료 체크포인트 유지');

    // 별도의 재화 알림 tick에서 마지막 작업 직전 시간초과를 재현.
    state.setNow(KST('22:10'));
    const nextContext = previewContext(state.getNow(), KST('22:10'));
    let runtime = 0;
    let expireAttempts = 0;
    const timed = await moboRunLeasedSyntheticTick({
        db:state.fake.db, checkpoint:state.checkpoint,
        lease:state.lease, context:nextContext, kind:'expire',
        pageSize:5, maxPages:4, budgetMs:6000,
        budgetClock: () => runtime,
        visit: async (doc, verify) => {
            await state.send(doc, 'expire', verify);
            expireAttempts++;
            runtime += 3000;
        }
    }).then(
        () => null,
        error => error
    );
    assert.match(timed?.message ?? '', /시간 초과/);
    const expireScope = moboCheckpointScope(DAY, 'expire', KST('22:10'));
    const expireKey = state.fake.collections.get('qaPushBatchCheckpoints');
    assert.equal(
        [...expireKey.values()].some(x => x.scope === expireScope), false
    );
    assert.equal(expireAttempts, 2);
    console.log('PASS: 페이지 처리 중 예산 소진 → 미완료 페이지 저장 금지');

    // 다시 실행하면 해당 페이지를 처음부터 방문하지만 이미 보낸
    // 0,1번은 영속 claim 덕분에 한 번만 발송한 것으로 남음.
    const resumed = await moboRunLeasedSyntheticTick({
        db:state.fake.db, checkpoint:state.checkpoint,
        lease:state.lease, context:nextContext, kind:'expire',
        budgetMs:12000,
        visit:(doc, verify) => state.send(doc, 'expire', verify)
    });
    assert.equal(resumed.result.completed, true);
    assert.equal([...state.sent.entries()].filter(([key]) =>
        key.endsWith('|expire')).length, 10);
    assert.ok([...state.sent.values()].every(v => v === 1));
    assert.equal(
        state.fake.collections.get('pushDeliveryClaims').size, 20
    );
    console.log('PASS: 재시작 후 미완료 페이지 재방문해도 claim 중복 발송 차단');

    // 예약 요청이 오래되었거나 아직 도달하지 않았다면
    // lease와 checkpoint 쓰기도 실행하지 않는 게 원칙.
    const stale = previewContext(
        KST('22:15'), KST('22:05')
    );
    const before = state.counters();
    assert.deepEqual(await moboRunLeasedSyntheticTick({
        db:state.fake.db, checkpoint:state.checkpoint,
        lease:state.lease, context:stale, kind:'serial',
        visit:() => {throw new Error('STALE_MUST_NOT_RUN');}
    }), {
        skipped:true, reason:'STALE_INVOCATION'
    });
    const early = previewContext(
        KST('22:09'), KST('22:10')
    );
    assert.deepEqual(await moboRunLeasedSyntheticTick({
        db:state.fake.db, checkpoint:state.checkpoint,
        lease:state.lease, context:early, kind:'expire',
        visit:() => {throw new Error('EARLY_MUST_NOT_RUN');}
    }), {
        skipped:true, reason:'EARLY_INVOCATION'
    });
    assert.deepEqual(state.counters(),before);
    console.log('PASS: 조기·지연 예약 호출은 외부 상태 변경 전 차단');

    console.log('QA-046D-23 · 서버 간 lease/시간 예산/복구 통합 PASS');
    console.log('주의: 별도 서버 프로세스 간 실제 경쟁과 시계 오차 미검증');
    console.log('주의: checkpoint 갱신과 lease fencing의 원자성은 아직 미구현');
    console.log('실제 Firebase 쓰기/FCM/Netlify 호출: 없음');
}
if (require.main === module) {
    runSelfTest().catch(error => {
        console.error('QA-046D-23 실패:', error.message);
        process.exitCode = 1;
    });
}
module.exports = {
    moboValidateLeasedBatchBudget,
    moboRunLeasedSyntheticTick
};
