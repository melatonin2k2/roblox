const express = require("express");
const fetch = require("node-fetch");
const app = express();
const PORT = 3000;

async function fetchCollectibles(userId) {
    let url = `https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?sortOrder=Asc&limit=100`;
    let res = await fetch(url);
    if (!res.ok) throw new Error(`Error fetching collectibles: ${res.status}`);
    let data = await res.json();
    return data.data || [];
}

async function fetchUGC(userId) {
    let url = `https://inventory.roblox.com/v1/users/${userId}/assets?assetType=Hat&sortOrder=Asc&limit=100`;
    let res = await fetch(url);
    if (!res.ok) throw new Error(`Error fetching UGC: ${res.status}`);
    let data = await res.json();
    // Filter out non-collectible UGCs that cannot be resold
    return data.data || [];
}

async function getLowestResellerPrice(assetId) {
    let url = `https://economy.roblox.com/v1/assets/${assetId}/resellers?limit=1`;
    let res = await fetch(url);
    if (!res.ok) return 0;
    let data = await res.json();
    if (data.data && data.data.length > 0) {
        return data.data[0].price || 0;
    }
    return 0;
}

app.get("/playerValue/:userId", async (req, res) => {
    let userId = req.params.userId;
    try {
        let totalValue = 0;
        let allItems = [];

        // Limiteds & LimitedU
        let collectibles = await fetchCollectibles(userId);
        for (let item of collectibles) {
            let price = item.recentAveragePrice || 0;
            totalValue += price;
            allItems.push({
                name: item.name,
                price: price,
                image: `https://www.roblox.com/asset-thumbnail/image?assetId=${item.assetId}&width=420&height=420&format=png`
            });
        }

        // Resellable UGC
        let ugcItems = await fetchUGC(userId);
        for (let ugc of ugcItems) {
            let price = await getLowestResellerPrice(ugc.assetId);
            if (price > 0) { // Only add if resellable
                totalValue += price;
                allItems.push({
                    name: ugc.name,
                    price: price,
                    image: `https://www.roblox.com/asset-thumbnail/image?assetId=${ugc.assetId}&width=420&height=420&format=png`
                });
            }
        }

        res.json({
            totalValue,
            items: allItems.sort((a, b) => b.price - a.price) // Highest first
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
