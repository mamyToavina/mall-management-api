const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../users/user.model');
const Boutique = require('../boutique/boutique.model');
const Box = require('../boxes/box.model');
const Contract = require('../contracts/contract.model');
const { sendActivationEmail } = require('../../utils/mailer');

const createBoutiqueWithContract = async (data) => {
  const {
    firstName,
    lastName,
    email,
    boxId,
    contractData
  } = data;

  const hasMailConfig = process.env.MAIL_HOST
    && process.env.MAIL_PORT
    && process.env.MAIL_USER
    && process.env.MAIL_PASS
    && process.env.MAIL_FROM;

  if (!hasMailConfig) {
    throw new Error('Configuration mail incomplete: MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASS, MAIL_FROM requis');
  }

  const session = await mongoose.startSession();
  let response = null;

  try {
    await session.withTransaction(async () => {
      const box = await Box.findById(boxId).session(session);
      if (!box) throw new Error('Box introuvable');
      if (box.boutique) throw new Error('Box deja occupee');

      const tempPassword = crypto.randomBytes(6).toString('hex');
      const tempPseudo = `boutique_${Date.now()}`;

      const user = new User({
        pseudo: tempPseudo,
        firstName,
        lastName,
        email,
        password: tempPassword,
        role: 'BOUTIQUE',
        status: 'BLOCKED',
        isAccountCompleted: false
      });
      await user.save({ session });

      const boutique = new Boutique({
        name: `${firstName} ${lastName} Boutique`,
        owner: user._id
      });
      await boutique.save({ session });

      box.boutique = boutique._id;
      await box.save({ session });

      const contractStartDate = new Date(contractData.startDate);
      if (Number.isNaN(contractStartDate.getTime())) {
        throw new Error('contractData.startDate invalide');
      }

      const contractDurationMonths = Number(contractData.durationMonths);
      if (Number.isNaN(contractDurationMonths) || contractDurationMonths <= 0) {
        throw new Error('contractData.durationMonths invalide');
      }

      const computedEndDate = new Date(contractStartDate);
      computedEndDate.setMonth(computedEndDate.getMonth() + contractDurationMonths);

      const contract = new Contract({
        boutique: boutique._id,
        startDate: contractStartDate,
        endDate: computedEndDate,
        durationMonths: contractDurationMonths,
        monthlyRent: contractData.monthlyRent,
        details: contractData.details,
        status: contractData.status || 'ACTIVE'
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

      await sendActivationEmail(
        user.email,
        activationLink,
        user.firstName
      );

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
