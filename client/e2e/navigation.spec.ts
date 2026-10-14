import { test, expect } from '@playwright/test';

for (const width of [1440, 768, 390]) {
  test(`navigation highlights the completed route after one click at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const bootstrap = await (await page.request.get('/api/bootstrap')).json();
    if (!bootstrap.has_admin) {
      expect(
        (
          await page.request.post('/api/setup', {
            data: {
              login: 'admin@example.test',
              password: 'correct horse',
              first_name: 'Admin',
              last_name: 'User',
            },
          })
        ).ok(),
      ).toBeTruthy();
    }
    await page.goto('/login');
    await page.locator('[name="login"]').fill('admin@example.test');
    await page.locator('[name="password"]').fill('correct horse');
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/courses$/);
    const nav = page.locator(width < 768 ? '.design-bottom-nav' : 'aside');
    const link = (route: string) => nav.locator(`a[href="/${route}"]:visible`).first();
    const active = async (route: string) => {
      for (const item of ['courses', 'users', 'calls', 'settings']) {
        await expect(link(item)).toHaveClass(
          new RegExp(
            item === route
              ? width < 768
                ? '(?:^| )text-primary(?: |$)'
                : '(?:^| )bg-primary(?: |$)'
              : '(?:^| )text-text-secondary(?: |$)',
          ),
        );
      }
    };
    await active('courses');
    for (const route of ['users', 'calls', 'settings', 'courses', 'settings', 'users']) {
      await link(route).click();
      await expect(page).toHaveURL(new RegExp(`/${route}$`));
      await active(route);
    }
    await page.goBack();
    await expect(page).toHaveURL(/\/settings$/);
    await active('settings');
    await page.goForward();
    await expect(page).toHaveURL(/\/users$/);
    await active('users');
    await link('courses').click();
    await page.locator('.course-card').first().click();
    await expect(page).toHaveURL(/\/courses\/[^/]+$/);
    await active('courses');
    await page.locator('.chapter-card').first().getByRole('button').click();
    await page.locator('[id^="chapter-lessons-"] a').first().click();
    await expect(page.locator('app-lesson').getByRole('heading', { level: 1 })).toBeVisible();
    await active('courses');
    await page.goto('/settings?tab=profile#password');
    await expect(page.locator('app-settings h1')).toBeVisible();
    await active('settings');
    await link('users').click();
    await page
      .locator(
        'app-sidebar a[href="/students/new"]:visible, app-users a[href="/students/new"]:visible',
      )
      .first()
      .click();
    await expect(page).toHaveURL(/\/students\/new$/);
    await active('users');
  });
}
