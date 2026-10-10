import api from '../api';
import type { TechTask, TaskPriority, TaskStatus } from './technical.service';
import type { MarketingTask, MarketingTaskPriority, MarketingTaskStatus } from './marketing.service';
import type { Employee } from './hr.service';

export interface LoginStreaks {
  [memberKey: string]: string[]; // e.g. "technical_team_dibya" -> ["2026-10-01", ...]
}

/** Admin's read/write view into Technical, Marketing and HR — the "MIMO GANG" page. Admin never bypasses
 * each department's own portal for day-to-day work; this exists so one page can show what everyone's
 * doing and let Admin step in (reassign a task, approve leave) without leaving the admin dashboard. */
export const adminGang = {
  loginStreaks: () => api.get<{ streaks: LoginStreaks }>('/admin/gang/login-streaks').then((r) => r.data.streaks),

  technicalTasks: () => api.get<{ tasks: TechTask[] }>('/admin/gang/technical-tasks').then((r) => r.data.tasks),
  createTechnicalTask: (body: { title: string; description?: string; assigneeId: string; priority?: TaskPriority; dueAtMs?: number | null; relatedMachine?: string | null }) =>
    api.post<{ id: string }>('/admin/gang/technical-tasks', body).then((r) => r.data),
  updateTechnicalTask: (taskId: string, body: Partial<Pick<TechTask, 'status' | 'priority' | 'assigneeId' | 'title' | 'description'>> & { dueAtMs?: number | null }) =>
    api.patch(`/admin/gang/technical-tasks/${taskId}`, body).then((r) => r.data),

  marketingTasks: () => api.get<{ tasks: MarketingTask[] }>('/admin/gang/marketing-tasks').then((r) => r.data.tasks),
  createMarketingTask: (body: { title: string; description?: string; channel?: string; priority?: MarketingTaskPriority; dueAtMs?: number | null }) =>
    api.post<{ id: string }>('/admin/gang/marketing-tasks', body).then((r) => r.data),
  updateMarketingTask: (taskId: string, body: Partial<Pick<MarketingTask, 'title' | 'description' | 'channel' | 'priority' | 'status'>> & { dueAtMs?: number | null }) =>
    api.patch(`/admin/gang/marketing-tasks/${taskId}`, body).then((r) => r.data),

  updateEmployee: (employeeId: string, body: Partial<Pick<Employee, 'title' | 'status'>>) =>
    api.patch(`/admin/gang/employees/${employeeId}`, body).then((r) => r.data),
  toggleOnboarding: (employeeId: string, index: number, done: boolean) =>
    api.patch(`/admin/gang/employees/${employeeId}/onboarding`, { index, done }).then((r) => r.data),
  decideLeaveRequest: (requestId: string, status: 'approved' | 'rejected', decisionNote?: string) =>
    api.patch(`/admin/gang/leave-requests/${requestId}`, { status, decisionNote }).then((r) => r.data),
};

export type { TaskStatus, TaskPriority, MarketingTaskStatus, MarketingTaskPriority };
