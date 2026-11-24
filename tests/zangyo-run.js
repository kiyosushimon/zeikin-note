/* 残業代計算・未払いチェック エンジンの検算
 * 基準: 仕様書 tax-tools-spec-09-zangyo.md §6（検算ケース9件）
 * ケース1は山口労働局の公式計算例との照合、ケース2〜9は仕様§1のルールによる期待値。
 */
const E = require('../js/zangyo-engine.js');
let fails = 0;
function eq(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: expected=${expected} actual=${actual}`);
}
function cat(r, key) { return r.categories.find(function (c) { return c.key === key; }); }
function monthlyIn(over) {
  return Object.assign({
    payType: 'monthly', baseSalary: 0, includeAllowances: 0, excludeAllowances: 0,
    fixedOvertime: 0, fixedOvertimeHours: null, avgHours: 0, hourlyWage: 0,
    t1: 0, t2: 0, t3: 0, t4: 0, t5: 0, t6: 0, t7: 0, t8: 0, actualPaid: null
  }, over || {});
}

/* ---------- §6.1 ケース1: 山口労働局の公式計算例 ---------- */
{
  const r = E.compute(monthlyIn({
    baseSalary: 200000, includeAllowances: 5000, avgHours: 173.3,
    t1: 20, t7: 4, t5: 17
  }));
  eq('ケース1 エラーなし', r.errors.length, 0);
  eq('ケース1 算定基礎の月額', r.baseMonthly, 205000);
  eq('ケース1 1時間当たりの賃金', r.hourlyWage, 1183);
  eq('ケース1 時間外手当', cat(r, 'otNormal').amount, 29575);
  eq('ケース1 深夜手当', cat(r, 'nightOnly').amount, 1183);
  eq('ケース1 休日手当', cat(r, 'holiday').amount, 27150);
  eq('ケース1 合計', r.total, 57908);
  eq('ケース1 補助計算 (365-105)*8/12', E.avgMonthlyHours(105, 8), 173.3);
}

/* ---------- §6.2 ケース2: 基本ケース ---------- */
{
  const r = E.compute(monthlyIn({ baseSalary: 300000, avgHours: 160, t1: 20 }));
  eq('ケース2 1時間当たりの賃金', r.hourlyWage, 1875);
  eq('ケース2 残業代', cat(r, 'otNormal').amount, 46875);
  eq('ケース2 合計', r.total, 46875);
}

/* ---------- §6.3 ケース3: 月60時間超 ---------- */
{
  const r = E.compute(monthlyIn({ baseSalary: 300000, avgHours: 160, t1: 70, t3: 10 }));
  eq('ケース3 60時間以下の部分', cat(r, 'otNormal').amount, 140625);
  eq('ケース3 60時間超の部分', cat(r, 'otOver60').amount, 28125);
  eq('ケース3 合計', r.total, 168750);
}

/* ---------- §6.4 ケース4: 深夜・休日の複合 ---------- */
{
  const r = E.compute(monthlyIn({
    baseSalary: 260000, avgHours: 160,
    t1: 14, t2: 4, t5: 10, t6: 2, t7: 5
  }));
  eq('ケース4 1時間当たりの賃金', r.hourlyWage, 1625);
  eq('ケース4 法定時間外', cat(r, 'otNormal').amount, 20313);
  eq('ケース4 法定時間外＋深夜', cat(r, 'otNight').amount, 9750);
  eq('ケース4 法定休日', cat(r, 'holiday').amount, 17550);
  eq('ケース4 法定休日＋深夜', cat(r, 'holidayNight').amount, 5200);
  eq('ケース4 深夜のみ', cat(r, 'nightOnly').amount, 2031);
  eq('ケース4 合計', r.total, 54844);
}

/* ---------- §6.5 ケース5: 除外手当の実質条件 ---------- */
{
  const r = E.compute(monthlyIn({
    baseSalary: 240000, includeAllowances: 40000, excludeAllowances: 25000,
    avgHours: 168, t1: 15
  }));
  eq('ケース5 算定基礎の月額（一律住宅手当は算入）', r.baseMonthly, 280000);
  eq('ケース5 1時間当たりの賃金', r.hourlyWage, 1667);
  eq('ケース5 残業代', cat(r, 'otNormal').amount, 31256);
  /* 参考: 住宅手当まで除外していた場合との差（仕様§6.5） */
  const wrong = E.compute(monthlyIn({
    baseSalary: 240000, includeAllowances: 20000, excludeAllowances: 45000,
    avgHours: 168, t1: 15
  }));
  eq('ケース5 参考の単価', wrong.hourlyWage, 1548);
  eq('ケース5 参考の残業代', wrong.total, 29025);
  eq('ケース5 除外条件の差', r.total - wrong.total, 2231);
}

/* ---------- §6.6 ケース6: 時給制 ---------- */
{
  const r = E.compute(monthlyIn({ payType: 'hourly', hourlyWage: 1200, t1: 12, t2: 3 }));
  eq('ケース6 1時間当たりの賃金', r.hourlyWage, 1200);
  eq('ケース6 深夜でない部分', cat(r, 'otNormal').amount, 13500);
  eq('ケース6 深夜の部分', cat(r, 'otNight').amount, 5400);
  eq('ケース6 合計', r.total, 18900);
}

/* ---------- §6.7 ケース7: 60時間超＋深夜（75%） ---------- */
{
  const r = E.compute(monthlyIn({
    baseSalary: 300000, avgHours: 160,
    t1: 75, t2: 5, t3: 15, t4: 5
  }));
  eq('ケース7 60時間以下・深夜でない', cat(r, 'otNormal').hours, 60);
  eq('ケース7 60時間以下・深夜でない 金額', cat(r, 'otNormal').amount, 140625);
  eq('ケース7 60時間超・深夜でない', cat(r, 'otOver60').amount, 28125);
  eq('ケース7 60時間超・深夜', cat(r, 'otNightOver60').amount, 16406);
  eq('ケース7 合計', r.total, 185156);
}

/* ---------- §6.8 ケース8: 固定残業代の差額チェック ---------- */
{
  const r = E.compute(monthlyIn({
    baseSalary: 250000, fixedOvertime: 50000, fixedOvertimeHours: 20,
    avgHours: 160, t1: 30
  }));
  eq('ケース8 算定基礎は固定残業代を除外', r.baseMonthly, 250000);
  eq('ケース8 1時間当たりの賃金', r.hourlyWage, 1563);
  eq('ケース8 法定の計算額', cat(r, 'otNormal').amount, 58613);
  eq('ケース8 不足額', r.fixedCheck.shortfall, 8613);
  eq('ケース8 固定残業代が相当する時間数', Math.round(r.fixedCheck.coveredHours * 10) / 10, 25.6);
  eq('ケース8 設定時間数分の金額', r.fixedCheck.settingAmount, 39075);
}

/* ---------- §6.9 ケース9: 法定内残業のみ ---------- */
{
  const r = E.compute(monthlyIn({ baseSalary: 300000, avgHours: 160, t8: 10 }));
  eq('ケース9 法定内残業', cat(r, 'withinLegal').amount, 18750);
  eq('ケース9 割増賃金の合計は0', r.premiumTotal, 0);
  eq('ケース9 合計', r.total, 18750);
}

/* ---------- 境界: 50銭ルール ---------- */
{
  eq('50銭ルール 0.5は切上げ', E.round50(0.5), 1);
  eq('50銭ルール 0.49は切捨て', E.round50(0.49), 0);
  eq('50銭ルール 20312.5', E.round50(20312.5), 20313);
  eq('50銭ルール 2031.25', E.round50(2031.25), 2031);
  eq('50銭ルール 1562.5（単価）', E.round50(1562.5), 1563);
}

/* ---------- 境界: 入力の整合性チェック（仕様§1.8-2） ---------- */
{
  const e1 = E.compute(monthlyIn({ baseSalary: 300000, avgHours: 160, t1: 10, t2: 11 }));
  eq('整合性 T2>T1 はエラー', e1.errors.length > 0, true);
  eq('整合性 エラー時は金額を出さない', e1.total, 0);
  const e2 = E.compute(monthlyIn({ baseSalary: 300000, avgHours: 160, t1: 70, t2: 10, t3: 20, t4: 15 }));
  eq('整合性 T4>min(T3,T2) はエラー', e2.errors.length > 0, true);
  const e3 = E.compute(monthlyIn({ baseSalary: 300000, avgHours: 160, t5: 8, t6: 9 }));
  eq('整合性 T6>T5 はエラー', e3.errors.length > 0, true);
  const w1 = E.compute(monthlyIn({ baseSalary: 300000, avgHours: 160, t1: 50, t3: 5 }));
  eq('整合性 T3>0・T1<=60 は警告（計算はする）', w1.warnings.length, 1);
  eq('整合性 警告時も計算する', w1.errors.length, 0);
  const ok60 = E.compute(monthlyIn({ baseSalary: 300000, avgHours: 160, t1: 60 }));
  eq('整合性 T1=60ちょうどは警告なし', ok60.warnings.length, 0);
  eq('整合性 T1=60の金額', ok60.total, 140625);
}

/* ---------- 境界: 未入力・ゼロ ---------- */
{
  const z = E.compute(monthlyIn({ baseSalary: 300000, avgHours: 160 }));
  eq('ゼロ時間 合計0円', z.total, 0);
  const noBase = E.compute(monthlyIn({ avgHours: 160, t1: 10 }));
  eq('基本給なしはエラー', noBase.errors.length > 0, true);
  const noAvg = E.compute(monthlyIn({ baseSalary: 300000, t1: 10 }));
  eq('所定労働時間なしはエラー', noAvg.errors.length > 0, true);
  const noHourly = E.compute(monthlyIn({ payType: 'hourly', t1: 10 }));
  eq('時間給なしはエラー', noHourly.errors.length > 0, true);
}

/* ---------- 差額表示（仕様§1.8-5） ---------- */
{
  const r = E.compute(monthlyIn({ baseSalary: 300000, avgHours: 160, t1: 20, actualPaid: 40000 }));
  eq('差額 本来額', r.diff.expected, 46875);
  eq('差額 不足額', r.diff.diff, 6875);
  const over = E.compute(monthlyIn({ baseSalary: 300000, avgHours: 160, t1: 20, actualPaid: 50000 }));
  eq('差額 実支給が上回る場合はマイナス', over.diff.diff, -3125);
  const none = E.compute(monthlyIn({ baseSalary: 300000, avgHours: 160, t1: 20 }));
  eq('差額 未入力ならnull', none.diff, null);
  eq('固定残業代 未入力ならnull', none.fixedCheck, null);
}

/* ---------- 固定残業代: 不足がない場合 ---------- */
{
  const r = E.compute(monthlyIn({
    baseSalary: 250000, fixedOvertime: 50000, avgHours: 160, t1: 20
  }));
  eq('固定残業代 法定額が下回れば不足0', r.fixedCheck.shortfall, 0);
  eq('固定残業代 設定時間数なしはnull', r.fixedCheck.settingHours, null);
}

console.log(fails === 0 ? 'ALL ZANGYO CHECKS PASSED' : `${fails} FAILURES`);
process.exit(fails ? 1 : 0);
