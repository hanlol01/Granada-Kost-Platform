// Opt-in browser gate for the real applications, never a fixture HTTP bridge.
// The caller owns clone creation, migration proof, source fingerprints and cleanup.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { randomBytes } = require('node:crypto');
const { mkdtemp, rm, access } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { resolve, join, sep } = require('node:path');
const { createServer } = require('node:net');
const argon2 = require('argon2');

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

module.exports.runBrowserRuntime = async function(pool, targetUrl, archives, { httpOnly = false } = {}) {
  assert.equal(process.env.KOSTATION_REVISION_DISPOSABLE, '1');
  assert.match((await pool.query('SELECT current_database() AS name')).rows[0].name, /^kostation_h08_revision_[a-f0-9]{12}_m1_qa$/);
  assert.match(decodeURIComponent(new URL(targetUrl).pathname.slice(1)), /^kostation_h08_revision_[a-f0-9]{12}_m1_qa$/);
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(targetUrl).hostname));
  const selfArchive = archives.find(item => item.residentRead);
  assert.ok(selfArchive);
  const propertyId = selfArchive.lease.property_id;
  const adminId = (await pool.query(`SELECT account.id FROM users account
    JOIN user_property_roles membership ON membership.user_id=account.id AND membership.revoked_at IS NULL
    JOIN roles role ON role.id=membership.role_id WHERE role.code='admin' AND membership.property_id=$1
    ORDER BY account.created_at LIMIT 1`, [propertyId])).rows[0]?.id;
  assert.ok(adminId, 'Existing clone Admin membership required; never bypass real IAM');
  const ownerId = (await pool.query(`SELECT profile.user_id FROM property_owner_profiles profile
    JOIN users account ON account.id=profile.user_id AND account.user_status='active'
    JOIN user_property_roles membership ON membership.user_id=account.id AND membership.property_id=profile.property_id AND membership.revoked_at IS NULL
    JOIN roles role ON role.id=membership.role_id AND role.code='property_owner'
    WHERE profile.property_id=$1 AND profile.profile_status='active' ORDER BY profile.id LIMIT 1`, [propertyId])).rows[0]?.user_id;
  assert.ok(ownerId, 'Existing Owner membership required; do not manufacture access for UI tests');
  const password = 'H08-QA-local-only-2026!';
  const passwordHash = await argon2.hash(password);
  for (const [id,email] of [[adminId,'h08-qa-admin@example.invalid'],[ownerId,'h08-qa-owner@example.invalid'],[selfArchive.residentRead.user.id,'h08-qa-resident@example.invalid']])
    await pool.query("UPDATE users SET email=$2,password_hash=$3,user_status='active',password_changed_at=now() WHERE id=$1", [id,email,passwordHash]);

  const [apiPort,adminPort,residentPort] = await Promise.all([freePort(),freePort(),freePort()]);
  const api = `http://127.0.0.1:${apiPort}/api/v1`;
  const root = await mkdtemp(join(tmpdir(),'kostation-h08-runtime-'));
  assert.ok(resolve(root).startsWith(`${resolve(tmpdir())}${sep}`));
  const finishFile=join(root,'finish');
  const keyPrefix = `h08-qa-${randomBytes(8).toString('hex')}:`;
  const redis = process.env.REDIS_URL ? new URL(process.env.REDIS_URL) : null;
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(redis?.hostname ?? process.env.REDIS_HOST ?? 'localhost'), 'Loopback Redis only');
  const env = { ...process.env, NODE_ENV:'development', DATABASE_URL:targetUrl, HOST:'127.0.0.1', PORT:String(apiPort),
    JWT_ACCESS_SECRET:randomBytes(48).toString('hex'), JWT_ACCESS_TTL_SECONDS:'3600', REDIS_KEY_PREFIX:keyPrefix,
    LOG_LEVEL:'warn', UPLOAD_STORAGE_PATH:root, UPLOAD_MAX_FILE_SIZE_MB:'5',
    CORS_ALLOWED_ORIGINS:`http://127.0.0.1:${adminPort},http://127.0.0.1:${residentPort}`,
    BREVO_API_KEY:'',FONNTE_API_KEY:'',FONNTE_ENABLED:'false',PUSH_NOTIFICATION_ENABLED:'false',
    PAYMENT_GATEWAY_ENABLED:'false',PAYMENT_GATEWAY_PROVIDER:'none',MIDTRANS_SERVER_KEY:'',MIDTRANS_CLIENT_KEY:'',
    SMART_LOCK_PROVIDER:'simulated',SMART_LOCK_LIVE_ENABLED:'false',
    LEASE_BILLING_SCHEDULER_PROCESS_ENABLED:'false',LEASE_TRANSFER_SCHEDULER_PROCESS_ENABLED:'false',
    LEASE_RENEWAL_SCHEDULER_PROCESS_ENABLED:'false',LEASE_ACTIVATION_SCHEDULER_PROCESS_ENABLED:'false',LEASE_SETTLEMENT_SCHEDULER_PROCESS_ENABLED:'false',
    ADMIN_PAYMENT_AUTO_VERIFY_ENABLED:'false', VITE_API_BASE_URL:api, VITE_USE_MOCKS:'false' };
  const children = [];
  const apiDir = resolve(__dirname,'../..');
  const repoRoot = resolve(apiDir,'../..');
  function start(args,cwd) {
    const child = spawn(process.execPath,args,{cwd,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let diagnostic = '';
    for (const stream of [child.stdout,child.stderr]) stream.on('data',chunk => { diagnostic=(diagnostic+chunk).slice(-12000); });
    children.push(child);
    return { child, diagnostic:()=>diagnostic };
  }
  async function ready(url,process) {
    for (let attempt=0;attempt<100;attempt++) {
      if (process.child.exitCode !== null) throw new Error(`Isolated server exited before readiness (${process.child.exitCode}); inspect its local startup configuration, not the main service`);
      try { if ((await fetch(url,{signal:AbortSignal.timeout(1000)})).ok) return; } catch {}
      await new Promise(resolve=>setTimeout(resolve,500));
    }
    // Deliberately do not dump environment/configuration values into tool output.
    throw new Error('Isolated application readiness timed out');
  }
  try {
    let apiProcess=start(['dist/main.js'],apiDir);
    await ready(`${api}/health`,apiProcess);
    const login = await fetch(`${api}/auth/login`,{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({identifier:'h08-qa-admin@example.invalid',password})});
    assert.equal(login.status,201,'Actual Admin password/JWT login must succeed before UI testing');
    const adminToken=(await login.json()).access_token;
    assert.ok(adminToken,'Actual login response required; no forged browser session');
    const headers={Authorization:`Bearer ${adminToken}`};
    const archiveResponse=await fetch(`${api}/lease-archives?property_id=${propertyId}`,{headers});
    assert.equal(archiveResponse.status,200,'Actual guarded archive route must be accessible');
    const restored=archives.find(item=>item.review.financial_resolution_state==='not_required');
    assert.ok(restored, 'Restored clone-only lease required for real HTTP correction proof');
    const { createLeaseRevisionClient }=require('../../../../apps/admin/src/lib/lease-revision-contract.ts');
    const correctionKey=randomBytes(16).toString('hex');
    const statuses=[];
    const client=createLeaseRevisionClient({post:async(path,body,options)=>{
      const response=await fetch(`${api}${path}`,{method:'POST',headers:{...headers,'content-type':'application/json','idempotency-key':options.idempotencyKey},body:JSON.stringify(body)});
      statuses.push(response.status);assert.ok(response.ok, 'Real guarded correction HTTP request must succeed');
      return response.json();
    }});
    const input={termMonths:11,pricingSource:'standard',reason:'Disposable real HTTP proof: correct original duration'};
    const first=await client.commitDataCorrection(restored.lease.id,input,correctionKey,propertyId);
    const replay=await client.commitDataCorrection(restored.lease.id,input,correctionKey,propertyId);
    assert.deepEqual(statuses,[201,200]);assert.equal(first.correction.id,replay.correction.id);
    assert.equal(first.correction.corrected.termMonths,11);
    process.stdout.write('Real guarded correction HTTP first save and same-intent replay parsed by Admin client: pass\n');
    const ownerLogin=await fetch(`${api}/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({identifier:'h08-qa-owner@example.invalid',password})});
    assert.equal(ownerLogin.status,201);
    const ownerToken=(await ownerLogin.json()).access_token;
    const ownerHeaders={Authorization:`Bearer ${ownerToken}`};
    assert.equal((await fetch(`${api}/my/property-owner/collection-progress`,{headers:ownerHeaders})).status,200);
    const currentPeriod=(await pool.query("SELECT to_char(now() AT TIME ZONE 'Asia/Jakarta','YYYY-MM') AS period")).rows[0].period;
    assert.equal((await fetch(`${api}/my/property-owner/finance?period=${currentPeriod}`,{headers:ownerHeaders})).status,200,
      'Actual Owner finance must not fail on historical invoice/current-room differences');
    assert.equal((await fetch(`${api}/lease-archives?property_id=${propertyId}`,{headers:ownerHeaders})).status,403);
    process.stdout.write('Actual Owner JWT can read its progress but cannot access Admin archives: pass\n');
    const { responseDownloadFilename }=require('../../../../packages/api-client/src/document-download.ts');
    for (const route of ['reports/export','realizations/progress/export']) {
      for (const format of ['pdf','xlsx']) {
        const url=`${api}/my/property-owner/${route}?period=${currentPeriod}&format=${format}`;
        assert.equal((await fetch(url,{signal:AbortSignal.timeout(30000)})).status,401,
          'Private Owner documents must reject an unauthenticated request');
        const response=await fetch(url,{headers:ownerHeaders,signal:AbortSignal.timeout(30000)});
        assert.equal(response.status,200,`Real guarded ${route} ${format} download must succeed`);
        assert.match(response.headers.get('cache-control') ?? '',/private.*no-store/);
        assert.ok(response.headers.get('content-disposition')?.includes('filename'),
          'Authenticated export must provide its safe document name');
        const filename=responseDownloadFilename(response,`Dokumen.${format}`);
        assert.ok(filename.includes(currentPeriod),'Download name must contain the selected month');
        assert.ok(filename.endsWith(`.${format}`));
        assert.doesNotMatch(filename,/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        const content=Buffer.from(await response.arrayBuffer());
        assert.ok(content.length>100);
        assert.equal(content.subarray(0,format==='pdf'?4:2).toString(),format==='pdf'?'%PDF':'PK');
        assert.equal(response.headers.get('content-type'),format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      }
    }
    process.stdout.write('Actual Owner JWT PDF/XLSX HTTP exports: report and realization progress, private headers, safe period filenames and valid binary bytes pass\n');
    if (httpOnly) return;
    const vite=join(repoRoot,'node_modules/vite/bin/vite.js');
    const adminProcess=start([vite,'--host','127.0.0.1','--port',String(adminPort),'--strictPort'],join(repoRoot,'apps/admin'));
    const residentProcess=start([vite,'--host','127.0.0.1','--port',String(residentPort),'--strictPort'],join(repoRoot,'apps/penghuni'));
    await Promise.all([ready(`http://127.0.0.1:${adminPort}/login`,adminProcess),ready(`http://127.0.0.1:${residentPort}/login`,residentProcess)]);
    process.stdout.write(`H08 isolated real API and UI ready; main ports untouched\nAdmin http://127.0.0.1:${adminPort}/login\nResident http://127.0.0.1:${residentPort}/login\nClone-only logins h08-qa-admin@example.invalid / h08-qa-owner@example.invalid / h08-qa-resident@example.invalid; password ${password}\nProperty ${propertyId}\nArchive ${selfArchive.archiveId}\nCorrection lease ${restored?.lease.id ?? selfArchive.lease.id}\nType pause-api / resume-api to test a failed background refresh of only this isolated API. Type finish + Enter or create the exact generated control file ${finishFile} to close test processes and remove the guarded clone; automatic timeout 20 minutes\n`);
    await new Promise(resolve => {
      const timer=setTimeout(done,20*60*1000);
      // Background compressed shells cannot forward stdin. This signal belongs
      // only to this generated runtime root, never the application's storage.
      const fileTimer=setInterval(()=>{void access(finishFile).then(done,()=>{});},500);
      let commands=Promise.resolve();
      function data(chunk) {
        for (const command of String(chunk).trim().split(/\r?\n/)) {
          commands=commands.then(async()=>{
            if (command==='finish') return done();
            if (command==='pause-api' && apiProcess.child.exitCode===null && apiProcess.child.signalCode===null) {
              const exited=once(apiProcess.child,'exit');apiProcess.child.kill();await exited;
              process.stdout.write('Only the generated isolated API paused; UI and main services unchanged\n');
            } else if (command==='resume-api' && (apiProcess.child.exitCode!==null || apiProcess.child.signalCode!==null)) {
              apiProcess=start(['dist/main.js'],apiDir);await ready(`${api}/health`,apiProcess);
              process.stdout.write('Generated isolated API resumed\n');
            }
          }).catch(()=>{process.stdout.write('Isolated API control failed; no main service was targeted\n');done();});
        }
      }
      function done() { clearTimeout(timer);clearInterval(fileTimer);process.stdin.off('data',data);process.stdin.pause();resolve(); }
      process.stdin.on('data',data);process.stdin.resume();
    });
  } finally {
    for (const child of children.reverse()) {
      if (child.exitCode !== null || child.signalCode !== null) continue;
      const exited=once(child,'exit');child.kill();
      await Promise.race([exited,new Promise(resolve=>setTimeout(resolve,5000))]);
    }
    // Delete only keys created in this generated namespace; never FLUSH a Redis DB.
    const Redis=require('ioredis');
    const cache=redis ? new Redis(redis.href,{lazyConnect:true}) : new Redis({host:env.REDIS_HOST ?? 'localhost',port:Number(env.REDIS_PORT ?? 6379),password:env.REDIS_PASSWORD || undefined,db:Number(env.REDIS_DB ?? 0),lazyConnect:true});
    try {
      let cursor='0';
      do { const [next,keys]=await cache.scan(cursor,'MATCH',`${keyPrefix}*`,'COUNT',100);cursor=next;
        assert.ok(keys.every(key=>key.startsWith(keyPrefix)));if(keys.length)await cache.del(...keys);
      } while(cursor!=='0');
    } finally { cache.disconnect(); }
    assert.ok(resolve(root).startsWith(`${resolve(tmpdir())}${sep}`));
    assert.match(root.split(sep).at(-1),/^kostation-h08-runtime-/);
    await rm(root,{recursive:true,force:true});
    process.stdout.write('Isolated API/UI processes, generated namespace and temporary test storage cleaned\n');
  }
};
