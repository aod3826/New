/**
 * Beauty Noodle Shop - Main.gs
 * ระบบหลัก: Entry Points, Routing, PWA Support
 * @version 9.2.0 (แก้ไข: rate limit ใช้ CacheService, webhook bypass rate limit, เพิ่ม routes)
 */

// แก้ไข จุดที่ 4: ย้าย rate limit ไปใช้ CacheService เพราะ Apps Script reset global var ทุก request
function checkRateLimit(userId = 'anonymous') {
  const cache = CacheService.getScriptCache();
  const minute = Math.floor(Date.now() / 60000);
  const key = 'rl_' + userId.replace(/[^a-zA-Z0-9_]/g, '') + '_' + minute;
  const count = parseInt(cache.get(key) || '0') + 1;
  cache.put(key, String(count), 120); // expire ใน 2 นาที
  if (count > 100) {
    throw new Error('Too many requests. Please try again later.');
  }
}

function doGet(e) {
  try {
    const userId = e?.parameter?.userId || 'anonymous';
    checkRateLimit(userId);
    const isJSONP = e && e.parameter && e.parameter.callback;
    const callback = isJSONP ? e.parameter.callback : null;
    const action = e?.parameter?.action;

    if (action === 'manifest') return serveManifest();
    if (action === 'sw') return serveServiceWorker();
    if (action === 'getLiffData') return handleLiffRequest(e.parameter);

    if (!e || !e.parameter || Object.keys(e.parameter).length === 0) {
      return renderHtml('index', 'ร้านอาหาร - สั่งอาหารออนไลน์');
    }

    if (action === 'admin' || e?.parameter?.page === 'admin') {
      return renderHtml('admin', 'Admin Dashboard');
    }

    let result;
    try {
      if (action === 'getMenuData') {
        result = getMenuData();
      } else if (action === 'getShopStatus') {
        result = getShopStatusData();
      } else if (action === 'getOrderData') {
        result = getOrderData(e.parameter.orderId);
      } else if (action === 'getUserOrdersData') {
        result = getUserOrdersData(e.parameter.userId);
      } else if (action === 'getDashboardStatsData') {
        if (!verifyAdminToken(e.parameter.token)) result = { success: false, error: 'Unauthorized' };
        else result = getDashboardStatsData();
      } else if (action === 'getAllOrdersData') {
        if (!verifyAdminToken(e.parameter.token)) result = { success: false, error: 'Unauthorized' };
        else result = getAllOrdersData(e.parameter);
      } else if (action === 'getInventoryStatusData') {
        if (!verifyAdminToken(e.parameter.token)) result = { success: false, error: 'Unauthorized' };
        else result = getInventoryStatusData();
      } else if (action === 'adminGetAllMenusData') {
        if (!verifyAdminToken(e.parameter.token)) result = { success: false, error: 'Unauthorized' };
        else result = adminGetAllMenus();
      } else if (action === 'checkNewOrdersData') {
        if (!verifyAdminToken(e.parameter.token)) result = { success: false, error: 'Unauthorized' };
        else result = checkNewOrders(parseInt(e.parameter.lastCount) || 0);
      } else if (action === 'getBestSellingItemsData') {
        if (!verifyAdminToken(e.parameter.token)) result = { success: false, error: 'Unauthorized' };
        else result = getBestSellingItems();
      } else if (action === 'getLineSettingsData') {
        if (!verifyAdminToken(e.parameter.token)) result = { success: false, error: 'Unauthorized' };
        else result = getLineSettingsData();
      // แก้ไข จุดที่ 11: เพิ่ม GET routes ที่ขาดหายไป
      } else if (action === 'getCustomerStatsData') {
        if (!verifyAdminToken(e.parameter.token)) result = { success: false, error: 'Unauthorized' };
        else result = getCustomerStats();
      } else if (action === 'getRecentLogsData') {
        if (!verifyAdminToken(e.parameter.token)) result = { success: false, error: 'Unauthorized' };
        else result = getRecentLogs(parseInt(e.parameter.limit) || 100);
      } else if (action === 'listBackupsData') {
        if (!verifyAdminToken(e.parameter.token)) result = { success: false, error: 'Unauthorized' };
        else result = listBackups();
      } else if (action === 'exportOrdersCSV') {
        if (!verifyAdminToken(e.parameter.token)) return createJSONResponse({ success: false, error: 'Unauthorized' });
        return exportOrdersAsCSV(e.parameter);
      } else {
        result = { success: false, error: 'Invalid action' };
      }
    } catch (error) {
      result = { success: false, error: error.message };
    }

    if (isJSONP) {
      return ContentService
        .createTextOutput(callback + '(' + JSON.stringify(result) + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return createJSONResponse(result);

  } catch (error) {
    logAction('GET_ERROR', error.message, 'SYSTEM');
    if (e && e.parameter && e.parameter.callback) {
      return ContentService
        .createTextOutput(e.parameter.callback + '({"success":false,"error":"' + error.message + '"})')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return createJSONResponse({ success: false, error: error.message });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const payload = JSON.parse(e.postData.contents);

    // แก้ไข จุดที่ 8: LINE webhook ต้อง bypass rate limit และ lock ก่อน
    // เพราะ LINE ส่งหลาย events พร้อมกันได้และไม่มี userId/adminId ปกติ
    if (payload.events && Array.isArray(payload.events)) {
      lock.releaseLock();
      return handleLineWebhook(payload, e.postData.contents,
        e.parameter && e.parameter['x-line-signature'] || 
        (e.headers && e.headers['x-line-signature']) || '');
    }

    const userId = payload.userId || payload.adminId || 'anonymous';
    checkRateLimit(userId);

    const action = payload.action;
    let result;

    try {
      if (action === 'saveOrderData') {
        result = saveOrderData(payload);
      } else if (action === 'updateCustomerData') {
        result = updateCustomerData(payload);
      } else if (action === 'adminLogin') {
        result = adminLogin(payload.username, payload.password);
      } else if (action === 'refreshAdminToken') {
        result = refreshAdminToken(payload.token);
      } else if (action === 'changeAdminPassword') {
        result = changeAdminPassword(payload.oldPassword, payload.newPassword, payload.token);
      } else if (action === 'adminUpdateOrderStatusData') {
        if (!verifyAdminToken(payload.token)) result = { success: false, error: 'Unauthorized' };
        else result = adminUpdateOrderStatus(payload.orderId, payload.status, payload.adminId);
      } else if (action === 'adminDeleteOrderData') {
        if (!verifyAdminToken(payload.token)) result = { success: false, error: 'Unauthorized' };
        else result = adminDeleteOrder(payload.orderId, payload.adminId);
      } else if (action === 'adminUpdateInventoryData') {
        if (!verifyAdminToken(payload.token)) result = { success: false, error: 'Unauthorized' };
        else result = adminUpdateInventory(payload.itemId, payload.quantity, payload.adminId);
      } else if (action === 'adminToggleShopStatusData') {
        if (!verifyAdminToken(payload.token)) result = { success: false, error: 'Unauthorized' };
        else result = adminToggleShopStatus(payload.isOpen, payload.adminId);
      } else if (action === 'adminAddMenuData') {
        if (!verifyAdminToken(payload.token)) result = { success: false, error: 'Unauthorized' };
        else result = adminAddMenu(payload.menuData, payload.adminId);
      } else if (action === 'adminUpdateMenuData') {
        if (!verifyAdminToken(payload.token)) result = { success: false, error: 'Unauthorized' };
        else result = adminUpdateMenu(payload.menuData, payload.adminId);
      } else if (action === 'saveLineSettingsData') {
        if (!verifyAdminToken(payload.token)) result = { success: false, error: 'Unauthorized' };
        else result = saveLineSettings(payload);
      } else if (action === 'testLineData') {
        if (!verifyAdminToken(payload.token)) result = { success: false, error: 'Unauthorized' };
        else result = { success: sendLineTestMessage() };
      } else if (action === 'adminUpdateShopNameData') {
        if (!verifyAdminToken(payload.token)) result = { success: false, error: 'Unauthorized' };
        else result = adminUpdateShopName(payload.shopName, payload.adminId);
      } else if (action === 'adminUpdateConfigData') {
        if (!verifyAdminToken(payload.token)) result = { success: false, error: 'Unauthorized' };
        else result = adminUpdateConfig(payload.key, payload.value, payload.adminId);
      } else if (action === 'clearAllCache') {
        if (!verifyAdminToken(payload.token)) result = { success: false, error: 'Unauthorized' };
        else result = clearAllCache();
      } else if (action === 'systemHealthCheck') {
        if (!verifyAdminToken(payload.token)) result = { success: false, error: 'Unauthorized' };
        else result = systemHealthCheck();
      // แก้ไข จุดที่ 11: เพิ่ม routes ที่ขาดหายไป
      } else if (action === 'adminBulkUpdateStatusData') {
        if (!verifyAdminToken(payload.token)) result = { success: false, error: 'Unauthorized' };
        else result = adminBulkUpdateStatus(payload.orderIds, payload.status, payload.adminId);
      } else if (action === 'adminAddInventoryData') {
        if (!verifyAdminToken(payload.token)) result = { success: false, error: 'Unauthorized' };
        else result = adminAddInventoryItem(payload.itemData, payload.adminId);
      } else if (action === 'adminQuickAdjustInventoryData') {
        if (!verifyAdminToken(payload.token)) result = { success: false, error: 'Unauthorized' };
        else result = adminQuickAdjustInventory(payload.itemId, payload.change, payload.adminId);
      } else if (action === 'createBackupData') {
        if (!verifyAdminToken(payload.token)) result = { success: false, error: 'Unauthorized' };
        else result = createBackup();
      } else if (action === 'refreshMenuCacheData') {
        if (!verifyAdminToken(payload.token)) result = { success: false, error: 'Unauthorized' };
        else result = refreshMenuCache();
      } else if (action === 'upgradeDatabaseSchemaData') {
        if (!verifyAdminToken(payload.token)) result = { success: false, error: 'Unauthorized' };
        else result = upgradeDatabaseSchema();
      } else {
        result = { success: false, error: 'Invalid action' };
      }
    } catch (error) {
      result = { success: false, error: error.message };
    }

    lock.releaseLock();
    return createJSONResponse(result);

  } catch (error) {
    lock.releaseLock();
    logAction('POST_ERROR', error.message, 'SYSTEM');
    return createJSONResponse({ success: false, error: error.message });
  }
}

// ============================================================================
// PWA Support Functions
// ============================================================================

function serveManifest() {
  const config = getConfig();
  const manifest = {
    name: config.shopName || 'ร้านอาหาร',
    short_name: config.shopName || 'ร้านอาหาร',
    description: 'สั่งอาหารออนไลน์',
    start_url: ScriptApp.getService().getUrl(),
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#d97706',
    icons: [
      // แก้ไข จุดที่ 10: ลบ Unsplash URL ออก — ให้ admin ใส่ URL icon ของร้านจริงแทน
      // { src: 'URL_ของ_icon_ร้าน?w=192', sizes: '192x192', type: 'image/png' },
      // { src: 'URL_ของ_icon_ร้าน?w=512', sizes: '512x512', type: 'image/png' }
    ]
  };
  return ContentService
    .createTextOutput(JSON.stringify(manifest))
    .setMimeType(ContentService.MimeType.JSON);
}

function serveServiceWorker() {
  const swContent = `
    const CACHE_NAME = 'shop-cache-v1';
    const urlsToCache = [
      '${ScriptApp.getService().getUrl()}',
      '${ScriptApp.getService().getUrl()}?action=admin'
    ];
    self.addEventListener('install', event => {
      event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache)));
    });
    self.addEventListener('fetch', event => {
      event.respondWith(caches.match(event.request).then(response => response || fetch(event.request)));
    });
    self.addEventListener('activate', event => {
      event.waitUntil(caches.keys().then(cacheNames => {
        return Promise.all(cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) return caches.delete(cacheName);
        }));
      }));
    });
  `;
  return ContentService
    .createTextOutput(swContent)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function renderHtml(templateName, title) {
  const template = HtmlService.createTemplateFromFile(templateName);
  // inject ค่าที่ต้องใช้ใน HTML template (แก้ไข: ไม่ hardcode URL อีกต่อไป)
  template.SCRIPT_URL = ScriptApp.getService().getUrl();
  template.LIFF_ID = PropertiesService.getScriptProperties().getProperty('LIFF_ID') || '';
  return template.evaluate()
    .setTitle(title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1.5')
    .addMetaTag('apple-mobile-web-app-capable', 'yes')
    .addMetaTag('mobile-web-app-capable', 'yes')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .setSandboxMode(HtmlService.SandboxMode.IFRAME);
}

// ============================================================================
// LIFF Data Handler
// ============================================================================

function handleLiffRequest(params) {
  try {
    const config = getConfig();
    const menu = getMenuItemsWithDetails();
    // แก้ไข: ดึง liffId จาก Config sheet หรือ Script Properties (ไม่ hardcode)
    const liffId = config.liffId || PropertiesService.getScriptProperties().getProperty('LIFF_ID') || '';
    return createJSONResponse({
      success: true,
      data: {
        liffId: liffId,
        shopName: config.shopName || 'ร้านของฉัน',
        isOpen: parseConfigBoolean(config.isOpen),
        menu: menu,
        categories: [...new Set(menu.map(item => item.category))],
        lineOfficial: config.lineOfficial || ''
      }
    });
  } catch (error) {
    logAction('LIFF_HANDLER_ERROR', error.message, 'SYSTEM');
    return createJSONResponse({ success: false, error: error.message });
  }
}

// ============================================================================
// Initial Setup
// ============================================================================

function initialSetup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const spreadsheetId = ss.getId();
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', spreadsheetId);

  const adminToken = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperty('ADMIN_TOKEN', adminToken);
  const apiKey = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperty('API_KEY', apiKey);
  const adminPass = generateSecurePassword();
  PropertiesService.getScriptProperties().setProperty('ADMIN_PASS', adminPass);
  PropertiesService.getScriptProperties().setProperty('ADMIN_USER', 'admin');
  PropertiesService.getScriptProperties().setProperty('FORCE_PASSWORD_CHANGE', 'true');

  // แก้ไข: ไม่ hardcode LIFF_ID อีกต่อไป
  // ให้ Admin ไปกรอกเองใน Settings > LINE LIFF ID หลัง Deploy
  // ถ้ามีค่าอยู่แล้วใน Script Properties ก็ใช้ค่านั้น (ไม่ overwrite)
  const existingLiffId = PropertiesService.getScriptProperties().getProperty('LIFF_ID');
  if (!existingLiffId) {
    PropertiesService.getScriptProperties().setProperty('LIFF_ID', '');
    Logger.log('⚠️ LIFF_ID ยังไม่ได้ตั้งค่า — กรุณาไปกรอกใน Admin > Settings > LINE LIFF ID');
  }

  setupDatabase();

  Logger.log('✅ Initial setup completed.');
  Logger.log('Admin Token: ' + adminToken);
  Logger.log('Admin Password: ' + adminPass);
  Logger.log('Script URL: ' + ScriptApp.getService().getUrl());
  Logger.log('⚠️ กรุณาไปตั้งค่า LIFF_ID และ LINE Messaging API ใน Admin > Settings');
}

function generateSecurePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

function onDeploy() {
  Logger.log('🚀 Deploying v9.1.0');
  setupDatabase();
  CacheService.getScriptCache().removeAll();
  Logger.log('✅ Deploy complete');
}
