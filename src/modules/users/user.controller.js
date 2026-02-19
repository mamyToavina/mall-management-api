const User = require('./user.model.js')
const paginate = require('../../utils/pagination.js')
const fs = require('fs')

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
      role: 'ADMIN',
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
  blockUser,
  unblockUser
}
