const fetch = require("node-fetch");
const express = require("express");
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Get total UGC value and thumbnail
async function getUGCStats(userId) {
    let totalValue = 0;
    let assets = [];
    let cursor = "";
    let url = `https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?limit=100`;

    while (url) {
        const res = await fetch(url + (cursor ? `&cursor=${cursor}` : ""));
        const data = await res.json();
        if (data.data && data.data.length > 0) {
            for (const item of data.data) {
                const price = item.recentAveragePrice || 0;
                totalValue += price;

                // Fetch thumbnail from catalog API
                let imageUrl = "";
                try {
                    const thumbRes = await fetch(`https://thumbnails.roblox.com/v1/assets?assetIds=${item.assetId}&size=150x150&format=Png&isCircular=false`);
                    const thumbData = await thumbRes.json();
                    if (thumbData.data && thumbData.data.length > 0) {
                        imageUrl = thumbData.data[0].imageUrl || "";
                    }
                } catch (e) {
                    console.warn("Failed to fetch thumbnail for assetId", item.assetId);
                }

                assets.push({
                    assetId: item.assetId,
                    name: item.name,
                    price,
                    thumbnail: imageUrl
                });
            }
        }
        cursor = data.nextPageCursor;
        if (!cursor) break;
    }

    return { totalValue, assets };
}

app.get("/ugcvalue/:userId", async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        if (!userId) return res.status(400).json({ error: "Invalid userId" });
        const stats = await getUGCStats(userId);
        res.json({ userId, ...stats });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`));
