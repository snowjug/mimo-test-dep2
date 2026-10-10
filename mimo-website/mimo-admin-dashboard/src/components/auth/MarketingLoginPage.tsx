import React from 'react';
import { StaffLogin } from './StaffLogin';

export interface MarketingLoginPageProps {
  onLogin: (email: string, pass: string) => Promise<void>;
  loading: boolean;
  error: string;
}

export const MarketingLoginPage: React.FC<MarketingLoginPageProps> = (props) => <StaffLogin {...props} variant="marketing" />;
