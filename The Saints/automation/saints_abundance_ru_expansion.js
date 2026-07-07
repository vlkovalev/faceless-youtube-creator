// saints_abundance_ru_expansion.js
'use strict';

const fs = require('fs');
const path = require('path');
const { SAINTS_ROOT } = require('./channel_paths');

const MIN_WORDS = 800; // Russian word count threshold is lower than English due to synthetic grammar and inflections
const assignments = {
  61: [
    { book: 19, chapter: 22, ref: "Псалом 22" },
    { book: 19, chapter: 90, ref: "Псалом 90" },
    { book: 19, chapter: 120, ref: "Псалом 120" },
    { book: 19, chapter: 144, ref: "Псалом 144" }
  ],
  62: [
    { book: 19, chapter: 33, ref: "Псалом 33" },
    { book: 40, chapter: 6, ref: "Евангелие от Матфея 6" }
  ],
  63: [
    { book: 1, chapter: 26, ref: "Бытие 26" }
  ],
  64: [
    { book: 2, chapter: 16, ref: "Исход 16" }
  ],
  65: [
    { book: 11, chapter: 17, ref: "3-я Царств 17" }
  ],
  66: [
    { book: 40, chapter: 14, ref: "Евангелие от Матфея 14" }
  ],
  67: [
    { book: 47, chapter: 9, ref: "2-е Коринфянам 9" },
    { book: 44, chapter: 4, ref: "Деяния 4" }
  ],
  68: [
    { book: 53, chapter: 3, ref: "2-е Фессалоникийцам 3" },
    { book: 20, chapter: 6, ref: "Притчи 6" },
    { book: 19, chapter: 127, ref: "Псалом 127" }
  ]
};

const prayerSupplements = {
  61: 'Господи Иисусе Христе, Сыне Бога живаго, научивший нас просить у Отца хлеб наш насущный на каждый день. Благослови дела рук моих; направь меня к любому доброму делу и не допусти, чтобы я нуждался в необходимом. Дай мне ту меру, которая полезна для меня, и научи меня быть довольным ею. Ты, благословивший пять хлебов для насыщения тысяч, благослови и то малое, что есть у меня, чтобы его было довольно. Ибо Твое есть Царство, сила и слава вовеки. Аминь.',
  62: 'Господи Иисусе Христе, Ты знаешь нужду мою прежде, чем я скажу о ней. Не попусти отчаянию овладеть моим сердцем. Даруй мне веру искать прежде Царства Твоего, мужество просить о помощи и терпение продолжать честный труд. Ты — Пастырь мой; не оставляй меня. Аминь.',
  63: 'Господи, не отними усердия от рук моих, но благослови труды их, чтобы они не были тщетными. Научи меня сеять с верою, не пытаясь властвовать над жатвой. Избавь меня от зависти при виде чужого успеха и от гордости, когда мои собственные труды приносят плод. Аминь.',
  64: 'Отче, хлеб наш насущный дай нам на сей день. Научи нас собирать сегодняшнюю долю без страха и скопидомства и уповать на Тебя, когда Ты повелишь успокоиться. Сохрани нас благодарными за скромное пропитание и помнящими о каждом ближнем, чей стол пуст. Аминь.',
  65: 'Господи Иисусе Христе, приди в скорбь мою и не отврати лица Твоего от меня. Умножь мою веру, даже когда оставшееся кажется ничтожным. Дай мне мудрость делиться без гордости, принимать помощь без стыда и познавать Твою заботу изо дня в день. Аминь.',
  66: 'Господи, прими то малое, что мы отдаем в Твои руки. Благослови это во благо другим и даруй нам готовность нести обычный труд служения, раздачи и помощи. Сохрани нас от искания зрелищ при уклонении от дел любви. Аминь.',
  67: 'Благодарю Тебя, Господи, что по милости Твоей Ты восполняешь наши нужды. Не дай мне забыть Тебя во время изобилия. Даруй мне щедрое сердце, чтобы, получив из Твоей руки, я не закрывал ее перед моим ближним. Аминь.',
  68: 'Господи, дай мне с душевным спокойствием встретить всё, что принесёт мне этот день. Направь и поддержи меня во всём. Даруй мне силы перенести утомление честного труда, мудрость просить о помощи в безработице и свободу как от праздности, так и от тревожной самонадеянности. Аминь.'
};

function loadScript(id, file) {
  const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const match = raw.match(new RegExp(`window\\.SAINTS_SCRIPTS\\[${id}\\]\\s*=\\s*(\\{[\\s\\S]+\\})\\s*;?\\s*$`));
  if (!match) throw new Error(`Could not parse ${file}`);
  return JSON.parse(match[1]);
}

async function fetchPassage(book, chapter, ref) {
  const url = `https://bolls.life/get-chapter/SYNOD/${book}/${chapter}/`;
  console.log(`Fetching ${ref} from ${url}...`);
  const response = await fetch(url, { headers: { 'user-agent': 'The Saints production agent/1.0' } });
  if (!response.ok) throw new Error(`${ref} returned HTTP ${response.status}`);
  const verses = await response.json();
  if (!Array.isArray(verses) || !verses.length) throw new Error(`No verses returned for ${ref}`);
  
  // Format verses
  const text = verses.map(verse => `${ref} глава ${chapter}, стих ${verse.verse}. ${String(verse.text).replace(/<[^>]*>?/gm, '').trim()}`).join(' ');
  return { reference: ref, url, text };
}

(async () => {
  const backupDir = path.join(SAINTS_ROOT, 'scripts', '_abundance_ru_short_backups');
  fs.mkdirSync(backupDir, { recursive: true });
  
  const report = {
    generated_at: new Date().toISOString(),
    series: 'Live in Abundance (RU)',
    minimum_words: MIN_WORDS,
    videos: []
  };

  for (const [idText, refs] of Object.entries(assignments)) {
    const id = Number(idText);
    const file = path.join(SAINTS_ROOT, 'scripts', `saints_video_${id}_data.js`);
    const backup = path.join(backupDir, `saints_video_${id}_data_pre_expansion.js`);
    
    if (!fs.existsSync(backup)) {
      fs.copyFileSync(file, backup);
    }
    
    const script = loadScript(id, backup);
    const passages = [];
    for (const item of refs) {
      passages.push(await fetchPassage(item.book, item.chapter, item.ref));
    }
    
    const reading = `Сейчас мы полностью прослушаем назначенное чтение Священного Писания. ${passages.map(item => `${item.reference}. ${item.text}`).join(' ')}`;
    script.scenes[1].voiceover = `${script.scenes[1].voiceover} ${reading}`;
    script.scenes[5].voiceover = `${script.scenes[5].voiceover} ${prayerSupplements[id]}`;
    script.video.status = 'expanded_full_length_source_verified';
    script.production_notes.source_policy = 'Russian Synodal Bible chapter readings via bolls.life API; original abundance book prayers.';
    script.production_notes.source_urls = passages.map(item => item.url);
    
    const words = script.scenes.reduce((sum, scene) => sum + String(scene.voiceover || '').split(/\s+/).filter(Boolean).length, 0);
    if (words < MIN_WORDS) {
      throw new Error(`Video ${id} has ${words} words; minimum is ${MIN_WORDS}.`);
    }
    
    fs.writeFileSync(file, `window.SAINTS_SCRIPTS = window.SAINTS_SCRIPTS || {};\nwindow.SAINTS_SCRIPTS[${id}] = ${JSON.stringify(script, null, 2)};\n`, 'utf8');
    report.videos.push({
      id,
      title: script.video.title,
      references: passages.map(item => item.reference),
      word_count: words,
      script_path: file
    });
  }
  
  const reportPath = path.join(SAINTS_ROOT, 'metadata', 'saints_abundance_ru_expansion_report.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify(report, null, 2));
})().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
