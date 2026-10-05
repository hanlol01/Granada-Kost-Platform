require('./register-typescript.cjs');
const assert=require('node:assert/strict');
const test=require('node:test');
const {ReportService}=require('../../src/modules/report/report.service.ts');
const actor={id:'admin',roles:['admin'],permissions:['report.read'],propertyIds:['property']};
const input={property_id:'property',date_from:'2026-10-01',date_to:'2026-10-31',limit:20,offset:0};
function fixture(){
  const calls=[];
  const service=new ReportService({client:{query:async(sql,values)=>{
    calls.push({sql,values});
    return {rows:sql.includes(' LIMIT ')?[]:[{total_contracts:0}]};
  }}},{get:async(user,propertyId)=>{assert.equal(user,actor);assert.equal(propertyId,'property');return {name:'Property'};}},{});
  return {service,calls};
}
test('default lease report excludes cancelled archives from both rows and valuation',async()=>{
  const f=fixture();
  await f.service.preview(actor,'leases',input);
  assert.equal(f.calls.length,2);
  for(const call of f.calls) assert.match(call.sql,/l\.lease_status\s*<>\s*'cancelled'/);
});
test('explicit cancelled status still provides an auditable historical lease report',async()=>{
  const f=fixture();
  await f.service.preview(actor,'leases',{...input,status:'cancelled'});
  for(const call of f.calls){
    assert.doesNotMatch(call.sql,/l\.lease_status\s*<>\s*'cancelled'/);
    assert.ok(call.values.includes('cancelled'));
  }
});
test('a lease archive never removes recorded cash from the payment report',async()=>{
  const f=fixture();
  await f.service.preview(actor,'payments',input);
  for(const call of f.calls) assert.doesNotMatch(call.sql,/lease_status\s*<>\s*'cancelled'/);
});
