const fetch = require("node-fetch");
const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Get Roblox userId from username
async function getUserId(username) {
    const res = await fetch(`https://api.roblox.com/users/get-by-username?username=${username}`);
    const data = await res.json();
    return data.Id || null;
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
            for (
