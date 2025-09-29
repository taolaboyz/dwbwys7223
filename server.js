const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;
const API_URL = "https://sun-predict-pattern.onrender.com/api/taixiu/sunwin";

// ===== BIẾN TOÀN CỤC =====
let lastMessage = null;        // dữ liệu gốc từ API
let history = [];              // lịch sử kết quả (Tài/Xỉu)
let diceHistory = [];          // lịch sử tổng điểm
let predictHistory = [];       // lưu lịch sử dự đoán
let lastSession = null;        // phiên cuối cùng đã xử lý
let pendingPrediction = null;  // dự đoán cho phiên kế tiếp
let tongDung = 0;
let tongSai = 0;

// ===== HÀM LẤY FIELD =====
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
  if (history.length < 3 || diceHistory.length < 2) {
    const tong = diceHistory.at(-1) || 11; 
    const prediction = tong <= 10 ? "Xỉu" : "Tài";
    return { prediction, confidence: 65 };
  }

  const last = history.at(-1);
  const last2 = history.at(-2);
  const last3 = history.at(-3);
  const lastDice = diceHistory.at(-1);
  const prevDice = diceHistory.at(-2);
  const prev2Dice = diceHistory.at(-3)

  /* ===== 1. CẦU BỆT (Streak) ===== */
  let streak = 1;
  for (let i = history.length - 2; i >= 0; i--) {
    if (history[i] === history[i + 1]) streak++;
    else break;
  }
  if (streak >= 6) {
    const opposite = last === "Tài" ? "Xỉu" : "Tài";
    return { prediction: opposite, confidence: 80 };
  } else if (streak >= 4) {
    return { prediction: last, confidence: 85 };
  }

  /* ===== 2. XỈU CAO / XỈU THẤP ===== */
  if (last === "Xỉu") {
    if (prevDice >= 8 && lastDice <= 7) {
      return { prediction: "Xỉu", confidence: 75 };
    }
    if (lastDice <= 6) {
      return { prediction: "Xỉu", confidence: 80 };
    }
    if ((prevDice === 7 || prevDice === 8) && lastDice === 10) {
      return { prediction: "Xỉu", confidence: 70 };
    }
  }
  if (last === "Xỉu" && lastDice <= 6) {
    return { prediction: "Xỉu", confidence: 85 };
  }

  /* ===== 3. CẦU 1-1 ===== */
  if (last !== last2 && last2 !== last3) {
    let length = 2;
    for (let i = history.length - 3; i > 0; i--) {
      if (history[i] !== history[i - 1]) length++;
      else break;
    }
    if (length >= 5 && Math.random() < 0.3) {
      return { prediction: last, confidence: 60 };
    }
    const opposite = last === "Tài" ? "Xỉu" : "Tài";
    return { prediction: opposite, confidence: 70 };
  }

  /* ===== 4. CẦU 2-2 ===== */
  if (last === last2 && last2 !== last3) {
    return { prediction: last, confidence: 65 };
  }

    /* ===== 6. HỒI CẦU THEO ĐIỂM ===== */
    if (prevDice === 11 && last === "Xỉu" && lastDice <= 8) {
      return { prediction: "Xỉu", confidence: 85 };
    }
    if (prevDice === 10 && last === "Tài" && (lastDice === 14 || lastDice === 15)) {
      return { prediction: "Tài", confidence: 80 };
    }
    if (prevDice === 11 && last === "Xỉu" && (lastDice === 9 || lastDice === 10)) {
      const opposite = last === "Tài" ? "Xỉu" : "Tài";
      return { prediction: opposite, confidence: 70 };
    }
    const last4 = diceHistory.slice(-4).join("-");
    if (last4 === "10-11-10-11") {
      return { prediction: "Tài", confidence: 75 };
    }
    if (last === "Tài" && lastDice >= 16 && prevDice <= 7) {
      return { prediction: "Xỉu", confidence: 80 };
    }
    if (prevDice <= 7 && lastDice >= 14 && last === "Tài") {
      return { prediction: "Xỉu", confidence: 75 };
    }
    if ((prevDice === 14 || prevDice === 15) && (lastDice === 9 || lastDice === 10)) {
      return { prediction: "Tài", confidence: 75 };
    }
    if (prev2Dice >= 14 && prevDice === 10 && lastDice === 11) {
      return { prediction: "Tài", confidence: 80 };
    }
    if (prevDice >= 16 && lastDice <= 7) {
      return { prediction: "Tài", confidence: 75 };
    }
    if (diceHistory.length >= 3) {
      const d1 = diceHistory.at(-3); // 15
      const d2 = diceHistory.at(-2); // 7
      const d3 = diceHistory.at(-1); // 8
      if (d1 >= 14 && d2 <= 7 && d3 <= 8) {
        return { prediction: "Tài", confidence: 80 };
      }
    }

  /* ===== 7. CHECK BỆT + XỈU 10 ===== */
  if (lastDice === 10) {
    let streakTai = 0;
    for (let i = history.length - 2; i >= 0; i--) {
      if (history[i] === "Tài") streakTai++;
      else break;
    }
    if (streakTai >= 3) {
      return { prediction: "Xỉu", confidence: 75 };
    } else {
      return { prediction: "Tài", confidence: 70 };
    }
  }

  /* ===== 8. TỔNG QUAN 10 VÁN GẦN NHẤT ===== */
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

// ===== LẤY DỮ LIỆU API PHỤ =====
async function fetchAPI() {
  try {
    const res = await axios.get(API_URL);
    const data = res.data;
    lastMessage = data;

    const phien = getField(data, "Phien", "phien");
    const kq = getField(data, "Ket_qua", "ket_qua");
    if (!phien || !kq) return;

    if (phien !== lastSession) {
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
        pendingPrediction = null;
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

      const { prediction, confidence } = analyze(history, diceHistory);
      pendingPrediction = { prediction, confidence, phien };
    }
  } catch (e) {
    console.error("❌ Lỗi fetch API:", e.message);
  }
}

// Gọi ngay khi start và lặp lại 5s/lần
fetchAPI();
setInterval(fetchAPI, 5000);

// ===== API EXPRESS =====
app.get("/api/sunwinsex666", (req, res) => {
  if (!lastMessage) return res.json({ error: "Chưa có dữ liệu từ API phụ" });

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
