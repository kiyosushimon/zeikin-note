/* 実質時給チェッカー エンジンの検算
 * 基準: 仕様書 tax-tools-spec-11-jikyu.md §6（検算ケース6件）
 * ケース3・6は厚生労働省・大阪労働局の公式例との照合、
 * ケース1・2の手取りは既存エンジン（ShahoEngine・NenchoEngine・SetaiEngine）の
 * 合成による実測値（仕様§6.1・§6.2の内訳どおりかを確認する）。
 * あわせて最低賃金データの発効日切替えの境界を確認する。
 */
const fs = require('fs');
const path = require('path');
const E = require('../js/jikyu-engine.js');
const ZangyoEngine = require('../js/zangyo-engine.js');

function load(p) { return JSON.parse(fs.readFileSync(path.join(__dirname, p), 'utf8')); }
const DATA = {
  tables: load('../data/nencho/tables-2026.json'),
  rules: load('../data/juminzei/rules.json'),
  kenpo: load('../data/kenpo/rates-2026.json'),
  shahoParams: load('../data/shaho/params-2026.json'),
  minwage: load('../data/jikyu/minimum-wage.json')
};
const TODAY = '2026-11-24';

let fails = 0;
function eq(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: expected=${expected} actual=${actual}`);
}
function baseB(over) {
  return Object.assign({
    mode: 'b', prefecture: '東京都', ageBand: 'under40', industry: 'general',
    baseSalary: 0, includeAllowances: 0, excludeAllowances: 0, fixedOvertime: 0,
    variableOvertimeAnnual: 0, bonusPer: 0, bonusCount: 0, minWageTarget: null,
    avgHours: 160, overtimeHours: 0, holidayHours: 0,
    commuteMinutes: null, commuteDays: 0, takeHomeHours: 0
  }, over || {});
}

/* ---------- §6.1 ケース1: 基本ケース（方式b） ---------- */
{
  const r = E.compute(DATA, baseB({
    baseSalary: 300000, bonusPer: 300000, bonusCount: 2, overtimeHours: 20
  }), TODAY);
  eq('ケース1 エラーなし', r.errors.length, 0);
  eq('ケース1 年収', r.annualIncome, 4200000);
  eq('ケース1 年間総労働時間', r.totalHours, 2160);
  eq('ケース1 所定時給', r.prescribedRate, 1875);
  eq('ケース1 実質時給（額面）', r.grossRate, 1944.4);
  eq('ケース1 標準報酬月額の基礎（月給目安）', r.net.monthlyGross, 300000);
  eq('ケース1 健康保険料', r.net.social.health, 206850);
  eq('ケース1 子ども・子育て支援金', r.net.social.child, 4830);
  eq('ケース1 厚生年金保険料', r.net.social.pension, 384300);
  eq('ケース1 雇用保険料', r.net.social.employment, 21000);
  eq('ケース1 介護保険料（40歳未満は0）', r.net.social.care, 0);
  eq('ケース1 社会保険料 合計', r.net.social.total, 616980);
  eq('ケース1 所得税', r.net.incomeTax, 64400);
  eq('ケース1 住民税', r.net.residentTax, 189800);
  eq('ケース1 年間手取り', r.net.net, 3328820);
  eq('ケース1 実質時給（手取り）', r.netRate, 1541.1);
  eq('ケース1 最低賃金チェック（対象賃金は初期値=算定基礎）', r.minWageUsedDefault, true);
  eq('ケース1 最低賃金チェック 判定', r.minWage.ok, true);
  eq('ケース1 最低賃金（東京・令和8年度）', r.minWage.minWage, 1280);
}

/* ---------- §6.2 ケース2: 固定残業代があるケース（方式b） ---------- */
{
  const r = E.compute(DATA, baseB({
    baseSalary: 250000, fixedOvertime: 50000, overtimeHours: 30
  }), TODAY);
  eq('ケース2 年収（固定残業代を含む）', r.annualIncome, 3600000);
  eq('ケース2 年間総労働時間（実際の残業で計算）', r.totalHours, 2280);
  eq('ケース2 算定基礎の月額（固定分を除く）', r.baseMonthly, 250000);
  eq('ケース2 所定時給（50銭ルール）', r.prescribedRate, 1563);
  eq('ケース2 実質時給（額面）', r.grossRate, 1578.9);
  eq('ケース2 社会保険料 合計', r.net.social.total, 528840);
  eq('ケース2 健康保険料', r.net.social.health, 177300);
  eq('ケース2 子ども・子育て支援金', r.net.social.child, 4140);
  eq('ケース2 厚生年金保険料', r.net.social.pension, 329400);
  eq('ケース2 雇用保険料', r.net.social.employment, 18000);
  eq('ケース2 所得税', r.net.incomeTax, 44400);
  eq('ケース2 住民税', r.net.residentTax, 150600);
  eq('ケース2 年間手取り', r.net.net, 2876160);
  eq('ケース2 実質時給（手取り）', r.netRate, 1261.5);
  eq('ケース2 最低賃金チェック 対象賃金', r.minWage.targetMonthly, 250000);
  eq('ケース2 最低賃金チェック 時間額', r.minWage.hourly, 1562.5);
  eq('ケース2 最低賃金チェック 判定', r.minWage.ok, true);
}

/* ---------- §6.3 ケース3: 公式例の再現（厚生労働省 特設サイト） ---------- */
{
  const fake = { prefectures: { 'テスト県': [{ from: '2020-01-01', amount: 1000 }] } };
  const avg = 250 * 8 / 12; /* 166.666…時間 */
  const chk = E.minWageCheck(fake, 'テスト県', 180000, avg, TODAY);
  eq('ケース3 時間額（公式例と一致）', chk.hourly, 1080);
  eq('ケース3 判定は満たす', chk.ok, true);
  eq('ケース3 最低賃金額', chk.minWage, 1000);
}

/* ---------- §6.4 ケース4: 通勤時間込みの参考値 ---------- */
{
  const r = E.compute(DATA, baseB({
    baseSalary: 300000, bonusPer: 300000, bonusCount: 2, overtimeHours: 20,
    commuteMinutes: 45, commuteDays: 20, takeHomeHours: 0
  }), TODAY);
  eq('ケース4 月の通勤時間', r.reference.monthlyHours, 30);
  eq('ケース4 年間の参考時間', r.reference.annualHours, 360);
  eq('ケース4 参考時給（額面）', r.reference.grossRate, 1666.7);
  eq('ケース4 参考時給（手取り）', r.reference.netRate, 1321.0);
  eq('ケース4 本体の額面時給は変わらない', r.grossRate, 1944.4);
}

/* ---------- §6.5 ケース5: 方式(a)（年収の直接入力） ---------- */
{
  const r = E.compute(DATA, {
    mode: 'a', annualGross: 5000000, aSocial: null, aIncomeTax: null, aResidentTax: null,
    avgHours: 170, overtimeHours: 25, holidayHours: 0,
    commuteMinutes: null, commuteDays: 0, takeHomeHours: 0
  }, TODAY);
  eq('ケース5 年間総労働時間', r.totalHours, 2340);
  eq('ケース5 実質時給（額面）', r.grossRate, 2136.8);
  eq('ケース5 所定時給は出さない', r.prescribedRate, null);
  eq('ケース5 最低賃金チェックは出さない', r.minWage, null);
  eq('ケース5 手取りは出さない（税・社保未入力）', r.net, null);

  /* A2〜A4 がすべて入力された場合のみ手取りを出す（仕様§1.4・§3-5） */
  const r2 = E.compute(DATA, {
    mode: 'a', annualGross: 5000000, aSocial: 700000, aIncomeTax: 100000, aResidentTax: 250000,
    avgHours: 170, overtimeHours: 25, holidayHours: 0,
    commuteMinutes: null, commuteDays: 0, takeHomeHours: 0
  }, TODAY);
  eq('ケース5 手取り（引き算のみ）', r2.net.net, 3950000);
  eq('ケース5 手取り時給', r2.netRate, 1688.0);
  const r3 = E.compute(DATA, {
    mode: 'a', annualGross: 5000000, aSocial: 700000, aIncomeTax: null, aResidentTax: 250000,
    avgHours: 170, overtimeHours: 25, holidayHours: 0,
    commuteMinutes: null, commuteDays: 0, takeHomeHours: 0
  }, TODAY);
  eq('ケース5 一部未入力なら手取りは出さない', r3.net, null);
}

/* ---------- §6.6 ケース6: 公式例の再現2（大阪労働局、満たない側） ---------- */
{
  const chk = E.minWageCheck(DATA.minwage, '大阪府', 206800, 168.125, TODAY);
  eq('ケース6 時間額（小数第2位まで切り捨て・公式表示と一致）', chk.hourly, 1230.03);
  eq('ケース6 大阪府の最低賃金（令和8年度）', chk.minWage, 1231);
  eq('ケース6 判定は満たない', chk.ok, false);

  /* 方式(b) の本体計算でも同じチェックになること */
  const r = E.compute(DATA, baseB({
    prefecture: '大阪府', baseSalary: 206800, avgHours: 168.125, minWageTarget: 206800
  }), TODAY);
  eq('ケース6 本体計算の時間額', r.minWage.hourly, 1230.03);
  eq('ケース6 本体計算の判定', r.minWage.ok, false);
  eq('ケース6 対象賃金を直接入力したので初期値ではない', r.minWageUsedDefault, false);
}

/* ---------- 最低賃金データ: 発効日切替えの境界 ---------- */
{
  eq('境界 岩手県 2026-11-30 は令和7年度額', E.minWageOn(DATA.minwage, '岩手県', '2026-11-30').amount, 1031);
  eq('境界 岩手県 2026-12-01 から令和8年度額', E.minWageOn(DATA.minwage, '岩手県', '2026-12-01').amount, 1090);
  eq('境界 熊本県 2026-11-30 は令和7年度額', E.minWageOn(DATA.minwage, '熊本県', '2026-11-30').amount, 1034);
  eq('境界 熊本県 2026-12-01 から令和8年度額', E.minWageOn(DATA.minwage, '熊本県', '2026-12-01').amount, 1092);
  eq('境界 沖縄県 2026-12-01 は令和7年度額', E.minWageOn(DATA.minwage, '沖縄県', '2026-12-01').amount, 1023);
  eq('境界 沖縄県 2026-12-02 から令和8年度額', E.minWageOn(DATA.minwage, '沖縄県', '2026-12-02').amount, 1086);
  eq('境界 東京都 2026-09-30 は令和7年度額', E.minWageOn(DATA.minwage, '東京都', '2026-09-30').amount, 1226);
  eq('境界 東京都 2026-10-01 から令和8年度額', E.minWageOn(DATA.minwage, '東京都', '2026-10-01').amount, 1280);
  eq('境界 京都府 2026-11-15 は令和7年度額', E.minWageOn(DATA.minwage, '京都府', '2026-11-15').amount, 1122);
  eq('境界 京都府 2026-11-16 から令和8年度額', E.minWageOn(DATA.minwage, '京都府', '2026-11-16').amount, 1180);
  eq('境界 秋田県 令和7年度の発効日（2026-03-31）', E.minWageOn(DATA.minwage, '秋田県', '2026-03-31').amount, 1031);
  eq('境界 秋田県 2026-10-13 は令和7年度額', E.minWageOn(DATA.minwage, '秋田県', '2026-10-13').amount, 1031);
  eq('境界 秋田県 2026-10-14 から令和8年度額', E.minWageOn(DATA.minwage, '秋田県', '2026-10-14').amount, 1090);
}

/* ---------- 最低賃金データの整合性 ---------- */
{
  const names = Object.keys(DATA.minwage.prefectures);
  eq('データ 都道府県は47件', names.length, 47);
  let allOk = true;
  names.forEach(function (n) {
    const list = DATA.minwage.prefectures[n];
    if (list.length < 2) allOk = false;
    for (let i = 1; i < list.length; i++) if (list[i].from <= list[i - 1].from) allOk = false;
    if (!DATA.kenpo.prefectures[n]) allOk = false; /* 協会けんぽの都道府県名と一致すること */
  });
  eq('データ 全県に2年度分・発効日は昇順・健保データと名前が一致', allOk, true);
  eq('データ 代表値 東京都（令和8年度）', E.minWageOn(DATA.minwage, '東京都', TODAY).amount, 1280);
  eq('データ 代表値 神奈川県（令和8年度）', E.minWageOn(DATA.minwage, '神奈川県', TODAY).amount, 1279);
  eq('データ 代表値 大阪府（令和8年度）', E.minWageOn(DATA.minwage, '大阪府', TODAY).amount, 1231);
  eq('データ 代表値 北海道（令和8年度）', E.minWageOn(DATA.minwage, '北海道', TODAY).amount, 1131);
  eq('データ 代表値 福岡県（令和8年度）', E.minWageOn(DATA.minwage, '福岡県', TODAY).amount, 1114);
}

/* ---------- 丸め・補助計算（第9弾との一致） ---------- */
{
  eq('丸め 所定時給の50銭ルールは第9弾と一致（1562.5）',
    E.round50(250000 / 160), ZangyoEngine.round50(250000 / 160));
  eq('丸め 50銭ルール（1875ちょうど）', E.round50(300000 / 160), 1875);
  eq('丸め 実質時給は小数第1位まで四捨五入', E.round1(2136.7521), 2136.8);
  eq('丸め 最低賃金の時間額は小数第2位まで切り捨て', E.floor2(1230.0372), 1230.03);
  eq('補助計算 （365−120）×8÷12', E.avgMonthlyHours(120, 8), 163.3);
  eq('補助計算は第9弾と一致', E.avgMonthlyHours(120, 8), ZangyoEngine.avgMonthlyHours(120, 8));
}

/* ---------- 入力エラー ---------- */
{
  const r = E.compute(DATA, baseB({ baseSalary: 300000, avgHours: 0 }), TODAY);
  eq('エラー 所定時間が0ならエラー', r.errors.length > 0, true);
  eq('エラー その場合の額面時給は出さない', r.grossRate, null);
}

console.log(fails === 0 ? 'ALL JIKYU CHECKS PASSED' : `${fails} FAILURES`);
process.exit(fails ? 1 : 0);
