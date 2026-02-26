const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../users/user.model');
const Boutique = require('../boutique/boutique.model');
const Box = require('../boxes/box.model');
const Contract = require('../contracts/contract.model');
const { getGeneralSettings } = require('../settings/settings.service');
const { sendActivationEmail } = require('../../utils/mailer');

const MAX_AMOUNT = 1000000000;
const MAX_FACTOR = 1000;
const MAX_DURATION_MONTHS = 240;

const buildHttpError = (statusCode, message, errors) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (errors) err.errors = errors;
  return err;
};

const normalizeString = (value) => (typeof value === 'string' ? value.trim() : '');

const parseNumber = (value) => {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return Number.NaN;
  return parsed;
};

const addMonths = (date, months) => {
  const endDate = new Date(date);
  endDate.setMonth(endDate.getMonth() + months);
  return endDate;
};

const validateContractData = (rawContractData, defaultValues, defaultMonthlyRent) => {
  const contractData = rawContractData || {};
  const errors = [];

  const startDate = new Date(contractData.startDate);
  if (!contractData.startDate || Number.isNaN(startDate.getTime())) {
    errors.push({ field: 'contractData.startDate', message: 'Date de debut invalide.' });
  }

  const durationMonths = parseNumber(contractData.durationMonths);
  if (!Number.isInteger(durationMonths) || durationMonths < 1 || durationMonths > MAX_DURATION_MONTHS) {
    errors.push({
      field: 'contractData.durationMonths',
      message: `Duree invalide (entier entre 1 et ${MAX_DURATION_MONTHS}).`
    });
  }

  const monthlyRentRaw = parseNumber(contractData.monthlyRent);
  const monthlyRent = monthlyRentRaw === undefined ? defaultMonthlyRent : monthlyRentRaw;
  if (!Number.isFinite(monthlyRent) || monthlyRent < 0 || monthlyRent > MAX_AMOUNT) {
    errors.push({ field: 'contractData.monthlyRent', message: `Loyer mensuel invalide (entre 0 et ${MAX_AMOUNT}).` });
  }

  const penaltyFeeRaw = parseNumber(contractData.penaltyFee);
  const penaltyFee = penaltyFeeRaw === undefined ? defaultValues.penaltyFee : penaltyFeeRaw;
  if (!Number.isFinite(penaltyFee) || penaltyFee < 0 || penaltyFee > MAX_AMOUNT) {
    errors.push({ field: 'contractData.penaltyFee', message: `Frais de penalite invalide (entre 0 et ${MAX_AMOUNT}).` });
  }

  const penaltyGrowthFactorRaw = parseNumber(contractData.penaltyGrowthFactor);
  const penaltyGrowthFactor =
    penaltyGrowthFactorRaw === undefined ? defaultValues.penaltyGrowthFactor : penaltyGrowthFactorRaw;
  if (!Number.isFinite(penaltyGrowthFactor) || penaltyGrowthFactor < 0 || penaltyGrowthFactor > MAX_FACTOR) {
    errors.push({
      field: 'contractData.penaltyGrowthFactor',
      message: `Coefficient de penalite invalide (entre 0 et ${MAX_FACTOR}).`
    });
  }

  const terminationFeeRaw = parseNumber(contractData.terminationFee);
  const terminationFee = terminationFeeRaw === undefined ? defaultValues.terminationFee : terminationFeeRaw;
  if (!Number.isFinite(terminationFee) || terminationFee < 0 || terminationFee > MAX_AMOUNT) {
    errors.push({ field: 'contractData.terminationFee', message: `Frais de rupture invalide (entre 0 et ${MAX_AMOUNT}).` });
  }

  const onlineSalesCommissionPercentRaw = parseNumber(contractData.onlineSalesCommissionPercent);
  const onlineSalesCommissionPercent =
    onlineSalesCommissionPercentRaw === undefined
      ? defaultValues.onlineSalesCommissionPercent
      : onlineSalesCommissionPercentRaw;
  if (
    !Number.isFinite(onlineSalesCommissionPercent) ||
    onlineSalesCommissionPercent < 0 ||
    onlineSalesCommissionPercent > 100
  ) {
    errors.push({
      field: 'contractData.onlineSalesCommissionPercent',
      message: 'Commission en ligne invalide (entre 0 et 100).'
    });
  }

  const notesCandidate = normalizeString(contractData.notes || contractData.details);
  if (notesCandidate.length > 1000) {
    errors.push({ field: 'contractData.notes', message: 'Note trop longue (maximum 1000 caracteres).' });
  }

  if (errors.length > 0) {
    throw buildHttpError(400, 'Donnees invalides.', errors);
  }

  const endDate = addMonths(startDate, durationMonths);

  return {
    startDate,
    endDate,
    durationMonths,
    monthlyRent,
    penaltyFee,
    penaltyGrowthFactor,
    terminationFee,
    onlineSalesCommissionPercent,
    notes: notesCandidate || undefined
  };
};

const createBoutiqueWithContract = async (data) => {
  const { firstName, lastName, email, boxId, contractData } = data;

  const hasMailConfig = process.env.MAIL_HOST
    && process.env.MAIL_PORT
    && process.env.MAIL_USER
    && process.env.MAIL_PASS
    && process.env.MAIL_FROM;

  if (!hasMailConfig) {
    throw buildHttpError(500, 'Configuration mail incomplete: MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASS, MAIL_FROM requis');
  }

  const safeFirstName = normalizeString(firstName);
  const safeLastName = normalizeString(lastName);
  const safeEmail = normalizeString(email).toLowerCase();

  const inputErrors = [];
  if (!safeFirstName) inputErrors.push({ field: 'firstName', message: 'Prenom obligatoire.' });
  if (!safeLastName) inputErrors.push({ field: 'lastName', message: 'Nom obligatoire.' });
  if (!safeEmail) inputErrors.push({ field: 'email', message: 'Email obligatoire.' });
  if (!boxId) inputErrors.push({ field: 'boxId', message: 'Box obligatoire.' });
  if (safeEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeEmail)) {
    inputErrors.push({ field: 'email', message: 'Email invalide.' });
  }
  if (inputErrors.length > 0) {
    throw buildHttpError(400, 'Donnees invalides.', inputErrors);
  }

  const session = await mongoose.startSession();
  let response = null;

  try {
    await session.withTransaction(async () => {
      const box = await Box.findById(boxId).session(session);
      if (!box) throw buildHttpError(404, 'Box introuvable');
      if (box.boutique) throw buildHttpError(400, 'Box deja occupee');

      const existingUser = await User.findOne({ email: safeEmail }).session(session);
      if (existingUser) {
        throw buildHttpError(409, 'Donnees invalides.', [
          { field: 'email', message: 'Cet email est deja utilise.' }
        ]);
      }

      const settings = await getGeneralSettings();
      const contractDefaults = {
        penaltyFee: settings.defaultPenaltyFee || 0,
        penaltyGrowthFactor: settings.penaltyGrowthFactor || 1,
        terminationFee: settings.defaultTerminationFee || 0,
        onlineSalesCommissionPercent: settings.defaultOnlineSalesCommissionPercent || 0
      };
      const validatedContractData = validateContractData(contractData, contractDefaults, box.monthlyRent || 0);

      const tempPassword = crypto.randomBytes(6).toString('hex');
      const tempPseudo = `boutique_${Date.now()}`;

      const user = new User({
        pseudo: tempPseudo,
        firstName: safeFirstName,
        lastName: safeLastName,
        email: safeEmail,
        password: tempPassword,
        role: 'BOUTIQUE',
        status: 'BLOCKED',
        isAccountCompleted: false
      });
      await user.save({ session });

      const boutique = new Boutique({
        name: `${safeFirstName} ${safeLastName} Boutique`,
        owner: user._id,
        box: box._id
      });
      await boutique.save({ session });

      box.boutique = boutique._id;
      await box.save({ session });

      const contract = new Contract({
        boutique: boutique._id,
        ...validatedContractData,
        status: 'ACTIVE'
      });
      await contract.save({ session });

      const rawToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = await bcrypt.hash(rawToken, 10);

      user.activationTokenHash = hashedToken;
      user.activationTokenExpires = Date.now() + 24 * 60 * 60 * 1000;
      user.boutique = boutique._id;
      await user.save({ session });

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
      const activationLink = `${frontendUrl}/activate-account?token=${rawToken}&id=${user._id}`;

      await sendActivationEmail(user.email, activationLink, user.firstName);

      response = {
        message: 'Utilisateur cree et email envoye',
        userId: user._id,
        activationLink,
        activationToken: process.env.NODE_ENV === 'production' ? undefined : rawToken
      };
    });
  } finally {
    await session.endSession();
  }

  return response;
};

module.exports = { createBoutiqueWithContract };
