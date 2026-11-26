export interface AdminUserItem {
  id: string;
  username: string;
  email: string;
  mobileNumber: string;
  googleUser: boolean;
  isGuest: boolean;
  mimoCoins?: {
    balance: number;
    totalEarned: number;
    totalUsed: number;
  } | null;
  couponsUsed?: string[];
  totalDiscountSaved?: number;
  totalSpend: number;
  orderCount: number;
  pagesPrinted: number;
  isPayingCustomer: boolean;
  joinedAt: string;
}

export interface AdminUserMetrics {
  totalUsers: number;
  registeredUsers: number;
  guestUsers: number;
  activeCustomers: number;
  conversionRate: number;
  avgRevenuePerUser: number;
  totalRevenue: number;
}

export interface AdminUsersResponse {
  metrics: AdminUserMetrics;
  users: AdminUserItem[];
}
