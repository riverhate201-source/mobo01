'use strict';
// QA-046D-44: real frontend return behavior, clock boundaries and dedupe.
// Memory-only tests. No HTTP, Firebase SDK, FCM, Netlify or real user state.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const {moboKSTDate,moboWebtoonDate,moboClockDue}=
    require('./mobo-scheduler-clock.cjs');
const {claimDeliveryOnce,markDeliverySent,makeDeliveryKey}=
    require('./mobo-push-dedupe.cjs');
const ROOT=path.resolve(__dirname,'..'), DAY=86400000;
const app=fs.readFileSync(path.join(ROOT,'js/custom.js'),'utf8');
const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const kst=(date,time)=>Date.parse(date+'T'+time+':00+09:00');
assert.ok(html.includes('src="./js/custom.js"'));
const begin=app.indexOf("const MOBO_LAST_OPENED_KEY = 'moboReturnLastOpenedAt';");
const end=app.indexOf('// 30일 이상 복귀자: 과거 미정산 건너뛰기',begin);
assert.ok(begin>=0&&end>begin,'Real return UX segment missing');
const segment=app.slice(begin,end);
const names=['checkMoboReturnVisit','openMoboReturnModal',
    'handleMoboReturnStart','closeMoboReturnModal','dismissMoboReturnNotice'];
for(const name of names)assert.ok(segment.includes('function '+name+'('));
function runReturn({days,pending=null,previous=null}){
    const now=kst('2026-11-17','13:00');
    const values=new Map([['moboReturnLastOpenedAt',String(
        previous??(now-days*DAY))]]);
    if(pending!==null)values.set('moboReturnPendingDays',String(pending));
    const localStorage={
        getItem:key=>values.has(key)?values.get(key):null,
        setItem:(key,v)=>values.set(key,String(v)),
        removeItem:key=>values.delete(key)
    };
    const el=()=>({style:{display:'none'},textContent:'',
        classList:{toggle(){}},querySelector(){return null;}});
    const ids=['mobo-return-banner','mobo-return-banner-text',
        'mobo-return-modal','mobo-return-message','mobo-return-title',
        'mobo-return-skip-btn','mobo-return-dismiss-btn',
        'mobo-return-later-btn','deduction-modal'];
    const elements=new Map(ids.map(id=>[id,el()]));
    const description=el(),guide=el();
    elements.get('mobo-return-modal').querySelector=x=>
        x==='.mobo-return-description'?description:
        x==='.mobo-return-guide span'?guide:null;
    let deductions=0;
    const FakeDate=class extends Date{static now(){return now;}};
    const context={
        Date:FakeDate,localStorage,
        // Real frontend depends on these date helpers from custom.js.
        getWebtoonDate:()=>new FakeDate(now),
        formatDate:d=>d.toISOString().slice(0,10),
        document:{getElementById:id=>elements.get(id)||null},
        setTimeout:()=>0,checkAndShowAttendPopup:()=>{},alert:()=>{},
        askForDeduction:()=>{
            deductions++;
            elements.get('deduction-modal').style.display='flex';
        }
    };
    const funcs=vm.runInNewContext(
        segment+'\n;globalThis.__testApi={'+names.join(',')+'};globalThis.__testApi;',
        context,{timeout:250});
    return {funcs,localStorage,elements,values,
        get deductions(){return deductions;}};
}
async function verifyReturn(){
    for(const days of [1,13,14,19,20,29,30,31,60]){
        const x=runReturn({days});
        x.funcs.checkMoboReturnVisit();
        const get=id=>x.elements.get(id);
        assert.equal(get('mobo-return-banner').style.display,
            days>=14?'flex':'none','banner day '+days);
        assert.equal(get('mobo-return-modal').style.display,
            days>=20?'flex':'none','modal day '+days);
        assert.equal(x.localStorage.getItem('moboReturnPendingDays'),
            days>=14?String(days):null,'pending day '+days);
        if(days>=14&&days<20)x.funcs.openMoboReturnModal();
        if(days>=14){
            assert.equal(get('mobo-return-modal').style.display,'flex');
            assert.equal(get('mobo-return-skip-btn').style.display,
                days>=20?'block':'none');
            assert.equal(get('mobo-return-dismiss-btn').style.display,
                days>=30?'none':'block');
            assert.equal(get('mobo-return-later-btn').style.display,
                days>=30?'block':'none');
            assert.equal(get('mobo-return-skip-btn').textContent,
                days>=20&&days<30?'모두 건너뛰기':'건너뛰고 시작하기');
        }
        assert.equal(x.deductions,0);
        assert.ok([...x.values.keys()].every(k=>[
            'moboReturnLastOpenedAt','moboReturnPendingDays',
            'moboReturnLegacyCheckedV1','moboReturnFromOldSettlement'].includes(k)));
    }
    console.log('PASS: actual return UI day 1/13/14/19/20/29/30/31/60');

    // Older PWA installations have lastCheckDate but no last-opened timestamp.
    const legacy=runReturn({days:0});
    legacy.localStorage.removeItem('moboReturnLastOpenedAt');
    legacy.localStorage.setItem('lastCheckDate','2026-10-18');
    legacy.funcs.checkMoboReturnVisit();
    assert.equal(legacy.localStorage.getItem('moboReturnPendingDays'),'30');
    assert.equal(legacy.localStorage.getItem('moboReturnFromOldSettlement'),'1');
    assert.equal(legacy.elements.get('mobo-return-modal').style.display,'flex');
    assert.match(legacy.elements.get('mobo-return-message').textContent,
        /마지막 정산 기준일로부터 30일/);
    legacy.funcs.dismissMoboReturnNotice();
    legacy.funcs.checkMoboReturnVisit();
    assert.equal(legacy.localStorage.getItem('moboReturnPendingDays'),null);
    assert.equal(legacy.deductions,0);
    console.log('PASS: legacy 30-day settlement return once, no repeat');

    for(const days of [14,19,20,29]){
        const x=runReturn({days});
        x.funcs.checkMoboReturnVisit();
        x.funcs.handleMoboReturnStart();
        assert.equal(x.deductions,days>=20?1:0);
        assert.equal(x.localStorage.getItem('moboReturnPendingDays'),null);
        assert.equal(x.elements.get('mobo-return-banner').style.display,'none');
    }
    const later=runReturn({days:30});
    later.funcs.checkMoboReturnVisit();
    later.funcs.closeMoboReturnModal();
    assert.equal(later.elements.get('mobo-return-modal').style.display,'none');
    assert.equal(later.localStorage.getItem('moboReturnPendingDays'),'30');
    later.funcs.checkMoboReturnVisit();
    assert.equal(later.elements.get('mobo-return-modal').style.display,'flex');
    assert.equal(later.deductions,0);
    const persisted=runReturn({days:1,pending:30});
    persisted.funcs.checkMoboReturnVisit();
    assert.equal(persisted.elements.get('mobo-return-modal').style.display,'flex');
    const future=runReturn({days:0,previous:kst('2026-11-18','13:00')});
    future.funcs.checkMoboReturnVisit();
    assert.equal(future.elements.get('mobo-return-banner').style.display,'none');
    console.log('PASS: return start, postpone/reopen, pending after refresh');
}
function verifyTime(){
    for(const [date,next] of [
        ['2026-11-30','2026-12-01'],['2026-12-31','2027-01-01'],
        ['2028-02-29','2028-03-01']]){
        assert.equal(moboWebtoonDate(kst(date,'21:59')),date);
        assert.equal(moboWebtoonDate(kst(date,'22:00')),next);
        assert.equal(moboKSTDate(kst(date,'23:59')),date);
        assert.equal(moboKSTDate(kst(next,'00:00')),next);
    }
    for(const [clock,at,expected] of [
        ['22:00','21:59',false],['22:00','22:00',true],
        ['22:00','22:19',true],['22:00','22:20',false],
        ['22:33','22:32',false],['22:33','22:33',true],
        ['22:33','22:52',true],['22:33','22:53',false],
        ['23:55','23:54',false],['23:55','23:55',true],
        ['23:55','23:59',true]]){
        assert.equal(moboClockDue(kst('2026-11-17',at),clock),
            expected,clock+' / '+at);
    }
    assert.equal(moboClockDue(kst('2026-11-18','00:00'),'23:55'),false);
    console.log('PASS: reset 22:00, custom 22:33, midnight/month/year/leap');
}
async function verifyDedupe(){
    const docs=new Map(),uid='OfflineQaGalaxyOnlyUid_1234';
    const db={collection(name){
        assert.equal(name,'pushDeliveryClaims');
        return {doc(id){return {
            async create(value){
                if(docs.has(id)){const e=Error('exists');e.code=6;throw e;}
                docs.set(id,{...value});
            },
            async update(value){
                if(!docs.has(id))throw Error('MISSING_CLAIM');
                docs.set(id,{...docs.get(id),...value});
            }
        };}};
    }};
    const date='2026-11-17';
    const batch=await Promise.all(Array.from({length:12},()=>
        claimDeliveryOnce(db,uid,date,'attendance')));
    assert.equal(batch.filter(Boolean).length,1);
    await markDeliverySent(db,uid,date,'attendance');
    assert.equal(await claimDeliveryOnce(db,uid,date,'attendance'),false);
    assert.equal(await claimDeliveryOnce(db,uid,'2026-11-18','attendance'),true);
    assert.equal(await claimDeliveryOnce(db,uid,date,'serial'),true);
    assert.notEqual(makeDeliveryKey(uid,date,'attendance'),
        makeDeliveryKey(uid,date,'serial'));
    assert.equal(docs.size,3);
    console.log('PASS: 12 concurrent claims -> 1, different day/kind allowed');
}
function verifyNoCron(){
    const files=execFileSync('git',['ls-files'],{
        cwd:ROOT,encoding:'utf8',timeout:5000
    }).split(/\r?\n/).filter(Boolean);
    assert.equal(files.some(f=>f.startsWith('netlify/functions/')||
        f==='netlify.toml'),false);
    assert.equal(fs.existsSync(path.join(ROOT,
        'netlify/functions/mobo-qa-readonly.mjs')),false);
    console.log('PASS: no Netlify scheduled function or cron restored');
}
async function main(){
    verifyTime();
    await verifyReturn();
    await verifyDedupe();
    verifyNoCron();
    console.log('QA-046D-44 OFFLINE PASS; no FCM, Firebase or Netlify');
}
main().catch(e=>{console.error('QA-046D-44 failed:',e.message);
    process.exitCode=1;});
