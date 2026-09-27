import React from 'react';
import { StaffLogin } from './StaffLogin';

export interface AdminLoginPageProps {
  onLogin: (email: string, pass: string) => Promise<void>;
  loading: boolean;
  error: string;
}

export const AdminLoginPage: React.FC<AdminLoginPageProps> = (props) => (
  <StaffLogin {...props} variant="admin" />
);
