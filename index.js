const express = require("express");
const fetch = require("node-fetch");

const app = express();
const PORT = 3000;

// Roblox collectibles API
const INVENTORY_API = (userId, cursor = "") =>
  `https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?limit=100&cursor=${cursor}`;

async function getAllSellableItems(userId) {
  let items = [];
  let cursor = "";
  let hasMore = true;

  while (hasMore) {
    const res = await fetch(INVENTORY_API(userId, cursor));
    const data = await res.json();

    if (data && data.data) {
      const sellable = data.data.filter(item =>
        item.isLimited || item.isLimitedUnique || item.restrictions?.includes("Resellable")
      );

      items = items.concat(sellable);
    }

    if (data.nextPageCursor) {
      cursor = data.nextPageCursor;
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

    if (!items.length) {
      return res.json({
        TotalCount: 0,
        TotalValue: 0,
        MostExpensiveName: null,
        MostExpensiveImage: ""
      });
    }

    // Count of all sellable items
    const TotalCount = items.length;

    // Total value of all sellable items
    const TotalValue = items.reduce((sum, item) => sum + (item.recentAveragePrice || 0), 0);

    // Most expensive item
    let topItem = items.reduce((prev, curr) => {
      return (curr.recentAveragePrice || 0) > (prev.recentAveragePrice || 0) ? curr : prev;
    });

    // Image for top item
    const thumbRes = await fetch(`https://thumbnails.roblox.com/v1/assets?assetIds=${topItem.assetId}&size=150x150&format=Png&isCircular=false`);
    const thumbData = await thumbRes.json();
    const imageUrl = thumbData.data && thumbData.data[0] ? thumbData.data[0].imageUrl : "";

    res.json({
      TotalCount,
      TotalValue,
      MostExpensiveName: topItem.name,
      MostExpensiveImage: imageUrl
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch inventory" });
  }
});

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
