import api from '../api';

export type TaskStatus = 'backlog' | 'assigned' | 'in_progress' | 'blocked' | 'in_review' | 'completed';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';
export type TeamRole = 'tech_lead' | 'tech_member';

export interface TechTaskComment {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string | { _seconds: number };
}

export interface TechTask {
  id: string;
  title: string;
  description: string;
  creatorId: string;
  creatorName: string;
  assigneeId: string;
  assigneeName: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueAtMs: number | null;
  relatedMachine: string | null;
  tags: string[];
  comments: TechTaskComment[];
  proofScreenshotUrl?: string | null;
  proofNote?: string | null;
  createdAt: string | { _seconds: number };
  updatedAt: string | { _seconds: number };
  completedAt: (string | { _seconds: number }) | null;
}

export interface TeamMember {
  id: string;
  name: string;
  role: TeamRole;
  skills: string[];
  activeTasks: number;
  blockedTasks: number;
  completedTasks: number;
}

export interface WorkSessionEvent {
  type: 'started' | 'paused' | 'resumed' | 'ended';
  at: string | { _seconds: number };
  taskId?: string | null;
  taskTitle?: string | null;
}

export interface WorkSession {
  id: string;
  memberId: string;
  memberName: string;
  status: 'active' | 'paused' | 'ended';
  startedAt: string | { _seconds: number };
  endedAt: (string | { _seconds: number }) | null;
  events: WorkSessionEvent[];
}

export interface Announcement {
  id: string;
  body: string;
  postedBy: string;
  postedByName: string;
  createdAt: string | { _seconds: number };
}

export interface ActivityEntry {
  id: string;
  actorId: string;
  actorName: string;
  description: string;
  createdAt: string | { _seconds: number };
  targetType?: string;
  targetId?: string;
}

// Same shape as the admin fleet view, minus revenue — technical team gets health/status, not money.
export interface TechMachine {
  kioskId: string;
  name: string;
  type: 'bw' | 'color';
  description: string;
  shortLabel?: string;
  locationId?: string | null;
  locationName?: string | null;
  campusId?: string | null;
  lifecycleStatus?: string;
  liveState?: 'AVAILABLE' | 'BUSY' | 'DEGRADED' | 'OFFLINE' | 'PROVISIONING' | 'MAINTENANCE' | 'DECOMMISSIONED';
  online: boolean;
  lastSeen: string | null;
  secondsSinceSeen: number | null;
  printerStatus: string | null;
  wifiSignalDbm: number | null;
  wifiQualityPct: number | null;
  printers: { key: string; type: 'bw' | 'color'; status: string | null; paperLevel: number | null; paperCapacity: number; paperPct: number | null; tonerLevel: number | null; inkLevel: number | null }[];
  queue: { paid: number; printing: number };
  stats: { jobs: number; completed: number; failed: number; pages: number };
}

export interface MachinesResponse {
  summary: { total: number; online: number; offline: number };
  kiosks: TechMachine[];
  updatedAt: string;
}

export interface DailyReport {
  id: string;
  memberId: string;
  memberName: string;
  date: string;
  summary: string;
  blockers: string;
  tomorrowPlan: string;
  completedTaskIds: string[];
  createdAt: string | { _seconds: number };
}

export const technical = {
  login: (email: string, password: string) =>
    api.post<{ token: string; member: { id: string; name: string; role: TeamRole; email: string } }>('/technical/login', { email, password }).then((r) => r.data),

  me: () => api.get<{ member: any; stats: any }>('/technical/me').then((r) => r.data),
  team: () => api.get<{ members: TeamMember[] }>('/technical/team').then((r) => r.data.members),

  tasks: (assignee?: 'me' | string) => api.get<{ tasks: TechTask[] }>('/technical/tasks', { params: assignee ? { assignee } : {} }).then((r) => r.data.tasks),
  createTask: (body: { title: string; description?: string; assigneeId: string; priority?: TaskPriority; dueAtMs?: number | null; relatedMachine?: string | null; tags?: string[] }) =>
    api.post<{ id: string }>('/technical/tasks', body).then((r) => r.data),
  updateTask: (taskId: string, body: Partial<Pick<TechTask, 'status' | 'priority' | 'assigneeId' | 'title' | 'description'>> & { dueAtMs?: number | null }) =>
    api.patch(`/technical/tasks/${taskId}`, body).then((r) => r.data),
  /** Same endpoint, multipart: lets a status change (typically marking a task complete) carry a pasted/
   * attached screenshot as proof of work, alongside the usual fields. */
  updateTaskWithProof: (taskId: string, body: { status?: TaskStatus; proofNote?: string }, screenshot: File) => {
    const form = new FormData();
    if (body.status) form.append('status', body.status);
    if (body.proofNote) form.append('proofNote', body.proofNote);
    form.append('screenshot', screenshot);
    return api.patch(`/technical/tasks/${taskId}`, form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
  },
  commentOnTask: (taskId: string, body: string) => api.post<{ comment: TechTaskComment }>(`/technical/tasks/${taskId}/comments`, { body }).then((r) => r.data),

  announcements: () => api.get<{ announcements: Announcement[] }>('/technical/announcements').then((r) => r.data.announcements),
  postAnnouncement: (body: string) => api.post('/technical/announcements', { body }).then((r) => r.data),

  activity: () => api.get<{ activity: ActivityEntry[] }>('/technical/activity').then((r) => r.data.activity),

  machines: () => api.get<MachinesResponse>('/technical/machines').then((r) => r.data),

  sessionToday: () => api.get<{ session: WorkSession | null }>('/technical/work-sessions/today').then((r) => r.data.session),
  startSession: () => api.post('/technical/work-sessions/start').then((r) => r.data),
  pauseSession: (taskId?: string, taskTitle?: string) => api.post('/technical/work-sessions/pause', { taskId, taskTitle }).then((r) => r.data),
  resumeSession: (taskId?: string, taskTitle?: string) => api.post('/technical/work-sessions/resume', { taskId, taskTitle }).then((r) => r.data),
  endSession: () => api.post('/technical/work-sessions/end').then((r) => r.data),

  dailyReports: (memberId?: string) => api.get<{ reports: DailyReport[] }>('/technical/daily-reports', { params: memberId ? { memberId } : {} }).then((r) => r.data.reports),
  submitDailyReport: (body: { summary: string; blockers?: string; tomorrowPlan?: string; completedTaskIds?: string[] }) =>
    api.post('/technical/daily-reports', body).then((r) => r.data),

  // 11 Technical Task Modules
  failureAnalytics: (days = 30) => api.get<any>('/technical/analytics/failures', { params: { days } }).then((r) => r.data),
  customerUsageAnalytics: () => api.get<any>('/technical/analytics/customer-usage').then((r) => r.data),
  maintenanceTickets: () => api.get<{ tickets: any[]; summary: any }>('/technical/maintenance-tickets').then((r) => r.data),
  createMaintenanceTicket: (body: { kioskId: string; title: string; description?: string; severity?: string; assignedTo?: string }) =>
    api.post<any>('/technical/maintenance-tickets', body).then((r) => r.data),
  patchMaintenanceTicket: (id: string, body: any) => api.patch(`/technical/maintenance-tickets/${id}`, body).then((r) => r.data),
  demandHeatmap: (kioskId?: string) => api.get<any>('/technical/analytics/demand-heatmap', { params: kioskId ? { kioskId } : {} }).then((r) => r.data),
  locationProfitability: () => api.get<{ locations: any[] }>('/technical/analytics/location-profitability').then((r) => r.data),
  printerDiagnostics: () => api.get<any>('/technical/printer/diagnostics').then((r) => r.data),
  recoverPrinter: (action: string, kioskId?: string) => api.post<{ success: boolean; message: string }>('/technical/printer/recover', { action, kioskId }).then((r) => r.data),
  paperStatus: () => api.get<{ trays: any[]; alertThresholdPct: number; criticalThresholdPct: number }>('/technical/paper/status').then((r) => r.data),
  refillPaper: (printerKey: string, sheetsAdded?: number) => api.post<any>('/technical/paper/refill', { printerKey, sheetsAdded }).then((r) => r.data),
  peakHourAnalytics: () => api.get<any>('/technical/analytics/peak-hours').then((r) => r.data),
  machineProfitability: () => api.get<{ machines: any[] }>('/technical/analytics/machine-profitability').then((r) => r.data),
  revenueAnalytics: () => api.get<any>('/technical/analytics/revenue-analytics').then((r) => r.data),
  fleetSimulate: (body: { kiosksCount: number; avgJobsPerKioskPerDay: number; avgPagesPerJob?: number; colorRatioPct?: number; duplexRatioPct?: number }) =>
    api.post<any>('/technical/fleet/simulate', body).then((r) => r.data),
};

