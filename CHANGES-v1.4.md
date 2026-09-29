# Binance Chart Studio v1.4

## BCS Pro Research Pack

هذا الإصدار يضيف مؤشرات جديدة مكتوبة من الصفر داخل محرك Binance Chart Studio. تم استخدام **الوصف العام للوظائف** في بعض الأدوات التجارية كمرجع لفهم نوع التحليل المطلوب فقط؛ لم يتم نسخ كود مغلق المصدر أو محاولة إعادة بناء معادلة سرية حرفيًا.

### المؤشرات الجديدة

1. **BCS Pro — Harmonic PRZ Scanner**
   - يتعرف على تراكيب XABCD من pivots مؤكدة.
   - يفحص عائلات نسب شائعة ويعرض Potential Reversal Zone وإشارة اكتمال صعودية/هبوطية.

2. **BCS Pro — Pattern Breakout Radar**
   - قنوات انحدار ديناميكية على القمم والقيعان.
   - يراقب الانكماش/التقارب ثم يرصد الاختراقات المؤكدة.

3. **BCS Pro — Institutional Imbalance Pressure**
   - يقيس ضغط فجوات عدم التوازن غير المعاد توازنها.
   - يزن الإزاحة بالحجم وكفاءة الشمعة ويقلل الضغط تدريجيًا عند mitigation.

4. **BCS Pro — Order Block Mitigation Map**
   - يستخرج مناطق Order Block بعد break of structure.
   - يتابع إعادة الاختبار، mitigation، والعمر حتى invalidation.

5. **BCS Pro — Compression / Expansion Regime**
   - يجمع Bollinger width وATR وADX والانحدار لتصنيف السوق إلى ضغط/توسع واتجاه الدفع.

6. **BCS Pro — Momentum Structure Bias**
   - يبني دعمًا ومقاومة من تحولات momentum بدل pivots السعر التقليدية فقط.
   - يعطي إشارات تغير bias عند كسر البنية.

7. **BCS Pro — Projected ATR Volatility Levels**
   - يجمع الشموع في فترة anchor قابلة للتعديل.
   - يعرض مستويات ATR العلوية والسفلية المتكيفة أثناء الفترة الحالية.

8. **BCS Pro — Demand / Supply Zone Engine**
   - يكتشف base + impulse لتكوين Demand/Supply zones.
   - يتابع المناطق النشطة، إعادة الاختبار، والإبطال.

9. **BCS Pro — Weighted Curve Channel**
   - يمزج EMA/WMA/TEMA بأوزان قابلة للتعديل.
   - يبني قناة ATR حول المنحنى المركب.

10. **BCS Pro — Rolling Volume Profile Map**
   - يحسب Rolling POC وVAH وVAL من توزيع الحجم داخل نافذة متحركة.

### مصادر الإلهام الوظيفي العامة

- 10xTrading / TRN-Trading: harmonic & chart-pattern scanning concepts.
- Alien_Algorithms: imbalance pressure, mitigation, liquidity/order-block concepts.
- SimpleCryptoLife: market-structure + compression/expansion regime concepts.
- sbtnc: ATR projection / volatility level concepts.
- SurjeetKakkar: demand/supply zone lifecycle concepts.
- djmad: weighted curve/channel builder concepts.

كل الحسابات داخل هذا الإصدار هي تنفيذ مستقل خاص بـ BCS Pro.

### الاختبارات

- 49 مؤشرًا built-in يتم تشغيلهم ضمن `npm test`.
- Backtest / Replay / Heikin Ashi / Long-Short tests ما زالت تمر.
- تم رفع Service Worker cache إلى إصدار جديد لتجنب بقاء ملفات قديمة في المتصفح.
