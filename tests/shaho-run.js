/* 社会保険料計算エンジンの検算
 * 基準: 仕様書 tax-tools-spec-06-shaho.md §6
 * §6.1 協会けんぽ公式保険料額表（東京支部・令和8年度）の照合4等級（公式照合）
 * §6.2 自前ケースA（月給＋賞与の年間合計。公式照合ではなくフローの期待値）
 */
const fs = require('fs');
const path = require('path');
const E = require('../js/shaho-engine.js');
const data = {
  kenpo: JSON.parse(fs.readFileSync(path.join(__dirname, '../data/kenpo/rates-2026.json'), 'utf8')),
  params: JSON.parse(fs.readFileSync(path.join(__dirname, '../data/shaho/params-2026.json'), 'utf8'))
};
let fails = 0;
function eq(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: expected=${expected} actual=${actual}`);
}
function baseInput(over) {
  return Object.assign({
    prefecture: '東京都', ageBand: 'under40', salaryMode: 'direct', gross: 0, directStandard: 0,
    bonusGross: 0, bonusCount: 0, industry: 'general', employmentInsured: true, cumulativeBonus: 0
  }, over);
}

/* ---------- 厚生年金等級表データの整合性 ---------- */
{
  const t = data.params.pension_grade_table;
  eq('厚年等級表 等級数', t.length, 32);
  eq('厚年等級表 第1級', t[0].standard, 88000);
  eq('厚年等級表 第32級', t[31].standard, 650000);
  eq('厚年等級表 第1級の範囲上限（読み替え93,000円未満）', t[0].range_max, 93000);
  eq('厚年等級表 第32級の範囲下限（読み替え635,000円以上）', t[31].range_min, 635000);
  eq('厚年等級表 第32級の範囲上限', t[31].range_max, null);
  let continuous = true;
  for (let i = 0; i + 1 < t.length; i++) if (t[i].range_max !== t[i + 1].range_min) continuous = false;
  eq('厚年等級表 区間の連続性', continuous, true);
  // 健康保険の等級表（第4級〜第35級）と標準報酬月額の並びが共通であること
  const health = data.kenpo.grade_table;
  let sameStandards = true;
  for (let i = 0; i < 32; i++) if (t[i].standard !== health[i + 3].standard) sameStandards = false;
  eq('厚年等級表 標準報酬月額は健保第4〜35級と共通', sameStandards, true);
}

/* ---------- 等級の当てはめの境界 ---------- */
{
  const pt = data.params.pension_grade_table, ht = data.kenpo.grade_table;
  eq('当てはめ 厚年 92,999円は第1級', E.gradeFromSalary(pt, 92999).standard, 88000);
  eq('当てはめ 厚年 93,000円は第2級', E.gradeFromSalary(pt, 93000).standard, 98000);
  eq('当てはめ 厚年 635,000円は第32級', E.gradeFromSalary(pt, 635000).standard, 650000);
  eq('当てはめ 健保 1,355,000円は第50級', E.gradeFromSalary(ht, 1355000).standard, 1390000);
  eq('当てはめ 健保 62,999円は第1級', E.gradeFromSalary(ht, 62999).standard, 58000);
}

/* ---------- §6.1 ケース1（健保 第17級・厚年 第14級、200,000円、40歳未満） ---------- */
{
  const r = E.compute(data, baseInput({ directStandard: 200000, gross: 200000 }));
  const m = r.monthly;
  eq('ケース1 健保等級', m.healthGrade, 17);
  eq('ケース1 厚年等級', m.pensionGrade, 14);
  eq('ケース1 健康保険料 総額', m.items.health.total, 19700);
  eq('ケース1 健康保険料 本人', m.items.health.insured, 9850);
  eq('ケース1 健康保険料 会社', m.items.health.employer, 9850);
  eq('ケース1 支援金 総額', m.items.child.total, 460);
  eq('ケース1 支援金 本人', m.items.child.insured, 230);
  eq('ケース1 支援金 会社', m.items.child.employer, 230);
  eq('ケース1 厚生年金 総額', m.items.pension.total, 36600);
  eq('ケース1 厚生年金 本人', m.items.pension.insured, 18300);
  eq('ケース1 厚生年金 会社', m.items.pension.employer, 18300);
  eq('ケース1 介護保険料（40歳未満は0）', m.items.care.total, 0);
}

/* ---------- §6.1 ケース2（健保 第5級・厚年 第2級、98,000円、端数処理の境界） ---------- */
{
  const r = E.compute(data, baseInput({ directStandard: 98000, gross: 98000 }));
  const m = r.monthly;
  eq('ケース2 健保等級', m.healthGrade, 5);
  eq('ケース2 厚年等級', m.pensionGrade, 2);
  eq('ケース2 健康保険料 総額', m.items.health.total, 9653);
  eq('ケース2 健康保険料 本人（50銭ちょうどは切り捨て）', m.items.health.insured, 4826);
  eq('ケース2 健康保険料 会社', m.items.health.employer, 4827);
  eq('ケース2 支援金 総額', m.items.child.total, 225);
  eq('ケース2 支援金 本人（70銭は切り上げ）', m.items.child.insured, 113);
  eq('ケース2 支援金 会社', m.items.child.employer, 112);
  eq('ケース2 厚生年金 総額', m.items.pension.total, 17934);
  eq('ケース2 厚生年金 本人', m.items.pension.insured, 8967);
  eq('ケース2 厚生年金 会社', m.items.pension.employer, 8967);
}

/* ---------- §6.1 ケース3（健保 第30級・厚年 第27級、500,000円、介護あり） ---------- */
{
  const r = E.compute(data, baseInput({ directStandard: 500000, gross: 500000, ageBand: '40to64' }));
  const m = r.monthly;
  eq('ケース3 健保等級', m.healthGrade, 30);
  eq('ケース3 厚年等級', m.pensionGrade, 27);
  eq('ケース3 健康保険料 総額', m.items.health.total, 49250);
  eq('ケース3 健康保険料 本人', m.items.health.insured, 24625);
  eq('ケース3 介護保険料 総額', m.items.care.total, 8100);
  eq('ケース3 介護保険料 本人', m.items.care.insured, 4050);
  eq('ケース3 健保＋介護 本人合計（公式表の合算列の折半額と一致）', m.items.health.insured + m.items.care.insured, 28675);
  eq('ケース3 支援金 総額', m.items.child.total, 1150);
  eq('ケース3 支援金 本人', m.items.child.insured, 575);
  eq('ケース3 厚生年金 総額', m.items.pension.total, 91500);
  eq('ケース3 厚生年金 本人', m.items.pension.insured, 45750);
}

/* ---------- §6.1 ケース4（健保 第1級 58,000円、厚年との等級のずれ） ---------- */
{
  const r = E.compute(data, baseInput({ salaryMode: 'gross', gross: 60000 }));
  const m = r.monthly;
  eq('ケース4 健保 標準報酬月額', m.standardHealth, 58000);
  eq('ケース4 健保等級', m.healthGrade, 1);
  eq('ケース4 厚年 標準報酬月額（第1級88,000円にずれる）', m.standardPension, 88000);
  eq('ケース4 厚年等級', m.pensionGrade, 1);
  eq('ケース4 健康保険料 総額', m.items.health.total, 5713);
  eq('ケース4 健康保険料 本人（50銭ちょうどは切り捨て）', m.items.health.insured, 2856);
  eq('ケース4 健康保険料 会社', m.items.health.employer, 2857);
  eq('ケース4 支援金 総額', m.items.child.total, 133);
  eq('ケース4 支援金 本人', m.items.child.insured, 67);
  eq('ケース4 支援金 会社', m.items.child.employer, 66);
  eq('ケース4 厚生年金 総額', m.items.pension.total, 16104);
  eq('ケース4 厚生年金 本人', m.items.pension.insured, 8052);
}

/* ---------- §6.2 ケースA（東京・40〜64歳・月給385,000円＋賞与600,000円×2回） ---------- */
{
  const r = E.compute(data, baseInput({
    salaryMode: 'gross', gross: 385000, ageBand: '40to64', bonusGross: 600000, bonusCount: 2
  }));
  const m = r.monthly, b = r.bonus, a = r.annual;
  eq('A 健保 標準報酬月額', m.standardHealth, 380000);
  eq('A 健保等級', m.healthGrade, 26);
  eq('A 厚年等級', m.pensionGrade, 23);
  eq('A 月額 健康保険料 本人', m.items.health.insured, 18715);
  eq('A 月額 健康保険料 会社', m.items.health.employer, 18715);
  eq('A 月額 介護保険料 本人', m.items.care.insured, 3078);
  eq('A 月額 支援金 本人', m.items.child.insured, 437);
  eq('A 月額 厚生年金 本人', m.items.pension.insured, 34770);
  eq('A 月額 雇用保険 本人', m.items.employment.insured, 1925);
  eq('A 月額 雇用保険 会社（3,272.5は切り捨て）', m.items.employment.employer, 3272);
  eq('A 月額合計 本人', m.totals.insured, 58925);
  eq('A 月額合計 会社', m.totals.employer, 60272);
  eq('A 賞与 健康保険料 本人', b.items.health.insured, 29550);
  eq('A 賞与 介護保険料 本人', b.items.care.insured, 4860);
  eq('A 賞与 支援金 本人', b.items.child.insured, 690);
  eq('A 賞与 厚生年金 本人', b.items.pension.insured, 54900);
  eq('A 賞与 雇用保険 本人', b.items.employment.insured, 3000);
  eq('A 賞与 雇用保険 会社', b.items.employment.employer, 5100);
  eq('A 賞与合計 本人', b.totals.insured, 93000);
  eq('A 賞与合計 会社', b.totals.employer, 95100);
  eq('A 年間合計 本人', a.totals.insured, 893100);
  eq('A 年間合計 会社', a.totals.employer, 913464);
  eq('A 年間合計 労使合計', a.totals.total, 1806564);
  eq('A 年間合計 本人＋会社＝労使合計', a.totals.insured + a.totals.employer, a.totals.total);
}

/* ---------- 雇用保険の事業区分・被保険者でない場合 ---------- */
{
  const n = E.compute(data, baseInput({ salaryMode: 'gross', gross: 300000, industry: 'nourin' }));
  eq('農林水産 雇用保険 本人（6/1,000）', n.monthly.items.employment.insured, 1800);
  eq('農林水産 雇用保険 会社（9.5/1,000）', n.monthly.items.employment.employer, 2850);
  const k = E.compute(data, baseInput({ salaryMode: 'gross', gross: 300000, industry: 'kensetsu' }));
  eq('建設 雇用保険 本人（6/1,000）', k.monthly.items.employment.insured, 1800);
  eq('建設 雇用保険 会社（10.5/1,000）', k.monthly.items.employment.employer, 3150);
  const no = E.compute(data, baseInput({ salaryMode: 'gross', gross: 300000, employmentInsured: false }));
  eq('被保険者でない 雇用保険 本人', no.monthly.items.employment.insured, 0);
  eq('被保険者でない 雇用保険 会社', no.monthly.items.employment.employer, 0);
}

/* ---------- 賞与の上限 ---------- */
{
  const r = E.compute(data, baseInput({
    salaryMode: 'gross', gross: 385000, bonusGross: 2000000, bonusCount: 1, cumulativeBonus: 5000000
  }));
  eq('賞与上限 健保 標準賞与額（累計573万円まで残り73万円）', r.bonus.standardHealth, 730000);
  eq('賞与上限 健保 フラグ', r.bonus.healthCapped, true);
  eq('賞与上限 厚年 標準賞与額（150万円）', r.bonus.standardPension, 1500000);
  eq('賞与上限 厚年 フラグ', r.bonus.pensionCapped, true);
}

/* ---------- LOG-01回帰: 賞与の健保上限573万円は年度累計で判定 ---------- */
{
  // 賞与300万円×年2回（東京・40歳未満・月給385,000円）。
  // 旧処理は1回分の保険料×2で、健保の対象が年600万円になっていた（年額健保 本人520,080円）。
  const r = E.compute(data, baseInput({
    salaryMode: 'gross', gross: 385000, bonusGross: 3000000, bonusCount: 2
  }));
  eq('LOG-01 1回目 健保 標準賞与額', r.bonusRounds[0].standardHealth, 3000000);
  eq('LOG-01 2回目 健保 標準賞与額（累計573万円まで残り273万円）', r.bonusRounds[1].standardHealth, 2730000);
  eq('LOG-01 健保 標準賞与額の年度累計', r.bonusRounds[0].standardHealth + r.bonusRounds[1].standardHealth, 5730000);
  eq('LOG-01 2回目 健保 上限フラグ', r.bonusRounds[1].healthCapped, true);
  eq('LOG-01 厚年 標準賞与額は回ごと150万円', r.bonusRounds[1].standardPension, 1500000);
  eq('LOG-01 1回目 健康保険料 本人（300万円×9.85%÷2）', r.bonusRounds[0].items.health.insured, 147750);
  eq('LOG-01 2回目 健康保険料 本人（273万円×9.85%÷2、50銭ちょうどは切り捨て）', r.bonusRounds[1].items.health.insured, 134452);
  eq('LOG-01 年額 健康保険料 本人（月額×12＋1回目＋2回目）', r.annual.items.health.insured, 506782);
}

/* ---------- 方式(b): 厚生年金のクランプ ---------- */
{
  const hi = E.compute(data, baseInput({ directStandard: 800000, gross: 800000 }));
  eq('方式b 健保は入力値をそのまま使う', hi.monthly.standardHealth, 800000);
  eq('方式b 厚年は650,000円で頭打ち', hi.monthly.standardPension, 650000);
  eq('方式b 厚年 クランプ表示', hi.monthly.pensionClamped, 650000);
  const lo = E.compute(data, baseInput({ directStandard: 50000, gross: 50000 }));
  eq('方式b 厚年は88,000円が下限', lo.monthly.standardPension, 88000);
  eq('方式b 厚年 クランプ表示（下限）', lo.monthly.pensionClamped, 88000);
}

/* ---------- 第4弾 方式(c) との一致（月給版の本人負担。§0） ---------- */
{
  // 賞与ツール方式(c)の期待値: 総支給額350,000円・東京・40歳未満・一般
  // 健康保険料 17,730／支援金 414／厚生年金 32,940／雇用保険 1,750／合計 52,834
  const r = E.compute(data, baseInput({ salaryMode: 'gross', gross: 350000 }));
  const m = r.monthly;
  eq('方式c一致 標準報酬月額', m.standardHealth, 360000);
  eq('方式c一致 健康保険料 本人', m.items.health.insured, 17730);
  eq('方式c一致 支援金 本人', m.items.child.insured, 414);
  eq('方式c一致 厚生年金 本人', m.items.pension.insured, 32940);
  eq('方式c一致 雇用保険 本人', m.items.employment.insured, 1750);
  eq('方式c一致 本人合計（雇用保険を除く内訳も一致）',
    m.items.health.insured + m.items.child.insured + m.items.care.insured + m.items.pension.insured + m.items.employment.insured, 52834);
}

console.log(fails === 0 ? 'ALL SHAHO CHECKS PASSED' : `${fails} FAILURES`);
process.exit(fails ? 1 : 0);
