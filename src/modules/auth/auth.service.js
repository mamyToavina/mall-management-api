const User = require('../users/user.model');
const { comparePassword } = require('../../utils/hash');
const { generateAccessToken, generateRefreshToken } = require('../../utils/jwt');
const bcrypt = require('bcryptjs');

const loginService = async ({ email, password }) => {
  const user = await User.findOne({ email });

  if (!user) {
    throw new Error("Email ou mot de passe invalide");
  }

  const isMatch = await comparePassword(password, user.password);

  if (!isMatch) {
    throw new Error("Email ou mot de passe invalide");
  }

  if (user.status !== 'ACTIVE') {
    throw new Error("Compte non actif");
  }

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  user.refreshTokenHash = await bcrypt.hash(refreshToken, 10);
  await user.save();

  return { accessToken, refreshToken, user };
};

module.exports = { loginService };
