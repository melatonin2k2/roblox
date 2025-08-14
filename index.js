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

  try {
    while (hasMore) {
      const res = await fetch(INVENTORY_API(userId, cursor), {
        headers: { "User-Agent": "Mozilla/5.0" }
      });
      if (!res.ok) {
        console.error(`Error fetching page for ${userId}: ${res.status} ${res.statusText}`);
        break;
      }

      const data = await res.json();
      if (data && data.data) {
        // Include all items for now; filter later if needed
        items = items.concat(data.data);
      }

      if (data.nextPageCursor) {
        cursor = data.nextPageCursor;
        await new Promise(r => setTimeout(r, 250)); // short delay to avoid rate-limit
      } else {
        hasMore = false;
      }
    }
  } catch (err) {
    console.error(`Failed to fetch inventory for userId ${userId}:`, err);
  }

  return items;
}

app.get("/inventory/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    const items = await getAllSellableItems(userId);

    // Calculate total value (ignore items without recentAveragePrice)
    const TotalValue = items.reduce((sum, item) => sum + (item.recentAveragePrice ?? 0), 0);

    // Most expensive item
    const topItem = items.reduce((prev, curr) => {
      const prevPrice = prev?.recentAveragePrice ?? 0;
      const currPrice = curr?.recentAveragePrice ?? 0;
      return currPrice > prevPrice ? curr : prev;
    }, null);

    let imageUrl = "";
    if (topItem) {
      const thumbRes = await fetch(
        `https://thumbnails.roblox.com/v1/assets?assetIds=${topItem.assetId}&size=150x150&format=Png&isCircular=false`,
        { headers: { "User-Agent": "Mozilla/5.0" } }
      );
      const thumbData = await thumbRes.json();
      imageUrl = thumbData.data?.[0]?.imageUrl ?? "";
    }

    console.log(`UserId ${userId} - TotalCount: ${items.length}, TotalValue: ${TotalValue}`);

    res.json({
      TotalCount: items.length,
      TotalValue,
      MostExpensiveName: topItem?.name ?? "N/A",
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
