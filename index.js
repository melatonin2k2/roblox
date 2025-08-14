const express = require("express");
const fetch = require("node-fetch");

const app = express();
const PORT = 3000;

const INVENTORY_API = (userId, cursor = "") =>
  `https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?limit=100&cursor=${cursor}`;

async function getAllSellableItems(userId) {
  let items = [];
  let cursor = "";
  let hasMore = true;

  while (hasMore) {
    let attempt = 0;
    let success = false;
    let data;

    while (attempt < 3 && !success) { // retry up to 3 times
      try {
        const res = await fetch(INVENTORY_API(userId, cursor));
        data = await res.json();

        if (data.errors) {
          throw new Error(JSON.stringify(data.errors));
        }

        success = true;
      } catch (err) {
        attempt++;
        console.warn(`Failed to fetch page for userId ${userId}, attempt ${attempt}: ${err}`);
        await new Promise(r => setTimeout(r, 1000)); // 1s delay before retry
      }
    }

    if (!success) {
      console.error(`Skipping page for userId ${userId} after 3 failed attempts.`);
      break;
    }

    if (data.data) {
      const sellable = data.data.filter(item =>
        item.isLimited ||
        item.isLimitedUnique ||
        item.recentAveragePrice > 0 ||
        item.saleStatus === "Resellable" ||
        item.restrictions?.includes("Resellable")
      );
      items = items.concat(sellable);
    }

    if (data.nextPageCursor) {
      cursor = data.nextPageCursor;
      await new Promise(r => setTimeout(r, 500)); // slower to reduce rate limits
    } else {
      hasMore = false;
    }
  }

  return items;
}

async function fetchThumbnail(assetId) {
  try {
    const res = await fetch(
      `https://thumbnails.roblox.com/v1/assets?assetIds=${assetId}&size=150x150&format=Png&isCircular=false`
    );
    const data = await res.json();
    return data.data && data.data[0] ? data.data[0].imageUrl : "";
  } catch (err) {
    console.warn("Failed to fetch thumbnail for assetId", assetId, err);
    return "";
  }
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

    const TotalValue = items.reduce((sum, item) => sum + (item.recentAveragePrice || 0), 0);

    const topItem = items.reduce((prev, curr) =>
      (curr.recentAveragePrice || 0) > (prev.recentAveragePrice || 0) ? curr : prev
    , items[0]);

    const imageUrl = topItem ? await fetchThumbnail(topItem.assetId) : "";

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
