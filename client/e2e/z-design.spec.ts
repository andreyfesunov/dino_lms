import { test, expect, Page, Browser } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const output = resolve(__dirname, '../../.run/design-review/actual');
const viewports = [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
];
const course = 'zzy-design-review';

async function login(page: Page, login = 'admin@example.test', password = 'correct horse') {
  if (login === 'admin@example.test') {
    const bootstrap = await (await page.request.get('/api/bootstrap')).json();
    if (!bootstrap.has_admin) {
      expect(
        (
          await page.request.post('/api/setup', {
            data: { login, password, first_name: 'Admin', last_name: 'User' },
          })
        ).ok(),
      ).toBeTruthy();
    }
  }
  await page.goto('/login');
  await page.locator('[name="login"]').fill(login);
  await page.locator('[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/(courses|onboarding)$/);
}

async function screenshots(page: Page, name: string, dialog = false) {
  mkdirSync(output, { recursive: true });
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => document.fonts.ready);
    if (dialog) await expect(page.getByRole('dialog')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth), name).toBe(
      viewport.width,
    );
    const target = dialog ? page.getByRole('dialog') : page;
    await target.screenshot({
      path: resolve(output, `${name}-${viewport.width}.png`),
      animations: 'disabled',
    });
    if (dialog) {
      const bounds = (await page.getByRole('dialog').boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
    }
  }
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth), `${name} at 320px`).toBe(
    320,
  );
  await page.setViewportSize(viewports[0]);
}

async function russianContext(browser: Browser) {
  const context = await browser.newContext({ locale: 'ru-RU' });
  await context.addCookies([{ name: 'lang', value: 'ru', url: 'http://localhost:4201' }]);
  return context;
}

test('public design screens at desktop, tablet and mobile', async ({ browser }) => {
  test.setTimeout(120000);
  const context = await russianContext(browser);
  const page = await context.newPage();
  await page.route('**/api/bootstrap', (route) =>
    route.fulfill({
      json: { has_admin: false, user: null, software_version: '0.1.0' },
    }),
  );
  await page.goto('/');
  await expect(page.locator('app-welcome')).toBeVisible();
  await screenshots(page, 'welcome');
  await page.goto('/setup');
  await expect(page.locator('app-setup form')).toBeVisible();
  await screenshots(page, 'setup');
  await page.goto('/login');
  await expect(page.locator('app-login form')).toBeVisible();
  await screenshots(page, 'login');
  await context.close();
});

test('admin design screens, chapter accordion and code clipboard', async ({ browser }) => {
  test.setTimeout(120000);
  const context = await russianContext(browser);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await login(page);
  for (const [name, route, ready] of [
    ['courses', '/courses', 'app-courses h1'],
    ['users', '/users', 'app-users tbody tr'],
    ['settings', '/settings', '[name="firstName"]'],
    ['create-student', '/students/new', 'app-create-student form'],
    ['calls', '/calls', 'app-calls h1'],
    ['course', `/courses/${course}`, '.chapter-card'],
    ['lesson', `/courses/${course}/intro/overview`, '.md-body pre button'],
    ['lesson-media', '/courses/python-basics/getting-started/install', 'video'],
    ['call-settings', `/courses/${course}/intro/consultation`, 'app-call-lesson'],
  ]) {
    await page.goto(route);
    await expect(page.locator(ready).first()).toBeVisible();
    await screenshots(page, name);
  }
  await page.goto(`/courses/${course}`);
  const cards = page.locator('.chapter-card');
  await expect(cards).toHaveCount(3);
  await expect(page.locator('[id^="chapter-lessons-"]')).toHaveCount(0);
  await cards.nth(0).getByRole('button').click();
  await expect(page.locator('#chapter-lessons-intro')).toContainText('Как устроен курс');
  await cards.nth(1).getByRole('button').click();
  await expect(page.locator('#chapter-lessons-intro')).toHaveCount(0);
  await expect(page.locator('#chapter-lessons-empty')).toHaveText('Занятия скоро появятся');
  await cards.nth(1).getByRole('button').click();
  await expect(page.locator('[id^="chapter-lessons-"]')).toHaveCount(0);
  await page.goto(`/courses/${course}/intro/overview`);
  const code = page.locator('.md-body pre code').first();
  const source = await code.textContent();
  await page.getByRole('button', { name: 'Копировать', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Скопировано', exact: true })).toBeVisible();
  expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe(
    source?.replace(/\r\n/g, '\n'),
  );
  await expect(page.locator('app-lesson')).toContainText('Глава 1 · Занятие 1 из 2');
  expect(errors).toEqual([]);
  await context.close();
});

test('user dialogs match design and retain keyboard focus', async ({ browser }) => {
  test.setTimeout(120000);
  const context = await russianContext(browser);
  const page = await context.newPage();
  await login(page);
  const response = await page.request.post('/api/students', {
    data: { login: `design-${Date.now()}@example.test`, password: 'design password' },
  });
  expect(response.ok()).toBeTruthy();
  const student = await response.json();
  await page.goto('/users');
  await page.locator('input[type="search"]').fill(student.login);
  const row = page.locator('tbody tr');
  await expect(row).toHaveCount(1);
  await row.getByRole('button', { name: /Действия/ }).click();
  await page
    .locator('[popover]:popover-open')
    .getByRole('button', { name: 'Редактировать', exact: true })
    .click();
  await screenshots(page, 'edit-user', true);
  const dialog = page.getByRole('dialog');
  const last = dialog.getByRole('button', { name: 'Сохранить', exact: true });
  await last.focus();
  await page.keyboard.press('Tab');
  expect(
    await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null),
  ).toBe(true);
  await page.keyboard.press('Shift+Tab');
  await expect(last).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(row.getByRole('button', { name: /Действия/ })).toBeFocused();
  await row.getByRole('button', { name: /Действия/ }).click();
  await page
    .locator('[popover]:popover-open')
    .getByRole('button', { name: /пароль/i })
    .click();
  await screenshots(page, 'new-password', true);
  await page.keyboard.press('Escape');
  await row.getByRole('button', { name: /Действия/ }).click();
  await page
    .locator('[popover]:popover-open')
    .getByRole('button', { name: 'Удалить', exact: true })
    .click();
  await screenshots(page, 'delete-user', true);
  await page.keyboard.press('Escape');
  await page.locator('app-users > section > div').first().getByRole('button').click();
  await screenshots(page, 'invite-users', true);
  await page.getByRole('dialog').locator('textarea').fill(`invite-${Date.now()}@example.test`);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Добавить 1/ })
    .click();
  await expect(page.getByRole('dialog')).toContainText('Аккаунты созданы');
  await screenshots(page, 'invite-credentials', true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await context.close();
});

test('onboarding, student locks and access dialogs at all screen sizes', async ({ browser }) => {
  test.setTimeout(120000);
  const context = await russianContext(browser);
  const admin = await context.newPage();
  await login(admin);
  const response = await admin.request.post('/api/students', {
    data: { login: `learner-${Date.now()}@example.test`, password: 'learner password' },
  });
  expect(response.ok()).toBeTruthy();
  const student = await response.json();
  expect(
    (await admin.request.post(`/api/courses/${course}/students/${student.id}`, { data: {} })).ok(),
  ).toBeTruthy();
  await admin.goto('/courses');
  await admin.getByRole('button', { name: 'Доступ студенту', exact: true }).click();
  await screenshots(admin, 'grant-access', true);
  await admin.keyboard.press('Escape');
  await admin.goto(`/courses/${course}`);
  await admin.getByRole('button', { name: 'Управление доступом', exact: true }).click();
  await expect(admin.getByRole('dialog').getByRole('switch')).toHaveCount(3);
  await screenshots(admin, 'chapter-access', true);
  const studentContext = await russianContext(browser);
  const learner = await studentContext.newPage();
  await login(learner, student.login, 'learner password');
  await expect(learner).toHaveURL(/\/onboarding$/);
  await screenshots(learner, 'onboarding');
  await learner.locator('[name="firstName"]').fill('Александр');
  await learner.locator('[name="lastName"]').fill('ОченьДлиннаяФамилияСтудента');
  await learner.locator('button[type="submit"]').click();
  await expect(learner).toHaveURL(/\/courses$/);
  await screenshots(learner, 'student-courses');
  await learner.goto(`/courses/${course}`);
  const locked = learner.locator('.chapter-card').nth(2);
  await expect(locked).not.toContainText('занят');
  await expect(locked.getByRole('button')).toHaveCount(0);
  await expect(learner.getByText('Запросить доступ', { exact: true })).toHaveCount(0);
  await screenshots(learner, 'student-course');
  await learner.goto(`/courses/${course}/intro/consultation`);
  await expect(learner.locator('app-call-lesson')).toBeVisible();
  await screenshots(learner, 'student-call');
  await learner.goto('/users');
  await expect(learner).toHaveURL(/\/courses$/);
  await studentContext.close();
  await context.close();
});
