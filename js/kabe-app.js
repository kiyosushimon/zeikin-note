(function () {
'use strict';
var E = window.KabeEngine;
function $(id) { return document.getElementById(id);}
function yen(n) { return Math.round(n).toLocaleString('ja-JP') + '円';}
function signed(n) { return (n > 0 ? '＋' : n < 0 ? '−' : '±') + yen(Math.abs(n)).replace('円', '') + '円';}
function num(id) { var v = parseFloat($(id).value); return isNaN(v) || v < 0 ? 0 : v;}
function toast(msg) {
var t = $('toast'); t.textContent = msg; t.classList.add('show');
setTimeout(function () { t.classList.remove('show');}, 5000);
}

var DATA = null;
var last = null;
var wageAuto = true;

var MODE_LABEL = { spouse: '配偶者として働く', student: '学生（子）として働く', self: '自分自身の税金を見る' };
var AGE_LABEL = { under40: '40歳未満', '40to64': '40〜64歳（介護保険料あり）', '60to64': '60〜64歳（介護保険料あり）', '65to69': '65〜69歳' };
var HOURS_LABEL = { lt20: '週20時間未満', ge20: '週20時間以上（正社員の4分の3未満）', full: '正社員の4分の3以上' };
var EMP_LABEL = { '51plus': '従業員51人以上', le50: '従業員50人以下', unknown: '従業員数は分からない' };
var STUDENT_AGE_LABEL = { under19: '19歳未満', '19to22': '19〜22歳', '23plus': '23歳以上' };
var ROUTE_LABEL = { join: '加入', dependent: '扶養（被扶養者）', kokuho: '国保ルート' };
var MISSING_LABEL = {
hours: '週の所定労働時間が20時間未満です',
wage: '月額賃金が8.8万円未満です',
size: '勤務先の従業員数が51人未満です',
student: '学生は4要件の対象外です'
};
var SOURCES = {
K1: ['札幌市「税額の算出方法」（住民税の非課税限度額）', 'https://www.city.sapporo.jp/citytax/syurui/shiminzei/kojin_zeigaku.html'],
K2: ['厚生労働省リーフレット「短時間労働者の社会保険の加入拡大のポイント」', 'https://www.mhlw.go.jp/content/12500000/001633788.pdf'],
K3: ['日本年金機構「従業員が家族を被扶養者にするとき」', 'https://www.nenkin.go.jp/service/kounen/tekiyo/hihokensha1/20141202.html'],
K3b: ['日本年金機構「19歳以上23歳未満の方の被扶養者認定における年間収入要件が変わります」', 'https://www.nenkin.go.jp/oshirase/taisetu/2025/202508/0819.html'],
K4: ['国税庁タックスアンサー No.1191「配偶者控除」', 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1191.htm'],
K5: ['国税庁タックスアンサー No.1195「配偶者特別控除」', 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1195.htm'],
K6: ['国税庁タックスアンサー No.1195「配偶者特別控除」', 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1195.htm'],
K7: ['国税庁「令和8年分 年末調整のしかた」', 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1199.htm'],
K8: ['国税庁「令和8年分 年末調整のしかた」', 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1199.htm'],
K9: ['国税庁タックスアンサー No.1199「基礎控除」', 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1199.htm'],
K10: ['国税庁「令和8年分 年末調整のしかた」', 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1199.htm']
};

function gather() {
var mode = $('mode').value;
return {
mode: mode,
income: num('income'),
monthlyWage: num('monthlyWage'),
weeklyHours: $('weeklyHours').value,
employees: $('employees').value,
isStudent: mode === 'student' ? true : $('isStudent').checked,
supporterIncome: num('supporterIncome'),
prefecture: $('prefecture').value,
selfAgeBand: $('selfAge').value,
supporterAgeBand: $('supporterAge').value,
studentAgeBand: $('studentAgeBand').value
};
}

function amountText(w) {
if (w.id === 'K2') return '月額賃金 8.8万円';
if (w.line % 10000 === 0) return (w.line / 10000).toLocaleString('ja-JP') + '万円';
return yen(w.line);
}

function stateText(w) {
if (w.id === 'K2') {
if (w.status === 'na') return ['加入対象（壁の対象外）', 'is-na'];
if (w.status === 'over') return ['加入になります', 'is-over'];
if (w.status === 'unknown') return ['判定できません', 'is-na'];
return ['加入になりません', ''];
}
if (w.status === 'na') return ['対象外', 'is-na'];
if (w.status === 'unknown') return ['判定できません', 'is-na'];
if (w.id === 'K3' || w.id === 'K3b') {
return w.status === 'over' ? ['扶養から外れます', 'is-over'] : ['被扶養者の範囲内', ''];
}
return w.status === 'over' ? ['超えています', 'is-over'] : ['範囲内', ''];
}

function wallBody(w, r) {
var lines = [];
if (w.remaining !== null && w.remaining !== undefined) {
if (w.id === 'K3' || w.id === 'K3b') lines.push('あと ' + yen(w.remaining) + ' まで働けます（' + yen(w.line) + '未満が条件です）。');
else lines.push('あと ' + yen(w.remaining) + ' で到達します。');
}
if (w.overBy !== null && w.overBy !== undefined && w.overBy > 0) {
lines.push(yen(w.overBy) + ' 超えています。');
}
var d = w.detail || {};
switch (w.id) {
case 'K1':
lines.push('合計所得金額45万円（1級地・単身）を超えると、本人に住民税（均等割＋所得割）がかかり始めます。2級地では106.5万円、3級地では103万円が線です。旧来「103万円の壁」と呼ばれた数字は、3級地の住民税の壁として残っています。');
if (w.impact && w.impact.amount > 0) lines.push('現在の住民税（年額・目安）は ' + yen(w.impact.amount) + ' です。');
break;
case 'K2':
if (w.status === 'na') {
lines.push('正社員の4分の3以上の働き方のため、そもそも勤務先の社会保険の加入対象です（この壁の対象外）。');
} else if (w.status === 'unknown') {
lines.push('従業員数が分からないため判定できません。要件を満たす場合の目安は、月額賃金8.8万円（年収換算105.6万円）です。');
} else if (w.status === 'over') {
lines.push('いまの条件では、勤務先の健康保険・厚生年金保険に加入になります。');
} else {
var miss = (d.missing || []).map(function (m) {
return m === 'wage' ? MISSING_LABEL.wage + '（あと ' + yen(d.wageRemaining) + '）' : MISSING_LABEL[m];
});
lines.push('いまの条件では加入になりません。' + (miss.length ? '足りない要件: ' + miss.join('／') + '。' : ''));
}
lines.push('106万円は年収の線ではなく、4つの要件（週20時間以上／月額賃金8.8万円以上／従業員51人以上／学生でない）で決まります。2026年10月から賃金要件は撤廃予定で、その後は週20時間以上かどうかが実質的な線になります。企業規模要件も段階的に縮小される予定です。');
if (w.impact) lines.push('加入すると世帯手取りは一時的に下がります（手取りの谷）。年収105万円（扶養内）→107万円（加入）の世帯手取りの差は ' + signed(w.impact.amount) + ' です。');
break;
case 'K3':
case 'K3b':
lines.push('被扶養者でいるための年間収入の線です。判定は過去の収入ではなく「今後1年の収入見込み」で行われます（月額の目安 ' + yen(d.monthlyGuide) + '）。繁忙期の残業など一時的な収入増なら、事業主の証明で扶養を続けられる場合があります（原則として連続2回まで）。被扶養者でなくなると、国民年金も第3号被保険者から第1号への変更が必要になります。');
if (d.senior) lines.push('被扶養者が60歳以上のため、線は通常の130万円ではなく180万円です（60歳以上・障害者の被扶養者は年間収入180万円未満が認定の要件です）。');
if (d.supporterHalf && r.worker.income >= d.supporterHalf && r.worker.income > 0) {
lines.push('扶養者の年収の半分（' + yen(d.supporterHalf) + '）も認定の目安になります。実際の認定は世帯の生計状況により保険者が判断します。');
}
if (w.status === 'over') {
if (d.route === 'join' && w.impact) lines.push('扶養を外れ、勤務先の社会保険に加入します。保険料（年額）は約 ' + yen(w.impact.amount) + ' です。');
else lines.push('扶養を外れた場合の国民健康保険料・国民年金保険料は、自治体と世帯構成で決まるため金額は出せません。');
}
break;
case 'K4':
if (w.status === 'na') {
lines.push('扶養者の合計所得金額が1,000万円を超える（または扶養者の収入がない）ため、配偶者控除・配偶者特別控除はもともと対象外です。');
} else {
lines.push('扶養者側の配偶者控除が配偶者特別控除に切り替わる線です。満額ゾーン（169万円まで）では控除額は38万円のまま変わらないため、超えても世帯手取りは減りません。住民税側の線は給与収入123万円と、所得税側より4万円低くなります。');
if (d.kindNow) lines.push('現在の扶養者の控除（所得税）: ' + d.kindNow + ' ' + yen(d.amountNow) + '。');
}
break;
case 'K5':
if (w.status === 'na') {
lines.push('扶養者の合計所得金額が1,000万円を超える（または扶養者の収入がない）ため、配偶者特別控除はもともと対象外です。');
} else {
lines.push('ここを超えると、扶養者側の配偶者特別控除が段階的に減り始めます。崖ではなく、配偶者の所得が5万円増えるごとに数万円ずつ減る形です。');
if (w.impact) lines.push('控除は満額より ' + yen(w.impact.amount) + ' 減り、扶養者の所得税は約 ' + yen(w.impact.incomeTaxIncrease) + ' 増えています。');
else if (d.amountNow !== undefined) lines.push('現在の扶養者の控除（所得税）: 配偶者特別控除 ' + yen(d.amountNow) + '。');
}
break;
case 'K6':
if (w.status === 'na') {
lines.push('扶養者の合計所得金額が1,000万円を超える（または扶養者の収入がない）ため、配偶者特別控除はもともと対象外です。');
} else {
lines.push('扶養者側の配偶者特別控除が完全になくなる線です。');
if (w.impact) lines.push('扶養者の所得税は、控除が残っていた場合（配偶者の年収207万円）に比べて約 ' + yen(w.impact.incomeTaxIncrease) + ' 増えています。');
else if (d.amountNow !== undefined) lines.push('現在の扶養者の控除（所得税）: 配偶者特別控除 ' + yen(d.amountNow) + '。');
}
break;
case 'K7':
if (r.mode === 'student' && last && last.input.studentAgeBand === '19to22') {
lines.push('親の扶養控除が外れる線です。ただし19〜22歳は、超えても特定親族特別控除が満額（63万円）で受け継ぐため、親の控除額は変わりません。被扶養者の線（150万円）とは別の制度の別の線です。');
} else {
var k3w = null;
r.walls.forEach(function (x) { if (x.id === 'K3' || x.id === 'K3b') k3w = x; });
lines.push('親の扶養控除が外れる線です。この年齢では受け継ぐ控除がないため、崖になります。被扶養者の線（' + (k3w ? amountText(k3w) : '130万円') + '）とは別の制度の別の線です。');
}
if (d.parentKindNow) lines.push('現在の親の控除（所得税）: ' + d.parentKindNow + ' ' + yen(d.parentAmountNow) + '。');
else lines.push('現在、親に子の控除はありません。');
if (w.impact) lines.push('親の税金（所得税＋住民税）は、控除があった場合に比べて約 ' + yen(w.impact.amount) + ' 増えています。');
break;
case 'K8':
lines.push('19〜22歳について、親の特定親族特別控除が完全になくなる線です。136万円から段階的に減ってきた控除の最後の段です。');
if (d.parentAmountNow !== undefined) lines.push('現在の親の特定親族特別控除（所得税）: ' + yen(d.parentAmountNow) + '。');
if (w.impact) lines.push('親の税金（所得税＋住民税）は、控除が残っていた場合（年収197万円）に比べて約 ' + yen(w.impact.amount) + ' 増えています。');
break;
case 'K9':
lines.push('給与所得控除の最低保障74万円＋基礎控除104万円という、所得税の課税最低限です（令和7年分は160万円でした）。これは社会保険料控除などを考えない理論上の線で、社会保険に加入している人は、実際に所得税が発生し始める年収はこの線より上になります。');
if (w.impact) lines.push('現在の所得税（年税額）は ' + yen(w.impact.amount) + ' です。');
break;
case 'K10':
lines.push('学生本人の合計所得金額89万円が、勤労学生控除（所得税27万円）の線です。住民税の勤労学生控除の所得要件は85万円で、所得税とずれています。親の扶養控除（136万円の壁）とは別に判定します。');
if (d.amountNow > 0) lines.push('勤労学生控除 ' + yen(d.amountNow) + ' が適用されています。');
if (w.impact) lines.push('勤労学生控除が外れ、本人の税金は約 ' + yen(w.impact.amount) + ' 増えています。');
break;
}
return lines;
}

function renderWalls(r) {
$('wallList').innerHTML = r.walls.map(function (w) {
var st = stateText(w);
var src = SOURCES[w.id];
var body = wallBody(w, r).map(function (line, i) {
return '<p class="' + (i === 0 && (w.remaining !== null || w.overBy !== null) ? 'wall-impact' : 'wall-desc') + '">' + line + '</p>';
}).join('');
return '<div class="wall-item"><div class="wall-head"><span class="wall-name">' + w.name +
'<span class="wall-state ' + st[1] + '">' + st[0] + '</span></span>' +
'<span class="wall-amount">' + amountText(w) + '</span></div>' + body +
(src ? '<p class="small">根拠: <a href="' + src[1] + '" target="_blank" rel="noopener">' + src[0] + '</a></p>' : '') +
'</div>';
}).join('');
var notes = [
'被扶養者の認定は、最終的に保険者（健保組合・協会けんぽ）が行います。この判定は収入要件の線だけによる目安です。',
'配偶者控除（税金）と被扶養者（社会保険）は別の制度で、線も連動しません。'
];
if (r.mode === 'spouse') {
notes.push('106万円の壁は、企業規模要件を満たさない事業所でも、従業員の2分の1以上の同意があれば任意で加入できる制度があります（任意適用）。本ツールの判定には含めていません。');
notes.push('配偶者手当（家族手当）など勤務先独自の制度の壁は判定していません。');
}
if (r.mode === 'student') {
notes.push('学生は106万円の壁の4要件の対象外です（夜間・定時制などの扱いは入力では扱いません）。正社員の4分の3以上の働き方では加入対象になります。');
notes.push('国民年金の学生納付特例は、本ツールでは扱いません。');
}
$('wallNotes').innerHTML = notes.map(function (n) { return '<li>' + n + '</li>';}).join('');
}

function personRows(p, route) {
var rows = [];
rows.push(['年収（給与収入）', yen(p.income)]);
rows.push(['給与所得（所得税の計算用）', yen(p.salaryTax)]);
rows.push(['給与所得（住民税の計算用）', yen(p.salaryResident)]);
if (p.social === null || p.social === undefined) {
rows.push(['社会保険料（年額）', '—（国民健康保険・国民年金は計算しません）']);
} else if (route === 'dependent') {
rows.push(['社会保険料（年額）', '0円（被扶養者）']);
} else {
rows.push(['健康保険料（年額）', yen(p.social.health)]);
if (p.social.care > 0) rows.push(['介護保険料（年額）', yen(p.social.care)]);
rows.push(['子ども・子育て支援金（年額）', yen(p.social.child)]);
rows.push(['厚生年金保険料（年額）', yen(p.social.pension)]);
rows.push(['雇用保険料（年額）', yen(p.social.employment)]);
rows.push(['社会保険料 合計（年額）', yen(p.social.total)]);
}
rows.push(['所得税（年税額）', yen(p.incomeTax.tax)]);
rows.push(['住民税（年額・目安）', yen(p.residentTax.tax)]);
rows.push(['手取り' + (p.social === null || p.social === undefined ? '（参考・社会保険料を除く）' : ''), yen(p.net)]);
return rows.map(function (row) {
var strong = row[0].indexOf('手取り') === 0 || row[0].indexOf('社会保険料 合計') === 0;
return '<tr' + (strong ? ' class="total-row"' : '') + '><td>' + row[0] + '</td><td>' + row[1] + '</td></tr>';
}).join('');
}

function tableHtml(rows) {
return '<div class="table-wrap"><table class="result-table"><tr><th>項目</th><th>金額</th></tr><tbody>' + rows + '</tbody></table></div>';
}

function deductionNote(label, p) {
var itd = [];
if (p.incomeTax.spouseAmount > 0) itd.push(p.incomeTax.spouseKind + ' ' + yen(p.incomeTax.spouseAmount));
if (p.incomeTax.dependentAmount > 0) itd.push((p.incomeTax.childKind || '扶養控除') + ' ' + yen(p.incomeTax.dependentAmount));
if (p.incomeTax.specificRelativeAmount > 0) itd.push('特定親族特別控除 ' + yen(p.incomeTax.specificRelativeAmount));
if (p.incomeTax.workingStudentAmount > 0) itd.push('勤労学生控除 ' + yen(p.incomeTax.workingStudentAmount));
itd.push('基礎控除 ' + yen(p.incomeTax.basic));
return label + 'の所得税の所得控除: 社会保険料控除 ' + yen(p.incomeTax.social) + '＋' + itd.join('＋') + '。課税所得 ' + yen(p.incomeTax.taxable) + '。';
}

function renderBreakdown(r, input) {
var html = '';
var notes = [];
if (r.mode === 'spouse') {
$('netBigLabel').textContent = '世帯手取り（年額）' + (r.household.netIsReference ? '・参考' : '');
$('netBig').textContent = yen(r.household.net);
var h = r.household;
var rows = [
['世帯年収', yen(h.income)],
['社会保険料（本人負担の合計）', h.social === null ? '—（配偶者分は計算対象外）' : yen(h.social)],
['所得税（2人の合計）', yen(h.incomeTax)],
['住民税（2人の合計・目安）', yen(h.residentTax)],
['世帯手取り', yen(h.net)]
].map(function (row, i) {
return '<tr' + (i === 4 ? ' class="total-row"' : '') + '><td>' + row[0] + '</td><td>' + row[1] + '</td></tr>';
}).join('');
html += '<h3 class="subhead">世帯の内訳</h3>' + tableHtml(rows);
html += '<h3 class="subhead">本人の内訳（働く配偶者）</h3>' + tableHtml(personRows(r.worker, r.route));
html += '<h3 class="subhead">扶養者の内訳</h3>' + tableHtml(personRows(r.supporter, 'join'));
notes.push(deductionNote('扶養者', r.supporter));
if (r.route === 'dependent') notes.push('配偶者は被扶養者として扱い、社会保険料は0円です（国民年金の第3号被保険者となり、国民年金保険料の個人負担もありません）。');
if (r.route === 'join') notes.push('配偶者は勤務先の社会保険に加入する前提で計算しています。社会保険料は、月給の総支給額（目安）' + yen(r.worker.social.monthlyGross) + 'から当てはめた標準報酬月額（健康保険 ' + yen(r.worker.social.standardHealth) + '／厚生年金 ' + yen(r.worker.social.standardPension) + '）で計算しています。');
if (r.route === 'kokuho') notes.push('配偶者は扶養を外れる年収のため、国民健康保険・国民年金に自分で加入する想定です。保険料は計算していないため、手取りは社会保険料を除いた参考値です。');
} else if (r.mode === 'student') {
$('netBigLabel').textContent = '本人の手取り（年額）' + (r.worker.netIsReference ? '・参考' : '');
$('netBig').textContent = yen(r.worker.net);
html += '<h3 class="subhead">本人の内訳（学生）</h3>' + tableHtml(personRows(r.worker, r.route));
html += '<h3 class="subhead">親の内訳</h3>' + tableHtml(personRows(r.supporter, 'join'));
notes.push(deductionNote('親', r.supporter));
notes.push('親の社会保険料は、年齢区分を40〜64歳（介護保険料あり）として計算しています。');
if (r.route === 'dependent') notes.push('本人は親の被扶養者として扱い、社会保険料は0円です。');
if (r.route === 'kokuho') notes.push('本人は扶養を外れる年収のため、国民健康保険・国民年金に自分で加入する想定です。保険料は計算していないため、手取りは社会保険料を除いた参考値です。');
} else {
$('netBigLabel').textContent = '本人の手取り（年額）';
$('netBig').textContent = yen(r.worker.net);
html += tableHtml(personRows(r.worker, 'join'));
if (r.worker.income > 0) notes.push('社会保険料は、月給の総支給額（目安）' + yen(r.worker.social.monthlyGross) + 'から当てはめた標準報酬月額（健康保険 ' + yen(r.worker.social.standardHealth) + '／厚生年金 ' + yen(r.worker.social.standardPension) + '）で計算しています。');
}
if (r.worker.residentTax.tax === 0 && r.worker.income > 0 && r.mode !== 'spouse') notes.push('本人の住民税は非課税のため0円です。');
$('breakdown').innerHTML = html;
$('detailNotes').innerHTML = notes.map(function (n) { return '<li>' + n + '</li>';}).join('');
}

function renderSteps(r) {
if (r.mode !== 'spouse') { $('stepCard').style.display = 'none'; return; }
$('stepCard').style.display = '';
$('stepRows').innerHTML = r.steps.map(function (s) {
return '<tr' + (s.current ? ' class="total-row"' : '') + '><td>' + yen(s.income) + (s.current ? '（現在）' : '') + '</td>' +
'<td>' + ROUTE_LABEL[s.route] + '</td>' +
'<td>' + (s.spouseSocial === null ? '—' : yen(s.spouseSocial)) + '</td>' +
'<td><strong>' + (s.householdNet === null ? '—' : yen(s.householdNet)) + '</strong></td></tr>';
}).join('');
var txt = '';
if (r.recovery) {
txt = '回復点: 配偶者の年収が約 ' + yen(r.recovery.income) + ' になると、壁の手前（年収' + yen(r.recovery.referenceIncome) + '・扶養内）の世帯手取り ' + yen(r.recovery.referenceNet) + ' に戻ります。';
} else if (r.valley && r.valley.diff < 0) {
txt = last.input.weeklyHours === 'full' ? '' : '年収300万円までの範囲では、壁の手前（年収105万円・扶養内）の世帯手取りに戻りません。';
} else if (!r.valley) {
txt = '勤務先の要件（週20時間以上・従業員51人以上・学生でない）を満たさない、または既に加入対象のため、106万円の壁の谷の金額は出していません。';
}
$('recoveryText').textContent = txt;
}

function compute() {
if (!DATA) return;
var input = gather();
/* 立場で入力欄を出し分ける */
var mode = input.mode;
$('workGroup').style.display = mode === 'self' ? 'none' : '';
$('studentCheckWrap').style.display = mode === 'spouse' ? '' : 'none';
$('studentAgeWrap').style.display = mode === 'student' ? '' : 'none';
$('supporterWrap').style.display = mode === 'self' ? 'none' : '';
$('supporterAgeWrap').style.display = mode === 'spouse' ? '' : 'none';
$('supporterLabel').textContent = mode === 'student' ? '扶養者（親）の年収' : '扶養者（配偶者）の年収';

var r = E.compute(DATA, input);
last = { input: input, result: r };
renderWalls(r);
renderBreakdown(r, input);
renderSteps(r);
}

function buildPrompt() {
var i = last.input, r = last.result;
var lines = ['年収の壁チェッカーの試算結果について相談です。', ''];
lines.push('・立場: ' + MODE_LABEL[i.mode]);
lines.push('・本人の年収見込み: ' + yen(i.income));
if (i.mode !== 'self') {
lines.push('・月の所定内賃金: ' + yen(i.monthlyWage) + '／週の所定労働時間: ' + HOURS_LABEL[i.weeklyHours] + '／勤務先: ' + EMP_LABEL[i.employees]);
lines.push('・扶養者の年収: ' + yen(i.supporterIncome));
}
if (i.mode === 'student') lines.push('・本人の年齢: ' + STUDENT_AGE_LABEL[i.studentAgeBand]);
lines.push('・勤務先の都道府県: ' + i.prefecture + '（協会けんぽ）');
lines.push('');
lines.push('壁の判定:');
r.walls.forEach(function (w) {
var st = stateText(w)[0];
var extra = w.remaining !== null && w.remaining !== undefined ? '（あと ' + yen(w.remaining) + '）' : '';
lines.push('・' + w.name + ' ' + amountText(w) + ': ' + st + extra);
});
lines.push('');
if (r.mode === 'spouse') {
lines.push('・世帯手取り: ' + yen(r.household.net) + '（世帯年収 ' + yen(r.household.income) + '／所得税 ' + yen(r.household.incomeTax) + '／住民税 ' + yen(r.household.residentTax) + '）');
if (r.recovery) lines.push('・106万円の壁の回復点: 年収約 ' + yen(r.recovery.income));
}
lines.push('・本人の手取り: ' + yen(r.worker.net) + '（所得税 ' + yen(r.worker.incomeTax.tax) + '／住民税 ' + yen(r.worker.residentTax.tax) + '）');
lines.push('');
lines.push('【計算過程】');
var wk = r.worker;
lines.push('・本人の所得税: 給与所得（年収 ' + yen(i.income) + ' − 給与所得控除）' + yen(wk.salaryTax) + ' から控除（社会保険料 ' + yen(wk.incomeTax.social) + '＋配偶者 ' + yen(wk.incomeTax.spouseAmount) + '＋扶養 ' + yen(wk.incomeTax.dependentAmount) + '＋基礎 ' + yen(wk.incomeTax.basic) + '）＝ ' + yen(wk.incomeTax.deductionsTotal) + ' を引き、課税所得 ' + yen(wk.incomeTax.taxable) + '（1,000円未満切り捨て）に速算表を適用し ×1.021（復興特別所得税）＝ ' + yen(wk.incomeTax.tax));
lines.push('・本人の住民税: 課税所得 ' + yen(wk.residentTax.taxable) + ' × 10% − 調整控除 ' + yen(wk.residentTax.adjustment) + ' ＋ 均等割 ' + yen(wk.residentTax.perCapita) + ' ＋ 森林環境税 ' + yen(wk.residentTax.forest) + ' ＝ ' + yen(wk.residentTax.tax) + '（100円未満切り捨て）');
lines.push('・壁の判定の根拠: 所得税の壁178万円 ＝ 基礎控除104万円 ＋ 給与所得控除の最低保障74万円。住民税の壁110万円は1級地・単身の非課税限度額（給与所得に換算して判定）。社会保険の壁は、被扶養者の収入要件130万円（19〜22歳は150万円、60歳以上は180万円）と、短時間労働者の加入要件（週の所定労働時間20時間・賃金月額8.8万円・従業員数51人以上・学生でないこと）で判定');
r.walls.forEach(function (w) {
var s = '・' + w.name + ': 線 ' + yen(w.line);
if (w.id === 'K1' && w.detail && w.detail.residentIncome !== undefined) s += '（本人の給与所得換算 ' + yen(w.detail.residentIncome) + ' と非課税限度 ' + yen(w.detail.limit) + ' を比較）';
if (w.id === 'K2' && w.detail) s += '（月の所定内賃金 ' + yen(w.detail.monthlyWage) + ' と賃金要件の線 ' + yen(w.detail.wageLine) + ' を比較）';
s += ' → ' + stateText(w)[0];
lines.push(s);
});
if (r.recovery) lines.push('・回復点: 社会保険に加入して手取りが下がったあと、加入前の手取り水準に戻る年収を試算 ＝ 約 ' + yen(r.recovery.income));
lines.push('');
lines.push('前提: 所得税は令和8年分、住民税は令和8年度の標準税率による年額の目安（実際は翌年度に課税）。106万円の壁は現行要件で判定し、2026年10月の賃金要件撤廃は予定として注記。被扶養者の判定は収入要件の線だけによる目安で、認定は保険者の判断。社会保険料は年収から導出した月給（目安）で標準報酬月額を当てはめた試算。扶養を外れて国民健康保険・国民年金になる場合の保険料は計算していない。');
lines.push('根拠: 国税庁タックスアンサー No.1191（配偶者控除） https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1191.htm・No.1195（配偶者特別控除） https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1195.htm・No.1199（基礎控除） https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1199.htm、国税庁「令和8年分 年末調整のしかた」 https://www.nta.go.jp/users/gensen/nencho/index/shikata.htm、厚生労働省（短時間労働者の適用拡大・令和8年1月リーフレット）、日本年金機構（被扶養者の収入要件・19〜22歳の150万円） https://www.nenkin.go.jp/service/kounen/tekiyo/hihokensha1/20141202.html、政府広報オンライン（年収の壁・支援強化パッケージ）、自治体公式ページ（住民税の非課税限度額）');
lines.push('');
lines.push('聞きたいこと: ①この試算の前提で見落としはないか ②壁を超えて働く場合と、超えないように調整する場合、それぞれの注意点 ③私の状況で確認すべき制度や手続き');
lines.push('');
lines.push('※最終確認は勤務先の給与担当・税理士・税務署・自治体窓口へお願いします。');
return lines.join('\n');
}

function copyPrompt() {
if (!last) return;
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

function init() {
Promise.all([
fetch('../data/nencho/tables-2026.json').then(function (r) { return r.json();}),
fetch('../data/juminzei/rules.json').then(function (r) { return r.json();}),
fetch('../data/kenpo/rates-2026.json').then(function (r) { return r.json();}),
fetch('../data/shaho/params-2026.json').then(function (r) { return r.json();})
]).then(function (ds) {
DATA = { tables: ds[0], rules: ds[1], kenpo: ds[2], shahoParams: ds[3] };
var sel = $('prefecture');
Object.keys(ds[2].prefectures).forEach(function (name) {
var o = document.createElement('option');
o.value = name; o.textContent = name;
if (name === '東京都') o.selected = true;
sel.appendChild(o);
});
var ids = ['mode', 'income', 'monthlyWage', 'weeklyHours', 'employees', 'isStudent',
'studentAgeBand', 'supporterIncome', 'prefecture', 'selfAge', 'supporterAge'];
ids.forEach(function (id) { $(id).addEventListener('input', compute); $(id).addEventListener('change', compute);});
$('income').addEventListener('input', function () {
if (wageAuto) $('monthlyWage').value = Math.floor(num('income') / 12);
});
$('monthlyWage').addEventListener('input', function () {
if (wageAuto) { wageAuto = false; $('wageAutoBtn').style.display = ''; }
});
$('wageAutoBtn').addEventListener('click', function () {
wageAuto = true;
$('monthlyWage').value = Math.floor(num('income') / 12);
$('wageAutoBtn').style.display = 'none';
compute();
});
$('copyPrompt').addEventListener('click', copyPrompt);
compute();
}).catch(function () {
$('formError').innerHTML = '<div class="error">計算データ（data/nencho・data/juminzei・data/kenpo・data/shaho）を読み込めませんでした。</div>';
});
}
document.addEventListener('DOMContentLoaded', init);
})();
