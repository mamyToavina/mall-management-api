const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  pseudo: { type: String, required: true },
  email: { 
    type: String, 
    required: true, 
    unique: true, 
    validate: {
      validator: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      message: props => `${props.value} is not a valid email!`
    }
  },
  password: { 
    type: String, 
    required: true, 
    minlength: 8 
  },

  firstName: String,
  lastName: String,
  gender: { type: String, enum: ['Male', 'Female', 'Other'] },
  avatar: String,

  credit: { type: Number, default: 0 },

  status: {
    type: String,
    enum: ['ACTIVE', 'BLOCKED', 'DELETED'],
    default: 'ACTIVE'
  },

  role: {
    type: String,
    enum: ['USER', 'ADMIN', 'BOUTIQUE'],
    default: 'USER'
  },


  refreshTokenHash: { type: String, default: null },

  isAccountCompleted: { type: Boolean, default: false },


  blockedAt: Date,

  activationTokenHash: {
    type: String,
    default: null
  },
  
  activationTokenExpires: {
    type: Date,
    default: null
  },
  

  boutique: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Boutique'
  }

}, { timestamps: true })

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return

  this.password = await bcrypt.hash(this.password, 10)
})


userSchema.methods.toJSON = function () {
  const obj = this.toObject()
  delete obj.password
  return obj
}

module.exports = mongoose.model('User', userSchema)

