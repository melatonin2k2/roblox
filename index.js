const express = require("express");
const fetch = require("node-fetch");

const app = express();
const PORT = 3000;

// Roblox APIs
const COLLECTIBLES_API = (userId, cursor = "") =>
  `https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?limit=100&cursor=${cursor}`;

const ASSETS_API = (userId, cursor = "") =>
  `https://inventory.roblox.com/v1/users/${userId}/assets?limit=100&cursor=${cursor}`;

// Helper: fetch all pages
async function fetchAllPages(apiFunc, userId) {
  let items = [];
  let cursor = "";
  let hasMore = true;

  while (hasMore) {
    const url = apiFunc(userId, cursor);
    const res = await fetch(url);

    if (res.status === 404) {
      console.log(`[INFO] No more pages for ${apiFunc.name}, stopping.`);
      break;
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (data && data.data) {
      items = items.concat(data.data);
      console.log(`[DEBUG] Fetched ${data.data.length} items from ${apiFunc.name}, cursor: ${cursor}`);
    }

    if (data.nextPageCursor) {
      cursor = data.nextPageCursor;
      await new Promise(resolve => setTimeout(resolve, 500)); // throttle requests
    } else {
      hasMore = false;
    }
  }

  return items;
}

// Attempt to get a Roblox asset ID for ImageLabel
// Note: In many cases you’ll need to upload a decal or map via database, 
// as Roblox doesn’t allow direct CDN URLs in ImageLabels
function getRobloxAssetId(item) {
  if (item.assetId) return `rbxassetid://${item.assetId}`;
  return ""; // fallback: no valid ID
}

// Fetch all sellable items
async function getAllSellableItems(userId) {
  try {
    const collectibles = await fetchAllPages(COLLECTIBLES_API, userId);
    const assets = await fetchAllPages(ASSETS_API, userId);

    const allItems = [...collectibles, ...assets];

    const sellable = allItems.filter(item =>
      item.isLimited || item.isLimitedUnique || item.saleStatus === "Resellable"
    );

    return sellable.map(item => ({
      assetId: item.assetId || null,
      name: item.name || "Unknown",
      recentAveragePrice: item.recentAveragePrice || 0,
      isLimited: item.isLimited || false,
      isLimitedUnique: item.isLimitedUnique || false,
      saleStatus: item.saleStatus || "",
      imageUrl: getRobloxAssetId(item) // safe for ImageLabel
    })).sort((a, b) => b.recentAveragePrice - a.recentAveragePrice);

  } catch (err) {
    console.error(`Failed to fetch inventory for userId ${userId}:`, err);
    return [];
  }
}

// API endpoint
app.get("/inventory/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    const items = await getAllSellableItems(userId);

    if (!items.length) {
      return res.json({
        TotalCount: 0,
        TotalValue: 0,
        MostExpensiveName: "N/A",
        MostExpensiveImage: "",
        Items: []
      });
    }

    const TotalValue = items.reduce((sum, i) => sum + i.recentAveragePrice, 0);
    const topItem = items[0];

    res.json({
      TotalCount: items.length,
      TotalValue,
      MostExpensiveName: topItem.name,
      MostExpensiveImage: topItem.imageUrl,
      Items: items
    });

  } catch (err) {
    console.error(err);
    res.json({
      TotalCount: 0,
      TotalValue: 0,
      MostExpensiveName: "N/A",
      MostExpensiveImage: "",
      Items: []
    });
  }
});

app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
