const express = require("express");
const fetch = require("node-fetch");

const app = express();
const PORT = 3000;

// Roblox collectibles API
const INVENTORY_API = (userId, cursor = "") =>
  `https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?limit=100&cursor=${cursor}`;

// Fetch all limited/resellable items with pagination
async function getAllSellableItems(userId) {
  let items = [];
  let cursor = "";
  let hasMore = true;

  try {
    while (hasMore) {
      const res = await fetch(INVENTORY_API(userId, cursor));
      const data = await res.json();

      if (data && data.data) {
        // Only include limited and limited unique items
        const sellable = data.data.filter(item =>
          item.isLimited || item.isLimitedUnique
        );

        items = items.concat(sellable);
      }

      if (data.nextPageCursor) {
        cursor = data.nextPageCursor;
        // Small delay to reduce request rate
        await new Promise(resolve => setTimeout(resolve, 200));
      } else {
        hasMore = false;
      }
    }
  } catch (err) {
    console.error(`Failed to fetch inventory for userId ${userId}:`, err);
    // Return empty array if fetch fails
    return [];
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
        MostExpensiveName: "N/A",
        MostExpensiveImage: ""
      });
    }

    // Total value of all limited items
    const TotalValue = items.reduce((sum, item) => sum + (item.recentAveragePrice || 0), 0);

    // Find the most expensive item
    let topItem = items.reduce((prev, curr) => {
      return (curr.recentAveragePrice || 0) > (prev.recentAveragePrice || 0) ? curr : prev;
    }, items[0]);

    // Fetch thumbnail for top item
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
