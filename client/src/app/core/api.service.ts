import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import {
  BootstrapResponse,
  AccountSession,
  CourseDetail,
  CourseListItem,
  InviteResponse,
  LessonResponse,
  UserResponse,
  CallKey,
  CallSettings,
  CallWindow,
  CallBooking,
} from './api.types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private callPath(k: CallKey) {
    return `/api/courses/${encodeURIComponent(k.course_id)}/${encodeURIComponent(k.chapter_id)}/${encodeURIComponent(k.lesson_id)}/calls`;
  }
  callSettings(k: CallKey) {
    return this.request<CallSettings>('GET', this.callPath(k) + '/settings');
  }
  saveCallSettings(k: CallKey, settings: CallSettings) {
    return this.request<CallSettings>('PUT', this.callPath(k) + '/settings', settings);
  }
  callTeachers() {
    return this.request<{ teachers: { id: string; name: string }[] }>('GET', '/api/calls/teachers');
  }
  callSlots(k: CallKey, from: number, to: number, except = '') {
    const params = new URLSearchParams({ from: String(from), to: String(to), except });
    return this.request<{ slots: CallWindow[] }>('GET', this.callPath(k) + '/slots?' + params);
  }
  calls() {
    return this.request<{ calls: CallBooking[] }>('GET', '/api/calls');
  }
  bookCall(k: CallKey, starts_at: number) {
    return this.request<CallBooking>('POST', this.callPath(k), { starts_at });
  }
  changeCall(
    call: CallBooking,
    action: string,
    patch: { starts_at?: number; meeting_url?: string } = {},
  ) {
    return this.request<CallBooking>('POST', `/api/calls/${encodeURIComponent(call.id)}`, {
      action,
      version: call.version,
      ...patch,
    });
  }
  private http = inject(HttpClient);
  private pending = 0;
  readonly loading = signal(false);

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    this.pending++;
    this.loading.set(true);
    try {
      return await firstValueFrom(
        this.http
          .request<T>(method, path, {
            body: body ?? null,
            responseType: 'json',
            withCredentials: true,
          })
          .pipe(timeout(15000)),
      );
    } catch (error) {
      if (error instanceof HttpErrorResponse) {
        const code =
          typeof error.error === 'object' && error.error !== null
            ? String(error.error['code'] ?? 'internal')
            : 'network';
        throw new ApiError(error.status, code);
      }
      throw error;
    } finally {
      this.pending = Math.max(0, this.pending - 1);
      this.loading.set(this.pending > 0);
    }
  }

  bootstrap() {
    return this.request<BootstrapResponse>('GET', '/api/bootstrap');
  }

  setup(login: string, password: string, firstName?: string, lastName?: string) {
    return this.request<{ user: UserResponse }>('POST', '/api/setup', {
      login,
      password,
      first_name: firstName,
      last_name: lastName,
    });
  }

  login(login: string, password: string) {
    return this.request<{ user: UserResponse }>('POST', '/api/login', {
      login,
      password,
    });
  }

  logout() {
    return this.request<{ ok: boolean }>('POST', '/api/logout');
  }

  me() {
    return this.request<{ user: UserResponse }>('GET', '/api/me');
  }

  sessions() {
    return this.request<{ sessions: AccountSession[] }>('GET', '/api/me/sessions');
  }

  revokeSession(id: string) {
    return this.request<{ ok: boolean }>('DELETE', `/api/me/sessions/${encodeURIComponent(id)}`);
  }

  revokeOtherSessions() {
    return this.request<{ ok: boolean }>('POST', '/api/me/sessions/revoke-others');
  }

  onboarding(firstName: string, lastName: string) {
    return this.request<{ user: UserResponse }>('POST', '/api/onboarding', {
      first_name: firstName,
      last_name: lastName,
    });
  }

  updateProfile(firstName: string, lastName: string, currentPassword: string, newPassword: string) {
    return this.request<{ user: UserResponse }>('PUT', '/api/me/profile', {
      first_name: firstName,
      last_name: lastName,
      current_password: currentPassword,
      new_password: newPassword,
    });
  }

  users(query?: string, status?: string) {
    const params = new URLSearchParams();
    if (query) {
      params.set('query', query);
    }
    if (status) {
      params.set('status', status);
    }
    const qs = params.toString();
    return this.request<{ users: UserResponse[] }>('GET', '/api/users' + (qs ? `?${qs}` : ''));
  }

  invite(emails: string[]) {
    return this.request<InviteResponse>('POST', '/api/users/invite', {
      emails,
    });
  }

  updateUser(
    id: string,
    patch: {
      first_name?: string | null;
      last_name?: string | null;
      role?: string;
      status?: string;
    },
  ) {
    return this.request<{ user: UserResponse }>('POST', `/api/users/${id}`, patch);
  }

  courseStudents(course: string) {
    return this.request<{ students: string[] }>('GET', `/api/courses/${course}/students`);
  }

  generatePassword(id: string) {
    return this.request<{ login: string; temporary_password: string }>(
      'POST',
      `/api/users/${id}/password`,
    );
  }

  bulkDelete(ids: string[]) {
    return this.request<{ deleted: number }>('POST', '/api/users/bulk-delete', {
      ids,
    });
  }

  createStudent(login: string, password?: string) {
    return this.request<{ id: string; login: string; temporary_password?: string }>(
      'POST',
      '/api/students',
      password ? { login, password } : { login },
    );
  }

  courses() {
    return this.request<{ courses: CourseListItem[] }>('GET', '/api/courses');
  }

  course(id: string) {
    return this.request<CourseDetail>('GET', `/api/courses/${id}`);
  }

  lesson(course: string, chapter: string, lesson: string) {
    return this.request<LessonResponse>('GET', `/api/courses/${course}/${chapter}/${lesson}`);
  }

  progress(course: string, chapter: string, lesson: string, done: boolean) {
    return this.request<{ done: boolean; progress: number }>(
      'POST',
      `/api/courses/${course}/${chapter}/${lesson}/progress`,
      { done },
    );
  }

  studentChapters(course: string, userId: string) {
    return this.request<{ open_chapters: string[] }>(
      'GET',
      `/api/courses/${course}/students/${userId}/chapters`,
    );
  }

  setStudentChapter(course: string, userId: string, chapterId: string, open: boolean) {
    return this.request<{ open_chapters: string[] }>(
      'POST',
      `/api/courses/${course}/students/${userId}/chapters`,
      { chapter_id: chapterId, open },
    );
  }
}
