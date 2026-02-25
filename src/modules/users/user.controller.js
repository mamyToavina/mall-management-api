const User = require('./user.model.js')
const paginate = require('../../utils/pagination.js')
const fs = require('fs')
const path = require('path')
const bcrypt = require('bcryptjs')

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ALLOWED_GENDERS = ['Male', 'Female', 'Other']

const formatUser = (user) => ({
  id: user._id,
  pseudo: user.pseudo,
  email: user.email,
  avatar: user.avatar || null,
  firstName: user.firstName || '',
  lastName: user.lastName || '',
  gender: user.gender || undefined,
  role: user.role,
  status: user.status,
  credit: Number(user.credit || 0)
})

const cleanupUploadedFile = (file) => {
  if (!file?.path) return
  if (fs.existsSync(file.path)) fs.unlinkSync(file.path)
}

const cleanupAvatarByPath = (avatarPath) => {
  if (!avatarPath || typeof avatarPath !== 'string') return
  if (!avatarPath.startsWith('/uploads/')) return
  const absolutePath = path.join(process.cwd(), avatarPath.replace(/^\//, ''))
  if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath)
}

const registerUser = async (req, res) => {
  try {
    const { email, password, pseudo, firstName, lastName, gender} = req.body;

    if (!email || !password || !pseudo) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: "Pseudo, email et mot de passe obligatoires" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: "Email déjà utilisé" });
    }

    const user = await User.create({
      pseudo,
      email,
      firstName,
      lastName,
      gender,
      password,
      role: 'USER',
      status: 'ACTIVE',
      isAccountCompleted: true,
      avatar: req.file ? `/uploads/users/${req.file.filename}` : null
    });

    res.status(201).json({
      message: 'Compte créé',
      user: {
        id: user._id,
        pseudo: user.pseudo,
        email: user.email,
        avatar: user.avatar,
        firstName: user.firstName,
        lastName: user.lastName,
        gender: user.gender,
        role: user.role,
        status: user.status
      }
    });
  } catch (err) {

    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    console.error(err);
    if (err.code === 11000) {
      return res.status(400).json({ message: "Email déjà utilisé" });
    }
    res.status(500).json({ message: err.message });
  }
};



const getAllUsers = async (req, res, next) => {
  try {
    const { page, limit, search, status } = req.query

    const query = {
      role: 'USER',
      ...(status && { status }),
      ...(search && {
        $or: [
          { pseudo: new RegExp(search, 'i') },
          { email: new RegExp(search, 'i') }
        ]
      })
    }

    const data = await paginate(User, query, page, limit)
    res.json(data)
  } catch (err) {
    next(err)
  }
}


const getUserById = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('-password')
    res.json(user)
  } catch (err) {
    next(err)
  }
}

const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id)
    if (!user) return res.status(404).json({ message: 'Utilisateur introuvable' })
    res.json({ user: formatUser(user) })
  } catch (err) {
    next(err)
  }
}

const updateMe = async (req, res, next) => {
  let avatarPersisted = false

  try {
    const user = await User.findById(req.user.id)
    if (!user) {
      cleanupUploadedFile(req.file)
      return res.status(404).json({ message: 'Utilisateur introuvable' })
    }

    const errors = []
    const has = (field) => Object.prototype.hasOwnProperty.call(req.body, field)

    if (has('pseudo')) {
      const pseudo = String(req.body.pseudo || '').trim()
      if (!pseudo) {
        errors.push({ field: 'pseudo', message: 'Le pseudo est obligatoire.' })
      } else {
        const existingPseudo = await User.findOne({ pseudo, _id: { $ne: user._id } })
        if (existingPseudo) {
          errors.push({ field: 'pseudo', message: 'Ce pseudo est deja utilise.' })
        }
      }
    }

    if (has('email')) {
      const email = String(req.body.email || '').trim()
      if (!email || !EMAIL_REGEX.test(email)) {
        errors.push({ field: 'email', message: 'L email n est pas valide.' })
      } else {
        const existingEmail = await User.findOne({ email, _id: { $ne: user._id } })
        if (existingEmail) {
          errors.push({ field: 'email', message: 'Cet email est deja utilise.' })
        }
      }
    }

    if (has('gender')) {
      const gender = String(req.body.gender || '').trim()
      if (gender && !ALLOWED_GENDERS.includes(gender)) {
        errors.push({ field: 'gender', message: 'Le genre selectionne est invalide.' })
      }
    }

    const nextPassword = String(req.body.newPassword || '')
    const currentPassword = String(req.body.currentPassword || '')
    if (nextPassword) {
      if (!currentPassword) {
        errors.push({
          field: 'currentPassword',
          message: 'Le mot de passe actuel est obligatoire pour changer le mot de passe.'
        })
      }
      if (nextPassword.length < 8) {
        errors.push({
          field: 'newPassword',
          message: 'Le nouveau mot de passe doit contenir au moins 8 caracteres.'
        })
      }
    }

    if (errors.length > 0) {
      cleanupUploadedFile(req.file)
      return res.status(400).json({
        message: 'Veuillez corriger les champs invalides.',
        errors
      })
    }

    if (has('pseudo')) user.pseudo = String(req.body.pseudo || '').trim()
    if (has('email')) user.email = String(req.body.email || '').trim()
    if (has('firstName')) user.firstName = String(req.body.firstName || '').trim()
    if (has('lastName')) user.lastName = String(req.body.lastName || '').trim()
    if (has('gender')) {
      const gender = String(req.body.gender || '').trim()
      user.gender = gender || undefined
    }

    if (nextPassword) {
      const passwordMatches = await bcrypt.compare(currentPassword, user.password)
      if (!passwordMatches) {
        cleanupUploadedFile(req.file)
        return res.status(400).json({
          message: 'Veuillez corriger les champs invalides.',
          errors: [{ field: 'currentPassword', message: 'Le mot de passe actuel est incorrect.' }]
        })
      }
      user.password = nextPassword
    }

    const previousAvatar = user.avatar
    if (req.file) {
      user.avatar = `/uploads/users/${req.file.filename}`
    }

    await user.save()
    avatarPersisted = !!req.file

    if (req.file && previousAvatar && previousAvatar !== user.avatar) {
      cleanupAvatarByPath(previousAvatar)
    }

    res.json({
      message: 'Profil mis a jour.',
      user: formatUser(user)
    })
  } catch (err) {
    if (req.file && !avatarPersisted) cleanupUploadedFile(req.file)
    next(err)
  }
}


const blockUser = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { status: 'BLOCKED', blockedAt: new Date() },
      { new: true }
    )
    res.json(user)
  } catch (err) {
    next(err)
  }
}


const unblockUser = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { status: 'ACTIVE', blockedAt: null },
      { new: true }
    )
    res.json(user)
  } catch (err) {
    next(err)
  }
}


module.exports = {
  registerUser,
  getAllUsers,
  getUserById,
  getMe,
  updateMe,
  blockUser,
  unblockUser
}
