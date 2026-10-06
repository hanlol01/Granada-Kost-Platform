// Actual DB commands + actual generated temporary bytes. Never the application's storage root.
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const { mkdtemp, rm, writeFile, rename, lstat, unlink } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join, resolve, sep } = require('node:path');
const { LeaseArchiveFileInventoryService } = require('../../src/modules/lease/lease-archive-file-inventory.service.ts');
const { LeaseArchiveFilePurgeService } = require('../../src/modules/lease/lease-archive-file-purge.service.ts');
const { LocalFileStorage } = require('../../src/modules/file/storage/local-file-storage.ts');
const { FileRepository } = require('../../src/modules/file/file.repository.ts');
const { FileService } = require('../../src/modules/file/file.service.ts');
const { LeaseArchiveRestorationService } = require('../../src/modules/lease/lease-archive-restoration.service.ts');
const { LeaseRevisionContextService } = require('../../src/modules/lease/lease-revision-context.service.ts');
const { LeaseSponsorshipCorrectionService } = require('../../src/modules/lease/lease-sponsorship-correction.service.ts');
const { ContractScheduleIssuanceService } = require('../../src/modules/billing/services/contract-schedule-issuance.service.ts');
const { AuditRepository } = require('../../src/infrastructure/audit/audit.repository.ts');
const { BILLING_EVIDENCE_JSON_SQL } = require('../../src/modules/billing/helpers/billing-evidence-projection.helper.ts');
const { W06BillingService } = require('../../src/modules/billing/services/w06-billing.service.ts');
const { parseMyW06Billing } = require('../../../../apps/penghuni/src/lib/penghuni-w06-billing.ts');
const hash = value => createHash('sha256').update(value).digest('hex');

module.exports.runArchiveFilePurgeProof = async function(pool, transaction, archives) {
  assert.match((await pool.query('SELECT current_database() AS name')).rows[0].name,
    /^kostation_h08_revision_[a-f0-9]{12}_m1_qa$/);
  const archive = archives.find(item => item.lease.commercial_mode==='owner_sponsored' && !item.activationOnly);
  assert.ok(archive, 'Canonical, cancelled unoccupied sponsor fixture required');
  const { user, lease, archiveId } = archive;
  const repository = { client: pool, query: (sql, values) => pool.query(sql, values),
    transaction: operation => transaction(pool, operation) };
  const root = await mkdtemp(join(tmpdir(),'kostation-h08-purge-db-'));
  const temporaryRoot = resolve(tmpdir());
  assert.ok(resolve(root).startsWith(`${temporaryRoot}${sep}`));
  assert.match(root.split(sep).at(-1), /^kostation-h08-purge-db-/);
  const offline = `${root}-offline`;
  const local = new LocalFileStorage({ getOrThrow: key => { assert.equal(key,'upload.storagePath'); return root; } });
  const inventory = new LeaseArchiveFileInventoryService(repository);
  const generated = new Map();
  let uncertainId;
  let simulateOffline = true;
  const storage = { purgeVerified: async target => {
    assert.ok(generated.has(target.id), 'Only generated proof files may touch storage');
    assert.equal(target.propertyId, lease.property_id);
    if (simulateOffline && target.id===uncertainId) {
      assert.ok(offline.startsWith(`${temporaryRoot}${sep}`));
      await rename(root,offline);
      try { return await local.purgeVerified(target); }
      finally { await rename(offline,root); }
    }
    return local.purgeVerified(target);
  } };
  const service = new LeaseArchiveFilePurgeService(repository,inventory,storage,new AuditRepository(repository));
  const fileRepository = new FileRepository(repository);
  const fileService = new FileService(fileRepository,
    { assertCanReadProperty: async (_user, propertyId) => assert.equal(propertyId, lease.property_id) },
    { write: async () => { throw new Error('No denied download may be logged as successful'); } }, {}, {}, local);
  const restoration = new LeaseArchiveRestorationService(repository, new LeaseRevisionContextService(repository),
    new ContractScheduleIssuanceService(), new LeaseSponsorshipCorrectionService());
  async function file(metadata = {}) {
    const id = randomUUID(); const buffer = Buffer.from(`%PDF-1.4\nH08 generated temporary evidence ${id}\n%%EOF`);
    const path = await local.save(id,lease.property_id,'lease_revision_evidence',buffer,'pdf');
    await pool.query(`INSERT INTO files(id,property_id,uploader_user_id,original_filename,sanitized_filename,
      mime_type,file_extension,file_size_bytes,file_purpose,storage_driver,storage_path,checksum_sha256,metadata)
      VALUES($1,$2,$3,'proof.pdf','proof.pdf','application/pdf','pdf',$4,'lease_revision_evidence','local',$5,$6,$7::jsonb)`,
      [id,lease.property_id,user.id,buffer.length,path,hash(buffer),JSON.stringify(metadata)]);
    await pool.query('INSERT INTO lease_revision_file_bindings(file_id,property_id,lease_id) VALUES($1,$2,$3)', [id,lease.property_id,lease.id]);
    generated.set(id,{ buffer,path }); return id;
  }
  const dtoFor = async ids => ({ property_id: lease.property_id, reason: 'Disposable proof: remove only generated temporary evidence',
    selected_file_ids: ids, permanent_deletion_confirmed: true,
    review_fingerprint: (await inventory.inventory(user,archiveId,lease.property_id)).data.review_fingerprint });
  try {
    // Ordinary absence is an availability observation, never a purge tombstone.
    const ordinaryId = await file({ purpose_note: 'generated availability proof' });
    const ordinary = generated.get(ordinaryId);
    const ordinaryPath = resolve(root, ordinary.path);
    assert.ok(ordinaryPath.startsWith(`${resolve(root)}${sep}`));
    const readableFiles = new FileService(fileRepository,
      { assertCanReadProperty: async (_actor, propertyId) => assert.equal(propertyId, lease.property_id) },
      { write: async () => {} }, {}, {}, local);
    await rename(root, offline);
    try {
      await assert.rejects(readableFiles.readContent(user, ordinaryId, {}),
        error => error.getResponse?.().code === 'FILE_STORAGE_UNAVAILABLE');
    } finally { await rename(offline, root); }
    assert.equal((await fileRepository.findById(ordinaryId)).metadata.storage_content_unavailable, undefined);
    await unlink(ordinaryPath); // Only this freshly generated test file.
    await assert.rejects(readableFiles.readContent(user, ordinaryId, {}),
      error => error.getResponse?.().code === 'FILE_CONTENT_NOT_FOUND');
    const observed = await fileRepository.findById(ordinaryId);
    assert.equal(observed.metadata.storage_content_unavailable, true);
    assert.equal(observed.isDeleted, false);
    assert.equal(observed.archivePurgeCommandId, null);
    const unavailable = (await pool.query(`SELECT ${BILLING_EVIDENCE_JSON_SQL} AS evidence FROM files file WHERE file.id=$1`, [ordinaryId])).rows[0].evidence;
    assert.equal(unavailable.availability, 'unavailable');
    assert.equal(unavailable.content_path, null);
    assert.equal(unavailable.purged_at, null);
    await writeFile(ordinaryPath, ordinary.buffer);
    assert.deepEqual((await readableFiles.readContent(user, ordinaryId, {})).buffer, ordinary.buffer);
    assert.equal((await fileRepository.findById(ordinaryId)).metadata.storage_content_unavailable, undefined);
    const restored = (await pool.query(`SELECT ${BILLING_EVIDENCE_JSON_SQL} AS evidence FROM files file WHERE file.id=$1`, [ordinaryId])).rows[0].evidence;
    assert.equal(restored.availability, 'available');
    assert.ok(restored.content_path);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM lease_file_purge_items WHERE file_id=$1', [ordinaryId])).rows[0].n, 0);
    process.stdout.write('Actual storage and DB: offline reads remain uncertain, ordinary missing bytes hide broken links without tombstones, restored bytes clear availability\n');
    const selfArchive = archives.find(item => item.residentRead);
    assert.ok(selfArchive, 'Actual account-owned archived W06 claim required');
    const selfFileId = randomUUID();
    const selfBytes = Buffer.from('%PDF-1.4\nH08 generated resident historical evidence\n%%EOF');
    const selfPath = await local.save(selfFileId, selfArchive.lease.property_id, 'payment_proof', selfBytes, 'pdf');
    await pool.query(`INSERT INTO files(id,property_id,uploader_user_id,original_filename,sanitized_filename,
      mime_type,file_extension,file_size_bytes,file_purpose,storage_driver,storage_path,checksum_sha256)
      VALUES($1,$2,$3,'historical.pdf','historical.pdf','application/pdf','pdf',$4,'payment_proof','local',$5,$6)`,
      [selfFileId,selfArchive.lease.property_id,selfArchive.user.id,selfBytes.length,selfPath,hash(selfBytes)]);
    await pool.query('INSERT INTO payment_proof_files(payment_proof_id,file_id) VALUES($1,$2)', [selfArchive.residentRead.proofId,selfFileId]);
    const billing = new W06BillingService(repository, {}, new AuditRepository(repository), undefined, fileRepository, readableFiles);
    const selfUser = selfArchive.residentRead.user;
    const evidence = parseMyW06Billing(await billing.myHistoricalBilling(selfUser,selfArchive.lease.id))
      .proofs.find(item => item.id===selfArchive.residentRead.proofId).evidence.find(item => item.id===selfFileId);
    assert.equal(evidence.content_path, `/my/billing/${selfArchive.lease.id}/evidence/${selfFileId}/content`);
    const selfRead = await billing.myBillingEvidence(selfUser,selfArchive.lease.id,selfFileId,{});
    assert.deepEqual(selfRead.buffer,selfBytes, 'Admin-uploaded proof remains readable only through the actual lease relationship');
    assert.doesNotMatch(selfRead.filename, /[a-f0-9]{8}-[a-f0-9]{4}-/i);
    await assert.rejects(billing.myBillingEvidence({ ...selfUser,id:selfArchive.user.id },selfArchive.lease.id,selfFileId,{}), error => error.getStatus?.()===404);
    await assert.rejects(billing.myBillingEvidence(selfUser,lease.id,selfFileId,{}), error => error.getStatus?.()===404);
    for (const roles of [['admin'],['property_owner']])
      await assert.rejects(billing.myBillingEvidence({ ...selfUser,roles },selfArchive.lease.id,selfFileId,{}), error => error.getStatus?.()===403);
    process.stdout.write('Resident historical evidence: actual SQL, strict Penghuni parser, generated temporary bytes, safe filename, Admin-uploader relationship access and cross-account/lease/role denial pass\n');
    const successId = await file(); const changedId = await file(); uncertainId = await file();
    const protectedId = await file(); await file({ related_file_id: protectedId });
    const firstReview = (await inventory.inventory(user,archiveId,lease.property_id)).data;
    assert.equal(firstReview.coverage_verified,true,'All current file-reference columns must have live deletion guards');
    assert.equal(firstReview.items.find(item=>item.file_id===successId).selectable,true,
      `Exclusive generated evidence eligibility: ${firstReview.items.find(item=>item.file_id===successId).code}`);
    assert.equal(firstReview.items.find(item=>item.file_id===protectedId).selectable,false,'Shared generated evidence must stay protected');
    assert.equal(firstReview.items.find(item=>item.file_id===protectedId).code,'LEASE_FILE_PURGE_PROTECTED');
    assert.deepEqual(firstReview,(await inventory.inventory(user,archiveId,lease.property_id)).data,'Stable read-only fingerprint');
    await assert.rejects(service.purge(user,archiveId,await dtoFor([protectedId]),randomUUID()),
      error=>error.getResponse?.().code==='LEASE_FILE_PURGE_PROTECTED');
    assert.equal(await local.exists(generated.get(protectedId).path),true);
    const dto = await dtoFor([successId,changedId,uncertainId]);
    const staleRecord = await fileRepository.findById(changedId);
    const initialRestoration = (await restoration.preview(user,archiveId,lease.property_id)).data.decision;
    assert.equal(initialRestoration.allowed,true,`Canonical no-money archive restoration eligibility: ${initialRestoration.code}`);
    // Generated file only: stale bytes must not be silently removed.
    await writeFile(join(root,generated.get(changedId).path),Buffer.from('Changed proof content'));
    const key = randomUUID();
    const pair = await Promise.all([service.purge(user,archiveId,dto,key),service.purge(user,archiveId,dto,key)]);
    assert.equal(pair[0].data.command_id,pair[1].data.command_id);
    assert.deepEqual(pair.map(item=>item.idempotent).sort(),[false,true]);
    const result = pair[1].data;
    assert.equal(result.deleted_count,1); assert.equal(result.failed_count,1); assert.equal(result.retry_pending_count,1);
    assert.equal(result.freed_bytes,generated.get(successId).buffer.length);
    assert.equal(result.items.find(item=>item.file_id===changedId).result_code,'FILE_PURGE_CONTENT_CHANGED');
    assert.equal(result.items.find(item=>item.file_id===uncertainId).availability,'unknown');
    assert.equal(await local.exists(generated.get(successId).path),false);
    assert.equal(await local.exists(generated.get(changedId).path),true);
    assert.equal(await local.exists(generated.get(uncertainId).path),true);
    const pendingRestore = await restoration.preview(user,archiveId,lease.property_id);
    assert.equal(pendingRestore.data.decision.code,'LEASE_ARCHIVE_RESTORE_FILE_PURGE_UNRESOLVED');
    await assert.rejects(restoration.restore(user,archiveId,{ property_id:lease.property_id,
      reason:'Cannot restore an unresolved purge',restoration_confirmed:true,
      review_fingerprint:pendingRestore.data.review_fingerprint },randomUUID()),
      error=>error.getResponse?.().code==='LEASE_ARCHIVE_RESTORE_FILE_PURGE_UNRESOLVED');
    for (const request of [
      () => fileService.getMetadata(user,changedId,{}),
      () => fileService.readContent(user,changedId,{}),
      () => fileService.softDelete(user,changedId,{}),
      () => fileService.readStoredContent(staleRecord),
    ]) await assert.rejects(request(),error=>error.getResponse?.().code==='FILE_ARCHIVE_PURGE_UNAVAILABLE');
    await assert.rejects(service.purge(user,archiveId,{ ...dto,reason:'Changed intent' },key),error=>error.getResponse?.().code==='IDEMPOTENCY_KEY_REUSED');
    await assert.rejects(service.retry(user,archiveId,result.command_id,{ property_id: lease.property_id, selected_file_ids:[successId] }),
      error=>error.getResponse?.().code==='LEASE_FILE_PURGE_RETRY_SELECTION_INVALID');
    const attemptsBefore = (await pool.query('SELECT count(*)::int AS n FROM lease_file_purge_attempts WHERE file_id=$1',[successId])).rows[0].n;
    simulateOffline = false;
    await writeFile(join(root,generated.get(changedId).path),generated.get(changedId).buffer);
    const retry = await service.retry(user,archiveId,result.command_id,{ property_id: lease.property_id, selected_file_ids:[changedId,uncertainId] });
    assert.equal(retry.data.deleted_count,3); assert.equal(retry.data.retry_pending_count,0);
    assert.equal(retry.data.freed_bytes,[successId,changedId,uncertainId].reduce((sum,id)=>sum+generated.get(id).buffer.length,0));
    assert.equal((await restoration.preview(user,archiveId,lease.property_id)).data.decision.allowed,true,
      'Verified deleted files stay deleted but do not prevent restoration of textual no-money records');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM lease_file_purge_attempts WHERE file_id=$1',[successId])).rows[0].n,attemptsBefore);
    for (const id of [successId,changedId,uncertainId]) {
      const record = (await pool.query('SELECT is_deleted,archive_purge_command_id FROM files WHERE id=$1',[id])).rows[0];
      assert.equal(record.is_deleted,true); assert.equal(record.archive_purge_command_id,result.command_id);
      await assert.rejects(pool.query('UPDATE files SET is_deleted=false WHERE id=$1',[id]),error=>error.code==='23514');
    }
    await assert.rejects(pool.query('DELETE FROM lease_file_purge_commands WHERE id=$1',[result.command_id]),error=>error.code==='23514');
    await assert.rejects(pool.query('DELETE FROM lease_file_purge_attempts WHERE command_id=$1',[result.command_id]),error=>error.code==='23514');
    // A failure after unlink must preserve the committed unknown state, not the old result.
    const interruptedId = await file();
    await pool.query(`CREATE FUNCTION h08_purge_projection_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.file_id='${interruptedId}'::uuid AND NEW.status='deleted' THEN RAISE EXCEPTION 'H08_PURGE_PROJECTION_FAILURE'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER h08_purge_projection_failure BEFORE UPDATE ON lease_file_purge_items FOR EACH ROW EXECUTE FUNCTION h08_purge_projection_failure()`);
    const interrupted = await service.purge(user,archiveId,await dtoFor([interruptedId]),randomUUID());
    assert.equal(interrupted.data.deleted_count,0); assert.equal(interrupted.data.retry_pending_count,1); assert.equal(interrupted.data.freed_bytes,0);
    assert.equal(interrupted.data.items[0].availability,'unknown');
    assert.equal(await local.exists(generated.get(interruptedId).path),false);
    assert.equal((await pool.query('SELECT is_deleted FROM files WHERE id=$1',[interruptedId])).rows[0].is_deleted,false);
    await pool.query('DROP TRIGGER h08_purge_projection_failure ON lease_file_purge_items; DROP FUNCTION h08_purge_projection_failure()');
    const recovered = await service.retry(user,archiveId,interrupted.data.command_id,{ property_id:lease.property_id,selected_file_ids:[interruptedId] });
    assert.equal(recovered.data.deleted_count,1); assert.equal(recovered.data.freed_bytes,0,'Previously absent bytes never counted twice or invented');
    const history = (await service.list(user,archiveId,lease.property_id,1,0)).data;
    assert.equal(history.total,2); assert.equal(history.items.length,1); assert.equal(history.items[0].selected_count,1);
    assert.equal((await service.list(user,archiveId,lease.property_id,1,1)).data.items[0].command_id,result.command_id);
    assert.ok((await pool.query("SELECT count(*)::int AS n FROM audit_logs WHERE resource_id=$1 AND action='lease.archive.file_purge_requested'",[result.command_id])).rows[0].n===1);
    await assert.rejects(service.read({ ...user,roles:['property_owner'] },archiveId,result.command_id,lease.property_id),error=>error.getStatus?.()===403);
    const finalReview = (await inventory.inventory(user,archiveId,lease.property_id)).data;
    assert.equal(finalReview.items.find(item=>item.file_id===successId).selectable,false);
    // Metadata-only removal is not physical deletion. Preserve the old metadata
    // fact in the immutable snapshot; never make the hidden evidence readable.
    const legacyPresentId = await file(); const legacyAbsentId = await file();
    await pool.query('UPDATE files SET is_deleted=true,deleted_at=now(),deleted_by_user_id=$2 WHERE id=ANY($1::uuid[])',
      [[legacyPresentId,legacyAbsentId],user.id]);
    const priorMetadata = (await pool.query('SELECT id,deleted_at,deleted_by_user_id FROM files WHERE id=ANY($1::uuid[])',
      [[legacyPresentId,legacyAbsentId]])).rows;
    assert.equal(await local.exists(generated.get(legacyPresentId).path),true);
    const removed = await local.purgeVerified({ id:legacyAbsentId,propertyId:lease.property_id,purpose:'lease_revision_evidence',
      extension:'pdf',storagePath:generated.get(legacyAbsentId).path,sizeBytes:generated.get(legacyAbsentId).buffer.length,
      checksumSha256:hash(generated.get(legacyAbsentId).buffer) });
    assert.equal(removed.state,'deleted');
    const legacyInventory = (await inventory.inventory(user,archiveId,lease.property_id)).data;
    for (const id of [legacyPresentId,legacyAbsentId]) {
      const item=legacyInventory.items.find(value=>value.file_id===id);
      assert.equal(item.selectable,true); assert.equal(item.metadata_removed,true); assert.equal(item.onlyDigitalEvidence,false);
      await assert.rejects(fileService.readContent(user,id,{}),error=>error.getResponse?.().code==='FILE_NOT_FOUND');
    }
    const legacyPurged = await service.purge(user,archiveId,await dtoFor([legacyPresentId,legacyAbsentId]),randomUUID());
    assert.equal(legacyPurged.data.deleted_count,2);
    assert.equal(legacyPurged.data.freed_bytes,generated.get(legacyPresentId).buffer.length,'Already absent bytes are not counted');
    for (const id of [legacyPresentId,legacyAbsentId]) {
      assert.equal(await local.exists(generated.get(id).path),false);
      const snapshot=(await pool.query('SELECT file_snapshot FROM lease_file_purge_items WHERE file_id=$1',[id])).rows[0].file_snapshot;
      assert.equal(snapshot.metadataRemoved,true);
      assert.equal(snapshot.previousMetadataDeletedByUserId,user.id);
      assert.equal(snapshot.previousMetadataDeletedAt,new Date(priorMetadata.find(item=>item.id===id).deleted_at).toISOString());
      await assert.rejects(pool.query('UPDATE files SET is_deleted=false WHERE id=$1',[id]),error=>error.code==='23514');
    }
    process.stdout.write('Legacy metadata-hidden evidence: exclusive remaining bytes purged, absent bytes counted as zero, previous metadata retained, no evidence resurrection\n');
    // The attachment wins first: its file-row lock blocks the purge reservation.
    // After it commits, the old inventory is stale and no bytes may be removed.
    const racedId=await file(); const referenceHolderId=await file();
    const racedDto=await dtoFor([racedId]); const attachment=await pool.connect();
    let waiting;
    try {
      await attachment.query('BEGIN');
      const lockPid=(await attachment.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      await attachment.query('SELECT id FROM files WHERE id=$1 FOR UPDATE',[racedId]);
      waiting=service.purge(user,archiveId,racedDto,randomUUID()).then(data=>({ data }),error=>({ error }));
      let actuallyBlocked=false;
      for(let probe=0;probe<200;probe++) {
        const blocked=(await pool.query(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity
          WHERE datname=current_database() AND pid<>$1 AND $1=ANY(pg_blocking_pids(pid))) AS waiting`,[lockPid])).rows[0].waiting;
        if(blocked) { actuallyBlocked=true; break; }
        await new Promise(done=>setTimeout(done,25));
      }
      assert.equal(actuallyBlocked,true,'Prove an actual concurrent lock wait, not a timed scheduling assumption');
      await attachment.query("UPDATE files SET metadata=jsonb_build_object('related_file_id',$2::text) WHERE id=$1",[referenceHolderId,racedId]);
      await attachment.query('COMMIT');
      const outcome=await waiting;
      assert.equal(outcome.error?.getResponse?.().code,'LEASE_FILE_PURGE_REVIEW_STALE');
      assert.equal(await local.exists(generated.get(racedId).path),true);
      assert.equal((await pool.query('SELECT archive_purge_command_id FROM files WHERE id=$1',[racedId])).rows[0].archive_purge_command_id,null);
      const review=(await inventory.inventory(user,archiveId,lease.property_id)).data;
      assert.equal(review.items.find(item=>item.file_id===racedId).code,'LEASE_FILE_PURGE_PROTECTED');
    } finally {
      await attachment.query('ROLLBACK'); attachment.release();
      if(waiting) await waiting;
    }
    // The purge wins first: a stale repeatable-read snapshot cannot attach the
    // claimed file, even if its snapshot still says the file was available.
    const rrTargetId=await file(); const rrHolderId=await file(); const stale=await pool.connect();
    try {
      await stale.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
      assert.equal((await stale.query('SELECT is_deleted FROM files WHERE id=$1',[rrTargetId])).rows[0].is_deleted,false);
      const purged=await service.purge(user,archiveId,await dtoFor([rrTargetId]),randomUUID());
      assert.equal(purged.data.deleted_count,1);
      await assert.rejects(stale.query("UPDATE files SET metadata=jsonb_build_object('related_file_id',$2::text) WHERE id=$1",[rrHolderId,rrTargetId]),
        error=>error.code==='40001'||error.code==='23514'&&error.message.includes('LEASE_FILE_PURGE_ATTACHMENT_UNAVAILABLE'));
      assert.equal(await local.exists(generated.get(rrTargetId).path),false);
    } finally { await stale.query('ROLLBACK'); stale.release(); }
    await assert.rejects(pool.query("UPDATE files SET metadata=jsonb_build_object('related_file_id',$2::text) WHERE id=$1",[rrHolderId,rrTargetId]),
      error=>error.code==='23514'&&error.message.includes('LEASE_FILE_PURGE_ATTACHMENT_UNAVAILABLE'));
    // A future consumer without a registered guard must disable all selections.
    const futureId=await file();
    await pool.query('CREATE TABLE h08_future_file_consumer(id UUID PRIMARY KEY,file_id UUID REFERENCES files(id))');
    try {
      const unguarded=(await inventory.inventory(user,archiveId,lease.property_id)).data;
      assert.equal(unguarded.coverage_verified,false); assert.equal(unguarded.selectable_count,0);
      await assert.rejects(service.purge(user,archiveId,await dtoFor([futureId]),randomUUID()),
        error=>error.getResponse?.().code==='LEASE_FILE_PURGE_COVERAGE_UNVERIFIED');
      assert.equal(await local.exists(generated.get(futureId).path),true);
    } finally { await pool.query('DROP TABLE h08_future_file_consumer'); }
    assert.equal((await inventory.inventory(user,archiveId,lease.property_id)).data.coverage_verified,true);
    process.stdout.write('Actual attachment/purge concurrency: verified lock wait, stale review retains bytes, repeatable-read stale attachment denied, post-claim attachment denied, future unguarded consumer fails closed\n');
    process.stdout.write('Actual archive file inventory/purge: protected JSON links, stable review, concurrent replay, checksum failure, offline uncertainty, selected retry, immutable tombstones and post-unlink DB rollback pass; only generated temporary bytes touched\n');
  } finally {
    // Exact newly-created temp directories only; no project/user upload path is a cleanup target.
    for (const directory of [root,offline]) {
      assert.ok(resolve(directory).startsWith(`${temporaryRoot}${sep}`));
      assert.match(directory.split(sep).at(-1),/^kostation-h08-purge-db-/);
      try { assert.equal((await lstat(directory)).isSymbolicLink(),false); await rm(directory,{ recursive:true,force:true }); }
      catch(error) { if(error.code!=='ENOENT') throw error; }
    }
  }
};
