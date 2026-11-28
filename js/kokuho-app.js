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
kumamoto: { label: '熊本市', roundingUnit: 1},
'tokyo-chiyoda': { label: '千代田区', roundingUnit: 1},
'tokyo-chuo': { label: '中央区', roundingUnit: 1},
'tokyo-minato': { label: '港区', roundingUnit: 1},
'tokyo-shinjuku': { label: '新宿区', roundingUnit: 1},
'tokyo-bunkyo': { label: '文京区', roundingUnit: 1},
'tokyo-taito': { label: '台東区', roundingUnit: 1},
'tokyo-sumida': { label: '墨田区', roundingUnit: 1},
'tokyo-koto': { label: '江東区', roundingUnit: 1},
'tokyo-shinagawa': { label: '品川区', roundingUnit: 1},
'tokyo-meguro': { label: '目黒区', roundingUnit: 1},
'tokyo-ota': { label: '大田区', roundingUnit: 1},
'tokyo-setagaya': { label: '世田谷区', roundingUnit: 1},
'tokyo-shibuya': { label: '渋谷区', roundingUnit: 1},
'tokyo-nakano': { label: '中野区', roundingUnit: 1},
'tokyo-suginami': { label: '杉並区', roundingUnit: 1},
'tokyo-toshima': { label: '豊島区', roundingUnit: 1},
'tokyo-kita': { label: '北区', roundingUnit: 1},
'tokyo-arakawa': { label: '荒川区', roundingUnit: 1},
'tokyo-itabashi': { label: '板橋区', roundingUnit: 1},
'tokyo-nerima': { label: '練馬区', roundingUnit: 1},
'tokyo-adachi': { label: '足立区', roundingUnit: 1},
'tokyo-katsushika': { label: '葛飾区', roundingUnit: 1},
'tokyo-edogawa': { label: '江戸川区', roundingUnit: 1},
'osaka-kishiwada': { label: '岸和田市', roundingUnit: 1},
'osaka-toyonaka': { label: '豊中市', roundingUnit: 1},
'osaka-ikeda': { label: '池田市', roundingUnit: 1},
'osaka-suita': { label: '吹田市', roundingUnit: 1},
'osaka-izumiotsu': { label: '泉大津市', roundingUnit: 1},
'osaka-takatsuki': { label: '高槻市', roundingUnit: 1},
'osaka-kaizuka': { label: '貝塚市', roundingUnit: 1},
'osaka-moriguchi': { label: '守口市', roundingUnit: 1},
'osaka-hirakata': { label: '枚方市', roundingUnit: 1},
'osaka-ibaraki': { label: '茨木市', roundingUnit: 1},
'osaka-yao': { label: '八尾市', roundingUnit: 1},
'osaka-izumisano': { label: '泉佐野市', roundingUnit: 1},
'osaka-tondabayashi': { label: '富田林市', roundingUnit: 1},
'osaka-neyagawa': { label: '寝屋川市', roundingUnit: 1},
'osaka-kawachinagano': { label: '河内長野市', roundingUnit: 1},
'osaka-matsubara': { label: '松原市', roundingUnit: 1},
'osaka-daito': { label: '大東市', roundingUnit: 1},
'osaka-izumi': { label: '和泉市', roundingUnit: 1},
'osaka-minoh': { label: '箕面市', roundingUnit: 1},
'osaka-kashiwara': { label: '柏原市', roundingUnit: 1},
'osaka-habikino': { label: '羽曳野市', roundingUnit: 1},
'osaka-kadoma': { label: '門真市', roundingUnit: 1},
'osaka-settsu': { label: '摂津市', roundingUnit: 1},
'osaka-takaishi': { label: '高石市', roundingUnit: 1},
'osaka-fujiidera': { label: '藤井寺市', roundingUnit: 1},
'osaka-higashiosaka': { label: '東大阪市', roundingUnit: 1},
'osaka-sennan': { label: '泉南市', roundingUnit: 1},
'osaka-shijonawate': { label: '四條畷市', roundingUnit: 1},
'osaka-katano': { label: '交野市', roundingUnit: 1},
'osaka-osakasayama': { label: '大阪狭山市', roundingUnit: 1},
'osaka-hannan': { label: '阪南市', roundingUnit: 1},
'osaka-shimamoto': { label: '島本町', roundingUnit: 1},
'osaka-toyono': { label: '豊能町', roundingUnit: 1},
'osaka-nose': { label: '能勢町', roundingUnit: 1},
'osaka-tadaoka': { label: '忠岡町', roundingUnit: 1},
'osaka-kumatori': { label: '熊取町', roundingUnit: 1},
'osaka-tajiri': { label: '田尻町', roundingUnit: 1},
'osaka-misaki': { label: '岬町', roundingUnit: 1},
'osaka-taishi': { label: '太子町', roundingUnit: 1},
'osaka-kanan': { label: '河南町', roundingUnit: 1},
'osaka-chihayaakasaka': { label: '千早赤阪村', roundingUnit: 1},
toyota: { label: '豊田市', roundingUnit: 100},
toyama: { label: '富山市', roundingUnit: 10},
yamagata: { label: '山形市', roundingUnit: 100},
himeji: { label: '姫路市', roundingUnit: 10},
matsuyama: { label: '松山市', roundingUnit: 10},
takamatsu: { label: '高松市', roundingUnit: 100},
wakayama: { label: '和歌山市', roundingUnit: 10},
kagoshima: { label: '鹿児島市', roundingUnit: 100},
oita: { label: '大分市', roundingUnit: 100},
miyazaki: { label: '宮崎市', roundingUnit: 100},
nagasaki: { label: '長崎市', roundingUnit: 100},
nara: { label: '奈良市', roundingUnit: 100},
kurashiki: { label: '倉敷市', roundingUnit: 1},
amagasaki: { label: '尼崎市', roundingUnit: 1},
nishinomiya: { label: '西宮市', roundingUnit: 1},
kanazawa: { label: '金沢市', roundingUnit: 1},
nagano: { label: '長野市', roundingUnit: 10},
kurume: { label: '久留米市', roundingUnit: 100},
kawagoe: { label: '川越市', roundingUnit: 100},
machida: { label: '町田市', roundingUnit: 100},
kashiwa: { label: '柏市', roundingUnit: 100},
okazaki: { label: '岡崎市', roundingUnit: 100},
asahikawa: { label: '旭川市', roundingUnit: 10},
iwaki: { label: 'いわき市', roundingUnit: 100},
mito: { label: '水戸市', roundingUnit: 100}
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
'<div class="field nagoya-extra kobe-extra"><label>扶養家族（障害者控除の対象）の人数</label><input type="number" class="m-dep-d" value="' + (v.depD || 0) + '" min="0" step="1" inputmode="numeric"></div>' +
'<div class="field nagoya-extra kobe-extra"><label>本人控除（障害者・寡婦・ひとり親）</label><select class="m-self"><option value="0">なし</option><option value="1"' + (v.selfCredit? ' selected': '') + '>あり</option></select></div>' +
'<button type="button" class="danger m-remove">このメンバーを削除</button>';
row.querySelector('.m-remove').addEventListener('click', function () {
row.remove();
});
el('members').appendChild(row);
refreshCityExtras();
}

function refreshCityExtras() {
/* 名古屋市は扶養家族数・障害者扶養・本人控除、神戸市は障害者扶養・本人控除の入力欄を表示する */
var extras = document.querySelectorAll('.nagoya-extra, .kobe-extra');
for (var i = 0; i < extras.length; i++) {
var show = (extras[i].classList.contains('nagoya-extra') && cityKey === 'nagoya') ||
(extras[i].classList.contains('kobe-extra') && cityKey === 'kobe');
extras[i].style.display = show? '': 'none';
}
var sendai = document.querySelectorAll('.sendai-only');
for (var j = 0; j < sendai.length; j++) sendai[j].style.display = (cityKey === 'sendai' || cityKey === 'osaka' || cityKey === 'sakai' || cityKey === 'kyoto' || cityKey === 'chiba' || cityKey === 'shizuoka' || cityKey === 'hamamatsu' || cityKey === 'okayama' || cityKey === 'toyama' || cityKey === 'kagoshima' || cityKey === 'oita' || cityKey === 'nagasaki' || cityKey === 'nara' || cityKey === 'kurashiki' || cityKey === 'nishinomiya' || cityKey === 'kanazawa' || cityKey === 'nagano' || cityKey === 'kurume' || cityKey === 'kashiwa' || cityKey === 'asahikawa' || cityKey.indexOf('osaka-') === 0)? '': 'none';
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
if (kind === 'salary') income = window.KokuhoEngine.salaryIncome(amount, 'r7');
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
lines.push('【計算過程】');
var rr = cityData.rate_record;
var compLabels = { medical: '医療分', support: '後期高齢者支援金分', care: '介護分', child: '子ども・子育て支援金分' };
lines.push('・賦課のもとになる判定所得の合計: ' + yen(result.judgementIncome) + '。区分ごとの所得割は、各被保険者の所得から基礎控除（原則 ' + yen((rr.base_deduction && rr.base_deduction.amount) || 430000) + '。ただし、合計所得金額が2,400万円を超えると段階的に減額され、2,500万円を超えると0円になります）を引いた額に所得割率を掛けて計算します（区分ごとの所得割・均等割の内訳はエンジンの結果に含まれないため、式の一般形で示します）。');
['medical', 'support', 'care', 'child'].forEach(function (key) {
var c = rr.components[key];
if (!c || result.components[key] === undefined) return;
var s = '・' + compLabels[key] + ': 所得割率 ' + (Math.round(c.income_rate * 10000) / 100) + '%／均等割 ' + yen(c.per_capita || 0);
if (c.per_capita_adult_addon) s += '（大人1人あたり加算 ' + yen(c.per_capita_adult_addon) + '）';
if (c.per_household) s += '／平等割 ' + yen(c.per_household);
if (c.cap) s += '／賦課限度額 ' + yen(c.cap);
s += ' → 区分の金額 ' + yen(result.components[key]);
lines.push(s);
});
lines.push('・各区分とも、所得割＋均等割（＋平等割）を合算し、賦課限度額を上限として、区分ごとに ' + CITIES[cityKey].roundingUnit + '円未満を切り捨ててから合計します。');
if (result.reductionRate > 0) lines.push('・法定軽減: 均等割・平等割に ' + Math.round(result.reductionRate * 10) + '割の軽減を適用（判定所得と世帯人数・就業者数から判定。1人当たりの減額額は円未満切り上げ）。');
if (result.adjustment) lines.push('・世帯類型などによる調整額: −' + yen(result.adjustment));
lines.push('・根拠: 料率は' + CITIES[cityKey].label + 'の令和8年度の公式料率' + (cityData.official_pages && cityData.official_pages.rate_page ? '（公式ページ ' + cityData.official_pages.rate_page + '）' : '（自治体公式ページで確認）'));
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
