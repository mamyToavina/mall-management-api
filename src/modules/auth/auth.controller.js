const User = require('../users/user.model');
const { loginService, completeBoutiqueProfileService } = require('./auth.service');
const { generateAccessToken, generateRefreshToken } = require('../../utils/jwt');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');

const cookieOptionsForRequest = (req) => {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const origin = String(req.headers.origin || '');
  const isHttps = req.secure || proto === 'https' || origin.startsWith('https://');

  return {
    httpOnly: true,
    secure: isHttps,
    sameSite: isHttps ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  };
};

const login = async (req, res, next) => {
  try {
    const { accessToken, refreshToken, user } = await loginService(req.body)

    res.cookie("refreshToken", refreshToken, cookieOptionsForRequest(req))

    res.json({
      accessToken,
      user
    })

  } catch (err) {
    next(err)
  }
}


const refresh = async (req, res, next) => {
  try {
    const refreshToken = req.cookies.refreshToken

    if (!refreshToken) {
      return res.status(401).json({ message: "Non autorisé" })
    }

    let payload = null;
    try {
      payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET)
    } catch (err) {
      return res.status(401).json({ message: "Non autorisÃ©" })
    }
    const user = await User.findById(payload.id)

    if (!user || !user.refreshTokenHash) {
      return res.status(401).json({ message: "Non autorisé" })
    }

    const isValid = await bcrypt.compare(refreshToken, user.refreshTokenHash)

    if (!isValid) {
      return res.status(401).json({ message: "Non autorisé" })
    }

    const newAccessToken = generateAccessToken(user)

    const safeUser = user.toObject ? user.toObject() : { ...user };
    delete safeUser.password;

    res.json({ accessToken: newAccessToken, user: safeUser })

  } catch (err) {
    next(err)
  }
}


const logout = async (req, res) => {
  await User.findByIdAndUpdate(req.user.id, {
    refreshTokenHash: null
  })

  res.clearCookie("refreshToken", cookieOptionsForRequest(req))

  res.json({ message: "Déconnecté" })
}

const completeBoutiqueProfile = async (req, res, next) => {
  try {
    const payload = {
      ...req.body,
      logo: req.file ? `/uploads/boutiques/${req.file.filename}` : req.body.logo
    };

    const result = await completeBoutiqueProfileService(payload);
    res.status(200).json(result);
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    next(err);
  }
};

module.exports = { login, refresh, logout, completeBoutiqueProfile };





