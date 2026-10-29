import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { EMPTY, of } from 'rxjs';
import { signal } from '@angular/core';
import { LessonPage } from './lesson.page';
import { ApiService } from '../../core/api.service';
import { I18nService } from '../../core/i18n.service';
import { LessonResponse, UserResponse } from '../../core/api.types';
import { SessionStore } from '../../core/session.store';
import { vi } from 'vitest';

describe('lesson media', () => {
  it('renders videos and YouTube cards between the surrounding text without duplicates', async () => {
    await TestBed.configureTestingModule({
      imports: [LessonPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: EMPTY } },
        { provide: ApiService, useValue: {} },
        { provide: I18nService, useValue: { locale: signal('en'), format: (key: string) => key } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(LessonPage);
    fixture.componentInstance.loading.set(false);
    fixture.componentInstance.lesson.set({
      type: 'article',
      course: { id: 'course', title: 'Course' },
      chapter: { id: 'chapter', title: 'Chapter' },
      id: 'intro',
      title: 'Intro',
      html: '<p>Legacy body</p>',
      durationMin: null,
      done: false,
      videos: [{ url: '/media/clip.mp4', file: 'clip.mp4' }],
      youtube: [
        {
          url: 'https://youtu.be/dQw4w9WgXcQ',
          title: 'Watch',
          channel: 'Channel',
          thumbnail: null,
        },
      ],
      blocks: [
        { type: 'html', html: '<p>Before</p>', index: 0 },
        { type: 'video', index: 0 },
        { type: 'html', html: '<p>Between</p>', index: 0 },
        { type: 'youtube', index: 0 },
        { type: 'html', html: '<p>After</p>', index: 0 },
      ],
      attachments: [],
      chapter_index: 1,
      chapter_lesson_index: 1,
      chapter_total_lessons: 1,
      index: 1,
      total: 1,
      prev: null,
      next: null,
    } satisfies LessonResponse);
    fixture.detectChanges();
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    const sequence = Array.from(element.querySelectorAll('.md-body, video, a[target="_blank"]'));
    expect(sequence.map((node) => node.tagName)).toEqual(['DIV', 'VIDEO', 'DIV', 'A', 'DIV']);
    expect(sequence[0].textContent).toBe('Before');
    expect(sequence[2].textContent).toBe('Between');
    expect(sequence[4].textContent).toBe('After');
    expect(sequence[1].getAttribute('src')).toBe('/media/clip.mp4');
    expect(sequence[3].textContent).toContain('Watch');
    expect(element.textContent).not.toContain('Legacy body');
  });
});

describe('practice lesson access', () => {
  for (const role of ['admin', 'teacher', 'student'] as const) {
    it(`loads materials as ${role} and requests submissions only for students`, async () => {
      const lesson: LessonResponse = {
        type: 'practice',
        course: { id: 'course', title: 'Course' },
        chapter: { id: 'chapter', title: 'Chapter' },
        id: 'assignment',
        title: 'Assignment',
        html: '<p>Build the recipe catalog</p>',
        durationMin: null,
        done: false,
        videos: [],
        youtube: [],
        attachments: [{ file: 'design.fig', url: '/media/design.fig' }],
        chapter_index: 1,
        chapter_lesson_index: 1,
        chapter_total_lessons: 1,
        index: 1,
        total: 1,
        prev: null,
        next: null,
      };
      const api = {
        lesson: vi.fn().mockResolvedValue(lesson),
        practiceAttempts: vi.fn().mockImplementation(() =>
          role === 'student'
            ? Promise.resolve({ attempts: [], can_submit: true })
            : Promise.reject(new Error('403 forbidden')),
        ),
      };
      await TestBed.configureTestingModule({
        imports: [LessonPage],
        providers: [
          provideRouter([]),
          {
            provide: ActivatedRoute,
            useValue: {
              paramMap: of(convertToParamMap({
                courseId: 'course', chapterId: 'chapter', lessonId: 'assignment',
              })),
            },
          },
          { provide: ApiService, useValue: api },
          { provide: I18nService, useValue: { locale: signal('en'), format: (key: string) => key } },
        ],
      }).compileComponents();
      TestBed.inject(SessionStore).setUser({
        id: role, login: role, role, status: 'active', first_name: 'Test', last_name: 'User',
        display_name: 'Test User', short_name: 'TU',
      } satisfies UserResponse);
      const fixture = TestBed.createComponent(LessonPage);
      fixture.detectChanges();
      await vi.waitFor(() => expect(fixture.componentInstance.loading()).toBe(false));
      await fixture.whenStable();
      fixture.detectChanges();
      const element: HTMLElement = fixture.nativeElement;
      expect(fixture.componentInstance.error()).toBeNull();
      expect(element.textContent).toContain('Build the recipe catalog');
      expect(element.querySelector('a[download="design.fig"]')).not.toBeNull();
      if (role === 'student') {
        expect(api.practiceAttempts).toHaveBeenCalledExactlyOnceWith('course', 'chapter', 'assignment');
        expect(element.querySelector('input[name="repository"]')).not.toBeNull();
      } else {
        expect(api.practiceAttempts).not.toHaveBeenCalled();
        expect(element.textContent).not.toContain('practice-submit-title');
      }
    });
  }
});
