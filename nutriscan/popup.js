/* NutriScan v5 — Soft UI, dark/light mode, auto everything */
'use strict';

const GROQ_API   = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'openai/gpt-oss-120b';
const S_PROFILE  = 'nutriscan_profile';
const S_THEME    = 'nutriscan_theme';
const GROQ_KEY   = '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'; // ← paste your gsk_... key here

let profile = {};

const $  = id => document.getElementById(id);
const cg = k  => new Promise(r => chrome.storage.local.get(k, r));
const cs = o  => new Promise(r => chrome.storage.local.set(o, r));

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  $(`screen-${name}`).classList.remove('hidden');
  document.querySelectorAll('.nav-pill').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === name));
}
function showStep(name) {
  document.querySelectorAll('#screen-scan .step').forEach(s => s.classList.add('hidden'));
  $(`step-${name}`).classList.remove('hidden');
}
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
const delay = ms => new Promise(r => setTimeout(r, ms));

// ── progress ───────────────────────────────────
function setProgress(pct, sub) {
  $('progress-fill').style.width = pct + '%';
  $('progress-pct').textContent  = pct + '%';
  if (sub) $('auto-sub').textContent = sub;
}
function addStep(icon, text, state = 'active') {
  const d = document.createElement('div');
  d.className = `step-item ${state}`;
  d.innerHTML = `<span>${icon}</span><span>${text}</span>`;
  $('step-list').appendChild(d);
  return d;
}
function doneStep(el, text) {
  el.className = 'step-item done';
  el.innerHTML = `<span>✅</span><span>${text}</span>`;
}

// ══ INIT ══════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  await loadTheme();
  await loadProfile();
  bindEvents();
  autoRun();
});

// ── Theme ──────────────────────────────────────
async function loadTheme() {
  const d = await cg([S_THEME]);
  const t = d[S_THEME] || 'dark';
  applyTheme(t);
}
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  $('theme-toggle').querySelector('.theme-icon').textContent = t === 'dark' ? '☀️' : '🌙';
}
async function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  await cs({ [S_THEME]: next });
}

// ══ AUTO RUN ══════════════════════════════════
async function autoRun() {
  let tab;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch (_) { showStep('notfood'); return; }

  const url = tab?.url || '';
  const isSystem = !url || ['chrome://','chrome-extension://','about:','edge://','moz-extension://']
    .some(p => url.startsWith(p));

  if (isSystem) { showStep('notfood'); return; }

  showStep('auto');
  $('step-list').innerHTML = '';
  setProgress(5, 'Reading page…');

  const s1 = addStep('📄', 'Reading page content…');

  // Inject & scrape
  let scraped = null;
  try {
    let resp;
    try {
      resp = await chrome.tabs.sendMessage(tab.id, { action: 'scrape' });
    } catch (_) {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      await delay(200);
      resp = await chrome.tabs.sendMessage(tab.id, { action: 'scrape' });
    }
    if (resp?.ok) scraped = resp.data;
  } catch (_) { doneStep(s1, 'Could not read page'); showStep('notfood'); return; }

  doneStep(s1, 'Page read');
  setProgress(35, 'Identifying product…');

  // Quick food check
  const txt = ((scraped?.pageText || '') + (scraped?.productName || '')).toLowerCase().slice(0, 800);
  const foodWords = ['ingredient','nutrition','protein','fat','carb','kcal','calorie','sugar','sodium','serving','allergen','fibre','fiber'];
  const isFood = foodWords.some(w => txt.includes(w)) || (scraped?.structuredData || '').length > 20;

  if (!isFood && (scraped?.pageText || '').length < 150) {
    showStep('notfood'); return;
  }

  const s2 = addStep('🤖', 'AI analysing ingredients…');
  setProgress(60, 'Running analysis…');

  try {
    const result = await groqFromPage(scraped);
    doneStep(s2, 'Analysis complete');
    setProgress(100, 'Done!');
    if (result.not_food) { showStep('notfood'); return; }
    await delay(250);
    showStep('result');
    renderResult(result);
  } catch (err) {
    doneStep(s2, 'Analysis failed');
    showStep('result');
    $('result-content').innerHTML = errHTML(err.message);
  }
}

// ══ GROQ ══════════════════════════════════════
async function groqFromPage(pageData) {
  const prof = buildProfile();
  const sys = `You are an expert nutritionist and food scientist. Given scraped webpage data, identify the food product (use your training knowledge for branded products), analyse its ingredients, and return ONLY raw JSON with no markdown.`;
  const usr = `CONSUMER: ${prof}
URL: ${pageData?.url||''} | TITLE: ${pageData?.title||''} | PRODUCT: ${pageData?.productName||''}
META: ${pageData?.metaDesc||''}
STRUCTURED: ${(pageData?.structuredData||'').slice(0,800)}
PAGE TEXT: ${(pageData?.pageText||'').slice(0,3000)}

For branded Indian products (Amul, Lays, Maggi, Britannia etc.) use your training knowledge of that product's ingredients.
Return ONLY this JSON:
${jsonSchema()}`;
  return groqCall(sys, usr);
}

async function groqFromName(query) {
  const prof = buildProfile();
  const sys = `Expert nutritionist. Given a food product name, use training knowledge to recall its ingredients and analyse it. Return ONLY raw JSON.`;
  const usr = `CONSUMER: ${prof}\nPRODUCT: "${query}"\nReturn ONLY:\n${jsonSchema()}`;
  return groqCall(sys, usr);
}

async function groqFromIngredients(text) {
  const prof = buildProfile();
  const sys = `Expert nutritionist. Analyse this ingredient list for the consumer. Return ONLY raw JSON.`;
  const usr = `CONSUMER: ${prof}\nINGREDIENTS: ${text}\nReturn ONLY:\n${jsonSchema()}`;
  return groqCall(sys, usr);
}

function jsonSchema() {
  return `{
  "not_food": false,
  "product_name": "name",
  "brand": "brand or empty",
  "ingredients_summary": "key ingredients or nutritional profile",
  "verdict": "safe"|"caution"|"avoid",
  "verdict_title": "max 8 words",
  "verdict_reason": "1-2 sentences personalised",
  "allergen_alerts": [],
  "good_ingredients": ["ingredient — why good"],
  "concern_ingredients": ["ingredient — why bad"],
  "spikes": ["spike risks"],
  "deficiencies": ["nutritional gaps"],
  "personalised_insight": "2-3 tailored sentences",
  "consumption_advice": "specific guidance",
  "alternatives": [{"name":"","reason":"","badge":""}]
}
Notes: alternatives has 2-3 items if verdict is caution/avoid, empty if safe. If not a food page at all set not_food:true.`;
}

async function groqCall(system, user) {
  const res = await fetch(GROQ_API, {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${GROQ_KEY}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      max_tokens: 4000,
      temperature: 0.15,
      reasoning_effort: 'low',
      messages: [{ role:'system', content:system }, { role:'user', content:user }]
    })
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const b = await res.json(); msg = b.error?.message || msg; } catch(_) {}
    throw new Error(msg);
  }
  const data  = await res.json();
  const raw   = (data.choices?.[0]?.message?.content || '').trim();
  const start = raw.indexOf('{');
  const end   = raw.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('AI returned an unexpected response. Please try again.');
  try { return JSON.parse(raw.slice(start, end + 1)); }
  catch(_) { throw new Error('AI returned an unexpected response. Please try again.'); }
}

function buildProfile() {
  const p = profile;
  if (!p?.age && !p?.weight) return 'No profile — general Indian adult analysis.';
  const parts = [];
  if (p.age)    parts.push(`Age:${p.age}`);
  if (p.gender) parts.push(`Gender:${p.gender}`);
  if (p.weight && p.height) {
    const bmi = (parseFloat(p.weight)/Math.pow(parseFloat(p.height)/100,2)).toFixed(1);
    const cat = bmi<18.5?'Underweight':bmi<25?'Normal':bmi<30?'Overweight':'Obese';
    parts.push(`Weight:${p.weight}kg Height:${p.height}cm BMI:${bmi}(${cat})`);
  }
  if (p.activity) parts.push(`Activity:${p.activity}`);
  if (p.goal)     parts.push(`Goal:${p.goal}`);
  if (p.allergens?.length) parts.push(`Allergens:${p.allergens.join(',')}`);
  return parts.join(' | ');
}

// ══ RENDER ════════════════════════════════════
function renderResult(a) {
  const icons = { safe:'✅', caution:'⚠️', avoid:'🚫' };
  const v = a.verdict || 'caution';
  let html = '';

  // Name + brand
  html += `<div class="result-name">
    🏷️ ${esc(a.product_name || 'Product')}
    ${a.brand ? `<span class="result-brand">${esc(a.brand)}</span>` : ''}
  </div>`;

  // Ingredients
  if (a.ingredients_summary) {
    html += `<div class="ing-box">
      <div class="ing-lbl">📋 Ingredients / Nutrition</div>
      <div class="ing-text">${esc(a.ingredients_summary.slice(0,300))}${a.ingredients_summary.length>300?'…':''}</div>
    </div>`;
  }

  // Verdict
  html += `<div class="verdict-card ${esc(v)}">
    <div class="verdict-icon">${icons[v]||'⚠️'}</div>
    <div class="verdict-body">
      <h3>${esc(a.verdict_title||'Analysis Complete')}</h3>
      <p>${esc(a.verdict_reason||'')}</p>
    </div>
  </div>`;

  // Allergens
  if (a.allergen_alerts?.length) {
    html += `<div class="allergen-block">
      <div class="ablock-title">🚨 Allergen Alerts</div>
      <div class="tag-row">${a.allergen_alerts.map(x=>`<span class="tag r">⚠️ ${esc(x)}</span>`).join('')}</div>
    </div>`;
  }

  // Personalised insight
  if (a.personalised_insight)
    html += blk('👤 Personalised Insight', `<p>${esc(a.personalised_insight)}</p>`);

  // Metabolic
  const hs = a.spikes?.length, hd = a.deficiencies?.length;
  if (hs || hd) {
    let inner = '';
    if (hs) inner += `<div class="sub-lbl" style="color:var(--amber)">⬆ Blood Sugar Spikes</div>
      <div class="tag-row">${a.spikes.map(x=>`<span class="tag a">${esc(x)}</span>`).join('')}</div>`;
    if (hd) inner += `<div class="sub-lbl" style="color:var(--blue);${hs?'margin-top:10px':''}">⬇ Nutritional Gaps</div>
      <div class="tag-row">${a.deficiencies.map(x=>`<span class="tag b">${esc(x)}</span>`).join('')}</div>`;
    html += blk('📊 Metabolic Impact', inner);
  }

  if (a.good_ingredients?.length)
    html += blk("✅ What's Good", `<div class="tag-row">${a.good_ingredients.map(x=>`<span class="tag g">${esc(x)}</span>`).join('')}</div>`);

  if (a.concern_ingredients?.length)
    html += blk('⚠️ Watch Out For', `<div class="tag-row">${a.concern_ingredients.map(x=>`<span class="tag r">${esc(x)}</span>`).join('')}</div>`);

  if (a.consumption_advice)
    html += blk('💡 How Much to Consume', `<p>${esc(a.consumption_advice)}</p>`);

  // Alternatives
  const alts = (a.alternatives || []).filter(x => x.name);
  if (alts.length) {
    const emjs = ['🥗','🥛','🍎','🫘','🥜','🌾','🧃','🫐'];
    const items = alts.map((alt, i) => `
      <div class="alt-item">
        <div class="alt-emoji">${emjs[i % emjs.length]}</div>
        <div>
          <div class="alt-name">${esc(alt.name)}</div>
          <div class="alt-reason">${esc(alt.reason)}</div>
          ${alt.badge ? `<div class="alt-badge">${esc(alt.badge)}</div>` : ''}
        </div>
      </div>`).join('');
    html += `<div class="alt-block"><div class="ablock-title">💚 Healthier Alternatives</div><div class="ablock-body">${items}</div></div>`;
  }

  $('result-content').innerHTML = html;
}

function blk(title, inner) {
  return `<div class="ablock"><div class="ablock-title">${title}</div><div class="ablock-body">${inner}</div></div>`;
}

function errHTML(msg) {
  return `<div class="centre-state">
    <div class="big">❌</div>
    <h3>Analysis Failed</h3>
    <p>${esc(msg)}</p>
    <button class="btn btn-soft" style="width:auto;padding:9px 22px;margin-top:6px" onclick="location.reload()">↺ Try Again</button>
  </div>`;
}

// ══ EVENTS ════════════════════════════════════
function bindEvents() {
  // Nav
  document.querySelectorAll('.nav-pill').forEach(btn =>
    btn.addEventListener('click', () => showScreen(btn.dataset.tab)));

  // Theme
  $('theme-toggle').addEventListener('click', toggleTheme);

  // Not-food manual search
  $('manual-name').addEventListener('keydown', e => { if(e.key==='Enter') doNameSearch(); });
  $('btn-search-name').addEventListener('click', doNameSearch);

  // Result toolbar
  $('btn-rescan').addEventListener('click', () => {
    $('step-list').innerHTML = '';
    setProgress(0, '');
    autoRun();
  });
  $('btn-search-another').addEventListener('click', () => {
    $('search-input').value = '';
    showStep('search');
    setTimeout(() => $('search-input').focus(), 100);
  });

  // Search step
  $('btn-back-search').addEventListener('click', () => showStep('result'));
  $('search-input').addEventListener('keydown', e => { if(e.key==='Enter') doSearch(); });
  $('btn-do-search').addEventListener('click', doSearch);
  $('btn-paste-analyse').addEventListener('click', doPaste);

  // Profile
  $('p-weight').addEventListener('input', updateBMI);
  $('p-height').addEventListener('input', updateBMI);
  $('btn-add-allergen').addEventListener('click', addAllergen);
  $('custom-allergen').addEventListener('keydown', e => { if(e.key==='Enter') addAllergen(); });
  $('btn-save-profile').addEventListener('click', saveProfile);
  document.querySelectorAll('#allergen-chips .chip').forEach(c =>
    c.addEventListener('click', () => c.classList.toggle('active')));
}

// ── action handlers ────────────────────────────
async function runWithLoading(fn, loadingText) {
  showStep('auto');
  $('step-list').innerHTML = '';
  setProgress(20, loadingText);
  const s = addStep('🤖', 'AI analysing…');
  try {
    const r = await fn();
    doneStep(s, 'Done!');
    setProgress(100, '');
    await delay(200);
    if (r.not_food) { showStep('notfood'); return; }
    showStep('result');
    renderResult(r);
  } catch(err) {
    doneStep(s, 'Failed');
    showStep('result');
    $('result-content').innerHTML = errHTML(err.message);
  }
}

async function doNameSearch() {
  const q = $('manual-name').value.trim();
  if (!q) return;
  await runWithLoading(() => groqFromName(q), `Looking up "${q.slice(0,25)}…"`);
}
async function doSearch() {
  const q = $('search-input').value.trim();
  if (!q) { $('search-input').focus(); return; }
  await runWithLoading(() => groqFromName(q), `Searching "${q.slice(0,25)}…"`);
}
async function doPaste() {
  const t = $('paste-input').value.trim();
  if (!t) { $('paste-input').focus(); return; }
  await runWithLoading(() => groqFromIngredients(t), 'Analysing ingredient list…');
}

// ══ PROFILE ═══════════════════════════════════
async function loadProfile() {
  const d = await cg([S_PROFILE]);
  if (!d[S_PROFILE]) return;
  profile = d[S_PROFILE];
  const p = profile;
  if(p.age)      $('p-age').value      = p.age;
  if(p.gender)   $('p-gender').value   = p.gender;
  if(p.weight)   $('p-weight').value   = p.weight;
  if(p.height)   $('p-height').value   = p.height;
  if(p.activity) $('p-activity').value = p.activity;
  if(p.goal)     $('p-goal').value     = p.goal;
  updateBMI();
  (p.allergens || []).forEach(a => {
    const c = document.querySelector(`#allergen-chips .chip[data-a="${CSS.escape(a)}"]`);
    if(c) c.classList.add('active'); else addChip(a);
  });
}

function updateBMI() {
  const w = parseFloat($('p-weight').value);
  const h = parseFloat($('p-height').value) / 100;
  const numEl = $('bmi-number'), badge = $('bmi-badge');
  if(!w || !h) {
    numEl.textContent='—'; numEl.style.color='var(--muted)';
    badge.textContent='Enter details'; badge.style.cssText=''; return;
  }
  const bmi = (w/(h*h)).toFixed(1);
  numEl.textContent = bmi;
  const [,label,color,bg,border] = [
    [18.5,'Underweight',   'var(--blue)',  'var(--blue-soft)',  'rgba(147,197,253,.3)'],
    [25,  'Normal weight', 'var(--green)', 'var(--green-soft)', 'rgba(94,234,212,.3)'],
    [30,  'Overweight',    'var(--amber)', 'var(--amber-soft)', 'rgba(251,191,36,.3)'],
    [999, 'Obese',         'var(--red)',   'var(--red-soft)',   'rgba(251,113,133,.3)'],
  ].find(([lim]) => bmi < lim);
  numEl.style.color = color;
  badge.textContent = label;
  badge.style.background = bg;
  badge.style.color = color;
  badge.style.borderColor = border;
}

function addAllergen() {
  const i = $('custom-allergen'), v = i.value.trim().toLowerCase();
  if(!v) return; addChip(v); i.value = '';
}
function addChip(val) {
  const c = $('allergen-chips');
  if(c.querySelector(`[data-a="${CSS.escape(val)}"]`)) return;
  const chip = document.createElement('div');
  chip.className = 'chip active'; chip.dataset.a = val; chip.textContent = `⚠️ ${val}`;
  chip.addEventListener('click', () => chip.classList.toggle('active'));
  c.appendChild(chip);
}

async function saveProfile() {
  profile = {
    age:      $('p-age').value.trim(),
    gender:   $('p-gender').value,
    weight:   $('p-weight').value.trim(),
    height:   $('p-height').value.trim(),
    activity: $('p-activity').value,
    goal:     $('p-goal').value,
    allergens: Array.from(document.querySelectorAll('#allergen-chips .chip.active'))
                    .map(c => c.dataset.a).filter(Boolean)
  };
  await cs({ [S_PROFILE]: profile });

  // ── Animate save button ──
  const btn = $('btn-save-profile');
  btn.classList.add('saved');
  btn.querySelector('.save-icon').textContent = '✅';
  btn.querySelector('.save-label').textContent = 'Saved!';

  setTimeout(() => {
    btn.classList.remove('saved');
    btn.querySelector('.save-icon').textContent = '💾';
    btn.querySelector('.save-label').textContent = 'Save Profile';
  }, 2500);
}
