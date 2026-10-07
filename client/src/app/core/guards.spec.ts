import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { manageUsersGuard, needsOnboardingGuard, onboardedGuard } from './guards';
import { SessionStore } from './session.store';
import { UserResponse } from './api.types';

describe('session guards', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));

  function check(guard: typeof onboardedGuard) {
    const value = TestBed.runInInjectionContext(() =>
      guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );
    return value instanceof UrlTree ? TestBed.inject(Router).serializeUrl(value) : value;
  }

  function signIn(role: UserResponse['role'], firstName: string | null = 'First') {
    TestBed.inject(SessionStore).setUser({
      id: 'id',
      login: 'login',
      role,
      status: 'active',
      first_name: firstName,
      last_name: 'Last',
      display_name: 'Last First',
      short_name: 'Last F.',
    });
  }

  it('sends visitors to login', () => {
    TestBed.inject(SessionStore).setUser(null);
    expect(check(onboardedGuard)).toBe('/login');
    expect(check(manageUsersGuard)).toBe('/login');
  });

  it('keeps an unnamed user on onboarding', () => {
    signIn('student', null);
    expect(check(onboardedGuard)).toBe('/onboarding');
    expect(check(manageUsersGuard)).toBe('/onboarding');
    expect(check(needsOnboardingGuard)).toBe(true);
  });

  it('allows only administrators to manage users', () => {
    for (const role of ['student', 'teacher', 'admin'] as const) {
      signIn(role);
      expect(check(onboardedGuard)).toBe(true);
      expect(check(manageUsersGuard)).toBe(role === 'admin' ? true : '/courses');
      expect(check(needsOnboardingGuard)).toBe('/courses');
    }
  });
});
