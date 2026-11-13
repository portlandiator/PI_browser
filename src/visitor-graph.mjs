// The graph of weekly visitor counts (visitors.html): one line for each of the
// four main views, week by week. The totals are those src/visitor-count.mjs
// reads from GitHub for the foot of those views, and the number there is the
// link to this page. Opening the graph counts nothing and sends nothing about
// the visitor: it asks GitHub for the public totals, without cookies or a
// referrer, unless the answer kept in the browser is still fresh.
//
// The four line colours are in visitors.css. They were chosen as a set and
// checked pair by pair on the day and the night paper, for readers with any of
// the three kinds of colour blindness as well; the line-end labels, the legend
// and the table name every line besides.
import {pages,weekOf,addWeeks,siteRepository,browserStore,readTotals,cacheTime} from './visitor-count.mjs';

const pageNames=Object.keys(pages);
const count=value=>Number.isSafeInteger(value)&&value>=0?value:null;
function isWeek(week){
  if(typeof week!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(week))return false;
  const day=new Date(week+'T00:00:00Z');
  return !Number.isNaN(day.getTime())&&weekOf(day)===week;
}
// Twenty years of weeks: a damaged date cannot ask for an endless graph.
const longest=1040;

// Every week from the first one counted to the current one, oldest first. A
// page has null in a week without a count. In the current week a number kept
// from the foot of a page stands where it is higher than GitHub's own: it
// already includes this visitor.
export function weeklyRows(totals,current){
  const known=new Map();
  for(const entry of Array.isArray(totals?.weeks)?totals.weeks:[]){
    if(Array.isArray(entry)&&isWeek(entry[0])&&entry[0]<=current&&entry[1]&&typeof entry[1]==='object')known.set(entry[0],entry[1]);
  }
  if(totals?.week===current&&totals.counts&&typeof totals.counts==='object'){
    const row={...known.get(current)};
    for(const page of pageNames)if(count(totals.counts[page])!==null)row[page]=Math.max(count(row[page])??0,totals.counts[page]);
    if(known.has(current)||Object.keys(row).length)known.set(current,row);
  }
  if(!known.size)return [];
  let week=[...known.keys()].sort()[0];
  if(week<addWeeks(current,1-longest))week=addWeeks(current,1-longest);
  const rows=[];
  for(;week<=current;week=addWeeks(week,1)){
    const counts=known.get(week)||{};
    rows.push({week,counts:Object.fromEntries(pageNames.map(page=>[page,count(counts[page])]))});
  }
  return rows;
}

const whole=new Intl.NumberFormat('en-US'),short=new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1});
export const number=value=>value===null?'–':whole.format(value);
const date=(week,options)=>new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',...options}).format(new Date(week+'T00:00:00Z'));
// A week is named by its Monday: "9 Nov", "9 Nov 2026", "9 November 2026".
export const weekName={
  brief:week=>date(week,{day:'numeric',month:'short'}),
  dated:week=>date(week,{day:'numeric',month:'short',year:'numeric'}),
  full:week=>date(week,{day:'numeric',month:'long',year:'numeric'}),
};

// A scale from zero in round steps (1, 2 or 5, times a power of ten), four to
// six of them. Visitors are whole, so no step is smaller than one.
export function axis(highest,steps=5){
  const rough=Math.max(highest,1)/steps,power=10**Math.floor(Math.log10(rough));
  const step=Math.max(1,[1,2,5,10].map(factor=>factor*power).find(size=>size>=rough));
  const top=Math.max(1,Math.ceil(highest/step))*step;
  // Written in full below ten thousand, shortened on a scale that reaches it.
  const text=top<10000?whole:short;
  return {step,top,ticks:Array.from({length:Math.round(top/step)+1},(_,index)=>({value:index*step,text:text.format(index*step)}))};
}

// Places for labels that each want to sit at their own height but must not
// overlap: those too close are moved apart evenly around their middle, and the
// whole column stays between `min` and `max`. Returned in the order given.
export function spread(wanted,gap,min,max){
  const order=wanted.map((at,index)=>({at,index})).sort((a,b)=>a.at-b.at||a.index-b.index);
  const groups=[];
  const start=group=>Math.max(min,Math.min(max-gap*(group.items.length-1),group.sum/group.items.length-gap*(group.items.length-1)/2));
  for(const item of order){
    groups.push({sum:item.at,items:[item.index]});
    while(groups.length>1){
      const last=groups[groups.length-1],before=groups[groups.length-2];
      if(start(last)-(start(before)+gap*(before.items.length-1))>=gap)break;
      before.sum+=last.sum;before.items.push(...last.items);groups.pop();
    }
  }
  const placed=[];
  for(const group of groups)group.items.forEach((index,place)=>{placed[index]=start(group)+gap*place;});
  return placed;
}

// Where everything in the chart goes at a given size. `left` and `right` are
// the room that the numbers of the scale and the labels at the line ends need.
// The week in progress is `current`: its points are open and hang on a dotted
// line, because a week that has only begun always looks like a fall.
export function chartLayout(rows,current,{width,height,left,right,top=30,bottom=32,labelGap=17,weekRoom=62,dotRoom=16}){
  const plot={left,right:Math.max(left+40,width-right),top,bottom:height-bottom};
  const scale=axis(Math.max(0,...rows.flatMap(row=>pageNames.map(page=>row.counts[page]??0))));
  const span=plot.right-plot.left,last=rows.length-1;
  // The latest week is at the right-hand edge, also while it is the only one.
  const x=index=>last>0?plot.left+span*index/last:plot.right;
  const y=value=>plot.bottom-(plot.bottom-plot.top)*value/scale.top;
  const round=value=>Math.round(value*10)/10;
  const open=last>=0&&rows[last].week===current?last:-1;

  // As many weeks are named as fit, counted back from the latest; the year is
  // given with the first of them and wherever it changes.
  const every=Math.max(1,Math.ceil(weekRoom*last/span));
  let year;
  const weeks=rows.map((row,index)=>{
    const named=(last-index)%every===0,dated=named&&row.week.slice(0,4)!==year;
    if(named)year=row.week.slice(0,4);
    return {week:row.week,x:round(x(index)),text:named?weekName[dated?'dated':'brief'](row.week):null};
  });

  // A dot for every week while there is room for them; in a long graph only
  // for the points no line would show: a line's end and a week standing alone.
  const dotted=last<1||span/last>=dotRoom;
  const path=points=>points.map((point,index)=>`${index?'L':'M'}${point.x} ${point.y}`).join('');
  const lines=pageNames.map(page=>{
    const points=rows.map((row,index)=>row.counts[page]===null?null:{index,x:round(x(index)),y:round(y(row.counts[page])),value:row.counts[page],open:index===open});
    const runs=[];
    let run=[];
    for(const point of points){
      if(point&&!point.open)run.push(point);
      else{if(run.length)runs.push(run);run=[];}
    }
    if(run.length)runs.push(run);
    const pending=open>0&&points[open]&&points[open-1]?[points[open-1],points[open]]:null;
    const drawn=points.filter(Boolean),end=drawn[drawn.length-1]||null;
    const alone=new Set(runs.filter(run=>run.length===1).map(run=>run[0]));
    return {page,points:drawn,end,solid:runs.filter(run=>run.length>1).map(path).join(''),pending:pending?path(pending):'',
      dots:drawn.filter(point=>dotted||point===end||point.open||alone.has(point))};
  });

  // Each line is named where it ends, with its latest number. Names that would
  // overlap are moved apart and joined to their line ends.
  const ended=lines.filter(line=>line.end);
  const heights=spread(ended.map(line=>line.end.y),labelGap,plot.top,plot.bottom);
  const labels=ended.map((line,index)=>{
    const at=round(heights[index]),moved=Math.abs(at-line.end.y)>3||line.end.x<plot.right-1;
    return {page:line.page,name:pages[line.page],value:number(line.end.value),x:round(plot.right+14),y:at,
      leader:moved?{x1:round(line.end.x+7),y1:line.end.y,x2:round(plot.right+10),y2:at}:null};
  });
  return {width,height,plot,open,weeks,lines,labels,ticks:scale.ticks.map(tick=>({...tick,y:round(y(tick.value))}))};
}

// The week nearest a place across the chart.
export function nearestWeek(layout,x){
  const last=layout.weeks.length-1;
  if(last<1)return last;
  return Math.max(0,Math.min(last,Math.round((x-layout.plot.left)/(layout.plot.right-layout.plot.left)*last)));
}

export const messages={
  reading:'Reading the counts…',
  elsewhere:'The counts are kept for the published website only, so there is nothing to show at this address.',
  unanswered:'GitHub, which keeps the counts, did not answer just now. Please try again in a few minutes.',
  none:'No visits have been counted yet.',
  failed:'The graph could not be drawn in this browser. The privacy policy says where else the totals appear.',
};
// What is said under the graph.
export function caption(rows,current,{kept=null}={}){
  const last=rows[rows.length-1],counting=last?.week===current;
  const parts=[];
  if(rows.length===1&&counting)parts.push(`Counting began in the week from ${weekName.full(current)}, which is still in progress. A line will join the weeks as they pass.`);
  else{
    parts.push('Each point is one week, Monday to Sunday (UTC).');
    if(counting)parts.push(`The week from ${weekName.full(current)} is still in progress: its points are open circles on a dotted line.`);
  }
  if(kept!==null)parts.push(`GitHub did not answer just now, so these are the totals as they stood on ${kept}.`);
  return parts.join(' ');
}

const svgSpace='http://www.w3.org/2000/svg';

// Draws the graph into the page and keeps it fitted to its width. The page
// supplies the elements (visitors.html); every word and number is put in as
// text, never as markup.
export function drawGraph({document,elements,rows,current,note,watch}){
  const {legend,plot,svg,tip,figcaption,table,tableBox}=elements;
  const html=(name,className,text)=>{const node=document.createElement(name);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
  const shape=(name,attributes={},text)=>{
    const node=document.createElementNS(svgSpace,name);
    for(const [key,value] of Object.entries(attributes))node.setAttribute(key,value);
    if(text!==undefined)node.textContent=text;
    return node;
  };
  const key=page=>html('span','visitors-key visitors-'+page);
  const counting=rows[rows.length-1].week===current;

  legend.replaceChildren(...pageNames.map(page=>{const item=html('li');item.append(key(page),html('span','',pages[page]));return item;}));
  figcaption.textContent=note;

  // The same numbers as a table, newest week first.
  const head=html('tr');
  head.append(...['Week from',...pageNames.map(page=>pages[page])].map(text=>{const cell=html('th','',text);cell.scope='col';return cell;}));
  const body=html('tbody');
  for(const row of [...rows].reverse()){
    // The month is written out where there is room for it (visitors.css).
    const line=html('tr'),week=html('th');
    week.scope='row';
    week.append(html('span','visitors-long',weekName.full(row.week)),html('span','visitors-brief',weekName.dated(row.week)));
    if(counting&&row.week===current)week.append(' ',html('span','visitors-so-far','(so far)'));
    line.append(week,...pageNames.map(page=>html('td','',number(row.counts[page]))));
    body.append(line);
  }
  const top=html('thead');top.append(head);
  table.replaceChildren(html('caption','sr-only','Unique visitors of each main view in each week'),top,body);

  let layout,shown=-1,marks=[],cross;
  function draw(){
    const width=Math.max(260,Math.floor(plot.clientWidth)),height=Math.round(Math.max(250,Math.min(420,width*.5)));
    svg.replaceChildren();
    svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('width',width);svg.setAttribute('height',height);
    // Room for the widest number of the scale and the widest line-end label.
    const measured=(className,parts)=>{
      const text=shape('text',{class:className,x:0,y:-50});
      text.append(...parts);svg.append(text);
      const length=typeof text.getComputedTextLength==='function'?text.getComputedTextLength():0;
      text.remove();
      return length;
    };
    const endParts=label=>[shape('tspan',{},label.name),shape('tspan',{class:'visitors-end-value',dx:5},label.value)];
    const sizes={width,height,left:34,right:60};
    const first=chartLayout(rows,current,sizes);
    sizes.left=Math.max(34,Math.ceil(Math.max(...first.ticks.map(tick=>measured('visitors-axis',[tick.text]))))+14);
    sizes.right=Math.ceil(Math.max(0,...first.labels.map(label=>measured('visitors-end',endParts(label)))))+22;
    layout=chartLayout(rows,current,sizes);
    const {plot:area}=layout;

    const grid=shape('g',{'aria-hidden':'true'});
    for(const tick of layout.ticks){
      grid.append(shape('line',{class:tick.value?'visitors-grid':'visitors-grid visitors-base',x1:area.left,x2:area.right,y1:tick.y,y2:tick.y}),
        shape('text',{class:'visitors-axis',x:area.left-10,y:tick.y,dy:'.32em','text-anchor':'end'},tick.text));
    }
    grid.append(shape('text',{class:'visitors-axis',x:0,y:12},'Unique visitors'));
    for(const week of layout.weeks)if(week.text)grid.append(shape('text',{class:'visitors-axis',x:week.x,y:area.bottom+21,'text-anchor':'middle'},week.text));

    // The crosshair lies under the lines; its dots are drawn over them.
    cross=shape('line',{class:'visitors-cross',y1:area.top,y2:area.bottom,visibility:'hidden'});
    const drawing=shape('g',{'aria-hidden':'true'}),ends=shape('g',{'aria-hidden':'true'}),over=shape('g',{'aria-hidden':'true'});
    for(const line of layout.lines){
      const group=shape('g',{class:'visitors-'+line.page});
      if(line.solid)group.append(shape('path',{class:'visitors-line',d:line.solid}));
      if(line.pending)group.append(shape('path',{class:'visitors-line visitors-pending',d:line.pending}));
      for(const point of line.dots)group.append(shape('circle',{class:point.open?'visitors-dot visitors-open':'visitors-dot',cx:point.x,cy:point.y,r:point.open?4.5:4}));
      drawing.append(group);
    }
    for(const label of layout.labels){
      if(label.leader)ends.append(shape('line',{class:'visitors-leader',...label.leader}));
      const text=shape('text',{class:'visitors-end',x:label.x,y:label.y,dy:'.32em'});
      text.append(...endParts(label));
      ends.append(text);
    }
    marks=layout.lines.map(line=>{const mark=shape('circle',{class:'visitors-mark visitors-'+line.page,r:5.5,visibility:'hidden'});over.append(mark);return mark;});
    svg.append(grid,cross,drawing,ends,over);
    if(shown>=0)show(Math.min(shown,rows.length-1));
  }

  // One readout for the week under the pointer, naming every view: the
  // number first, since the reader already knows which lines there are.
  function show(index){
    shown=index;
    const row=rows[index],x=layout.weeks[index].x;
    cross.setAttribute('x1',x);cross.setAttribute('x2',x);cross.setAttribute('visibility','visible');
    layout.lines.forEach((line,place)=>{
      const point=line.points.find(point=>point.index===index);
      if(point){
        marks[place].setAttribute('cx',point.x);marks[place].setAttribute('cy',point.y);
        marks[place].setAttribute('class',`visitors-mark visitors-${line.page}${point.open?' visitors-open':''}`);
      }
      marks[place].setAttribute('visibility',point?'visible':'hidden');
    });
    const title=html('div','visitors-tip-week','Week from '+weekName.full(row.week));
    if(counting&&row.week===current)title.append(' ',html('span','visitors-so-far','(so far)'));
    tip.replaceChildren(title,...pageNames.map(page=>{
      const line=html('div','visitors-tip-row');
      line.append(key(page),html('strong','',number(row.counts[page])),html('span','',pages[page]));
      return line;
    }));
    tip.hidden=false;
    // Beside the crosshair, on whichever side has room.
    const room=plot.clientWidth,wide=tip.offsetWidth;
    const left=x+14+wide<=room?x+14:Math.max(0,x-14-wide);
    tip.style.left=left+'px';tip.style.top=layout.plot.top+'px';
  }
  function hide(){
    shown=-1;tip.hidden=true;
    cross?.setAttribute('visibility','hidden');
    for(const mark of marks)mark.setAttribute('visibility','hidden');
  }
  const pointed=event=>show(nearestWeek(layout,event.clientX-svg.getBoundingClientRect().left));
  plot.addEventListener('pointermove',pointed);
  plot.addEventListener('pointerdown',pointed);
  // A mouse that leaves takes the readout with it, unless the keyboard is
  // reading the graph; after a touch it stays until something else is touched.
  const keyed=()=>document.activeElement===plot&&Boolean(plot.matches?.(':focus-visible'));
  plot.addEventListener('pointerleave',event=>{if(event.pointerType==='mouse'&&!keyed())hide();});
  document.addEventListener('pointerdown',event=>{if(!plot.contains(event.target))hide();});
  // The arrow keys step through the weeks, with the same readout.
  plot.addEventListener('keydown',event=>{
    const last=rows.length-1,step={ArrowLeft:-1,ArrowRight:1}[event.key];
    if(event.key==='Escape')return hide();
    // The first press reads the latest week.
    const to=event.key==='Home'?0:event.key==='End'||(step&&shown<0)?last:step?shown+step:null;
    if(to===null)return;
    event.preventDefault();
    show(Math.max(0,Math.min(last,to)));
  });
  plot.addEventListener('focus',()=>{if(shown<0&&keyed())show(rows.length-1);});
  plot.addEventListener('blur',hide);

  for(const element of [legend,plot,figcaption,tableBox])element.hidden=false;
  svg.setAttribute('aria-label',`Line graph of the unique visitors of ${pageNames.map(page=>pages[page]).join(', ').replace(/, ([^,]*)$/,' and $1')} in each week from ${weekName.full(rows[0].week)}. The table below holds the same numbers.`);
  draw();
  // Drawn again when the width changes, and when the site's typeface has
  // arrived and the labels can be measured in it.
  watch(draw);
}

// Reads the totals and shows the graph, or says why there is none.
export async function showVisitorGraph({document,storage,fetch,site,now=()=>Date.now(),watch=()=>{}}){
  const find=id=>document.getElementById(id);
  const status=find('visitors-status'),retry=find('visitors-retry');
  const elements={legend:find('visitors-legend'),plot:find('visitors-plot'),svg:find('visitors-chart'),tip:find('visitors-tip'),figcaption:find('visitors-caption'),table:find('visitors-numbers'),tableBox:find('visitors-table')};
  const say=(text,again=false)=>{status.textContent=text;status.hidden=false;if(retry)retry.hidden=!again;};
  const repository=siteRepository(site);
  if(!repository)return say(messages.elsewhere);
  say(messages.reading);
  const current=weekOf(new Date(now()));
  const {totals,reachable}=await readTotals({store:browserStore(storage),fetch,repository,week:current,now});
  if(!totals)return say(messages.unanswered,true);
  const rows=weeklyRows(totals,current);
  if(!rows.length)return say(messages.none,!reachable);
  // An answer older than the time it is kept for is one GitHub would not renew.
  const old=now()-totals.at>=cacheTime;
  const kept=old?new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(totals.at)):null;
  status.hidden=true;if(retry)retry.hidden=true;
  drawGraph({document,elements,rows,current,note:caption(rows,current,{kept}),watch});
}

if(typeof document!=='undefined'){
  let storage;
  try{storage=localStorage;}catch{}
  document.getElementById('visitors-retry')?.addEventListener('click',()=>location.reload());
  showVisitorGraph({document,storage,fetch:(...request)=>fetch(...request),site:new URL('./',import.meta.url),
    watch(draw){
      const plot=document.getElementById('visitors-plot');
      let width=Math.floor(plot.clientWidth);
      // Only a change of width needs a new drawing: the height follows from it.
      new ResizeObserver(entries=>{const now=Math.floor(entries[0].contentRect.width);if(now!==width){width=now;draw();}}).observe(plot);
      document.fonts?.ready.then(draw).catch(()=>{});
    }}).catch(()=>{const status=document.getElementById('visitors-status');if(status){status.textContent=messages.failed;status.hidden=false;}});
}
