const fs = require('fs');
const Contract = require('../contracts/contract.model');
const Box = require('../boxes/box.model');
const User = require('../users/user.model');
const Boutique = require('../boutique/boutique.model');
const ElectricityInvoice = require('./electricity-invoice.model');
const BillingCycle = require('./billing-cycle.model');
const BillingTrace = require('./billing-trace.model');
const { extractInvoiceDataFromPdf } = require('../../utils/pdf-invoice-parser');

const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const normalizeMeter = (value) =>
  String(value || '')
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9]/g, '');

const parseMonthYear = (query = {}) => {
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

const clampDayToMonth = (year, month, day) => {
  const lastDay = new Date(year, month, 0).getDate();
  return Math.min(day, lastDay);
};

const computeDueDateFromContract = (contractStartDate, month, year) => {
  if (!contractStartDate) return null;
  const start = new Date(contractStartDate);
  if (Number.isNaN(start.getTime())) return null;
  const day = clampDayToMonth(year, month, start.getDate());
  return new Date(year, month - 1, day, 0, 0, 0, 0);
};

const computeLateMonths = (dueDate, now = new Date()) => {
  if (!dueDate || now <= dueDate) return 0;
  let months = (now.getFullYear() - dueDate.getFullYear()) * 12 + (now.getMonth() - dueDate.getMonth());
  if (now.getDate() < dueDate.getDate()) {
    months -= 1;
  }
  return Math.max(1, months + 1);
};

const computePenaltyAmount = (baseFee, factor, monthsLate) => {
  if (!Number.isFinite(baseFee) || baseFee <= 0 || monthsLate <= 0) return 0;
  const safeFactor = Number.isFinite(factor) && factor > 0 ? factor : 1;
  return roundMoney(baseFee * Math.pow(safeFactor, monthsLate - 1));
};

class BillingService {
  async resolveBoutiqueFromUser(userId) {
    const user = await User.findById(userId).select('_id role boutique');
    if (!user) throw new Error('Utilisateur introuvable');

    let boutique = null;
    if (user.boutique) {
      boutique = await Boutique.findById(user.boutique).select('_id owner name');
    }

    if (!boutique) {
      boutique = await Boutique.findOne({ owner: user._id }).select('_id owner name');
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

  async ensureCycle({ boutique, month, year, activeContract, ownerUser, electricityAmount }) {
    const rentDue = activeContract ? roundMoney(activeContract.monthlyRent || 0) : 0;
    const dueDate = activeContract ? computeDueDateFromContract(activeContract.startDate, month, year) : null;

    const cycle = await BillingCycle.findOneAndUpdate(
      { boutique: boutique._id, month, year },
      {
        $setOnInsert: {
          boutique: boutique._id,
          ownerUser: ownerUser._id,
          month,
          year
        },
        $set: {
          rentDue,
          electricityDue: roundMoney(electricityAmount || 0),
          rentDueDate: dueDate,
          electricityDueDate: dueDate
        }
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    return cycle;
  }

  async recordTrace(payload, session = null) {
    if (session) {
      const created = await BillingTrace.create([payload], { session });
      return created[0];
    }
    return BillingTrace.create(payload);
  }

  summarizeLine(due, autoPaid, manualPaid) {
    const paid = roundMoney((autoPaid || 0) + (manualPaid || 0));
    const remaining = roundMoney(Math.max(0, (due || 0) - paid));
    const status = remaining <= 0 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID';
    return {
      due: roundMoney(due || 0),
      paid,
      autoPaid: roundMoney(autoPaid || 0),
      manualPaid: roundMoney(manualPaid || 0),
      remaining,
      status,
      autoDeducted: roundMoney(autoPaid || 0) > 0
    };
  }

  async applyAutoDebit({
    cycle,
    ownerUser,
    line,
    category,
    traceReason,
    referenceLabel,
    dueDate,
    session = null
  }) {
    const mapping = {
      RENT: { due: 'rentDue', auto: 'rentAutoPaid', manual: 'rentManualPaid' },
      ELECTRICITY: { due: 'electricityDue', auto: 'electricityAutoPaid', manual: 'electricityManualPaid' },
      PENALTY: { due: 'penaltyDue', auto: 'penaltyAutoPaid', manual: 'penaltyManualPaid' }
    };

    const cfg = mapping[category];
    const due = Number(cycle[cfg.due]) || 0;
    const paid = (Number(cycle[cfg.auto]) || 0) + (Number(cycle[cfg.manual]) || 0);
    const remainingBefore = roundMoney(Math.max(0, due - paid));

    if (remainingBefore <= 0) return;

    const available = Math.max(0, Number(ownerUser.credit) || 0);
    const paidAmount = roundMoney(Math.min(remainingBefore, available));
    if (paidAmount <= 0) return;

    ownerUser.credit = roundMoney(available - paidAmount);
    cycle[cfg.auto] = roundMoney((Number(cycle[cfg.auto]) || 0) + paidAmount);
    cycle.lastAutoProcessedAt = new Date();

    const remainingAfter = roundMoney(Math.max(0, remainingBefore - paidAmount));
    await this.recordTrace({
      boutique: cycle.boutique,
      ownerUser: cycle.ownerUser,
      month: cycle.month,
      year: cycle.year,
      category,
      action: 'AUTO_DEBIT',
      automatic: true,
      amount: remainingBefore,
      paidAmount,
      remainingAmount: remainingAfter,
      status: remainingAfter <= 0 ? 'APPLIED' : 'PARTIAL',
      reason: traceReason,
      referenceType: 'BILLING_CYCLE',
      referenceId: cycle._id,
      referenceLabel,
      details: {
        dueDate,
        line
      }
    }, session);
  }

  buildPenaltyBreakdown({ cycle, activeContract, rentLine, electricityLine, now }) {
    const basePenalty =
      Number(activeContract?.penaltyFee) ||
      Number(cycle.penaltyBreakdown?.rent?.baseFee) ||
      Number(cycle.penaltyBreakdown?.electricity?.baseFee) ||
      0;
    const factor =
      Number(activeContract?.penaltyGrowthFactor) ||
      Number(cycle.penaltyBreakdown?.rent?.growthFactor) ||
      Number(cycle.penaltyBreakdown?.electricity?.growthFactor) ||
      1;

    const rentLateMonths = rentLine.remaining > 0 ? computeLateMonths(cycle.rentDueDate, now) : 0;
    const electricityLateMonths = electricityLine.remaining > 0 ? computeLateMonths(cycle.electricityDueDate, now) : 0;

    const rentPenaltyDue = computePenaltyAmount(basePenalty, factor, rentLateMonths);
    const electricityPenaltyDue = computePenaltyAmount(basePenalty, factor, electricityLateMonths);

    cycle.penaltyBreakdown = {
      rent: {
        baseFee: basePenalty,
        monthsLate: rentLateMonths,
        growthFactor: factor,
        amountDue: rentPenaltyDue
      },
      electricity: {
        baseFee: basePenalty,
        monthsLate: electricityLateMonths,
        growthFactor: factor,
        amountDue: electricityPenaltyDue
      }
    };
    cycle.penaltyDue = roundMoney(rentPenaltyDue + electricityPenaltyDue);
  }

  async autoSettleOwnerOutstanding({ ownerUserId, session = null, trigger = 'CREDIT_INFLOW' }) {
    const ownerQuery = User.findById(ownerUserId);
    if (session) ownerQuery.session(session);
    const ownerUser = await ownerQuery;
    if (!ownerUser) return { settledAmount: 0, remainingCredit: 0 };

    const boutiqueQuery = Boutique.findOne({ owner: ownerUser._id }).select('_id owner name');
    if (session) boutiqueQuery.session(session);
    const boutique = await boutiqueQuery;
    if (!boutique) {
      return { settledAmount: 0, remainingCredit: roundMoney(Number(ownerUser.credit) || 0) };
    }

    const contractQuery = Contract.findOne({
      boutique: boutique._id,
      status: 'ACTIVE'
    }).sort({ endDate: -1 });
    if (session) contractQuery.session(session);
    const activeContract = await contractQuery;

    const cyclesQuery = BillingCycle.find({ boutique: boutique._id }).sort({ year: 1, month: 1 });
    if (session) cyclesQuery.session(session);
    const cycles = await cyclesQuery;

    const creditBefore = roundMoney(Number(ownerUser.credit) || 0);
    if (creditBefore <= 0 || cycles.length === 0) {
      return { settledAmount: 0, remainingCredit: creditBefore };
    }

    for (const cycle of cycles) {
      const rentLine = this.summarizeLine(cycle.rentDue, cycle.rentAutoPaid, cycle.rentManualPaid);
      const electricityLine = this.summarizeLine(
        cycle.electricityDue,
        cycle.electricityAutoPaid,
        cycle.electricityManualPaid
      );

      this.buildPenaltyBreakdown({
        cycle,
        activeContract,
        rentLine,
        electricityLine,
        now: new Date()
      });

      await this.applyAutoDebit({
        cycle,
        ownerUser,
        line: 'PENALTY',
        category: 'PENALTY',
        traceReason: `Prelevement automatique penalite (${trigger})`,
        referenceLabel: `PENALITE-${cycle.month}-${cycle.year}`,
        dueDate: cycle.electricityDueDate || cycle.rentDueDate,
        session
      });

      await this.applyAutoDebit({
        cycle,
        ownerUser,
        line: 'RENT',
        category: 'RENT',
        traceReason: `Prelevement automatique loyer (${trigger})`,
        referenceLabel: `LOYER-${cycle.month}-${cycle.year}`,
        dueDate: cycle.rentDueDate,
        session
      });

      await this.applyAutoDebit({
        cycle,
        ownerUser,
        line: 'ELECTRICITY',
        category: 'ELECTRICITY',
        traceReason: `Prelevement automatique electricite (${trigger})`,
        referenceLabel: `ELECTRICITE-${cycle.month}-${cycle.year}`,
        dueDate: cycle.electricityDueDate,
        session
      });

      if (session) {
        await cycle.save({ session });
      } else {
        await cycle.save();
      }

      if ((Number(ownerUser.credit) || 0) <= 0) break;
    }

    if (session) {
      await ownerUser.save({ session });
    } else {
      await ownerUser.save();
    }

    const creditAfter = roundMoney(Number(ownerUser.credit) || 0);
    return {
      settledAmount: roundMoney(Math.max(0, creditBefore - creditAfter)),
      remainingCredit: creditAfter
    };
  }

  async loadCommissionDetails(boutiqueId, month, year) {
    const rows = await BillingTrace.find({
      boutique: boutiqueId,
      month,
      year,
      category: 'COMMISSION',
      action: 'SALE_COMMISSION'
    })
      .sort({ createdAt: -1 })
      .lean();

    const items = rows.map((row) => ({
      traceId: row._id,
      saleReference: row.referenceLabel || row.details?.saleReference || '-',
      saleDate: row.details?.saleDate || row.createdAt,
      clientName: row.details?.clientName || '-',
      clientEmail: row.details?.clientEmail || '-',
      saleAmount: roundMoney(row.details?.saleAmount || row.amount || 0),
      commissionRate: Number(row.details?.commissionRate || 0),
      commissionAmount: roundMoney(row.paidAmount || 0),
      autoDeducted: true,
      status: row.status || 'APPLIED'
    }));

    const totalSalesAmount = roundMoney(items.reduce((sum, item) => sum + item.saleAmount, 0));
    const totalCommissionAmount = roundMoney(items.reduce((sum, item) => sum + item.commissionAmount, 0));

    return {
      totalSalesAmount,
      totalCommissionAmount,
      autoDeductedAmount: totalCommissionAmount,
      remainingAmount: 0,
      items
    };
  }

  async getMyBillingSummary(userId, query) {
    const boutique = await this.resolveBoutiqueFromUser(userId);
    const ownerUser = await User.findById(boutique.owner);
    if (!ownerUser) throw new Error('Proprietaire boutique introuvable');

    const { month, year } = parseMonthYear(query);
    const now = new Date();

    const activeContract = await Contract.findOne({
      boutique: boutique._id,
      status: 'ACTIVE'
    }).sort({ endDate: -1 });

    const electricityInvoices = await ElectricityInvoice.find({
      boutique: boutique._id,
      month,
      year
    }).sort({ createdAt: -1 });

    const electricityAmount = roundMoney(
      electricityInvoices.reduce((sum, inv) => sum + (Number(inv.netAmount) || 0), 0)
    );

    const cycle = await this.ensureCycle({
      boutique,
      month,
      year,
      activeContract,
      ownerUser,
      electricityAmount
    });

    const rentLine = this.summarizeLine(cycle.rentDue, cycle.rentAutoPaid, cycle.rentManualPaid);
    const electricityLine = this.summarizeLine(
      cycle.electricityDue,
      cycle.electricityAutoPaid,
      cycle.electricityManualPaid
    );

    this.buildPenaltyBreakdown({
      cycle,
      activeContract,
      rentLine,
      electricityLine,
      now
    });
    await cycle.save();
    await this.autoSettleOwnerOutstanding({
      ownerUserId: ownerUser._id,
      trigger: 'BILLING_REFRESH'
    });

    const refreshedCycle = await BillingCycle.findOne({ boutique: boutique._id, month, year });
    if (!refreshedCycle) throw new Error('Cycle de facturation introuvable');

    const finalRent = this.summarizeLine(
      refreshedCycle.rentDue,
      refreshedCycle.rentAutoPaid,
      refreshedCycle.rentManualPaid
    );
    const finalElectricity = this.summarizeLine(
      refreshedCycle.electricityDue,
      refreshedCycle.electricityAutoPaid,
      refreshedCycle.electricityManualPaid
    );
    const finalPenalty = this.summarizeLine(
      refreshedCycle.penaltyDue,
      refreshedCycle.penaltyAutoPaid,
      refreshedCycle.penaltyManualPaid
    );

    const commission = await this.loadCommissionDetails(boutique._id, month, year);

    const penaltyItems = [
      {
        source: 'RENT',
        reason: 'Loyer impaye a temps',
        baseFee: refreshedCycle.penaltyBreakdown?.rent?.baseFee || 0,
        monthsLate: refreshedCycle.penaltyBreakdown?.rent?.monthsLate || 0,
        growthFactor: refreshedCycle.penaltyBreakdown?.rent?.growthFactor || 1,
        amountDue: refreshedCycle.penaltyBreakdown?.rent?.amountDue || 0
      },
      {
        source: 'ELECTRICITY',
        reason: 'Electricite impayee a temps',
        baseFee: refreshedCycle.penaltyBreakdown?.electricity?.baseFee || 0,
        monthsLate: refreshedCycle.penaltyBreakdown?.electricity?.monthsLate || 0,
        growthFactor: refreshedCycle.penaltyBreakdown?.electricity?.growthFactor || 1,
        amountDue: refreshedCycle.penaltyBreakdown?.electricity?.amountDue || 0
      }
    ].filter((item) => item.amountDue > 0);

    const remaining = activeContract
      ? getYMDDiff(now, new Date(activeContract.endDate))
      : { years: 0, months: 0, days: 0, totalDays: 0 };

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
        rent: {
          ...finalRent,
          dueDate: refreshedCycle.rentDueDate
        },
        electricity: {
          ...finalElectricity,
          dueDate: refreshedCycle.electricityDueDate
        },
        totalToPay: roundMoney(finalRent.remaining + finalElectricity.remaining)
      },
      penalties: {
        ...finalPenalty,
        items: penaltyItems
      },
      commission,
      invoices: electricityInvoices
    };
  }

  async payLineNow({ userId, query, category, amount }) {
    const boutique = await this.resolveBoutiqueFromUser(userId);
    const ownerUser = await User.findById(boutique.owner);
    if (!ownerUser) throw new Error('Proprietaire boutique introuvable');

    const { month, year } = parseMonthYear(query);

    const summary = await this.getMyBillingSummary(userId, { month, year });
    const cycle = await BillingCycle.findOne({ boutique: boutique._id, month, year });
    if (!cycle) throw new Error('Cycle de facturation introuvable');

    const map = {
      RENT: {
        due: 'rentDue',
        auto: 'rentAutoPaid',
        manual: 'rentManualPaid',
        label: 'Loyer'
      },
      ELECTRICITY: {
        due: 'electricityDue',
        auto: 'electricityAutoPaid',
        manual: 'electricityManualPaid',
        label: 'Electricite'
      }
    };

    const cfg = map[category];
    if (!cfg) {
      throw new Error('Categorie de paiement manuel non autorisee');
    }
    const due = Number(cycle[cfg.due]) || 0;
    const alreadyPaid = (Number(cycle[cfg.auto]) || 0) + (Number(cycle[cfg.manual]) || 0);
    const remaining = roundMoney(Math.max(0, due - alreadyPaid));

    if (remaining <= 0) {
      return {
        message: `${cfg.label} deja regle.`,
        summary
      };
    }

    const requested = amount !== undefined && amount !== null ? Number(amount) : remaining;
    if (!Number.isFinite(requested) || requested <= 0) {
      throw new Error('Montant de paiement invalide');
    }

    const available = Math.max(0, Number(ownerUser.credit) || 0);
    const paidAmount = roundMoney(Math.min(requested, remaining, available));
    if (paidAmount <= 0) {
      throw new Error('Credit insuffisant pour payer maintenant');
    }

    ownerUser.credit = roundMoney(available - paidAmount);
    cycle[cfg.manual] = roundMoney((Number(cycle[cfg.manual]) || 0) + paidAmount);

    const remainingAfter = roundMoney(Math.max(0, remaining - paidAmount));

    await this.recordTrace({
      boutique: cycle.boutique,
      ownerUser: cycle.ownerUser,
      month,
      year,
      category,
      action: 'MANUAL_PAYMENT',
      automatic: false,
      amount: requested,
      paidAmount,
      remainingAmount: remainingAfter,
      status: remainingAfter <= 0 ? 'APPLIED' : 'PARTIAL',
      reason: `Paiement manuel ${cfg.label.toLowerCase()}`,
      referenceType: 'BILLING_CYCLE',
      referenceId: cycle._id,
      referenceLabel: `${cfg.label.toUpperCase()}-${month}-${year}`,
      details: {}
    });

    await ownerUser.save();
    await cycle.save();

    const updatedSummary = await this.getMyBillingSummary(userId, { month, year });
    return {
      message: `Paiement ${cfg.label.toLowerCase()} effectue.`,
      summary: updatedSummary
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

  async listMyTraces(userId, query = {}) {
    const boutique = await this.resolveBoutiqueFromUser(userId);
    const { month, year } = parseMonthYear(query);

    return BillingTrace.find({
      boutique: boutique._id,
      month,
      year
    })
      .sort({ createdAt: -1 })
      .limit(300);
  }

  async listAdminTraces(query = {}) {
    const parsed = parseMonthYear(query);
    const where = {
      month: parsed.month,
      year: parsed.year
    };
    if (query.boutiqueId) {
      where.boutique = query.boutiqueId;
    }
    if (query.category) {
      where.category = String(query.category).toUpperCase();
    }

    return BillingTrace.find(where)
      .populate('boutique', 'name')
      .populate('ownerUser', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .limit(500);
  }
}

module.exports = new BillingService();
