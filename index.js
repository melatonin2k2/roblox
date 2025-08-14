const express = require("express");
const fetch = require("node-fetch");

const app = express();
const PORT = 3000;

// Roblox API URLs
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
      // Filter to only Limiteds / LimitedU and anything marked as resellable
      const sellable = data.data.filter(item =>
        item.assetTypeId === 11 || // Limited hat
        item.assetTypeId === 19 || // Limited gear
        item.assetTypeId === 18 || // Limited face
        item.assetTypeId === 8  || // Limited head accessory
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

app.get("/playerValue/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    const items = await getAllSellableItems(userId);

    // Get prices for each item
    const pricedItems = await Promise.all(items.map(async (item) => {
      // Thumbnail image
      const thumbRes = await fetch(`https://thumbnails.roblox.com/v1/assets?assetIds=${item.assetId}&size=150x150&format=Png&isCircular=false`);
      const thumbData = await thumbRes.json();
      const imageUrl = thumbData.data && thumbData.data[0] ? thumbData.data[0].imageUrl : "";

      return {
        name: item.name,
        price: item.recentAveragePrice || 0,
        image: imageUrl
      };
    }));

    // Sort highest price first
    pricedItems.sort((a, b) => b.price - a.price);

    // Calculate total value
    const totalValue = pricedItems.reduce((sum, item) => sum + (item.price || 0), 0);

    res.json({
      totalValue,
      items: pricedItems
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch player data" });
  }
});

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
