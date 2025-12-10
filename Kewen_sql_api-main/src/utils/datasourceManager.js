/**
 * 数据源配置管理工具
 * 负责读取、修改、保存 datasources.json
 * 支持动态添加、删除数据源
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATASOURCES_PATH = path.join(__dirname, '../../datasources.json');

class DatasourceManager {
  /**
   * 读取所有数据源配置
   * @param {Object} envConfig - 环境变量配置对象
   * @returns {Array} 数据源列表（已替换环境变量）
   */
  async getAllDatasources(envConfig = {}) {
    try {
      const config = await this._readConfig();

      // 替换环境变量占位符
      const datasources = (config.datasources || []).map(ds => {
        return {
          ...ds,
          host: this._replaceEnvVar(ds.host, envConfig),
          port: parseInt(this._replaceEnvVar(ds.port, envConfig)) || 3306,
          user: this._replaceEnvVar(ds.user, envConfig),
          password: this._replaceEnvVar(ds.password, envConfig),
          database: this._replaceEnvVar(ds.database, envConfig),
          poolMin: parseInt(this._replaceEnvVar(ds.poolMin, envConfig)) || 2,
          poolMax: parseInt(this._replaceEnvVar(ds.poolMax, envConfig)) || 10
        };
      });

      return datasources;
    } catch (error) {
      console.error('读取数据源配置失败:', error);
      throw new Error('读取数据源配置失败');
    }
  }

  /**
   * 获取数据源列表（仅基本信息，不包含密码）
   * @returns {Array} 数据源列表
   */
  async getDatasourcesList() {
    try {
      const config = await this._readConfig();

      return (config.datasources || []).map(ds => ({
        id: ds.id,
        name: ds.name,
        host: ds.host,
        port: ds.port,
        user: ds.user,
        database: ds.database,
        poolMin: ds.poolMin,
        poolMax: ds.poolMax,
        createTime: ds.createTime,
        updateTime: ds.updateTime
      }));
    } catch (error) {
      console.error('读取数据源列表失败:', error);
      throw new Error('读取数据源列表失败');
    }
  }

  /**
   * 根据 ID 获取单个数据源
   * @param {string} id - 数据源ID
   * @returns {Object} 数据源对象
   */
  async getDatasourceById(id) {
    const config = await this._readConfig();
    const datasource = config.datasources.find(ds => ds.id === id);
    return datasource || null;
  }

  /**
   * 创建新的数据源
   * @param {Object} dsData - 数据源数据
   * @param {string} dsData.name - 数据源名称
   * @param {string} dsData.host - 主机地址
   * @param {number} dsData.port - 端口号
   * @param {string} dsData.user - 用户名
   * @param {string} dsData.password - 密码
   * @param {string} dsData.database - 数据库名
   * @param {number} dsData.poolMin - 最小连接数
   * @param {number} dsData.poolMax - 最大连接数
   * @returns {Object} 新创建的数据源
   */
  async createDatasource(dsData) {
    const config = await this._readConfig();

    // 生成新的 ID
    const newId = this._generateId();

    const newDatasource = {
      id: newId,
      name: dsData.name,
      host: dsData.host,
      port: dsData.port || 3306,
      user: dsData.user,
      password: dsData.password,
      database: dsData.database,
      poolMin: dsData.poolMin || 2,
      poolMax: dsData.poolMax || 10,
      envPrefix: null, // 新增的数据源不使用环境变量
      createTime: new Date().toISOString().replace('T', ' ').substring(0, 19),
      updateTime: new Date().toISOString().replace('T', ' ').substring(0, 19)
    };

    config.datasources.push(newDatasource);
    await this._saveConfig(config);

    return newDatasource;
  }

  /**
   * 更新数据源
   * @param {string} id - 数据源ID
   * @param {Object} dsData - 更新的数据
   * @returns {Object} 更新后的数据源
   */
  async updateDatasource(id, dsData) {
    const config = await this._readConfig();
    const index = config.datasources.findIndex(ds => ds.id === id);

    if (index === -1) {
      throw new Error('数据源不存在');
    }

    const existingDs = config.datasources[index];

    // 更新字段
    config.datasources[index] = {
      ...existingDs,
      name: dsData.name !== undefined ? dsData.name : existingDs.name,
      host: dsData.host !== undefined ? dsData.host : existingDs.host,
      port: dsData.port !== undefined ? dsData.port : existingDs.port,
      user: dsData.user !== undefined ? dsData.user : existingDs.user,
      password: dsData.password !== undefined ? dsData.password : existingDs.password,
      database: dsData.database !== undefined ? dsData.database : existingDs.database,
      poolMin: dsData.poolMin !== undefined ? dsData.poolMin : existingDs.poolMin,
      poolMax: dsData.poolMax !== undefined ? dsData.poolMax : existingDs.poolMax,
      updateTime: new Date().toISOString().replace('T', ' ').substring(0, 19)
    };

    await this._saveConfig(config);

    return config.datasources[index];
  }

  /**
   * 删除数据源
   * @param {string} id - 数据源ID
   * @returns {Object} 被删除的数据源
   */
  async deleteDatasource(id) {
    const config = await this._readConfig();
    const index = config.datasources.findIndex(ds => ds.id === id);

    if (index === -1) {
      throw new Error('数据源不存在');
    }

    const deletedDs = config.datasources.splice(index, 1)[0];
    await this._saveConfig(config);

    return deletedDs;
  }

  /**
   * 测试数据源连接
   * @param {Object} dsConfig - 数据源配置
   * @returns {Object} 测试结果
   */
  async testConnection(dsConfig) {
    let connection = null;
    try {
      const config = {
        host: dsConfig.host,
        port: parseInt(dsConfig.port) || 3306,
        user: dsConfig.user,
        password: dsConfig.password,
        database: dsConfig.database,
        connectTimeout: 10000
      };

      connection = await mysql.createConnection(config);

      // 执行一个简单的查询来验证连接
      const [result] = await connection.execute('SELECT 1 as test');

      return {
        success: true,
        message: '连接成功',
        serverInfo: {
          database: dsConfig.database,
          host: dsConfig.host
        }
      };
    } catch (error) {
      return {
        success: false,
        message: '连接失败: ' + error.message,
        error: error.code
      };
    } finally {
      if (connection) {
        try {
          await connection.end();
        } catch (e) {
          // 忽略关闭连接时的错误
        }
      }
    }
  }

  /**
   * 替换环境变量占位符
   * @param {string} value - 包含占位符的值 (如: ${DB1_HOST})
   * @param {Object} envConfig - 环境变量对象
   * @returns {string} 替换后的值
   */
  _replaceEnvVar(value, envConfig) {
    if (typeof value !== 'string') {
      return value;
    }

    const match = value.match(/^\$\{(.+)\}$/);
    if (match) {
      const envKey = match[1];
      return envConfig[envKey] || value;
    }

    return value;
  }

  /**
   * 读取完整配置
   */
  async _readConfig() {
    try {
      const content = await fs.readFile(DATASOURCES_PATH, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // 文件不存在，自动创建空配置文件
        console.log('📝 数据源配置文件不存在，自动创建...');
        const emptyConfig = { datasources: [] };
        await this._saveConfig(emptyConfig);
        return emptyConfig;
      }
      console.error('读取数据源配置失败:', error);
      throw new Error('读取数据源配置失败');
    }
  }

  /**
   * 保存配置
   */
  async _saveConfig(config) {
    try {
      const content = JSON.stringify(config, null, 2);
      await fs.writeFile(DATASOURCES_PATH, content, 'utf-8');
    } catch (error) {
      console.error('保存数据源配置失败:', error);
      throw new Error('保存数据源配置失败');
    }
  }

  /**
   * 生成随机 ID (8位字母数字)
   */
  _generateId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    for (let i = 0; i < 8; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
  }
}

export default new DatasourceManager();
