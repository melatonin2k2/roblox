const express = require("express");
const fetch = require("node-fetch");

const app = express();
const PORT = 3000;

// Roblox API endpoints
const COLLECTIBLES_API = (userId, cursor = "") =>
  `https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?limit=100&cursor=${cursor}`;
const ASSETS_API = (userId, cursor = "") =>
  `https://inventory.roblox.com/v1/users/${userId}/assets?limit=100&cursor=${cursor}`;

// Fetch all pages from a Roblox API endpoint with better error handling and throttling
async function fetchAllPages(apiFunc, userId) {
  let items = [];
  let cursor = "";
  let hasMore = true;
  let retries = 0;
  const maxRetries = 3;

  while (hasMore && retries < maxRetries) {
    try {
      console.log(`Fetching page with cursor: ${cursor}`);
      const res = await fetch(apiFunc(userId, cursor));
      
      if (!res.ok) {
        if (res.status === 429) {
          // Rate limited - wait longer
          console.log("Rate limited, waiting 2 seconds...");
          await new Promise(resolve => setTimeout(resolve, 2000));
          retries++;
          continue;
        }
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      
      const data = await res.json();
      console.log(`Received ${data.data ? data.data.length : 0} items`);

      if (data && data.data && data.data.length > 0) {
        items = items.concat(data.data);
      }

      if (data.nextPageCursor) {
        cursor = data.nextPageCursor;
        // Increased throttling to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 500));
        retries = 0; // Reset retries on successful request
      } else {
        hasMore = false;
      }
    } catch (error) {
      console.error(`Error fetching page: ${error.message}`);
      retries++;
      if (retries >= maxRetries) {
        console.error(`Max retries reached, stopping fetch for this endpoint`);
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log(`Total items fetched: ${items.length}`);
  return items;
}

// Fetch thumbnails for multiple assets in batches
async function fetchThumbnails(assetIds) {
  if (!assetIds.length) return {};
  
  const thumbnails = {};
  const batchSize = 100; // Roblox API limit
  
  for (let i = 0; i < assetIds.length; i += batchSize) {
    const batch = assetIds.slice(i, i + batchSize);
    
    try {
      const res = await fetch(
        `https://thumbnails.roblox.com/v1/assets?assetIds=${batch.join(",")}&size=150x150&format=Png&isCircular=false`
      );
      
      if (res.ok) {
        const data = await res.json();
        if (data.data) {
          data.data.forEach(item => {
            if (item.imageUrl) {
              thumbnails[item.assetId] = item.imageUrl;
            }
          });
        }
      }
      
      // Throttle between thumbnail batches
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (error) {
      console.error(`Error fetching thumbnails for batch: ${error.message}`);
    }
  }
  
  return thumbnails;
}

// Get all sellable items with improved filtering
async function getSellableItems(userId) {
  try {
    console.log(`Fetching inventory for user ${userId}...`);
    
    // Fetch both collectibles and regular assets
    const [collectibles, assets] = await Promise.all([
      fetchAllPages(COLLECTIBLES_API, userId),
      fetchAllPages(ASSETS_API, userId)
    ]);
    
    console.log(`Collectibles: ${collectibles.length}, Assets: ${assets.length}`);
    const allItems = [...collectibles, ...assets];
    console.log(`Total items: ${allItems.length}`);

    // More comprehensive filtering for sellable items
    const sellableItems = allItems.filter(item => {
      // Check if item is limited or limited unique
      const isLimited = item.isLimited === true || item.isLimitedUnique === true;
      
      // Check sale status
      const canBeSold = item.saleStatus === "ForSale" || 
                       item.saleStatus === "Resellable" ||
                       item.saleStatus === "OnSale";
      
      // Check if it has a recent average price (indicates it's tradeable/sellable)
      const hasValue = item.recentAveragePrice && item.recentAveragePrice > 0;
      
      // Item is sellable if it's limited OR can be sold OR has value
      return isLimited || canBeSold || hasValue;
    });

    console.log(`Sellable items found: ${sellableItems.length}`);

    // Remove duplicates based on assetId
    const uniqueSellableItems = sellableItems.reduce((acc, item) => {
      if (!acc.some(existing => existing.assetId === item.assetId)) {
        acc.push(item);
      }
      return acc;
    }, []);

    console.log(`Unique sellable items: ${uniqueSellableItems.length}`);

    const assetIds = uniqueSellableItems.map(item => item.assetId);
    const thumbnails = await fetchThumbnails(assetIds);

    return uniqueSellableItems.map(item => ({
      assetId: item.assetId,
      name: item.name || "Unknown Item",
      recentAveragePrice: item.recentAveragePrice || 0,
      isLimited: item.isLimited || false,
      isLimitedUnique: item.isLimitedUnique || false,
      saleStatus: item.saleStatus || "Unknown",
      assetType: item.assetType || {},
      created: item.created,
      updated: item.updated,
      imageUrl: thumbnails[item.assetId] || ""
    }));
  } catch (err) {
    console.error(`Failed to fetch inventory for userId ${userId}:`, err);
    return [];
  }
}

// API endpoint with pagination and better response structure
app.get("/inventory/:userId", async (req, res) => {
  const { userId } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const sortBy = req.query.sortBy || "value"; // value, name, created

  try {
    console.log(`Processing request for user ${userId}`);
    const sellableItems = await getSellableItems(userId);

    if (!sellableItems.length) {
      return res.json({
        success: true,
        message: "No sellable items found",
        TotalCount: 0,
        TotalValue: 0,
        MostExpensiveName: "N/A",
        MostExpensiveImage: "",
        MostExpensiveValue: 0,
        Page: page,
        Limit: limit,
        TotalPages: 0,
        Items: []
      });
    }

    // Calculate total value (only count items with actual prices)
    const itemsWithValue = sellableItems.filter(item => item.recentAveragePrice > 0);
    const TotalValue = itemsWithValue.reduce(
      (sum, item) => sum + item.recentAveragePrice,
      0
    );

    // Find most expensive item
    const topItem = sellableItems.reduce((prev, curr) => {
      const prevPrice = prev.recentAveragePrice || 0;
      const currPrice = curr.recentAveragePrice || 0;
      return currPrice > prevPrice ? curr : prev;
    }, sellableItems[0]);

    // Sort items based on sortBy parameter
    let sortedItems = [...sellableItems];
    switch (sortBy) {
      case "value":
        sortedItems.sort((a, b) => (b.recentAveragePrice || 0) - (a.recentAveragePrice || 0));
        break;
      case "name":
        sortedItems.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        break;
      case "created":
        sortedItems.sort((a, b) => new Date(b.created || 0) - new Date(a.created || 0));
        break;
      default:
        sortedItems.sort((a, b) => (b.recentAveragePrice || 0) - (a.recentAveragePrice || 0));
    }

    // Pagination
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginatedItems = sortedItems.slice(start, end);
    const totalPages = Math.ceil(sellableItems.length / limit);

    res.json({
      success: true,
      message: "Inventory fetched successfully",
      TotalCount: sellableItems.length,
      TotalValue: Math.round(TotalValue),
      ItemsWithValue: itemsWithValue.length,
      MostExpensiveName: topItem.name,
      MostExpensiveImage: topItem.imageUrl,
      MostExpensiveValue: topItem.recentAveragePrice || 0,
      Page: page,
      Limit: limit,
      TotalPages: totalPages,
      SortBy: sortBy,
      Items: paginatedItems
    });
  } catch (err) {
    console.error("API Error:", err);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: err.message,
      TotalCount: 0,
      TotalValue: 0,
      MostExpensiveName: "N/A",
      MostExpensiveImage: "",
      MostExpensiveValue: 0,
      Page: page,
      Limit: limit,
      TotalPages: 0,
      Items: []
    });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Example usage: http://localhost:${PORT}/inventory/123456789?page=1&limit=50&sortBy=value`);
});
