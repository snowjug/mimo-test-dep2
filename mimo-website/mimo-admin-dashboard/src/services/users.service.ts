import api from '../api';
import { AdminUsersResponse } from '../types/user.types';

export class UsersService {
  public async getUsers(): Promise<AdminUsersResponse> {
    const response = await api.get<AdminUsersResponse>('/admin/users');
    return response.data;
  }
}

export const usersService = new UsersService();
