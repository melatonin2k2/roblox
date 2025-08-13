const fetch = require("node-fetch");
const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Updated getUserId function
async function getUserId(username) {
    const res = await fetch(`https://users.roblox.com/v1/usernames/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernames: [username] })
    });
    const data = await res.json();
    if (data.data && data.data.length > 0) {
        return data.data[0].id;
    }
    return null;
}

// Get total UGC value
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

// API endpoint
app.get("/ugcvalue/:username", async (req, res) => {
    try {
        const username = req.params.username;
        const userId = await getUserId(username);

        if (!userId) {
            return res.status(404).json({ error: "User not found" });
        }

        const total = await getUGCValue(userId);
        res.json({ username, totalValue: total });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
