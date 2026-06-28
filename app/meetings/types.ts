export type Todo = { id: string; text: string; done: boolean; due_date?: string };

export type TaskStatus   = '대기' | '진행중' | '완료';
export type TaskPriority = '긴급' | '보통'   | '낮음';

export type MeetingRow = {
  id: string;
  title: string;
  category: string;
  content: string;
  todos: Todo[];
  meeting_date: string;
  status: TaskStatus;
  priority: TaskPriority;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export const CATEGORIES = ['마케팅관련', '영업관련', '정책관련', '공급관련', '기타'] as const;
export const STATUSES:   readonly TaskStatus[]   = ['대기', '진행중', '완료'];
export const PRIORITIES: readonly TaskPriority[] = ['긴급', '보통', '낮음'];
