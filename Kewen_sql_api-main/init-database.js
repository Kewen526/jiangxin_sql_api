/**
 * 数据库初始化脚本
 * 执行方式：node init-database.js
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs';

// 加载环境变量
dotenv.config();

async function initDatabase() {
  let connection = null;

  try {
    console.log('🔌 连接数据库...');
    console.log(`   主机: ${process.env.PLATFORM_DB_HOST || 'localhost'}`);
    console.log(`   端口: ${process.env.PLATFORM_DB_PORT || 3306}`);
    console.log(`   用户: ${process.env.PLATFORM_DB_USER || 'root'}`);
    console.log('');

    // 创建数据库连接（不指定database，先创建数据库）
    connection = await mysql.createConnection({
      host: process.env.PLATFORM_DB_HOST || 'localhost',
      port: parseInt(process.env.PLATFORM_DB_PORT) || 3306,
      user: process.env.PLATFORM_DB_USER || 'root',
      password: process.env.PLATFORM_DB_PASSWORD,
      multipleStatements: true,
      charset: 'utf8mb4'
    });

    console.log('✅ 数据库连接成功！');
    console.log('');

    // 读取SQL文件
    console.log('📄 读取SQL脚本...');
    const sqlContent = fs.readFileSync('./database_cleanup_and_init.sql', 'utf8');

    // 执行SQL脚本
    console.log('⚙️  执行数据库初始化...');
    console.log('');

    const [results] = await connection.query(sqlContent);

    console.log('');
    console.log('✅ 数据库初始化完成！');
    console.log('');

    // 验证结果
    await connection.query('USE sql_api_platform');

    const [apis] = await connection.query("SELECT COUNT(*) as count FROM apis WHERE tenant_id = 'SYSTEM'");
    const [groups] = await connection.query("SELECT COUNT(*) as count FROM api_groups WHERE tenant_id = 'SYSTEM'");
    const [tenants] = await connection.query("SELECT COUNT(*) as count FROM tenants");

    console.log('📊 验证结果：');
    console.log(`   租户数量: ${tenants[0].count}`);
    console.log(`   API分组: ${groups[0].count}`);
    console.log(`   预置API: ${apis[0].count}`);
    console.log('');

    if (apis[0].count === 10) {
      console.log('🎉 10个预置API已成功创建！');
    } else {
      console.log(`⚠️  警告：预置API数量不正确（期望10个，实际${apis[0].count}个）`);
    }

    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('下一步：');
    console.log('1. 启动服务: npm start 或 npm run pm2:start');
    console.log('2. 访问管理后台: https://kewenai.asia/admin');
    console.log('3. 测试注册API: curl -X POST https://kewenai.asia/api/auth/register -H "Content-Type: application/json" -d \'{"company":"测试公司","email":"test@test.com","password":"test123"}\'');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

  } catch (error) {
    console.error('❌ 数据库初始化失败:', error.message);
    console.error('');
    console.error('请检查：');
    console.error('1. .env 文件中的数据库配置是否正确');
    console.error('2. 数据库服务是否正在运行');
    console.error('3. 数据库用户是否有足够的权限');
    console.error('');
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// 执行初始化
initDatabase();
