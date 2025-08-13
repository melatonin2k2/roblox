const fetch = require("node-fetch");
const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Fetch UGC stats including correct thumbnails
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

                // Fetch the correct collectible image from catalog
                let imageUrl = "";
                try {
                    const catalogRes = await fetch(
                        `https://catalog.roblox.com/v1/catalog/items/details?itemIds=${item.assetId}`
                    );
                    const catalogData = await catalogRes.json();
                    if (
                        catalogData.data &&
                        catalogData.data[0] &&
                        catalogData.data[0].collectibleProductImage
                    ) {
                        imageUrl = catalogData.data[0].collectibleProductImage;
                    }
                } catch (e) {
                    console.warn("Failed to fetch catalog image for assetId", item.assetId);
                }

                assets.push({
                    assetId: item.assetId,
                    name: item.name,
                    price,
                    thumbnail: imageUrl,
                });
            }
        }

        cursor = data.nextPageCursor;
        if (!cursor) break;
    }

    return { totalValue, assets };
}

// API endpoint
app.get("/ugcvalue/:userId", async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        if (!userId) {
            return res.status(400).json({ error: "Invalid userId" });
        }

        const stats = await getUGCStats(userId);
        res.json({ userId, ...stats });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`));
