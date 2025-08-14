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
      await new Promise(resolve => setTimeout(resolve, 200)); // throttle requests
    } else {
      hasMore = false;
    }
  }

  return items;
}

// Fetch thumbnails for multiple assets
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

// Get all inventory items with a price
async function getAllPricedItems(userId) {
  try {
    const collectibles = await fetchAllPages(COLLECTIBLES_API, userId);
    const assets = await fetchAllPages(ASSETS_API, userId);

    const allItems = [...collectibles, ...assets];

    // Keep only items with a recentAveragePrice > 0
    const pricedItems = allItems.filter(item =>
      item.recentAveragePrice && item.recentAveragePrice > 0
    );

    const assetIds = pricedItems.map(item => item.assetId);
    const thumbnails = await fetchThumbnails(assetIds);

    const itemsWithThumbnails = pricedItems.map(item => ({
      assetId: item.assetId,
      name: item.name,
      recentAveragePrice: item.recentAveragePrice,
      imageUrl: thumbnails[item.assetId] || ""
    }));

    // Sort by price descending
    itemsWithThumbnails.sort((a, b) => b.recentAveragePrice - a.recentAveragePrice);

    return itemsWithThumbnails;
  } catch (err) {
    console.error(`Failed to fetch inventory for userId ${userId}:`, err);
    return [];
  }
}

// API endpoint
app.get("/inventory/:userId", async (req, res) => {
  const { userId } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;

  try {
    const items = await getAllPricedItems(userId);

    if (!items.length) {
      return res.json({
        TotalCount: 0,
        TotalValue: 0,
        MostExpensiveName: "N/A",
        MostExpensiveImage: "",
        Page: page,
        Limit: limit,
        TotalPages: 0,
        Items: []
      });
    }

    const TotalValue = items.reduce((sum, item) => sum + item.recentAveragePrice, 0);
    const topItem = items[0];

    const start = (page - 1) * limit;
    const end = start + limit;
    const paginatedItems = items.slice(start, end);
    const totalPages = Math.ceil(items.length / limit);

    res.json({
      TotalCount: items.length,
      TotalValue,
      MostExpensiveName: topItem.name,
      MostExpensiveImage: topItem.imageUrl,
      Page: page,
      Limit: limit,
      TotalPages: totalPages,
      Items: paginatedItems
    });
  } catch (err) {
    console.error(err);
    res.json({
      TotalCount: 0,
      TotalValue: 0,
      MostExpensiveName: "N/A",
      MostExpensiveImage: "",
      Page: page,
      Limit: limit,
      TotalPages: 0,
      Items: []
    });
  }
});

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
