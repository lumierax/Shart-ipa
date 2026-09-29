# BCS Chart Studio v1.5.0 — iPhone / GitHub IPA Build

- أضيف دعم بناء iOS باستخدام Capacitor 8.
- أضيف GitHub Actions workflow ينتج IPA غير موقّع جاهزًا للتوقيع الخارجي.
- البناء يستخدم macOS/Xcode على GitHub وليس جهاز المستخدم.
- التطبيق يحتوي ملفات BCS داخله ولا يعتمد على `localhost:8787`.
- أضيف تجهيز تلقائي للـweb bundle الخاص بالجوال.
- أضيف Swift Package Manager بدل CocoaPods في مشروع iOS المولد.
- أضيف دعم safe areas للنوتش وHome Indicator في واجهة الجوال.
- أضيف توليد اختياري لأيقونة iOS من أيقونة BCS الحالية.
- أضيف إصدار iOS متزامن مع `package.json` ورقم build من GitHub Run Number.
- أضيف دليل عربي كامل لبناء IPA وتوقيعه بعد التنزيل.
- لم تُغيّر محركات الشارت والمؤشرات وReplay والرسومات في هذا الإصدار؛ الهدف هو تغليف النسخة الحالية بشكل آمن دون إرجاع تحسيناتها.
