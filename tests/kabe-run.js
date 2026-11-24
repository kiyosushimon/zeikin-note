/* 年収の壁チェッカー エンジンの検算
 * 基準: 仕様書 tax-tools-spec-08-kabe.md §6
 * §6.2 壁ごとの境界ケース B1〜B25（判定の期待値）
 * §6.3 住民税の壁の実測（第7弾エンジンによる実測値）
 * §6.4 手取りの谷の実測（谷の深さ −135,196円・回復点は年収約124万円）
 * 基準ケース（§6.1）: 扶養者年収600万円・東京都・両者40歳未満・賞与なし・一般の事業・子供なし
 */
const fs = require('fs');
const path = require('path');
const E = require('../js/kabe-engine.js');
const data = {
  tables: JSON.parse(fs.readFileSync(path.join(__dirname, '../data/nencho/tables-2026.json'), 'utf8')),
  rules: JSON.parse(fs.readFileSync(path.join(__dirname, '../data/juminzei/rules.json'), 'utf8')),
  kenpo: JSON.parse(fs.readFileSync(path.join(__dirname, '../data/kenpo/rates-2026.json'), 'utf8')),
  shahoParams: JSON.parse(fs.readFileSync(path.join(__dirname, '../data/shaho/params-2026.json'), 'utf8'))
};
let fails = 0;
function eq(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: expected=${expected} actual=${actual}`);
}
function wallOf(r, id) { return r.walls.find(function (w) { return w.id === id; }); }

/* 配偶者モードの基準入力（K2の要件を満たさない勤務先が既定。必要に応じて上書き） */
function spouseIn(inc, over) {
  return Object.assign({
    mode: 'spouse', income: inc, monthlyWage: Math.floor(inc / 12),
    weeklyHours: 'lt20', employees: 'le50', isStudent: false,
    supporterIncome: 6000000, prefecture: '東京都',
    selfAgeBand: 'under40', supporterAgeBand: 'under40', studentAgeBand: '19to22'
  }, over || {});
}
/* K2の4要件を満たす勤務先 */
const K2OK = { weeklyHours: 'ge20', employees: '51plus' };

function studentIn(inc, over) {
  return Object.assign({
    mode: 'student', income: inc, monthlyWage: Math.floor(inc / 12),
    weeklyHours: 'lt20', employees: 'le50', isStudent: true,
    supporterIncome: 6000000, prefecture: '東京都',
    selfAgeBand: 'under40', supporterAgeBand: '40to64', studentAgeBand: '19to22'
  }, over || {});
}
function selfIn(inc, over) {
  return Object.assign({
    mode: 'self', income: inc, monthlyWage: 0,
    weeklyHours: 'ge20', employees: '51plus', isStudent: false,
    supporterIncome: 0, prefecture: '東京都',
    selfAgeBand: 'under40', supporterAgeBand: 'under40', studentAgeBand: '19to22'
  }, over || {});
}

/* ---------- §6.1 基準ケースの扶養者側 ---------- */
{
  const r = E.compute(data, spouseIn(1000000));
  eq('基準 扶養者の社会保険料', r.supporter.social.total, 881400);
  eq('基準 扶養者の所得税（配偶者控除38万円適用時）', r.supporter.incomeTax.tax, 110500);
  eq('基準 扶養者の配偶者控除', r.supporter.incomeTax.spouseAmount, 380000);
}

/* ---------- B1〜B3: K1 住民税の壁（§6.2・§6.3） ---------- */
{
  const b1 = E.compute(data, spouseIn(1090000));
  eq('B1 K1 状態', wallOf(b1, 'K1').status, 'within');
  eq('B1 K1 あと', wallOf(b1, 'K1').remaining, 10000);
  eq('B1 住民税', b1.worker.residentTax.tax, 0);

  const b2 = E.compute(data, spouseIn(1100000));
  eq('B2 K1 状態（限度額ちょうど）', wallOf(b2, 'K1').status, 'within');
  eq('B2 K1 あと', wallOf(b2, 'K1').remaining, 0);
  eq('B2 住民税', b2.worker.residentTax.tax, 0);
  eq('B2 手取り', b2.worker.net, 1100000);

  const b3 = E.compute(data, spouseIn(1110000));
  eq('B3 K1 状態', wallOf(b3, 'K1').status, 'over');
  eq('B3 住民税', b3.worker.residentTax.tax, 6500);
  eq('B3 住民税 所得割', b3.worker.residentTax.incomeLevy, 1500);
  eq('B3 住民税 均等割', b3.worker.residentTax.perCapita, 4000);
  eq('B3 住民税 森林環境税', b3.worker.residentTax.forest, 1000);
  eq('B3 手取り', b3.worker.net, 1103500);

  const m115 = E.compute(data, spouseIn(1150000));
  eq('§6.3 115万円 住民税', m115.worker.residentTax.tax, 9500);
  eq('§6.3 115万円 手取り', m115.worker.net, 1140500);
  const m120 = E.compute(data, spouseIn(1200000));
  eq('§6.3 120万円 住民税', m120.worker.residentTax.tax, 14500);
  eq('§6.3 120万円 手取り', m120.worker.net, 1185500);
}

/* ---------- B4〜B7: K2 106万円の壁の4要件（§6.2） ---------- */
{
  const b4 = E.judgeK2({ weeklyHours: 'ge20', monthlyWage: 87999, employees: '51plus', isStudent: false });
  eq('B4 賃金87,999円 判定', b4.kind, 'not');
  eq('B4 欠けた要件', b4.missing.join(','), 'wage');
  const b5 = E.judgeK2({ weeklyHours: 'ge20', monthlyWage: 88000, employees: '51plus', isStudent: false });
  eq('B5 賃金88,000円 判定', b5.kind, 'join');
  eq('B5 要件充足', b5.met, true);
  const b6 = E.judgeK2({ weeklyHours: 'lt20', monthlyWage: 88000, employees: '51plus', isStudent: false });
  eq('B6 週19時間相当 判定', b6.kind, 'not');
  eq('B6 欠けた要件', b6.missing.join(','), 'hours');
  const b7 = E.judgeK2({ weeklyHours: 'ge20', monthlyWage: 88000, employees: 'le50', isStudent: false });
  eq('B7 従業員50人以下 判定', b7.kind, 'not');
  eq('B7 欠けた要件', b7.missing.join(','), 'size');
  const un = E.judgeK2({ weeklyHours: 'ge20', monthlyWage: 88000, employees: 'unknown', isStudent: false });
  eq('K2 従業員数不明 判定保留', un.kind, 'unknown');
  const full = E.judgeK2({ weeklyHours: 'full', monthlyWage: 0, employees: 'le50', isStudent: true });
  eq('K2 4分の3基準は壁の対象外', full.kind, 'full');
}

/* ---------- B8・B9: K3 130万円の壁（§6.2） ---------- */
{
  const b8 = E.compute(data, spouseIn(1290000));
  eq('B8 K3 状態', wallOf(b8, 'K3').status, 'within');
  eq('B8 K3 あと', wallOf(b8, 'K3').remaining, 10000);
  eq('B8 被扶養者（社保0円）', b8.route, 'dependent');
  const b9 = E.compute(data, spouseIn(1300000));
  eq('B9 K3 状態（130万円ちょうどで外れる）', wallOf(b9, 'K3').status, 'over');
  eq('B9 行き先は国保ルート（金額なし）', b9.route, 'kokuho');
  eq('B9 世帯手取りは参考値', b9.household.netIsReference, true);
}

/* ---------- B10・B11: K3b 150万円の壁（学生・20歳。§6.2） ---------- */
{
  const b10 = E.compute(data, studentIn(1490000));
  eq('B10 K3b 状態', wallOf(b10, 'K3b').status, 'within');
  eq('B10 K3b あと', wallOf(b10, 'K3b').remaining, 10000);
  const b11 = E.compute(data, studentIn(1500000));
  eq('B11 K3b 状態（150万円ちょうどで外れる）', wallOf(b11, 'K3b').status, 'over');
}

/* ---------- B12〜B17: K4〜K6 配偶者（特別）控除の壁（§6.2） ---------- */
{
  const b12 = E.compute(data, spouseIn(1360000, K2OK));
  eq('B12 配偶者控除の種別', b12.supporter.incomeTax.spouseKind, '配偶者控除');
  eq('B12 配偶者控除額', b12.supporter.incomeTax.spouseAmount, 380000);
  eq('B12 K4 状態', wallOf(b12, 'K4').status, 'within');

  const b13 = E.compute(data, spouseIn(1370000, K2OK));
  eq('B13 特別控除に切替', b13.supporter.incomeTax.spouseKind, '配偶者特別控除');
  eq('B13 控除額は満額のまま', b13.supporter.incomeTax.spouseAmount, 380000);
  eq('B13 K4 状態（切替型）', wallOf(b13, 'K4').status, 'over');
  eq('B13 K4 型', wallOf(b13, 'K4').type, 'switch');

  const b14 = E.compute(data, spouseIn(1690000, K2OK));
  eq('B14 特別控除 満額', b14.supporter.incomeTax.spouseAmount, 380000);
  eq('B14 K5 状態', wallOf(b14, 'K5').status, 'within');

  const b15 = E.compute(data, spouseIn(1700000, K2OK));
  eq('B15 特別控除 減少', b15.supporter.incomeTax.spouseAmount, 360000);
  eq('B15 K5 状態', wallOf(b15, 'K5').status, 'over');
  eq('B15 K5 控除の減少額', wallOf(b15, 'K5').impact.amount, 20000);
  eq('B15 K5 扶養者の所得税の増加', wallOf(b15, 'K5').impact.incomeTaxIncrease, 2100);

  const b16 = E.compute(data, spouseIn(2070000, K2OK));
  eq('B16 特別控除 30,000円', b16.supporter.incomeTax.spouseAmount, 30000);
  eq('B16 K6 状態', wallOf(b16, 'K6').status, 'within');

  const b17 = E.compute(data, spouseIn(2080000, K2OK));
  eq('B17 控除なし', b17.supporter.incomeTax.spouseAmount, 0);
  eq('B17 K6 状態', wallOf(b17, 'K6').status, 'over');

  /* 扶養者の合計所得が1,000万円超では K4〜K6 自体が対象外（§1.7） */
  const hi = E.compute(data, spouseIn(1000000, { supporterIncome: 15000000 }));
  eq('扶養者高所得 K4 対象外', wallOf(hi, 'K4').status, 'na');
  eq('扶養者高所得 K5 対象外', wallOf(hi, 'K5').status, 'na');
  eq('扶養者高所得 K6 対象外', wallOf(hi, 'K6').status, 'na');
}

/* ---------- B18・B19: K9 所得税の壁（理論値。§6.2） ---------- */
{
  const b18 = E.compute(data, selfIn(1780000));
  eq('B18 給与所得', wallOf(b18, 'K9').detail.salaryTax, 1040000);
  eq('B18 基礎控除', wallOf(b18, 'K9').detail.basic, 1040000);
  eq('B18 理論上の所得税', wallOf(b18, 'K9').detail.theoreticalTax, 0);
  eq('B18 K9 状態', wallOf(b18, 'K9').status, 'within');
  const b19 = E.compute(data, selfIn(1790000));
  eq('B19 理論上の所得税', wallOf(b19, 'K9').detail.theoreticalTax, 500);
  eq('B19 K9 状態', wallOf(b19, 'K9').status, 'over');
  /* §1.3 の注記: 社保加入の配偶者は年収179万円でも所得税0円（§6.4 の裏付け） */
  const note = E.compute(data, spouseIn(1790000, K2OK));
  eq('注記 179万円・社保加入の配偶者の所得税', note.worker.incomeTax.tax, 0);
  eq('注記 179万円・社保加入の配偶者の社会保険料', note.worker.social.total, 264360);
}

/* ---------- B20〜B23: K7・K8 扶養控除・特定親族特別控除（学生・20歳。§6.2） ---------- */
{
  const b20 = E.compute(data, studentIn(1360000));
  eq('B20 親の控除の種別', b20.supporter.incomeTax.childKind, '特定扶養控除');
  eq('B20 親の扶養控除', b20.supporter.incomeTax.dependentAmount, 630000);
  eq('B20 K7 状態', wallOf(b20, 'K7').status, 'within');

  const b21 = E.compute(data, studentIn(1370000));
  eq('B21 特定親族特別控除に移行', b21.supporter.incomeTax.childKind, '特定親族特別控除');
  eq('B21 親の控除額は変わらない', b21.supporter.incomeTax.specificRelativeAmount, 630000);
  eq('B21 K7 状態（移行型）', wallOf(b21, 'K7').status, 'over');

  const b22 = E.compute(data, studentIn(1970000));
  eq('B22 特定親族特別控除 30,000円', b22.supporter.incomeTax.specificRelativeAmount, 30000);
  eq('B22 K8 状態', wallOf(b22, 'K8').status, 'within');

  const b23 = E.compute(data, studentIn(1980000));
  eq('B23 親の控除なし', b23.supporter.incomeTax.specificRelativeAmount, 0);
  eq('B23 K8 状態', wallOf(b23, 'K8').status, 'over');
}

/* ---------- B24・B25: K10 勤労学生控除の壁（§6.2） ---------- */
{
  const b24 = E.compute(data, studentIn(1630000));
  eq('B24 勤労学生控除（所得税）', b24.worker.incomeTax.workingStudentAmount, 270000);
  eq('B24 K10 状態', wallOf(b24, 'K10').status, 'within');
  const b25 = E.compute(data, studentIn(1640000));
  eq('B25 勤労学生控除なし', b25.worker.incomeTax.workingStudentAmount, 0);
  eq('B25 K10 状態', wallOf(b25, 'K10').status, 'over');
  /* 住民税の勤労学生控除（26万円・所得85万円以下）は所得税とずれる（§1.9） */
  const ws = E.compute(data, studentIn(1110000));
  eq('住民税の勤労学生控除', ws.worker.residentTax.workingStudentAmount, 260000);
  eq('学生111万円の住民税（所得割0・均等割+森林のみ）', ws.worker.residentTax.tax, 5000);
}

/* ---------- §6.4 手取りの谷（基準ケース・106万円の壁） ---------- */
{
  const r = E.compute(data, spouseIn(1050000, K2OK));
  eq('谷 手前（105万円・扶養内）の世帯手取り', r.valley.referenceNet, 5783800);
  eq('谷 直後（107万円・加入）の世帯手取り', r.valley.afterNet, 5648604);
  eq('谷の深さ', r.valley.diff, -135196);
  eq('回復点（年収）', r.recovery.income, 1240000);

  const s107 = r.steps.find(function (s) { return s.income === 1070000; });
  eq('ステップ表 107万円のルート', s107.route, 'join');
  eq('ステップ表 107万円の世帯手取り', s107.householdNet, 5648604);
  const s105 = r.steps.find(function (s) { return s.income === 1050000; });
  eq('ステップ表 105万円のルート', s105.route, 'dependent');

  /* §6.4 の表の残りの点は、現在の年収として入力したときのステップ行で固定する */
  const at120 = E.compute(data, spouseIn(1200000, K2OK));
  const row120 = at120.steps.find(function (s) { return s.income === 1200000; });
  eq('§6.4 120万円（加入）の世帯手取り', row120.householdNet, 5755928);
  eq('§6.4 120万円の配偶者の社会保険料', at120.worker.social.total, 172872);
  const at124 = E.compute(data, spouseIn(1240000, K2OK));
  const row124 = at124.steps.find(function (s) { return s.income === 1240000; });
  eq('§6.4 124万円（加入）の世帯手取り', row124.householdNet, 5785500);
  eq('§6.4 124万円の配偶者手取り', row124.spouseNet, 1051700);
  const at125 = E.compute(data, spouseIn(1250000, K2OK));
  const row125 = at125.steps.find(function (s) { return s.income === 1250000; });
  eq('§6.4 125万円（加入）の世帯手取り', row125.householdNet, 5795452);

  /* K2 を超えた場合の配偶者の社会保険料（107万円・加入） */
  const at107 = E.compute(data, spouseIn(1070000, K2OK));
  eq('§6.4 107万円の配偶者の社会保険料', at107.worker.social.total, 155196);
  eq('§6.4 107万円の配偶者手取り', at107.worker.net, 914804);
  eq('K2 カードの状態（加入になる）', wallOf(at107, 'K2').status, 'over');
  eq('K2 カードの谷の深さ', wallOf(at107, 'K2').impact.amount, -135196);
}

/* ---------- 学生モードの K2・ルート ---------- */
{
  /* 学生は4要件の学生要件を満たさない（本ツールの扱い）。4分の3基準なら加入 */
  const st = E.compute(data, studentIn(1200000, { weeklyHours: 'ge20', employees: '51plus', monthlyWage: 100000 }));
  eq('学生 K2 状態', wallOf(st, 'K2').status, 'within');
  eq('学生 K2 欠けた要件', wallOf(st, 'K2').detail.missing.join(','), 'student');
  const sf = E.compute(data, studentIn(1200000, { weeklyHours: 'full', employees: 'le50' }));
  eq('学生 4分の3基準は加入', sf.route, 'join');
  eq('学生 4分の3基準 K2 は対象外表示', wallOf(sf, 'K2').status, 'na');
  /* 23歳以上は K3b・K8 を出さない */
  const old = E.compute(data, studentIn(1400000, { studentAgeBand: '23plus' }));
  eq('23歳以上 K3b なし', !!wallOf(old, 'K3b'), false);
  eq('23歳以上 K8 なし', !!wallOf(old, 'K8'), false);
  eq('23歳以上 K3 は130万円', wallOf(old, 'K3').line, 1300000);
}

/* ---------- 60歳以上の被扶養者の線（2026-11-24 監査対応） ----------
 * 被扶養者（配偶者・子）の年齢が60歳以上なら、被扶養者の線は180万円未満。
 * 年収150万円は130万円の線では外れるが、180万円の線では範囲内になる */
{
  const senior = E.compute(data, spouseIn(1500000, { selfAgeBand: '65to69' }));
  eq('配偶者65〜69歳 K3の線は180万円', wallOf(senior, 'K3').line, 1800000);
  eq('配偶者65〜69歳 K3は範囲内', wallOf(senior, 'K3').status, 'within');
  eq('配偶者65〜69歳 ルートは被扶養者', senior.route, 'dependent');
  const senior60 = E.compute(data, spouseIn(1500000, { selfAgeBand: '60to64' }));
  eq('配偶者60〜64歳 K3の線は180万円', wallOf(senior60, 'K3').line, 1800000);
  eq('配偶者60〜64歳 ルートは被扶養者', senior60.route, 'dependent');
  const over = E.compute(data, spouseIn(1850000, { selfAgeBand: '65to69' }));
  eq('配偶者65〜69歳・185万円 K3は超過', wallOf(over, 'K3').status, 'over');
  const young = E.compute(data, spouseIn(1500000, { selfAgeBand: '40to64' }));
  eq('配偶者40〜59歳 K3の線は130万円のまま', wallOf(young, 'K3').line, 1300000);
  eq('配偶者40〜59歳・150万円 K3は超過', wallOf(young, 'K3').status, 'over');
  /* 子モードでも被扶養者本人の年齢で切り替わる */
  const stu = E.compute(data, studentIn(1500000, { studentAgeBand: '23plus', selfAgeBand: '65to69' }));
  eq('子モード 本人65歳 K3の線は180万円', wallOf(stu, 'K3').line, 1800000);
}

console.log(fails === 0 ? 'ALL KABE CHECKS PASSED' : `${fails} FAILURES`);
process.exit(fails ? 1 : 0);
