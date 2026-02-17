const express = require("express");
const routes = require('./routes.js');
const path = require("path");
const cookieParser = require('cookie-parser')
const cors = require('cors');
const app = express();
require('dotenv').config();

app.use(cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
}));

app.use(express.json());

app.use(cookieParser());

app.use('/api', routes);
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

module.exports = app
