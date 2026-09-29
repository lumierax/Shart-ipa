# تغييرات v1.2

هذه النسخة مبنية فوق النسخة المحسّنة التي عدّلها المستخدم، وليست رجوعًا إلى نسخة أقدم.

## أشياء تم الحفاظ عليها

- Heikin Ashi وطريقة حسابها الأساسية.
- تحميل الشموع الأقدم عند التحريك لليسار.
- Pinch zoom على الجوال.
- Zoom / Pan والتحكمات السريعة الموجودة.
- إخفاء وإظهار اللوحات ووضع Focus.
- البحث عن العملات كما هو.
- البنية الحالية للـ My Scripts والـ Backtest والـ Scanner.

## ما تم تطويره

- إصلاح Replay: مصدر ثابت، Step/Back/Play يعمل على كامل التاريخ المخفي، ومزامنة زمنية بين الشارتات دون كشف شموع مستقبلية غير متاحة.
- فريم مستقل داخل رأس كل شارت في Multi-chart.
- قائمة المؤشرات فوق كل شارت: Hide/Show + Settings + Remove + Collapse.
- إعدادات المؤشر أصبحت مرتبطة بالشارت الصحيح مع Reset Defaults.
- Object Tree يدير المؤشرات والسكربتات والرسومات: إخفاء، إعدادات، قفل، حذف.
- سحب محور الوقت بالأسفل لضغط/توسيع الشموع، وسحب محور السعر باليمين لتغيير المقياس.
- Double click على محور الوقت للـ Fit، وعلى محور السعر للـ Auto Scale.
- Price Scale: Linear / Logarithmic / Percentage / Indexed to 100.
- مؤشر آخر سعر ملون على عمود الأسعار وخط متحرك مع السوق.
- القوائم Left / Right / Bottom قابلة لتغيير الحجم بالسحب، والمقاسات تُحفظ.
- تطوير Drawing Manager نفسه بدل إنشاء نظام جديد:
  - Extended Line
  - Horizontal Ray
  - Parallel Channel
  - Advanced Fibonacci Retracement
  - Trend-Based Fib Extension
  - Fib Channel
  - Pitchfork
  - Schiff Pitchfork
  - Modified Schiff Pitchfork
- تحديد الرسم مباشرة ثم Hide / Lock / Duplicate / Delete.
- تطوير Long/Short Position الموجودة نفسها:
  - Entry handle
  - Stop handle
  - Target handle
  - Width handle
  - 1R / 1.5R / 2R / 3R
  - عرض Entry / Stop / Target / النسبة المئوية / R:R.
- Service Worker v3 لمنع بقاء نسخة كاش قديمة بعد التحديث.

## الاختبارات

`npm test` يغطي الآن:

- 24 مؤشرًا مدمجًا.
- Backtest engine.
- Replay controller + الوصول إلى كامل التاريخ عند الإعادة.
- Heikin Ashi formula.
- Long/Short R:R calculations.

كما تم فحص Syntax لكل ملفات JavaScript بـ `node --check`.
