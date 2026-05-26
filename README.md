# Funbox Store Tracking Bot

一個用來監控 Funbox 玩具官方網站「戰鬥陀螺」分類的 Telegram 機器人。

## 功能
1. **即時上新通知**：每 60 秒輪詢一次 API，有新品上架立刻發送 Telegram 訊息。
2. **每日庫存回報**：每天早上 10:00 自動彙整目前網站上的商品與庫存數據並發送。
3. **防止重複通知**：使用 SQLite 資料庫本地儲存已發送商品，避免服務重啟後重複通知。

## 安裝與執行

### 1. 安裝環境與套件
在該專案目錄下執行：
```bash
npm install
```

### 2. 執行監控
*   **一般執行**：
    ```bash
    npm start
    ```
*   **透過 PM2 於背景永久執行**：
    ```bash
    npm run pm2
    ```

## PM2 常用管理指令
*   **查看狀態**：`npx pm2 status`
*   **查看日誌**：`npx pm2 logs funbox-beyblade`
*   **停止服務**：`npx pm2 stop funbox-beyblade`
*   **重啟服務**：`npx pm2 restart funbox-beyblade`
