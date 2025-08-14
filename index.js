const express = require("express");
const fetch = require("node-fetch");

const app = express();
const PORT = 3000;

// Roblox Inventory API
const INVENTORY_API = (userId, cursor = "") =>
  `https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?limit=100&cursor=${cursor}`;

async function getAllItems(userId) {
  let items = [];
  let cursor = "";
  let hasMore = true;

  try {
    while (hasMore) {
      const res = await fetch(INVENTORY_API(userId, cursor));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (data && data.data) {
        // Collect all items; do not filter yet
        items = items.concat(data.data);
      }

      if (data.nextPageCursor) {
        cursor = data.nextPageCursor;
        // Optional: slow down requests to avoid rate limit
        await new Promise(r => setTimeout(r, 200));
      } else {
        hasMore = false;
      }
    }
  } catch (err) {
    console.error(`Failed to fetch inventory for userId ${userId}:`, err);
    throw err; // Let the API caller handle retries
  }

  return items;
}

// Helper: compute total value and top item
async function computeInventoryValue(items) {
  const sellableItems = items.filter(item =>
    item.isLimited || item.isLimitedUnique || item.restrictions?.includes("Resellable")
  );

  const TotalValue = sellableItems.reduce(
    (sum, item) => sum + (item.recentAveragePrice || 0),
    0
  );

  let topItem = sellableItems.reduce(
    (prev, curr) => (curr.recentAveragePrice || 0) > (prev.recentAveragePrice || 0) ? curr : prev,
    sellableItems[0] || null
  );

  let imageUrl = "";
  if (topItem) {
    const thumbRes = await fetch(
      `https://thumbnails.roblox.com/v1/assets?assetIds=${topItem.assetId}&size=150x150&format=Png&isCircular=false`
    );
    const thumbData = await thumbRes.json();
    imageUrl = thumbData.data && thumbData.data[0] ? thumbData.data[0].imageUrl : "";
  }

  return {
    TotalCount: sellableItems.length,
    TotalValue,
    MostExpensiveName: topItem ? topItem.name : "N/A",
    MostExpensiveImage: imageUrl
  };
}

app.get("/inventory/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    const items = await getAllItems(userId);

    if (!items.length) {
      return res.json({
        TotalCount: 0,
        TotalValue: 0,
        MostExpensiveName: "N/A",
        MostExpensiveImage: ""
      });
    }

    const inventoryValue = await computeInventoryValue(items);
    res.json(inventoryValue);
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
