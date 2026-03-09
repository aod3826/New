/**
 * Beauty Noodle Shop - LineAPI.gs
 * LINE Messaging API: Setup, Send, Webhook, Broadcast
 * @version 9.2.0 (แก้ไข: validateLineSignature ใน handleLineWebhook, รับ rawBody+signature)
 */

// ============================================================================
// LINE CONFIGURATION
// ============================================================================

function getLineConfig() {
  const properties = PropertiesService.getScriptProperties();
  return {
    channelAccessToken: properties.getProperty('LINE_CHANNEL_ACCESS_TOKEN'),
    channelSecret: properties.getProperty('LINE_CHANNEL_SECRET'),
    groupId: properties.getProperty('LINE_GROUP_ID')
  };
}

function isLineMessagingReady() {
  const config = getLineConfig();
  return !!(config.channelAccessToken && config.channelSecret && config.groupId);
}

/**
 * บันทึกการตั้งค่า LINE Messaging API
 * แก้ไข: เพิ่มการบันทึก liffId
 */
function saveLineSettings(payload) {
  try {
    const properties = PropertiesService.getScriptProperties();

    if (payload.lineToken) {
      properties.setProperty('LINE_CHANNEL_ACCESS_TOKEN', payload.lineToken.trim());
    }
    if (payload.lineSecret) {
      properties.setProperty('LINE_CHANNEL_SECRET', payload.lineSecret.trim());
    }
    if (payload.lineGroupId) {
      properties.setProperty('LINE_GROUP_ID', payload.lineGroupId.trim());
    }
    // แก้ไข: เพิ่มการบันทึก liffId
    if (payload.liffId) {
      properties.setProperty('LIFF_ID', payload.liffId.trim());
      // อัปเดต Config sheet ด้วย
      try {
        const ss = getSpreadsheet();
        const configSheet = ss.getSheetByName('Config');
        if (configSheet) {
          const data = configSheet.getDataRange().getValues();
          let found = false;
          for (let i = 1; i < data.length; i++) {
            if (data[i][0] === 'liffId') {
              configSheet.getRange(i + 1, 2).setValue(payload.liffId.trim());
              found = true;
              break;
            }
          }
          if (!found) configSheet.appendRow(['liffId', payload.liffId.trim()]);
        }
      } catch (e) {
        logAction('LIFF_ID_CONFIG_UPDATE_ERROR', e.message, 'SYSTEM');
      }
    }

    logAction('LINE_SETTINGS_SAVED', 'LINE Messaging API settings updated', payload.adminId || 'ADMIN');
    return { success: true };

  } catch (error) {
    logAction('LINE_SETTINGS_ERROR', error.message, 'SYSTEM');
    return { success: false, error: error.message };
  }
}

/**
 * ดึงข้อมูลการตั้งค่า LINE
 * แก้ไข: เพิ่ม liffId ใน response
 */
function getLineSettingsData() {
  try {
    const lineConfig = getLineConfig();
    const isReady = isLineMessagingReady();
    // แก้ไข: ดึง liffId จาก Script Properties
    const liffId = PropertiesService.getScriptProperties().getProperty('LIFF_ID') || '';

    return {
      success: true,
      data: {
        hasToken: !!lineConfig.channelAccessToken,
        hasSecret: !!lineConfig.channelSecret,
        groupId: lineConfig.groupId || '',
        liffId: liffId,  // แก้ไข: เพิ่มส่ง liffId กลับไป
        tokenPreview: lineConfig.channelAccessToken
          ? lineConfig.channelAccessToken.substring(0, 4) + '...' + lineConfig.channelAccessToken.slice(-4)
          : '',
        isConfigured: isReady,
        message: isReady
          ? '✅ เชื่อมต่อ LINE Messaging API พร้อมใช้งาน'
          : '⚠️ กรุณาตั้งค่า LINE Messaging API ให้ครบถ้วน (Token, Secret, Group ID)'
      }
    };
  } catch (error) {
    logAction('GET_LINE_SETTINGS_ERROR', error.message, 'SYSTEM');
    return { success: false, error: error.message };
  }
}

function setupLineMessaging(config) {
  try {
    const props = PropertiesService.getScriptProperties();
    const lineData = config || {
      token: 'YOUR_CHANNEL_ACCESS_TOKEN',
      secret: 'YOUR_CHANNEL_SECRET',
      groupId: 'YOUR_GROUP_ID'
    };

    if (lineData.token && lineData.token !== 'YOUR_CHANNEL_ACCESS_TOKEN') {
      props.setProperty('LINE_CHANNEL_ACCESS_TOKEN', lineData.token);
    }
    if (lineData.secret && lineData.secret !== 'YOUR_CHANNEL_SECRET') {
      props.setProperty('LINE_CHANNEL_SECRET', lineData.secret);
    }
    if (lineData.groupId && lineData.groupId !== 'YOUR_GROUP_ID') {
      props.setProperty('LINE_GROUP_ID', lineData.groupId);
    }

    const testResult = sendLineTestMessage();
    if (testResult) {
      Logger.log('✅ LINE Messaging API Setup Success');
      return { success: true, message: 'ตั้งค่าและเชื่อมต่อ LINE Messaging API สำเร็จ' };
    } else {
      Logger.log('⚠️ LINE Messaging API Setup Warning');
      return { success: false, message: 'บันทึกค่าแล้ว แต่เชื่อมต่อ LINE ไม่สำเร็จ กรุณาตรวจสอบ Token และ Group ID' };
    }
  } catch (e) {
    Logger.log('❌ LINE Setup Error: ' + e.toString());
    return { success: false, message: 'เกิดข้อผิดพลาด: ' + e.message };
  }
}

// ============================================================================
// LINE SIGNATURE VERIFICATION
// ============================================================================

function validateLineSignature(body, signature, channelSecret) {
  if (!channelSecret || !signature) return false;
  try {
    const hash = Utilities.computeHmacSha256Signature(body, channelSecret);
    const computedSignature = Utilities.base64Encode(hash);
    return computedSignature === signature;
  } catch (e) {
    logAction('LINE_SIGNATURE_ERROR', e.message, 'SYSTEM');
    return false;
  }
}

// ============================================================================
// SEND MESSAGE FUNCTIONS
// ============================================================================

function sendLineMessage(payload) {
  try {
    const lineConfig = getLineConfig();
    if (!lineConfig.channelAccessToken) {
      throw new Error('LINE Channel Access Token not configured');
    }

    const url = 'https://api.line.me/v2/bot/message/push';
    const options = {
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + lineConfig.channelAccessToken
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();

    if (responseCode === 200) {
      Logger.log('✅ LINE message sent successfully');
      return true;
    } else {
      Logger.log(`❌ LINE API error: ${responseCode} - ${responseText}`);
      return false;
    }
  } catch (error) {
    logAction('LINE_SEND_ERROR', error.message, 'SYSTEM');
    return false;
  }
}

/**
 * ส่งข้อความ Push Message ไปยัง LINE User คนเดียว (เพิ่มใหม่)
 * @param {string} lineUserId - LINE User ID ของลูกค้า
 * @param {string} message - ข้อความที่จะส่ง
 * @returns {boolean} true ถ้าส่งสำเร็จ
 */
function sendLiffMessage(lineUserId, message) {
  try {
    if (!lineUserId || !message) return false;
    const lineConfig = getLineConfig();
    if (!lineConfig.channelAccessToken) {
      Logger.log('LINE not configured, skip sendLiffMessage');
      return false;
    }

    const payload = {
      to: lineUserId,
      messages: [{ type: 'text', text: message }]
    };

    return sendLineMessage(payload);
  } catch (error) {
    logAction('SEND_LIFF_MESSAGE_ERROR', error.message, 'SYSTEM');
    return false;
  }
}

function sendLineTestMessage() {
  try {
    const lineConfig = getLineConfig();
    if (!lineConfig.channelAccessToken) throw new Error('Missing LINE Channel Access Token');
    if (!lineConfig.channelSecret) throw new Error('Missing LINE Channel Secret');
    if (!lineConfig.groupId) throw new Error('Missing LINE Group/User ID');

    const testMessage = {
      to: lineConfig.groupId,
      messages: [{
        type: 'text',
        text: '✅ การเชื่อมต่อ LINE Messaging API สำเร็จ!\nร้านพร้อมรับการแจ้งเตือนออเดอร์แล้ว'
      }]
    };

    const success = sendLineMessage(testMessage);
    if (success) {
      logAction('LINE_TEST_SUCCESS', 'LINE Messaging API test successful', 'SYSTEM');
    } else {
      logAction('LINE_TEST_FAILED', 'LINE Messaging API test failed', 'SYSTEM');
    }
    return success;
  } catch (error) {
    logAction('LINE_TEST_ERROR', error.message, 'SYSTEM');
    return false;
  }
}

function sendLineFlexMessage(orderData) {
  try {
    const lineConfig = getLineConfig();
    if (!lineConfig.channelAccessToken || !lineConfig.groupId) {
      Logger.log('LINE not configured');
      return false;
    }

    const menuItems = orderData.items.map(item =>
      `${item.quantity}x ${item.menuName}${item.options && item.options.length ? ' (' + item.options.join(', ') + ')' : ''}`
    ).join('\n');

    // แก้ไข: ดึง URL จริงแทนการ Hardcode
    const adminUrl = ScriptApp.getService().getUrl() + '?action=admin';

    const flexMessage = {
      to: lineConfig.groupId,
      messages: [{
        type: 'flex',
        altText: `🍜 ออเดอร์ใหม่! ${orderData.orderId}`,
        contents: {
          type: 'bubble',
          body: {
            type: 'box',
            layout: 'vertical',
            contents: [
              { type: 'text', text: '🍜 ออเดอร์ใหม่!', weight: 'bold', size: 'xl', color: '#d97706' },
              {
                type: 'box', layout: 'vertical', margin: 'lg', spacing: 'sm',
                contents: [
                  { type: 'box', layout: 'baseline', contents: [
                    { type: 'text', text: 'รหัสออเดอร์', color: '#aaaaaa', size: 'sm', flex: 2 },
                    { type: 'text', text: orderData.orderId, color: '#d97706', size: 'sm', flex: 3, weight: 'bold', wrap: true }
                  ]},
                  { type: 'box', layout: 'baseline', contents: [
                    { type: 'text', text: 'ยอดรวม', color: '#aaaaaa', size: 'sm', flex: 2 },
                    { type: 'text', text: `฿${orderData.totalPrice}`, color: '#d97706', size: 'sm', flex: 3, weight: 'bold' }
                  ]},
                  { type: 'box', layout: 'baseline', contents: [
                    { type: 'text', text: 'ประเภท', color: '#aaaaaa', size: 'sm', flex: 2 },
                    { type: 'text', text: orderData.type === 'dine-in' ? 'ทานที่ร้าน' : 'ซื้อกลับ', color: '#666666', size: 'sm', flex: 3 }
                  ]},
                  { type: 'box', layout: 'baseline', contents: [
                    { type: 'text', text: 'ชำระเงิน', color: '#aaaaaa', size: 'sm', flex: 2 },
                    { type: 'text', text: orderData.payment === 'cash' ? 'เงินสด' : orderData.payment === 'qr-code' ? 'พร้อมเพย์' : 'โอนเงิน', color: '#666666', size: 'sm', flex: 3 }
                  ]}
                ]
              },
              {
                type: 'box', layout: 'vertical', margin: 'xxl',
                contents: [
                  { type: 'separator' },
                  { type: 'text', text: '📝 รายการอาหาร', weight: 'bold', size: 'md', margin: 'lg' },
                  { type: 'text', text: menuItems, color: '#666666', size: 'sm', wrap: true }
                ]
              }
            ]
          },
          footer: {
            type: 'box', layout: 'vertical', spacing: 'sm',
            contents: [{
              type: 'button', style: 'primary', color: '#d97706',
              action: { type: 'uri', label: 'ดูรายละเอียด', uri: adminUrl }  // แก้ไข: ใช้ URL จริง
            }]
          }
        }
      }]
    };

    return sendLineMessage(flexMessage);
  } catch (error) {
    logAction('LINE_FLEX_ERROR', error.message, 'SYSTEM');
    return false;
  }
}

function sendLineTextMessage(orderData) {
  try {
    const lineConfig = getLineConfig();
    if (!lineConfig.channelAccessToken || !lineConfig.groupId) return false;

    // แก้ไข: ดึง URL จริงแทนการ Hardcode
    const adminUrl = ScriptApp.getService().getUrl() + '?action=admin';

    const itemsText = orderData.items.map(item =>
      `${item.quantity}x ${item.menuName}${item.options && item.options.length ? ' (' + item.options.join(', ') + ')' : ''}`
    ).join('\n');

    const message =
      `🍜 *ออเดอร์ใหม่!*\n` +
      `─────────────────\n` +
      `🆔 รหัส: ${orderData.orderId}\n` +
      `💰 ยอดรวม: ฿${orderData.totalPrice}\n` +
      `🍽️ ประเภท: ${orderData.type === 'dine-in' ? 'ทานที่ร้าน' : 'ซื้อกลับ'}\n` +
      `💳 ชำระ: ${orderData.payment === 'cash' ? 'เงินสด' : orderData.payment === 'qr-code' ? 'พร้อมเพย์' : 'โอนเงิน'}\n` +
      `─────────────────\n` +
      `📋 *รายการอาหาร*\n` +
      `${itemsText}\n` +
      `─────────────────\n` +
      `👉 ดูรายละเอียด: ${adminUrl}`;  // แก้ไข: ใช้ URL จริง

    const payload = {
      to: lineConfig.groupId,
      messages: [{ type: 'text', text: message }]
    };

    return sendLineMessage(payload);
  } catch (error) {
    logAction('LINE_TEXT_ERROR', error.message, 'SYSTEM');
    return false;
  }
}

function sendOrderStatusNotification(orderId, newStatus) {
  try {
    const order = getOrderById(orderId);
    if (!order) return false;

    const statusThai = {
      'Pending':   '⏳ รอดำเนินการ',
      'Confirmed': '✓ ยืนยันออเดอร์',
      'Preparing': '👨‍🍳 กำลังทำ',
      'Ready':     '✅ ทำเสร็จแล้ว',
      'Completed': '🏁 เสร็จสิ้น',
      'Cancelled': '❌ ยกเลิก'
    };

    const message =
      `🔔 *อัปเดตสถานะออเดอร์*\n` +
      `─────────────────\n` +
      `🆔 รหัส: ${orderId}\n` +
      `📌 สถานะ: ${statusThai[newStatus] || newStatus}\n` +
      `💰 ยอดรวม: ฿${order.totalPrice}\n` +
      `─────────────────\n` +
      `ขอบคุณที่ใช้บริการค่ะ 🙏`;

    const lineConfig = getLineConfig();
    if (lineConfig.channelAccessToken && lineConfig.groupId) {
      const payload = {
        to: lineConfig.groupId,
        messages: [{ type: 'text', text: message }]
      };
      return sendLineMessage(payload);
    }
    return false;
  } catch (error) {
    logAction('ORDER_STATUS_NOTIFY_ERROR', error.message, 'SYSTEM');
    return false;
  }
}

function sendLineBroadcast(message, imageUrl, isUrgent = false) {
  try {
    const lineConfig = getLineConfig();
    if (!lineConfig.channelAccessToken) return false;

    const url = 'https://api.line.me/v2/bot/message/broadcast';
    let messages = [];

    if (imageUrl) {
      messages.push({
        type: 'image',
        originalContentUrl: imageUrl,
        previewImageUrl: imageUrl
      });
    }

    messages.push({
      type: 'text',
      text: isUrgent ? '🔴 [ด่วน] ' + message : message
    });

    const options = {
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + lineConfig.channelAccessToken
      },
      payload: JSON.stringify({ messages: messages }),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();

    if (responseCode === 200) {
      Logger.log('✅ Broadcast sent successfully');
      logAction('LINE_BROADCAST', `Broadcast sent: ${message.substring(0, 50)}...`, 'SYSTEM');
      return true;
    } else {
      Logger.log(`❌ Broadcast failed: ${response.getContentText()}`);
      return false;
    }
  } catch (error) {
    logAction('LINE_BROADCAST_ERROR', error.message, 'SYSTEM');
    return false;
  }
}

// ============================================================================
// WEBHOOK HANDLER
// ============================================================================

// แก้ไข จุดที่ 3: รับ rawBody และ signature เพื่อ verify ว่ามาจาก LINE จริง
function handleLineWebhook(webhookData, rawBody, signature) {
  try {
    const lineConfig = getLineConfig();

    if (!lineConfig.channelAccessToken) {
      logAction('LINE_WEBHOOK_ERROR', 'LINE not configured', 'SYSTEM');
      return createJSONResponse({ status: 'error', message: 'LINE not configured' });
    }

    // แก้ไข: verify signature ก่อนประมวลผล event ใดๆ
    if (lineConfig.channelSecret && rawBody && signature) {
      if (!validateLineSignature(rawBody, signature, lineConfig.channelSecret)) {
        logAction('LINE_WEBHOOK_INVALID_SIG', 'Invalid LINE signature', 'SYSTEM');
        return createJSONResponse({ status: 'error', message: 'Invalid signature' });
      }
    } else if (!lineConfig.channelSecret) {
      logAction('LINE_WEBHOOK_WARNING', 'channelSecret not set — skipping signature check', 'SYSTEM');
    }

    if (webhookData.events && Array.isArray(webhookData.events)) {
      webhookData.events.forEach(event => {
        if (event.type === 'message' && event.message.type === 'text') {
          const replyToken = event.replyToken;
          const userMessage = event.message.text.toLowerCase();
          const userId = event.source.userId;

          // แก้ไข: ดึงข้อมูลร้านจาก Config แทน Hardcode
          const config = getConfig();
          const shopPhone = config.phoneNumber || '';
          const shopAddress = config.address || '';
          const shopOpen = config.openTime || '08:00';
          const shopClose = config.closeTime || '20:00';

          let replyPayloadMessages = [];

          if (userMessage.includes('สวัสดี') || userMessage.includes('hello')) {
            replyPayloadMessages.push({
              type: 'text',
              text: `สวัสดีค่ะ ร้าน ${config.shopName || 'ของเรา'} ยินดีให้บริการค่ะ 🙏`
            });
          } else if (userMessage.includes('เมนู') || userMessage.includes('menu')) {
            replyPayloadMessages.push({
              type: 'flex',
              altText: 'เมนูอาหาร',
              contents: createMenuFlexTemplate()
            });
          } else if (userMessage.includes('เวลา') || userMessage.includes('เปิด')) {
            replyPayloadMessages.push({
              type: 'text',
              text: `ร้านเปิดทุกวัน ${shopOpen} - ${shopClose} น. ค่ะ 🙏`  // แก้ไข: ดึงจาก Config
            });
          } else if (userMessage.includes('เบอร์') || userMessage.includes('โทร')) {
            replyPayloadMessages.push({
              type: 'text',
              text: shopPhone ? `ติดต่อได้ที่เบอร์: ${shopPhone} ค่ะ 📞` : 'กรุณาสอบถามทาง LINE ค่ะ 🙏'  // แก้ไข: ดึงจาก Config
            });
          } else if (userMessage.includes('ที่อยู่') || userMessage.includes('อยู่ที่ไหน')) {
            replyPayloadMessages.push({
              type: 'text',
              text: shopAddress ? `ร้านอยู่ที่: ${shopAddress} ค่ะ 🗺️` : 'กรุณาสอบถามทาง LINE ค่ะ 🙏'  // แก้ไข: ดึงจาก Config
            });
          } else {
            replyPayloadMessages.push({
              type: 'text',
              text: `ขอบคุณที่ติดต่อค่ะ\nพิมพ์ "เมนู" เพื่อดูรายการอาหาร หรือ "เบอร์" สำหรับติดต่อร้าน`
            });
          }

          const url = 'https://api.line.me/v2/bot/message/reply';
          const options = {
            method: 'post',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + lineConfig.channelAccessToken
            },
            payload: JSON.stringify({
              replyToken: replyToken,
              messages: replyPayloadMessages
            }),
            muteHttpExceptions: true
          };

          UrlFetchApp.fetch(url, options);
          logAction('LINE_AUTO_REPLY', `User ${userId}: ${userMessage}`, 'LINE');
        }
      });
    }

    return createJSONResponse({ status: 'ok' });
  } catch (error) {
    logAction('LINE_WEBHOOK_ERROR', error.message, 'SYSTEM');
    return createJSONResponse({ status: 'error', message: error.message });
  }
}

/**
 * สร้าง Flex Message Template สำหรับแสดงเมนู (ดึงจาก Sheet จริง)
 */
function createMenuFlexTemplate() {
  // แก้ไข: ดึงเมนูจริงแทน Hardcode
  const shopUrl = ScriptApp.getService().getUrl();
  let menuLines = [];
  try {
    const menu = getMenuItemsWithDetails();
    menuLines = menu.slice(0, 5).map(item => ({
      type: 'text',
      text: `• ${item.name} ${item.price}฿`,
      size: 'md',
      color: '#555555'
    }));
  } catch (e) {
    menuLines = [{ type: 'text', text: 'ดูเมนูได้ที่ลิงก์ด้านล่างค่ะ', size: 'md', color: '#555555' }];
  }

  return {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: '🍜 เมนูแนะนำ', weight: 'bold', size: 'xl', color: '#d97706' },
        { type: 'box', layout: 'vertical', margin: 'lg', spacing: 'sm', contents: menuLines }
      ]
    },
    footer: {
      type: 'box', layout: 'vertical', spacing: 'sm',
      contents: [{
        type: 'button', style: 'primary', color: '#d97706',
        action: { type: 'uri', label: 'สั่งอาหารออนไลน์', uri: shopUrl }  // แก้ไข: ใช้ URL จริง
      }]
    }
  };
}

// หมายเหตุ: ลบ createJSONResponse ออกจากไฟล์นี้แล้ว (แก้ไข: ป้องกัน duplicate function)
// ใช้ createJSONResponse จาก Utils.gs แทน
