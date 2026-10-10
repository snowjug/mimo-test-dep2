import api from '../api';

export type MarketingTaskStatus = 'planned' | 'in_progress' | 'completed';
export type MarketingTaskPriority = 'low' | 'medium' | 'high';

export interface MarketingTask {
  id: string;
  title: string;
  description: string;
  channel: string;
  priority: MarketingTaskPriority;
  status: MarketingTaskStatus;
  dueAtMs: number | null;
  createdByName: string;
  createdAt: string | { _seconds: number };
  completedAt: (string | { _seconds: number }) | null;
}

export const marketing = {
  login: (email: string, password: string) =>
    api.post<{ token: string; member: { id: string; name: string; role: string; email: string } }>('/marketing/login', { email, password }).then((r) => r.data),

  me: () => api.get<{ member: any; stats: { planned: number; inProgress: number; completed: number } }>('/marketing/me').then((r) => r.data),

  tasks: () => api.get<{ tasks: MarketingTask[] }>('/marketing/tasks').then((r) => r.data.tasks),
  createTask: (body: { title: string; description?: string; channel?: string; priority?: MarketingTaskPriority; dueAtMs?: number | null }) =>
    api.post<{ id: string }>('/marketing/tasks', body).then((r) => r.data),
  updateTask: (taskId: string, body: Partial<Pick<MarketingTask, 'title' | 'description' | 'channel' | 'priority' | 'status'>> & { dueAtMs?: number | null }) =>
    api.patch(`/marketing/tasks/${taskId}`, body).then((r) => r.data),
};
