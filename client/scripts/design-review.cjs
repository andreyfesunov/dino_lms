const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../../.run/design-review');
const actual = path.join(root, 'actual');
if (!fs.existsSync(actual)) throw new Error('Run npm run test:e2e -- z-design.spec.ts first.');
const screens = {
  welcome: ['Welcome', 'RnkTR', null, 'D3dQQ'],
  'welcome-first-run': ['Welcome: первый запуск', 'RnkTR', null, 'D3dQQ'],
  login: ['Вход', 'JL0mr', 'ncOPA', 'qUdux'],
  setup: ['Первый администратор', 'C0E96', null, 'r9X8C1'],
  onboarding: ['Онбординг', 'OB7JL', null, 'W4Q93l'],
  courses: ['Курсы', 'zRwci', null, 'WmTQ1'],
  'student-courses': ['Курсы студента', 'zRwci', null, 'WmTQ1'],
  course: ['Страница курса', 'S36Ija', null, 'm8cZcM'],
  'student-course': ['Страница курса студента', 'S36Ija', null, 'm8cZcM'],
  lesson: ['Занятие', 'vc6DH', null, 'HrkQZ'],
  'lesson-media': ['Занятие: видео и материалы', 'vc6DH', null, 'HrkQZ'],
  users: ['Пользователи', 'mIRip', 'Q6ITH', 'yrDdE'],
  settings: ['Настройки', 'wdUQu', null, 'bvcU8'],
  'invite-users': ['Добавление пользователей', 'HhsPt', 'HhsPt', 'HhsPt'],
  'invite-credentials': ['Созданные аккаунты', 'YXVJG', 'YXVJG', 'YXVJG'],
  'edit-user': ['Редактирование пользователя', 'Po867', 'Po867', 'Po867'],
  'new-password': ['Новый пароль', 'fZg0E', 'fZg0E', 'fZg0E'],
  'delete-user': ['Удаление пользователя', 'KRRvc', 'KRRvc', 'KRRvc'],
  'grant-access': ['Назначение курса', 'M5cS24', 'M5cS24', 'M5cS24'],
  'chapter-access': ['Доступ к главам', 'gPxxP', 'gPxxP', 'gPxxP'],
  'create-student': ['Создание студента'],
  calls: ['Список созвонов'],
  'call-settings': ['Настройки созвона'],
  'teacher-availability': ['Доступное время преподавателя'],
  'student-call': ['Созвон студента'],
};
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const sections = fs
  .readdirSync(actual)
  .filter((name) => name.endsWith('.png'))
  .sort()
  .map((file) => {
    const match = /^(.*)-(1440|768|390)\.png$/.exec(file);
    if (!match) return '';
    const [, name, width] = match;
    const screen = screens[name] ?? [name];
    const id = screen[{ 1440: 1, 768: 2, 390: 3 }[width]];
    const reference = id && fs.existsSync(path.join(root, 'reference', `${id}.png`));
    return `<section data-width="${width}" data-name="${escape(screen[0].toLowerCase())}"><h2>${escape(screen[0])} · ${width}px</h2><div class="comparison"><figure><figcaption>Макет ${id ? escape(id) : ''}</figcaption>${reference ? `<a href="reference/${id}.png"><img loading="lazy" src="reference/${id}.png" alt="Макет ${escape(screen[0])}"></a>` : '<p>Отдельного макета для этого экрана или размера нет. Использована общая дизайн-система.</p>'}</figure><figure><figcaption>Реализация</figcaption><a href="actual/${escape(file)}"><img loading="lazy" src="actual/${escape(file)}" alt="Реализация ${escape(screen[0])}"></a></figure></div></section>`;
  })
  .join('\n');
fs.writeFileSync(
  path.join(root, 'index.html'),
  `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dino LMS · Сверка дизайна</title>
<style>body{margin:0;background:#f5f3ee;color:#1b3a28;font:15px system-ui}header{position:sticky;top:0;z-index:1;background:#fff;padding:16px 24px;border-bottom:1px solid #e4e0d8}h1{font-size:24px;margin:0 0 8px}header p{max-width:1000px;font-size:13px;color:#4a6b52}select,input{font:inherit;padding:8px;border:1px solid #e4e0d8;border-radius:8px;margin-right:12px;max-width:100%}main{padding:24px}section{margin:0 0 32px}h2{font-size:18px}.comparison{display:grid;grid-template-columns:1fr 1fr;gap:20px}figure{min-width:0;margin:0;background:#fff;border-radius:12px;padding:12px}figcaption{margin-bottom:12px;font-weight:600}img{display:block;max-width:100%;height:auto;margin:auto}figure p{padding:24px;color:#4a6b52}a{color:inherit}[hidden]{display:none!important}@media(max-width:700px){.comparison{grid-template-columns:1fr}main{padding:12px}}</style>
<header><h1>Dino LMS · Макет и реализация</h1><p>Скриншоты из локальных E2E тестов. Данные тестовые. Содержание курсов и дополнительные рабочие функции отличаются от примеров макета. Экспорт модалок может включать внешнюю тень. Нажмите на изображение, чтобы открыть оригинальный размер.</p><label>Экран <select id="width"><option value="1440">Desktop · 1440</option><option value="768">Tablet · 768</option><option value="390">Mobile · 390</option><option value="all">Все размеры</option></select></label><label>Поиск <input id="search" type="search" placeholder="Название страницы"></label></header><main>${sections}</main><script>const size=document.getElementById('width'),search=document.getElementById('search');function filter(){for(const section of document.querySelectorAll('section'))section.hidden=(size.value!=='all'&&section.dataset.width!==size.value)||!section.dataset.name.includes(search.value.toLowerCase());}size.addEventListener('change',filter);search.addEventListener('input',filter);filter();</script></html>`,
);
console.log(`Design review: ${path.join(root, 'index.html')}`);
