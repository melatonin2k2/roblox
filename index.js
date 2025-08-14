const express = require("express");
const fetch = require("node-fetch");

const app = express();
const PORT = 3000;

// Working Roblox API endpoints
const COLLECTIBLES_API = (userId, cursor = "") =>
  `https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?limit=100&cursor=${cursor}`;

// V2 Inventory API with asset type IDs
const INVENTORY_V2_API = (userId, assetTypeId, cursor = "") =>
  `https://inventory.roblox.com/v2/users/${userId}/inventory/${assetTypeId}?limit=100&cursor=${cursor}`;

// Asset Type IDs for different categories that commonly contain Limited items
const ASSET_TYPES = {
  "Hat": 8,
  "TShirt": 2,
  "Shirt": 11,
  "Pants": 12,
  "Decal": 13,
  "Head": 17,
  "Face": 18,
  "Gear": 19,
  "Package": 32,
  "Hair": 41,
  "FaceAccessory": 42,
  "NeckAccessory": 43,
  "ShoulderAccessory": 44,
  "FrontAccessory": 45,
  "BackAccessory": 46,
  "WaistAccessory": 47,
  "HairAccessory": 41,
  "Audio": 3,
  "Mesh": 40,
  "Animation": 24,
  "Model": 10
};

// Fetch all pages from API with retry logic
async function fetchAllPages(apiFunc, userId, assetTypeId = null) {
  let items = [];
  let cursor = "";
  let hasMore = true;
  let retries = 0;
  const maxRetries = 3;
  const baseDelay = 600; // Increased delay

  while (hasMore && retries < maxRetries) {
    try {
      const url = assetTypeId ? apiFunc(userId, assetTypeId, cursor) : apiFunc(userId, cursor);
      console.log(`Fetching ${assetTypeId ? `AssetType ${assetTypeId}` : 'Collectibles'}...`);
      
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (!res.ok) {
        if (res.status === 429) {
          const delay = baseDelay * Math.pow(2, retries);
          console.log(`Rate limited, waiting ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          retries++;
          continue;
        } else if (res.status === 403) {
          console.log(`Access forbidden (inventory may be private)`);
          break;
        } else if (res.status === 404) {
          console.log(`Endpoint not found or no items for this asset type`);
          break;
        }
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      
      const data = await res.json();
      const itemCount = data.data ? data.data.length : 0;
      console.log(`  → Found ${itemCount} items`);

      if (data && data.data && data.data.length > 0) {
        // Add metadata to track source
        const itemsWithSource = data.data.map(item => ({
          ...item,
          _source: assetTypeId ? `assetType_${assetTypeId}` : 'collectibles',
          _assetTypeName: assetTypeId ? Object.keys(ASSET_TYPES).find(key => ASSET_TYPES[key] === assetTypeId) : 'collectible'
        }));
        items = items.concat(itemsWithSource);
      }

      // Handle pagination
      if (data.nextPageCursor) {
        cursor = data.nextPageCursor;
        await new Promise(resolve => setTimeout(resolve, baseDelay));
        retries = 0; // Reset retries on successful request
      } else {
        hasMore = false;
      }
    } catch (error) {
      console.error(`  Error: ${error.message}`);
      retries++;
      if (retries >= maxRetries) {
        console.error(`  Max retries reached`);
        break;
      }
      await new Promise(resolve => setTimeout(resolve, baseDelay * retries));
    }
  }

  console.log(`  Total from this endpoint: ${items.length}`);
  return items;
}

// Fetch comprehensive inventory data
async function getComprehensiveInventory(userId) {
  try {
    console.log(`\n=== Fetching inventory for user ${userId} ===`);
    
    let allItems = [];
    
    // 1. Fetch collectibles (this is working)
    console.log("\n1. Fetching Collectibles...");
    const collectibles = await fetchAllPages(COLLECTIBLES_API, userId);
    allItems = allItems.concat(collectibles);
    
    // 2. Fetch from V2 inventory API for key asset types
    console.log("\n2. Fetching from V2 Inventory API...");
    const priorityAssetTypes = ["Hat", "Gear", "Face", "Hair", "Package", "TShirt", "Shirt", "Pants"];
    
    for (const assetTypeName of priorityAssetTypes) {
      const assetTypeId = ASSET_TYPES[assetTypeName];
      try {
        console.log(`\nFetching ${assetTypeName} (ID: ${assetTypeId})...`);
        const items = await fetchAllPages(INVENTORY_V2_API, userId, assetTypeId);
        allItems = allItems.concat(items);
        
        // Be gentle with rate limiting
        await new Promise(resolve => setTimeout(resolve, 700));
      } catch (error) {
        console.error(`Failed to fetch ${assetTypeName}: ${error.message}`);
      }
    }
    
    console.log(`\n=== Summary ===`);
    console.log(`Total items collected: ${allItems.length}`);
    
    // Remove duplicates based on assetId/id
    const uniqueItems = [];
    const seenIds = new Set();
    
    for (const item of allItems) {
      const id = item.assetId || item.id;
      if (id && !seenIds.has(id)) {
        seenIds.add(id);
        uniqueItems.push({
          ...item,
          assetId: id
        });
      }
    }
    
    console.log(`Unique items after deduplication: ${uniqueItems.length}`);
    
    // Log breakdown by source
    const sourceBreakdown = {};
    uniqueItems.forEach(item => {
      const source = item._source || 'unknown';
      sourceBreakdown[source] = (sourceBreakdown[source] || 0) + 1;
    });
    console.log('Source breakdown:', sourceBreakdown);
    
    // Enhanced filtering for sellable/valuable items
    const sellableItems = uniqueItems.filter(item => {
      // Check for Limited status
      const isLimited = item.isLimited === true || item.isLimitedUnique === true;
      
      // Check for value indicators
      const hasValue = (item.recentAveragePrice && item.recentAveragePrice > 0) ||
                      (item.price && item.price > 0);
      
      // Check sale status
      const canBeSold = item.saleStatus === "ForSale" || 
                       item.saleStatus === "Resellable" ||
                       item.saleStatus === "OnSale";
      
      // Items from collectibles endpoint are likely valuable
      const isFromCollectibles = item._source === 'collectibles';
      
      // Include if any condition is met
      return isLimited || hasValue || canBeSold || isFromCollectibles;
    });
    
    console.log(`Sellable items after filtering: ${sellableItems.length}`);
    
    // Get thumbnails for sellable items
    const assetIds = sellableItems.map(item => item.assetId);
    console.log(`\nFetching thumbnails for ${assetIds.length} items...`);
    const thumbnails = await fetchThumbnails(assetIds);
    
    // Get additional catalog details for better pricing
    console.log(`Fetching catalog details...`);
    const catalogDetails = await fetchCatalogDetails(assetIds.slice(0, 50)); // Limit to avoid rate limits
    
    // Enrich and return final data
    return sellableItems.map(item => {
      const catalogInfo = catalogDetails[item.assetId] || {};
      
      // Use the best available price
      let price = item.recentAveragePrice || item.price || 0;
      if (catalogInfo.lowestPrice && catalogInfo.lowestPrice > price) {
        price = catalogInfo.lowestPrice;
      }
      
      return {
        assetId: item.assetId,
        name: item.name || catalogInfo.name || "Unknown Item",
        recentAveragePrice: price,
        isLimited: item.isLimited || catalogInfo.isLimited || false,
        isLimitedUnique: item.isLimitedUnique || catalogInfo.isLimitedUnique || false,
        saleStatus: item.saleStatus || catalogInfo.priceStatus || "Unknown",
        assetType: item.assetType || { name: item._assetTypeName },
        created: item.created,
        updated: item.updated,
        imageUrl: thumbnails[item.assetId] || "",
        source: item._source || "unknown",
        assetTypeName: item._assetTypeName || "Unknown"
      };
    });
    
  } catch (err) {
    console.error(`Failed to fetch inventory:`, err);
    return [];
  }
}

// Fetch thumbnails in batches
async function fetchThumbnails(assetIds) {
  if (!assetIds.length) return {};
  
  const thumbnails = {};
  const batchSize = 100;
  
  for (let i = 0; i < assetIds.length; i += batchSize) {
    const batch = assetIds.slice(i, i + batchSize);
    
    try {
      const res = await fetch(
        `https://thumbnails.roblox.com/v1/assets?assetIds=${batch.join(",")}&size=150x150&format=Png&isCircular=false`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        }
      );
      
      if (res.ok) {
        const data = await res.json();
        if (data.data) {
          data.data.forEach(item => {
            if (item.imageUrl && !item.imageUrl.includes('blocked')) {
              thumbnails[item.assetId] = item.imageUrl;
            }
          });
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (error) {
      console.error(`Error fetching thumbnails: ${error.message}`);
    }
  }
  
  return thumbnails;
}

// Fetch catalog details for pricing info
async function fetchCatalogDetails(assetIds) {
  if (!assetIds.length) return {};
  
  const details = {};
  const batchSize = 50; // Smaller batch size to avoid rate limits
  
  for (let i = 0; i < assetIds.length; i += batchSize) {
    const batch = assetIds.slice(i, i + batchSize);
    
    try {
      const res = await fetch(`https://catalog.roblox.com/v1/catalog/items/details`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({
          items: batch.map(id => ({ itemType: "Asset", id: parseInt(id) }))
        })
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.data) {
          data.data.forEach(item => {
            details[item.id] = {
              name: item.name,
              price: item.price,
              lowestPrice: item.lowestPrice,
              priceStatus: item.priceStatus,
              isLimited: item.itemRestrictions && item.itemRestrictions.includes("Limited"),
              isLimitedUnique: item.itemRestrictions && item.itemRestrictions.includes("LimitedUnique"),
              itemRestrictions: item.itemRestrictions || []
            };
          });
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`Error fetching catalog details: ${error.message}`);
    }
  }
  
  return details;
}

// Main API endpoint
app.get("/inventory/:userId", async (req, res) => {
  const { userId } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const sortBy = req.query.sortBy || "value";
  const filter = req.query.filter || "all";
  const minValue = parseInt(req.query.minValue) || 0;

  try {
    console.log(`\nAPI Request - User: ${userId}, Filter: ${filter}, MinValue: ${minValue}`);
    const allItems = await getComprehensiveInventory(userId);

    if (!allItems.length) {
      return res.json({
        success: true,
        message: "No sellable items found - inventory may be private or user has no valuable items",
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

    // Apply filters
    let filteredItems = allItems;
    
    // Value filter
    if (minValue > 0) {
      filteredItems = filteredItems.filter(item => (item.recentAveragePrice || 0) >= minValue);
    }
    
    // Type filter
    switch (filter.toLowerCase()) {
      case "limited":
        filteredItems = filteredItems.filter(item => item.isLimited === true);
        break;
      case "limitedu":
        filteredItems = filteredItems.filter(item => item.isLimitedUnique === true);
        break;
      case "valuable":
        filteredItems = filteredItems.filter(item => (item.recentAveragePrice || 0) > 0);
        break;
      default:
        // Keep all items
        break;
    }

    // Statistics
    const itemsWithValue = filteredItems.filter(item => (item.recentAveragePrice || 0) > 0);
    const TotalValue = itemsWithValue.reduce((sum, item) => sum + (item.recentAveragePrice || 0), 0);
    
    // Find most expensive
    const topItem = filteredItems.reduce((prev, curr) => {
      const prevPrice = prev.recentAveragePrice || 0;
      const currPrice = curr.recentAveragePrice || 0;
      return currPrice > prevPrice ? curr : prev;
    }, filteredItems[0] || {});

    // Sort items
    let sortedItems = [...filteredItems];
    switch (sortBy.toLowerCase()) {
      case "value":
        sortedItems.sort((a, b) => (b.recentAveragePrice || 0) - (a.recentAveragePrice || 0));
        break;
      case "name":
        sortedItems.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        break;
      case "type":
        sortedItems.sort((a, b) => (a.assetTypeName || "").localeCompare(b.assetTypeName || ""));
        break;
      default:
        sortedItems.sort((a, b) => (b.recentAveragePrice || 0) - (a.recentAveragePrice || 0));
    }

    // Pagination
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginatedItems = sortedItems.slice(start, end);
    const totalPages = Math.ceil(filteredItems.length / limit);

    // Count by type
    const limitedCount = allItems.filter(item => item.isLimited === true).length;
    const limitedUCount = allItems.filter(item => item.isLimitedUnique === true).length;
    const valuableCount = allItems.filter(item => (item.recentAveragePrice || 0) > 0).length;

    console.log(`\n=== Results ===`);
    console.log(`Total items: ${allItems.length}`);
    console.log(`Limited: ${limitedCount}, Limited U: ${limitedUCount}, Valuable: ${valuableCount}`);
    console.log(`Most expensive: ${topItem.name} (${topItem.recentAveragePrice || 0} Robux)`);

    res.json({
      success: true,
      message: "Inventory fetched successfully",
      debug: {
        totalItems: allItems.length,
        limitedItems: limitedCount,
        limitedUniqueItems: limitedUCount,
        valuableItems: valuableCount,
        filterApplied: filter,
        minValueFilter: minValue
      },
      TotalCount: filteredItems.length,
      TotalValue: Math.round(TotalValue),
      ItemsWithValue: itemsWithValue.length,
      MostExpensiveName: topItem.name || "N/A",
      MostExpensiveImage: topItem.imageUrl || "",
      MostExpensiveValue: topItem.recentAveragePrice || 0,
      Page: page,
      Limit: limit,
      TotalPages: totalPages,
      SortBy: sortBy,
      Filter: filter,
      Items: paginatedItems
    });

  } catch (err) {
    console.error("API Error:", err);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: err.message
    });
  }
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Roblox Inventory API Server`);
  console.log(`📡 Running on http://localhost:${PORT}`);
  console.log(`🏥 Health: http://localhost:${PORT}/health`);
  console.log(`\n📖 Usage Examples:`);
  console.log(`   All items: /inventory/231649154`);
  console.log(`   Limited only: /inventory/231649154?filter=limited`);
  console.log(`   Value > 100: /inventory/231649154?minValue=100`);
  console.log(`   Sort by name: /inventory/231649154?sortBy=name`);
});
