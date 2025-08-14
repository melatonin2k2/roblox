const express = require("express");
const fetch = require("node-fetch");

const app = express();
const PORT = 3000;

// Roblox collectibles API
const INVENTORY_API = (userId, cursor = "") =>
  `https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?limit=100&cursor=${cursor}`;

// Catalog resale API
const CATALOG_API = (assetId) =>
  `https://catalog.roblox.com/v1/assets/${assetId}/resale-data`;

async function getItemPrice(assetId) {
  try {
    const res = await fetch(CATALOG_API(assetId));
    const data = await res.json();
    return data?.recentAveragePrice || 0;
  } catch (err) {
    console.error(`Failed to fetch price for asset ${assetId}:`, err);
    return 0;
  }
}

async function getAllSellableItems(userId) {
  let items = [];
  let cursor = "";
  let hasMore = true;

  try {
    while (hasMore) {
      const res = await fetch(INVENTORY_API(userId, cursor));
      const data = await res.json();

      if (data?.data) {
        const sellable = data.data.filter(item =>
          item.isLimited || item.isLimitedUnique || item.restrictions?.includes("Resellable")
        );

        items = items.concat(sellable);
      }

      cursor = data.nextPageCursor || "";
      if (!cursor) hasMore = false;
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

    let totalValue = 0;

    // Fetch price for each item
    for (const item of items) {
      let price = item.recentAveragePrice;
      if (price === undefined || price === null) {
        price = await getItemPrice(item.assetId);
      }
      item.value = price; // store for top item
      totalValue += price;
    }

    // Determine most expensive item
    let topItem = items.reduce((prev, curr) =>
      (curr.value || 0) > (prev.value || 0) ? curr : prev,
      items[0] || null
    );

    let imageUrl = "";
    if (topItem) {
      const thumbRes = await fetch(
        `https://thumbnails.roblox.com/v1/assets?assetIds=${topItem.assetId}&size=150x150&format=Png&isCircular=false`
      );
      const thumbData = await thumbRes.json();
      imageUrl = thumbData.data?.[0]?.imageUrl || "";
    }

    res.json({
      TotalCount: items.length,
      TotalValue: totalValue,
      MostExpensiveName: topItem?.name || "N/A",
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
