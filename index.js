const express = require("express");
const fetch = require("node-fetch");

const app = express();
const PORT = 3000;

// Roblox API endpoints
const COLLECTIBLES_API = (userId, cursor = "") =>
  `https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?limit=100&cursor=${cursor}`;
const ASSETS_API = (userId, cursor = "") =>
  `https://inventory.roblox.com/v1/users/${userId}/assets?limit=100&cursor=${cursor}`;

// Fetch all pages from a Roblox API endpoint
async function fetchAllPages(apiFunc, userId) {
  let items = [];
  let cursor = "";
  let hasMore = true;

  while (hasMore) {
    const res = await fetch(apiFunc(userId, cursor));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (data && data.data) items = items.concat(data.data);

    if (data.nextPageCursor) {
      cursor = data.nextPageCursor;
      await new Promise(resolve => setTimeout(resolve, 200));
    } else {
      hasMore = false;
    }
  }

  return items;
}

// Fetch thumbnail URLs for multiple assets
async function fetchThumbnails(assetIds) {
  if (!assetIds.length) return {};
  const res = await fetch(
    `https://thumbnails.roblox.com/v1/assets?assetIds=${assetIds.join(",")}&size=150x150&format=Png&isCircular=false`
  );
  const data = await res.json();
  const thumbnails = {};
  if (data.data) {
    data.data.forEach(item => {
      thumbnails[item.assetId] = item.imageUrl;
    });
  }
  return thumbnails;
}

// Scan entire inventory and return sellable items only
async function getSellableItems(userId) {
  try {
    const collectibles = await fetchAllPages(COLLECTIBLES_API, userId);
    const assets = await fetchAllPages(ASSETS_API, userId);
    const allItems = [...collectibles, ...assets];

    // Only keep items that the user can sell
    const sellableItems = allItems.filter(item =>
      item.isLimited || item.isLimitedUnique || item.saleStatus === "Resellable"
    );

    // Fetch thumbnails
    const assetIds = sellableItems.map(item => item.assetId);
    const thumbnails = await fetchThumbnails(assetIds);

    // Map items with price and thumbnail
    const itemsWithThumbnails = sellableItems.map(item => ({
      assetId: item.assetId,
      name: item.name,
      recentAveragePrice: item.recentAveragePrice || 0,
      isLimited: item.isLimited || false,
      isLimitedUnique: item.isLimitedUnique || false,
      saleStatus: item.saleStatus || "",
      imageUrl: thumbnails[item.assetId] || ""
    }));

    return itemsWithThumbnails;
  } catch (err) {
    console.error(`Failed to fetch inventory for userId ${userId}:`, err);
    return [];
  }
}

// API endpoint
app.get("/inventory/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    const sellableItems = await getSellableItems(userId);

    if (!sellableItems.length) {
      return res.json({
        TotalCount: 0,
        TotalValue: 0,
        MostExpensiveName: "N/A",
        MostExpensiveImage: ""
      });
    }

    // Total value = sum of recentAveragePrice of sellable items
    const TotalValue = sellableItems.reduce((sum, item) => sum + (item.recentAveragePrice || 0), 0);

    // Most expensive sellable item
    const topItem = sellableItems.reduce((prev, curr) =>
      (curr.recentAveragePrice || 0) > (prev.recentAveragePrice || 0) ? curr : prev
    , sellableItems[0]);

    res.json({
      TotalCount: sellableItems.length,
      TotalValue,
      MostExpensiveName: topItem.name,
      MostExpensiveImage: topItem.imageUrl
    });
  } catch (err) {
    console.error(err);
    res.json({
      TotalCount: 0,
      TotalValue: 0,
      MostExpensiveName: "N/A",
      MostExpensiveImage: ""
    });
  }
});

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
