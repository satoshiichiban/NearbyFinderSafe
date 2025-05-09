// dotenv を読み込む
require("dotenv").config();

// 必要なモジュールを読み込む
const express = require("express");
const https = require("https");
const path = require("path");

// Express アプリケーションを初期化
const app = express();

// Google APIキーを環境変数から取得
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

// 静的ファイルを提供 (public フォルダを使用)

app.use(express.static(path.join(__dirname, "public")));

// JSONのリクエストボディを解析
app.use(express.json());

// 検索エンドポイント
app.post("/search", (req, res) => {

  const { keyword, lat, lng, radius = 3000, limit = 10 } = req.body; // 必要な変数を一度に宣言

  if (!keyword || !lat || !lng) {
    return res.status(400).send("必要なパラメータが不足しています。");
  }

  const placesApiUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&keyword=${encodeURIComponent(
    keyword
  )}&language=ja&key=${GOOGLE_API_KEY}`;
  

  https.get(placesApiUrl, (placesRes) => {
    let placesData = "";
    placesRes.on("data", (chunk) => {
      placesData += chunk;
    });
    placesRes.on("end", () => {
      const placesJson = JSON.parse(placesData);

      if (!placesJson.results || placesJson.results.length === 0) {
        return res.json([]);
      }

      const placesPromises = placesJson.results.map((place) => {
        return new Promise((resolve) => {

          const directionsApiUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${lat},${lng}&destination=${place.geometry.location.lat},${place.geometry.location.lng}&mode=walking&key=${GOOGLE_API_KEY}`;


          https
            .get(directionsApiUrl, (directionsRes) => {
              let directionsData = "";
              directionsRes.on("data", (chunk) => {
                directionsData += chunk;
              });
              directionsRes.on("end", () => {
                const directionsJson = JSON.parse(directionsData);
                const distanceText =
                  directionsJson.routes[0]?.legs[0]?.distance?.text || "不明";
                const distanceValue =
                  directionsJson.routes[0]?.legs[0]?.distance?.value ||
                  Infinity;

                resolve({
                  name: place.name || "名称不明",
                  address: place.vicinity || "住所不明",
                  rating: place.rating || "評価なし",
                  distanceText,
                  distanceValue,

                  userRatingsTotal: place.user_ratings_total || 0,

                  mapLink: `https://www.google.com/maps/place/?q=place_id:${place.place_id}`,

                   // ✅ これを追加
  　　　　　　　　　　placeId: place.place_id,
  
                });
              });
            })
            .on("error", (err) => {

              console.error("Directions APIエラー:", err);

              resolve({
                name: place.name || "名称不明",
                address: place.vicinity || "住所不明",
                rating: place.rating || "評価なし",
                distanceText: "取得エラー",
                distanceValue: Infinity,
              });
            });
        });
      });

      Promise.all(placesPromises).then((results) => {
        const filteredResults = results
          .filter((place) => place.distanceValue <= radius) // 指定範囲内
          .sort((a, b) => b.rating - a.rating) // 評価順
          .slice(0, limit); // 件数制限
        res.json(filteredResults);
      });
    });
  });
});

// 施設詳細エンドポイント
app.get("/place-details", (req, res) => {
  console.time("🔍 place-details 全体処理時間");

  const placeId = req.query.place_id;

  if (!placeId) {
    console.timeEnd("🔍 place-details 全体処理時間");
    return res.status(400).json({ error: "place_id パラメータが必要です。" });
  }

  if (typeof GOOGLE_API_KEY === "undefined") {
    console.error("❌ GOOGLE_API_KEY が定義されていません。");
    console.timeEnd("🔍 place-details 全体処理時間");
    return res.status(500).json({ error: "APIキーが未設定です。" });
  }

  // ここが抜けてた‼️
  const apiUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&key=${GOOGLE_API_KEY}`;

  // APIリクエスト
  console.time("🌐 Google API リクエスト時間");

  https
    .get(apiUrl, (apiRes) => {
      let data = "";

      apiRes.on("data", (chunk) => {
        data += chunk;
      });

      apiRes.on("end", () => {
        console.timeEnd("🌐 Google API リクエスト時間");

        try {
          const placeDetails = JSON.parse(data);
          res.json(placeDetails);
        } catch (err) {
          res.status(500).json({ error: "詳細データの解析に失敗しました。" });
        }

        console.timeEnd("🔍 place-details 全体処理時間");
      });
    })
    .on("error", (err) => {
      console.timeEnd("🌐 Google API リクエスト時間");
      console.timeEnd("🔍 place-details 全体処理時間");
      res.status(500).json({ error: "API リクエストエラー。", details: err.message });
    });
    // ここまでがAPI処理
});

// ポート番号を環境変数から取得。未指定なら3000番を使用
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("NearbyFinder サーバーは正常に稼働中です。");
});

app.listen(PORT, () => {
  console.log(`サーバー起動中： http://localhost:${PORT}`);
});