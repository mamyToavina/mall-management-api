const User = require('../users/user.model');
const Boutique = require('../boutique/boutique.model');
const { comparePassword } = require('../../utils/hash');
const { generateAccessToken, generateRefreshToken } = require('../../utils/jwt');
const bcrypt = require('bcryptjs');
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

  const user = await User.findById(resolvedUserId);
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
  boutique.status = 'ACTIVE';
  await boutique.save();

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
