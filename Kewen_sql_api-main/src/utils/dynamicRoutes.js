/**
 * 动态路由加载器
 * 从数据库加载API配置并动态注册Fastify路由
 */

import { query } from '../auth/platformDb.js';
import { optionalAuth } from '../middleware/authMiddleware.js';
import poolManager from '../database/pool.js';

/**
 * SQL参数替换
 * 将 #{param} 替换为 ?，并提取参数列表
 */
function parseSQLParams(sql) {
  const params = [];
  const regex = /#\{([^}]+)\}/g;
  let match;

  while ((match = regex.exec(sql)) !== null) {
    params.push(match[1]);
  }

  const parsedSQL = sql.replace(regex, '?');

  return { sql: parsedSQL, params };
}

/**
 * 执行SQL查询
 * 支持特殊数据源 'PLATFORM' - 使用平台数据库
 */
async function executeSQL(datasourceId, sql, params, requestParams) {
  try {
    // 构建参数值数组
    const values = params.map(paramName => {
      return requestParams[paramName] || null;
    });

    // 特殊处理：PLATFORM数据源使用平台数据库
    if (datasourceId === 'PLATFORM') {
      const results = await query(sql, values);
      return results;
    }

    // 执行查询
    const results = await poolManager.query(datasourceId, sql, values);

    return results;
  } catch (error) {
    console.error('SQL执行失败:', error);
    throw error;
  }
}

/**
 * 从数据库加载所有启用的API并注册路由
 */
export async function registerDynamicRoutes(fastify) {
  try {
    console.log('📝 从数据库加载API配置...');

    // 获取所有启用的API
    const apis = await query(
      `SELECT a.*, t.id as tenant_id
       FROM apis a
       JOIN tenants t ON a.tenant_id = t.id
       WHERE a.status = 1 AND t.status = 1
       ORDER BY a.created_at DESC`
    );

    if (apis.length === 0) {
      console.log('⚠️  没有找到启用的API配置');
      return;
    }

    // 为每个API注册路由
    for (const api of apis) {
      try {
        const sqlConfig = JSON.parse(api.sql_config);
        const apiParams = api.params ? JSON.parse(api.params) : [];

        // 解析SQL参数
        const { sql: parsedSQL, params: sqlParams } = parseSQLParams(sqlConfig.sql || sqlConfig.query || '');

        // 注册路由
        fastify.route({
          method: sqlConfig.method || 'POST',
          url: api.path,
          preHandler: optionalAuth, // 可选认证
          handler: async (request, reply) => {
            try {
              // 日志记录
              const startTime = Date.now();

              // 获取请求参数
              const requestParams = {
                ...request.query,
                ...request.body,
                ...request.params
              };

              // 验证必填参数
              const missingParams = [];
              for (const param of apiParams) {
                if (param.required && !requestParams[param.name]) {
                  missingParams.push(param.name);
                }
              }

              if (missingParams.length > 0) {
                return reply.status(400).send({
                  success: false,
                  error: 'MISSING_PARAMS',
                  message: `缺少必填参数: ${missingParams.join(', ')}`
                });
              }

              // 执行SQL
              const results = await executeSQL(
                sqlConfig.datasource_id || sqlConfig.datasource,
                parsedSQL,
                sqlParams,
                requestParams
              );

              // 记录日志（异步，不阻塞响应）
              const duration = Date.now() - startTime;
              logAPICall(api.id, request.user?.tenantId, request.user?.userId, requestParams, true, duration).catch(err => {
                console.error('记录API日志失败:', err);
              });

              // 返回结果
              return reply.send({
                success: true,
                data: results
              });

            } catch (error) {
              console.error(`API ${api.path} 执行失败:`, error);

              // 记录错误日志
              const duration = Date.now() - startTime;
              logAPICall(api.id, request.user?.tenantId, request.user?.userId, request.body, false, duration, error.message).catch(err => {
                console.error('记录API日志失败:', err);
              });

              return reply.status(500).send({
                success: false,
                error: error.code || 'SQL_ERROR',
                message: error.message || 'SQL执行失败'
              });
            }
          }
        });

        console.log(`  ✅ ${sqlConfig.method || 'POST'} ${api.path} (${api.name})`);

      } catch (error) {
        console.error(`  ❌ 注册API失败 [${api.path}]:`, error.message);
      }
    }

    console.log(`🎉 成功注册 ${apis.length} 个动态API路由`);

  } catch (error) {
    console.error('❌ 加载动态路由失败:', error);
  }
}

/**
 * 记录API调用日志
 */
async function logAPICall(apiId, tenantId, userId, params, success, duration, errorMessage = null) {
  try {
    const { execute } = await import('../auth/platformDb.js');

    await execute(
      `INSERT INTO api_logs (id, api_id, tenant_id, user_id, params, success, duration_ms, error_message, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        generateLogId(),
        apiId,
        tenantId || null,
        userId || null,
        JSON.stringify(params),
        success ? 1 : 0,
        duration,
        errorMessage
      ]
    );
  } catch (error) {
    // 日志记录失败不影响主流程
    console.error('记录API日志失败:', error.message);
  }
}

// 生成日志ID
function generateLogId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = 'log_';
  for (let i = 0; i < 16; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

/**
 * 热重载API路由
 * 用于在不重启服务器的情况下重新加载API配置
 */
export async function reloadDynamicRoutes(fastify) {
  console.log('🔄 重新加载动态路由...');

  // Fastify不支持直接删除路由，需要重启服务器
  // 这里只是重新注册新的路由（旧路由会被覆盖）
  await registerDynamicRoutes(fastify);

  console.log('✅ 动态路由重载完成');
}
