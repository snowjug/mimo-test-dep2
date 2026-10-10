import api from '../api';
import { Employee, LeaveRequest } from './hr.service';

export interface HrOverview {
  headcount: number;
  byDepartment: Record<string, number>;
  onboarding: number;
  offboarded: number;
  pendingLeaveRequests: LeaveRequest[];
  attendanceToday: { date: string; marked: number; present: number; onLeave: number; absent: number; unmarked: number };
}

export interface CompanyActivityEntry {
  id: string;
  actorName: string;
  description: string;
  department: string;
  createdAt: string | { _seconds: number };
}

export const adminCompany = {
  employees: () => api.get<{ employees: Employee[] }>('/admin/employees').then((r) => r.data.employees),
  hrOverview: () => api.get<HrOverview>('/admin/hr-overview').then((r) => r.data),
  companyActivity: () => api.get<{ activity: CompanyActivityEntry[] }>('/admin/company-activity').then((r) => r.data.activity),
};
