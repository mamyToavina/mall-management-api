require('dotenv').config();
const express = require("express");
const routes = require('./routes.js');
const path = require("path");
const cookieParser = require('cookie-parser')
const cors = require('cors');
const app = express();
const allowedOrigins = process.env.CLIENT_URL.split(',');

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));


app.use(cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
}));

app.use(express.json());

app.use(cookieParser());

app.use('/api', routes);
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

module.exports = app
