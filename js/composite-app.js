/* 来年の負担まるごとシミュレーター（手取り複合版）— 画面側
* 仕様: ~/workspace/notes/tax-tools-spec-13-composite.md
* 計算は js/composite-engine.js（既存エンジンの合奏）がブラウザ内で行う。
* 入力値はサーバーへ送信しない。入力の記憶は js/profile.js（localStorage のみ）。
*/
(function () {
'use strict';
var E = window.CompositeEngine;
var DATA = null;
var TOOL_ID = 'composite';
/* 年齢区分の分割（40〜64歳 → 40〜59歳／60〜64歳）前の保存値 '40to64' が復元されたときの
 * 「再選択待ち」を表すセレクトの値（NEW-01）。旧区分は60〜64歳も含んでいたため
 * 決め打ちで読み替えず、利用者に選び直してもらう。再選択が済むまで金額は出さない */
var AGE_RESELECT = 'reselect';

function $(id) { return document.getElementById(id);}
function yen(n) { return Math.round(n).toLocaleString('ja-JP') + '円';}
function num(id) { var v = parseFloat($(id).value); return isNaN(v) || v < 0? 0: v;}
function pct(v) { return (Math.round(v * 10000) / 100) + '%';}
function toast(msg) {
var t = $('toast'); t.textContent = msg; t.classList.add('show');
setTimeout(function () { t.classList.remove('show');}, 5000);
}

/* 国保対応108自治体（js/kokuho-app.js の CITIES と同じ対応表を共用） */
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
/* 住民税の精密計算ができる6市（data/juminzei/cities.json の実レコードを使う） */
var JUMINZEI_PRECISE = {
nagoya: '名古屋市', fukuoka: '福岡市', sapporo: '札幌市',
sendai: '仙台市', saitama: 'さいたま市', niigata: '新潟市'
};
var CITY_PREFECTURE = {
nagoya: '愛知県', osaka: '大阪府', sakai: '大阪府', yokohama: '神奈川県',
kawasaki: '神奈川県', kyoto: '京都府', kobe: '兵庫県', chiba: '千葉県',
shizuoka: '静岡県', kitakyushu: '福岡県', sagamihara: '神奈川県', fukuoka: '福岡県',
sapporo: '北海道', sendai: '宮城県', saitama: '埼玉県', niigata: '新潟県',
hamamatsu: '静岡県', okayama: '岡山県', kumamoto: '熊本県',
kurashiki: '岡山県', amagasaki: '兵庫県', nishinomiya: '兵庫県', kanazawa: '石川県',
nagano: '長野県', kurume: '福岡県', kawagoe: '埼玉県',
machida: '東京都', kashiwa: '千葉県', okazaki: '愛知県',
asahikawa: '北海道', iwaki: '福島県', mito: '茨城県'
};
function cityPrefecture(key) {
if (CITY_PREFECTURE[key]) return CITY_PREFECTURE[key];
if (key.indexOf('tokyo-') === 0) return '東京都';
if (key.indexOf('osaka-') === 0) return '大阪府';
return null;
}
var AGE_LABEL = { under40: '40歳未満', '40to59': '40〜59歳', '60to64': '60〜64歳', '65plus': '65歳以上', '40to64': '40〜64歳'};
var INDUSTRY_LABEL = { general: '一般の事業', nourin: '農林水産・清酒製造の事業', kensetsu: '建設の事業'};

var last = null;
var kokuhoCache = {};

function gather() {
var course = $('course').value;
var cityKey = $('cityKey').value;
var preciseName = JUMINZEI_PRECISE[cityKey] || null;
var juminzeiCity = preciseName && DATA? E.findJuminzeiCity(DATA.juminzeiCities, preciseName): null;
return {
course: course,
cityKey: cityKey,
cityLabel: cityKey === 'other'? 'その他（国保データ対応外）': CITIES[cityKey].label,
juminzeiCity: juminzeiCity,
residentPrecise:!!juminzeiCity,
prefecture: $('prefecture').value,
ageBand: $('ageBand').value,
spouse: {
has: $('spouseHas').value === 'yes',
income: num('spouseIncome'),
ageBand: $('spouseAgeBand').value,
inKokuho: $('spouseInKokuho').value === 'yes'
},
dependents: {
under16: Math.floor(num('depUnder16')),
age16to18: Math.floor(num('dep1618')),
age19to22: Math.floor(num('dep1922')),
age23plus: Math.floor(num('dep23plus'))
},
residentCollection: course === 'self'? 'ordinary': $('residentCollection').value,
industry: $('industry').value,
incomeThisYear: num('incThisYear'),
incomeNextYear: num('incNextYear'),
bonusPer: num('bonusPer'),
bonusCount: Math.floor(num('bonusCount')),
bizThisYear: num('bizThisYear'),
bizNextYear: num('bizNextYear'),
kokuhoData: cityKey!== 'other'? (kokuhoCache[cityKey] || null): null,
kokuhoRoundingUnit: CITIES[cityKey]? CITIES[cityKey].roundingUnit: 100
};
}

function compute() {
var input = gather();
$('employeeGroup').style.display = input.course === 'employee'? '': 'none';
$('selfGroup').style.display = input.course === 'self'? '': 'none';
$('spouseGroup').style.display = input.spouse.has? '': 'none';
$('spouseKokuhoField').style.display = (input.course === 'self' && input.spouse.has)? '': 'none';
$('residentCollection').disabled = input.course === 'self';
if (input.course === 'self') $('residentCollection').value = 'ordinary';
if (!DATA) return;
/* 旧年齢区分のままでは確定計算しない（NEW-01）。再選択を促し、金額は出さない */
if ($('ageBand').value === AGE_RESELECT) { renderAgeReselect(); return;}
/* 自営業コースは自治体の国保データを都度読み込む */
if (input.course === 'self' && input.cityKey!== 'other' &&!(input.cityKey in kokuhoCache)) {
var key = input.cityKey;
fetch('../data/kokuho/' + key + '.json').then(function (r) { return r.json();})
.then(function (j) { kokuhoCache[key] = j; compute();})
.catch(function () { kokuhoCache[key] = null; compute();});
return;
}
var r = E.compute(DATA, input);
last = { input: input, result: r};
render(input, r);
}

/* ---------- 総合の見解（画面表示とAI相談コピーで同じ文を使う） ---------- */
function buildAssessment(input, r) {
var lines = [];
var nextIncome = input.course === 'employee'? input.incomeNextYear: input.bizNextYear;
var thisIncome = input.course === 'employee'? input.incomeThisYear: input.bizThisYear;
var incomeWord = input.course === 'employee'? '来年の年収見込み': '来年の所得見込み';
var ratio = nextIncome > 0? (r.totalNext / nextIncome * 100).toFixed(1): '—';
lines.push('来年の総負担は ' + yen(r.totalNext) + ' で、' + incomeWord + ' ' + yen(nextIncome) +
' の ' + ratio + '% にあたります。月平均では ' + yen(r.monthlyAvg) + ' です。' +
'内訳は、ツケ型（今年の所得で決まる分）が ' + yen(r.tsukeTotal) +
'、現年型（来年の収入で決まる分）が ' + yen(r.currentTotal) + ' です。');
var diffTotal = r.totalNext - r.thisYear.total;
if (diffTotal > 0) {
lines.push('今年（帰属ベース）の総負担 ' + yen(r.thisYear.total) + ' と比べると ' + yen(diffTotal) +
' 増えます。増える分は主に現年型で、来年の収入に連動して増える分です。ツケ型は今年の所得で固定されているため、収入が増えても来年の請求にはまだ反映されません。');
} else if (diffTotal < 0) {
lines.push('今年（帰属ベース）の総負担 ' + yen(r.thisYear.total) + ' と比べると ' + yen(-diffTotal) +
' 減ります。減る分は主に現年型で、来年の収入に連動して減る分です。ツケ型は今年の所得で固定されているため、収入が減っても来年の請求は高いまま残ります。');
} else {
lines.push('今年（帰属ベース）の総負担 ' + yen(r.thisYear.total) + ' と同額です。今年と来年で収入が変わらない前提のため、負担も変わりません。');
}
if (thisIncome!== nextIncome && r.counterfactual) {
var cf = r.counterfactual;
var tsukeNames = input.course === 'employee'? '住民税': '住民税と国民健康保険料';
if (cf.diff > 0) {
lines.push(tsukeNames + 'は今年の' + (input.course === 'employee'? '年収': '所得') + ' ' + yen(thisIncome) +
' で決まっています。もし来年の' + (input.course === 'employee'? '年収': '所得') + 'で決まるなら ' + yen(cf.tsukeTotal) +
' になるところ、今年ベースでは ' + yen(r.tsukeTotal) + ' で、差は ' + yen(cf.diff) +
' です。来年はこの差の分だけ軽く済みますが、再来年には追いついてきます。');
} else if (cf.diff < 0) {
lines.push(tsukeNames + 'は今年の' + (input.course === 'employee'? '年収': '所得') + ' ' + yen(thisIncome) +
' で決まっています。もし来年の' + (input.course === 'employee'? '年収': '所得') + 'で決まるなら ' + yen(cf.tsukeTotal) +
' になるところ、今年ベースでは ' + yen(r.tsukeTotal) + ' で、差は ' + yen(-cf.diff) +
' です。来年の収入が下がっても請求は今年ベースのまま来るため、手取りの見通しではこのズレに注意してください。');
}
} else {
lines.push('今年と来年の収入が同じ前提のため、ツケ型と現年型のズレは生じていません。収入が変わる年は、住民税' +
(input.course === 'self'? 'と国民健康保険料': '') + 'だけが1年遅れて追いついてきます。');
}
var cautions = [];
if (!r.residentPrecise) {
cautions.push('住民税は標準税率による目安で、お住まいの自治体の実際の税率・均等割とは異なる場合があります');
}
if (input.course === 'self') {
cautions.push('国民健康保険料の納期は年10回・6月開始の標準パターンで表示しており、実際の回数・開始月は自治体で異なります');
cautions.push('手取りは所得（経費を引いた後の金額）ベースの表示で、実際のキャッシュの手取りとは異なります');
}
if (input.course === 'employee') {
cautions.push('所得税は年税額そのもので、毎月の源泉徴収や年末調整での精算（還付・追加徴収）は扱っていません');
}
cautions.push('控除は社会保険料・配偶者・扶養・基礎の標準ケースのみで、住宅ローン控除や医療費控除などがある場合は実際の負担と異なります');
lines.push('注意点: ' + cautions.join('。') + '。');
return lines;
}

/* ---------- 旧年齢区分の再選択待ち（NEW-01） ---------- */
function renderAgeReselect() {
last = null; /* AI相談コピーも、再選択が済むまでは確定値として出さない */
var msg = '年齢区分が変更されました（「40〜64歳」が「40〜59歳」と「60〜64歳」に分かれました）。' +
'保存されていた年齢区分のままでは、国民年金保険料などを正しく計算できません。' +
'本人の年齢区分を選び直してください。';
$('formError').innerHTML = '<div class="error">' + msg + '</div>';
$('totalBig').textContent = '— 円';
$('resultRows').innerHTML = '';
$('selfIncomeTaxNote').textContent = '';
$('assessBox').innerHTML = '<p>' + msg + '</p>';
$('ganttArea').innerHTML = '';
$('resultNotes').innerHTML = '';
}

/* ---------- 表示 ---------- */
function kindBadge(kind) { return ' <span class="badge">' + kind + '</span>';}

function render(input, r) {
if (r.errors.indexOf('age-reselect-required') >= 0) { renderAgeReselect(); return;}
if (r.errors.indexOf('kokuho-unavailable') >= 0) {
$('formError').innerHTML = '<div class="error">自営業コースは、国民健康保険料のデータがある自治体（対応108自治体）でのみ計算できます。お住まいの自治体が「その他」の場合は、会社員コースか、<a href="../kokuho/">国民健康保険料シミュレーター</a>の対応状況をご確認ください。</div>';
$('totalBig').textContent = '— 円';
$('resultRows').innerHTML = '';
$('selfIncomeTaxNote').textContent = '';
$('assessBox').innerHTML = '';
$('ganttArea').innerHTML = '';
$('resultNotes').innerHTML = '';
return;
}
$('formError').innerHTML = '';

var rows = [];
rows.push(['住民税' + kindBadge('ツケ型'), yen(r.resident.total)]);
if (input.course === 'self') {
rows.push(['国民健康保険料' + kindBadge('ツケ型'), yen(r.kokuho.total)]);
rows.push(['国民年金保険料' + kindBadge('現年型'), yen(r.pension.annualApplied)]);
}
rows.push(['所得税' + kindBadge('現年型'), yen(r.incomeTax.annualTax)]);
if (input.course === 'employee') {
rows.push(['社会保険料' + kindBadge('現年型'), yen(r.socialNext.total)]);
}
rows.push(['<strong>来年の総負担（帰属ベース）</strong>', '<strong>' + yen(r.totalNext) + '</strong>']);
rows.push(['来年の手取り' + (input.course === 'self'? '（所得ベース）': '（年収見込み − 総負担）'), yen(r.netNext)]);
rows.push(['月平均の負担（総負担 ÷ 12・目安）', yen(r.monthlyAvg)]);
var d = r.totalNext - r.thisYear.total;
rows.push(['今年の総負担（帰属ベース・参考）', yen(r.thisYear.total) + '（来年との差 ' + (d >= 0? '＋': '−') + yen(Math.abs(d)).replace('円', '') + '円）']);
rows.push(['今年の手取り（帰属ベース・参考）', yen(r.thisYear.net)]);
$('resultRows').innerHTML = rows.map(function (row, i) {
return '<tr' + (i === rows.length - 5? ' class="total-row"': '') + '><td>' + row[0] + '</td><td>' + row[1] + '</td></tr>';
}).join('');
$('selfIncomeTaxNote').textContent = input.course === 'self'
? '※ 自営業コースの所得税は、配偶者控除・扶養控除を反映していない概算です（住民税には反映しています）。配偶者や扶養家族の状況によっては、実際の所得税がこの試算より低くなる場合があります。'
: '';
$('totalBig').textContent = yen(r.totalNext);

var assess = buildAssessment(input, r);
$('assessBox').innerHTML = assess.map(function (p) { return '<p>' + p + '</p>';}).join('');

/* ガント */
var g = r.gantt;
var head = '<tr><th class="g-label">項目</th>' + g.months.map(function (m) {
return '<th>' + m.label + '</th>';
}).join('') + '<th>年額</th></tr>';
var body = g.rows.map(function (row) {
var cells = row.cells.map(function (c) {
return c == null? '<td class="g-off"></td>': '<td class="g-on">' + Math.round(c).toLocaleString('ja-JP') + '</td>';
}).join('');
return '<tr><td class="g-label">' + row.label + kindBadge(row.kind) + '</td>' + cells +
'<td class="g-annual">' + yen(row.annual) + '</td></tr>';
}).join('');
var totalRow = '<tr class="g-total"><td class="g-label">月の合計</td>' + g.monthTotals.map(function (t) {
return '<td>' + Math.round(t).toLocaleString('ja-JP') + '</td>';
}).join('') + '<td class="g-annual">' + yen(r.totalNext) + '</td></tr>';
var rowNotes = g.rows.filter(function (row) { return row.note;}).map(function (row) {
return '<li>' + row.label + ': ' + row.note + '</li>';
}).join('');
$('ganttArea').innerHTML =
'<h3 class="subhead">いつ・何が・いくら来るか（来年1月〜再来年5月）</h3>' +
'<div class="table-wrap gantt-wrap"><table class="gantt-table">' + head + body + totalRow + '</table></div>' +
'<ul class="note">' + rowNotes + '</ul>';

var notes = [];
notes.push('総負担は「帰属ベース」です。今年の所得に帰属する住民税' + (input.course === 'self'? 'と国民健康保険料': '') +
'は、支払いが再来年5月にまたがっても全額を含めています。支払いの時期は上のガントで確認できます。');
notes.push('ツケ型の内訳（住民税' + (input.course === 'self'? '・国民健康保険料': '') +
'）は今年の所得で決まった分です。来年6月から請求・天引きが始まります。');
notes.push('「今年との比較」は、同じ合奏を今年の値で回した帰属ベースの数字です。今年の手取り計算では今年の所得に帰属する住民税を使うため、実際に今年払っている住民税（昨年の所得で決まった分）とはずれます。');
if (!r.residentPrecise) {
notes.push('住民税は標準税率（市民税6%・県民税4%・均等割4,000円・森林環境税1,000円・1級地）による目安です。精密な額は<a href="../juminzei/">住民税シミュレーター</a>（対応6市）で確認できます。');
}
if (input.course === 'employee') {
notes.push('社会保険料は、月給の目安 ' + yen(r.socialNext.monthlyGross) + '（（来年の年収 − 賞与年額）÷ 12）から当てはめた標準報酬月額による近似です。所得税は年税額そのもので、源泉徴収・年末調整による精算は扱っていません。ガントの所得税は年額を12で割った均し表示です。');
} else {
notes.push('国民健康保険料の納期の回数と開始月は自治体によって異なります（年8回・10回・11回など）。ここでは年10回・6月開始の標準的なパターンで表示しています。実際の納期はお住まいの自治体の納入通知書で確認してください。');
notes.push('自営業コースの社会保険料控除は、国保料＋国民年金保険料（来年1年分）の近似値 ' + yen(r.socialDeductionApprox) + ' を使っています。手取りは所得ベースの表示です（所得は確定申告書の「所得金額の合計」で、青色申告特別控除を受ける場合は控除後の金額を入力してください）。');
if (!r.pensionApplies) notes.push('本人の年齢区分が60歳以上のため、国民年金保険料は計上していません（国民年金の強制加入は20歳以上60歳未満です。任意加入の保険料は対象外とし、社会保険料控除の近似にも含めていません）。');
}
notes.push('この結果は印刷（ブラウザの印刷機能でPDF保存）できます。印刷時は入力欄を除き、結果とガントだけが出力されます。');
$('resultNotes').innerHTML = notes.map(function (n) { return '<li>' + n + '</li>';}).join('');
}

/* ---------- AI相談コピー（見解・計算過程・ガント要点まで含める） ---------- */
function deductionParts(parts) {
return parts.filter(function (p) { return p[1] > 0;})
.map(function (p) { return p[0] + ' ' + yen(p[1]);}).join(' ＋ ');
}
function residentFormulaLines(input, r) {
var j = r.resident;
var lines = ['■ 住民税（ツケ型）'];
if (input.course === 'employee') {
lines.push('・合計所得金額: ' + yen(j.totalIncome) + '（今年の年収 ' + yen(input.incomeThisYear) +
' − 給与所得控除 ' + yen(input.incomeThisYear - j.totalIncome) + '。住民税の速算表による換算）');
} else {
lines.push('・合計所得金額: ' + yen(j.totalIncome) + '（今年の所得そのもの）');
}
var dj = j.deductions;
lines.push('・控除: ' + deductionParts([
['社会保険料控除', dj.socialInsurance], ['配偶者控除', dj.spouse], ['配偶者特別控除', dj.spouseSpecial],
['扶養控除', dj.dependents], ['基礎控除', dj.basic], ['その他の控除', dj.self]
]) + ' ＝ ' + yen(j.deductionTotal));
lines.push('・課税所得金額: ' + yen(j.taxable) + '（1,000円未満切り捨て）');
lines.push('・所得割: 市民税 ' + j.cityRatePct + '% ＝ ' + yen(Math.round(j.cityGross)) +
' ／ 県民税 ' + j.prefRatePct + '% ＝ ' + yen(Math.round(j.prefGross)));
lines.push('・調整控除: ' + yen(j.adjustment) + '（市分 ' + yen(Math.round(j.adjustment * 0.8)) +
'・県分 ' + yen(Math.round(j.adjustment * 0.2)) + ' に按分）');
lines.push('・均等割: 市民税 ' + yen(j.perCapitaCity) + ' ＋ 県民税 ' + yen(j.perCapitaPref) +
' ／ 森林環境税 ' + yen(j.forestTax));
lines.push('・税額: 市分 ' + yen(j.cityTax) + ' ＋ 県分 ' + yen(j.prefTax) + ' ＋ 森林環境税 ' + yen(j.forestTax) +
' ＝ ' + yen(j.total) + '（所得割と均等割を通して100円未満切り捨て）');
lines.push(r.residentPrecise
? '・計算方式: ' + input.cityLabel + 'の実際の税率・均等割による精密計算です。'
: '・計算方式: 標準税率（市民税6%・県民税4%・均等割4,000円・森林環境税1,000円・1級地）による目安です。');
return lines;
}
function ganttSummaryLines(input, r) {
var g = r.gantt;
var lines = [''];
g.rows.forEach(function (row) {
var cells = row.cells;
function lab(i) { return g.months[i].label;}
if (row.key === 'incomeTax') {
lines.push('・所得税: ' + lab(0) + '〜' + lab(11) + '、毎月 ' + yen(cells[0]) +
(cells[11]!== cells[0]? '（12月のみ ' + yen(cells[11]) + '）': '') + '。年額を12で割った均し表示');
} else if (row.key === 'social') {
var bonusNote = input.bonusPer > 0 && input.bonusCount > 0
? '（賞与の支給月に賞与分の ' + yen(r.socialNext.bonusPerPayment) + ' が上乗せされます）': '';
lines.push('・社会保険料: ' + lab(0) + '〜' + lab(11) + '、毎月 ' + yen(r.socialNext.monthly) + ' の給与天引き' + bonusNote);
} else if (row.key === 'kokuho') {
lines.push('・国民健康保険料: ' + lab(5) + '〜' + lab(14) + ' の10回、各 ' + yen(cells[6]) +
(cells[5]!== cells[6]? '（第1期のみ ' + yen(cells[5]) + '）': '') + '。年10回・6月開始の標準パターン');
} else if (row.key === 'pension') {
if (row.annual > 0) {
lines.push('・国民年金保険料: ' + lab(0) + '〜' + lab(2) + ' は月 ' + yen(cells[0]) + '（令和8年度額）、' +
lab(3) + '〜' + lab(11) + ' は月 ' + yen(cells[3]) + '（令和9年度額）');
} else {
lines.push('・国民年金保険料: 60歳以上のため計上していません（強制加入は20歳以上60歳未満。任意加入は対象外）');
}
} else if (row.key === 'resident') {
if (input.residentCollection === 'special') {
lines.push('・住民税（特別徴収）: ' + lab(5) + '〜' + lab(16) + '、毎月 ' + yen(cells[6]) +
(cells[5]!== cells[6]? '（初月のみ ' + yen(cells[5]) + '）': '') + ' の給与天引き');
} else {
lines.push('・住民税（普通徴収）: ' + lab(5) + '・' + lab(7) + '・' + lab(9) + '・' + lab(12) +
' の4回、各 ' + yen(cells[7]) + (cells[5]!== cells[7]? '（第1期のみ ' + yen(cells[5]) + '）': '') + ' の納付書払い');
}
}
});
var max = Math.max.apply(null, g.monthTotals);
var maxIdx = g.monthTotals.indexOf(max);
lines.push('・月の合計が最も重いのは ' + g.months[maxIdx].label + ' で ' + yen(max) + ' です。');
return lines;
}

function buildPrompt() {
var i = last.input, r = last.result;
var lines = ['来年の負担まるごとシミュレーター（ぜいきんノート）の試算結果について相談です。', ''];
var emp = i.course === 'employee';
var nextIncome = emp? i.incomeNextYear: i.bizNextYear;
var thisIncome = emp? i.incomeThisYear: i.bizThisYear;

lines.push('');
lines.push('・勤め方: ' + (emp? '会社員（給与＋社会保険）': '自営業（国民健康保険＋国民年金）'));
if (emp) {
lines.push('・今年の年収（総支給額）: ' + yen(i.incomeThisYear) + ' ／ 来年の年収見込み: ' + yen(i.incomeNextYear));
lines.push('・都道府県（協会けんぽの料率）: ' + i.prefecture + ' ／ 業種: ' + INDUSTRY_LABEL[i.industry] +
' ／ 賞与: 1回 ' + yen(i.bonusPer) + ' × 年' + i.bonusCount + '回');
} else {
lines.push('・今年の所得: ' + yen(i.bizThisYear) + ' ／ 来年の所得見込み: ' + yen(i.bizNextYear) +
'（いずれも青色申告特別控除を受ける場合は控除後の金額）');
}
lines.push('・お住まいの自治体: ' + i.cityLabel +
(r.residentPrecise? '（住民税は対応6市の精密計算）': '（住民税は標準税率による目安）'));
var fam = '本人の年齢区分: ' + AGE_LABEL[i.ageBand];
if (i.spouse.has) {
fam += ' ／ 配偶者あり（' + (emp? '年収 ': '所得 ') + yen(i.spouse.income) + '・年齢区分 ' + AGE_LABEL[i.spouse.ageBand] + '）';
if (!emp) fam += ' ／ 配偶者の国保加入: ' + (i.spouse.inKokuho? '加入している': '加入していない');
} else {
fam += ' ／ 配偶者なし';
}
var depTotal = i.dependents.under16 + i.dependents.age16to18 + i.dependents.age19to22 + i.dependents.age23plus;
fam += ' ／ 扶養: ' + (depTotal === 0? 'なし':
'16歳未満' + i.dependents.under16 + '人・16〜18歳' + i.dependents.age16to18 + '人・19〜22歳' + i.dependents.age19to22 + '人・23歳以上' + i.dependents.age23plus + '人');
lines.push('・家族構成: ' + fam);
lines.push('・住民税の徴収方法: ' + (i.residentCollection === 'special'? '特別徴収（給与天引き）': '普通徴収（納付書払い）'));
lines.push('');

lines.push('');
buildAssessment(i, r).forEach(function (p) { lines.push(p);});
lines.push('');

lines.push('');
lines.push('・総負担: ' + yen(r.totalNext) + '（ツケ型 ' + yen(r.tsukeTotal) + ' ＋ 現年型 ' + yen(r.currentTotal) + '）');
var parts = ['住民税 ' + yen(r.resident.total) + '（ツケ型）'];
if (!emp) {
parts.push('国民健康保険料 ' + yen(r.kokuho.total) + '（ツケ型）');
parts.push('国民年金保険料 ' + yen(r.pension.annualApplied) + '（現年型）');
}
parts.push('所得税 ' + yen(r.incomeTax.annualTax) + '（現年型）');
if (emp) parts.push('社会保険料 ' + yen(r.socialNext.total) + '（現年型）');
lines.push('・内訳: ' + parts.join(' ／ '));
lines.push('・来年の手取り: ' + yen(r.netNext) + (emp? '': '（所得ベース）') +
' ／ 月平均の負担: ' + yen(r.monthlyAvg) + '（総負担 ÷ 12 の目安）');
lines.push('・今年との比較（帰属ベース）: 今年の総負担 ' + yen(r.thisYear.total) + '・手取り ' + yen(r.thisYear.net) +
' → 来年との差 ' + yen(r.totalNext - r.thisYear.total));
lines.push('　※今年の手取り計算では今年の所得に帰属する住民税を使うため、実際に今年払っている住民税（昨年の所得で決まった分）とはずれます。');
lines.push('');

lines.push('');
lines.push('■ 合奏の前提');
lines.push('・住民税' + (emp? '': 'と国民健康保険料') + 'は「ツケ型」: 今年の' + (emp? '所得': '所得') +
'で決まり、来年6月から請求・天引きが始まります。所得税・' + (emp? '社会保険料': '国民年金保険料') + 'は「現年型」: 来年の収入に対して来年払います。');
if (emp) {
lines.push('・住民税の社会保険料控除には、今年支払う社会保険料 ' + yen(r.socialThis.total) + '（エンジンへ渡した値）を使います。所得税の社会保険料控除には、来年の社会保険料 ' + yen(r.socialNext.total) + ' を使います。');
} else {
lines.push('・社会保険料控除は、国保料＋国民年金保険料の近似値 ' + yen(r.socialDeductionApprox) + ' を住民税・所得税の両方に使います（実際に支払う時期とのズレは近似として扱います）。');
}
lines.push('');
residentFormulaLines(i, r).forEach(function (l) { lines.push(l);});
lines.push('');
if (emp) {
var t = r.incomeTax;
lines.push('■ 所得税（現年型）');
lines.push('・給与所得: ' + yen(t.salaryAfter) + '（来年の年収 ' + yen(i.incomeNextYear) + ' − 給与所得控除 ' +
yen(i.incomeNextYear - t.salaryAfter) + '。国税庁 別表第五による換算）');
if (t.adjustment > 0) lines.push('・所得金額調整控除: ' + yen(t.adjustment));
lines.push('・控除: ' + deductionParts([
['社会保険料控除', t.socialDeduction], ['配偶者控除・配偶者特別控除', t.spouse.amount],
['扶養控除等', t.dependentEtc], ['基礎控除', t.basic]
]) + ' ＝ ' + yen(t.deductionsTotal));
lines.push('・課税所得金額: ' + yen(t.taxable) + '（1,000円未満切り捨て）');
lines.push('・速算表: ' + yen(t.taxable) + ' × ' + t.taxRow.rate_percent + '% − ' + yen(t.taxRow.minus) + ' ＝ ' + yen(t.taxCalc));
lines.push('・年税額: ' + yen(t.taxCalc) + ' × 1.021（復興特別所得税）→ 100円未満切り捨て ＝ ' + yen(t.annualTax));
lines.push('・源泉徴収・年末調整での精算は扱っていません（年税額そのものです）。');
lines.push('');
var s = r.socialNext;
lines.push('■ 社会保険料（現年型・本人負担）');
lines.push('・月給の目安: （来年の年収 ' + yen(i.incomeNextYear) + ' − 賞与年額 ' + yen(i.bonusPer * i.bonusCount) +
'）÷ 12 ＝ ' + yen(s.monthlyGross));
lines.push('・標準報酬月額: 健康保険 ' + yen(s.standardHealth) + ' ／ 厚生年金 ' + yen(s.standardPension));
lines.push('・料率（' + i.prefecture + '・協会けんぽ）: 健康保険 ' + pct(s.rates.health) + '・介護保険 ' + pct(s.rates.care) +
'・子ども・子育て支援金 ' + pct(s.rates.child) + '（いずれも労使折半で本人は半分）／ 厚生年金 ' + pct(s.rates.pension) +
'（折半で本人は半分）／ 雇用保険 ' + pct(s.rates.employmentWorker) + '（' + INDUSTRY_LABEL[i.industry] + '・本人負担）');
lines.push('・内訳（年額・本人負担）: ' + deductionParts([
['健康保険', s.items.health], ['介護保険', s.items.care], ['子ども・子育て支援金', s.items.child],
['厚生年金', s.items.pension], ['雇用保険', s.items.employment]
]) + ' ＝ ' + yen(s.total));
lines.push('・今年の社会保険料（住民税の控除に使用）: ' + yen(r.socialThis.total));
} else {
var k = r.kokuho;
lines.push('■ 国民健康保険料（ツケ型）');
lines.push('・世帯構成: ' + k.members.map(function (m) {
return m.role + '（' + m.age + '歳・所得 ' + yen(m.income) + '）';
}).join('、'));
lines.push('・判定所得の合計: ' + yen(k.judgementIncome) + ' ／ 法定軽減: ' +
(k.reductionRate > 0? (k.reductionRate * 10) + '割軽減': 'なし'));
lines.push('・区分別: ' + deductionParts([
['医療分', k.components.medical], ['後期高齢者支援金分', k.components.support],
['介護分', k.components.care], ['子ども・子育て支援金分', k.components.child]
]) + ' ＝ ' + yen(k.total) + '（' + i.cityLabel + 'の料率・端数処理単位 ' + i.kokuhoRoundingUnit + '円）');
lines.push('・世帯類型は「一般世帯」固定で、未就学児の均等割5割減額は適用していません（高めに出る近似です）。');
lines.push('');
lines.push('■ 国民年金保険料（現年型）');
if (r.pensionApplies) {
lines.push('・令和9年1〜3月: ' + yen(r.pension.monthlyR8) + '/月（令和8年度額）× 3か月 ＋ 4〜12月: ' +
yen(r.pension.monthlyR9) + '/月（令和9年度額）× 9か月 ＝ ' + yen(r.pension.annualNext) + '（1人分）');
} else {
lines.push('・本人の年齢区分が60歳以上のため計上していません（国民年金の強制加入は20歳以上60歳未満。任意加入は対象外）＝ 0円');
}
lines.push('');
var st = r.incomeTaxSelf;
lines.push('■ 所得税（現年型）');
lines.push('・課税所得金額: 来年の所得 ' + yen(i.bizNextYear) + ' − 社会保険料控除の近似 ' + yen(st.socialDeduction) +
' − 基礎控除 ' + yen(st.basic) + '（合計所得金額で判定）＝ ' + yen(st.taxable) + '（1,000円未満切り捨て）');
lines.push('・速算表: ' + yen(st.taxable) + ' × ' + st.taxRow.rate_percent + '% − ' + yen(st.taxRow.minus) + ' ＝ ' + yen(st.taxCalc));
lines.push('・年税額: ' + yen(st.taxCalc) + ' × 1.021（復興特別所得税）→ 100円未満切り捨て ＝ ' + yen(st.annualTax));
lines.push('・青色申告特別控除は適用していません（所得は控除後の金額として入力する前提）。配偶者・扶養控除は住民税側でのみ反映し、この所得税の式には含めていません。');
}
lines.push('');
ganttSummaryLines(i, r).forEach(function (l) { lines.push(l);});
lines.push('');
lines.push('');
lines.push('・住民税: 総務省「個人住民税」 https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/150790_14.html');
if (emp) {
lines.push('・所得税: 国税庁「令和8年分 年末調整のしかた」（別表第五（給与所得控除）・基礎控除・税額表（速算表）） https://www.nta.go.jp/users/gensen/nencho/index/shikata.htm ／ 基礎控除はタックスアンサー No.1199 https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1199.htm ／ 速算表は No.2260 https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2260.htm');
lines.push('・社会保険料: 協会けんぽ「令和8年度の都道府県単位保険料率」 https://www.kyoukaikenpo.or.jp/about/business/insurance_rate/rate_prefectures/r08/index.html ／ 日本年金機構「厚生年金保険の保険料」（料率18.3%） https://www.nenkin.go.jp/service/kounen/hokenryo/hoshu/20150515-01.html ／ 厚生労働省「令和8（2026）年度 雇用保険料率のご案内」 https://jsite.mhlw.go.jp/gunma-roudoukyoku/content/contents/002597764.pdf');
} else {
lines.push('・国民健康保険料: ' + i.cityLabel + 'の公式の料率・計算方式（国民健康保険料シミュレーターに一次ソースを明記）');
lines.push('・国民年金保険料: 日本年金機構「国民年金保険料」 https://www.nenkin.go.jp/service/kokunen/hokenryo/20150313-02.html （令和8年度額。令和9年度額は市区町村の公式案内で確認）');
lines.push('・所得税: 国税庁タックスアンサー No.2260（所得税の税率・速算表） https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2260.htm ／ No.1199（基礎控除） https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1199.htm');
}
lines.push('');
lines.push('聞きたいこと: ①この見解と計算過程の前提で、見落としている負担や控除はないか ②来年の資金繰り（特に支払いが重なる月）で気をつけること ③収入見込みが変わった場合に、どの税目がどう動くか');
lines.push('');
lines.push('※最終確認は税務署・お住まいの市区町村の税務担当窓口・税理士へお願いします。');
return lines.join('\n');
}

function copyPrompt() {
if (!last || last.result.errors.length) return;
var text = buildPrompt();
function done() { toast('コピーしました。貼る前に、個人が特定できる情報が入っていないか確認してください');}
function fallback() {
var ta = document.createElement('textarea');
ta.value = text; document.body.appendChild(ta); ta.select();
try { document.execCommand('copy'); done();} catch (e) { toast('コピーできませんでした');}
document.body.removeChild(ta);
}
if (navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(text).then(done, fallback);
} else fallback();
}

/* ---------- 共通プロファイル連携（js/profile.js） ---------- */
var FIELD_IDS = ['course', 'cityKey', 'prefecture', 'ageBand', 'spouseHas', 'spouseIncome',
'spouseAgeBand', 'depUnder16', 'dep1618', 'dep1922', 'dep23plus', 'residentCollection',
'incThisYear', 'incNextYear', 'bonusPer', 'bonusCount', 'industry',
'bizThisYear', 'bizNextYear', 'spouseInKokuho'];
function applyState(state) {
FIELD_IDS.forEach(function (id) {
if (state[id]!== undefined && $(id)) {
var v = state[id];
/* 本人の年齢区分: 分割前の保存値 '40to64' は40〜59歳と60〜64歳の両方を含んでいたため
 * 決め打ちせず「再選択待ち」にする（NEW-01）。再選択待ちの値そのものも同じ扱い */
if (id === 'ageBand' && (v === '40to64' || v === AGE_RESELECT)) v = AGE_RESELECT;
/* 配偶者の年齢区分: 区分は国保の代表年齢にしか使われず、40〜59歳と60〜64歳で
 * 金額が変わらないため、従来どおり '40to59' に読み替える */
if (id === 'spouseAgeBand' && v === '40to64') v = '40to59';
$(id).value = v;
}
});
}
function currentState() {
var o = {};
FIELD_IDS.forEach(function (id) { if ($(id)) o[id] = $(id).value;});
return o;
}
function profileToState(p) {
var s = {};
if (p.workStyle) s.course = p.workStyle;
if (p.kokuhoCityKey) s.cityKey = p.kokuhoCityKey;
if (p.prefecture) s.prefecture = p.prefecture;
/* 本人の年齢区分はそのまま渡す（旧値 '40to64' の扱いは applyState が担う）。
 * 配偶者は40〜59歳と60〜64歳で金額が変わらないため、ここで '40to59' に読み替える */
if (p.ageBand) s.ageBand = p.ageBand;
if (p.spouseAgeBand) s.spouseAgeBand = p.spouseAgeBand === '40to64'? '40to59': p.spouseAgeBand;
if (p.spouse) {
s.spouseHas = p.spouse.has? 'yes': 'no';
if (p.spouse.income!== undefined) s.spouseIncome = p.spouse.income;
if (p.spouse.inKokuho!== undefined) s.spouseInKokuho = p.spouse.inKokuho? 'yes': 'no';
}
if (p.incomeThisYearSalary!== undefined) s.incThisYear = p.incomeThisYearSalary;
if (p.incomeNextYearSalary!== undefined) s.incNextYear = p.incomeNextYearSalary;
if (p.incomeThisYearBusiness!== undefined) s.bizThisYear = p.incomeThisYearBusiness;
if (p.incomeNextYearBusiness!== undefined) s.bizNextYear = p.incomeNextYearBusiness;
if (p.industry) s.industry = p.industry;
if (p.bonusPer!== undefined) s.bonusPer = p.bonusPer;
if (p.bonusCount!== undefined) s.bonusCount = p.bonusCount;
if (p.dependents) {
if (p.dependents.under16!== undefined) s.depUnder16 = p.dependents.under16;
if (p.dependents.age16to18!== undefined) s.dep1618 = p.dependents.age16to18;
if (p.dependents.age19to22!== undefined) s.dep1922 = p.dependents.age19to22;
if (p.dependents.age23plus!== undefined) s.dep23plus = p.dependents.age23plus;
}
if (p.residentCollection) s.residentCollection = p.residentCollection;
return s;
}
function persist() {
if (!window.ZnProfile) return;
ZnProfile.saveTool(TOOL_ID, currentState());
/* 共通プロファイルの年齢区分は他ツール（世帯・実質時給・副業）と共用の3区分のまま。
 * 複合版の分割区分（40to59／60to64）は '40to64' に戻して保存する（複合版固有の値はツール保存側に残る） */
function profileAgeBand(v) { return (v === '40to59' || v === '60to64')? '40to64': v;}
var patch = {
workStyle: $('course').value,
kokuhoCityKey: $('cityKey').value,
prefecture: $('prefecture').value,
spouseAgeBand: profileAgeBand($('spouseAgeBand').value),
spouse: {
has: $('spouseHas').value === 'yes',
income: num('spouseIncome'),
inKokuho: $('spouseInKokuho').value === 'yes'
},
incomeThisYearSalary: num('incThisYear'),
incomeNextYearSalary: num('incNextYear'),
incomeThisYearBusiness: num('bizThisYear'),
incomeNextYearBusiness: num('bizNextYear'),
industry: $('industry').value,
bonusPer: num('bonusPer'),
bonusCount: Math.floor(num('bonusCount')),
dependents: {
under16: Math.floor(num('depUnder16')), age16to18: Math.floor(num('dep1618')),
age19to22: Math.floor(num('dep1922')), age23plus: Math.floor(num('dep23plus'))
},
residentCollection: $('residentCollection').value
};
/* 再選択待ちの間は、共通プロファイルの年齢区分を上書きしない（他ツールの正規の
 * 区分 '40to64' を壊さないため。ツール固有の保存には再選択待ちの値を残す） */
if ($('ageBand').value !== AGE_RESELECT) patch.ageBand = profileAgeBand($('ageBand').value);
ZnProfile.saveProfile(patch);
}

function init() {
Promise.all([
fetch('../data/nencho/tables-2026.json').then(function (r) { return r.json();}),
fetch('../data/juminzei/rules.json').then(function (r) { return r.json();}),
fetch('../data/juminzei/cities.json').then(function (r) { return r.json();}),
fetch('../data/kenpo/rates-2026.json').then(function (r) { return r.json();}),
fetch('../data/shaho/params-2026.json').then(function (r) { return r.json();})
]).then(function (ds) {
DATA = { tables: ds[0], juminzeiRules: ds[1], juminzeiCities: ds[2], kenpo: ds[3], shahoParams: ds[4]};
/* 自治体セレクト（国保対応108自治体＋その他） */
var citySel = $('cityKey');
Object.keys(CITIES).forEach(function (key) {
var o = document.createElement('option');
o.value = key; o.textContent = CITIES[key].label;
citySel.appendChild(o);
});
var other = document.createElement('option');
other.value = 'other'; other.textContent = 'その他（国保データ対応外）';
citySel.appendChild(other);
citySel.value = 'other'; /* 既定は仕様 §6 ケース3（東京・標準経路）。保存値があれば後段で上書きされる */
/* 都道府県セレクト（協会けんぽ） */
var sel = $('prefecture');
Object.keys(ds[3].prefectures).forEach(function (name) {
var o = document.createElement('option');
o.value = name; o.textContent = name;
if (name === '東京都') o.selected = true;
sel.appendChild(o);
});
/* 消去時に戻す初期値（動的セレクト構築後・保存値の復元前）を控える */
var defaultState = currentState();
/* 保存した入力の復元: ツール固有の前回入力があれば優先、なければ共通プロファイル */
if (window.ZnProfile) {
var ts = ZnProfile.loadTool(TOOL_ID);
if (ts) {
applyState(ts);
} else {
applyState(profileToState(ZnProfile.loadProfile()));
var pf = cityPrefecture($('cityKey').value);
if (pf) $('prefecture').value = pf;
}
}
FIELD_IDS.forEach(function (id) {
$(id).addEventListener('input', compute);
$(id).addEventListener('change', compute);
$(id).addEventListener('input', persist);
$(id).addEventListener('change', persist);
});
$('cityKey').addEventListener('change', function () {
var pf = cityPrefecture($('cityKey').value);
if (pf) $('prefecture').value = pf;
});
$('copyPrompt').addEventListener('click', copyPrompt);
if ($('clearSaved')) {
$('clearSaved').addEventListener('click', function () {
if (window.ZnProfile && window.confirm('保存した入力（共通プロファイルと全ツールの前回入力）をすべて消します。よろしいですか？')) {
ZnProfile.clearAll();
/* リロードに頼らず、その場で初期値へ戻して再計算する。
 * リロードだけだと、ブラウザのフォーム値復元で入力した値が復活し、表示が残ることがある */
applyState(defaultState);
compute();
toast('保存した入力を消しました');
}
});
}
compute();
}).catch(function () {
$('formError').innerHTML = '<div class="error">計算データ（data/nencho・data/juminzei・data/kenpo・data/shaho）を読み込めませんでした。</div>';
});
}
/* DOMContentLoaded 発火後にスクリプトが読まれた場合でも初期計算が必ず走るよう、
 * readyState を見て即時実行と切り替える */
if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', init);
} else {
init();
}
})();
