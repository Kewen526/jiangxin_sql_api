/**
 * 数据源管理路由
 * 支持租户隔离的数据源 CRUD
 */

import { query, queryOne, execute } from '../auth/platformDb.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import poolManager from '../database/pool.js';

// 生成ID
function generateId(prefix = 'ds') {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 8; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}_${id}`;
}

export default async function datasourceRoutes(fastify, options) {

  /**
   * 获取当前租户的所有数据源
   * GET /api/datasources
   */
  fastify.get('/api/datasources', {
    preHandler: requireAuth
  }, async (request, reply) => {
    try {
      const tenantId = request.user.tenantId;

      const datasources = await query(
        `SELECT id, name, host, port, username, database_name, status, created_at
         FROM datasources
         WHERE tenant_id = ?
         ORDER BY created_at DESC`,
        [tenantId]
      );

      return reply.send({
        success: true,
        data: datasources
      });

    } catch (error) {
      console.error('获取数据源列表失败:', error);
      return reply.status(500).send({
        success: false,
        message: '获取数据源列表失败'
      });
    }
  });

  /**
   * 获取单个数据源详情
   * GET /api/datasources/:id
   */
  fastify.get('/api/datasources/:id', {
    preHandler: requireAuth
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const tenantId = request.user.tenantId;

      const datasource = await queryOne(
        `SELECT id, name, host, port, username, database_name, status, created_at
         FROM datasources
         WHERE id = ? AND tenant_id = ?`,
        [id, tenantId]
      );

      if (!datasource) {
        return reply.status(404).send({
          success: false,
          message: '数据源不存在'
        });
      }

      return reply.send({
        success: true,
        data: datasource
      });

    } catch (error) {
      console.error('获取数据源详情失败:', error);
      return reply.status(500).send({
        success: false,
        message: '获取数据源详情失败'
      });
    }
  });

  /**
   * 创建数据源
   * POST /api/datasources
   */
  fastify.post('/api/datasources', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object',
        required: ['name', 'host', 'port', 'username', 'password', 'database'],
        properties: {
          name: { type: 'string', minLength: 1 },
          host: { type: 'string', minLength: 1 },
          port: { type: 'integer', minimum: 1, maximum: 65535 },
          username: { type: 'string', minLength: 1 },
          password: { type: 'string', minLength: 1 },
          database: { type: 'string', minLength: 1 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { name, host, port, username, password, database } = request.body;
      const tenantId = request.user.tenantId;

      // 生成数据源ID
      const datasourceId = generateId('ds');

      // 先测试连接
      const testConfig = {
        id: datasourceId,
        name,
        host,
        port,
        user: username,
        password,
        database,
        poolMax: 10
      };

      try {
        // 测试连接（会自动添加到连接池）
        await poolManager.addDatasourcePool(testConfig);
      } catch (error) {
        return reply.status(400).send({
          success: false,
          message: '数据源连接失败: ' + error.message
        });
      }

      // 连接成功，保存到数据库
      await execute(
        `INSERT INTO datasources (id, tenant_id, name, host, port, username, password, database_name, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())`,
        [datasourceId, tenantId, name, host, port, username, password, database]
      );

      return reply.send({
        success: true,
        data: {
          id: datasourceId,
          name,
          host,
          port,
          username,
          database,
          status: 1
        },
        message: '数据源创建成功'
      });

    } catch (error) {
      console.error('创建数据源失败:', error);
      return reply.status(500).send({
        success: false,
        message: '创建数据源失败'
      });
    }
  });

  /**
   * 更新数据源
   * PUT /api/datasources/:id
   */
  fastify.put('/api/datasources/:id', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1 },
          host: { type: 'string', minLength: 1 },
          port: { type: 'integer', minimum: 1, maximum: 65535 },
          username: { type: 'string', minLength: 1 },
          password: { type: 'string' },
          database: { type: 'string', minLength: 1 },
          status: { type: 'integer', enum: [0, 1] }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const tenantId = request.user.tenantId;
      const updates = request.body;

      // 检查数据源是否存在
      const existing = await queryOne(
        'SELECT * FROM datasources WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      if (!existing) {
        return reply.status(404).send({
          success: false,
          message: '数据源不存在'
        });
      }

      // 如果修改了连接信息，需要测试连接
      if (updates.host || updates.port || updates.username || updates.password || updates.database) {
        const testConfig = {
          id,
          name: updates.name || existing.name,
          host: updates.host || existing.host,
          port: updates.port || existing.port,
          user: updates.username || existing.username,
          password: updates.password || existing.password,
          database: updates.database || existing.database_name,
          poolMax: 10
        };

        try {
          // 重新加载连接池
          await poolManager.reloadDatasourcePool(id, testConfig);
        } catch (error) {
          return reply.status(400).send({
            success: false,
            message: '数据源连接失败: ' + error.message
          });
        }
      }

      // 构建更新语句
      const fields = [];
      const values = [];

      if (updates.name) {
        fields.push('name = ?');
        values.push(updates.name);
      }
      if (updates.host) {
        fields.push('host = ?');
        values.push(updates.host);
      }
      if (updates.port) {
        fields.push('port = ?');
        values.push(updates.port);
      }
      if (updates.username) {
        fields.push('username = ?');
        values.push(updates.username);
      }
      if (updates.password) {
        fields.push('password = ?');
        values.push(updates.password);
      }
      if (updates.database) {
        fields.push('database_name = ?');
        values.push(updates.database);
      }
      if (updates.status !== undefined) {
        fields.push('status = ?');
        values.push(updates.status);
      }

      if (fields.length > 0) {
        fields.push('updated_at = NOW()');
        values.push(id, tenantId);

        await execute(
          `UPDATE datasources SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`,
          values
        );
      }

      return reply.send({
        success: true,
        message: '数据源更新成功'
      });

    } catch (error) {
      console.error('更新数据源失败:', error);
      return reply.status(500).send({
        success: false,
        message: '更新数据源失败'
      });
    }
  });

  /**
   * 删除数据源
   * DELETE /api/datasources/:id
   */
  fastify.delete('/api/datasources/:id', {
    preHandler: requireAuth
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const tenantId = request.user.tenantId;

      // 检查是否有 API 使用该数据源
      const apis = await query(
        'SELECT id FROM apis WHERE tenant_id = ? AND JSON_EXTRACT(sql_config, "$.datasource") = ?',
        [tenantId, id]
      );

      if (apis.length > 0) {
        return reply.status(400).send({
          success: false,
          message: `该数据源正在被 ${apis.length} 个 API 使用，无法删除`
        });
      }

      // 删除数据源
      const result = await execute(
        'DELETE FROM datasources WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      if (result.affectedRows === 0) {
        return reply.status(404).send({
          success: false,
          message: '数据源不存在'
        });
      }

      // 关闭连接池
      try {
        await poolManager.removeDatasourcePool(id);
      } catch (error) {
        console.warn('关闭数据源连接池失败:', error.message);
      }

      return reply.send({
        success: true,
        message: '数据源删除成功'
      });

    } catch (error) {
      console.error('删除数据源失败:', error);
      return reply.status(500).send({
        success: false,
        message: '删除数据源失败'
      });
    }
  });

  /**
   * 测试数据源连接
   * POST /api/datasources/test
   */
  fastify.post('/api/datasources/test', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object',
        required: ['host', 'port', 'username', 'password', 'database'],
        properties: {
          host: { type: 'string' },
          port: { type: 'integer' },
          username: { type: 'string' },
          password: { type: 'string' },
          database: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { host, port, username, password, database } = request.body;

      // 创建临时连接测试
      const mysql = (await import('mysql2/promise')).default;
      const connection = await mysql.createConnection({
        host,
        port,
        user: username,
        password,
        database,
        connectTimeout: 5000
      });

      await connection.ping();
      await connection.end();

      return reply.send({
        success: true,
        message: '连接成功'
      });

    } catch (error) {
      return reply.status(400).send({
        success: false,
        message: '连接失败: ' + error.message
      });
    }
  });

}
