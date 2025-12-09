/**
 * 认证服务
 * 处理用户注册、登录、Token验证
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query, queryOne, execute } from './platformDb.js';

// 生成简单ID（租户ID、用户ID）
function generateId(prefix = '') {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 16; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return prefix ? `${prefix}_${id}` : id;
}

/**
 * 用户注册（自动创建租户）
 */
export async function register(company, email, password) {
  try {
    // 1. 检查邮箱是否已存在
    const existingUser = await queryOne('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUser) {
      throw new Error('EMAIL_EXISTS');
    }

    // 2. 加密密码
    const passwordHash = await bcrypt.hash(password, 10);

    // 3. 创建租户
    const tenantId = generateId('t');
    await execute(
      'INSERT INTO tenants (id, name, status, created_at) VALUES (?, ?, 1, NOW())',
      [tenantId, company]
    );

    // 4. 创建管理员用户
    const userId = generateId('u');
    await execute(
      'INSERT INTO users (id, tenant_id, email, password_hash, role, status, created_at) VALUES (?, ?, ?, ?, ?, 1, NOW())',
      [userId, tenantId, email, passwordHash, 'admin']
    );

    // 5. 生成 Token
    const token = generateToken({ userId, tenantId, email, role: 'admin' });

    // 6. 返回用户信息
    return {
      token,
      user: {
        id: userId,
        email,
        role: 'admin',
        tenant: {
          id: tenantId,
          name: company
        }
      }
    };
  } catch (error) {
    console.error('❌ 注册失败:', error.message);
    throw error;
  }
}

/**
 * 用户登录
 */
export async function login(email, password) {
  try {
    // 1. 查询用户
    const user = await queryOne(
      `SELECT u.id, u.tenant_id, u.email, u.password_hash, u.role, u.status,
              t.name as tenant_name, t.status as tenant_status
       FROM users u
       JOIN tenants t ON u.tenant_id = t.id
       WHERE u.email = ?`,
      [email]
    );

    if (!user) {
      throw new Error('USER_NOT_FOUND');
    }

    // 2. 检查用户状态
    if (user.status !== 1) {
      throw new Error('USER_DISABLED');
    }

    // 3. 检查租户状态
    if (user.tenant_status !== 1) {
      throw new Error('TENANT_DISABLED');
    }

    // 4. 验证密码
    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      throw new Error('INVALID_PASSWORD');
    }

    // 5. 生成 Token
    const token = generateToken({
      userId: user.id,
      tenantId: user.tenant_id,
      email: user.email,
      role: user.role
    });

    // 6. 返回用户信息
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        tenant: {
          id: user.tenant_id,
          name: user.tenant_name
        }
      }
    };
  } catch (error) {
    console.error('❌ 登录失败:', error.message);
    throw error;
  }
}

/**
 * 生成 JWT Token
 */
export function generateToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
}

/**
 * 验证 JWT Token
 */
export function verifyToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('TOKEN_EXPIRED');
    } else if (error.name === 'JsonWebTokenError') {
      throw new Error('INVALID_TOKEN');
    }
    throw error;
  }
}

/**
 * 获取用户信息
 */
export async function getUserInfo(userId) {
  try {
    const user = await queryOne(
      `SELECT u.id, u.email, u.role, u.status,
              t.id as tenant_id, t.name as tenant_name, t.status as tenant_status
       FROM users u
       JOIN tenants t ON u.tenant_id = t.id
       WHERE u.id = ?`,
      [userId]
    );

    if (!user) {
      throw new Error('USER_NOT_FOUND');
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      tenant: {
        id: user.tenant_id,
        name: user.tenant_name,
        status: user.tenant_status
      }
    };
  } catch (error) {
    console.error('❌ 获取用户信息失败:', error.message);
    throw error;
  }
}

/**
 * 刷新 Token
 */
export async function refreshToken(oldToken) {
  try {
    // 验证旧 Token
    const payload = verifyToken(oldToken);

    // 生成新 Token
    const newToken = generateToken({
      userId: payload.userId,
      tenantId: payload.tenantId,
      email: payload.email,
      role: payload.role
    });

    return { token: newToken };
  } catch (error) {
    console.error('❌ 刷新Token失败:', error.message);
    throw error;
  }
}
