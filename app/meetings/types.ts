export type Todo = { id: string; text: string; done: boolean; due_date?: string };

export type TaskStatus   = '대기' | '진행중' | '완료';
export type TaskPriority = '중요' | '긴급' | '보통' | '낮음';
export type TaskSecurity = '공개' | '내부' | '기밀';

export type MeetingRow = {
  id: string;
  title: string;
  category: string;
  content: string;
  todos: Todo[];
  meeting_date: string;
  status: TaskStatus;
  priority: TaskPriority;
  security_level: TaskSecurity;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  /** 서버에서 주입 — 현재 사용자의 열람 가능 여부 */
  accessible?: boolean;
};

export const CATEGORIES = ['마케팅관련', '영업관련', '정책관련', '공급관련', '기타'] as const;
export const STATUSES:         readonly TaskStatus[]   = ['대기', '진행중', '완료'];
export const PRIORITIES:       readonly TaskPriority[] = ['중요', '긴급', '보통', '낮음'];
export const SECURITY_LEVELS:  readonly TaskSecurity[] = ['공개', '내부', '기밀'];

export const SECURITY_META: Record<TaskSecurity, { color: string; bg: string; border: string; desc: string }> = {
  '공개': { color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.3)', desc: '모든 사용자 열람 가능' },
  '내부': { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  border: 'rgba(251,191,36,0.3)',  desc: '지정 사용자만 열람 가능' },
  '기밀': { color: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.3)', desc: '엄선된 사용자만 열람 가능' },
};
