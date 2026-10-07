import { test, expect } from '@playwright/test';

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
  const languageBounds = (await page.locator('select[name="language"]').boundingBox())!;
  const passwordBounds = (await page.locator('[name="currentPassword"]').boundingBox())!;
  expect(languageBounds.y + languageBounds.height).toBeLessThan(passwordBounds.y);
  await page.locator('select[name="language"]').selectOption('ru');
  const logoutResponse = page.waitForResponse(
    (response) => response.url().endsWith('/api/logout') && response.request().method() === 'POST',
  );
  await page.locator('nav').getByRole('button', { name: 'Выйти', exact: true }).click();
  expect((await logoutResponse).ok()).toBeTruthy();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/settings');
  await expect(page).toHaveURL(/\/login$/);
});
