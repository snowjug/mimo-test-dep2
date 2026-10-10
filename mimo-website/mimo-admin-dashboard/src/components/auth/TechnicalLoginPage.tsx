import React from 'react';
import { StaffLogin } from './StaffLogin';

export interface TechnicalLoginPageProps {
  onLogin: (email: string, pass: string) => Promise<void>;
  loading: boolean;
  error: string;
}

export const TechnicalLoginPage: React.FC<TechnicalLoginPageProps> = (props) => (
  <StaffLogin {...props} variant="technical" />
);
