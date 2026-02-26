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

// Increase body size limits to avoid PayloadTooLargeError when frontend sends large JSON payloads
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(cookieParser());

app.use('/api', routes);
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  const status = err.statusCode || 500;
  const payload = {
    message: err.message || 'Erreur interne du serveur.'
  };

  if (Array.isArray(err.errors) && err.errors.length > 0) {
    payload.errors = err.errors;
  }

  return res.status(status).json(payload);
});

module.exports = app
