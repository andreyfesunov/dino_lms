import { Injectable, computed, signal } from '@angular/core';
import { UserResponse } from './api.types';

@Injectable({ providedIn: 'root' })
export class SessionStore {
  readonly user = signal<UserResponse | null>(null);
  readonly hasAdmin = signal(false);
  readonly ready = signal(false);

  readonly signedIn = computed(() => this.user() !== null);
  readonly needsOnboarding = computed(() => {
    const user = this.user();
    if (!user) {
      return false;
    }
    return user.status === 'pending' || !user.first_name?.trim() || !user.last_name?.trim();
  });
  readonly isAdmin = computed(() => this.user()?.role === 'admin');
  readonly seesAllCourses = computed(() => {
    const role = this.user()?.role;
    return role === 'admin' || role === 'teacher';
  });

  setUser(user: UserResponse | null): void {
    this.user.set(user);
    this.ready.set(true);
  }

  setHasAdmin(hasAdmin: boolean): void {
    this.hasAdmin.set(hasAdmin);
  }

  clear(): void {
    this.user.set(null);
  }
}
