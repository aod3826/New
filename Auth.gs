/**
 * Beauty Noodle Shop - Auth.gs
 * @version 9.2.0 (แก้ไข: ลบ default password '123', เพิ่ม brute-force protection)
 */

function verifyAdminToken(token) {
  const validToken = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN');
  return token === validToken;
}

function verifyApiKey(key) {
  const validKey = PropertiesService.getScriptProperties().getProperty('API_KEY');
  return key === validKey;
}

// ─── Brute-force login protection (ใช้ CacheService แทน global var) ───────────
function checkLoginAttempts(username) {
  const cache = CacheService.getScriptCache();
  const key = 'login_fail_' + username;
  const attempts = parseInt(cache.get(key) || '0');
  if (attempts >= 5) {
    throw new Error('บัญชีถูกล็อก กรุณาลองใหม่ใน 15 นาที');
  }
}

function recordFailedLogin(username) {
  const cache = CacheService.getScriptCache();
  const key = 'login_fail_' + username;
  const attempts = parseInt(cache.get(key) || '0') + 1;
  cache.put(key, String(attempts), 900); // lock 15 นาที
}

function clearLoginAttempts(username) {
  CacheService.getScriptCache().remove('login_fail_' + username);
}

function adminLogin(username, password) {
  const properties = PropertiesService.getScriptProperties();
  const validUsername = properties.getProperty('ADMIN_USER') || 'admin';
  const validPassword = properties.getProperty('ADMIN_PASS');

  // แก้ไข จุดที่ 2: ลบ fallback '123' — ถ้าไม่มีรหัสผ่านใน Properties ให้ error ทันที
  if (!validPassword) {
    logAction('ADMIN_LOGIN_ERROR', 'ADMIN_PASS not set in Script Properties', 'SYSTEM');
    return { success: false, error: 'ระบบยังไม่ได้ตั้งค่ารหัสผ่าน กรุณารัน initialSetup() ก่อน' };
  }

  // ตรวจ brute-force ก่อน
  try { checkLoginAttempts(username); } catch (e) {
    logAction('ADMIN_LOGIN_LOCKED', `Account locked: ${username}`, 'SYSTEM');
    return { success: false, error: e.message };
  }

  const forceChange = properties.getProperty('FORCE_PASSWORD_CHANGE') === 'true';

  if (username === validUsername && password === validPassword) {
    clearLoginAttempts(username);
    const token = properties.getProperty('ADMIN_TOKEN');
    logAction('ADMIN_LOGIN', 'Login successful', username);
    return { success: true, data: { token: token, forceChange: forceChange } };
  }
  recordFailedLogin(username);
  logAction('ADMIN_LOGIN_FAILED', `Failed login attempt for: ${username}`, 'SYSTEM');
  return { success: false, error: 'Invalid credentials' };
}

function refreshAdminToken(token) {
  if (!verifyAdminToken(token)) return { success: false, error: 'Unauthorized' };
  const newToken = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperty('ADMIN_TOKEN', newToken);
  logAction('TOKEN_REFRESHED', 'Admin token refreshed', 'ADMIN');
  return { success: true, token: newToken };
}

function changeAdminPassword(oldPassword, newPassword, token) {
  if (!verifyAdminToken(token)) return { success: false, error: 'Unauthorized' };
  const properties = PropertiesService.getScriptProperties();
  const currentPassword = properties.getProperty('ADMIN_PASS');
  if (oldPassword !== currentPassword) return { success: false, error: 'Old password is incorrect' };
  if (newPassword.length < 8) return { success: false, error: 'Password must be at least 8 characters' };
  properties.setProperty('ADMIN_PASS', newPassword);
  properties.setProperty('FORCE_PASSWORD_CHANGE', 'false');
  logAction('PASSWORD_CHANGED', 'Admin password changed', 'ADMIN');
  return { success: true };
}
