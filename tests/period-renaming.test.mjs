import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePeriodRenaming,renamePeriods,requireCompletePeriodRenaming} from '../scripts/period-renaming.mjs';

test('Period replacements preserve uncertainty, untouched fields, and imported values',()=>{
  const mapping=parsePeriodRenaming('Old,New\r\nC-Maku,Maku (1847)\r\nG-‘Akka,Akka (1868-1892)\r\n');
  const rows=[{PIN:'BB1',Period:'C-Maku?',Notes:'C-Maku'}, {PIN:'BH1',Period:'G-‘Akka'}, {PIN:'BH2',Period:"G-'Akka"}, {PIN:'BB2',Period:''}];
  const result=renamePeriods(rows,mapping);
  assert.equal(result.rows[0].Period,'Maku (1847)?');
  assert.equal(result.rows[0].Notes,'C-Maku');
  assert.equal(rows[0].Period,'C-Maku?');
  assert.equal(result.rows[1].Period,'Akka (1868-1892)');
  assert.deepEqual(result.originalValues.get('BB1'),{Period:'C-Maku?'});
  assert.equal(result.report.changed,2);
  assert.deepEqual(result.report.unmapped,{"G-'Akka":1});
  assert.equal(result.rows[3].Period,'');
  assert.throws(()=>requireCompletePeriodRenaming(result.report),/still unchanged/);
  assert.doesNotThrow(()=>requireCompletePeriodRenaming({unmapped:{}}));
});

test('Period mapping is literal and simultaneous, and rejects ambiguous mapping files',()=>{
  const mapping=parsePeriodRenaming('Old,New\nA.,B\nB,C\n');
  assert.equal(mapping.rename('A. B Ax'),'B C Ax');
  assert.throws(()=>parsePeriodRenaming('Old,New\nA,B\nA,C'),/duplicate/);
  assert.throws(()=>parsePeriodRenaming('Old,New\nA,'),/Empty/);
  assert.throws(()=>parsePeriodRenaming('Wrong,New\nA,B'),/columns/);
});

test('numeric suffixes are removed before mapping while raw periods stay intact',()=>{
  const mapping=parsePeriodRenaming('Old,New\nAkka,Akka renamed\nBaghdad,Baghdad renamed\nEdirne,Edirne renamed');
  const rows=['Akka2','Baghdad1','Edirne4','Akka12','Unknown7'].map((Period,i)=>({PIN:String(i),Period}));
  const result=renamePeriods(rows,mapping);
  assert.deepEqual(result.rows.map(r=>r.Period),['Akka renamed','Baghdad renamed','Edirne renamed','Akka renamed','Unknown']);
  for(const row of rows)assert.equal(result.originalValues.get(row.PIN).Period,row.Period);
  assert.deepEqual(result.report.unmapped,{Unknown7:1});
  assert.throws(()=>requireCompletePeriodRenaming(result.report),/Unknown7/);
});
