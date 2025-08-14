const express = require("express");
const fetch = require("node-fetch");

const app = express();
const PORT = 3000;

const INVENTORY_API = (userId, cursor = "") =>
  `https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?limit=100&cursor=${cursor}`;

// Fetch helper with retries
async function fetchWithRetry(url, retries = 5, delay = 500) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      return data;
    } catch (err) {
      console.warn(`Fetch failed (${i + 1}/${retries}): ${err.message}`);
      if (i < retries - 1) await new Promise(r => setTimeout(r, delay));
      else throw err;
    }
  }
}

// Get all sellable items; must succeed fully or throw
async function getAllSellableItems(userId) {
  let items = [];
  let cursor = "";
  let hasMore = true;

  while (hasMore) {
    const data = await fetchWithRetry(INVENTORY_API(userId, cursor));

    if (!data || !data.data) throw new Error("Invalid inventory response");

    const sellable = data.data.filter(item =>
      item.isLimited || item.isLimitedUnique || item.restrictions?.includes("Resellable")
    );

    items = items.concat(sellable);

    if (data.nextPageCursor) {
      cursor = data.nextPageCursor;
      await new Promise(r => setTimeout(r, 200)); // avoid rate limit
    } else {
      hasMore = false;
    }
  }

  return items;
}

app.get("/inventory/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    const items = await getAllSellableItems(userId);

    const TotalValue = items.reduce((sum, item) => sum + (item.recentAveragePrice || 0), 0);

    let topItem = items.reduce((prev, curr) =>
      (curr.recentAveragePrice || 0) > (prev.recentAveragePrice || 0) ? curr : prev
    , items[0] || null);

    let imageUrl = "";
    if (topItem) {
      const thumbData = await fetchWithRetry(
        `https://thumbnails.roblox.com/v1/assets?assetIds=${topItem.assetId}&size=150x150&format=Png&isCircular=false`
      );
      imageUrl = thumbData.data && thumbData.data[0] ? thumbData.data[0].imageUrl : "";
    }

    res.json({
      TotalCount: items.length,
      TotalValue,
      MostExpensiveName: topItem ? topItem.name : "N/A",
      MostExpensiveImage: imageUrl
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
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
