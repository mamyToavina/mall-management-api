const fs = require('fs');
const Contract = require('../contracts/contract.model');
const Box = require('../boxes/box.model');
const User = require('../users/user.model');
const Boutique = require('../boutique/boutique.model');
const ElectricityInvoice = require('./electricity-invoice.model');
const { extractInvoiceDataFromPdf } = require('../../utils/pdf-invoice-parser');

const normalizeMeter = (value) =>
  String(value || '')
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9]/g, '');

const parseMonthYear = (query) => {
  const now = new Date();
  const month = query.month ? Number(query.month) : now.getMonth() + 1;
  const year = query.year ? Number(query.year) : now.getFullYear();

  if (Number.isNaN(month) || month < 1 || month > 12) {
    throw new Error('month invalide (1-12)');
  }
  if (Number.isNaN(year) || year < 2000 || year > 3000) {
    throw new Error('year invalide');
  }

  return { month, year };
};

const getYMDDiff = (fromDate, toDate) => {
  if (!fromDate || !toDate || toDate < fromDate) {
    return { years: 0, months: 0, days: 0, totalDays: 0 };
  }

  const from = new Date(fromDate);
  const to = new Date(toDate);

  const totalDays = Math.ceil((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));

  let years = to.getFullYear() - from.getFullYear();
  let months = to.getMonth() - from.getMonth();
  let days = to.getDate() - from.getDate();

  if (days < 0) {
    months -= 1;
    const prevMonthDays = new Date(to.getFullYear(), to.getMonth(), 0).getDate();
    days += prevMonthDays;
  }

  if (months < 0) {
    years -= 1;
    months += 12;
  }

  return { years, months, days, totalDays };
};

class BillingService {
  async resolveBoutiqueFromUser(userId) {
    const user = await User.findById(userId).select('_id role boutique');
    if (!user) throw new Error('Utilisateur introuvable');

    let boutique = null;
    if (user.boutique) {
      boutique = await Boutique.findById(user.boutique).select('_id owner');
    }

    if (!boutique) {
      boutique = await Boutique.findOne({ owner: user._id }).select('_id owner');
    }

    if (!boutique) throw new Error('Aucune boutique liee a ce compte');
    return boutique;
  }

  async findBoxByMeterNumber(meterNumber) {
    const exact = await Box.findOne({ electricityMeterNumber: meterNumber }).select('_id boutique electricityMeterNumber');
    if (exact) return exact;

    const normalizedTarget = normalizeMeter(meterNumber);
    const allWithMeter = await Box.find({
      electricityMeterNumber: { $exists: true, $ne: null, $ne: '' }
    }).select('_id boutique electricityMeterNumber');

    return allWithMeter.find((box) => normalizeMeter(box.electricityMeterNumber) === normalizedTarget) || null;
  }

  async uploadElectricityInvoices(adminUserId, files, month, year) {
    if (!files || files.length === 0) {
      throw new Error('Aucun fichier PDF fourni');
    }

    const parsedMonth = Number(month);
    const parsedYear = Number(year);

    if (Number.isNaN(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) {
      throw new Error('month invalide (1-12)');
    }
    if (Number.isNaN(parsedYear) || parsedYear < 2000 || parsedYear > 3000) {
      throw new Error('year invalide');
    }

    const successes = [];
    const errors = [];

    for (const file of files) {
      try {
        const { meterNumber, netAmount } = await extractInvoiceDataFromPdf(file.path);
        const box = await this.findBoxByMeterNumber(meterNumber);

        if (!box) throw new Error(`Compteur introuvable: ${meterNumber} | NET A PAYER detecte: ${netAmount}`);
        if (!box.boutique) throw new Error(`Aucune boutique associee au compteur: ${meterNumber}`);

        const saved = await ElectricityInvoice.findOneAndUpdate(
          {
            boutique: box.boutique,
            meterNumber: box.electricityMeterNumber || meterNumber,
            month: parsedMonth,
            year: parsedYear
          },
          {
            boutique: box.boutique,
            box: box._id,
            meterNumber: box.electricityMeterNumber || meterNumber,
            month: parsedMonth,
            year: parsedYear,
            netAmount,
            sourceFilePath: `/uploads/invoices/${file.filename}`,
            sourceFileName: file.originalname,
            uploadedBy: adminUserId
          },
          { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
        );

        successes.push({
          fileName: file.originalname,
          invoiceId: saved._id,
          boutiqueId: saved.boutique,
          meterNumber: saved.meterNumber,
          netAmount: saved.netAmount
        });
      } catch (error) {
        if (file.path && fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }

        errors.push({
          fileName: file.originalname,
          message: error.message
        });
      }
    }

    return {
      month: parsedMonth,
      year: parsedYear,
      uploaded: successes.length,
      failed: errors.length,
      successes,
      errors
    };
  }

  async getMyBillingSummary(userId, query) {
    const boutique = await this.resolveBoutiqueFromUser(userId);
    const { month, year } = parseMonthYear(query);

    const now = new Date();
    const activeContract = await Contract.findOne({
      boutique: boutique._id,
      status: 'ACTIVE'
    }).sort({ endDate: -1 });

    const remaining = activeContract
      ? getYMDDiff(now, new Date(activeContract.endDate))
      : { years: 0, months: 0, days: 0, totalDays: 0 };

    const electricityInvoices = await ElectricityInvoice.find({
      boutique: boutique._id,
      month,
      year
    }).sort({ createdAt: -1 });

    const electricityAmount = electricityInvoices.reduce((sum, inv) => sum + (inv.netAmount || 0), 0);
    const commissionsAmount = electricityInvoices.reduce((sum, inv) => sum + (inv.commissionAmount || 0), 0);
    const rentAmount = activeContract ? activeContract.monthlyRent : 0;
    const totalDue = rentAmount + electricityAmount + commissionsAmount;

    return {
      filter: { month, year },
      contract: activeContract
        ? {
            id: activeContract._id,
            startDate: activeContract.startDate,
            endDate: activeContract.endDate,
            monthlyRent: activeContract.monthlyRent,
            remaining
          }
        : null,
      dues: {
        rentAmount,
        electricityAmount,
        commissionsAmount,
        totalDue
      },
      invoices: electricityInvoices
    };
  }

  async listMyInvoices(userId, query) {
    const boutique = await this.resolveBoutiqueFromUser(userId);
    const { month, year } = parseMonthYear(query);

    return ElectricityInvoice.find({
      boutique: boutique._id,
      month,
      year
    }).sort({ createdAt: -1 });
  }

  async getMyInvoiceById(userId, invoiceId) {
    const boutique = await this.resolveBoutiqueFromUser(userId);
    return ElectricityInvoice.findOne({ _id: invoiceId, boutique: boutique._id });
  }
}

module.exports = new BillingService();
