import api from '../api';

export type Department = 'technical' | 'hr' | 'marketing' | 'finance' | 'admin';
export type EmployeeStatus = 'onboarding' | 'active' | 'offboarded';
export type LeaveType = 'paid' | 'sick' | 'casual' | 'unpaid';
export type LeaveStatus = 'pending' | 'approved' | 'rejected';
export type AttendanceStatus = 'present' | 'absent' | 'leave' | 'half_day';

export interface OnboardingItem {
  task: string;
  done: boolean;
}

export interface Employee {
  id: string;
  name: string;
  email: string | null;
  department: Department;
  title: string;
  phone: string | null;
  status: EmployeeStatus;
  loginRef: { collection: string; id: string } | null;
  leaveBalance: { paid: number; sick: number; casual: number };
  onboardingChecklist: OnboardingItem[];
  joinedAt: string;
  offboardedAt: (string | { _seconds: number }) | null;
  createdAt: string | { _seconds: number };
}

export interface AttendanceEntry {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  status: AttendanceStatus;
  note: string;
  markedByName: string;
  createdAt: string | { _seconds: number };
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  type: LeaveType;
  fromDate: string;
  toDate: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  decidedByName: string | null;
  decisionNote: string;
  createdAt: string | { _seconds: number };
}

export interface HrActivityEntry {
  id: string;
  actorName: string;
  description: string;
  createdAt: string | { _seconds: number };
}

export const hr = {
  login: (email: string, password: string) =>
    api.post<{ token: string; member: { id: string; name: string; role: 'hr_lead' | 'hr_staff'; email: string } }>('/hr/login', { email, password }).then((r) => r.data),

  me: () => api.get<{ member: any; stats: { totalEmployees: number; onboarding: number; pendingLeaveRequests: number } }>('/hr/me').then((r) => r.data),

  employees: (filters?: { department?: Department; status?: EmployeeStatus }) =>
    api.get<{ employees: Employee[] }>('/hr/employees', { params: filters }).then((r) => r.data.employees),
  createEmployee: (body: { name: string; email?: string; department: Department; title?: string; phone?: string; startOnboarding?: boolean }) =>
    api.post<{ id: string }>('/hr/employees', body).then((r) => r.data),
  updateEmployee: (employeeId: string, body: Partial<Pick<Employee, 'title' | 'phone' | 'department' | 'status'>>) =>
    api.patch(`/hr/employees/${employeeId}`, body).then((r) => r.data),
  toggleOnboarding: (employeeId: string, index: number, done: boolean) =>
    api.patch<{ onboardingChecklist: OnboardingItem[] }>(`/hr/employees/${employeeId}/onboarding`, { index, done }).then((r) => r.data),
  addOnboardingTask: (employeeId: string, newTask: string) =>
    api.patch<{ onboardingChecklist: OnboardingItem[] }>(`/hr/employees/${employeeId}/onboarding`, { newTask }).then((r) => r.data),

  attendance: (date?: string) => api.get<{ date: string; entries: AttendanceEntry[] }>('/hr/attendance', { params: date ? { date } : {} }).then((r) => r.data),
  markAttendance: (entries: { employeeId: string; employeeName: string; status: AttendanceStatus; note?: string }[], date?: string) =>
    api.post('/hr/attendance', { date, entries }).then((r) => r.data),

  leaveRequests: (status?: LeaveStatus) => api.get<{ requests: LeaveRequest[] }>('/hr/leave-requests', { params: status ? { status } : {} }).then((r) => r.data.requests),
  fileLeaveRequest: (body: { employeeId: string; type: LeaveType; fromDate: string; toDate: string; reason?: string }) =>
    api.post<{ id: string }>('/hr/leave-requests', body).then((r) => r.data),
  decideLeaveRequest: (requestId: string, status: 'approved' | 'rejected', decisionNote?: string) =>
    api.patch(`/hr/leave-requests/${requestId}`, { status, decisionNote }).then((r) => r.data),

  activity: () => api.get<{ activity: HrActivityEntry[] }>('/hr/activity').then((r) => r.data.activity),
};
