const crypto = require('crypto');
const bcrypt = require('bcryptjs');
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

  const box = await Box.findById(boxId);
  if (!box) throw new Error("Box introuvable");
  if (box.boutique) throw new Error("Box déjà occupée");

  const tempPassword = crypto.randomBytes(6).toString('hex');

  const user = await User.create({
    firstName,
    lastName,
    email,
    password: tempPassword,
    role: 'BOUTIQUE',
    status: 'BLOCKED',
    isAccountCompleted: false
  });

  const boutique = await Boutique.create({
    name: `${firstName} ${lastName} Boutique`,
    owner: user._id,
    box: box._id
  });


  box.boutique = boutique._id;
  await box.save();

  await Contract.create({
    ...contractData,
    boutique: boutique._id
  });

  const rawToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = await bcrypt.hash(rawToken, 10);

  user.activationTokenHash = hashedToken;
  user.activationTokenExpires = Date.now() + 24 * 60 * 60 * 1000;
  await user.save();

  const activationLink = `${process.env.FRONTEND_URL}/activate-account?token=${rawToken}&id=${user._id}`;

  await sendActivationEmail(
    user.email,
    activationLink,
    user.firstName
  );
  
  return { message: "Utilisateur créé et email envoyé" };
  
};

module.exports = { createBoutiqueWithContract };
