/**
 * 平台数据库连接池
 * 用于认证、租户、API配置等平台数据
 */

import mysql from 'mysql2/promise';

let pool = null;

/**
 * 获取平台数据库连接池
 */
export function getPlatformPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.PLATFORM_DB_HOST,
      port: parseInt(process.env.PLATFORM_DB_PORT) || 3306,
      user: process.env.PLATFORM_DB_USER,
      password: process.env.PLATFORM_DB_PASSWORD,
      database: process.env.PLATFORM_DB_DATABASE,

      // 连接池配置
      connectionLimit: parseInt(process.env.PLATFORM_DB_POOL_MAX) || 10,
      queueLimit: 0,
      waitForConnections: true,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,

      // 超时配置
      connectTimeout: parseInt(process.env.DB_CONNECT_TIMEOUT) || 10000,

      // 字符集
      charset: 'utf8mb4',
      timezone: '+08:00',
      dateStrings: true
    });
  }
  return pool;
}

/**
 * 执行查询（返回多行）
 */
export async function query(sql, params = []) {
  const pool = getPlatformPool();
  try {
    const [rows] = await pool.execute(sql, params);
    return rows;
  } catch (error) {
    console.error('❌ 平台数据库查询失败:', error.message);
    console.error('SQL:', sql);
    console.error('参数:', params);
    throw error;
  }
}

/**
 * 执行查询（返回单行）
 */
export async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * 执行插入/更新/删除操作
 */
export async function execute(sql, params = []) {
  const pool = getPlatformPool();
  try {
    const [result] = await pool.execute(sql, params);
    return result;
  } catch (error) {
    console.error('❌ 平台数据库执行失败:', error.message);
    console.error('SQL:', sql);
    console.error('参数:', params);
    throw error;
  }
}

/**
 * 测试数据库连接（带超时）
 */
export async function testConnection() {
  try {
    const pool = getPlatformPool();

    // 添加超时处理（5秒）
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });

    const connectionPromise = pool.getConnection();
    const connection = await Promise.race([connectionPromise, timeoutPromise]);

    console.log(`✅ 平台数据库 (${process.env.PLATFORM_DB_DATABASE}) 连接成功`);
    connection.release();
    return true;
  } catch (error) {
    console.error('❌ 平台数据库连接失败:', error.message);
    return false;
  }
}

/**
 * 关闭连接池
 */
export async function closePlatformPool() {
  if (pool) {
    try {
      await pool.end();
      pool = null;
      console.log('✅ 平台数据库连接池已关闭');
    } catch (error) {
      console.error('❌ 平台数据库连接池关闭失败:', error.message);
    }
  }
}
