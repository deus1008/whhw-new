export type Todo = { id: string; text: string; done: boolean };

export type MeetingRow = {
  id: string;
  title: string;
  category: string;
  content: string;
  todos: Todo[];
  meeting_date: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export const CATEGORIES = ['마케팅관련', '영업관련', '정책관련', '공급관련', '기타'] as const;
