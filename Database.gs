/**
 * Beauty Noodle Shop - Database.gs
 * @version 9.2.0
 */

function getSpreadsheet() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!spreadsheetId) throw new Error('Spreadsheet ID not found. Please run initialSetup() first.');
  return SpreadsheetApp.openById(spreadsheetId);
}

function setupDatabase() {
  try {
    const ss = getSpreadsheet();
    createConfigSheet(ss);
    createMenuSheet(ss);
    createOrdersSheet(ss);
    createLogsSheet(ss);
    createInventorySheet(ss);
    createCustomersSheet(ss);
    Logger.log('✅ Database setup completed!');
    return { success: true, message: 'Database initialized successfully' };
  } catch (error) {
    Logger.log('❌ Error in setupDatabase: ' + error.message);
    return { success: false, message: error.message };
  }
}

function createConfigSheet(ss) {
  let sheet = ss.getSheetByName('Config');
  if (!sheet) {
    sheet = ss.insertSheet('Config');
    sheet.getRange('A1:B1').setValues([['key', 'value']]).setFontWeight('bold').setBackground('#4285f4').setFontColor('#ffffff');

    // แก้ไข: ดึง liffId จาก Script Properties แทน Hardcode
    // ถ้ายังไม่ได้ตั้งค่าจะเป็นค่าว่าง ให้ Admin ใส่เองใน Settings
    const liffIdFromProp = PropertiesService.getScriptProperties().getProperty('LIFF_ID') || '';

    const configData = [
      ['shopName', 'ร้านของฉัน'],
      ['isOpen', 'true'],
      ['liffId', liffIdFromProp],
      ['taxRate', '0'],
      ['serviceCharge', '0'],
      ['currency', 'THB'],
      ['phoneNumber', ''],
      ['openTime', '08:00'],
      ['closeTime', '20:00'],
      ['address', ''],
      ['lineOfficial', '']
    ];
    // บังคับ column B ทั้งหมดเป็น Plain Text ก่อน เพื่อป้องกัน Sheets แปลง 08:00 เป็น Date
    sheet.getRange(2, 2, configData.length, 1).setNumberFormat('@STRING@');
    sheet.getRange(2, 1, configData.length, 2).setValues(configData);
  }
  sheet.setFrozenRows(1);
}

function createMenuSheet(ss) {
  let sheet = ss.getSheetByName('Menu');
  if (!sheet) {
    sheet = ss.insertSheet('Menu');
    const headers = [['id', 'name', 'category', 'price', 'options_json', 'status', 'image_url', 'description', 'ingredients', 'sort_order', 'created_at', 'updated_at']];
    sheet.getRange('A1:L1').setValues(headers).setFontWeight('bold').setBackground('#34a853').setFontColor('#ffffff');
    // หมายเหตุ: ไม่ใส่ sample data ที่มีรูปภาพ Unsplash hardcode
    // เพราะ URL รูปภาพควรเป็นของร้านจริง
  }
  sheet.setFrozenRows(1);
}

function createOrdersSheet(ss) {
  let sheet = ss.getSheetByName('Orders');
  if (!sheet) {
    sheet = ss.insertSheet('Orders');
    const headers = [['orderId', 'userId', 'items_json', 'totalPrice', 'type', 'payment', 'status', 'timestamp', 'note', 'last_updated', 'customer_name', 'customer_phone', 'lineUserId']];
    sheet.getRange('A1:M1').setValues(headers).setFontWeight('bold').setBackground('#fbbc04').setFontColor('#000000');
  }
  sheet.setFrozenRows(1);
}

function createLogsSheet(ss) {
  let sheet = ss.getSheetByName('Logs');
  if (!sheet) {
    sheet = ss.insertSheet('Logs');
    const headers = [['timestamp', 'userId', 'action', 'details', 'ip_address', 'user_agent']];
    sheet.getRange('A1:F1').setValues(headers).setFontWeight('bold').setBackground('#ea4335').setFontColor('#ffffff');
  }
  sheet.setFrozenRows(1);
}

function createInventorySheet(ss) {
  let sheet = ss.getSheetByName('Inventory');
  if (!sheet) {
    sheet = ss.insertSheet('Inventory');
    const headers = [['id', 'name', 'category', 'unit', 'currentStock', 'minStock', 'maxStock', 'costPerUnit', 'lastUpdated', 'supplier', 'location']];
    sheet.getRange('A1:K1').setValues(headers).setFontWeight('bold').setBackground('#34a853').setFontColor('#ffffff');
    // หมายเหตุ: ไม่ใส่ sample inventory เพราะข้อมูลวัตถุดิบขึ้นกับร้านจริง
  }
  sheet.setFrozenRows(1);
}

function createCustomersSheet(ss) {
  let sheet = ss.getSheetByName('Customers');
  if (!sheet) {
    sheet = ss.insertSheet('Customers');
    const headers = [['userId', 'name', 'phone', 'email', 'pictureUrl', 'source', 'totalSpent', 'orderCount', 'lastOrder', 'createdAt', 'notes']];
    sheet.getRange('A1:K1').setValues(headers).setFontWeight('bold').setBackground('#9c27b0').setFontColor('#ffffff');
  }
  sheet.setFrozenRows(1);
}

function getConfig() {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Config');
    if (!sheet) return {};
    const data = sheet.getDataRange().getValues();
    const config = {};
    for (let i = 1; i < data.length; i++) if (data[i][0]) config[data[i][0]] = data[i][1];
    return config;
  } catch (error) {
    logAction('GET_CONFIG_ERROR', error.message, 'SYSTEM');
    return {};
  }
}

function parseConfigBoolean(value) {
  if (typeof value === 'boolean') return value;
  return String(value).trim().toLowerCase() === 'true';
}

function getMenuItemsWithDetails() {
  try {
    const cache = CacheService.getScriptCache();
    const cached = cache.get('menu_items_v2');
    if (cached) return JSON.parse(cached);
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Menu');
    if (!sheet) return [];
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return [];
    const headers = data[0];
    const rows = data.slice(1);
    const idIndex = headers.indexOf('id');
    const nameIndex = headers.indexOf('name');
    const categoryIndex = headers.indexOf('category');
    const priceIndex = headers.indexOf('price');
    const optionsIndex = headers.indexOf('options_json');
    const statusIndex = headers.indexOf('status');
    const imageIndex = headers.indexOf('image_url');
    const descIndex = headers.indexOf('description');
    const menu = [];
    for (const row of rows) {
      if (!row[idIndex]) continue;
      if (statusIndex !== -1 && row[statusIndex] !== 'active') continue;
      let options = [];
      if (optionsIndex !== -1 && row[optionsIndex]) {
        try { options = JSON.parse(row[optionsIndex]); } catch (e) { options = []; }
      }
      menu.push({
        id: row[idIndex],
        name: row[nameIndex] || 'ไม่ระบุชื่อ',
        category: row[categoryIndex] || 'ทั่วไป',
        price: parseFloat(row[priceIndex]) || 0,
        options: options,
        imageUrl: imageIndex !== -1 ? row[imageIndex] : null,
        description: descIndex !== -1 ? row[descIndex] : '',
        status: statusIndex !== -1 ? row[statusIndex] : 'active'
      });
    }
    cache.put('menu_items_v2', JSON.stringify(menu), 300);
    return menu;
  } catch (error) {
    logAction('GET_MENU_ITEMS_ERROR', error.message, 'SYSTEM');
    return [];
  }
}

function getOrderById(orderId) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Orders');
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === orderId) {
        return {
          orderId: data[i][0],
          userId: data[i][1],
          items: JSON.parse(data[i][2] || '[]'),
          totalPrice: Number(data[i][3]),
          type: data[i][4],
          payment: data[i][5],
          status: data[i][6],
          timestamp: data[i][7],
          note: data[i][8],
          customerName: data[i][10] || '',
          customerPhone: data[i][11] || '',
          lineUserId: data[i][12] || ''
        };
      }
    }
    return null;
  } catch (error) {
    logAction('GET_ORDER_ERROR', error.message, 'SYSTEM');
    return null;
  }
}

function getStockStatus(current, min) {
  if (current <= 0) return 'out';
  if (current <= min) return 'low';
  if (current <= min * 2) return 'medium';
  return 'high';
}

function getLastMenuId() {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Menu');
    if (!sheet) return 'M000';
    const data = sheet.getDataRange().getValues();
    const rows = data.slice(1);
    let lastId = 'M000';
    for (const row of rows) if (row[0] && row[0].toString().startsWith('M')) if (row[0] > lastId) lastId = row[0];
    return lastId;
  } catch (error) { return 'M000'; }
}

function getMenuData() {
  try {
    const menu = getMenuItemsWithDetails();
    logAction('GET_MENU', `Returned ${menu.length} items`, 'SYSTEM');
    return { success: true, data: { menu: menu, total: menu.length, categories: [...new Set(menu.map(item => item.category))] } };
  } catch (error) { logAction('GET_MENU_ERROR', error.message, 'SYSTEM'); throw error; }
}

function parseTimeFromSheet(value) {
  if (!value) return null;

  // กรณีเป็น string "08:00" อยู่แล้ว — คืนค่าตรงๆ
  if (typeof value === 'string' && /^\d{1,2}:\d{2}(:\d{2})?$/.test(value)) {
    const parts = value.split(':');
    return parts[0].padStart(2,'0') + ':' + parts[1].padStart(2,'0');
  }

  // กรณี Apps Script คืน Date object (เกิดจาก Sheets auto-convert "08:00" → Date)
  // ต้องใช้ getHours() ไม่ใช่ getUTCHours() เพราะ Apps Script ใช้ timezone ของ Spreadsheet
  if (value instanceof Date) {
    const h = value.getHours().toString().padStart(2, '0');
    const m = value.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  }

  // กรณีเป็น object ที่มี getHours (safety check)
  if (typeof value === 'object' && typeof value.getHours === 'function') {
    const h = value.getHours().toString().padStart(2, '0');
    const m = value.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  }

  // กรณีเป็น number (milliseconds หรือ serial date จาก Sheets)
  if (typeof value === 'number') {
    const d = new Date(value);
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  }

  // กรณีเป็น ISO string — ใช้ getHours() ผ่าน Date object (timezone local)
  if (typeof value === 'string' && value.includes('T')) {
    try {
      const d = new Date(value);
      const h = d.getHours().toString().padStart(2, '0');
      const m = d.getMinutes().toString().padStart(2, '0');
      return `${h}:${m}`;
    } catch(e) { return null; }
  }

  return String(value);
}

/**
 * fixTimeFormat() — รันครั้งเดียวเพื่อแก้ openTime/closeTime ที่ถูก Sheets แปลงเป็น Date แล้ว
 * วิธีใช้: เปิด Apps Script Editor → เลือกฟังก์ชัน fixTimeFormat → กด Run
 */
function fixTimeFormat() {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Config');
    if (!sheet) { Logger.log('❌ ไม่พบ Config sheet'); return; }

    // อ่านค่าดิบจาก Sheets (ยังไม่แปลง)
    const data = sheet.getDataRange().getValues();
    const timeKeys = ['openTime', 'closeTime'];
    let fixed = 0;

    for (let i = 1; i < data.length; i++) {
      const key = data[i][0];
      const val = data[i][1];
      if (timeKeys.includes(key)) {
        Logger.log(`ก่อนแก้ ${key}: ${val} (type: ${typeof val}, isDate: ${val instanceof Date})`);
        const timeStr = parseTimeFromSheet(val);
        Logger.log(`หลังแปลง: ${timeStr}`);
        if (timeStr) {
          // ตั้ง format เป็น Plain Text ก่อน จะได้ไม่ถูกแปลงกลับ
          const cell = sheet.getRange(i + 1, 2);
          cell.setNumberFormat('@STRING@');
          cell.setValue(timeStr);
          Logger.log(`✅ แก้ ${key} → "${timeStr}"`);
          fixed++;
        }
      }
    }
    Logger.log(`✅ fixTimeFormat เสร็จสิ้น แก้ไข ${fixed} รายการ`);
  } catch (e) {
    Logger.log('❌ fixTimeFormat error: ' + e.message);
  }
}

function getShopStatusData() {
  try {
    const config = getConfig();
    const isOpenByConfig = parseConfigBoolean(config.isOpen);
    // แก้ไข: ไม่มีค่า fallback ที่ hardcode ผิด ใช้ค่าว่างแทน
    return { success: true, data: {
      shopName: config.shopName || 'ร้านของฉัน',
      isOpen: isOpenByConfig,
      liffId: config.liffId || PropertiesService.getScriptProperties().getProperty('LIFF_ID') || '',
      currency: config.currency || 'THB',
      phoneNumber: config.phoneNumber || '',
      openTime: parseTimeFromSheet(config.openTime) || '08:00',
      closeTime: parseTimeFromSheet(config.closeTime) || '20:00',
      address: config.address || '',
      lineOfficial: config.lineOfficial || ''
    }};
  } catch (error) { logAction('GET_SHOP_STATUS_ERROR', error.message, 'SYSTEM'); throw error; }
}

function getOrderData(orderId) {
  const order = getOrderById(orderId);
  return order ? { success: true, data: { order: order } } : { success: false, error: 'Order not found' };
}

function getUserOrdersData(userId) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Orders');
    const data = sheet.getDataRange().getValues();
    const orders = [];
    for (let i = 1; i < data.length; i++) if (data[i][1] === userId) orders.push({ orderId: data[i][0], totalPrice: Number(data[i][3]), status: data[i][6], timestamp: data[i][7] });
    return { success: true, data: { orders: orders } };
  } catch (error) { throw error; }
}

function getAllOrdersData(params) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Orders');
    if (!sheet) throw new Error('Orders sheet not found');
    const data = sheet.getDataRange().getValues();
    const rows = data.slice(1);
    const filterStatus = params.status;
    const startDate = params.startDate ? new Date(params.startDate) : null;
    const endDate = params.endDate ? new Date(params.endDate) : null;
    const orders = rows.map(row => ({
      orderId: row[0],
      userId: row[1],
      items: (() => { try { return JSON.parse(row[2] || '[]'); } catch(e) { return []; } })(),
      totalPrice: Number(row[3]),
      type: row[4],
      payment: row[5],
      status: row[6],
      timestamp: row[7],
      note: row[8] || '',
      lastUpdated: row[9] || row[7],
      customerName: row[10] || '',
      customerPhone: row[11] || '',
      lineUserId: row[12] || ''
    })).filter(order => {
      if (!order.orderId) return false;
      if (filterStatus && filterStatus !== 'all' && order.status !== filterStatus) return false;
      if (startDate && new Date(order.timestamp) < startDate) return false;
      if (endDate && new Date(order.timestamp) > endDate) return false;
      return true;
    }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return { success: true, data: { orders: orders } };
  } catch (error) { throw error; }
}

function getInventoryStatusData() {
  try {
    const ss = getSpreadsheet();
    let sheet = ss.getSheetByName('Inventory');
    if (!sheet) { createInventorySheet(ss); sheet = ss.getSheetByName('Inventory'); }
    const data = sheet.getDataRange().getValues();
    const rows = data.slice(1);
    const inventory = rows.filter(row => row[0]).map(row => ({
      id: row[0], name: row[1], category: row[2], unit: row[3], currentStock: Number(row[4]) || 0, minStock: Number(row[5]) || 0,
      maxStock: Number(row[6]) || 0, costPerUnit: Number(row[7]) || 0, lastUpdated: row[8], supplier: row[9] || '', location: row[10] || '',
      status: getStockStatus(Number(row[4]) || 0, Number(row[5]) || 0)
    }));
    const lowStock = inventory.filter(item => item.currentStock <= item.minStock);
    const outOfStock = inventory.filter(item => item.currentStock <= 0);
    return { success: true, data: { all: inventory, lowStock: lowStock, lowStockCount: lowStock.length, outOfStock: outOfStock, outOfStockCount: outOfStock.length, totalValue: inventory.reduce((sum, item) => sum + (item.currentStock * item.costPerUnit), 0) } };
  } catch (error) { throw error; }
}

function updateCustomerData(customerData) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Customers');
    if (!sheet) createCustomersSheet(ss);
    const data = sheet.getDataRange().getValues();
    const rows = data.slice(1);
    let foundRow = -1;
    for (let i = 0; i < rows.length; i++) if (rows[i][0] === customerData.userId) { foundRow = i + 2; break; }
    const now = new Date();
    if (foundRow === -1) {
      sheet.appendRow([customerData.userId, customerData.name || '', customerData.phone || '', customerData.email || '', customerData.pictureUrl || '', customerData.source || 'WEB', 0, 0, now, now, customerData.notes || '']);
    } else {
      if (customerData.name !== undefined) sheet.getRange(foundRow, 2).setValue(customerData.name);
      if (customerData.phone !== undefined) sheet.getRange(foundRow, 3).setValue(customerData.phone);
      if (customerData.email !== undefined) sheet.getRange(foundRow, 4).setValue(customerData.email);
      if (customerData.pictureUrl !== undefined) sheet.getRange(foundRow, 5).setValue(customerData.pictureUrl);
      if (customerData.source !== undefined) sheet.getRange(foundRow, 6).setValue(customerData.source);
      sheet.getRange(foundRow, 9).setValue(now);
    }
    return { success: true };
  } catch (error) { logAction('UPDATE_CUSTOMER_ERROR', error.message, 'SYSTEM'); return { success: false, error: error.message }; }
}
