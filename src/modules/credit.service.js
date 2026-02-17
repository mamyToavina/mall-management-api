const Credit = require("./credit.model");
const { generateCreditCode } = require("./credit.util");

const VALID_VALUES = [20000, 100000, 400000];

class CreditService {
  async generateCredits(adminId, value, quantity) {
    if (!VALID_VALUES.includes(value)) {
      throw new Error("Invalid credit value");
    }

    const credits = [];

    for (let i = 0; i < quantity; i++) {
      let code;
      let exists = true;

      while (exists) {
        code = generateCreditCode();
        exists = await Credit.exists({ code });
      }

      credits.push({
        code,
        value,
        createdBy: adminId,
        expiresAt: this.calculateExpiration()
      });
    }

    return await Credit.insertMany(credits);
  }

  calculateExpiration() {
    const date = new Date();
    date.setMonth(date.getMonth() + 6);
    return date;
  }

  async markAsPrinted(id) {
    const credit = await Credit.findById(id);

    if (!credit) throw new Error("Credit not found");
    if (credit.isPrinted) throw new Error("Already printed");

    credit.isPrinted = true;
    credit.printedAt = new Date();

    return await credit.save();
  }

  async useCredit(code, userId) {
    const credit = await Credit.findOne({ code });

    if (!credit) throw new Error("Credit not found");
    if (credit.status !== "active") throw new Error("Credit not active");
    if (credit.expiresAt < new Date()) throw new Error("Credit expired");

    const user = await User.findById(userId);
    if (!user) throw new Error("User not found");

    credit.status = "used";
    credit.usedBy = userId;
    credit.usedAt = new Date();

    await credit.save();

    user.credit += credit.value;
    await user.save();

    return { credit, newBalance: user.balance };
  }

  async getAll(query = {}) {
    return await Credit.find(query).sort({ createdAt: -1 });
  }
}

module.exports = new CreditService();
