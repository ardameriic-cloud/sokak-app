import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

// Kalıcı SOKAK hesap ve RBAC rütbe deposu: server/data/users.json
// 5 Hiyerarşik İngilizce Rütbe: LEADER (5), ADMIN (4), CAPTAIN (3), MEMBER (2), ROOKIE (1)

export type RankRole = 'LEADER' | 'ADMIN' | 'CAPTAIN' | 'MEMBER' | 'ROOKIE';

export const RANK_LEVELS: Record<RankRole, number> = {
  LEADER: 5,
  ADMIN: 4,
  CAPTAIN: 3,
  MEMBER: 2,
  ROOKIE: 1,
};

export const VALID_RANKS: RankRole[] = ['LEADER', 'ADMIN', 'CAPTAIN', 'MEMBER', 'ROOKIE'];

export function getRankLevel(rank: RankRole): number {
  return RANK_LEVELS[rank] || 1;
}

export interface StoredAccount {
  id: string;
  username: string;
  usernameKey: string;
  passwordHash: string;
  rank: RankRole;
  avatarColor: string;
  avatarImage: string | null;
  statusTag: string;
  createdAt: string;
}

export interface StoredSession {
  tokenHash: string;
  accountId: string;
  createdAt: string;
  lastUsedAt: string;
}

interface DatabaseShape {
  users: StoredAccount[];
  sessions: StoredSession[];
}

export interface PublicAccount {
  id: string;
  username: string;
  rank: RankRole;
  rankLevel: number;
  avatarColor: string;
  avatarImage: string | null;
  statusTag: string;
  createdAt: string;
}

export class AccountError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

const DATA_DIR = process.env.SOKAK_DATA_DIR || path.resolve(__dirname, '..', 'server', 'data');
const DB_FILE = path.join(DATA_DIR, 'users.json');

const USERNAME_REGEX = /^[\p{L}\p{N}_.-]{3,20}$/u;
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
const MAX_AVATAR_IMAGE_LENGTH = 220_000;
const MAX_SESSIONS_PER_ACCOUNT = 10;

function usernameKey(username: string): string {
  return username.trim().toLocaleLowerCase('tr-TR');
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function sanitizeAvatarImage(image: unknown): string | null {
  if (typeof image !== 'string' || !image) return null;
  if (!/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(image)) {
    throw new AccountError('Avatar resmi geçersiz bir formatta.', 400);
  }
  if (image.length > MAX_AVATAR_IMAGE_LENGTH) {
    throw new AccountError('Avatar resmi çok büyük (maksimum ~160KB).', 400);
  }
  return image;
}

function sanitizeColor(color: unknown): string {
  return typeof color === 'string' && HEX_COLOR_REGEX.test(color) ? color : '#10B981';
}

function sanitizeStatusTag(tag: unknown): string {
  if (typeof tag !== 'string') return '';
  return tag.trim().slice(0, 48);
}

export function toPublicAccount(acc: StoredAccount): PublicAccount {
  return {
    id: acc.id,
    username: acc.username,
    rank: acc.rank,
    rankLevel: getRankLevel(acc.rank),
    avatarColor: acc.avatarColor,
    avatarImage: acc.avatarImage,
    statusTag: acc.statusTag,
    createdAt: acc.createdAt,
  };
}

class AccountStore {
  private db: DatabaseShape = { users: [], sessions: [] };
  private writeTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.load();
  }

  private load() {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      if (fs.existsSync(DB_FILE)) {
        const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8')) as Partial<DatabaseShape>;
        const rawUsers = Array.isArray(parsed.users) ? parsed.users : [];
        let migrated = false;

        // İlk kayıtlı kullanıcıya LEADER, rütbesi olmayan diğer eski kayıtlara ROOKIE ata
        this.db = {
          users: rawUsers.map((u, idx) => {
            if (!u.rank || !VALID_RANKS.includes(u.rank)) {
              migrated = true;
              return {
                ...u,
                rank: idx === 0 ? 'LEADER' : 'ROOKIE',
              };
            }
            return u;
          }),
          sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
        };

        // Hiç LEADER yoksa ve en az 1 kullanıcı varsa ilk kullanıcıyı LEADER yap
        if (this.db.users.length > 0 && !this.db.users.some((u) => u.rank === 'LEADER')) {
          this.db.users[0].rank = 'LEADER';
          migrated = true;
        }

        if (migrated) {
          this.flushNow();
        }
      } else {
        this.flushNow();
      }
    } catch (err) {
      console.error('[SOKAK] users.json okunamadı, boş veritabanıyla devam ediliyor:', err);
      this.db = { users: [], sessions: [] };
    }
  }

  private flushNow() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.db, null, 2), 'utf-8');
    fs.renameSync(tmp, DB_FILE);
  }

  private scheduleWrite() {
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      try {
        this.flushNow();
      } catch (err) {
        console.error('[SOKAK] users.json yazılamadı:', err);
      }
    }, 150);
  }

  public flushSync() {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    this.flushNow();
  }

  private createSession(accountId: string): string {
    const token = crypto.randomBytes(32).toString('hex');
    const now = new Date().toISOString();
    this.db.sessions.push({ tokenHash: hashToken(token), accountId, createdAt: now, lastUsedAt: now });

    const own = this.db.sessions.filter((s) => s.accountId === accountId);
    if (own.length > MAX_SESSIONS_PER_ACCOUNT) {
      const toRemove = new Set(
        own
          .sort((a, b) => a.lastUsedAt.localeCompare(b.lastUsedAt))
          .slice(0, own.length - MAX_SESSIONS_PER_ACCOUNT)
          .map((s) => s.tokenHash)
      );
      this.db.sessions = this.db.sessions.filter((s) => !toRemove.has(s.tokenHash));
    }
    return token;
  }

  public async register(input: {
    username: unknown;
    password: unknown;
    avatarColor?: unknown;
    avatarImage?: unknown;
  }): Promise<{ token: string; account: PublicAccount }> {
    const username = typeof input.username === 'string' ? input.username.trim() : '';
    const password = typeof input.password === 'string' ? input.password : '';

    if (!USERNAME_REGEX.test(username)) {
      throw new AccountError(
        'Kullanıcı adı 3-20 karakter olmalı; harf, rakam, "_", "." veya "-" içerebilir.',
        400
      );
    }
    if (password.length < 6 || password.length > 128) {
      throw new AccountError('Şifre en az 6 karakter olmalı.', 400);
    }

    const key = usernameKey(username);
    if (this.db.users.some((u) => u.usernameKey === key)) {
      throw new AccountError('Bu kullanıcı adı zaten alınmış.', 409);
    }

    // Sunucudaki ilk kayıtlı kullanıcı otomatik olarak LEADER (Level 5), sonrakiler ROOKIE (Level 1) olur
    const initialRank: RankRole = this.db.users.length === 0 ? 'LEADER' : 'ROOKIE';

    const passwordHash = await bcrypt.hash(password, 10);
    const account: StoredAccount = {
      id: `acc_${crypto.randomBytes(9).toString('hex')}`,
      username,
      usernameKey: key,
      passwordHash,
      rank: initialRank,
      avatarColor: sanitizeColor(input.avatarColor),
      avatarImage: sanitizeAvatarImage(input.avatarImage),
      statusTag: '',
      createdAt: new Date().toISOString(),
    };

    this.db.users.push(account);
    const token = this.createSession(account.id);
    this.flushSync();
    return { token, account: toPublicAccount(account) };
  }

  public async login(input: { username: unknown; password: unknown }): Promise<{
    token: string;
    account: PublicAccount;
  }> {
    const username = typeof input.username === 'string' ? input.username : '';
    const password = typeof input.password === 'string' ? input.password : '';
    const acc = this.db.users.find((u) => u.usernameKey === usernameKey(username));

    const ok = await bcrypt.compare(
      password,
      acc?.passwordHash || '$2a$10$CwTycUXWue0Thq9StjUM0uJ8.Gx1Yc9K9bJzE0wR6QH6sNDa8T6Ae'
    );
    if (!acc || !ok) {
      throw new AccountError('Kullanıcı adı veya şifre hatalı.', 401);
    }

    const token = this.createSession(acc.id);
    this.flushSync();
    return { token, account: toPublicAccount(acc) };
  }

  public resolveToken(token: unknown): StoredAccount | null {
    if (typeof token !== 'string' || token.length < 32) return null;
    const tokenHash = hashToken(token);
    const session = this.db.sessions.find((s) => s.tokenHash === tokenHash);
    if (!session) return null;
    const acc = this.db.users.find((u) => u.id === session.accountId) || null;
    if (acc) {
      session.lastUsedAt = new Date().toISOString();
      this.scheduleWrite();
    }
    return acc;
  }

  public revokeToken(token: unknown) {
    if (typeof token !== 'string') return;
    const tokenHash = hashToken(token);
    const before = this.db.sessions.length;
    this.db.sessions = this.db.sessions.filter((s) => s.tokenHash !== tokenHash);
    if (this.db.sessions.length !== before) this.scheduleWrite();
  }

  public updateProfile(
    accountId: string,
    partial: { avatarColor?: unknown; avatarImage?: unknown; statusTag?: unknown }
  ): PublicAccount {
    const acc = this.db.users.find((u) => u.id === accountId);
    if (!acc) throw new AccountError('Hesap bulunamadı.', 404);

    if (partial.avatarColor !== undefined) acc.avatarColor = sanitizeColor(partial.avatarColor);
    if (partial.avatarImage !== undefined) acc.avatarImage = sanitizeAvatarImage(partial.avatarImage);
    if (partial.statusTag !== undefined) acc.statusTag = sanitizeStatusTag(partial.statusTag);

    this.scheduleWrite();
    return toPublicAccount(acc);
  }

  public setRank(
    actorAccountId: string,
    targetAccountId: string,
    nextRank: RankRole
  ): PublicAccount {
    const actor = this.db.users.find((u) => u.id === actorAccountId);
    const target = this.db.users.find((u) => u.id === targetAccountId);
    if (!actor || !target) {
      throw new AccountError('Kullanıcı bulunamadı.', 404);
    }

    const actorLevel = getRankLevel(actor.rank);
    const targetLevel = getRankLevel(target.rank);

    if (actorLevel < RANK_LEVELS.ADMIN) {
      throw new AccountError('Rütbe değiştirmek için ADMIN veya LEADER yetkisi gerekir.', 403);
    }

    // LEADER rütbesi dokunulmazdır
    if (target.rank === 'LEADER') {
      throw new AccountError('LEADER rütbesi değiştirilemez.', 403);
    }

    const assignableRanks: RankRole[] = ['ADMIN', 'CAPTAIN', 'MEMBER', 'ROOKIE'];
    if (!assignableRanks.includes(nextRank)) {
      throw new AccountError('Geçersiz rütbe seçimi.', 400);
    }

    // Bir ADMIN başka bir ADMIN'in rütbesini düşüremez veya birini ADMIN yapamaz (sadece LEADER yapabilir)
    if (actor.rank === 'ADMIN' && (targetLevel >= RANK_LEVELS.ADMIN || nextRank === 'ADMIN')) {
      throw new AccountError('ADMIN rütbesini yalnızca LEADER atayabilir veya değiştirebilir.', 403);
    }

    target.rank = nextRank;
    this.flushSync();
    return toPublicAccount(target);
  }

  public getById(accountId: string): StoredAccount | null {
    return this.db.users.find((u) => u.id === accountId) || null;
  }

  public listAll(): StoredAccount[] {
    return [...this.db.users];
  }
}

export const accountStore = new AccountStore();
