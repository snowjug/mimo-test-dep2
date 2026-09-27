import React from 'react';
import { StaffLogin } from './StaffLogin';

export interface FinanceLoginPageProps {
  onLogin: (email: string, pass: string) => Promise<void>;
  loading: boolean;
  error: string;
}

export const FinanceLoginPage: React.FC<FinanceLoginPageProps> = (props) => (
  <StaffLogin {...props} variant="finance" />
);
