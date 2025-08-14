const express = require("express");
const fetch = require("node-fetch");

const app = express();
const PORT = 3000;

// Roblox API endpoints for different inventory categories
const INVENTORY_ENDPOINTS = {
  // Core inventory endpoints that actually work
  collectibles: (userId, cursor = "") => 
    `https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?limit=100&cursor=${cursor}`,
  
  // All asset types - this is the main one that gets most items
  allAssets: (userId, cursor = "") => 
    `https://inventory.roblox.com/v1/users/${userId}/assets?limit=100&cursor=${cursor}`,
  
  // Specific asset types to ensure we don't miss anything
  shirts: (userId, cursor = "") => 
    `https://inventory.roblox.com/v1/users/${userId}/assets?assetTypes=Shirt&limit=100&cursor=${cursor}`,
  pants: (userId, cursor = "") => 
    `https://inventory.roblox.com/v1/users/${userId}/assets?assetTypes=Pants&limit=100&cursor=${cursor}`,
  tshirts: (userId, cursor = "") => 
    `https://inventory.roblox.com/v1/users/${userId}/assets?assetTypes=TShirt&limit=100&cursor=${cursor}`,
  hats: (userId, cursor = "") => 
    `https://inventory.roblox.com/v1/users/${userId}/assets?assetTypes=Hat&limit=100&cursor=${cursor}`,
  accessories: (userId, cursor = "") => 
    `https://inventory.roblox.com/v1/users/${userId}/assets?assetTypes=Accessory&limit=100&cursor=${cursor}`,
  faces: (userId, cursor = "") => 
    `https://inventory.roblox.com/v1/users/${userId}/assets?assetTypes=Face&limit=100&cursor=${cursor}`,
  gear: (userId, cursor = "") => 
    `https://inventory.roblox.com/v1/users/${userId}/assets?assetTypes=Gear&limit=100&cursor=${cursor}`,
  badges: (userId, cursor = "") => 
    `https://inventory.roblox.com/v1/users/${userId}/assets?assetTypes=Badge&limit=100&cursor=${cursor}`,
  animations: (userId, cursor = "") => 
    `https://inventory.roblox.com/v1/users/${userId}/assets?assetTypes=Animation&limit=100&cursor=${cursor}`,
  decals: (userId, cursor = "") => 
    `https://inventory.roblox.com/v1/users/${userId}/assets?assetTypes=Decal&limit=100&cursor=${cursor}`,
  models: (userId, cursor = "") => 
    `https://inventory.roblox.com/v1/users/${userId}/assets?assetTypes=Model&limit=100&cursor=${cursor}`,
  places: (userId, cursor = "") => 
    `https://inventory.roblox.com/v1/users/${userId}/assets?assetTypes=Place&limit=100&cursor=${cursor}`,
  audio: (userId, cursor = "") => 
    `https://inventory.roblox.com/v1/users/${userId}/assets?assetTypes=Audio&limit=100&cursor=${cursor}`,
  meshes: (userId, cursor = "") => 
    `https://inventory.roblox.com/v1/users/${userId}/assets?assetTypes=MeshPart&limit=100&cursor=${cursor}`,
  plugins: (userId, cursor = "") => 
    `https://inventory.roblox.com/v1/users/${userId}/assets?assetTypes=Plugin&limit=100&cursor=${cursor}`,
  videos: (userId, cursor = "") => 
    `https://inventory.roblox.com/v1/users/${userId}/assets?assetTypes=Video&limit=100&cursor=${cursor}`,
  gamePasses: (userId, cursor = "") => 
    `https://inventory.roblox.com/v1/users/${userId}/assets?assetTypes=GamePass&limit=100&cursor=${cursor}`
};

// Fetch all pages from a Roblox API endpoint with better error handling
async function fetchAllPages(apiFunc, userId, category = "unknown") {
  let items = [];
  let cursor = "";
  let hasMore = true;
  let retryCount = 0;
  const maxRetries = 3;

  while (hasMore && retryCount < maxRetries) {
    try {
      const res = await fetch(apiFunc(userId, cursor));
      
      if (!res.ok) {
        if (res.status === 429) {
          // Rate limited, wait longer
          await new Promise(resolve => setTimeout(resolve, 1000));
          retryCount++;
          continue;
        }
        throw new Error(`HTTP ${res.status} for ${category}`);
      }
      
      const data = await res.json();

      if (data && data.data) {
        items = items.concat(data.data);
      }

      if (data.nextPageCursor) {
        cursor = data.nextPageCursor;
        await new Promise(resolve => setTimeout(resolve, 300)); // Increased throttle
      } else {
        hasMore = false;
      }
      
      retryCount = 0; // Reset retry count on success
    } catch (err) {
      console.warn(`Error fetching ${category} (attempt ${retryCount + 1}):`, err.message);
      retryCount++;
      if (retryCount >= maxRetries) {
        console.error(`Failed to fetch ${category} after ${maxRetries} attempts`);
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

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
            thumbnails[item.assetId] = item.imageUrl;
          });
        }
      }
      
      // Throttle between batches
      if (i + batchSize < assetIds.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    } catch (err) {
      console.warn(`Failed to fetch thumbnails for batch starting at ${i}:`, err.message);
    }
  }
  
  return thumbnails;
}

// Check if an item is sellable (Limited, Limited U, UGC, etc.)
function isSellable(item) {
  return (
    item.isLimited === true ||
    item.isLimitedUnique === true ||
    item.saleStatus === "ForSale" ||
    item.saleStatus === "Resellable" ||
    item.itemRestrictions?.includes("Limited") ||
    item.itemRestrictions?.includes("LimitedUnique") ||
    item.creatorType === "User" // UGC items
  );
}

// Get all items from player's inventory
async function getAllInventoryItems(userId) {
  console.log(`Fetching complete inventory for user ${userId}...`);
  
  const allItems = [];
  const fetchPromises = [];

  // First, get the main inventory endpoints that are most reliable
  const priorityEndpoints = ['collectibles', 'allAssets'];
  const specificEndpoints = Object.keys(INVENTORY_ENDPOINTS).filter(key => !priorityEndpoints.includes(key));

  // Fetch priority endpoints first
  for (const category of priorityEndpoints) {
    const apiFunc = INVENTORY_ENDPOINTS[category];
    fetchPromises.push(
      fetchAllPages(apiFunc, userId, category)
        .then(items => {
          console.log(`Fetched ${items.length} items from ${category}`);
          return items.map(item => ({ ...item, category }));
        })
        .catch(err => {
          console.warn(`Failed to fetch ${category}:`, err.message);
          return [];
        })
    );
  }

  // Then fetch specific asset type endpoints
  for (const category of specificEndpoints) {
    const apiFunc = INVENTORY_ENDPOINTS[category];
    fetchPromises.push(
      fetchAllPages(apiFunc, userId, category)
        .then(items => {
          console.log(`Fetched ${items.length} items from ${category}`);
          return items.map(item => ({ ...item, category }));
        })
        .catch(err => {
          console.warn(`Failed to fetch ${category}:`, err.message);
          return [];
        })
    );
  }

  let results = [];
  try {
    results = await Promise.all(fetchPromises);
  } catch (err) {
    console.error("Error fetching inventory items:", err);
  }

  // Flatten all results
  results.forEach(categoryItems => {
    if (Array.isArray(categoryItems)) {
      allItems.push(...categoryItems);
    }
  });

  // Remove duplicates based on assetId - keep the one with most information
  const uniqueItems = [];
  const itemMap = new Map();
  
  allItems.forEach(item => {
    const id = item.assetId || item.id;
    if (id) {
      const existing = itemMap.get(id);
      if (!existing || Object.keys(item).length > Object.keys(existing).length) {
        itemMap.set(id, {
          ...item,
          assetId: id // Normalize the ID field
        });
      }
    }
  });

  uniqueItems.push(...itemMap.values());

  console.log(`Total unique items found: ${uniqueItems.length}`);
  
  // Separate sellable items for value calculations
  const sellableItems = uniqueItems.filter(isSellable);
  console.log(`Sellable items found: ${sellableItems.length}`);

  // Fetch thumbnails for all items (not just sellable ones)
  const assetIds = uniqueItems.map(item => item.assetId).filter(id => id);
  const thumbnails = await fetchThumbnails(assetIds);

  // Enrich all items with thumbnails and sellable status
  const enrichedItems = uniqueItems.map(item => ({
    assetId: item.assetId,
    name: item.name || "Unknown Item",
    recentAveragePrice: item.recentAveragePrice || 0,
    isLimited: item.isLimited || false,
    isLimitedUnique: item.isLimitedUnique || false,
    saleStatus: item.saleStatus || "",
    category: item.category || "unknown",
    assetType: item.assetType || "Unknown",
    creatorType: item.creatorType || "Unknown",
    imageUrl: thumbnails[item.assetId] || "",
    isSellable: isSellable(item)
  }));

  return {
    allItems: enrichedItems,
    sellableItems: enrichedItems.filter(item => item.isSellable)
  };
}

// API endpoint with enhanced response
app.get("/inventory/:userId", async (req, res) => {
  const { userId } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const showOnlySellable = req.query.sellable === "true";

  try {
    const { allItems, sellableItems } = await getAllInventoryItems(userId);

    if (!allItems.length) {
      return res.json({
        UserId: userId,
        TotalItems: 0,
        SellableItems: 0,
        TotalValue: 0,
        MostExpensiveName: "N/A",
        MostExpensivePrice: 0,
        MostExpensiveImage: "",
        Page: page,
        Limit: limit,
        TotalPages: 0,
        ShowingOnlySellable: showOnlySellable,
        Items: []
      });
    }

    // Calculate values only for sellable items
    const totalValue = sellableItems.reduce(
      (sum, item) => sum + (item.recentAveragePrice || 0),
      0
    );

    // Find most expensive sellable item
    let mostExpensive = { name: "N/A", recentAveragePrice: 0, imageUrl: "", assetId: null };
    if (sellableItems.length > 0) {
      mostExpensive = sellableItems.reduce((prev, curr) =>
        (curr.recentAveragePrice || 0) > (prev.recentAveragePrice || 0) ? curr : prev
      );
    }

    // Convert most expensive item image to rbxassetid format
    const mostExpensiveImage = mostExpensive.assetId ? 
      `rbxassetid://${mostExpensive.assetId}` : "";

    // Choose which items to paginate based on query parameter
    const itemsToShow = showOnlySellable ? sellableItems : allItems;
    
    // Pagination
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginatedItems = itemsToShow.slice(start, end);
    const totalPages = Math.ceil(itemsToShow.length / limit);

    res.json({
      UserId: userId,
      TotalItems: allItems.length,
      SellableItems: sellableItems.length,
      TotalValue: Math.round(totalValue),
      MostExpensiveName: mostExpensive.name,
      MostExpensivePrice: mostExpensive.recentAveragePrice || 0,
      MostExpensiveImage: mostExpensiveImage,
      Page: page,
      Limit: limit,
      TotalPages: totalPages,
      ShowingOnlySellable: showOnlySellable,
      ItemsShown: paginatedItems.length,
      Categories: [...new Set(allItems.map(item => item.category))],
      Items: paginatedItems
    });
  } catch (err) {
    console.error("API Error:", err);
    res.status(500).json({
      error: "Failed to fetch inventory",
      UserId: userId,
      TotalItems: 0,
      SellableItems: 0,
      TotalValue: 0,
      MostExpensiveName: "N/A",
      MostExpensivePrice: 0,
      MostExpensiveImage: "",
      Page: page,
      Limit: limit,
      TotalPages: 0,
      ShowingOnlySellable: showOnlySellable,
      Items: []
    });
  }
});

// Additional endpoint to get only sellable items (for backward compatibility)
app.get("/sellable/:userId", async (req, res) => {
  const { userId } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;

  try {
    const { sellableItems } = await getAllInventoryItems(userId);
    
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginatedItems = sellableItems.slice(start, end);
    const totalPages = Math.ceil(sellableItems.length / limit);

    res.json({
      TotalCount: sellableItems.length,
      Page: page,
      Limit: limit,
      TotalPages: totalPages,
      Items: paginatedItems
    });
  } catch (err) {
    console.error("Sellable API Error:", err);
    res.status(500).json({
      error: "Failed to fetch sellable items",
      TotalCount: 0,
      Items: []
    });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Enhanced Roblox Inventory API running on http://localhost:${PORT}`);
  console.log(`Endpoints:`);
  console.log(`  GET /inventory/:userId - Get all inventory items`);
  console.log(`  GET /inventory/:userId?sellable=true - Get only sellable items`);
  console.log(`  GET /sellable/:userId - Get sellable items (legacy endpoint)`);
  console.log(`  GET /health - Health check`);
});
