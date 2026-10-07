import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('fresh welcome, setup, users, grants, student onboarding and progress', async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('app-welcome')).toBeVisible();
  await expect(page.locator('a[href="/setup"]')).toBeVisible();
  await page.getByRole('button', { name: 'RU', exact: true }).click();
  await expect(page.locator('a[href="/setup"]')).toContainText('Создать');
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.locator('a[href="/setup"]').click();
  await page.locator('[name="firstName"]').fill('Admin');
  await page.locator('[name="lastName"]').fill('User');
  await page.locator('[name="email"]').fill('admin@example.test');
  await page.locator('[name="password"]').fill('correct horse');
  await page.locator('[name="confirm"]').fill('correct horse');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/courses$/);
  await expect(page.locator('app-courses')).toBeVisible();

  const response = await page.request.post('/api/students', {
    data: { login: 'student@example.test', password: 'student password' },
  });
  expect(response.ok()).toBeTruthy();
  const student = await response.json();
  await page.reload();
  const coursesResponse = await page.request.get('/api/courses');
  const { courses } = await coursesResponse.json();
  expect(courses.length).toBeGreaterThan(0);
  const course = courses[0];
  await page
    .locator('app-courses button')
    .filter({ has: page.locator('app-icon[name="user-plus"]') })
    .click();
  await page.locator('app-courses select').nth(0).selectOption(student.id);
  await page.locator('app-courses select').nth(1).selectOption(course.id);
  await page
    .locator('app-courses button')
    .filter({ has: page.locator('app-icon[name="check-circle"]') })
    .click();
  await expect(page.locator('app-courses select')).toHaveCount(0);
  const access = await (
    await page.request.get(`/api/courses/${course.id}/students/${student.id}/chapters`)
  ).json();
  expect(access.open_chapters).toEqual(['*']);

  await page.goto('/users');
  await expect(page.locator('app-users')).toContainText('student@example.test');
  await page.goto('/settings');
  await expect(page.locator('[name="firstName"]')).toHaveValue('Admin');
  await page.reload();
  await expect(page.locator('[name="firstName"]')).toHaveValue('Admin');

  const context = await browser.newContext({ locale: 'en-US' });
  const studentPage = await context.newPage();
  studentPage.on('pageerror', (error) => errors.push(error.message));
  await studentPage.goto('http://localhost:4201/login');
  await studentPage.locator('[name="login"]').fill('student@example.test');
  await studentPage.locator('[name="password"]').fill('student password');
  await studentPage.locator('button[type="submit"]').click();
  await expect(studentPage).toHaveURL(/\/onboarding$/);
  await studentPage.reload();
  await studentPage.locator('[name="firstName"]').fill('Student');
  await studentPage.locator('[name="lastName"]').fill('User');
  await studentPage.locator('button[type="submit"]').click();
  await expect(studentPage).toHaveURL(/\/courses$/);
  await studentPage.goto(`http://localhost:4201/courses/${course.id}`);
  await expect(studentPage.locator('app-course-detail')).toBeVisible();
  const detail = await (
    await studentPage.request.get(`http://localhost:4201/api/courses/${course.id}`)
  ).json();
  const chapter = detail.chapters.find((entry: { lessons: unknown[] }) => entry.lessons.length > 0);
  const lesson = chapter.lessons[0];
  await studentPage.goto(`http://localhost:4201/courses/${course.id}/${chapter.id}/${lesson.id}`);
  await expect(studentPage.locator('app-lesson h1').first()).toBeVisible();
  await Promise.all([
    studentPage.waitForResponse(
      (response) => response.url().endsWith('/progress') && response.request().method() === 'POST',
    ),
    studentPage
      .locator('app-lesson button')
      .filter({ has: studentPage.locator('app-icon[name="check-circle"]') })
      .click(),
  ]);
  await studentPage.reload();
  const progress = await (
    await studentPage.request.get(
      `http://localhost:4201/api/courses/${course.id}/${chapter.id}/${lesson.id}`,
    )
  ).json();
  expect(progress.done).toBe(true);
  await studentPage.goto('http://localhost:4201/users');
  await expect(studentPage).toHaveURL(/\/courses$/);
  expect(errors).toEqual([]);
  await context.close();
});

test('bootstrap outage shows retry and does not offer administrator setup', async ({ page }) => {
  await page.route('**/api/bootstrap', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Повторить / Retry' })).toBeVisible();
  await expect(page.locator('app-setup')).toHaveCount(0);
  await page.unroute('**/api/bootstrap');
  await page.getByRole('button', { name: 'Повторить / Retry' }).click();
  await expect(page.locator('app-welcome')).toBeVisible();
  await expect(page.locator('a[href="/login"]')).toBeVisible();
});

test('settings translations, floating user actions and named access controls', async ({ page }) => {
  await page.goto('/login');
  await page.locator('[name="login"]').fill('admin@example.test');
  await page.locator('[name="password"]').fill('correct horse');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/courses$/);

  await page.goto('/settings');
  const language = page.locator('select[name="language"]');
  const bootstrap = await (await page.request.get('/api/bootstrap')).json();
  expect(bootstrap.software_version).toBe(
    readFileSync(resolve(__dirname, '../../VERSION'), 'utf8').trim(),
  );
  await expect(page.getByTestId('software-version')).toHaveText(bootstrap.software_version);
  await language.selectOption('ru');
  await expect(page.locator('[name="currentPassword"]')).toHaveAttribute(
    'placeholder',
    'Введите текущий пароль',
  );
  await expect(page.locator('[name="newPassword"]')).toHaveAttribute(
    'placeholder',
    'Введите новый пароль',
  );
  await expect(page.locator('button[type="submit"]')).toHaveText('Сохранить изменения');
  await page.reload();
  await expect(language).toHaveValue('ru');
  await language.selectOption('en');
  await expect(page.locator('[name="currentPassword"]')).toHaveAttribute(
    'placeholder',
    'Enter your current password',
  );
  await expect(page.locator('[name="newPassword"]')).toHaveAttribute(
    'placeholder',
    'Enter a new password',
  );

  await page.goto('/users');
  await page.locator('input[type="search"]').fill('student@example.test');
  const row = page.locator('tbody tr');
  await expect(row).toHaveCount(1);
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    const checkbox = row.locator('input[type="checkbox"]');
    const rowBounds = (await row.boundingBox())!;
    const checkboxBounds = (await checkbox.boundingBox())!;
    expect(
      Math.abs(checkboxBounds.y + checkboxBounds.height / 2 - rowBounds.y - rowBounds.height / 2),
    ).toBeLessThan(2);
    await checkbox.check();
    const bulk = page.getByTestId('bulk-actions');
    await expect(bulk).toHaveCSS('position', 'fixed');
    expect((await row.boundingBox())!.y).toBeCloseTo(rowBounds.y, 0);
    const bulkBounds = (await bulk.boundingBox())!;
    expect(bulkBounds.x).toBeGreaterThanOrEqual(0);
    expect(bulkBounds.x + bulkBounds.width).toBeLessThanOrEqual(viewport.width);
    expect(bulkBounds.y + bulkBounds.height).toBeLessThan(
      viewport.height - (viewport.width < 768 ? 80 : 0),
    );
    await bulk.getByRole('button', { name: 'Cancel', exact: true }).click();

    const tableScroll = page.locator('table').locator('..');
    const before = await tableScroll.evaluate((el) => el.scrollHeight);
    await row.getByRole('button', { name: /Actions for/ }).click();
    const menu = page.locator('[popover]:popover-open');
    await expect(menu).toBeVisible();
    expect(await tableScroll.evaluate((el) => el.scrollHeight)).toBe(before);
    const menuBounds = (await menu.boundingBox())!;
    expect(menuBounds.x).toBeGreaterThanOrEqual(0);
    expect(menuBounds.x + menuBounds.width).toBeLessThanOrEqual(viewport.width);
    expect(menuBounds.y + menuBounds.height).toBeLessThanOrEqual(viewport.height);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await row.getByRole('button', { name: /Actions for/ }).click();
    await menu.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Edit', exact: true })).toBeVisible();
    await expect(menu).toHaveCount(0);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  }

  const { courses } = await (await page.request.get('/api/courses')).json();
  await page.goto(`/courses/${courses[0].id}`);
  await page.getByRole('button', { name: 'Manage access', exact: true }).click();
  const studentSelect = page.locator('app-course-detail select');
  await expect(studentSelect.locator('option')).toHaveText(['User Student']);
  await expect(page.getByRole('heading', { name: 'Course access: User Student' })).toBeVisible();
  await expect(studentSelect).not.toContainText(/[0-9a-f]{8}-[0-9a-f]{4}-/);

  for (const width of [390, 767]) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of ['/courses', '/users', '/settings']) {
      await page.goto(route);
      const surface = page.locator('main section').first();
      await expect(surface).toBeVisible();
      const bounds = (await surface.boundingBox())!;
      expect(bounds.x).toBe(16);
      expect(width - bounds.x - bounds.width).toBe(16);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    }
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  const longNameResponse = await page.request.put('/api/me/profile', {
    data: { first_name: 'Александр', last_name: 'ОченьДлиннаяФамилияПреподавателя' },
  });
  expect(longNameResponse.ok()).toBeTruthy();
  expect((await longNameResponse.json()).user.short_name).toBe(
    'ОченьДлиннаяФамилияПреподавателя А.',
  );
  await page.reload();
  const profile = page.locator('aside button[title]');
  await expect(profile).toHaveText('ОченьДлиннаяФамилияПреподавателя Александр');
  const name = profile.locator('span').last();
  await expect(name).toHaveCSS('white-space', 'normal');
  expect(await name.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(
    (
      await page.request.put('/api/me/profile', {
        data: { first_name: 'Admin', last_name: 'User' },
      })
    ).ok(),
  ).toBeTruthy();
  await page.reload();
  const languageBounds = (await page.locator('select[name="language"]').boundingBox())!;
  const passwordBounds = (await page.locator('[name="currentPassword"]').boundingBox())!;
  expect(languageBounds.y + languageBounds.height).toBeLessThan(passwordBounds.y);
  await page.locator('select[name="language"]').selectOption('ru');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.locator('aside > div').last().locator('button').last().click();
  const logoutResponse = page.waitForResponse(
    (response) => response.url().endsWith('/api/logout') && response.request().method() === 'POST',
  );
  await page.locator('aside').getByRole('button', { name: 'Выйти', exact: true }).click();
  expect((await logoutResponse).ok()).toBeTruthy();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/settings');
  await expect(page).toHaveURL(/\/login$/);
});

test('call lesson availability, booking, changes, cancellation and completion', async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/login');
  await page.locator('[name="login"]').fill('admin@example.test');
  await page.locator('[name="password"]').fill('correct horse');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/courses$/);
  await page.goto('/settings');
  await page.locator('select[name="language"]').selectOption('en');
  const createUser = async (login: string, role: string) => {
    const response = await page.request.post('/api/students', {
      data: { login, password: 'call password' },
    });
    expect(response.ok()).toBeTruthy();
    const user = await response.json();
    const update = await page.request.post(`/api/users/${user.id}`, {
      data: { role, status: 'active', first_name: role, last_name: 'Calls' },
    });
    expect(update.ok()).toBeTruthy();
    return user;
  };
  const teacher = await createUser('callteacher@example.test', 'teacher');
  await createUser('calllearner@example.test', 'student');
  const path = '/courses/zzz-call-practice/practice/consultation';
  const apiPath = '/api' + path + '/calls';
  await page.goto(path);
  await page.getByLabel('Teacher', { exact: true }).selectOption(teacher.id);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Settings saved');
  const teacherContext = await browser.newContext({ locale: 'en-US' });
  const teacherPage = await teacherContext.newPage();
  teacherPage.on('pageerror', (e) => errors.push(e.message));
  await teacherPage.goto('http://localhost:4201/login');
  await teacherPage.locator('[name="login"]').fill('callteacher@example.test');
  await teacherPage.locator('[name="password"]').fill('call password');
  await teacherPage.locator('button[type="submit"]').click();
  await expect(teacherPage).toHaveURL(/\/courses$/);
  await teacherPage.goto(path);
  await teacherPage.locator('summary').click();
  await teacherPage.getByLabel('Schedule time zone').selectOption('UTC');
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  await teacherPage.getByLabel('Start', { exact: true }).fill(tomorrow + 'T12:00');
  await teacherPage.getByLabel('End', { exact: true }).fill(tomorrow + 'T15:00');
  await teacherPage.getByRole('button', { name: 'Add window', exact: true }).click();
  await teacherPage.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(teacherPage.getByRole('status')).toContainText('Settings saved');
  const cfg = await (await page.request.get(apiPath + '/settings')).json();
  expect(cfg.windows).toHaveLength(1);
  expect(cfg.duration_min).toBe(30);

  const studentContext = await browser.newContext({ locale: 'en-US', timezoneId: 'Europe/Moscow' });
  const studentPage = await studentContext.newPage();
  studentPage.on('pageerror', (e) => errors.push(e.message));
  await studentPage.goto('http://localhost:4201/login');
  await studentPage.locator('[name="login"]').fill('calllearner@example.test');
  await studentPage.locator('[name="password"]').fill('call password');
  await studentPage.locator('button[type="submit"]').click();
  await expect(studentPage).toHaveURL(/\/courses$/);
  await studentPage.goto(path);
  await expect(studentPage.locator('summary')).toHaveCount(0);
  await studentPage.getByLabel('Date', { exact: true }).fill(tomorrow);
  await studentPage.getByRole('button', { name: '15:00–15:30', exact: true }).click();
  await studentPage.getByRole('button', { name: /Confirm/ }).click();
  await expect(studentPage.locator('app-call-card')).toHaveCount(1);
  await expect(studentPage.locator('app-call-slots')).toHaveCount(0);
  expect(
    (
      await studentPage.request.post('/api' + path + '/progress', { data: { done: true } })
    ).status(),
  ).toBe(403);
  const list = await (await studentPage.request.get('/api/calls')).json();
  const call = list.calls[0];
  expect(call.starts_at).toBe(Date.parse(tomorrow + 'T12:00:00Z') / 1000);

  await teacherPage.goto('/calls');
  await teacherPage.getByRole('button', { name: 'Meeting link', exact: true }).click();
  await teacherPage
    .getByLabel('Meeting link', { exact: true })
    .fill('https://meet.example.test/consultation');
  await teacherPage.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(teacherPage.getByRole('link', { name: 'Join call' })).toHaveAttribute(
    'href',
    'https://meet.example.test/consultation',
  );
  await studentPage.goto('/calls');
  await expect(studentPage.getByRole('link', { name: 'Join call' })).toBeVisible();
  await studentPage.getByRole('button', { name: 'Reschedule', exact: true }).click();
  await studentPage.getByLabel('Date', { exact: true }).fill(tomorrow);
  await studentPage.getByRole('button', { name: '15:30–16:00', exact: true }).click();
  await studentPage.getByRole('button', { name: /Confirm/ }).click();
  await expect(studentPage.locator('app-call-slots')).toHaveCount(0);
  await studentPage.getByRole('button', { name: 'Cancel call', exact: true }).click();
  await studentPage.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(studentPage.locator('app-call-card')).toHaveCount(0);
  await studentPage.goto(path);
  await studentPage.getByLabel('Date', { exact: true }).fill(tomorrow);
  await studentPage.getByRole('button', { name: '15:00–15:30', exact: true }).click();
  await studentPage.getByRole('button', { name: /Confirm/ }).click();
  await expect(studentPage.locator('app-call-slots')).toHaveCount(0);
  const newCall = (await (await studentPage.request.get('/api/calls')).json()).calls.find(
    (c: { status: string }) => c.status === 'scheduled',
  );
  // Simulate elapsed time in the isolated fixture rather than waiting for a real call.
  execFileSync('python', [
    '-c',
    "import sqlite3,sys,time; db=sqlite3.connect(sys.argv[1]); now=int(time.time()); db.execute('UPDATE calls SET starts_at=?, ends_at=?, version=version+1 WHERE id=?',(now-3600,now-1800,sys.argv[2])); db.commit(); db.close()",
    process.env['DINO_E2E_DATABASE_PATH']!,
    newCall.id,
  ]);
  await teacherPage.getByRole('button', { name: 'Refresh', exact: true }).click();
  await teacherPage.getByRole('button', { name: 'History', exact: true }).click();
  await teacherPage.getByRole('button', { name: 'Mark as completed', exact: true }).click();
  await expect(
    teacherPage.getByRole('button', { name: 'Mark as completed', exact: true }),
  ).toHaveCount(0);
  await studentPage.reload();
  await expect(studentPage.locator('app-call-slots')).toHaveCount(0);
  const lesson = await (await studentPage.request.get('/api' + path)).json();
  expect(lesson.done).toBe(true);
  for (const p of [teacherPage, studentPage]) {
    await p.setViewportSize({ width: 390, height: 844 });
    await p.goto('/calls');
    expect(await p.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  }
  expect(errors).toEqual([]);
  await studentContext.close();
  await teacherContext.close();
});
