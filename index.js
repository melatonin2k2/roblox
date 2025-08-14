const express = require("express");
const fetch = require("node-fetch");

const app = express();
const PORT = 3000;

// Roblox Inventory API
const INVENTORY_API = (userId, cursor = "") =>
  `https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?limit=100&cursor=${cursor}`;

// Fetch all sellable items (limited, limited unique, or resellable)
async function getAllSellableItems(userId) {
  let items = [];
  let cursor = "";
  let hasMore = true;

  try {
    while (hasMore) {
      const res = await fetch(INVENTORY_API(userId, cursor));
      const data = await res.json();

      if (data && data.data) {
        const sellable = data.data.filter(item =>
          item.isLimited ||
          item.isLimitedUnique ||
          item.saleStatus === "Resellable" ||
          (item.recentAveragePrice && item.recentAveragePrice > 0)
        );
        items = items.concat(sellable);
      }

      if (data.nextPageCursor) {
        cursor = data.nextPageCursor;
        await new Promise(resolve => setTimeout(resolve, 250)); // slow requests
      } else {
        hasMore = false;
      }
    }
  } catch (err) {
    console.error(`Failed to fetch inventory for userId ${userId}:`, err);
    return [];
  }

  return items;
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
        MostExpensiveImage: ""
      });
    }

    const TotalValue = items.reduce((sum, item) => sum + (item.recentAveragePrice || 0), 0);

    let topItem = items.reduce((prev, curr) =>
      (curr.recentAveragePrice || 0) > (prev.recentAveragePrice || 0) ? curr : prev
    , items[0]);

    let imageUrl = "";
    if (topItem) {
      const thumbRes = await fetch(
        `https://thumbnails.roblox.com/v1/assets?assetIds=${topItem.assetId}&size=150x150&format=Png&isCircular=false`
      );
      const thumbData = await thumbRes.json();
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
