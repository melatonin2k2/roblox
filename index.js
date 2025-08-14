const express = require("express");
const fetch = require("node-fetch");

const app = express();
const PORT = 3000;

// Multiple Roblox API endpoints to get comprehensive inventory data
const COLLECTIBLES_API = (userId, cursor = "") =>
  `https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?limit=100&cursor=${cursor}`;
const ASSETS_API = (userId, cursor = "") =>
  `https://inventory.roblox.com/v1/users/${userId}/assets?limit=100&cursor=${cursor}`;
const INVENTORY_API = (userId, assetTypes = "", cursor = "") =>
  `https://inventory.roblox.com/v1/users/${userId}/items/Asset?limit=100&cursor=${cursor}&assetTypes=${assetTypes}`;

// Asset types that commonly include Limited items
const COMMON_ASSET_TYPES = [
  "Hat", "Hair", "Face", "Neck", "Shoulder", "Shirt", "TShirt", "Pants", 
  "Decal", "Head", "Gear", "Package", "Animation", "Torso", "RightArm", 
  "LeftArm", "LeftLeg", "RightLeg", "Audio", "Mesh", "Image", "Plugin",
  "MeshPart", "HairAccessory", "FaceAccessory", "NeckAccessory", 
  "ShoulderAccessory", "FrontAccessory", "BackAccessory", "WaistAccessory",
  "ClimbAnimation", "FallAnimation", "IdleAnimation", "JumpAnimation",
  "RunAnimation", "SwimAnimation", "WalkAnimation", "PoseAnimation",
  "EmoteAnimation", "LocalizationTable", "Video", "Model"
];

// Fetch all pages with comprehensive error handling
async function fetchAllPages(apiFunc, userId, additionalParam = "") {
  let items = [];
  let cursor = "";
  let hasMore = true;
  let retries = 0;
  const maxRetries = 5;
  const baseDelay = 500;

  while (hasMore && retries < maxRetries) {
    try {
      const url = additionalParam ? apiFunc(userId, additionalParam, cursor) : apiFunc(userId, cursor);
      console.log(`Fetching: ${url.substring(0, 100)}...`);
      
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
          console.log(`Forbidden access (inventory might be private)`);
          break;
        }
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      
      const data = await res.json();
      console.log(`Received ${data.data ? data.data.length : 0} items from this endpoint`);

      if (data && data.data && data.data.length > 0) {
        // Add source info to track which endpoint returned each item
        const itemsWithSource = data.data.map(item => ({
          ...item,
          _source: url.includes('collectibles') ? 'collectibles' : 
                  url.includes('assets') ? 'assets' : 'inventory'
        }));
        items = items.concat(itemsWithSource);
      }

      if (data.nextPageCursor) {
        cursor = data.nextPageCursor;
        await new Promise(resolve => setTimeout(resolve, baseDelay));
        retries = 0;
      } else {
        hasMore = false;
      }
    } catch (error) {
      console.error(`Error fetching page: ${error.message}`);
      retries++;
      if (retries >= maxRetries) {
        console.error(`Max retries reached for this endpoint`);
        break;
      }
      await new Promise(resolve => setTimeout(resolve, baseDelay * retries));
    }
  }

  console.log(`Total items from this endpoint: ${items.length}`);
  return items;
}

// Fetch catalog item details for better Limited item detection
async function fetchCatalogDetails(assetIds) {
  if (!assetIds.length) return {};
  
  const details = {};
  const batchSize = 100;
  
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
              priceStatus: item.priceStatus,
              unitsAvailableForConsumption: item.unitsAvailableForConsumption,
              premiumPricing: item.premiumPricing,
              lowestPrice: item.lowestPrice,
              priceConfiguration: item.priceConfiguration,
              isLimited: item.itemRestrictions && item.itemRestrictions.includes("Limited"),
              isLimitedUnique: item.itemRestrictions && item.itemRestrictions.includes("LimitedUnique"),
              itemRestrictions: item.itemRestrictions || [],
              collectibleItemId: item.collectibleItemId
            };
          });
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (error) {
      console.error(`Error fetching catalog details: ${error.message}`);
    }
  }
  
  return details;
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
      
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      console.error(`Error fetching thumbnails: ${error.message}`);
    }
  }
  
  return thumbnails;
}

// Get comprehensive inventory with multiple data sources
async function getComprehensiveInventory(userId) {
  try {
    console.log(`\n=== Fetching comprehensive inventory for user ${userId} ===`);
    
    // Fetch from multiple endpoints simultaneously
    const [collectibles, assets] = await Promise.all([
      fetchAllPages(COLLECTIBLES_API, userId),
      fetchAllPages(ASSETS_API, userId)
    ]);
    
    // Try to get additional items using the inventory endpoint with different asset types
    let inventoryItems = [];
    try {
      // Fetch a few common asset types that might contain Limited items
      const assetTypeGroups = ["Hat,Hair,Face", "Gear,Package", "Shirt,Pants,TShirt"];
      
      for (const assetTypes of assetTypeGroups) {
        const items = await fetchAllPages(INVENTORY_API, userId, assetTypes);
        inventoryItems = inventoryItems.concat(items);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.log(`Inventory API failed: ${error.message}`);
    }
    
    console.log(`\nItems collected:`);
    console.log(`- Collectibles: ${collectibles.length}`);
    console.log(`- Assets: ${assets.length}`);
    console.log(`- Inventory items: ${inventoryItems.length}`);
    
    // Combine all items and remove duplicates based on assetId
    const allItems = [...collectibles, ...assets, ...inventoryItems];
    const uniqueItems = [];
    const seenIds = new Set();
    
    for (const item of allItems) {
      const id = item.assetId || item.id;
      if (id && !seenIds.has(id)) {
        seenIds.add(id);
        uniqueItems.push({
          ...item,
          assetId: id // Normalize the id field
        });
      }
    }
    
    console.log(`- Total unique items: ${uniqueItems.length}`);
    
    // Get catalog details for better Limited detection
    const assetIds = uniqueItems.map(item => item.assetId).filter(id => id);
    console.log(`Fetching catalog details for ${assetIds.length} items...`);
    const catalogDetails = await fetchCatalogDetails(assetIds);
    
    // Enhanced filtering for sellable items
    const sellableItems = uniqueItems.filter(item => {
      const catalogInfo = catalogDetails[item.assetId] || {};
      
      // Check various indicators that an item might be sellable/tradeable
      const isLimited = item.isLimited === true || 
                       item.isLimitedUnique === true ||
                       catalogInfo.isLimited === true ||
                       catalogInfo.isLimitedUnique === true ||
                       (catalogInfo.itemRestrictions && 
                        (catalogInfo.itemRestrictions.includes("Limited") || 
                         catalogInfo.itemRestrictions.includes("LimitedUnique")));
      
      const hasSaleStatus = item.saleStatus === "ForSale" || 
                           item.saleStatus === "Resellable" ||
                           item.saleStatus === "OnSale";
      
      const hasValue = (item.recentAveragePrice && item.recentAveragePrice > 0) ||
                      (catalogInfo.lowestPrice && catalogInfo.lowestPrice > 0) ||
                      (catalogInfo.price && catalogInfo.price > 0);
      
      const isCollectible = catalogInfo.collectibleItemId || 
                           item._source === 'collectibles' ||
                           catalogInfo.priceConfiguration;
      
      return isLimited || hasSaleStatus || hasValue || isCollectible;
    });
    
    console.log(`Sellable items found: ${sellableItems.length}`);
    
    // Get thumbnails
    const sellableAssetIds = sellableItems.map(item => item.assetId);
    const thumbnails = await fetchThumbnails(sellableAssetIds);
    
    // Enrich items with all available data
    return sellableItems.map(item => {
      const catalogInfo = catalogDetails[item.assetId] || {};
      
      return {
        assetId: item.assetId,
        name: item.name || catalogInfo.name || "Unknown Item",
        recentAveragePrice: item.recentAveragePrice || catalogInfo.lowestPrice || catalogInfo.price || 0,
        isLimited: item.isLimited || catalogInfo.isLimited || false,
        isLimitedUnique: item.isLimitedUnique || catalogInfo.isLimitedUnique || false,
        saleStatus: item.saleStatus || catalogInfo.priceStatus || "Unknown",
        assetType: item.assetType || {},
        created: item.created,
        updated: item.updated,
        imageUrl: thumbnails[item.assetId] || "",
        source: item._source || "unknown",
        catalogInfo: {
          itemRestrictions: catalogInfo.itemRestrictions || [],
          collectibleItemId: catalogInfo.collectibleItemId,
          unitsAvailable: catalogInfo.unitsAvailableForConsumption
        }
      };
    });
    
  } catch (err) {
    console.error(`Failed to fetch comprehensive inventory for userId ${userId}:`, err);
    return [];
  }
}

// Enhanced API endpoint
app.get("/inventory/:userId", async (req, res) => {
  const { userId } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const sortBy = req.query.sortBy || "value";
  const filter = req.query.filter || "all"; // all, limited, limitedU, tradeable

  try {
    console.log(`\nProcessing request for user ${userId} with filter: ${filter}`);
    const allSellableItems = await getComprehensiveInventory(userId);

    if (!allSellableItems.length) {
      return res.json({
        success: true,
        message: "No sellable items found",
        debug: "This could mean the inventory is private or the user has no sellable items",
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
    let filteredItems = allSellableItems;
    switch (filter) {
      case "limited":
        filteredItems = allSellableItems.filter(item => item.isLimited === true);
        break;
      case "limitedU":
        filteredItems = allSellableItems.filter(item => item.isLimitedUnique === true);
        break;
      case "tradeable":
        filteredItems = allSellableItems.filter(item => 
          item.isLimited === true || item.isLimitedUnique === true || 
          item.saleStatus === "Resellable" || item.recentAveragePrice > 0
        );
        break;
      default:
        filteredItems = allSellableItems;
    }

    // Calculate statistics
    const itemsWithValue = filteredItems.filter(item => item.recentAveragePrice > 0);
    const TotalValue = itemsWithValue.reduce(
      (sum, item) => sum + item.recentAveragePrice,
      0
    );

    // Find most expensive item
    const topItem = filteredItems.reduce((prev, curr) => {
      const prevPrice = prev.recentAveragePrice || 0;
      const currPrice = curr.recentAveragePrice || 0;
      return currPrice > prevPrice ? curr : prev;
    }, filteredItems[0]);

    // Sort items
    let sortedItems = [...filteredItems];
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
    const totalPages = Math.ceil(filteredItems.length / limit);

    // Add debug info
    const limitedCount = allSellableItems.filter(item => item.isLimited === true).length;
    const limitedUCount = allSellableItems.filter(item => item.isLimitedUnique === true).length;
    const sources = {};
    allSellableItems.forEach(item => {
      sources[item.source] = (sources[item.source] || 0) + 1;
    });

    res.json({
      success: true,
      message: "Inventory fetched successfully",
      debug: {
        totalFetched: allSellableItems.length,
        limitedItems: limitedCount,
        limitedUniqueItems: limitedUCount,
        sourceBreakdown: sources,
        filterApplied: filter
      },
      TotalCount: filteredItems.length,
      TotalValue: Math.round(TotalValue),
      ItemsWithValue: itemsWithValue.length,
      MostExpensiveName: topItem ? topItem.name : "N/A",
      MostExpensiveImage: topItem ? topItem.imageUrl : "",
      MostExpensiveValue: topItem ? (topItem.recentAveragePrice || 0) : 0,
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
      message: err.message,
      TotalCount: 0,
      TotalValue: 0,
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
  console.log(`Example usage: http://localhost:${PORT}/inventory/231649154?filter=all&sortBy=value`);
  console.log(`Filters available: all, limited, limitedU, tradeable`);
});
