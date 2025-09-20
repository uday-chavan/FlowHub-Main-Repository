
interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  profileImageUrl?: string;
}

interface AuthResponse {
  success: boolean;
  user?: User;
  message: string;
}

class AuthService {
  private baseUrl = '/auth';

  async login(email: string, password: string): Promise<AuthResponse> {
    const response = await fetch(`${this.baseUrl}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // Include cookies
      body: JSON.stringify({ email, password }),
    });

    return response.json();
  }

  async register(name: string, email: string, password: string): Promise<AuthResponse> {
    const response = await fetch(`${this.baseUrl}/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ name, email, password }),
    });

    return response.json();
  }

  async logout(): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${this.baseUrl}/logout`, {
      method: 'POST',
      credentials: 'include',
    });

    // Clear ALL user data from localStorage and sessionStorage to prevent data leakage
    localStorage.clear();
    sessionStorage.clear();

    return response.json();
  }

  async refreshToken(): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${this.baseUrl}/refresh`, {
      method: 'POST',
      credentials: 'include',
    });

    return response.json();
  }

  async getCurrentUser(): Promise<{ user?: User }> {
    try {
      const response = await fetch(`${this.baseUrl}/me`, {
        credentials: 'include',
      });

      if (response.ok) {
        return response.json();
      }
      return {};
    } catch (error) {
      console.error('Failed to get current user:', error);
      return {};
    }
  }

  // Auto-refresh token when API calls fail with 401
  async authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const response = await fetch(url, {
      ...options,
      credentials: 'include',
    });

    // If token expired, try to refresh and retry
    if (response.status === 401) {
      const refreshResult = await this.refreshToken();
      
      if (refreshResult.success) {
        // Retry the original request
        return fetch(url, {
          ...options,
          credentials: 'include',
        });
      }
    }

    return response;
  }

  // Check if user is authenticated by trying to get current user
  async isAuthenticated(): Promise<boolean> {
    const result = await this.getCurrentUser();
    return !!result.user;
  }
}

export const authService = new AuthService();
export type { User, AuthResponse };
