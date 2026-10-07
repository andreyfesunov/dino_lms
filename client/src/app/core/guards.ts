import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionStore } from '../core/session.store';

export const authGuard: CanActivateFn = () => {
  const session = inject(SessionStore);
  const router = inject(Router);
  if (!session.ready()) {
    return router.createUrlTree(['/']);
  }
  if (!session.signedIn()) {
    return router.createUrlTree(['/login']);
  }
  return true;
};

export const onboardedGuard: CanActivateFn = () => {
  const session = inject(SessionStore);
  const router = inject(Router);
  if (!session.ready()) {
    return router.createUrlTree(['/']);
  }
  if (!session.signedIn()) {
    return router.createUrlTree(['/login']);
  }
  if (session.needsOnboarding()) {
    return router.createUrlTree(['/onboarding']);
  }
  return true;
};

export const needsOnboardingGuard: CanActivateFn = () => {
  const session = inject(SessionStore);
  const router = inject(Router);
  if (!session.ready()) {
    return router.createUrlTree(['/']);
  }
  if (!session.signedIn()) {
    return router.createUrlTree(['/login']);
  }
  if (!session.needsOnboarding()) {
    return router.createUrlTree(['/courses']);
  }
  return true;
};

export const manageUsersGuard: CanActivateFn = () => {
  const session = inject(SessionStore);
  const router = inject(Router);
  if (!session.ready()) {
    return router.createUrlTree(['/']);
  }
  if (!session.signedIn()) {
    return router.createUrlTree(['/login']);
  }
  if (session.needsOnboarding()) {
    return router.createUrlTree(['/onboarding']);
  }
  if (!session.isAdmin()) {
    return router.createUrlTree(['/courses']);
  }
  return true;
};
