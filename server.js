const express = require("express");
const WebSocket = require("ws");
const cors = require("cors");

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;
const WS_URL = "wss://nhicuto.fun/game_sunwin/ws?id=Cskhtool11&key=NhiCuTo";

// ===== BIẾN TOÀN CỤC =====
let lastMessage = null;        // dữ liệu gốc từ websocket
let history = [];              // lịch sử kết quả (Tài/Xỉu)
let diceHistory = [];          // lịch sử tổng điểm
let predictHistory = [];       // lưu lịch sử dự đoán
let lastSession = null;        // phiên cuối cùng đã xử lý
let pendingPrediction = null;  // dự đoán cho phiên kế tiếp

let tongDung = 0;
let tongSai = 0;

// ===== HÀM LẤY FIELD (viết gọn cho cả chữ hoa/thường) =====
function getField(obj, ...keys) {
  for (let k of keys) {
    if (obj[k] !== undefined) return obj[k];
    const lower = k.toLowerCase();
    for (let kk in obj) {
      if (kk.toLowerCase() === lower) return obj[kk];
    }
  }
  return undefined;
}

// ===== THUẬT TOÁN DỰ ĐOÁN =====
function analyze(history, diceHistory) {
  if (history.length < 3) {
    return { prediction: Math.random() > 0.5 ? "Tài" : "Xỉu", confidence: 50 };
  }

  const last = history.at(-1);
  const last2 = history.at(-2);
  const last3 = history.at(-3);

  // Cầu bệt >= 4 → theo tiếp
  if (history.slice(-4).every(r => r === "Tài")) {
    return { prediction: "Tài", confidence: 85 };
  }
  if (history.slice(-4).every(r => r === "Xỉu")) {
    return { prediction: "Xỉu", confidence: 85 };
  }

  // Cầu 1-1
  if (last !== last2 && last2 !== last3) {
    return { prediction: last, confidence: 70 };
  }

  // Cầu 2-2
  if (last === last2 && last2 !== last3) {
    return { prediction: last, confidence: 65 };
  }

  // Hồi cầu theo điểm
  const lastDice = diceHistory.at(-1);
  const prevDice = diceHistory.at(-2);

  if (last === "Tài" && lastDice >= 16 && prevDice <= 7) {
    return { prediction: "Xỉu", confidence: 80 };
  }
  if (last === "Xỉu" && lastDice <= 6 && prevDice >= 15) {
    return { prediction: "Tài", confidence: 80 };
  }

  // Tổng quan 10 ván gần nhất
  const recent = history.slice(-10);
  const countTai = recent.filter(r => r === "Tài").length;
  const countXiu = recent.length - countTai;

  let prediction = last;
  let confidence = 55;

  if (countTai > countXiu) {
    prediction = "Xỉu";
    confidence = 60;
  } else if (countXiu > countTai) {
    prediction = "Tài";
    confidence = 60;
  }

  return { prediction, confidence };
}

// ===== KẾT NỐI WEBSOCKET =====
function connectWS() {
  const ws = new WebSocket(WS_URL);

  ws.on("open", () => {
    console.log("✅ Đã kết nối WebSocket");
  });

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      lastMessage = data;

      const phien = getField(data, "Phien", "phien");
      const kq = getField(data, "Ket_qua", "ket_qua");

      if (!phien || !kq) return;

      if (phien !== lastSession) {
        // nếu có dự đoán chờ thì so sánh với kết quả thực tế
        if (pendingPrediction) {
          predictHistory.push({
            phien,
            du_doan: pendingPrediction.prediction,
            ket_qua: kq,
            danh_gia: pendingPrediction.prediction === kq ? "ĐÚNG" : "SAI"
          });

          if (pendingPrediction.prediction === kq) tongDung++;
          else tongSai++;

          if (predictHistory.length > 50) predictHistory.shift();

          pendingPrediction = null; // reset
        }

        lastSession = phien;

        const x1 = Number(getField(data, "Xuc_xac_1", "xuc_xac_1"));
        const x2 = Number(getField(data, "Xuc_xac_2", "xuc_xac_2"));
        const x3 = Number(getField(data, "Xuc_xac_3", "xuc_xac_3"));
        const tong = x1 + x2 + x3;

        history.push(kq);
        diceHistory.push(tong);
        if (history.length > 30) history.shift();
        if (diceHistory.length > 30) diceHistory.shift();

        // dự đoán cho phiên tiếp theo
        const { prediction, confidence } = analyze(history, diceHistory);
        pendingPrediction = { prediction, confidence, phien };
      }
    } catch (e) {
      console.error("❌ Lỗi parse message:", e);
    }
  });

  ws.on("close", () => {
    console.log("❌ WebSocket đóng. Kết nối lại sau 2s...");
    setTimeout(connectWS, 2000);
  });

  ws.on("error", (err) => {
    console.error("❌ WS error:", err.message);
    ws.close();
  });
}
connectWS();

// ===== API EXPRESS =====
app.get("/api/sunwinsex666", (req, res) => {
  if (!lastMessage) return res.json({ error: "Chưa có dữ liệu từ WebSocket" });

  const x1 = Number(getField(lastMessage, "Xuc_xac_1", "xuc_xac_1") || 0);
  const x2 = Number(getField(lastMessage, "Xuc_xac_2", "xuc_xac_2") || 0);
  const x3 = Number(getField(lastMessage, "Xuc_xac_3", "xuc_xac_3") || 0);
  const tong = x1 + x2 + x3;

  res.json({
    id: "@LostmyS4lf",
    phien: String(lastSession || ""),
    xuc_xac_1: x1,
    xuc_xac_2: x2,
    xuc_xac_3: x3,
    tong,
    ket_qua: getField(lastMessage, "Ket_qua", "ket_qua") || "",
    du_doan: pendingPrediction ? pendingPrediction.prediction : "Đang phân tích...",
    xac_xuat: pendingPrediction ? pendingPrediction.confidence : 0,
    tong_dung: tongDung,
    tong_sai: tongSai
  });
});

app.get("/history/sunwinsex666", (req, res) => {
  res.json(predictHistory.slice().reverse());
});

app.listen(PORT, () => {
  console.log(`🚀 Server chạy tại http://localhost:${PORT}`);
});