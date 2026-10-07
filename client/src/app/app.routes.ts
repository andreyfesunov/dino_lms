import { Routes } from '@angular/router';
import { manageUsersGuard, needsOnboardingGuard, onboardedGuard } from './core/guards';
import { Shell } from './shared/shell';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/welcome/welcome.page').then((m) => m.WelcomePage),
  },
  {
    path: '',
    component: Shell,
    children: [
      {
        path: 'calls',
        canActivate: [onboardedGuard],
        loadComponent: () => import('./pages/calls/calls.page').then((m) => m.CallsPage),
      },
      {
        path: 'courses',
        canActivate: [onboardedGuard],
        loadComponent: () => import('./pages/courses/courses.page').then((m) => m.CoursesPage),
      },
      {
        path: 'courses/:courseId',
        canActivate: [onboardedGuard],
        loadComponent: () =>
          import('./pages/course-detail/course-detail.page').then((m) => m.CourseDetailPage),
      },
      {
        path: 'courses/:courseId/:chapterId/:lessonId',
        canActivate: [onboardedGuard],
        loadComponent: () => import('./pages/lesson/lesson.page').then((m) => m.LessonPage),
      },
      {
        path: 'users',
        canActivate: [manageUsersGuard],
        loadComponent: () => import('./pages/users/users.page').then((m) => m.UsersPage),
      },
      {
        path: 'students/new',
        canActivate: [manageUsersGuard],
        loadComponent: () =>
          import('./pages/create-student/create-student.page').then((m) => m.CreateStudentPage),
      },
      {
        path: 'settings',
        canActivate: [onboardedGuard],
        loadComponent: () => import('./pages/settings/settings.page').then((m) => m.SettingsPage),
      },
    ],
  },
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'setup',
    loadComponent: () => import('./pages/setup/setup.page').then((m) => m.SetupPage),
  },
  {
    path: 'onboarding',
    canActivate: [needsOnboardingGuard],
    loadComponent: () => import('./pages/onboarding/onboarding.page').then((m) => m.OnboardingPage),
  },
  { path: '**', redirectTo: '' },
];
