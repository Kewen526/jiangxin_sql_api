-- ================================================
-- 数据库迁移脚本 - API日志表
-- ================================================

USE sql_api_platform;

-- API 调用日志表
CREATE TABLE IF NOT EXISTS api_logs (
    id VARCHAR(32) PRIMARY KEY,
    api_id VARCHAR(32) NOT NULL COMMENT 'API ID',
    tenant_id VARCHAR(32) COMMENT '租户ID',
    user_id VARCHAR(32) COMMENT '用户ID',
    params JSON COMMENT '请求参数',
    success TINYINT NOT NULL COMMENT '是否成功 1=成功 0=失败',
    duration_ms INT NOT NULL COMMENT '执行时长（毫秒）',
    error_message TEXT COMMENT '错误信息',
    ip_address VARCHAR(45) COMMENT 'IP地址',
    user_agent VARCHAR(500) COMMENT 'User Agent',
    created_at DATETIME DEFAULT NOW() COMMENT '创建时间',
    INDEX idx_api_id (api_id),
    INDEX idx_tenant_id (tenant_id),
    INDEX idx_created_at (created_at),
    FOREIGN KEY (api_id) REFERENCES apis(id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) COMMENT 'API调用日志';

-- API 访问统计视图（可选）
CREATE OR REPLACE VIEW api_stats AS
SELECT
    a.id as api_id,
    a.name as api_name,
    a.path as api_path,
    a.tenant_id,
    t.name as tenant_name,
    COUNT(l.id) as total_calls,
    SUM(CASE WHEN l.success = 1 THEN 1 ELSE 0 END) as success_calls,
    SUM(CASE WHEN l.success = 0 THEN 1 ELSE 0 END) as failed_calls,
    ROUND(AVG(l.duration_ms), 2) as avg_duration_ms,
    MAX(l.created_at) as last_call_at
FROM apis a
LEFT JOIN api_logs l ON a.id = l.api_id
LEFT JOIN tenants t ON a.tenant_id = t.id
GROUP BY a.id, a.name, a.path, a.tenant_id, t.name;

-- 示例查询
-- 查询API统计：SELECT * FROM api_stats WHERE tenant_id = 't_xxxxx';
-- 查询最近100条日志：SELECT * FROM api_logs ORDER BY created_at DESC LIMIT 100;
-- 查询失败的API调用：SELECT * FROM api_logs WHERE success = 0 ORDER BY created_at DESC;
