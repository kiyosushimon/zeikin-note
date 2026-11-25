/* 退職後の健康保険 比較（国保 vs 任意継続・2年度またぎ） */
(function () {
'use strict';
var CITIES = [
{ file: 'nagoya', label: '名古屋市（愛知県）', roundingUnit: 10},
{ file: 'osaka', label: '大阪市（大阪府）', roundingUnit: 1},
{ file: 'sakai', label: '堺市（大阪府）', roundingUnit: 1},
{ file: 'yokohama', label: '横浜市（神奈川県）', roundingUnit: 10},
{ file: 'kawasaki', label: '川崎市（神奈川県）', roundingUnit: 10},
{ file: 'kyoto', label: '京都市（京都府）', roundingUnit: 1},
{ file: 'kobe', label: '神戸市（兵庫県）', roundingUnit: 1},
{ file: 'chiba', label: '千葉市（千葉県）', roundingUnit: 10},
{ file: 'shizuoka', label: '静岡市（静岡県）', roundingUnit: 100},
{ file: 'kitakyushu', label: '北九州市（福岡県）', roundingUnit: 10},
{ file: 'sagamihara', label: '相模原市（神奈川県）', roundingUnit: 100},
{ file: 'fukuoka', label: '福岡市（福岡県）', roundingUnit: 100},
{ file: 'sapporo', label: '札幌市（北海道）', roundingUnit: 10},
{ file: 'sendai', label: '仙台市（宮城県）', roundingUnit: 10},
{ file: 'saitama', label: 'さいたま市（埼玉県）', roundingUnit: 100},
{ file: 'niigata', label: '新潟市（新潟県）', roundingUnit: 100},
{ file: 'hamamatsu', label: '浜松市（静岡県）', roundingUnit: 100},
{ file: 'okayama', label: '岡山市（岡山県）', roundingUnit: 1},
{ file: 'kumamoto', label: '熊本市（熊本県）', roundingUnit: 1},
{ file: 'tokyo-chiyoda', label: '千代田区（東京都）', roundingUnit: 1},
{ file: 'tokyo-chuo', label: '中央区（東京都）', roundingUnit: 1},
{ file: 'tokyo-minato', label: '港区（東京都）', roundingUnit: 1},
{ file: 'tokyo-shinjuku', label: '新宿区（東京都）', roundingUnit: 1},
{ file: 'tokyo-bunkyo', label: '文京区（東京都）', roundingUnit: 1},
{ file: 'tokyo-taito', label: '台東区（東京都）', roundingUnit: 1},
{ file: 'tokyo-sumida', label: '墨田区（東京都）', roundingUnit: 1},
{ file: 'tokyo-koto', label: '江東区（東京都）', roundingUnit: 1},
{ file: 'tokyo-shinagawa', label: '品川区（東京都）', roundingUnit: 1},
{ file: 'tokyo-meguro', label: '目黒区（東京都）', roundingUnit: 1},
{ file: 'tokyo-ota', label: '大田区（東京都）', roundingUnit: 1},
{ file: 'tokyo-setagaya', label: '世田谷区（東京都）', roundingUnit: 1},
{ file: 'tokyo-shibuya', label: '渋谷区（東京都）', roundingUnit: 1},
{ file: 'tokyo-nakano', label: '中野区（東京都）', roundingUnit: 1},
{ file: 'tokyo-suginami', label: '杉並区（東京都）', roundingUnit: 1},
{ file: 'tokyo-toshima', label: '豊島区（東京都）', roundingUnit: 1},
{ file: 'tokyo-kita', label: '北区（東京都）', roundingUnit: 1},
{ file: 'tokyo-arakawa', label: '荒川区（東京都）', roundingUnit: 1},
{ file: 'tokyo-itabashi', label: '板橋区（東京都）', roundingUnit: 1},
{ file: 'tokyo-nerima', label: '練馬区（東京都）', roundingUnit: 1},
{ file: 'tokyo-adachi', label: '足立区（東京都）', roundingUnit: 1},
{ file: 'tokyo-katsushika', label: '葛飾区（東京都）', roundingUnit: 1},
{ file: 'tokyo-edogawa', label: '江戸川区（東京都）', roundingUnit: 1},
{ file: 'osaka-kishiwada', label: '岸和田市（大阪府）', roundingUnit: 1},
{ file: 'osaka-toyonaka', label: '豊中市（大阪府）', roundingUnit: 1},
{ file: 'osaka-ikeda', label: '池田市（大阪府）', roundingUnit: 1},
{ file: 'osaka-suita', label: '吹田市（大阪府）', roundingUnit: 1},
{ file: 'osaka-izumiotsu', label: '泉大津市（大阪府）', roundingUnit: 1},
{ file: 'osaka-takatsuki', label: '高槻市（大阪府）', roundingUnit: 1},
{ file: 'osaka-kaizuka', label: '貝塚市（大阪府）', roundingUnit: 1},
{ file: 'osaka-moriguchi', label: '守口市（大阪府）', roundingUnit: 1},
{ file: 'osaka-hirakata', label: '枚方市（大阪府）', roundingUnit: 1},
{ file: 'osaka-ibaraki', label: '茨木市（大阪府）', roundingUnit: 1},
{ file: 'osaka-yao', label: '八尾市（大阪府）', roundingUnit: 1},
{ file: 'osaka-izumisano', label: '泉佐野市（大阪府）', roundingUnit: 1},
{ file: 'osaka-tondabayashi', label: '富田林市（大阪府）', roundingUnit: 1},
{ file: 'osaka-neyagawa', label: '寝屋川市（大阪府）', roundingUnit: 1},
{ file: 'osaka-kawachinagano', label: '河内長野市（大阪府）', roundingUnit: 1},
{ file: 'osaka-matsubara', label: '松原市（大阪府）', roundingUnit: 1},
{ file: 'osaka-daito', label: '大東市（大阪府）', roundingUnit: 1},
{ file: 'osaka-izumi', label: '和泉市（大阪府）', roundingUnit: 1},
{ file: 'osaka-minoh', label: '箕面市（大阪府）', roundingUnit: 1},
{ file: 'osaka-kashiwara', label: '柏原市（大阪府）', roundingUnit: 1},
{ file: 'osaka-habikino', label: '羽曳野市（大阪府）', roundingUnit: 1},
{ file: 'osaka-kadoma', label: '門真市（大阪府）', roundingUnit: 1},
{ file: 'osaka-settsu', label: '摂津市（大阪府）', roundingUnit: 1},
{ file: 'osaka-takaishi', label: '高石市（大阪府）', roundingUnit: 1},
{ file: 'osaka-fujiidera', label: '藤井寺市（大阪府）', roundingUnit: 1},
{ file: 'osaka-higashiosaka', label: '東大阪市（大阪府）', roundingUnit: 1},
{ file: 'osaka-sennan', label: '泉南市（大阪府）', roundingUnit: 1},
{ file: 'osaka-shijonawate', label: '四條畷市（大阪府）', roundingUnit: 1},
{ file: 'osaka-katano', label: '交野市（大阪府）', roundingUnit: 1},
{ file: 'osaka-osakasayama', label: '大阪狭山市（大阪府）', roundingUnit: 1},
{ file: 'osaka-hannan', label: '阪南市（大阪府）', roundingUnit: 1},
{ file: 'osaka-shimamoto', label: '島本町（大阪府）', roundingUnit: 1},
{ file: 'osaka-toyono', label: '豊能町（大阪府）', roundingUnit: 1},
{ file: 'osaka-nose', label: '能勢町（大阪府）', roundingUnit: 1},
{ file: 'osaka-tadaoka', label: '忠岡町（大阪府）', roundingUnit: 1},
{ file: 'osaka-kumatori', label: '熊取町（大阪府）', roundingUnit: 1},
{ file: 'osaka-tajiri', label: '田尻町（大阪府）', roundingUnit: 1},
{ file: 'osaka-misaki', label: '岬町（大阪府）', roundingUnit: 1},
{ file: 'osaka-taishi', label: '太子町（大阪府）', roundingUnit: 1},
{ file: 'osaka-kanan', label: '河南町（大阪府）', roundingUnit: 1},
{ file: 'osaka-chihayaakasaka', label: '千早赤阪村（大阪府）', roundingUnit: 1},
{ file: 'toyota', label: '豊田市（愛知県）', roundingUnit: 100},
{ file: 'toyama', label: '富山市（富山県）', roundingUnit: 10},
{ file: 'yamagata', label: '山形市（山形県）', roundingUnit: 100},
{ file: 'himeji', label: '姫路市（兵庫県）', roundingUnit: 10},
{ file: 'matsuyama', label: '松山市（愛媛県）', roundingUnit: 10},
{ file: 'takamatsu', label: '高松市（香川県）', roundingUnit: 100},
{ file: 'wakayama', label: '和歌山市（和歌山県）', roundingUnit: 10},
{ file: 'kagoshima', label: '鹿児島市（鹿児島県）', roundingUnit: 100},
{ file: 'oita', label: '大分市（大分県）', roundingUnit: 100},
{ file: 'miyazaki', label: '宮崎市（宮崎県）', roundingUnit: 100},
{ file: 'nagasaki', label: '長崎市（長崎県）', roundingUnit: 100},
{ file: 'nara', label: '奈良市（奈良県）', roundingUnit: 100}
];
var cityData = {}, kenpo = null, state = { result: null};

function $(id) { return document.getElementById(id);}
function fmt(n) { return Math.round(n).toLocaleString('ja-JP');}
function toast(msg) {
var t = $('toast'); t.textContent = msg; t.classList.add('show');
setTimeout(function () { t.classList.remove('show');}, 2600);
}

var memberSeq = 0;
function addMember(age, kind, before, after) {
memberSeq++;
var row = document.createElement('div');
row.className = 'member';
row.innerHTML =
'<div class="member-head"><strong>メンバー</strong><button type="button" class="btn-del">削除</button></div>' +
'<div class="grid2">' +
'<div class="field"><label>年齢</label><div class="yen-wrap"><input type="number" class="m-age" min="0" max="100" value="' + age + '"><span class="unit">歳</span></div></div>' +
'<div class="field"><label>所得の種類</label><select class="m-kind">' +
'<option value="salary"' + (kind === 'salary'? ' selected': '') + '>給与</option>' +
'<option value="pension"' + (kind === 'pension'? ' selected': '') + '>公的年金</option>' +
'<option value="other"' + (kind === 'other'? ' selected': '') + '>その他（事業など）</option>' +
'<option value="none"' + (kind === 'none'? ' selected': '') + '>所得なし</option></select></div>' +
'<div class="field"><label>退職前の所得金額（年）</label><div class="yen-wrap"><input type="number" class="m-before" min="0" step="10000" value="' + before + '"><span class="unit">円</span></div></div>' +
'<div class="field"><label>退職後の所得金額（年・見込み）</label><div class="yen-wrap"><input type="number" class="m-after" min="0" step="10000" value="' + after + '"><span class="unit">円</span></div></div>' +
'</div>' +
'<label class="check"><input type="checkbox" class="m-preschool"> 未就学児（6歳未満）</label>';
row.querySelector('.btn-del').addEventListener('click', function () { row.remove(); calc();});
row.querySelectorAll('input, select').forEach(function (el) {
el.addEventListener('input', calc); el.addEventListener('change', calc);
});
$('members').appendChild(row);
}

function readMembers(which) {
var list = [];
document.querySelectorAll('#members .member').forEach(function (row) {
var age = parseInt(row.querySelector('.m-age').value, 10) || 0;
var kind = row.querySelector('.m-kind').value;
var income = parseInt(row.querySelector(which === 1? '.m-before': '.m-after').value, 10) || 0;
if (kind === 'none') income = 0;
list.push({
age: age, income: income,
judgementIncome: (kind === 'pension' && age >= 65)? Math.max(0, income - 150000): income,
earner: (kind === 'salary' || kind === 'pension') && income > 0,
preschool: row.querySelector('.m-preschool').checked
});
});
return list;
}

function currentBase() {
if ($('baseMode').value === 'salary') {
var g = KenpoEngine.gradeFromSalary(kenpo.grade_table, parseInt($('baseSalary').value, 10) || 0);
return g.standard;
}
return parseInt($('baseDirect').value, 10) || 0;
}

function calc() {
if (!kenpo) return;
var cityFile = $('city').value;
var data = cityData[cityFile];
if (!data) return;
var meta = CITIES.filter(function (c) { return c.file === cityFile;})[0];
var pref = kenpo.prefectures[data.prefecture];
var age = parseInt($('age').value, 10) || 0;
var base = currentBase();

var n1 = KenpoEngine.ninniMonthly(kenpo, base, pref, age >= 40 && age <= 64);
var n2 = KenpoEngine.ninniMonthly(kenpo, base, pref, (age + 1) >= 40 && (age + 1) <= 64);
var k1 = KokuhoEngine.compute(data, { roundingUnit: meta.roundingUnit }, { members: readMembers(1), householdType: 'normal' });
var k2 = KokuhoEngine.compute(data, { roundingUnit: meta.roundingUnit }, { members: readMembers(2), householdType: 'normal' });

var res = {
cityLabel: meta.label, prefName: data.prefecture, age: age, baseInput: base,
n1: n1, n2: n2, k1: k1.total, k2: k2.total,
nY1: n1.total * 12, nY2: n2.total * 12
};
res.nT = res.nY1 + res.nY2; res.kT = res.k1 + res.k2;
state.result = res;

$('k1').textContent = fmt(res.k1) + '円';
$('k2').textContent = fmt(res.k2) + '円';
$('kT').textContent = fmt(res.kT) + '円';
$('n1').textContent = fmt(res.nY1) + '円';
$('n2').textContent = fmt(res.nY2) + '円';
$('nT').textContent = fmt(res.nT) + '円';

var diff = Math.abs(res.kT - res.nT);
if (diff === 0) {
$('verdict').textContent = '2年合計はほぼ同額です。金額以外の違い（給付・手続き）で選んでください。';
} else if (res.kT < res.nT) {
$('verdict').textContent = '2年合計では国民健康保険が ' + fmt(diff) + '円 安い見込みです。';
} else {
$('verdict').textContent = '2年合計では任意継続が ' + fmt(diff) + '円 安い見込みです。';
}
$('ninniDetail').textContent = '任意継続の月額: 1年目 ' + fmt(n1.total) + '円（健康保険 ' + fmt(n1.health + n1.child) + '円' +
(n1.care? '＋介護 ' + fmt(n1.care) + '円': '') + '）／2年目 ' + fmt(n2.total) + '円。標準報酬月額は ' + fmt(n1.base) + '円で計算' +
(n1.cappedApplied? '（上限32万円を適用）': '') + '。';

var rd = $('retireDate').value;
if (rd) {
var d = new Date(rd + 'T00:00:00');
d.setDate(d.getDate() + 20);
$('deadlineNote').textContent = '任意継続の申出期限の目安: ' + d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日まで（退職日の翌日から20日以内。20日目が土日・祝日の場合は翌営業日、郵送は必着）。';
}
}

function buildPrompt() {
var r = state.result; if (!r) return '';
var pref = kenpo ? kenpo.prefectures[r.prefName] : null;
function rateText(x) { return (Math.round(x * 10000) / 100) + '%'; }
return [
'退職後の健康保険について相談です。国民健康保険と任意継続（協会けんぽ）の保険料を試算しました。',
'',
'【条件】',
'・住まい: ' + r.cityLabel,
'・退職時の年齢: ' + r.age + '歳',
'・退職時の標準報酬月額: ' + fmt(r.baseInput) + '円（計算には上限32万円を適用する場合あり）',
'',
'【試算結果（年額）】',
'・国民健康保険: 1年目 ' + fmt(r.k1) + '円／2年目 ' + fmt(r.k2) + '円／2年合計 ' + fmt(r.kT) + '円',
'・任意継続: 1年目 ' + fmt(r.nY1) + '円／2年目 ' + fmt(r.nY2) + '円／2年合計 ' + fmt(r.nT) + '円',
'',
'【計算過程】',
'・任意継続の月額（1年目）: 標準報酬月額 ' + fmt(r.n1.base) + '円' + (r.n1.cappedApplied ? '（上限32万円を適用）' : '') + ' に料率を掛け、区分ごとに円未満を切り捨てて合算。健康保険 ' + fmt(r.n1.health) + '円＋子ども・子育て支援金 ' + fmt(r.n1.child) + '円' + (r.n1.care ? '＋介護保険 ' + fmt(r.n1.care) + '円' : '') + ' ＝ ' + fmt(r.n1.total) + '円（全額自己負担）',
(pref ? '・任意継続の料率（' + r.prefName + '・協会けんぽ令和8年度）: 健康保険 ' + rateText(pref.health_rate) + '／子ども・子育て支援金 ' + rateText(pref.child_rate) + '／介護保険 ' + rateText(pref.care_rate) : ''),
'・任意継続の年額: 月額 × 12（1年目 ' + fmt(r.nY1) + '円／2年目 ' + fmt(r.nY2) + '円。2年目は年齢が1歳上がった条件で介護保険の有無を判定）',
'・国民健康保険の年額: 前年の所得をもとに ' + r.cityLabel + ' の料率（医療分・後期高齢者支援金分・介護分・子ども・子育て支援金分の所得割＋均等割＋平等割、区分ごとに端数処理）で計算（1年目 ' + fmt(r.k1) + '円／2年目 ' + fmt(r.k2) + '円）。区分ごとの内訳はこの比較の結果データに含まれないため、式の一般形で示します。計算方式は国民健康保険料シミュレーターと同じです',
'',
'【根拠】',
'・国民健康保険料: ' + r.cityLabel + 'の公式料率（国民健康保険料シミュレーターの結果画面に一次ソースを明記）',
'・任意継続: 協会けんぽ「令和8年度の都道府県単位保険料率」 https://www.kyoukaikenpo.or.jp/about/business/insurance_rate/rate_prefectures/r08/index.html （標準報酬月額の上限32万円・保険料は全額自己負担）',
'',
'【前提】',
'・国保は前年所得で計算。2年目は現在の料率による仮計算',
'・任意継続は料率が2年間変わらない前提の仮計算。被扶養者の人数で保険料は変わらない',
'・非自発的失業者の国保軽減は未反映',
'',
'【聞きたいこと】',
'1. 金額以外の違い（給付・扶養の扱い・手続き）で注意すべき点は？',
'2. 2年目以降（任意継続が終わった後）の進め方は？',
'3. この試算で見落としている前提はありますか？',
'',
'※最終確認は、加入先の健康保険と自治体の窓口で行います。'
].join('\n');
}

function init() {
var sel = $('city');
CITIES.forEach(function (c) {
var o = document.createElement('option'); o.value = c.file; o.textContent = c.label; sel.appendChild(o);
});
var jobs = CITIES.map(function (c) {
return fetch('/data/kokuho/' + c.file + '.json').then(function (r) { return r.json();})
.then(function (j) { cityData[c.file] = j;});
});
jobs.push(fetch('/data/kenpo/rates-2026.json').then(function (r) { return r.json();})
.then(function (j) { kenpo = j;}));
Promise.all(jobs).then(function () {
addMember(45, 'salary', 4300000, 0);
addMember(42, 'none', 0, 0);
$('retireDate').value = '2026-03-31';
calc();
});
['city', 'retireDate', 'age', 'baseDirect', 'baseSalary'].forEach(function (id) {
$(id).addEventListener('input', calc); $(id).addEventListener('change', calc);
});
$('baseMode').addEventListener('change', function () {
var salary = $('baseMode').value === 'salary';
$('baseDirectWrap').hidden = salary;
$('baseSalaryWrap').hidden =!salary;
calc();
});
$('addMember').addEventListener('click', function () { addMember(10, 'none', 0, 0); calc();});
$('copyPrompt').addEventListener('click', function () {
var text = buildPrompt(); if (!text) return;
function done() { toast('コピーしました。貼る前に、個人が特定できる情報が入っていないか確認してください');}
if (navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(text).then(done, function () { fallback();});
} else { fallback();}
function fallback() {
var ta = document.createElement('textarea');
ta.value = text; document.body.appendChild(ta); ta.select();
try { document.execCommand('copy'); done();} catch (e) { toast('コピーできませんでした');}
document.body.removeChild(ta);
}
});
}
document.addEventListener('DOMContentLoaded', init);
})();
