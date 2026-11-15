"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.accountStore = exports.AccountError = exports.VALID_RANKS = exports.RANK_LEVELS = void 0;
exports.getRankLevel = getRankLevel;
exports.toPublicAccount = toPublicAccount;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
exports.RANK_LEVELS = {
    LEADER: 5,
    ADMIN: 4,
    CAPTAIN: 3,
    MEMBER: 2,
    ROOKIE: 1,
};
exports.VALID_RANKS = ['LEADER', 'ADMIN', 'CAPTAIN', 'MEMBER', 'ROOKIE'];
function getRankLevel(rank) {
    return exports.RANK_LEVELS[rank] || 1;
}
class AccountError extends Error {
    status;
    constructor(message, status) {
        super(message);
        this.status = status;
    }
}
exports.AccountError = AccountError;
const DATA_DIR = process.env.SOKAK_DATA_DIR || path_1.default.resolve(__dirname, '..', 'server', 'data');
const DB_FILE = path_1.default.join(DATA_DIR, 'users.json');
const USERNAME_REGEX = /^[\p{L}\p{N}_.-]{3,20}$/u;
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
const MAX_AVATAR_IMAGE_LENGTH = 220_000;
const MAX_SESSIONS_PER_ACCOUNT = 10;
function usernameKey(username) {
    return username.trim().toLocaleLowerCase('tr-TR');
}
function hashToken(token) {
    return crypto_1.default.createHash('sha256').update(token).digest('hex');
}
function sanitizeAvatarImage(image) {
    if (typeof image !== 'string' || !image)
        return null;
    if (!/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(image)) {
        throw new AccountError('Avatar resmi geçersiz bir formatta.', 400);
    }
    if (image.length > MAX_AVATAR_IMAGE_LENGTH) {
        throw new AccountError('Avatar resmi çok büyük (maksimum ~160KB).', 400);
    }
    return image;
}
function sanitizeColor(color) {
    return typeof color === 'string' && HEX_COLOR_REGEX.test(color) ? color : '#10B981';
}
function sanitizeStatusTag(tag) {
    if (typeof tag !== 'string')
        return '';
    return tag.trim().slice(0, 48);
}
function toPublicAccount(acc) {
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
    db = { users: [], sessions: [] };
    writeTimer = null;
    constructor() {
        this.load();
    }
    load() {
        try {
            if (!fs_1.default.existsSync(DATA_DIR))
                fs_1.default.mkdirSync(DATA_DIR, { recursive: true });
            if (fs_1.default.existsSync(DB_FILE)) {
                const parsed = JSON.parse(fs_1.default.readFileSync(DB_FILE, 'utf-8'));
                const rawUsers = Array.isArray(parsed.users) ? parsed.users : [];
                let migrated = false;
                // İlk kayıtlı kullanıcıya LEADER, rütbesi olmayan diğer eski kayıtlara ROOKIE ata
                this.db = {
                    users: rawUsers.map((u, idx) => {
                        if (!u.rank || !exports.VALID_RANKS.includes(u.rank)) {
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
            }
            else {
                this.flushNow();
            }
        }
        catch (err) {
            console.error('[SOKAK] users.json okunamadı, boş veritabanıyla devam ediliyor:', err);
            this.db = { users: [], sessions: [] };
        }
    }
    flushNow() {
        if (!fs_1.default.existsSync(DATA_DIR))
            fs_1.default.mkdirSync(DATA_DIR, { recursive: true });
        const tmp = `${DB_FILE}.tmp`;
        fs_1.default.writeFileSync(tmp, JSON.stringify(this.db, null, 2), 'utf-8');
        fs_1.default.renameSync(tmp, DB_FILE);
    }
    scheduleWrite() {
        if (this.writeTimer)
            clearTimeout(this.writeTimer);
        this.writeTimer = setTimeout(() => {
            this.writeTimer = null;
            try {
                this.flushNow();
            }
            catch (err) {
                console.error('[SOKAK] users.json yazılamadı:', err);
            }
        }, 150);
    }
    flushSync() {
        if (this.writeTimer) {
            clearTimeout(this.writeTimer);
            this.writeTimer = null;
        }
        this.flushNow();
    }
    createSession(accountId) {
        const token = crypto_1.default.randomBytes(32).toString('hex');
        const now = new Date().toISOString();
        this.db.sessions.push({ tokenHash: hashToken(token), accountId, createdAt: now, lastUsedAt: now });
        const own = this.db.sessions.filter((s) => s.accountId === accountId);
        if (own.length > MAX_SESSIONS_PER_ACCOUNT) {
            const toRemove = new Set(own
                .sort((a, b) => a.lastUsedAt.localeCompare(b.lastUsedAt))
                .slice(0, own.length - MAX_SESSIONS_PER_ACCOUNT)
                .map((s) => s.tokenHash));
            this.db.sessions = this.db.sessions.filter((s) => !toRemove.has(s.tokenHash));
        }
        return token;
    }
    async register(input) {
        const username = typeof input.username === 'string' ? input.username.trim() : '';
        const password = typeof input.password === 'string' ? input.password : '';
        if (!USERNAME_REGEX.test(username)) {
            throw new AccountError('Kullanıcı adı 3-20 karakter olmalı; harf, rakam, "_", "." veya "-" içerebilir.', 400);
        }
        if (password.length < 6 || password.length > 128) {
            throw new AccountError('Şifre en az 6 karakter olmalı.', 400);
        }
        const key = usernameKey(username);
        if (this.db.users.some((u) => u.usernameKey === key)) {
            throw new AccountError('Bu kullanıcı adı zaten alınmış.', 409);
        }
        // Sunucudaki ilk kayıtlı kullanıcı otomatik olarak LEADER (Level 5), sonrakiler ROOKIE (Level 1) olur
        const initialRank = this.db.users.length === 0 ? 'LEADER' : 'ROOKIE';
        const passwordHash = await bcryptjs_1.default.hash(password, 10);
        const account = {
            id: `acc_${crypto_1.default.randomBytes(9).toString('hex')}`,
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
    async login(input) {
        const username = typeof input.username === 'string' ? input.username : '';
        const password = typeof input.password === 'string' ? input.password : '';
        const acc = this.db.users.find((u) => u.usernameKey === usernameKey(username));
        const ok = await bcryptjs_1.default.compare(password, acc?.passwordHash || '$2a$10$CwTycUXWue0Thq9StjUM0uJ8.Gx1Yc9K9bJzE0wR6QH6sNDa8T6Ae');
        if (!acc || !ok) {
            throw new AccountError('Kullanıcı adı veya şifre hatalı.', 401);
        }
        const token = this.createSession(acc.id);
        this.flushSync();
        return { token, account: toPublicAccount(acc) };
    }
    resolveToken(token) {
        if (typeof token !== 'string' || token.length < 32)
            return null;
        const tokenHash = hashToken(token);
        const session = this.db.sessions.find((s) => s.tokenHash === tokenHash);
        if (!session)
            return null;
        const acc = this.db.users.find((u) => u.id === session.accountId) || null;
        if (acc) {
            session.lastUsedAt = new Date().toISOString();
            this.scheduleWrite();
        }
        return acc;
    }
    revokeToken(token) {
        if (typeof token !== 'string')
            return;
        const tokenHash = hashToken(token);
        const before = this.db.sessions.length;
        this.db.sessions = this.db.sessions.filter((s) => s.tokenHash !== tokenHash);
        if (this.db.sessions.length !== before)
            this.scheduleWrite();
    }
    updateProfile(accountId, partial) {
        const acc = this.db.users.find((u) => u.id === accountId);
        if (!acc)
            throw new AccountError('Hesap bulunamadı.', 404);
        if (partial.avatarColor !== undefined)
            acc.avatarColor = sanitizeColor(partial.avatarColor);
        if (partial.avatarImage !== undefined)
            acc.avatarImage = sanitizeAvatarImage(partial.avatarImage);
        if (partial.statusTag !== undefined)
            acc.statusTag = sanitizeStatusTag(partial.statusTag);
        this.scheduleWrite();
        return toPublicAccount(acc);
    }
    setRank(actorAccountId, targetAccountId, nextRank) {
        const actor = this.db.users.find((u) => u.id === actorAccountId);
        const target = this.db.users.find((u) => u.id === targetAccountId);
        if (!actor || !target) {
            throw new AccountError('Kullanıcı bulunamadı.', 404);
        }
        const actorLevel = getRankLevel(actor.rank);
        const targetLevel = getRankLevel(target.rank);
        if (actorLevel < exports.RANK_LEVELS.ADMIN) {
            throw new AccountError('Rütbe değiştirmek için ADMIN veya LEADER yetkisi gerekir.', 403);
        }
        // LEADER rütbesi dokunulmazdır
        if (target.rank === 'LEADER') {
            throw new AccountError('LEADER rütbesi değiştirilemez.', 403);
        }
        const assignableRanks = ['ADMIN', 'CAPTAIN', 'MEMBER', 'ROOKIE'];
        if (!assignableRanks.includes(nextRank)) {
            throw new AccountError('Geçersiz rütbe seçimi.', 400);
        }
        // Bir ADMIN başka bir ADMIN'in rütbesini düşüremez veya birini ADMIN yapamaz (sadece LEADER yapabilir)
        if (actor.rank === 'ADMIN' && (targetLevel >= exports.RANK_LEVELS.ADMIN || nextRank === 'ADMIN')) {
            throw new AccountError('ADMIN rütbesini yalnızca LEADER atayabilir veya değiştirebilir.', 403);
        }
        target.rank = nextRank;
        this.flushSync();
        return toPublicAccount(target);
    }
    getById(accountId) {
        return this.db.users.find((u) => u.id === accountId) || null;
    }
    listAll() {
        return [...this.db.users];
    }
}
exports.accountStore = new AccountStore();
