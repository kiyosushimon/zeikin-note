/*
* 国民健康保険料シミュレーター — 画面側
* 料率は data/kokuho/<city>.json（公式ソースで確認・照合したデータ層）を読み込む。
* 公開するのは公式の計算例・早見表と照合済みの市だけ（CITIES）。
* 計算は js/kokuho-engine.js がブラウザ内で行う。入力値はサーバーへ送信しない。
*/
(function () {
'use strict';

var CITIES = {
nagoya: { label: '名古屋市', roundingUnit: 10},
osaka: { label: '大阪市', roundingUnit: 1},
sakai: { label: '堺市', roundingUnit: 1},
yokohama: { label: '横浜市', roundingUnit: 10},
kawasaki: { label: '川崎市', roundingUnit: 10},
kyoto: { label: '京都市', roundingUnit: 1},
kobe: { label: '神戸市', roundingUnit: 1},
chiba: { label: '千葉市', roundingUnit: 10},
shizuoka: { label: '静岡市', roundingUnit: 100},
kitakyushu: { label: '北九州市', roundingUnit: 10},
sagamihara: { label: '相模原市', roundingUnit: 100},
fukuoka: { label: '福岡市', roundingUnit: 100},
sapporo: { label: '札幌市', roundingUnit: 10},
sendai: { label: '仙台市', roundingUnit: 10},
saitama: { label: 'さいたま市', roundingUnit: 100},
niigata: { label: '新潟市', roundingUnit: 100},
hamamatsu: { label: '浜松市', roundingUnit: 100},
okayama: { label: '岡山市', roundingUnit: 1},
kumamoto: { label: '熊本市', roundingUnit: 1}
};
var COMP_LABEL = { medical: '医療分', support: '後期高齢者支援金分', care: '介護分', child: '子ども・子育て支援金分'};

var cityData = null;
var cityKey = 'nagoya';

function yen(n) { return n.toLocaleString('ja-JP') + '円';}
function el(id) { return document.getElementById(id);}
function esc(s) {
return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ---------- メンバー入力行 ---------- */

function addMemberRow(v) {
v = v || {};
var row = document.createElement('div');
row.className = 'dc-period member-row';
row.innerHTML =
'<div class="field"><label>年齢</label><input type="number" class="m-age" value="' + (v.age!== undefined? v.age: '') + '" min="0" max="120" step="1" inputmode="numeric"></div>' +
'<div class="field"><label>所得の種類</label><select class="m-kind">' +
'<option value="salary"' + (v.kind === 'salary'? ' selected': '') + '>給与収入</option>' +
'<option value="pension"' + (v.kind === 'pension'? ' selected': '') + '>年金収入</option>' +
'<option value="other"' + (v.kind === 'other'? ' selected': '') + '>その他の所得</option></select></div>' +
'<div class="field"><label>金額（円）</label><input type="number" class="m-amount" value="' + (v.amount!== undefined? v.amount: '') + '" min="0" step="10000" inputmode="numeric"></div>' +
'<div class="field"><label>未就学児</label><select class="m-preschool"><option value="0">いいえ</option><option value="1"' + (v.preschool? ' selected': '') + '>はい</option></select></div>' +
'<div class="field nagoya-extra"><label>扶養家族の人数</label><input type="number" class="m-dep-nd" value="' + (v.depNd || 0) + '" min="0" step="1" inputmode="numeric"></div>' +
'<div class="field nagoya-extra"><label>扶養家族（障害者控除の対象）の人数</label><input type="number" class="m-dep-d" value="' + (v.depD || 0) + '" min="0" step="1" inputmode="numeric"></div>' +
'<div class="field nagoya-extra"><label>本人控除（障害者・寡婦・ひとり親）</label><select class="m-self"><option value="0">なし</option><option value="1"' + (v.selfCredit? ' selected': '') + '>あり</option></select></div>' +
'<button type="button" class="danger m-remove">このメンバーを削除</button>';
row.querySelector('.m-remove').addEventListener('click', function () {
row.remove();
});
el('members').appendChild(row);
refreshCityExtras();
}

function refreshCityExtras() {
var showNagoya = cityKey === 'nagoya';
var extras = document.querySelectorAll('.nagoya-extra');
for (var i = 0; i < extras.length; i++) extras[i].style.display = showNagoya? '': 'none';
var sendai = document.querySelectorAll('.sendai-only');
for (var j = 0; j < sendai.length; j++) sendai[j].style.display = (cityKey === 'sendai' || cityKey === 'osaka' || cityKey === 'sakai' || cityKey === 'kyoto' || cityKey === 'chiba' || cityKey === 'shizuoka' || cityKey === 'hamamatsu' || cityKey === 'okayama')? '': 'none';
}

/* ---------- 入力の収集 ---------- */

function collectMembers() {
var rows = document.querySelectorAll('.member-row');
var members = [];
var errors = [];
for (var i = 0; i < rows.length; i++) {
var r = rows[i];
var age = parseInt(r.querySelector('.m-age').value, 10);
var kind = r.querySelector('.m-kind').value;
var amount = parseInt(r.querySelector('.m-amount').value, 10) || 0;
if (isNaN(age)) { errors.push((i + 1) + '人目の年齢を入力してください。'); continue;}
var income;
if (kind === 'salary') income = window.KokuhoEngine.salaryIncome(amount);
else if (kind === 'pension') income = window.KokuhoEngine.pensionIncome(amount, age);
else income = amount;
var judgement = income;
if (kind === 'pension' && age >= 65) judgement = Math.max(0, income - 150000);
members.push({
age: age,
income: income,
judgementIncome: judgement,
earner: (kind === 'salary' || kind === 'pension') && income > 0,
preschool: r.querySelector('.m-preschool').value === '1',
depNd: parseInt(r.querySelector('.m-dep-nd').value, 10) || 0,
depD: parseInt(r.querySelector('.m-dep-d').value, 10) || 0,
selfCredit: r.querySelector('.m-self').value === '1'
});
}
if (!rows.length) errors.push('メンバーを1人以上入力してください。');
return { members: members, errors: errors};
}

/* ---------- 結果の表示 ---------- */

function animateCounts(root) {
/* 金額は即時表示する（カウントアップ演出は廃止。data-valueの最終値をそのまま出す） */
var nodes = root.querySelectorAll('.count-up');
for (var i = 0; i < nodes.length; i++) {
var target = parseInt(nodes[i].getAttribute('data-value'), 10);
if (isFinite(target)) nodes[i].textContent = yen(target);
}
}

function render(result, input) {
var out = el('result');
var redLabel = result.reductionRate > 0
? '所得の低い世帯への軽減（' + Math.round(result.reductionRate * 10) + '割）が適用されています。'
: '所得の低い世帯への軽減は適用されませんでした。';
var html = '<h2>結果</h2><div class="summary">';
html += '<p>' + CITIES[cityKey].label + '・令和8年度の国民健康保険料（年額）: <span class="big count-up" data-value="' + result.total + '">' + yen(result.total) + '</span></p>';
html += '<p>月あたりの目安: 約 ' + yen(Math.round(result.total / 12)) + '</p>';
html += '<p class="small">' + redLabel + '</p>';
html += '</div>';
html += '<h3>区分ごとの内訳</h3><div class="table-wrap"><table><thead><tr><th>区分</th><th>金額</th></tr></thead><tbody>';
['medical', 'support', 'care', 'child'].forEach(function (k) {
html += '<tr><td>' + COMP_LABEL[k] + '</td><td>' + yen(result.components[k]) + '</td></tr>';
});
html += '<tr><td><strong>合計</strong></td><td><strong>' + yen(result.total) + '</strong></td></tr>';
html += '</tbody></table></div>';
html += '<div class="consult"><button type="button" id="copy-prompt" class="consult-btn"><span class="in-flex"><svg class="icon" viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>AIに相談する用の文をコピー</span></button>' +
'<p class="small">この計算結果をまとめた文をコピーします。ChatGPTやClaudeなど、自分のAIに貼ると、結果の意味や注意点を相談できます。貼る前に、個人が特定できる情報が含まれていないか確認してください。</p></div>';
out.innerHTML = html;
animateCounts(out);
el('copy-prompt').addEventListener('click', function () {
copyText(buildPrompt(result, input));
});
}

function buildPrompt(result, input) {
var lines = [];
lines.push('あなたは社会保険の仕組みに詳しい相談相手です。以下は、税金計算サイト「ぜいきんノート」の「国民健康保険料シミュレーター」で計算した私の試算結果です。この結果について、意味の解説と注意点を教えてください。');
lines.push('');
lines.push('');
lines.push('・自治体: ' + CITIES[cityKey].label + '（令和8年度の料率）');
lines.push('・世帯の人数: ' + input.members.length + '人（年齢: ' + input.members.map(function (m) { return m.age;}).join('歳・') + '歳）');
lines.push('');
lines.push('');
lines.push('・年間保険料: ' + yen(result.total) + '（月あたり約 ' + yen(Math.round(result.total / 12)) + '）');
lines.push('・内訳: 医療分 ' + yen(result.components.medical) + '／後期高齢者支援金分 ' + yen(result.components.support) + '／介護分 ' + yen(result.components.care) + '／子ども・子育て支援金分 ' + yen(result.components.child));
if (result.reductionRate > 0) lines.push('・所得の低い世帯への軽減（' + Math.round(result.reductionRate * 10) + '割）が適用されています。');
lines.push('');
lines.push('');
lines.push('1. この金額が決まる仕組みを、かみくだいて説明してください。');
lines.push('2. 退職して会社の健康保険から国民健康保険に切り替える場合、任意継続と比べて考えるべき点を教えてください。');
lines.push('3. 保険料を抑えるために合法的にできることがあれば教えてください。');
lines.push('');
lines.push('※これは一般的な仕組みの解説を求めるものです。最終的な確認はお住まいの自治体の窓口で行うよう、その旨も添えてください。');
return lines.join('\n');
}

function copyText(text) {
function done() { showToast('コピーしました。貼る前に、個人が特定できる情報が入っていないか確認してください');}
if (navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(text).then(done, function () { fallback();});
} else {
fallback();
}
function fallback() {
var ta = document.createElement('textarea');
ta.value = text;
ta.style.position = 'fixed';
ta.style.opacity = '0';
document.body.appendChild(ta);
ta.select();
try { document.execCommand('copy'); done();}
catch (e) { showToast('コピーできませんでした');}
document.body.removeChild(ta);
}
}

function showToast(msg) {
var t = el('toast');
if (!t) {
t = document.createElement('div');
t.id = 'toast';
t.className = 'toast';
document.body.appendChild(t);
}
t.textContent = msg;
t.classList.add('show');
window.clearTimeout(showToast._timer);
showToast._timer = window.setTimeout(function () { t.classList.remove('show');}, 2600);
}

/* ---------- 出典の表示 ---------- */

function renderSources() {
var box = el('sources');
if (!cityData) { box.innerHTML = '<p class="small">読み込み中…</p>'; return;}
var pages = cityData.official_pages || {};
var prov = cityData.provenance || {};
var ver = prov.verification || {};
var html = '<ul class="compact">';
html += '<li>料率: ' + esc(cityData.name) + 'の令和8年度の料率（' + esc(pages.notice_source || '自治体公式情報') + '）</li>';
if (pages.rate_page) html += '<li>公式ページ: <a href="' + esc(pages.rate_page) + '" target="_blank" rel="noopener">' + esc(pages.rate_page) + '</a></li>';
if (ver.status) {
html += '<li>照合: ' + esc(ver.status) + '（' + esc(ver.method || '') + (ver.verified_cases? '・' + ver.verified_cases + 'ケース': '') + '）</li>';
}
html += '</ul>';
box.innerHTML = html;
}

/* ---------- 計算の実行 ---------- */

function calculate() {
var errBox = el('form-error');
if (!cityData) {
errBox.innerHTML = '<div class="error">料率データを読み込み中です。少し待ってからもう一度押してください。</div>';
return;
}
var collected = collectMembers();
if (collected.errors.length) {
errBox.innerHTML = '<div class="error">' + collected.errors.map(esc).join('<br>') + '</div>';
return;
}
errBox.innerHTML = '';
var input = {
members: collected.members,
householdType: el('household-type').value
};
var result = window.KokuhoEngine.compute(cityData, { roundingUnit: CITIES[cityKey].roundingUnit}, input);
render(result, input);
}

function loadCity(key) {
cityKey = key;
cityData = null;
refreshCityExtras();
renderSources();
fetch('../data/kokuho/' + key + '.json')
.then(function (r) { return r.json();})
.then(function (json) {
cityData = json;
renderSources();
calculate();
})
.catch(function () {
el('form-error').innerHTML = '<div class="error">料率データ（data/kokuho/' + key + '.json）を読み込めませんでした。</div>';
});
}

/* ---------- 初期化 ---------- */

addMemberRow({ age: 45, kind: 'salary', amount: 6000000});
addMemberRow({ age: 42, kind: 'other', amount: 0});
addMemberRow({ age: 10, kind: 'other', amount: 0});
el('add-member').addEventListener('click', function () { addMemberRow({ kind: 'other', amount: 0});});
el('calc').addEventListener('click', calculate);
el('city').addEventListener('change', function () { loadCity(this.value);});
loadCity('nagoya');
})();
