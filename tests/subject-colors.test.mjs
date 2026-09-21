import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseCsv} from '../src/text.mjs';
import {subjectColorStyle} from '../src/subject-colors.mjs';

const css=readFileSync(new URL('../src/theme.css',import.meta.url),'utf8');
const blocks=[...css.matchAll(/:root(?:\[data-theme=dark\])?\{--subject-[^}]+\}/g)].map(m=>Object.fromEntries([...m[0].matchAll(/--subject-([a-f\d]{6}):(#(?:[a-f\d]{6}))/gi)].map(m=>[m[1],m[2]])));
function luminance(hex){return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
test('every source subject color has a day and night shade with readable contrast',()=>{
  const subjects=parseCsv(readFileSync(new URL('../14-colors_and_hyperlinks.csv',import.meta.url),'utf8'));
  const colors=new Set(subjects.map(s=>s.color.toLowerCase().slice(1)));
  assert.equal(blocks.length,2);
  for(const [index,background] of ['#FFFEFA','#1D2922'].entries()){
    assert.deepEqual(new Set(Object.keys(blocks[index])),colors);
    for(const color of colors)assert.ok(contrast(blocks[index][color],background)>=4.5,`${color} on ${background}`);
  }
});
test('source color identities resolve safely without mutating metadata',()=>{
  const subject={color:'#FFC000'};
  assert.equal(subjectColorStyle(subject),'--subject-color:var(--subject-ffc000,#ffc000);--subject-bg:var(--white)');
  assert.equal(subject.color,'#FFC000');
  assert.equal(subjectColorStyle({color:'red;background:url(x)'}),'--subject-color:var(--ink);--subject-bg:var(--white)');
});
