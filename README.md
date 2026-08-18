# SIGNAL//RIFT

SIGNAL//RIFT 是一款原創的高難度節奏平台遊戲 MVP：角色自動向右前進，玩家以精準輸入穿越幾何危險、模式傳送門與重力變化。所有關卡名稱、介面、幾何圖形、音效回饋與程式碼均為本專案原創，未使用 Geometry Dash 的素材或關卡。

## 技術與安裝

- Vite + TypeScript
- 原生 Canvas 2D 遊戲迴圈與 DOM UI
- localStorage 儲存進度與自製關卡

```bash
npm install
npm run dev
```

開啟終端機顯示的本機 URL；正式建置使用 `npm run build`，預覽使用 `npm run preview`。

## 操作方式

桌面使用 Space、上方向鍵或滑鼠點擊；手機使用觸控 Canvas。持續按住會依模式產生不同動作。遊戲內可快速 Restart，Practice 可手動設定 checkpoint。

## English Typing Challenge

上方導覽列的 `TYPING` 是 local-first English Typing Trainer。正確字元顯示綠色，錯誤字元顯示紅色；可使用 Backspace 刪除後重打。完成後顯示準確率與調整後 WPM，計算方式為「原始 WPM × 準確率」。

- Easy / Normal / Hard：依句長、常用字彙、自然片語與句型分級。
- 32 篇 curated learning passages 在完成後提供 2–4 個英文解釋、繁體中文意思與自然例句；輸入期間不會干擾。
- 既有 70 篇 legacy passages 仍可在 Normal practice pool 抽到，維持無 metadata 的純打字練習；後續會逐篇補上高品質 learning notes，而不以自動產生內容取代。
- localStorage 保存最近 50 次的 WPM、accuracy、max combo、完成時間與錯誤模式；畫面顯示最近 10 次平均與 Personal Best。
- 每日挑戰使用固定當日題目、accuracy + combo 任務與連續完成天數；適應式建議優先保護 accuracy。
- 完成後可查看常錯字母、單字、字母組合，並一鍵產生短的弱點練習。

## 模式

Cube、Ship、Ball、UFO、Wave、Swing 已納入同一套 player state machine；關卡物件可觸發 Mode、Gravity、Speed、Mini、Dual portals。Normal 會死亡重開，Practice 從 checkpoint 重生，Noclip 保留危險碰撞判斷但忽略死亡。

## 官方關卡

目前有 11 個獨立命名、獨立難度標示的短版 playable prototypes，從 Entry Demon 逐步展示飛行、重力、Wave、Mini、Dual 與混合模式，最後一關是 Extreme Demon / Apex 方向的短版展示。每關的 Best%、完成狀態與模式入口都在 Level Select。

## Editor

Level Editor 直接編輯 `LevelData` JSON。可新增 Ground、Platform、Spike、Saw、Chain Saw、Decoration、Jump Pad、Jump Orb、Mode / Gravity / Speed / Mini / Dual portals 與 Start Position；支援選取、刪除、複製、箭頭移動、Grid / Snap、Undo / Redo、Save、New、Test Play。自製關卡會保存到 localStorage，之後可在 Level Select 以一般關卡方式遊玩。

## 專案架構

`src/types.ts` 資料契約；`src/game.ts` loop、physics、collision、render 與 portals；`src/levels.ts` 官方關卡生成與物件；`src/editor.ts` 編輯器資料操作；`src/typing.ts` 英文打字狀態、輸入與評分；`src/storage.ts` localStorage；`src/main.ts` UI 與畫面路由；`src/styles.css` 原創介面系統。

## 下一階段

可加入節拍同步音軌、可視化編輯器拖曳／旋轉／縮放／顏色面板、真正的雙角色碰撞、完整關卡播放時間軸、更多障礙物 variant、WebAudio 音效資產、replay／ghost、可匯入匯出 JSON，以及更完整的手機手勢與無障礙設定。
