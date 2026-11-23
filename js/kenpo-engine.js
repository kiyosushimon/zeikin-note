/* 協会けんぽ 任意継続の保険料計算（令和8年度）
   料率は data/kenpo/rates-2026.json（協会けんぽ公式の一次ソースで確認済み）。
   任意継続は全額自己負担。区分ごとに円未満を切り捨てて合算する。 */
(function (global) {
  'use strict';

  function gradeFromSalary(table, monthlySalary) {
    for (var i = 0; i < table.length; i++) {
      var g = table[i];
      if (monthlySalary >= g.range_min && (g.range_max === null || monthlySalary < g.range_max)) return g;
    }
    return table[table.length - 1];
  }

  /* base: 標準報酬月額（上限適用前） / pref: {health_rate, child_rate, care_rate} / withCare: 40〜64歳 */
  function ninniMonthly(data, base, pref, withCare) {
    var capped = Math.min(base, data.cap_standard_remuneration);
    var health = Math.floor(capped * pref.health_rate);
    var child = Math.floor(capped * pref.child_rate);
    var care = withCare ? Math.floor(capped * pref.care_rate) : 0;
    return {
      base: capped,
      cappedApplied: base > data.cap_standard_remuneration,
      health: health,
      child: child,
      care: care,
      total: health + child + care
    };
  }

  global.KenpoEngine = { gradeFromSalary: gradeFromSalary, ninniMonthly: ninniMonthly };
})(typeof window !== 'undefined' ? window : globalThis);
