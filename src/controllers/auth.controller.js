const User = require("../models/User.model");
const { hashPassword, comparePassword } = require("../utils/password.util");
const { generateToken } = require("../utils/token.util");
const asyncHandler = require("../utils/asyncHandler");

exports.register = asyncHandler(async (req, res) => {
  const { email, password, role, profile } = req.body;

  const exists = await User.findOne({ email });
  if (exists) {
    return res.status(409).json({ message: "Email already in use" });
  }

  const hashedPassword = await hashPassword(password);

  const user = await User.create({
    email,
    password: hashedPassword,
    role,
    profile
  });

  res.status(201).json({
    message: "User created successfully",
    userId: user._id
  });
});

exports.createBoutique = asyncHandler(async (req, res) => {
    const {
      email,
      password,
      name,
      ownerName,
      address,
      boutiqueNumber
    } = req.body;
  
    // Vérifier email unique
    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(409).json({ message: "Email already exists" });
    }
  
    const hashedPassword = await hashPassword(password);
  
    const boutiqueUser = await User.create({
      email,
      password: hashedPassword,
      role: "boutique",
      profile: {
        name,
        boutique: {
          ownerName,
          address,
          boutiqueNumber
        }
      }
    });
  
    res.status(201).json({
      message: "Boutique created successfully",
      boutiqueId: boutiqueUser._id
  });
});
  

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select("+password");
  if (!user) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const isMatch = await comparePassword(password, user.password);
  if (!isMatch) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const token = generateToken({
    id: user._id,
    role: user.role
  });

  res.json({
    token,
    user: {
      id: user._id,
      email: user.email,
      role: user.role
    }
  });
});
