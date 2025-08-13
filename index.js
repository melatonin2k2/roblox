const fetch = require("node-fetch");
const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Get full UGC data for a userId
async function getUGCValue(userId) {
    let totalValue = 0;
    let assetsData = [];
    let cursor = "";
    let url = `https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?limit=100`;

    while (url) {
        const res = await fetch(url + (cursor ? `&cursor=${cursor}` : ""));
        const data = await res.json();

        if (data.data && data.data.length > 0) {
            for (const item of data.data) {
                // Use recentAveragePrice if available
                const price = item.recentAveragePrice || 0;
                totalValue += price;

                assetsData.push({
                    assetId: item.assetId,
                    name: item.name || "Unknown",
                    price: price,
                    icon: item.iconImageAssetId || 0
                });
            }
        }

        cursor = data.nextPageCursor;
        if (!cursor) break;
    }

    return { totalValue, assets: assetsData };
}

// API endpoint
app.get("/ugcvalue/:userId", async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        if (!userId) return res.status(400).json({ error: "Invalid userId" });

        const data = await getUGCValue(userId);
        res.json({ userId, totalValue: data.totalValue, assets: data.assets });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
