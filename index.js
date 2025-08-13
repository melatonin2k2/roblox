const fetch = require("node-fetch");
const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Get total UGC value from userId directly
async function getUGCValue(userId) {
    let totalValue = 0;
    let cursor = "";
    let url = `https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?limit=100`;

    while (url) {
        const res = await fetch(url + (cursor ? `&cursor=${cursor}` : ""));
        const data = await res.json();

        if (data.data && data.data.length > 0) {
            for (const item of data.data) {
                if (item.recentAveragePrice) {
                    totalValue += item.recentAveragePrice;
                }
            }
        }

        cursor = data.nextPageCursor;
        if (!cursor) break;
    }

    return totalValue;
}

// API endpoint accepting userId directly
app.get("/ugcvalue/:userId", async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        if (!userId) return res.status(400).json({ error: "Invalid userId" });

        const total = await getUGCValue(userId);
        res.json({ userId, totalValue: total });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
