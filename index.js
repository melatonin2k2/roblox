const fetch = require("node-fetch");
const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Fetch all UGC collectibles for a user, with thumbnails
async function getUGCStats(userId) {
    let totalValue = 0;
    let assets = [];
    let cursor = null;

    do {
        let url = `https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?limit=100`;
        if (cursor) url += `&cursor=${cursor}`;

        const res = await fetch(url);
        const data = await res.json();

        if (data.data && data.data.length > 0) {
            for (const item of data.data) {
                const price = item.recentAveragePrice || 0;
                totalValue += price;

                let imageUrl = "";
                try {
                    const thumbRes = await fetch(
                        `https://thumbnails.roblox.com/v1/assets?assetIds=${item.assetId}&size=150x150&format=Png&isCircular=false`
                    );
                    const thumbData = await thumbRes.json();
                    imageUrl = thumbData.data[0]?.imageUrl || "";
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
    } while (cursor);

    // Determine the most expensive asset
    let mostExpensive = assets.reduce((prev, current) =>
        (current.price > (prev?.price || 0)) ? current : prev, null
    );

    return {
        totalValue,
        totalCount: assets.length,
        mostExpensiveName: mostExpensive?.name || "N/A",
        mostExpensiveImage: mostExpensive?.thumbnail || "",
        assets
    };
}

// API endpoint
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

// Start server
app.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`));
