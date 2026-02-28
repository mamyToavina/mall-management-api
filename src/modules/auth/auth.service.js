const User = require('../users/user.model');
const Boutique = require('../boutique/boutique.model');
const Contract = require('../contracts/contract.model');
const { comparePassword } = require('../../utils/hash');
const { generateAccessToken, generateRefreshToken } = require('../../utils/jwt');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const DEFAULT_MARKETING_TAGLINE = 'Profitez de nos meilleures offres en boutique et en ligne.';

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

const normalizeText = (value) => {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text || '';
};

const normalizeToken = (value) => {
  if (value === undefined || value === null) return '';
  let token = String(value).trim();

  // Supporte le copier-coller avec guillemets
  if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
    token = token.slice(1, -1).trim();
  }

  try {
    token = decodeURIComponent(token);
  } catch (_) {
    // no-op si deja decode
  }

  return token;
};

const extractFromActivationLink = (activationLink) => {
  if (!activationLink) return { userId: null, token: null };

  try {
    const url = new URL(String(activationLink).trim());
    return {
      userId: url.searchParams.get('id'),
      token: url.searchParams.get('token')
    };
  } catch (_) {
    return { userId: null, token: null };
  }
};

const completeBoutiqueProfileService = async ({
  userId,
  token,
  activationLink,
  password,
  pseudo,
  firstName,
  lastName,
  gender,
  boutiqueName,
  activity,
  offerings,
  marketingTagline,
  publicDescription,
  onlineSalesEnabled,
  logo
}) => {
  const fromLink = extractFromActivationLink(activationLink);
  const resolvedUserId = userId || fromLink.userId;
  const resolvedToken = normalizeToken(token || fromLink.token);

  if (!resolvedUserId || !resolvedToken || !password || !pseudo || !boutiqueName) {
    throw new Error('userId, token, password, pseudo et boutiqueName sont obligatoires');
  }
  if (String(password).length < 8) {
    throw new Error('Mot de passe invalide: minimum 8 caracteres');
  }
  const session = await mongoose.startSession();
  let user = null;
  let boutique = null;
  let contract = null;

  try {
    await session.withTransaction(async () => {
      user = await User.findById(resolvedUserId).session(session);
      if (!user) {
        throw new Error('Compte introuvable');
      }

      if (user.role !== 'BOUTIQUE') {
        throw new Error('Ce compte ne peut pas completer un profil boutique');
      }

      if (user.isAccountCompleted === true) {
        throw new Error('Ce compte est deja active');
      }

      if (!user.activationTokenHash || !user.activationTokenExpires) {
        throw new Error('Token d activation invalide');
      }

      if (new Date(user.activationTokenExpires).getTime() < Date.now()) {
        throw new Error('Token d activation expire');
      }

      const isTokenValid = await bcrypt.compare(resolvedToken, user.activationTokenHash);
      if (!isTokenValid) {
        throw new Error('Token d activation invalide (verifiez le token et le userId du meme lien)');
      }

      const existingPseudo = await User.findOne({ pseudo, _id: { $ne: user._id } }).session(session);
      if (existingPseudo) {
        throw new Error('Pseudo deja utilise');
      }

      if (user.boutique) {
        boutique = await Boutique.findById(user.boutique).session(session);
      }
      if (!boutique) {
        boutique = await Boutique.findOne({ owner: user._id }).session(session);
      }
      if (!boutique) {
        throw new Error('Boutique introuvable pour ce compte');
      }
      contract = await Contract.findOne({
        boutique: boutique._id,
        status: { $in: ['ACTIVE', 'SCHEDULED'] }
      })
        .sort({ createdAt: -1 })
        .session(session);
      if (!contract) {
        throw new Error('Aucun contrat actif trouve pour cette boutique');
      }

      const parsedOnlineSalesEnabled = parseBoolean(onlineSalesEnabled);
      boutique.name = boutiqueName;
      const normalizedActivity = normalizeText(activity);
      const normalizedOfferings = normalizeText(offerings);
      const normalizedMarketingTagline = normalizeText(marketingTagline);
      const normalizedPublicDescription = normalizeText(publicDescription);

      if (normalizedActivity !== undefined) boutique.activity = normalizedActivity;
      if (normalizedOfferings !== undefined) boutique.offerings = normalizedOfferings;
      if (normalizedMarketingTagline !== undefined) {
        boutique.marketingTagline = normalizedMarketingTagline || DEFAULT_MARKETING_TAGLINE;
      }
      if (normalizedPublicDescription !== undefined) boutique.publicDescription = normalizedPublicDescription;
      if (parsedOnlineSalesEnabled !== undefined) {
        boutique.onlineSalesEnabled = parsedOnlineSalesEnabled;
      }
      if (logo !== undefined) {
        boutique.logo = logo;
      }

      user.password = password;
      user.pseudo = pseudo;
      user.firstName = firstName ?? user.firstName;
      user.lastName = lastName ?? user.lastName;
      user.gender = gender ?? user.gender;
      user.boutique = boutique._id;

      boutique.status = 'ACTIVE';
      user.status = 'ACTIVE';
      user.isAccountCompleted = true;
      user.activationTokenHash = null;
      user.activationTokenExpires = null;

      await boutique.save({ session });
      await user.save({ session });
    });
  } finally {
    await session.endSession();
  }

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
      activity: boutique.activity || '',
      offerings: boutique.offerings || '',
      marketingTagline: boutique.marketingTagline || '',
      publicDescription: boutique.publicDescription || '',
      onlineSalesEnabled: boutique.onlineSalesEnabled,
      status: boutique.status
    }
  };
};

module.exports = { loginService, completeBoutiqueProfileService };
