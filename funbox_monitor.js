const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const net = require('net');

const INSTANCE_PORT = 18765; // 用於防止重複啟動的 TCP 連接埠

const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
const TG_CHAT_ID = process.env.TG_CHAT_ID;
const API_URL = 'https://shop.funbox.com.tw/category_products/takaratomy/beyblade.json?limit=18&page=1&sort_by=sell_from-desc';
const CHECK_INTERVAL_MS = 60000; // 每 60 秒檢查一次

if (!TG_BOT_TOKEN || !TG_CHAT_ID) {
  console.error('❌ 錯誤：未偵測到 TG_BOT_TOKEN 或 TG_CHAT_ID 環境變數。請在啟動前設定環境變數，或於 GitHub Secrets 中配置。');
  process.exit(1);
}

// 確保單一實例在背景執行，避免重複發送通知
function ensureSingleInstance() {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error('❌ 偵測到已有另一個監控機器人實例在背景執行，本實例將自動退出。');
        process.exit(0);
      }
    });
    server.once('listening', () => {
      resolve(server);
    });
    server.listen(INSTANCE_PORT, '127.0.0.1');
  });
}

// 初始化 SQLite 資料庫
async function initDb() {
  const db = await open({
    filename: './funbox_monitor.db',
    driver: sqlite3.Database
  });
  await db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY,
      title TEXT,
      price INTEGER,
      url TEXT,
      stock INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // 相容舊有資料庫結構，補上 stock 欄位
  try {
    await db.exec('ALTER TABLE products ADD COLUMN stock INTEGER');
  } catch (e) {
    // 欄位已存在，忽略錯誤
  }
  return db;
}

// 發送 Telegram 訊息
async function sendTelegramMessage(text) {
  const url = `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TG_CHAT_ID,
        text: text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });
    if (!res.ok) {
      console.error('TG API 回傳錯誤:', await res.text());
    }
  } catch (error) {
    console.error('Telegram 發送連線失敗:', error.message);
  }
}

// 請求 Cyberbiz API
async function fetchProducts() {
  try {
    const res = await fetch(API_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }
    });
    if (!res.ok) throw new Error(`HTTP 錯誤狀態碼: ${res.status}`);
    return await res.json();
  } catch (error) {
    console.error('抓取商品 API 失敗:', error.message);
    return [];
  }
}

// 每小時庫存回報邏輯
async function sendHourlyInventoryReport() {
  console.log(`[${new Date().toLocaleString()}] 開始發送每小時庫存報告...`);
  const products = await fetchProducts();
  if (products.length === 0) {
    await sendTelegramMessage('📊 <b>每小時庫存回報</b>\n\n目前無法取得商品列表。');
    return;
  }

  let message = `📊 <b>每小時庫存回報</b>\n\n`;
  for (const p of products) {
    const fullUrl = `https://shop.funbox.com.tw${p.url}`;
    const stock = p.variants?.[0]?.inventory_quantity ?? '未知';
    message += `• <a href="${fullUrl}">${p.title}</a>\n  <b>價格:</b> NT$ ${p.price} | <b>目前庫存:</b> ${stock}\n\n`;
  }

  await sendTelegramMessage(message);
  console.log('每小時庫存報告發送完成。');
}

// 設定每小時整點庫存回報排程
function scheduleHourlyReport() {
  const now = new Date();
  let nextReport = new Date();
  nextReport.setHours(now.getHours() + 1, 0, 0, 0); // 設定為下一個整點

  const delay = nextReport.getTime() - now.getTime();
  console.log(`[排程] 每小時庫存回報將在 ${nextReport.toLocaleString()} 發送 (距今 ${Math.round(delay / 1000 / 60)} 分鐘)`);

  setTimeout(async () => {
    await sendHourlyInventoryReport();
    // 之後每 1 小時發送一次
    setInterval(sendHourlyInventoryReport, 60 * 60 * 1000);
  }, delay);
}

// 主程式
async function startMonitor() {
  if (process.env.RUN_ONCE !== 'true') {
    await ensureSingleInstance();
  }
  const db = await initDb();
  console.log('--------------------------------------------------');
  console.log('Funbox 戰鬥陀螺上新監控已啟動！');
  console.log(`Telegram Bot ID: ${TG_BOT_TOKEN.split(':')[0]}`);
  console.log(`接收通知 Chat ID: ${TG_CHAT_ID}`);
  console.log(`掃描頻率: 每 ${CHECK_INTERVAL_MS / 1000} 秒一次`);
  console.log('--------------------------------------------------');

  // 第一次執行先將現有商品寫入資料庫，避免首次啟動時把舊商品當作新品發送
  const initialProducts = await fetchProducts();
  for (const p of initialProducts) {
    const stock = p.variants?.[0]?.inventory_quantity ?? 0;
    const exist = await db.get('SELECT id, stock FROM products WHERE id = ?', [p.id]);

    if (!exist) {
      // 全新商品，直接寫入 (不發新品通知，因為是啟動初始化防爆)
      await db.run(
        'INSERT INTO products (id, title, price, url, stock) VALUES (?, ?, ?, ?, ?)',
        [p.id, p.title, p.price, p.url, stock]
      );
    } else {
      // 舊商品，比對庫存是否變更
      const oldStock = exist.stock;
      if (oldStock !== null && oldStock !== stock) {
        await db.run('UPDATE products SET stock = ? WHERE id = ?', [stock, p.id]);

        const fullUrl = `https://shop.funbox.com.tw${p.url}`;
        const changeText = stock > oldStock 
          ? `📈 [啟動偵測] 補貨通知！庫存從 <b>${oldStock}</b> 增加為 <b>${stock}</b>`
          : `📉 [啟動偵測] 庫存減少！庫存從 <b>${oldStock}</b> 減少為 <b>${stock}</b>`;

        const message = `🔔 <b>Funbox 庫存變動通知</b>\n\n` +
                        `<b>品名:</b> ${p.title}\n` +
                        `<b>價格:</b> NT$ ${p.price}\n` +
                        `<b>狀態:</b> ${changeText}\n` +
                        `<b>連結:</b> <a href="${fullUrl}">點此前往購買</a>`;

        await sendTelegramMessage(message);
        console.log(`🔔 [啟動偵測] 發送庫存變動通知: ${p.title} (${oldStock} -> ${stock})`);
      } else if (oldStock === null) {
        await db.run('UPDATE products SET stock = ? WHERE id = ?', [stock, p.id]);
      }
    }
  }
  console.log(`初始商品數據加載完成，共記錄 ${initialProducts.length} 個商品。`);

  if (process.env.RUN_ONCE === 'true') {
    if (process.env.SEND_REPORT === 'true') {
      await sendHourlyInventoryReport();
    }
    console.log('單次執行模式完成，安全退出。');
    process.exit(0);
  }

  // 第一次啟動時，立即發送一則庫存報告通知
  await sendHourlyInventoryReport();

  // 啟動每小時庫存排程
  scheduleHourlyReport();

  // 開始定時輪詢上新與庫存變動
  setInterval(async () => {
    console.log(`[${new Date().toLocaleString()}] 掃描中...`);
    const products = await fetchProducts();

    for (const p of products) {
      const currentStock = p.variants?.[0]?.inventory_quantity ?? 0;
      // 檢查是否已在資料庫中
      const exist = await db.get('SELECT id, stock FROM products WHERE id = ?', [p.id]);

      if (!exist) {
        // 寫入資料庫（新品上架）
        await db.run(
          'INSERT INTO products (id, title, price, url, stock) VALUES (?, ?, ?, ?, ?)',
          [p.id, p.title, p.price, p.url, currentStock]
        );

        // 整理發送資訊
        const fullUrl = `https://shop.funbox.com.tw${p.url}`;
        
        const message = `🚨 <b>Funbox 戰鬥陀螺上新！</b>\n\n` +
                        `<b>品名:</b> ${p.title}\n` +
                        `<b>價格:</b> NT$ ${p.price}\n` +
                        `<b>目前庫存:</b> ${currentStock}\n` +
                        `<b>連結:</b> <a href="${fullUrl}">點此前往購買</a>`;

        await sendTelegramMessage(message);
        console.log(`✨ 發送新品通知: ${p.title}`);
      } else {
        // 已存在商品，比對庫存是否變更
        const oldStock = exist.stock;
        if (oldStock !== currentStock) {
          // 更新資料庫庫存
          await db.run('UPDATE products SET stock = ? WHERE id = ?', [currentStock, p.id]);

          const fullUrl = `https://shop.funbox.com.tw${p.url}`;
          const changeText = currentStock > oldStock 
            ? `📈 補貨通知！庫存從 <b>${oldStock}</b> 增加為 <b>${currentStock}</b>`
            : `📉 庫存減少！庫存從 <b>${oldStock}</b> 減少為 <b>${currentStock}</b>`;

          const message = `🔔 <b>Funbox 庫存變動通知</b>\n\n` +
                          `<b>品名:</b> ${p.title}\n` +
                          `<b>價格:</b> NT$ ${p.price}\n` +
                          `<b>狀態:</b> ${changeText}\n` +
                          `<b>連結:</b> <a href="${fullUrl}">點此前往購買</a>`;

          await sendTelegramMessage(message);
          console.log(`🔔 發送庫存變動通知: ${p.title} (${oldStock} -> ${currentStock})`);
        }
      }
    }
  }, CHECK_INTERVAL_MS);
}

startMonitor().catch(console.error);
