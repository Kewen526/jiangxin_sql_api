/**
 * JWT 认证中间件
 */

import { verifyToken } from '../auth/authService.js';

/**
 * 验证Token中间件
 * 用于需要登录的接口
 */
export async function requireAuth(request, reply) {
  try {
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      return reply.status(401).send({
        success: false,
        error: 'NO_TOKEN',
        message: '请提供认证Token'
      });
    }

    // 提取 Token (Bearer xxxxx)
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.substring(7)
      : authHeader;

    // 验证 Token
    const payload = verifyToken(token);

    // 将用户信息附加到请求对象
    request.user = {
      userId: payload.userId,
      tenantId: payload.tenantId,
      email: payload.email,
      role: payload.role
    };

  } catch (error) {
    const errorMap = {
      'TOKEN_EXPIRED': { status: 401, message: 'Token已过期，请重新登录' },
      'INVALID_TOKEN': { status: 401, message: 'Token无效' }
    };

    const errorInfo = errorMap[error.message] || {
      status: 401,
      message: '认证失败'
    };

    return reply.status(errorInfo.status).send({
      success: false,
      error: error.message,
      message: errorInfo.message
    });
  }
}

/**
 * 可选认证中间件
 * Token存在时验证，不存在时放行
 */
export async function optionalAuth(request, reply) {
  try {
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      // 没有 Token，放行
      request.user = null;
      return;
    }

    const token = authHeader.startsWith('Bearer ')
      ? authHeader.substring(7)
      : authHeader;

    const payload = verifyToken(token);

    request.user = {
      userId: payload.userId,
      tenantId: payload.tenantId,
      email: payload.email,
      role: payload.role
    };

  } catch (error) {
    // Token 无效，但不阻止请求
    request.user = null;
  }
}

/**
 * 角色检查中间件
 * 检查用户是否具有指定角色
 */
export function requireRole(...allowedRoles) {
  return async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({
        success: false,
        error: 'UNAUTHORIZED',
        message: '未登录'
      });
    }

    if (!allowedRoles.includes(request.user.role)) {
      return reply.status(403).send({
        success: false,
        error: 'FORBIDDEN',
        message: '权限不足'
      });
    }
  };
}
