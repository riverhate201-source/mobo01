'use strict';
// QA-046D-42: emergency Netlify scheduled-function cost stop.
// Static check only: no deployed Netlify functions or cron, no remote traffic.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'..');
function runSelfTest(){
    const paths=execFileSync('git',['ls-files'],{
        cwd:ROOT,encoding:'utf8',timeout:5000
    }).split(/\r?\n/).filter(Boolean);
    const published=paths.filter(p=>p==='netlify.toml' ||
        p.startsWith('netlify/functions/'));
    assert.deepEqual(published,[]);
    assert.equal(fs.existsSync(path.join(ROOT,
        'netlify/functions/mobo-qa-readonly.mjs')),false);
    assert.equal(fs.existsSync(path.join(ROOT,'netlify.toml')),false);
    assert.equal(fs.existsSync(path.join(ROOT,
        'scripts/mobo-auto-galaxy-send-gate.cjs')),true);
    assert.equal(fs.existsSync(path.join(ROOT,
        'scripts/mobo-qa-attendance-one-shot.cjs')),true);
    console.log('PASS: no deployed Netlify scheduled functions');
    console.log('PASS: QA sender modules retained but not auto-startable');
    console.log('QA-046D-42 static PASS; confirm published Netlify deploy to stop billing');
}
if(require.main===module)runSelfTest();
module.exports={runSelfTest};
