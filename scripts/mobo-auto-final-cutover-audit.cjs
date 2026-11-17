'use strict';
// QA-046D-39: static ship/no-ship audit, intentionally no Netlify/Firebase API.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const src=p=>fs.readFileSync(path.join(root,p),'utf8');

function audit(repoFiles,entry,workflow,send,preflight){
    const requiredFunction='netlify/functions/mobo-qa-readonly.mjs';
    const netlify=repoFiles.filter(f=>
        f==='netlify.toml' || f.startsWith('netlify/functions/'));
    const reasons=[];
    const requireSafe=(pass,why)=>{if(!pass)reasons.push(why);};
    requireSafe(netlify.length===1 && netlify[0]===requiredFunction,
        'UNREVIEWED_NETLIFY_FUNCTION_OR_CONFIG');
    requireSafe(entry.includes("schedule: '*/5 * * * *'"),
        'MISSING_FIVE_MINUTE_SCHEDULE');
    requireSafe(entry.includes('moboAssertQANetlifyReadOnlyConfig(env)'),
        'MISSING_NETLIFY_QA_IDENTITY_GUARD');
    requireSafe(entry.includes(
        "env.MOBO_QA_SENDER_PREFLIGHT === 'AUTH_READ_ONLY'"),
        'MISSING_EXPLICIT_AUTH_PROBE_OPT_IN');
    requireSafe(entry.includes('moboCreateUndeployedQAScheduleHandler({'),
        'MISSING_READ_ONLY_PREVIEW');
    for(const forbidden of [
        'getMessaging(', '.send(', '.sendEach(', '.create(', '.set(',
        '.update(', '.delete(', 'moboQAGalaxySendOnce(',
        'mobo-auto-galaxy-send-gate'
    ])requireSafe(!entry.includes(forbidden),
        'MUTATING_CODE_OR_FCM_IN_SCHEDULED_ENTRYPOINT');
    requireSafe(workflow.includes("if: github.ref == 'refs/heads/staging'"),
        'STAGING_BRANCH_GUARD_MISSING');
    requireSafe(workflow.includes("permissions:\n  contents: read"),
        'WORKFLOW_TOKEN_NOT_READ_ONLY');
    requireSafe(!/^\s*MOBO_AUTO_MODE:\s*LIVE\s*$/m.test(workflow) &&
        !/^\s*MOBO_AUTO_LIVE_CONFIRM:\s*YES\s*$/m.test(workflow),
        'GITHUB_LIVE_PUSH_ENABLED');
    requireSafe(send.includes("MOBO_QA_SEND_ACTIVE !== 'YES'") &&
        send.includes("MOBO_QA_SEND_APPROVAL !== 'APPROVED_GALAXY_ONLY'") &&
        send.includes("MOBO_QA_SEND_MAX !== '1'") &&
        send.includes("env.MOBO_QA_TEST_TARGET_UID !== env.MOBO_AUTO_TEST_UID"),
        'SINGLE_GALAXY_APPROVAL_GATE_MISSING');
    requireSafe(send.includes(
        "status:'WINDOW_EXPIRED_BEFORE_CLAIM',sent:0"),
        'NO_FINAL_SEND_WINDOW_RECHECK');
    requireSafe(send.includes('claimDeliveryOnce(db,uid,date,kind)') &&
        send.includes('moboCompleteClaimedSend({'),
        'PERSISTENT_DEDUPLICATION_MISSING');
    requireSafe(send.includes("const QA_ORIGIN = 'https://mobo-push-qa.netlify.app'") &&
        !send.includes('staging--mobo-demo') &&
        !send.includes('mobo-demo.netlify.app'),
        'NON_QA_NOTIFICATION_DESTINATION');
    requireSafe(preflight.includes('MOBO_QA_SENDER_PREFLIGHT') &&
        preflight.includes("fcm:'NOT_TESTED'") &&
        preflight.includes("firestoreWrite:'NOT_TESTED'"),
        'SENDER_PROBE_CLAIMS_EXCESS_VALIDATION');
    return Object.freeze({
        localChecksPass:reasons.length===0,
        reasons,
        remoteNetlifyState:'NOT_ACCESSIBLE_FROM_GITHUB',
        senderFCMPrivilege:'NOT_TESTED',
        senderFirestoreWritePrivilege:'NOT_TESTED',
        actualAutomatedDelivery:'NOT_ENABLED',
        release:'BLOCKED'
    });
}
function runSelfTest(){
    const files=execFileSync('git',['ls-files'],{
        cwd:root,encoding:'utf8',timeout:5000
    }).split(/\r?\n/).filter(Boolean);
    const entry=src('netlify/functions/mobo-qa-readonly.mjs');
    const workflow=src('.github/workflows/mobo-auto-pc-test.yml');
    const sender=src('scripts/mobo-auto-galaxy-send-gate.cjs');
    const preflight=src('scripts/mobo-auto-sender-credential-preflight.cjs');
    const inputs=[files,entry,workflow,sender,preflight];
    const report=audit(...inputs);
    assert.equal(report.localChecksPass,true,JSON.stringify(report.reasons));
    assert.equal(report.release,'BLOCKED');
    assert.equal(report.actualAutomatedDelivery,'NOT_ENABLED');
    console.log('PASS: staging only, exactly one read-only Netlify function');
    console.log('PASS: sender disabled without explicit one-Galaxy approval');
    console.log('PASS: current time rechecked before claim; QA-only links');
    console.log('PASS: sender IAM/Firebase write/FCM privileges NOT overstated');
    const dangerous=[
        [[...files,'netlify/functions/mobo-live.mjs'],entry,workflow,sender,preflight],
        [files,entry+"\ngetMessaging().send(data)",workflow,sender,preflight],
        [files,entry,workflow.replace("contents: read","contents: write"),sender,preflight],
        [files,entry,workflow,sender.replace(
            "MOBO_QA_SEND_MAX !== '1'","MOBO_QA_SEND_MAX !== '100'"),preflight]
    ];
    for(const altered of dangerous){
        const unsafe=audit(...altered);
        assert.equal(unsafe.localChecksPass,false,'unsafe change not detected');
        assert.equal(unsafe.release,'BLOCKED');
    }
    console.log('PASS: accidental live function/FCM/permission escalation rejected');
    console.log('QA-046D-39 static PASS, release still BLOCKED');
}
if(require.main===module) runSelfTest();
module.exports={audit};
