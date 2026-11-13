import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {pages,assetName} from '../src/visitor-count.mjs';
import {weeklyRows,axis,spread,chartLayout,nearestWeek,caption,weekName,number,messages,showVisitorGraph} from '../src/visitor-graph.mjs';

// A Windows checkout may hold these files with CRLF line endings.
const source=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8').replaceAll('\r\n','\n');
const publicSite='https://portlandiator.github.io/PI_browser/';
const friday=Date.UTC(2026,10,13,4,30),week='2026-11-09';
const question='https://api.github.com/repos/portlandiator/PI_browser/releases/tags/visitor-counts';
const row=(catalog,volumes,subjects,guides)=>({catalog,volumes,subjects,'study-guides':guides});
const three=[{week:'2026-10-26',counts:row(72,16,35,18)},{week:'2026-11-02',counts:row(164,23,59,34)},{week,counts:row(104,15,43,31)}];
const size={width:900,height:420,left:40,right:130};

test('the graph has every week from the first one counted to the current one',()=>{
  const totals={week,at:friday,counts:row(12,1,4,2),weeks:[['2026-10-19',row(7,0,2,1)],['2026-11-02',{catalog:30,subjects:9}],[week,row(11,1,4,2)]]};
  assert.deepEqual(weeklyRows(totals,week),[
    {week:'2026-10-19',counts:row(7,0,2,1)},
    // A week without a row, and a page without a number, have no point: they are not zero.
    {week:'2026-10-26',counts:row(null,null,null,null)},
    {week:'2026-11-02',counts:row(30,null,9,null)},
    // The number at the foot of the page, which includes this visitor, stands where it is higher.
    {week,counts:row(12,1,4,2)},
  ]);
  // A kept number of an earlier week says nothing of this one, and never lowers GitHub's.
  assert.deepEqual(weeklyRows({...totals,week:'2026-11-02'},week).at(-1).counts,row(11,1,4,2));
  assert.deepEqual(weeklyRows({...totals,counts:row(3,0,0,0)},week).at(-1).counts,row(11,1,4,2));
  // Before GitHub lists the week, the footer's numbers are all there is.
  assert.deepEqual(weeklyRows({week,at:friday,counts:{catalog:1},weeks:[]},week),[{week,counts:row(1,null,null,null)}]);
  // Coming weeks, dates that are not Mondays and damaged entries are left out.
  const odd={week,counts:{},weeks:[['2026-11-16',row(1,1,1,1)],['2026-11-03',row(1,1,1,1)],['2026-02-31',row(1,1,1,1)],'2026-11-02',[week],[week,row(5,-1,2.5,'7')],null]};
  assert.deepEqual(weeklyRows(odd,week),[{week,counts:row(5,null,null,null)}]);
  for(const nothing of [null,undefined,{},{weeks:'none'},{week,counts:{},weeks:[]}])assert.deepEqual(weeklyRows(nothing,week),[]);
  // A damaged first date cannot ask for an endless graph.
  const long=weeklyRows({week,counts:{},weeks:[['1970-01-05',row(1,1,1,1)],[week,row(2,2,2,2)]]},week);
  assert.equal(long.length,1040);assert.equal(long.at(-1).week,week);assert.equal(long[0].counts.catalog,null);
});

test('the scale runs from zero in round steps',()=>{
  const values=highest=>axis(highest).ticks.map(tick=>tick.value);
  assert.deepEqual(values(0),[0,1]);
  assert.deepEqual(values(1),[0,1]);
  // Visitors are whole: a week of two has three marks on its scale, not halves.
  assert.deepEqual(values(2),[0,1,2]);
  assert.deepEqual(values(3),[0,1,2,3]);
  assert.deepEqual(values(5),[0,1,2,3,4,5]);
  assert.deepEqual(values(6),[0,2,4,6]);
  assert.deepEqual(values(12),[0,5,10,15]);
  assert.deepEqual(values(42),[0,10,20,30,40,50]);
  assert.deepEqual(values(100),[0,20,40,60,80,100]);
  assert.deepEqual(values(207),[0,50,100,150,200,250]);
  assert.deepEqual(values(1284),[0,500,1000,1500]);
  // Every scale holds its highest value, with four to six marks a whole number of visitors apart.
  for(const highest of [4,7,9,10,11,19,20,21,49,50,51,99,101,250,999,1000,1001,5986,12345,99999,100000,1234567]){
    const scale=axis(highest);
    assert(scale.top>=highest&&scale.top-scale.step<highest,String(highest));
    assert(scale.ticks.length>=4&&scale.ticks.length<=6,`${highest}: ${scale.ticks.length} marks`);
    assert(Number.isInteger(scale.step)&&scale.step>=1&&/^[125]0*$/.test(String(scale.step)),String(scale.step));
  }
  // Numbers are written in full below ten thousand and shortened on a scale that reaches it.
  assert.deepEqual(axis(1284).ticks.map(tick=>tick.text),['0','500','1,000','1,500']);
  assert.deepEqual(axis(12840).ticks.map(tick=>tick.text),['0','5K','10K','15K']);
  assert.equal(number(1284),'1,284');assert.equal(number(0),'0');assert.equal(number(null),'–');
  assert.deepEqual([weekName.brief(week),weekName.dated(week),weekName.full(week)],['9 Nov','9 Nov 2026','9 November 2026']);
});

test('labels that would overlap are moved apart, and stay inside the chart',()=>{
  // With room, every label sits at its own height.
  assert.deepEqual(spread([200,40,120],17,0,300),[200,40,120]);
  // Too close: apart by the gap, around their middle, and in their own order.
  assert.deepEqual(spread([100,104],20,0,300),[92,112]);
  assert.deepEqual(spread([104,100],20,0,300),[112,92]);
  // A crowd at the foot of the chart is stacked upwards from it, a crowd at the top downwards.
  assert.deepEqual(spread([300,300,298,299],17,30,300),[283,300,249,266]);
  assert.deepEqual(spread([30,31,30,29],17,30,300),[47,81,64,30]);
  // Moving one pair can push it into a third label, which then moves too.
  const placed=spread([100,110,125],17,0,300);
  assert.deepEqual(placed.map((at,index)=>index?Math.round((at-placed[index-1])*1e6)/1e6:17),[17,17,17]);
  for(const wanted of [[5,5,5,5],[0,400,200,210],[150,151,152,153],[299,1,150,150]]){
    const places=spread(wanted,17,30,300),sorted=[...places].sort((a,b)=>a-b);
    assert(sorted[0]>=30&&sorted.at(-1)<=300,JSON.stringify(places));
    for(let index=1;index<sorted.length;index++)assert(sorted[index]-sorted[index-1]>=17-1e-9,JSON.stringify(places));
  }
  assert.deepEqual(spread([],17,0,300),[]);
});

test('completed weeks are joined by a line and the week in progress hangs on a dotted one',()=>{
  const layout=chartLayout(three,week,size);
  assert.deepEqual(layout.plot,{left:40,right:770,top:30,bottom:388});
  assert.equal(layout.open,2);
  assert.deepEqual(layout.ticks.map(tick=>[tick.text,tick.y]),[['0',388],['50',298.5],['100',209],['150',119.5],['200',30]]);
  assert.deepEqual(layout.weeks,[{week:'2026-10-26',x:40,text:'26 Oct 2026'},{week:'2026-11-02',x:405,text:'2 Nov'},{week,x:770,text:'9 Nov'}]);
  assert.deepEqual(layout.lines.map(line=>line.page),Object.keys(pages));
  const [catalog]=layout.lines;
  assert.equal(catalog.solid,'M40 259.1L405 94.4');
  assert.equal(catalog.pending,'M405 94.4L770 201.8');
  // With so few weeks every one has its dot; the last, still being counted, is open.
  assert.deepEqual(catalog.dots.map(point=>[point.index,point.value,point.open]),[[0,72,false],[1,164,false],[2,104,true]]);
  assert.deepEqual(catalog.end,{index:2,x:770,y:201.8,value:104,open:true});
  // Each line is named at its end with its latest number, in the order of the pages.
  assert.deepEqual(layout.labels.map(label=>[label.name,label.value]),[['Catalog','104'],['Volumes','15'],['Subjects','43'],['Study guides','31']]);
  for(const label of layout.labels)assert.equal(label.x,784);
  // Once the week is over its points are like any other.
  const closed=chartLayout(three,'2026-11-16',size);
  assert.equal(closed.open,-1);
  assert.equal(closed.lines[0].solid,'M40 259.1L405 94.4L770 201.8');assert.equal(closed.lines[0].pending,'');
  assert(closed.lines.every(line=>line.dots.every(point=>!point.open)));
});

test('a single week is four open points at the right-hand edge, named beside them',()=>{
  const layout=chartLayout([{week,counts:row(12,2,4,2)}],week,size);
  assert.deepEqual(layout.weeks,[{week,x:770,text:'9 Nov 2026'}]);
  for(const line of layout.lines){
    assert.equal(line.solid+line.pending,'');
    assert.deepEqual(line.dots.map(point=>[point.x,point.open]),[[770,true]]);
  }
  assert.deepEqual(layout.ticks.map(tick=>tick.value),[0,5,10,15]);
  // Volumes and Study guides, both at 2, would be named on top of each other: their names are moved
  // apart around the point they share, in the order of the pages, and joined to it.
  const [catalog,volumes,subjects,guides]=layout.labels,shared=layout.lines[1].end.y;
  assert.equal(catalog.leader,null);assert.equal(subjects.leader,null);
  assert.equal(layout.lines[3].end.y,shared);
  assert.deepEqual([volumes.y,guides.y],[shared-8.5,shared+8.5].map(at=>Math.round(at*10)/10));
  assert.deepEqual(volumes.leader,{x1:777,y1:shared,x2:780,y2:volumes.y});
  assert.deepEqual(guides.leader,{x1:777,y1:shared,x2:780,y2:guides.y});
  // A week in which nobody came is drawn along the foot of the chart, not left out.
  const quiet=chartLayout([{week,counts:row(0,0,0,0)}],week,size);
  assert.deepEqual(quiet.ticks.map(tick=>tick.value),[0,1]);
  assert(quiet.lines.every(line=>line.end.y===quiet.plot.bottom));
  assert.deepEqual(quiet.labels.map(label=>label.y),[337,354,371,388]);
  // Nothing at all to draw is still a chart of the right size.
  assert.deepEqual(chartLayout([],week,size).lines.map(line=>line.dots.length),[0,0,0,0]);
});

test('a long graph thins its dots and its dates, and a missing week breaks the line',()=>{
  const weeks=[];
  for(let back=59;back>=0;back--){
    const day=new Date(Date.UTC(2026,10,9-7*back)).toISOString().slice(0,10);
    weeks.push({week:day,counts:row(100+back,10,40,back===30?null:20)});
  }
  const layout=chartLayout(weeks,week,size);
  // 730px for sixty weeks: no room for a dot each, so only the ends of the lines have one...
  for(const line of layout.lines.slice(0,3))assert.deepEqual(line.dots.map(point=>point.index),[59]);
  // ...and the dates are counted back from the latest in equal steps, the year given first and where it changes.
  const named=layout.weeks.filter(item=>item.text);
  assert.deepEqual(named.map(item=>item.text),['27 Oct 2025','8 Dec','19 Jan 2026','2 Mar','13 Apr','25 May','6 Jul','17 Aug','28 Sept','9 Nov']);
  assert.equal(named.filter(item=>/ \d{4}$/.test(item.text)).length,2);
  for(let index=1;index<named.length;index++)assert(named[index].x-named[index-1].x>=62,`${named[index-1].text} and ${named[index].text} overlap`);
  // The page without a count in one week has two lines, and no point there.
  const guides=layout.lines[3];
  assert.equal(guides.solid.match(/M/g).length,2);
  assert(!guides.points.some(point=>point.index===29));
  // A completed week between two missing ones would be invisible without a dot.
  const lonely=weeks.map((item,index)=>({...item,counts:{...item.counts,volumes:index===9||index===11?null:10}}));
  assert.deepEqual(chartLayout(lonely,week,size).lines[1].dots.map(point=>point.index),[10,59]);
  // The pointer reads the nearest week, and stays within the graph.
  assert.equal(nearestWeek(layout,40),0);assert.equal(nearestWeek(layout,770),59);
  assert.equal(nearestWeek(layout,-500),0);assert.equal(nearestWeek(layout,5000),59);
  assert.equal(nearestWeek(layout,40+730*17.4/59),17);
  assert.equal(nearestWeek(chartLayout([{week,counts:row(1,1,1,1)}],week,size),300),0);
});

test('the caption says which week is still being counted',()=>{
  assert.equal(caption(three,week),'Each point is one week, Monday to Sunday (UTC). The week from 9 November 2026 is still in progress: its points are open circles on a dotted line.');
  assert.equal(caption([three[2]],week),'Counting began in the week from 9 November 2026, which is still in progress. A line will join the weeks as they pass.');
  assert.equal(caption(three,'2026-11-16'),'Each point is one week, Monday to Sunday (UTC).');
  assert.match(caption(three,week,{kept:'13 November 2026 at 04:30'}),/ GitHub did not answer just now, so these are the totals as they stood on 13 November 2026 at 04:30\.$/);
});

// A stand-in for the page: elements that keep what is put in them.
function element(name){
  const self={tagName:name,children:[],attributes:{},listeners:{},style:{},hidden:false,className:'',parent:null,clientWidth:900,offsetWidth:170,
    get textContent(){return self.children.map(child=>typeof child==='string'?child:child.textContent).join('');},
    set textContent(value){self.children=value===''?[]:[String(value)];},
    append(...nodes){for(const child of nodes){if(typeof child!=='string')child.parent=self;self.children.push(child);}},
    replaceChildren(...nodes){self.children=[];self.append(...nodes);},
    remove(){self.parent.children=self.parent.children.filter(child=>child!==self);},
    setAttribute(key,value){self.attributes[key]=String(value);},
    addEventListener(type,listener){(self.listeners[type]||=[]).push(listener);},
    emit(type,event={}){for(const listener of self.listeners[type]||[])listener({type,target:self,preventDefault(){event.prevented=true;},...event});},
    contains(other){for(let at=other;at;at=at.parent)if(at===self)return true;return false;},
    matches:()=>false,
    getBoundingClientRect:()=>({left:100,top:0}),
    // Every character is taken to be 7px wide.
    getComputedTextLength:()=>self.textContent.length*7,
    all(test){return self.children.flatMap(child=>typeof child==='string'?[]:[...(test(child)?[child]:[]),...child.all(test)]);},
    classed(name){return self.all(child=>(child.attributes.class||child.className).split(' ').includes(name));},
  };
  return self;
}
function graphPage({site=publicSite,values=new Map(),answer,time=friday}={}){
  const ids=['visitors-status','visitors-retry','visitors-legend','visitors-plot','visitors-chart','visitors-tip','visitors-caption','visitors-numbers','visitors-table'];
  const elements=Object.fromEntries(ids.map(id=>[id,element(id)]));
  for(const id of ids.slice(1))elements[id].hidden=true;
  elements['visitors-status'].textContent='Reading the counts…';
  elements['visitors-plot'].append(elements['visitors-chart'],elements['visitors-tip']);
  const body=element('body'),requests=[],redraw=[];
  body.append(...ids.filter(id=>!elements[id].parent).map(id=>elements[id]));
  const document={activeElement:null,listeners:{},getElementById:id=>elements[id]||null,createElement:element,createElementNS:(space,name)=>Object.assign(element(name),{space}),
    addEventListener(type,listener){(document.listeners[type]||=[]).push(listener);}};
  const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>{values.set(key,String(value));}};
  const fetch=async(url,options)=>{requests.push({url,options});if(answer instanceof Error)throw answer;return answer;};
  return {elements,document,values,requests,redraw,body,
    show:()=>showVisitorGraph({document,storage,fetch,site:new URL(site),now:()=>time,watch:draw=>{redraw.push(draw);}})};
}
const described=(weeks,assets=weeks.at(-1))=>({ok:true,status:200,json:async()=>({
  body:['| Week from | Catalog | Volumes | Subjects | Study guides |','| --- | ---: | ---: | ---: | ---: |',...weeks.map(item=>`| ${item.week} | ${Object.values(item.counts).join(' | ')} |`)].join('\n'),
  assets:Object.entries(assets.counts).map(([page,download_count])=>({name:assetName(page,assets.week),download_count})),
})});

test('the page draws four named lines, a legend, a caption and the same numbers as a table',async()=>{
  const page=graphPage({answer:described(three)});
  await page.show();
  const {elements}=page;
  assert.deepEqual(page.requests,[{url:question,options:{credentials:'omit',referrerPolicy:'no-referrer',headers:{Accept:'application/vnd.github+json'}}}]);
  for(const id of ['visitors-legend','visitors-plot','visitors-caption','visitors-table'])assert.equal(elements[id].hidden,false,id);
  assert.equal(elements['visitors-status'].hidden,true);assert.equal(elements['visitors-retry'].hidden,true);
  // The legend names every line beside a key in the line's colour; the text itself is not coloured.
  assert.deepEqual(elements['visitors-legend'].children.map(item=>[item.children[0].className,item.children[1].textContent,item.children[1].className]),
    Object.entries(pages).map(([page,name])=>['visitors-key visitors-'+page,name,'']));
  assert.equal(elements['visitors-caption'].textContent,caption(three,week));
  const svg=elements['visitors-chart'];
  assert.equal(svg.attributes.viewBox,'0 0 900 420');
  assert.equal(svg.attributes['aria-label'],'Line graph of the unique visitors of Catalog, Volumes, Subjects and Study guides in each week from 26 October 2026. The table below holds the same numbers.');
  // One colour class for each page, a solid and a dotted stretch for each line, a dot for every week.
  const lines=svg.all(child=>child.tagName==='g'&&/^visitors-(?!grid)/.test(child.attributes.class||''));
  assert.deepEqual(lines.map(group=>group.attributes.class),Object.keys(pages).map(page=>'visitors-'+page));
  for(const group of lines){
    assert.deepEqual(group.children.map(child=>child.attributes.class),['visitors-line','visitors-line visitors-pending','visitors-dot','visitors-dot','visitors-dot visitors-open']);
  }
  assert.equal(svg.classed('visitors-pending')[0].attributes.d.match(/[ML]/g).join(''),'ML');
  // Each line is named at its end with its latest number, in the page's ink: no text wears a line's colour.
  assert.deepEqual(svg.classed('visitors-end').map(label=>label.children.map(part=>part.textContent)),[['Catalog','104'],['Volumes','15'],['Subjects','43'],['Study guides','31']]);
  assert(svg.all(child=>child.tagName==='text'||child.tagName==='tspan').every(text=>!/visitors-(?:catalog|volumes|subjects|study-guides)/.test(text.attributes.class||'')));
  // The scale and the dates.
  assert.deepEqual(svg.classed('visitors-axis').map(text=>text.textContent),['0','50','100','150','200','Unique visitors','26 Oct 2026','2 Nov','9 Nov']);
  assert.equal(svg.classed('visitors-grid').length,5);assert.equal(svg.classed('visitors-base').length,1);
  // The plot is as wide as the room left by the widest number and the widest name: "Study guides" and "31" at 7px a character.
  assert.equal(svg.classed('visitors-base')[0].attributes.x2,String(900-(('Study guides'.length+2)*7+22)));
  // The table, newest week first, the week in progress marked.
  const [title,head,body]=elements['visitors-numbers'].children;
  assert.equal(title.tagName,'caption');
  assert.deepEqual(head.children[0].children.map(cell=>[cell.textContent,cell.scope]),[['Week from','col'],['Catalog','col'],['Volumes','col'],['Subjects','col'],['Study guides','col']]);
  assert.deepEqual(body.children.map(line=>line.children.map(cell=>cell.textContent)),[
    ['9 November 20269 Nov 2026 (so far)','104','15','43','31'],['2 November 20262 Nov 2026','164','23','59','34'],['26 October 202626 Oct 2026','72','16','35','18']]);
  assert.deepEqual(body.children[0].children[0].children.slice(0,2).map(part=>part.className),['visitors-long','visitors-brief']);
  // It is drawn again when the page says its width or its typeface has changed.
  assert.equal(page.redraw.length,1);
  elements['visitors-plot'].clientWidth=320;page.redraw[0]();
  assert.equal(svg.attributes.viewBox,'0 0 320 250');
  assert.equal(svg.classed('visitors-end').length,4);
});

test('pointing at a week, or stepping to it with the arrow keys, reads all four numbers',async()=>{
  const page=graphPage({answer:described(three)});
  await page.show();
  const {elements}=page,plot=elements['visitors-plot'],tip=elements['visitors-tip'],svg=elements['visitors-chart'];
  const read=()=>tip.hidden?null:[tip.children[0].textContent,...tip.children.slice(1).map(line=>line.children.map(part=>part.textContent).join('|'))];
  const cross=()=>svg.classed('visitors-cross')[0].attributes;
  assert.equal(read(),null);assert.equal(cross().visibility,'hidden');
  // The chart begins 100px into the page; its plot runs from 35 to 780 of its own width.
  plot.emit('pointermove',{clientX:100+35+370,pointerType:'mouse'});
  assert.deepEqual(read(),['Week from 2 November 2026','|164|Catalog','|23|Volumes','|59|Subjects','|34|Study guides']);
  assert.deepEqual([cross().visibility,cross().x1,cross().x2],['visible','407.5','407.5']);
  // The number comes first and the name after it, beside a key in the line's colour.
  assert.deepEqual(tip.children[1].children.map(part=>[part.tagName,part.className]),[['span','visitors-key visitors-catalog'],['strong',''],['span','']]);
  // The points of that week are marked on every line.
  const marks=svg.classed('visitors-mark');
  assert.deepEqual(marks.map(mark=>[mark.attributes.visibility,mark.attributes.cx]),Array(4).fill(['visible','407.5']));
  // Beside the crosshair where there is room, on its other side where there is not.
  assert.equal(tip.style.left,'421.5px');
  plot.emit('pointermove',{clientX:100+900,pointerType:'mouse'});
  assert.deepEqual(read()[0],'Week from 9 November 2026 (so far)');
  assert.equal(tip.style.left,(780-14-170)+'px');
  assert(marks.every(mark=>mark.attributes.class.endsWith(' visitors-open')));
  // A mouse that leaves takes the readout with it; a finger that lifts does not, until something else is touched.
  plot.emit('pointerleave',{pointerType:'mouse'});
  assert.equal(read(),null);assert.equal(cross().visibility,'hidden');assert(marks.every(mark=>mark.attributes.visibility==='hidden'));
  plot.emit('pointerdown',{clientX:100+35,pointerType:'touch'});plot.emit('pointerleave',{pointerType:'touch'});
  assert.equal(read()[0],'Week from 26 October 2026');
  for(const listener of page.document.listeners.pointerdown)listener({target:svg});
  assert.equal(read()[0],'Week from 26 October 2026');
  for(const listener of page.document.listeners.pointerdown)listener({target:page.body});
  assert.equal(read(),null);
  // The keyboard: the first press reads the latest week, then one week at a time, never past either end.
  const press=key=>{const event={key};plot.emit('keydown',event);return event.prevented===true;};
  assert.equal(press('ArrowLeft'),true);assert.equal(read()[0],'Week from 9 November 2026 (so far)');
  press('ArrowLeft');assert.equal(read()[0],'Week from 2 November 2026');
  press('ArrowLeft');press('ArrowLeft');assert.equal(read()[0],'Week from 26 October 2026');
  press('End');assert.equal(read()[0],'Week from 9 November 2026 (so far)');
  press('ArrowRight');assert.equal(read()[0],'Week from 9 November 2026 (so far)');
  press('Home');assert.equal(read()[0],'Week from 26 October 2026');
  // Other keys are left to the browser; Escape and leaving the graph put the readout away.
  assert.equal(press('Tab'),false);assert.equal(press('a'),false);
  press('Escape');assert.equal(read(),null);
  press('ArrowRight');plot.emit('blur');assert.equal(read(),null);
  // A redraw keeps the week that is being read.
  press('Home');page.redraw[0]();assert.equal(read()[0],'Week from 26 October 2026');
});

test('the number just seen at the foot of a page is the one the graph ends on',async()=>{
  // The Catalog page kept GitHub's answer a minute ago and added this visitor to it.
  const kept={week,at:friday-60*1000,counts:row(105,15,43,31),weeks:three.map(item=>[item.week,item.counts])};
  const page=graphPage({values:new Map([['pi-visitor-counts',JSON.stringify(kept)]]),answer:new TypeError('not asked')});
  await page.show();
  // Nothing is asked of GitHub while the answer is fresh.
  assert.deepEqual(page.requests,[]);
  assert.deepEqual(page.elements['visitors-chart'].classed('visitors-end')[0].children.map(part=>part.textContent),['Catalog','105']);
  assert.equal(page.elements['visitors-caption'].textContent,caption(three,week));
  // The graph page notes nothing of its own: it is not a counted view.
  assert.deepEqual([...page.values.keys()],['pi-visitor-counts']);
  assert.deepEqual(JSON.parse(page.values.get('pi-visitor-counts')),kept);
});

test('when there is nothing to draw the page says why',async()=>{
  // A local preview, the app or a copy elsewhere has no counts and asks nobody.
  for(const site of ['http://localhost:4173/PI_browser/','http://127.0.0.1:51234/PI_browser/','https://example.org/PI_browser/']){
    const copy=graphPage({site,answer:described(three)});
    await copy.show();
    assert.deepEqual(copy.requests,[],site);
    assert.deepEqual([copy.elements['visitors-status'].textContent,copy.elements['visitors-status'].hidden,copy.elements['visitors-plot'].hidden],[messages.elsewhere,false,true]);
  }
  // GitHub does not answer and nothing was kept: the visitor can try again.
  for(const answer of [new TypeError('Failed to fetch'),{ok:false,status:403},{ok:true,status:200,json:async()=>{throw SyntaxError('Unexpected token');}}]){
    const silent=graphPage({answer});
    await silent.show();
    assert.deepEqual([silent.elements['visitors-status'].textContent,silent.elements['visitors-retry'].hidden,silent.elements['visitors-plot'].hidden],[messages.unanswered,false,true]);
  }
  // The release does not exist yet.
  const early=graphPage({answer:{ok:false,status:404}});
  await early.show();
  assert.deepEqual([early.elements['visitors-status'].textContent,early.elements['visitors-retry'].hidden,early.elements['visitors-plot'].hidden],[messages.none,true,true]);
  // An earlier answer is better than none, and the caption says how old it is.
  const hour=friday-3600_000,kept={week,at:hour,counts:three[2].counts,weeks:three.map(item=>[item.week,item.counts])};
  const stale=graphPage({values:new Map([['pi-visitor-counts',JSON.stringify(kept)]]),answer:{ok:false,status:403}});
  await stale.show();
  assert.equal(stale.requests.length,1);
  assert.equal(stale.elements['visitors-plot'].hidden,false);
  const when=new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(hour));
  assert.equal(stale.elements['visitors-caption'].textContent,caption(three,week,{kept:when}));
  assert.match(stale.elements['visitors-caption'].textContent,/as they stood on 13 November 2026/);
});

test('the graph page counts nobody and collects nothing',()=>{
  const page=source('src/visitors.html');
  // It is not one of the counted views: it only loads the graph, which reads the public totals.
  assert.doesNotMatch(page,/data-visitor-page|data-visitor-count|visitor-count\.mjs/);
  assert(page.includes('<script type="module" src="./visitor-graph.mjs"></script>'));
  assert(page.includes('<script src="./site.js"></script>')&&page.includes('<link rel="stylesheet" href="./visitors.css">'));
  assert(page.includes('<nav aria-label="Main navigation"><a href="./">Catalog</a><a href="./volume-view.html">Volumes</a><a href="./subjects.html">Subjects</a><a href="./study-guides/index.html">Study guides</a></nav>'));
  assert(page.includes('the <a href="./privacy.html">privacy policy</a> explains how.'));
  assert(page.includes('<footer class="site-footer"><span>Partial Inventory browser</span><span><a href="./privacy.html">Privacy policy</a> · <a href="./support.html">Support</a></span></footer>'));
  // Every element the graph fills is there, and the readout is announced.
  for(const id of ['visitors-status','visitors-retry','visitors-legend','visitors-plot','visitors-chart','visitors-tip','visitors-caption','visitors-table','visitors-numbers'])assert.equal(page.split(`id="${id}"`).length,2,id);
  assert.match(page,/<div class="visitors-plot" id="visitors-plot" tabindex="0" role="group" aria-label="[^"]+" hidden>/);
  assert.match(page,/<div class="visitors-tip" id="visitors-tip" role="status" hidden>/);
  // Comments aside, the module names no address of its own and reads nothing about the visitor.
  const code=source('src/visitor-graph.mjs').split('\n').filter(line=>!line.trim().startsWith('//')).join('\n');
  assert.doesNotMatch(code,/cookie|document\.referrer|sessionStorage|indexedDB|randomUUID|getRandomValues|Math\.random|screen\.|navigator|sendBeacon|keepalive|innerHTML|insertAdjacentHTML/);
  assert.deepEqual([...code.matchAll(/https?:\/\/[^'"`\s]+/g)].map(match=>match[0]),['http://www.w3.org/2000/svg']);
  assert.match(code,/^import \{[^}]+\} from '\.\/visitor-count\.mjs';$/m);
  // The privacy policy says that the totals are drawn as a graph and what opening it does.
  const policy=source('src/privacy.html');
  assert.match(policy,/a <a href="\.\/visitors\.html">graph of the weekly totals<\/a>/);
  assert.match(policy,/Opening the graph counts nothing/);
});

test('the graph page, which has no About dialog, still shows and switches the theme',()=>{
  // The site's shared script serves every page; this one, like the policy and support pages, has a theme switch only.
  const html=source('src/visitors.html');
  assert(html.includes('id="theme-toggle"')&&!html.includes('about-dialog')&&!html.includes('about-open'));
  const events={},clicks={},attributes={},values=new Map([['pi-theme','dark']]),root={dataset:{}};
  const present=['theme-toggle','meta'];
  const part=id=>present.includes(id)?{addEventListener:(type,listener)=>{clicks[id+':'+type]=listener;},setAttribute:(key,value)=>{attributes[id+':'+key]=value;}}:null;
  runInNewContext(source('src/site.js'),{
    URL,location:{href:publicSite+'visitors.html'},history:{replaceState(){}},
    // A browser of any age: the script may watch the page being read, or wait for it.
    MutationObserver:class{observe(){}disconnect(){}},
    document:{documentElement:root,getElementById:part,querySelector:()=>part('meta'),addEventListener:(type,listener)=>{events[type]=listener;}},
    window:{addEventListener(){}},
    localStorage:{getItem:key=>values.get(key),setItem:(key,value)=>{values.set(key,value);}},
  });
  events.DOMContentLoaded();
  // Opened in the dark theme, the switch says so, and it still switches.
  assert.equal(root.dataset.theme,'dark');
  assert.equal(attributes['theme-toggle:aria-checked'],'true');assert.equal(attributes['meta:content'],'#151d19');
  clicks['theme-toggle:click']();
  assert.deepEqual([root.dataset.theme,attributes['theme-toggle:aria-checked'],values.get('pi-theme')],['light','false','light']);
});

test('the four line colours stand out from the day and the night paper',()=>{
  const style=source('src/visitors.css');
  const palette=selector=>Object.fromEntries([...style.slice(style.indexOf(selector+'{')).split('}')[0].matchAll(/--visitors-([a-z-]+):(#[0-9a-f]{6})/g)].map(match=>[match[1],match[2]]));
  const day=palette(':root'),night=palette(':root[data-theme=dark]'),print=palette('@media print{:root[data-theme]');
  // Chosen as a set and checked pair by pair for colour-blind readers (see visitors.css): change them only as a set.
  assert.deepEqual(day,{catalog:'#2347ae',volumes:'#8c3019',subjects:'#38a017','study-guides':'#b576c3'});
  assert.deepEqual(night,{catalog:'#445dd8',volumes:'#a35303',subjects:'#57a45b','study-guides':'#bb70b5'});
  assert.deepEqual(print,day);
  assert.deepEqual(Object.keys(day),Object.keys(pages));
  for(const page of Object.keys(pages))assert(style.includes(`.visitors-${page}{--series:var(--visitors-${page})}`),page);
  const light=colour=>{const [r,g,b]=[1,3,5].map(at=>parseInt(colour.slice(at,at+2),16)/255).map(part=>part<=0.04045?part/12.92:((part+0.055)/1.055)**2.4);return 0.2126*r+0.7152*g+0.0722*b;};
  const contrast=(a,b)=>{const [high,low]=[light(a),light(b)].sort((x,y)=>y-x);return (high+0.05)/(low+0.05);};
  // The paper colours of src/style.css and src/theme.css.
  assert(source('src/style.css').includes('--paper:#f7f6f0')&&source('src/theme.css').includes('--paper:#151d19'));
  for(const colour of Object.values(day))assert(contrast(colour,'#f7f6f0')>=3,`${colour} on the day paper`);
  for(const colour of Object.values(night))assert(contrast(colour,'#151d19')>=3,`${colour} on the night paper`);
  // Names and numbers are in the page's ink; marks carry the colour.
  assert.match(style,/\.visitors-end\{fill:var\(--ink\)/);assert.match(style,/\.visitors-axis\{fill:var\(--muted\)/);
  assert.match(style,/\.visitors-line\{stroke:var\(--series\);stroke-width:2;/);
  assert.match(style,/\.visitors-grid\{stroke:var\(--rule\);stroke-width:1\}/);assert.doesNotMatch(style,/\.visitors-grid[^}]*dasharray/);
});
