/**
 * API 日志管理路由
 * 查询API调用日志和统计信息
 */

import { query, queryOne } from '../auth/platformDb.js';
import { requireAuth, requireRole } from '../middleware/authMiddleware.js';

export default async function apiLogsRoutes(fastify, options) {

  /**
   * 获取API调用日志列表
   * GET /api/logs
   */
  fastify.get('/api/logs', {
    preHandler: requireAuth
  }, async (request, reply) => {
    try {
      const tenantId = request.user.tenantId;
      const { api_id, success, limit = 100, offset = 0 } = request.query;

      let sql = `
        SELECT l.*, a.name as api_name, a.path as api_path, u.email as user_email
        FROM api_logs l
        LEFT JOIN apis a ON l.api_id = a.id
        LEFT JOIN users u ON l.user_id = u.id
        WHERE l.tenant_id = ?
      `;
      const params = [tenantId];

      if (api_id) {
        sql += ' AND l.api_id = ?';
        params.push(api_id);
      }

      if (success !== undefined) {
        sql += ' AND l.success = ?';
        params.push(success === 'true' || success === '1' ? 1 : 0);
      }

      sql += ' ORDER BY l.created_at DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit), parseInt(offset));

      const logs = await query(sql, params);

      return reply.send({
        success: true,
        data: logs
      });

    } catch (error) {
      console.error('获取日志列表失败:', error);
      return reply.status(500).send({
        success: false,
        message: '获取日志列表失败'
      });
    }
  });

  /**
   * 获取API统计信息
   * GET /api/logs/stats
   */
  fastify.get('/api/logs/stats', {
    preHandler: requireAuth
  }, async (request, reply) => {
    try {
      const tenantId = request.user.tenantId;
      const { api_id, days = 7 } = request.query;

      let sql = `
        SELECT
          COUNT(*) as total_calls,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_calls,
          SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed_calls,
          ROUND(AVG(duration_ms), 2) as avg_duration_ms,
          MIN(duration_ms) as min_duration_ms,
          MAX(duration_ms) as max_duration_ms
        FROM api_logs
        WHERE tenant_id = ?
        AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
      `;
      const params = [tenantId, parseInt(days)];

      if (api_id) {
        sql += ' AND api_id = ?';
        params.push(api_id);
      }

      const stats = await queryOne(sql, params);

      return reply.send({
        success: true,
        data: stats
      });

    } catch (error) {
      console.error('获取统计信息失败:', error);
      return reply.status(500).send({
        success: false,
        message: '获取统计信息失败'
      });
    }
  });

  /**
   * 获取API调用趋势（按小时/天）
   * GET /api/logs/trends
   */
  fastify.get('/api/logs/trends', {
    preHandler: requireAuth
  }, async (request, reply) => {
    try {
      const tenantId = request.user.tenantId;
      const { api_id, days = 7, group_by = 'hour' } = request.query;

      let dateFormat;
      if (group_by === 'hour') {
        dateFormat = '%Y-%m-%d %H:00:00';
      } else {
        dateFormat = '%Y-%m-%d';
      }

      let sql = `
        SELECT
          DATE_FORMAT(created_at, ?) as time_slot,
          COUNT(*) as total_calls,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_calls,
          SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed_calls,
          ROUND(AVG(duration_ms), 2) as avg_duration_ms
        FROM api_logs
        WHERE tenant_id = ?
        AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
      `;
      const params = [dateFormat, tenantId, parseInt(days)];

      if (api_id) {
        sql += ' AND api_id = ?';
        params.push(api_id);
      }

      sql += ' GROUP BY time_slot ORDER BY time_slot DESC';

      const trends = await query(sql, params);

      return reply.send({
        success: true,
        data: trends
      });

    } catch (error) {
      console.error('获取趋势数据失败:', error);
      return reply.status(500).send({
        success: false,
        message: '获取趋势数据失败'
      });
    }
  });

  /**
   * 获取热门API排行
   * GET /api/logs/top-apis
   */
  fastify.get('/api/logs/top-apis', {
    preHandler: requireAuth
  }, async (request, reply) => {
    try {
      const tenantId = request.user.tenantId;
      const { days = 7, limit = 10 } = request.query;

      const sql = `
        SELECT
          a.id,
          a.name,
          a.path,
          COUNT(l.id) as total_calls,
          SUM(CASE WHEN l.success = 1 THEN 1 ELSE 0 END) as success_calls,
          SUM(CASE WHEN l.success = 0 THEN 1 ELSE 0 END) as failed_calls,
          ROUND(AVG(l.duration_ms), 2) as avg_duration_ms
        FROM apis a
        LEFT JOIN api_logs l ON a.id = l.api_id
          AND l.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        WHERE a.tenant_id = ?
        GROUP BY a.id, a.name, a.path
        ORDER BY total_calls DESC
        LIMIT ?
      `;

      const topAPIs = await query(sql, [parseInt(days), tenantId, parseInt(limit)]);

      return reply.send({
        success: true,
        data: topAPIs
      });

    } catch (error) {
      console.error('获取热门API失败:', error);
      return reply.status(500).send({
        success: false,
        message: '获取热门API失败'
      });
    }
  });

  /**
   * 清理旧日志
   * DELETE /api/logs/cleanup
   */
  fastify.delete('/api/logs/cleanup', {
    preHandler: [requireAuth, requireRole('admin')]
  }, async (request, reply) => {
    try {
      const tenantId = request.user.tenantId;
      const { days = 30 } = request.body;

      const { execute } = await import('../auth/platformDb.js');

      const result = await execute(
        `DELETE FROM api_logs
         WHERE tenant_id = ?
         AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
        [tenantId, parseInt(days)]
      );

      return reply.send({
        success: true,
        message: `已删除 ${result.affectedRows} 条日志记录`
      });

    } catch (error) {
      console.error('清理日志失败:', error);
      return reply.status(500).send({
        success: false,
        message: '清理日志失败'
      });
    }
  });

}
