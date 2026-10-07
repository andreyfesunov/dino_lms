// API types mirroring the Go httpapi JSON contracts.

export interface UserResponse {
  id: string;
  login: string;
  role: 'admin' | 'teacher' | 'student';
  status: 'pending' | 'active';
  first_name: string | null;
  last_name: string | null;
  display_name: string;
  short_name: string;
}

export interface BootstrapResponse {
  software_version: string;
  has_admin: boolean;
  user: UserResponse | null;
}

export interface CourseListItem {
  id: string;
  title: string;
  description: string;
  archived: boolean;
  estimated_hours: string | null;
  total_lessons: number;
  progress: number;
  students: number;
}

export interface LessonEntry {
  type: 'article' | 'call';
  chapter_id: string;
  id: string;
  title: string;
  duration_min: number | null;
  done: boolean;
}

export interface ChapterEntry {
  id: string;
  title: string;
  open_by_default: boolean;
  state: 'open' | 'locked';
  progress: number;
  lessons: LessonEntry[];
}

export interface CourseDetail {
  course: CourseListItem;
  chapters: ChapterEntry[];
}

export interface LessonNav {
  course_id: string;
  chapter_id: string;
  lesson_id: string;
  title: string;
}

export interface LessonResponse {
  type: 'article' | 'call';
  course: { id: string; title: string };
  chapter: { id: string; title: string };
  id: string;
  title: string;
  durationMin: number | null;
  html: string;
  videos: { url: string; file: string }[];
  youtube: {
    url: string;
    title: string;
    channel: string;
    thumbnail: string | null;
  }[];
  done: boolean;
  index: number;
  total: number;
  prev: LessonNav | null;
  next: LessonNav | null;
}

export interface CallKey {
  course_id: string;
  chapter_id: string;
  lesson_id: string;
}
export interface CallWindow {
  id: string;
  starts_at: number;
  ends_at: number;
}
export interface CallSettings {
  teacher_id: string;
  teacher_name: string;
  duration_min: number;
  timezone: string;
  version: number;
  windows: CallWindow[];
  can_manage: boolean;
}
export interface CallBooking extends CallKey {
  id: string;
  course_title: string;
  lesson_title: string;
  teacher_id: string;
  student_id: string;
  teacher_name: string;
  student_name: string;
  starts_at: number;
  ends_at: number;
  status: 'scheduled' | 'cancelled' | 'completed';
  meeting_url: string;
  version: number;
}

export interface InvitedAccount {
  id: string;
  login: string;
  temporary_password: string;
}

export interface InviteResponse {
  created: InvitedAccount[];
  skipped: string[];
}
export interface AccountSession {
  id: string;
  current: boolean;
  created_at: number;
  expires_at: number;
  user_agent: string;
}
