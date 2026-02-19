const User = require('../users/user.model');
const Boutique = require('../boutique/boutique.model');
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

const parseBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return undefined;
};

const completeBoutiqueProfileService = async ({
  userId,
  token,
  password,
  pseudo,
  firstName,
  lastName,
  gender,
  boutiqueName,
  onlineSalesEnabled,
  logo
}) => {
  if (!userId || !token || !password || !pseudo || !boutiqueName) {
    throw new Error('userId, token, password, pseudo et boutiqueName sont obligatoires');
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new Error('Compte introuvable');
  }

  if (user.role !== 'BOUTIQUE') {
    throw new Error('Ce compte ne peut pas completer un profil boutique');
  }

  if (!user.activationTokenHash || !user.activationTokenExpires) {
    throw new Error('Token d activation invalide');
  }

  if (new Date(user.activationTokenExpires).getTime() < Date.now()) {
    throw new Error('Token d activation expire');
  }

  const isTokenValid = await bcrypt.compare(token, user.activationTokenHash);
  if (!isTokenValid) {
    throw new Error('Token d activation invalide');
  }

  const existingPseudo = await User.findOne({ pseudo, _id: { $ne: user._id } });
  if (existingPseudo) {
    throw new Error('Pseudo deja utilise');
  }

  let boutique = null;
  if (user.boutique) {
    boutique = await Boutique.findById(user.boutique);
  }
  if (!boutique) {
    boutique = await Boutique.findOne({ owner: user._id });
  }
  if (!boutique) {
    throw new Error('Boutique introuvable pour ce compte');
  }

  user.password = password;
  user.pseudo = pseudo;
  user.firstName = firstName ?? user.firstName;
  user.lastName = lastName ?? user.lastName;
  user.gender = gender ?? user.gender;
  user.status = 'ACTIVE';
  user.isAccountCompleted = true;
  user.activationTokenHash = null;
  user.activationTokenExpires = null;
  user.boutique = boutique._id;
  await user.save();

  const parsedOnlineSalesEnabled = parseBoolean(onlineSalesEnabled);
  boutique.name = boutiqueName;
  if (parsedOnlineSalesEnabled !== undefined) {
    boutique.onlineSalesEnabled = parsedOnlineSalesEnabled;
  }
  if (logo !== undefined) {
    boutique.logo = logo;
  }
  boutique.status = 'ACTIVE';
  await boutique.save();

  return {
    message: 'Compte boutique active et profil complete',
    user: {
      id: user._id,
      email: user.email,
      pseudo: user.pseudo,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      status: user.status,
      isAccountCompleted: user.isAccountCompleted
    },
    boutique: {
      id: boutique._id,
      name: boutique.name,
      logo: boutique.logo,
      onlineSalesEnabled: boutique.onlineSalesEnabled,
      status: boutique.status
    }
  };
};

module.exports = { loginService, completeBoutiqueProfileService };
