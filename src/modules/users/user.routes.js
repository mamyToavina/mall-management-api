const express = require('express')
const { protect } = require('../../middlewares/auth.middleware');

const {
  getAllUsers,
  getUserById,
  blockUser,
  registerUser,
  unblockUser,
  getMe,
  updateMe
} = require('./user.controller.js')

const { FOLDERS } = require("../../config/upload");

const { createImageUploader } = require("../../middlewares/upload.middleware.js");

const uploadUserProfil = createImageUploader({
  subFolder: FOLDERS.user,
  fieldName: "avatar",
  maxSizeMB: 5,
});

const router = express.Router()
router.post('/registerUser', uploadUserProfil, registerUser)
router.get('/me', protect, getMe)
router.patch('/me', protect, uploadUserProfil, updateMe)

//router.use(auth, role('ADMIN'))
//router.use(protect)
router.get('/', getAllUsers)
router.get('/:id', getUserById)
router.patch('/:id/block', blockUser)
router.patch('/:id/unblock', unblockUser)

module.exports = router
