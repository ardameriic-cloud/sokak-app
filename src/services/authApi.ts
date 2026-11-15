import { useSokakStore } from '../store/useSokakStore';
import { AccountPublic } from '../types/sokak';

export class AuthRequestError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

interface AuthResponse {
  token: string;
  user: AccountPublic;
}

async function request<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  const base = useSokakStore.getState().serverUrl.replace(/\/+$/, '');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${base}${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  } catch {
    throw new AuthRequestError(`Sunucuya ulaşılamadı (${base}). Sunucu adresini kontrol et.`, 0);
  }

  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) {
    throw new AuthRequestError(data.error || `Sunucu hatası (${res.status})`, res.status);
  }
  return data;
}

export const authApi = {
  register(input: {
    username: string;
    password: string;
    avatarColor: string;
    avatarImage: string | null;
  }): Promise<AuthResponse> {
    return request<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  login(input: { username: string; password: string }): Promise<AuthResponse> {
    return request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  me(token: string): Promise<{ user: AccountPublic }> {
    return request<{ user: AccountPublic }>('/api/auth/me', { method: 'GET' }, token);
  },

  async logout(token: string | null): Promise<void> {
    if (!token) return;
    try {
      await request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }, token);
    } catch {
      // Sunucuya ulaşılamasa bile yerel oturum temizlenir
    }
  },
};

// Seçilen resmi 128x128 JPEG'e küçültür (sunucuya ~10-20KB gönderilir)
export function resizeAvatarImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Lütfen bir resim dosyası seç.'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Resim okunamadı.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Resim çözümlenemedi.'));
      img.onload = () => {
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Resim işlenemedi.'));
          return;
        }
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        ctx.fillStyle = '#090A0F';
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
