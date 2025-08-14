const express = require("express");
const fetch = require("node-fetch");

const app = express();
const PORT = 3000;

// Roblox API endpoints using proxy service - these actually work!
const INVENTORY_ENDPOINTS = {
  // Check if inventory is viewable first
  canView: (userId) => 
    `https://inventory.roproxy.com/v1/users/${userId}/can-view-inventory`,
    
  // Main collectibles endpoint (most reliable for limiteds)
  collectibles: (userId, cursor = "") => 
    `https://inventory.roproxy.com/v1/users/${userId}/assets/collectibles?limit=100&cursor=${cursor}`,
  
  // V2 inventory endpoints for different asset types - these work with roproxy
  shirts: (userId, cursor = "") => 
    `https://inventory.roproxy.com/v2/users/${userId}/inventory?assetTypes=Shirt&limit=100&sortOrder=Asc&cursor=${cursor}`,
  pants: (userId, cursor = "") => 
    `https://inventory.roproxy.com/v2/users/${userId}/inventory?assetTypes=Pants&limit=100&sortOrder=Asc&cursor=${cursor}`,
  tshirts: (userId, cursor = "") => 
    `https://inventory.roproxy.com/v2/users/${userId}/inventory?assetTypes=TShirt&limit=100&sortOrder=Asc&cursor=${cursor}`,
  hats: (userId, cursor = "") => 
    `https://inventory.roproxy.com/v2/users/${userId}/inventory?assetTypes=Hat&limit=100&sortOrder=Asc&cursor=${cursor}`,
  accessories: (userId, cursor = "") => 
    `https://inventory.roproxy.com/v2/users/${userId}/inventory?assetTypes=Accessory&limit=100&sortOrder=Asc&cursor=${cursor}`,
  faces: (userId, cursor = "") => 
    `https://inventory.roproxy.com/v2/users/${userId}/inventory?assetTypes=Face&limit=100&sortOrder=Asc&cursor=${cursor}`,
  gear: (userId, cursor = "") => 
    `https://inventory.roproxy.com/v2/users/${userId}/inventory?assetTypes=Gear&limit=100&sortOrder=Asc&cursor=${cursor}`,
  hair: (userId, cursor = "") => 
    `https://inventory.roproxy.com/v2/users/${userId}/inventory?assetTypes=Hair&limit=100&sortOrder=Asc&cursor=${cursor}`,
  animations: (userId, cursor = "") => 
    `https://inventory.roproxy.com/v2/users/${userId}/inventory?assetTypes=Animation&limit=100&sortOrder=Asc&cursor=${cursor}`,
  decals: (userId, cursor = "") => 
    `https://inventory.roproxy.com/v2/users/${userId}/inventory?assetTypes=Decal&limit=100&sortOrder=Asc&cursor=${cursor}`,
  models: (userId, cursor = "") => 
    `https://inventory.roproxy.com/v2/users/${userId}/inventory?assetTypes=Model&limit=100&sortOrder=Asc&cursor=${cursor}`,
  audio: (userId, cursor = "") => 
    `https://inventory.roproxy.com/v2/users/${userId}/inventory?assetTypes=Audio&limit=100&sortOrder=Asc&cursor=${cursor}`,
  meshes: (userId, cursor = "") => 
    `https://inventory.roproxy.com/v2/users/${userId}/inventory?assetTypes=MeshPart&limit=100&sortOrder=Asc&cursor=${cursor}`,
  plugins: (userId, cursor = "") => 
    `https://inventory.roproxy.com/v2/users/${userId}/inventory?assetTypes=Plugin&limit=100&sortOrder=Asc&cursor=${cursor}`,
  videos: (userId, cursor = "") => 
    `https://inventory.roproxy.com/v2/users/${userId}/inventory?assetTypes=Video&limit=100&sortOrder=Asc&cursor=${cursor}`,
  gamePasses: (userId, cursor = "") => 
    `https://inventory.roproxy.com/v2/users/${userId}/inventory?assetTypes=GamePass&limit=100&sortOrder=Asc&cursor=${cursor}`
};

// Fetch all pages from a Roblox API endpoint with better error handling
async function fetchAllPages(apiFunc, userId, category = "unknown") {
  let items = [];
  let cursor = "";
  let hasMore = true;
  let retryCount = 0;
  const maxRetries = 2; // Reduced retries since we're using working endpoints
  let page = 1;

  while (hasMore && retryCount < maxRetries && page <= 10) { // Limit pages to prevent infinite loops
    try {
      const url = apiFunc(userId, cursor);
      const res = await fetch(url);
      
      if (!res.ok) {
        if (res.status === 429) {
          // Rate limited, wait longer
          console.log(`Rate limited for ${category}, waiting...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          retryCount++;
          continue;
        }
        if (res.status === 403) {
          console.log(`Inventory not public for ${category}`);
          break; // Inventory is private, not an error
        }
        throw new Error(`HTTP ${res.status} for ${category}`);
      }
      
      const data = await res.json();

      // Handle different response structures
      let pageData = [];
      if (data && data.data) {
        pageData = data.data;
      } else if (Array.isArray(data)) {
        pageData = data;
      }

      if (pageData.length > 0) {
        items = items.concat(pageData);
      }

      // Check for pagination - different APIs use different cursor fields
      const nextCursor = data.nextPageCursor || data.nextCursor || null;
      if (nextCursor && pageData.length === 100) { // Only continue if we got a full page
        cursor = nextCursor;
        await new Promise(resolve => setTimeout(resolve, 500)); // Increased throttle
        page++;
      } else {
        hasMore = false;
      }
      
      retryCount = 0; // Reset retry count on success
    } catch (err) {
      console.warn(`Error fetching ${category} page ${page} (attempt ${retryCount + 1}):`, err.message);
      retryCount++;
      if (retryCount >= maxRetries) {
        console.error(`Failed to fetch ${category} after ${maxRetries} attempts`);
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 1500));
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
  // Check various fields that indicate sellability
  const sellableConditions = [
    item.isLimited === true,
    item.isLimitedUnique === true,
    item.saleStatus === "ForSale",
    item.saleStatus === "Resellable", 
    item.itemRestrictions && item.itemRestrictions.includes("Limited"),
    item.itemRestrictions && item.itemRestrictions.includes("LimitedUnique"),
    item.creatorType === "User", // UGC items
    item.creatorType === "Group", // Group UGC items
    item.price && item.price > 0, // Has a price
    item.priceInRobux && item.priceInRobux > 0, // Has robux price
    item.recentAveragePrice && item.recentAveragePrice > 0 // Has market value
  ];
  
  return sellableConditions.some(condition => condition === true);
}

// Check if user's inventory is public - with better fallback logic
async function checkInventoryVisibility(userId) {
  try {
    const res = await fetch(INVENTORY_ENDPOINTS.canView(userId));
    if (res.ok) {
      const data = await res.json();
      return data.canView === true;
    }
  } catch (err) {
    console.warn(`Could not check inventory visibility for ${userId}:`, err.message);
  }
  
  // If we can't check visibility, assume it's viewable and let the actual fetching determine
  console.log(`Assuming inventory is viewable for ${userId} - will verify during fetch`);
  return true;
}

// Get all items from player's inventory
async function getAllInventoryItems(userId) {
  console.log(`Fetching complete inventory for user ${userId}...`);
  
  const allItems = [];
  const fetchPromises = [];

  // Skip the canView check since it's unreliable - let actual fetching determine privacy
  // If inventory is truly private, the fetch requests will fail appropriately

  // Get the endpoints (excluding canView)
  const endpoints = Object.entries(INVENTORY_ENDPOINTS).filter(([key]) => key !== 'canView');
  
  // Fetch from all inventory endpoints with error handling
  for (const [category, apiFunc] of endpoints) {
    fetchPromises.push(
      fetchAllPages(apiFunc, userId, category)
        .then(items => {
          if (items.length > 0) {
            console.log(`Fetched ${items.length} items from ${category}`);
          }
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

  // Check if we got any items at all - if not, inventory might be private
  const isActuallyPrivate = allItems.length === 0;

  if (isActuallyPrivate) {
    console.log(`No items fetched for user ${userId} - inventory appears to be private`);
    return {
      allItems: [],
      sellableItems: [],
      isPrivate: true
    };
  }

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

  // Log some sample items to debug sellability detection
  if (sellableItems.length === 0 && uniqueItems.length > 0) {
    console.log("No sellable items detected. Sample items:");
    uniqueItems.slice(0, 3).forEach((item, i) => {
      console.log(`Item ${i + 1}:`, {
        name: item.name,
        assetType: item.assetType,
        creatorType: item.creatorType,
        isLimited: item.isLimited,
        saleStatus: item.saleStatus,
        price: item.price,
        recentAveragePrice: item.recentAveragePrice
      });
    });
  }

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
    price: item.price || 0,
    imageUrl: thumbnails[item.assetId] || "",
    isSellable: isSellable(item)
  }));

  return {
    allItems: enrichedItems,
    sellableItems: enrichedItems.filter(item => item.isSellable),
    isPrivate: false
  };
}

// API endpoint with enhanced response
app.get("/inventory/:userId", async (req, res) => {
  const { userId } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const showOnlySellable = req.query.sellable === "true";

  try {
    const { allItems, sellableItems, isPrivate } = await getAllInventoryItems(userId);

    if (isPrivate) {
      return res.json({
        UserId: userId,
        InventoryStatus: "Private",
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

    if (!allItems.length) {
      return res.json({
        UserId: userId,
        InventoryStatus: "Empty",
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
      InventoryStatus: "Public",
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
