const express = require("express");
const routes = require('./routes.js');
const cookieParser = require('cookie-parser');
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

module.exports = app
