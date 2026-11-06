// A general pronunciation guide for word study: how to read the Bahá'í
// transliteration of Persian and Arabic, and how English sounds are written
// and said for Persian and Arabic speakers. Static reference content.

const row=(...cells)=>`<tr>${cells.map(cell=>`<td>${cell}</td>`).join('')}</tr>`;
const fa=text=>`<span lang="fa" dir="rtl">${text}</span>`;

const transliteration=`<section id="guide-transliteration" class="guide-section" lang="en">
<h3>Reading the transliteration (Persian and Arabic in Latin letters)</h3>
<p>The pronunciations under original words follow the Bahá'í transliteration system. Many letters sound differently in Persian and in Arabic; Persian pronunciation is given first.</p>
<table class="guide-table"><thead><tr><th>Written</th><th>Sounds like</th><th>Example</th></tr></thead><tbody>
${row('a','short, as in <b>cat</b>','<i>Rahmán</i> '+fa('رحمان'))}
${row('á','long, as in <b>father</b>; in Persian close to <b>law</b>','<i>Bahá</i> '+fa('بهاء'))}
${row('i','short, as in <b>sit</b>; in Persian often as in <b>bed</b>','<i>Lawḥ-i-Tarbíyat</i>')}
${row('í','long, as in <b>machine</b>','<i>iláhí</i> '+fa('الهی'))}
${row('u','short, as in <b>put</b>; in Persian often as in <b>go</b>','<i>Muḥammad</i>')}
${row('ú','long, as in <b>moon</b>','<i>núr</i> '+fa('نور'))}
${row('aw, ay','as in <b>now</b> (Persian: <b>go</b>) and <b>day</b>','<i>Lawḥ</i>, <i>Ḥusayn</i>')}
${row('‘','‘ayn: in Arabic a tightening deep in the throat; in Persian a brief catch or a lengthened vowel','<i>‘Abdu’l-Bahá</i> '+fa('عبدالبهاء'))}
${row('’','hamza: a short catch in the voice, as in <b>uh-oh</b>','<i>Bahá’í</i>')}
${row('ḥ','a breathy <b>h</b> from the throat; in Persian a plain <b>h</b>','<i>Ḥaḍrat</i> '+fa('حضرت'))}
${row('kh','as in Scottish <b>loch</b>, German <b>Bach</b>','<i>Khudá</i> '+fa('خدا'))}
${row('gh, q','a throaty sound like French <b>r</b>; Arabic <b>q</b> is a deep <b>k</b>, which Persian says like <b>gh</b>','<i>Qur’án</i>, <i>ghayb</i>')}
${row('sh, ch, zh','as in <b>ship</b>, <b>church</b>, and the <b>s</b> in <b>measure</b> (ch and zh are Persian only)','<i>shams</i>, <i>chih</i>')}
${row('th','in Arabic as in <b>think</b>; in Persian <b>s</b>','<i>thábit</i>')}
${row('dh','in Arabic as in <b>this</b>; in Persian <b>z</b>','<i>dhikr</i>')}
${row('ṣ, ṭ','“heavy” <b>s</b> and <b>t</b> with the tongue pulled back; in Persian plain <b>s</b>, <b>t</b>','<i>ṣabr</i>, <i>ṭáhir</i>')}
${row('ḍ, ẓ','“heavy” <b>d</b> and <b>z</b> in Arabic; in Persian both are <b>z</b>','<i>Ḥaḍrat</i>, <i>ẓuhúr</i>')}
${row('v, w','the letter '+fa('و')+' is <b>v</b> in Persian, <b>w</b> in Arabic','<i>va</i> / <i>wa</i> (“and”)')}
${row('doubled letters','held a little longer','<i>aḥibbá</i>')}
${row('-i-','the Persian <i>izáfih</i>, linking “of”: noun-i-noun','<i>Lawḥ-i-Tarbíyat</i>, Tablet <i>of</i> Education')}
${row('al-, ash-, ar-…','the Arabic article; before s, sh, t, d, r, z, n and similar it takes the next sound','<i>ar-Raḥmán</i>, <i>ash-Shams</i>')}
</tbody></table>
<p>Stress usually falls on a long vowel or on the last syllable of a Persian word: <i>Bahá</i>, <i>tarbíyat</i>.</p>
</section>`;

const persian=`<section id="guide-persian" class="guide-section" lang="fa" dir="rtl">
<h3>راهنمای تلفظ انگلیسی برای فارسی‌زبانان</h3>
<p>زیر هر واژهٔ انگلیسی، تلفظ تقریبی آن با حروف فارسی آمده است. این صداهای انگلیسی در فارسی نیستند یا فرق دارند:</p>
<table class="guide-table"><thead><tr><th>انگلیسی</th><th>چگونه ادا شود</th><th>نمونه</th></tr></thead><tbody>
${row('th (think)','نوک زبان میان دندان‌ها، بی‌صدا؛ مانند «ث» عربی، نه «ت» یا «س»','<span lang="en" dir="ltr">think, truth</span>')}
${row('th (this)','نوک زبان میان دندان‌ها، با صدا؛ مانند «ذ» عربی، نه «د» یا «ز»','<span lang="en" dir="ltr">the, this</span>')}
${row('w','لب‌ها گرد و بی‌آنکه دندان به لب بخورد؛ مانند «و» عربی در «وَلَد»، نه «و» فارسی','<span lang="en" dir="ltr">world, will</span>')}
${row('v','دندان‌های بالا روی لب پایین؛ همان «و» فارسی','<span lang="en" dir="ltr">love, very</span>')}
${row('r','زبان به سقف نمی‌خورد و نمی‌لرزد؛ نرم‌تر از «ر» فارسی','<span lang="en" dir="ltr">bring, rest</span>')}
${row('ng','«ن» تودماغی؛ «گ» پایانی معمولاً شنیده نمی‌شود','<span lang="en" dir="ltr">sing, king</span>')}
${row('a (cat)','میان «اَ» و «اِ»، دهان بازتر از «اِ»','<span lang="en" dir="ltr">man, hath</span>')}
${row('u (cup)','«اَ» کوتاه و گرفته','<span lang="en" dir="ltr">love, but</span>')}
${row('i (sit) / ee (see)','کوتاه مانند «اِ» تند در برابر «ای» کشیده؛ فرق معنایی دارند','<span lang="en" dir="ltr">live / leave</span>')}
${row('o (go), ay (day)','دو صدا پشت سر هم: «اُو» و «اِی»','<span lang="en" dir="ltr">soul, praise</span>')}
</tbody></table>
<p>خوشه‌های آغازین را بی‌مصوت پیشین بگویید: <span lang="en" dir="ltr">school, spirit</span> «سکول»، «سپیریت»، نه «اِسکول». در انگلیسی بسیاری از حروف خوانده نمی‌شوند (<span lang="en" dir="ltr">knight, write, hour</span>) و تکیه معمولاً روی هجای اول است.</p>
</section>`;

const arabic=`<section id="guide-arabic" class="guide-section" lang="ar" dir="rtl">
<h3>دليل نطق الإنجليزية للناطقين بالعربية</h3>
<p>تحت كل كلمة إنجليزية نطقها التقريبي بحروف عربية. هذه أصوات إنجليزية لا توجد في العربية أو تختلف عنها:</p>
<table class="guide-table"><thead><tr><th>بالإنجليزية</th><th>طريقة النطق</th><th>مثال</th></tr></thead><tbody>
${row('p','باء مهموسة مع نفخة هواء، لا باء مجهورة؛ تُكتب «ب» (پ)','<span lang="en" dir="ltr">peace, people</span>')}
${row('v','الأسنان العليا على الشفة السفلى مع اهتزاز الصوت؛ فاء مجهورة، تُكتب «ف» (ڤ)','<span lang="en" dir="ltr">love, very</span>')}
${row('g (go)','جيم مصرية أو قاف بدوية؛ تُكتب «غ» أو «ج» (گ)','<span lang="en" dir="ltr">God, give</span>')}
${row('ch, j','«تش» كما في «تشاي»، و«دج» كما في الجيم الفصيحة','<span lang="en" dir="ltr">church, joy</span>')}
${row('s (measure)','جيم شامية خفيفة (ژ)','<span lang="en" dir="ltr">vision, measure</span>')}
${row('th','مثل الثاء (think) والذال (this) تماماً','<span lang="en" dir="ltr">truth, the</span>')}
${row('r','لا يلمس اللسانُ سقف الفم ولا يتكرر؛ أخف من الراء العربية','<span lang="en" dir="ltr">bring, rest</span>')}
${row('e (bed), o (hot)','حركات بين الفتحة والكسرة وبين الفتحة والضمة لا مقابل دقيق لها','<span lang="en" dir="ltr">bed, God</span>')}
${row('i (sit) / ee (see)','كسرة قصيرة مرتخية مقابل ياء ممدودة؛ يتغير المعنى بينهما','<span lang="en" dir="ltr">live / leave</span>')}
${row('o (go), ay (day)','صوتان متتابعان: «أو» و«إي»','<span lang="en" dir="ltr">soul, praise</span>')}
</tbody></table>
<p>تُنطق الكلمات التي تبدأ بحرفين ساكنين دون همزة قبلها: <span lang="en" dir="ltr">street, spirit</span> «ستريت»، «سبيريت»، لا «إستريت». كثير من الحروف الإنجليزية لا يُنطق (<span lang="en" dir="ltr">knight, write, hour</span>)، والنبر غالباً على المقطع الأول.</p>
</section>`;

export function pronunciationGuideHtml(){
  return `<h2 id="pronunciation-guide-title">Pronunciation guide</h2>
<nav class="guide-tabs" aria-label="Guide sections"><a href="#guide-transliteration">Transliteration</a><a href="#guide-persian" lang="fa">فارسی</a><a href="#guide-arabic" lang="ar">العربية</a></nav>
${transliteration}${persian}${arabic}
<p class="guide-note">A general guide to approximate sounds; dialects and individual words vary. Dictionary pronunciations are approximate too.</p>
<div class="dictionary-close"><button type="button" class="secondary" id="pronunciation-guide-close">Close</button></div>`;
}

export function openPronunciationGuide(section=''){
  let dialog=document.getElementById('pronunciation-guide');
  if(!dialog){
    dialog=document.createElement('dialog');dialog.id='pronunciation-guide';dialog.className='dictionary-dialog pronunciation-guide';dialog.setAttribute('aria-labelledby','pronunciation-guide-title');
    dialog.innerHTML=pronunciationGuideHtml();document.body.append(dialog);
    dialog.addEventListener('click',event=>{
      if(event.target.id==='pronunciation-guide-close'||event.target===dialog){dialog.close();return;}
      const tab=event.target.closest('.guide-tabs a');if(tab){event.preventDefault();dialog.querySelector(tab.getAttribute('href'))?.scrollIntoView({block:'start'});}
    });
  }
  dialog.showModal();
  if(section)dialog.querySelector('#guide-'+section)?.scrollIntoView({block:'start'});
}
