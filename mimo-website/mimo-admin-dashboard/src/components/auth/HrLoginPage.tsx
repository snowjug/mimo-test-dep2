import React from 'react';
import { StaffLogin } from './StaffLogin';

export interface HrLoginPageProps {
  onLogin: (email: string, pass: string) => Promise<void>;
  loading: boolean;
  error: string;
}

export const HrLoginPage: React.FC<HrLoginPageProps> = (props) => <StaffLogin {...props} variant="hr" />;
