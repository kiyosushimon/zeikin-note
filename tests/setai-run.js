/* 世帯年収の手取りシミュレーター エンジンの検算
 * 基準: 仕様書 tax-tools-spec-07-setai.md §6
 * §6.2〜§6.4 世帯年収1,000万円の3配分（自前計算の期待値。全段の内訳を含む）
 * §6.5 配分比較のまとめ（初期表示の基準値）
 */
const fs = require('fs');
const path = require('path');
const E = require('../js/setai-engine.js');
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

/* 共通条件（§6.1）: 東京・40歳未満・賞与なし・一般の事業・子供なし・配偶者の社会保険は自動 */
function baseInput(selfIncome, spouseIncome, over) {
  return Object.assign({
    self: { income: selfIncome, ageBand: 'under40', bonusPer: 0, bonusCount: 0 },
    spouse: { income: spouseIncome, ageBand: 'under40', bonusPer: 0, bonusCount: 0 },
    prefecture: '東京都', industry: 'general', spouseSocial: 'auto',
    children: { under16: 0, general: 0, specific: 0, parent: 'self' }
  }, over || {});
}

/* ---------- 住民税用の給与所得換算（§1.3(b)） ---------- */
eq('住民税換算 10,000,000', E.residentSalaryIncome(10000000), 8050000);
eq('住民税換算 7,000,000', E.residentSalaryIncome(7000000), 5200000);
eq('住民税換算 5,000,000', E.residentSalaryIncome(5000000), 3560000);
eq('住民税換算 3,000,000', E.residentSalaryIncome(3000000), 2020000);
eq('住民税換算 1,900,000（最低保障65万円に到達）', E.residentSalaryIncome(1900000), 1250000);
eq('住民税換算 1,000,000（最低保障65万円）', E.residentSalaryIncome(1000000), 350000);
eq('住民税換算 650,000', E.residentSalaryIncome(650000), 0);
eq('住民税換算 0', E.residentSalaryIncome(0), 0);

/* ---------- §6.2 ケースA: 1000万円 ＋ 0円 ---------- */
{
  const r = E.compute(data, baseInput(10000000, 0));
  const s = r.main.self, sp = r.main.spouse, h = r.main.household;
  eq('A 本人 給与所得（所得税用）', s.salaryTax, 8050000);
  eq('A 本人 給与所得（住民税用）', s.salaryResident, 8050000);
  eq('A 本人 標準報酬月額（健保）', s.social.standardHealth, 830000);
  eq('A 本人 標準報酬月額（厚年）', s.social.standardPension, 650000);
  eq('A 本人 健康保険料（年額）', s.social.health, 490524);
  eq('A 本人 支援金（年額）', s.social.child, 11448);
  eq('A 本人 厚生年金（年額）', s.social.pension, 713700);
  eq('A 本人 雇用保険（年額）', s.social.employment, 50004);
  eq('A 本人 社会保険料（年額）', s.social.total, 1265676);
  eq('A 本人 配偶者控除（所得税）', s.incomeTax.spouseAmount, 380000);
  eq('A 本人 基礎控除（所得税）', s.incomeTax.basic, 620000);
  eq('A 本人 課税所得（所得税）', s.incomeTax.taxable, 5784000);
  eq('A 本人 所得税', s.incomeTax.tax, 744600);
  eq('A 本人 配偶者控除（住民税）', s.residentTax.spouseAmount, 330000);
  eq('A 本人 課税所得（住民税）', s.residentTax.taxable, 6024000);
  eq('A 本人 調整控除', s.residentTax.adjustment, 2500);
  eq('A 本人 住民税', s.residentTax.tax, 604900);
  eq('A 本人 手取り', s.net, 7384824);
  eq('A 配偶者 被扶養者', r.main.spouseDependent, true);
  eq('A 配偶者 社会保険料', sp.social.total, 0);
  eq('A 配偶者 所得税', sp.incomeTax.tax, 0);
  eq('A 配偶者 住民税', sp.residentTax.tax, 0);
  eq('A 配偶者 手取り', sp.net, 0);
  eq('A 世帯 所得税', h.incomeTax, 744600);
  eq('A 世帯 住民税', h.residentTax, 604900);
  eq('A 世帯 社会保険料', h.social, 1265676);
  eq('A 世帯手取り', h.net, 7384824);
  /* 1人ケースはケースAそのものになる */
  eq('A 1人ケースとの差', r.diff.net, 0);
}

/* ---------- §6.3 ケースB: 700万円 ＋ 300万円 ---------- */
{
  const r = E.compute(data, baseInput(7000000, 3000000));
  const s = r.main.self, sp = r.main.spouse, h = r.main.household;
  eq('B 本人 給与所得', s.salaryTax, 5200000);
  eq('B 本人 標準報酬月額（健保）', s.social.standardHealth, 590000);
  eq('B 本人 標準報酬月額（厚年）', s.social.standardPension, 590000);
  eq('B 本人 社会保険料（年額）', s.social.total, 1039644);
  eq('B 本人 配偶者控除なし', s.incomeTax.spouseAmount, 0);
  eq('B 本人 基礎控除（所得税）', s.incomeTax.basic, 670000);
  eq('B 本人 所得税', s.incomeTax.tax, 276100);
  eq('B 本人 住民税', s.residentTax.tax, 375500);
  eq('B 本人 手取り', s.net, 5308756);
  eq('B 配偶者 給与所得', sp.salaryTax, 2020000);
  eq('B 配偶者 標準報酬月額（健保）', sp.social.standardHealth, 260000);
  eq('B 配偶者 標準報酬月額（厚年）', sp.social.standardPension, 260000);
  eq('B 配偶者 社会保険料（年額）', sp.social.total, 457728);
  eq('B 配偶者 基礎控除（所得税）', sp.incomeTax.basic, 1040000);
  eq('B 配偶者 所得税', sp.incomeTax.tax, 26600);
  eq('B 配偶者 調整控除', sp.residentTax.adjustment, 2500);
  eq('B 配偶者 住民税', sp.residentTax.tax, 115700);
  eq('B 配偶者 手取り', sp.net, 2399972);
  eq('B 世帯 所得税', h.incomeTax, 302700);
  eq('B 世帯 住民税', h.residentTax, 491200);
  eq('B 世帯 社会保険料', h.social, 1497372);
  eq('B 世帯手取り', h.net, 7708728);
  eq('B 1人ケースとの差（手取り）', r.diff.net, 323904);
  eq('B 1人ケースとの差（所得税）', r.diff.incomeTax, -441900);
  eq('B 1人ケースとの差（住民税）', r.diff.residentTax, -113700);
  eq('B 1人ケースとの差（社会保険料）', r.diff.social, 231696);
}

/* ---------- §6.4 ケースC: 500万円 ＋ 500万円 ---------- */
{
  const r = E.compute(data, baseInput(5000000, 5000000));
  const s = r.main.self, h = r.main.household;
  eq('C 1人分 給与所得', s.salaryTax, 3560000);
  eq('C 1人分 標準報酬月額（健保）', s.social.standardHealth, 410000);
  eq('C 1人分 社会保険料（年額）', s.social.total, 723132);
  eq('C 1人分 基礎控除（所得税）', s.incomeTax.basic, 1040000);
  eq('C 1人分 所得税', s.incomeTax.tax, 91600);
  eq('C 1人分 住民税', s.residentTax.tax, 243100);
  eq('C 1人分 手取り', s.net, 3942168);
  eq('C 世帯 所得税', h.incomeTax, 183200);
  eq('C 世帯 住民税', h.residentTax, 486200);
  eq('C 世帯 社会保険料', h.social, 1446264);
  eq('C 世帯手取り', h.net, 7884336);
  eq('C 1人ケースとの差（手取り）', r.diff.net, 499512);
}

/* ---------- §6.5 配分プリセット（世帯年収1,000万円・入力はケースB） ---------- */
{
  const r = E.compute(data, baseInput(7000000, 3000000));
  eq('プリセット 10:0 世帯手取り', r.presets[0].household.net, 7384824);
  eq('プリセット 7:3 世帯手取り', r.presets[1].household.net, 7708728);
  eq('プリセット 5:5 世帯手取り', r.presets[2].household.net, 7884336);
  eq('プリセット 7:3 本人年収', r.presets[1].selfIncome, 7000000);
  eq('プリセット 7:3 配偶者年収', r.presets[1].spouseIncome, 3000000);
}

/* ---------- 被扶養者の線（§1.4(c)） ---------- */
{
  const under = E.compute(data, baseInput(6000000, 1290000));
  eq('配偶者129万円 自動→被扶養者', under.main.spouseDependent, true);
  eq('配偶者129万円 社会保険料0', under.main.spouse.social.total, 0);
  const over = E.compute(data, baseInput(6000000, 1300000));
  eq('配偶者130万円 自動→加入', over.main.spouseDependent, false);
  const forced = E.compute(data, baseInput(6000000, 3000000, { spouseSocial: 'dependent' }));
  eq('配偶者300万円 扶養を指定→社会保険料0', forced.main.spouse.social.total, 0);
  const joined = E.compute(data, baseInput(6000000, 1000000, { spouseSocial: 'join' }));
  eq('配偶者100万円 加入を指定→社会保険料あり', joined.main.spouse.social.total > 0, true);
}

/* ---------- 配偶者控除の自動判定と付け替え（§1.5・§1.7） ---------- */
{
  /* 配偶者の所得が62万円以下 → 本人に配偶者控除（所得税38万円・住民税33万円） */
  const r = E.compute(data, baseInput(5000000, 1000000));
  eq('配偶者控除（所得税）の種別', r.main.self.incomeTax.spouseKind, '配偶者控除');
  eq('配偶者控除（所得税）', r.main.self.incomeTax.spouseAmount, 380000);
  eq('配偶者控除（住民税）', r.main.self.residentTax.spouseAmount, 330000);
  /* 本人の年収0円 → 配偶者側に付け替える */
  const swapped = E.compute(data, baseInput(0, 5000000));
  eq('付け替え 申告者', swapped.main.claimant, 'spouse');
  eq('付け替え 配偶者控除（所得税）', swapped.main.spouse.incomeTax.spouseAmount, 380000);
  eq('付け替え 本人は付けない', swapped.main.self.incomeTax.spouseAmount, 0);
}

/* ---------- 子供の扶養控除と所得金額調整控除（§1.5・§1.7・§3） ---------- */
{
  const kids = { under16: 1, general: 1, specific: 1, parent: 'self' };
  const r = E.compute(data, baseInput(9000000, 2000000, { children: kids }));
  eq('調整控除（850万円超・子あり）', r.main.self.adjustment, 50000);
  eq('扶養控除（所得税）一般38万＋特定63万', r.main.self.incomeTax.dependentAmount, 1010000);
  eq('扶養控除（住民税）一般33万＋特定45万', r.main.self.residentTax.dependentAmount, 780000);
  eq('配偶者側には付けない（所得税）', r.main.spouse.incomeTax.dependentAmount, 0);
  const toSpouse = E.compute(data, baseInput(9000000, 2000000, {
    children: { under16: 1, general: 1, specific: 1, parent: 'spouse' }
  }));
  eq('扶養する親=配偶者 所得税', toSpouse.main.spouse.incomeTax.dependentAmount, 1010000);
  eq('扶養する親=配偶者 本人は0', toSpouse.main.self.incomeTax.dependentAmount, 0);
}

/* ---------- 賞与ありの年額化（§1.4(a)） ---------- */
{
  /* 本人: 年収600万円のうち賞与60万円×2回 → 月給総支給額は (6,000,000-1,200,000)/12 = 400,000 */
  const r = E.compute(data, baseInput(6000000, 0, {
    self: { income: 6000000, ageBand: 'under40', bonusPer: 600000, bonusCount: 2 }
  }));
  eq('賞与あり 月給総支給額（目安）', r.main.self.social.monthlyGross, 400000);
  eq('賞与あり 標準報酬月額（健保）', r.main.self.social.standardHealth, 410000);
  /* 月給分: 健保 20,192×12・支援金 471×12・厚年 37,515×12・雇用 2,000×12
   * 賞与分: 標準賞与額600,000 → 健保 29,550・支援金 690・厚年 54,900・雇用 3,000 = 88,140 ×2 */
  eq('賞与あり 社会保険料（年額）', r.main.self.social.total,
    (20192 + 471 + 37515) * 12 + 2000 * 12 + 88140 * 2);
}

/* ---------- 住民税の非課税（§1.6） ---------- */
{
  /* 年収100万円（所得35万円）・配偶者なし相当の1人 → 均等割・所得割とも非課税 */
  const r = E.compute(data, baseInput(1000000, 0));
  eq('非課税 本人 住民税', r.main.self.residentTax.tax, 0);
  eq('非課税 均等割フラグ', r.main.self.residentTax.nontaxPerCapita, true);
  eq('非課税 所得割フラグ', r.main.self.residentTax.nontaxIncomeLevy, true);
}

console.log(fails === 0 ? 'ALL SETAI CHECKS PASSED' : `${fails} FAILURES`);
process.exit(fails ? 1 : 0);
