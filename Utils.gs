/**
 * Beauty Noodle Shop - Utils.gs
 * @version 9.2.0
 */

function createJSONResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function createErrorResponse(message, code = 500) {
  return createJSONResponse({ success: false, error: message, code, timestamp: new Date().toISOString() });
}

function createSuccessResponse(data, message = '') {
  return createJSONResponse({ success: true, data, message, timestamp: new Date().toISOString() });
}

function logAction(action, details, userId) {
  try {
    const ss = getSpreadsheet();
    let sheet = ss.getSheetByName('Logs');
    if (!sheet) {
      sheet = ss.insertSheet('Logs');
      sheet.getRange('A1:F1').setValues([['timestamp','userId','action','details','ip_address','user_agent']]);
      sheet.setFrozenRows(1);
    }
    const safeDetails = details ? details.toString().substring(0, 500) : '';
    sheet.appendRow([new Date(), userId || 'SYSTEM', action, safeDetails, '', '']);
    const maxRows = 10000;
    const currentRows = sheet.getLastRow();
    if (currentRows > maxRows) sheet.deleteRows(2, currentRows - maxRows);
  } catch (error) {
    console.error('Log failed:', error);
    console.log({ action, details, userId, error: error.message });
  }
}

function getRecentLogs(limit = 100) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Logs');
    if (!sheet) return { success: true, data: [] };
    const data = sheet.getDataRange().getValues();
    const rows = data.slice(1).reverse();
    const logs = rows.slice(0, limit).map(row => ({ timestamp: row[0], userId: row[1], action: row[2], details: row[3] }));
    return { success: true, data: logs };
  } catch (error) { logAction('GET_LOGS_ERROR', error.message, 'SYSTEM'); return { success: false, error: error.message }; }
}

function cleanOldLogs() {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Logs');
    if (!sheet) return;
    const data = sheet.getDataRange().getValues();
    const rows = data.slice(1);
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 90);
    let rowsToDelete = [];
    for (let i = rows.length - 1; i >= 0; i--) if (new Date(rows[i][0]) < cutoff) rowsToDelete.push(i + 2);
    rowsToDelete.sort((a, b) => b - a);
    rowsToDelete.forEach(rowNum => sheet.deleteRow(rowNum));
    logAction('CLEAN_LOGS', `Deleted ${rowsToDelete.length} old logs`, 'SYSTEM');
  } catch (error) { console.error('Clean logs error:', error); }
}

function createBackup() {
  try {
    const ss = getSpreadsheet();
    const backupName = `Backup_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}`;
    const backupFile = DriveApp.getFileById(ss.getId()).makeCopy(backupName);
    let backupFolder;
    const folderIterator = DriveApp.getFoldersByName('ShopBackups');
    if (!folderIterator.hasNext()) backupFolder = DriveApp.createFolder('ShopBackups');
    else backupFolder = folderIterator.next();
    backupFile.moveTo(backupFolder);
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
    const files = backupFolder.getFiles();
    let deletedCount = 0;
    while (files.hasNext()) { const file = files.next(); if (file.getDateCreated() < cutoff) { file.setTrashed(true); deletedCount++; } }
    logAction('BACKUP_CREATED', `Backup created: ${backupName}, deleted ${deletedCount} old backups`, 'SYSTEM');
    return { success: true, message: `Backup created: ${backupName}` };
  } catch (error) { logAction('BACKUP_ERROR', error.message, 'SYSTEM'); return { success: false, error: error.message }; }
}

function listBackups() {
  try {
    const folderIterator = DriveApp.getFoldersByName('ShopBackups');
    if (!folderIterator.hasNext()) return { success: true, data: [] };
    const backupFolder = folderIterator.next();
    const files = backupFolder.getFiles();
    const backups = [];
    while (files.hasNext()) { const file = files.next(); backups.push({ name: file.getName(), id: file.getId(), size: file.getSize(), created: file.getDateCreated(), url: file.getUrl() }); }
    backups.sort((a, b) => b.created - a.created);
    return { success: true, data: backups };
  } catch (error) { logAction('LIST_BACKUPS_ERROR', error.message, 'SYSTEM'); return { success: false, error: error.message }; }
}

function isValidEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
function isValidThaiPhone(phone) { return /^0[0-9]{8,9}$/.test(phone.replace(/-/g, '')); }
function isValidPrice(price) { return !isNaN(price) && price >= 0 && price <= 1000000; }
function isValidStock(stock) { return !isNaN(stock) && stock >= 0 && stock <= 1000000; }

function clearAllCache() {
  try {
    CacheService.getScriptCache().removeAll();
    logAction('CACHE_CLEARED', 'All cache cleared', 'SYSTEM');
    return { success: true };
  } catch (error) { logAction('CACHE_CLEAR_ERROR', error.message, 'SYSTEM'); return { success: false, error: error.message }; }
}

function refreshMenuCache() {
  try {
    const cache = CacheService.getScriptCache();
    const menu = getMenuItemsWithDetails();
    cache.put('menu_items_v2', JSON.stringify(menu), 300);
    logAction('CACHE_REFRESHED', 'Menu cache refreshed', 'SYSTEM');
    return { success: true };
  } catch (error) { logAction('CACHE_REFRESH_ERROR', error.message, 'SYSTEM'); return { success: false, error: error.message }; }
}

function systemHealthCheck() {
  try {
    const health = { status: 'healthy', timestamp: new Date().toISOString(), checks: {} };

    try {
      const ss = getSpreadsheet();
      health.checks.spreadsheet = { status: 'ok', name: ss.getName(), url: ss.getUrl() };
    } catch (e) {
      health.checks.spreadsheet = { status: 'error', message: e.message };
      health.status = 'degraded';
    }

    // แก้ไข: ไม่อ้าง lineConfig.liffId ที่ไม่มีอยู่ใน getLineConfig()
    // ดึง liffId จาก Script Properties โดยตรงแทน
    const lineConfig = getLineConfig();
    const liffId = PropertiesService.getScriptProperties().getProperty('LIFF_ID') || '';
    health.checks.line = {
      status: lineConfig.channelAccessToken ? 'ok' : 'warning',
      configured: isLineMessagingReady(),
      liffConfigured: !!liffId,   // แก้ไข: ดึง liffId ถูกที่
      liffId: liffId,
      message: lineConfig.channelAccessToken ? 'LINE configured' : 'LINE not fully configured'
    };

    try {
      const cache = CacheService.getScriptCache();
      cache.put('health_check', 'ok', 60);
      health.checks.cache = { status: 'ok' };
    } catch (e) {
      health.checks.cache = { status: 'error', message: e.message };
    }

    try {
      const ss = getSpreadsheet();
      const logsSheet = ss.getSheetByName('Logs');
      if (logsSheet) {
        const logCount = logsSheet.getLastRow() - 1;
        health.checks.logs = {
          status: logCount < 9000 ? 'ok' : 'warning',
          count: logCount,
          message: logCount < 9000 ? 'Logs within limit' : 'Logs approaching limit'
        };
      }
    } catch (e) { health.checks.logs = { status: 'error', message: e.message }; }

    return { success: true, data: health };
  } catch (error) {
    logAction('HEALTH_CHECK_ERROR', error.message, 'SYSTEM');
    return { success: false, error: error.message };
  }
}

function upgradeDatabaseSchema() {
  try {
    const ss = getSpreadsheet();
    const version = '9.1.0';
    const ordersSheet = ss.getSheetByName('Orders');
    if (ordersSheet) {
      const headers = ordersSheet.getRange(1, 1, 1, ordersSheet.getLastColumn()).getValues()[0];
      if (!headers.includes('lineUserId')) ordersSheet.getRange(1, ordersSheet.getLastColumn() + 1).setValue('lineUserId');
      if (!headers.includes('customer_email')) ordersSheet.getRange(1, ordersSheet.getLastColumn() + 1).setValue('customer_email');
    }
    const customersSheet = ss.getSheetByName('Customers');
    if (customersSheet) {
      const headers = customersSheet.getRange(1, 1, 1, customersSheet.getLastColumn()).getValues()[0];
      if (!headers.includes('pictureUrl')) customersSheet.getRange(1, customersSheet.getLastColumn() + 1).setValue('pictureUrl');
      if (!headers.includes('source')) customersSheet.getRange(1, customersSheet.getLastColumn() + 1).setValue('source');
    }
    const configSheet = ss.getSheetByName('Config');
    if (configSheet) {
      const data = configSheet.getDataRange().getValues();
      let foundRow = -1;
      for (let i = 1; i < data.length; i++) if (data[i][0] === 'db_version') { foundRow = i + 1; break; }
      if (foundRow === -1) configSheet.appendRow(['db_version', version]);
      else configSheet.getRange(foundRow, 2).setValue(version);
    }
    logAction('SCHEMA_UPGRADE', `Database upgraded to version ${version}`, 'SYSTEM');
    return { success: true, message: `Upgraded to version ${version}` };
  } catch (error) { logAction('SCHEMA_UPGRADE_ERROR', error.message, 'SYSTEM'); return { success: false, error: error.message }; }
}
