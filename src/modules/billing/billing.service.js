const fs = require('fs');
const Contract = require('../contracts/contract.model');
const Box = require('../boxes/box.model');
const User = require('../users/user.model');
const Boutique = require('../boutique/boutique.model');
const Sale = require('../sales/sale.model');
const Product = require('../products/product.model');
const BoutiqueReview = require('../reviews/review.model');
const Activity = require('../activities/activity.model');
const ElectricityInvoice = require('./electricity-invoice.model');
const BillingCycle = require('./billing-cycle.model');
const BillingTrace = require('./billing-trace.model');
const { extractInvoiceDataFromPdf } = require('../../utils/pdf-invoice-parser');
const { emitToRole, emitToUser } = require('../../socket');

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

  const isFirstContractMonth =
    start.getFullYear() === Number(year) && start.getMonth() + 1 === Number(month);

  if (isFirstContractMonth) {
    // First month: auto-debit is allowed from contract start date.
    const day = clampDayToMonth(year, month, start.getDate());
    return new Date(year, month - 1, day, 0, 0, 0, 0);
  }

  // Following months: auto-debit at end of month if unpaid.
  const endDay = new Date(year, month, 0).getDate();
  return new Date(year, month - 1, endDay, 23, 59, 59, 999);
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

const hasReachedDueDate = (dueDate, now = new Date()) => {
  if (!dueDate) return false;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return false;
  return now.getTime() >= due.getTime();
};

class BillingService {
  parseDateBoundary(input, endOfDay = false) {
    if (!input) return null;

    const raw = String(input).trim();
    const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (dateOnlyMatch) {
      const year = Number(dateOnlyMatch[1]);
      const month = Number(dateOnlyMatch[2]);
      const day = Number(dateOnlyMatch[3]);
      if (endOfDay) return new Date(year, month - 1, day, 23, 59, 59, 999);
      return new Date(year, month - 1, day, 0, 0, 0, 0);
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return null;
    if (endOfDay) {
      parsed.setHours(23, 59, 59, 999);
    }
    return parsed;
  }

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

  async findContractForBillingPeriod(boutiqueId, month, year, session = null) {
    const periodStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const periodEnd = new Date(year, month, 0, 23, 59, 59, 999);

    const query = Contract.findOne({
      boutique: boutiqueId,
      status: { $in: ['ACTIVE', 'SCHEDULED'] },
      startDate: { $lte: periodEnd },
      endDate: { $gte: periodStart }
    }).sort({ endDate: -1 });

    if (session) query.session(session);
    return query;
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
      status: { $in: ['ACTIVE', 'SCHEDULED'] },
      startDate: { $lte: new Date() }
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

    const now = new Date();
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
        now
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

      if (hasReachedDueDate(cycle.rentDueDate, now)) {
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
      }

      if (hasReachedDueDate(cycle.electricityDueDate, now)) {
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
      }

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
    if (creditAfter !== creditBefore) {
      emitToUser(ownerUserId, 'credit:updated', { credit: creditAfter });
      emitToRole('ADMIN', 'dashboard:admin:update', { source: 'auto-settle' });
    }
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

    const activeContract = await this.findContractForBillingPeriod(boutique._id, month, year);

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
            durationMonths: activeContract.durationMonths,
            monthlyRent: activeContract.monthlyRent,
            penaltyFee: activeContract.penaltyFee,
            penaltyGrowthFactor: activeContract.penaltyGrowthFactor,
            terminationFee: activeContract.terminationFee,
            onlineSalesCommissionPercent: activeContract.onlineSalesCommissionPercent,
            notes: activeContract.notes || '',
            status: activeContract.status,
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

    emitToUser(ownerUser._id, 'credit:updated', { credit: Number(ownerUser.credit || 0) });
    emitToRole('ADMIN', 'dashboard:admin:update', { source: 'manual-payment' });

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

  lineMetrics(cycle, key) {
    const map = {
      RENT: { due: 'rentDue', auto: 'rentAutoPaid', manual: 'rentManualPaid' },
      ELECTRICITY: { due: 'electricityDue', auto: 'electricityAutoPaid', manual: 'electricityManualPaid' },
      PENALTY: { due: 'penaltyDue', auto: 'penaltyAutoPaid', manual: 'penaltyManualPaid' }
    };

    const cfg = map[key];
    const due = Number(cycle?.[cfg.due]) || 0;
    const paid = (Number(cycle?.[cfg.auto]) || 0) + (Number(cycle?.[cfg.manual]) || 0);
    const remaining = roundMoney(Math.max(0, due - paid));
    return {
      due: roundMoney(due),
      paid: roundMoney(paid),
      remaining
    };
  }

  isCycleBefore({ month, year }, { selectedMonth, selectedYear }) {
    if (year < selectedYear) return true;
    if (year > selectedYear) return false;
    return month < selectedMonth;
  }

  ymFromDate(dateLike) {
    const d = new Date(dateLike);
    return {
      month: d.getMonth() + 1,
      year: d.getFullYear()
    };
  }

  isYmBefore(a, b) {
    if (a.year < b.year) return true;
    if (a.year > b.year) return false;
    return a.month < b.month;
  }

  isYmAfter(a, b) {
    if (a.year > b.year) return true;
    if (a.year < b.year) return false;
    return a.month > b.month;
  }

  isCycleWithinYmRange(cycle, fromYm, toYm) {
    const c = { month: Number(cycle.month), year: Number(cycle.year) };
    return !this.isYmBefore(c, fromYm) && !this.isYmAfter(c, toYm);
  }

  parseDashboardDays(rawDays) {
    const parsed = Number(rawDays);
    if (!Number.isFinite(parsed)) return 30;
    return Math.max(7, Math.min(180, Math.trunc(parsed)));
  }

  async listAdminBoutiqueMonthlySummary(query = {}) {
    const { month: selectedMonth, year: selectedYear } = parseMonthYear(query);
    const selectedYm = { month: selectedMonth, year: selectedYear };
    const periodStart = new Date(selectedYear, selectedMonth - 1, 1, 0, 0, 0, 0);
    const periodEnd = new Date(selectedYear, selectedMonth, 0, 23, 59, 59, 999);

    const boutiques = await Boutique.find({}).select('_id name owner');
    const contracts = await Contract.find({
      startDate: { $lte: periodEnd },
      endDate: { $gte: periodStart }
    })
      .select('_id boutique startDate endDate status durationMonths')
      .sort({ startDate: -1 })
      .lean();

    const contractByBoutique = new Map();
    for (const contract of contracts) {
      const bId = String(contract.boutique);
      if (!contractByBoutique.has(bId)) {
        contractByBoutique.set(bId, contract);
      }
    }

    const cycles = await BillingCycle.find({
      $or: [
        { year: { $lt: selectedYear } },
        { year: selectedYear, month: { $lte: selectedMonth } }
      ]
    })
      .sort({ year: 1, month: 1 })
      .lean();

    const cyclesByBoutique = new Map();
    for (const cycle of cycles) {
      const key = String(cycle.boutique);
      const bucket = cyclesByBoutique.get(key) || [];
      bucket.push(cycle);
      cyclesByBoutique.set(key, bucket);
    }

    const rows = boutiques
      .map((boutique) => {
      const bId = String(boutique._id);
      const contract = contractByBoutique.get(bId);
      if (!contract) {
        return null;
      }

      const contractStartYm = this.ymFromDate(contract.startDate);
      const allCycles = cyclesByBoutique.get(bId) || [];
      const cyclesInContract = allCycles.filter((cycle) =>
        this.isCycleWithinYmRange(cycle, contractStartYm, selectedYm)
      );

      const arrearsCycles = cyclesInContract.filter((cycle) =>
        this.isCycleBefore(
          { month: Number(cycle.month), year: Number(cycle.year) },
          { selectedMonth, selectedYear }
        )
      );

      const currentCycle =
        cyclesInContract.find(
          (cycle) => Number(cycle.month) === selectedMonth && Number(cycle.year) === selectedYear
        ) ||
        null;

      const arrears = {
        rent: { due: 0, paid: 0, remaining: 0 },
        electricity: { due: 0, paid: 0, remaining: 0 }
      };

      for (const cycle of arrearsCycles) {
        const rent = this.lineMetrics(cycle, 'RENT');
        const electricity = this.lineMetrics(cycle, 'ELECTRICITY');
        arrears.rent.due += rent.due;
        arrears.rent.paid += rent.paid;
        arrears.rent.remaining += rent.remaining;
        arrears.electricity.due += electricity.due;
        arrears.electricity.paid += electricity.paid;
        arrears.electricity.remaining += electricity.remaining;
      }

      const current = {
        rent: this.lineMetrics(currentCycle, 'RENT'),
        electricity: this.lineMetrics(currentCycle, 'ELECTRICITY'),
        penalty: this.lineMetrics(currentCycle, 'PENALTY')
      };

      const totalDue = roundMoney(
        arrears.rent.due +
          arrears.electricity.due +
          current.rent.due +
          current.electricity.due +
          current.penalty.due
      );
      const totalReceived = roundMoney(
        arrears.rent.paid +
          arrears.electricity.paid +
          current.rent.paid +
          current.electricity.paid +
          current.penalty.paid
      );
      const totalRemaining = roundMoney(
        arrears.rent.remaining +
          arrears.electricity.remaining +
          current.rent.remaining +
          current.electricity.remaining +
          current.penalty.remaining
      );

      return {
        boutique: {
          _id: boutique._id,
          name: boutique.name
        },
        filter: { month: selectedMonth, year: selectedYear },
        totals: {
          due: totalDue,
          received: totalReceived,
          remaining: totalRemaining
        },
        details: {
          arrearsOtherMonths: {
            rent: {
              ...arrears.rent,
              cyclesCount: arrearsCycles.length
            },
            electricity: {
              ...arrears.electricity,
              cyclesCount: arrearsCycles.length
            }
          },
          currentMonth: current,
          cycles: cyclesInContract.map((cycle) => ({
            month: cycle.month,
            year: cycle.year,
            rent: this.lineMetrics(cycle, 'RENT'),
            electricity: this.lineMetrics(cycle, 'ELECTRICITY'),
            penalty: this.lineMetrics(cycle, 'PENALTY')
          }))
        }
      };
    })
      .filter(Boolean);

    rows.sort((a, b) => a.boutique.name.localeCompare(b.boutique.name, 'fr'));
    return rows;
  }

  async getAdminDashboard(query = {}) {
    const days = this.parseDashboardDays(query.days);
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    periodStart.setHours(0, 0, 0, 0);

    const [boutiques, boxes] = await Promise.all([
      Boutique.find({}).select('_id name status').lean(),
      Box.find({}).select('_id floor boutique').lean()
    ]);

    const boutiqueNameById = new Map(boutiques.map((b) => [String(b._id), b.name]));

    const dayMap = new Map();
    for (let i = 0; i < days; i += 1) {
      const d = new Date(periodStart.getTime() + i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      dayMap.set(key, { revenue: 0, orders: 0 });
    }

    const statusKeys = ['SCHEDULED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'REJECTED'];
    const statusGlobal = new Map(statusKeys.map((key) => [key, 0]));
    const byBoutique = new Map();

    const sales = await Sale.find({
      placedAt: { $gte: periodStart, $lte: periodEnd },
      status: { $ne: 'CANCELLED' }
    })
      .select('placedAt boutiqueBreakdown items')
      .lean();

    for (const sale of sales) {
      const placedKey = new Date(sale.placedAt).toISOString().slice(0, 10);
      for (const breakdown of sale.boutiqueBreakdown || []) {
        const boutiqueId = String(breakdown.boutique);
        const items = (sale.items || []).filter((item) => String(item.boutique) === boutiqueId);
        const revenueFromItems = roundMoney(
          items.reduce((sum, item) => {
            const grand = Number(item.lineGrandTotal);
            if (Number.isFinite(grand)) return sum + grand;
            return sum + (Number(item.lineTotal) || 0) + (Number(item.lineTax) || 0);
          }, 0)
        );
        const revenue = revenueFromItems > 0 ? revenueFromItems : roundMoney(Number(breakdown.subtotal) || 0);

        const day = dayMap.get(placedKey);
        if (day) {
          day.revenue = roundMoney(day.revenue + revenue);
          day.orders += 1;
        }

        statusGlobal.set(
          breakdown.fulfillmentStatus,
          (statusGlobal.get(breakdown.fulfillmentStatus) || 0) + 1
        );

        const current = byBoutique.get(boutiqueId) || {
          revenue: 0,
          orders: 0,
          rejected: 0,
          delivered: 0
        };
        current.revenue = roundMoney(current.revenue + revenue);
        current.orders += 1;
        if (breakdown.fulfillmentStatus === 'REJECTED') current.rejected += 1;
        if (breakdown.fulfillmentStatus === 'DELIVERED') current.delivered += 1;
        byBoutique.set(boutiqueId, current);
      }
    }

    const totalBoutiqueOrders = [...statusGlobal.values()].reduce((sum, value) => sum + value, 0);
    const delivered = statusGlobal.get('DELIVERED') || 0;
    const rejected = statusGlobal.get('REJECTED') || 0;

    const totalRevenue = roundMoney([...dayMap.values()].reduce((sum, row) => sum + row.revenue, 0));
    const averageOrderValue =
      totalBoutiqueOrders > 0 ? roundMoney(totalRevenue / totalBoutiqueOrders) : 0;

    const occupiedBoxes = boxes.filter((box) => Boolean(box.boutique)).length;
    const floors = new Map();
    for (const box of boxes) {
      const floor = Number(box.floor) || 0;
      const floorEntry = floors.get(floor) || { floor, total: 0, occupied: 0, free: 0 };
      floorEntry.total += 1;
      if (box.boutique) floorEntry.occupied += 1;
      else floorEntry.free += 1;
      floors.set(floor, floorEntry);
    }

    const now = new Date();
    const selectedYm = { month: now.getMonth() + 1, year: now.getFullYear() };
    const cycles = await BillingCycle.find({
      $or: [
        { year: { $lt: selectedYm.year } },
        { year: selectedYm.year, month: { $lte: selectedYm.month } }
      ]
    })
      .select(
        'boutique month year rentDue rentAutoPaid rentManualPaid electricityDue electricityAutoPaid electricityManualPaid penaltyDue penaltyAutoPaid penaltyManualPaid'
      )
      .lean();

    const outstandingByBoutique = new Map();
    let totalOutstanding = 0;
    for (const cycle of cycles) {
      const rent = this.lineMetrics(cycle, 'RENT');
      const elec = this.lineMetrics(cycle, 'ELECTRICITY');
      const pen = this.lineMetrics(cycle, 'PENALTY');
      const remaining = roundMoney(rent.remaining + elec.remaining + pen.remaining);
      totalOutstanding = roundMoney(totalOutstanding + remaining);

      const boutiqueId = String(cycle.boutique);
      outstandingByBoutique.set(
        boutiqueId,
        roundMoney((outstandingByBoutique.get(boutiqueId) || 0) + remaining)
      );
    }

    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1, 0, 0, 0, 0);
    const [commissionRows, collectionRows, lowStockAgg, reviewStats, recentReviews, upcomingActivities] =
      await Promise.all([
        BillingTrace.aggregate([
          {
            $match: {
              category: 'COMMISSION',
              action: 'SALE_COMMISSION',
              createdAt: { $gte: periodStart, $lte: periodEnd }
            }
          },
          { $group: { _id: null, total: { $sum: '$paidAmount' } } }
        ]),
        BillingTrace.aggregate([
          {
            $match: {
              category: { $in: ['RENT', 'ELECTRICITY', 'PENALTY'] },
              action: { $in: ['AUTO_DEBIT', 'MANUAL_PAYMENT'] },
              createdAt: { $gte: sixMonthsAgo, $lte: periodEnd }
            }
          },
          {
            $group: {
              _id: {
                year: { $year: '$createdAt' },
                month: { $month: '$createdAt' }
              },
              collected: { $sum: '$paidAmount' }
            }
          },
          { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]),
        Product.aggregate([
          {
            $match: {
              trackStock: true,
              $expr: { $lte: ['$stockQuantity', '$lowStockThreshold'] }
            }
          },
          { $group: { _id: '$boutique', lowStockCount: { $sum: 1 } } },
          { $sort: { lowStockCount: -1 } }
        ]),
        BoutiqueReview.aggregate([
          {
            $group: {
              _id: '$boutique',
              count: { $sum: 1 },
              avgRating: { $avg: '$rating' }
            }
          }
        ]),
        BoutiqueReview.find({})
          .sort({ createdAt: -1 })
          .limit(5)
          .populate('boutique', 'name')
          .populate('user', 'pseudo')
          .lean(),
        Activity.countDocuments({ isPublished: true, eventDate: { $gte: now } })
      ]);

    const topRevenueBoutiques = [...byBoutique.entries()]
      .map(([boutiqueId, value]) => ({
        boutiqueId,
        boutiqueName: boutiqueNameById.get(boutiqueId) || 'Boutique',
        revenue: value.revenue,
        orders: value.orders
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    const topDebtBoutiques = [...outstandingByBoutique.entries()]
      .map(([boutiqueId, debt]) => ({
        boutiqueId,
        boutiqueName: boutiqueNameById.get(boutiqueId) || 'Boutique',
        debt: roundMoney(debt)
      }))
      .sort((a, b) => b.debt - a.debt)
      .slice(0, 5);

    const lowStockByBoutique = lowStockAgg.map((row) => ({
      boutiqueId: String(row._id),
      boutiqueName: boutiqueNameById.get(String(row._id)) || 'Boutique',
      lowStockCount: Number(row.lowStockCount || 0)
    }));

    const lowRatedBoutiques = reviewStats
      .filter((row) => Number(row.count || 0) > 0 && Number(row.avgRating || 0) < 3)
      .map((row) => ({
        boutiqueId: String(row._id),
        boutiqueName: boutiqueNameById.get(String(row._id)) || 'Boutique',
        averageRating: roundMoney(Number(row.avgRating || 0)),
        reviewsCount: Number(row.count || 0)
      }))
      .sort((a, b) => a.averageRating - b.averageRating)
      .slice(0, 5);

    const highRejectionBoutiques = [...byBoutique.entries()]
      .map(([boutiqueId, value]) => ({
        boutiqueId,
        boutiqueName: boutiqueNameById.get(boutiqueId) || 'Boutique',
        rejectionRate: value.orders > 0 ? roundMoney((value.rejected * 100) / value.orders) : 0,
        rejectedOrders: value.rejected,
        orders: value.orders
      }))
      .filter((row) => row.orders >= 5 && row.rejectionRate >= 20)
      .sort((a, b) => b.rejectionRate - a.rejectionRate)
      .slice(0, 5);

    const reviewsCount = reviewStats.reduce((sum, row) => sum + Number(row.count || 0), 0);
    const averageRatingGlobal =
      reviewsCount > 0
        ? roundMoney(
            reviewStats.reduce((sum, row) => sum + Number(row.avgRating || 0) * Number(row.count || 0), 0) /
              reviewsCount
          )
        : 0;

    return {
      period: {
        from: periodStart.toISOString(),
        to: periodEnd.toISOString(),
        days
      },
      kpis: {
        revenueTotal: totalRevenue,
        ordersTotal: totalBoutiqueOrders,
        averageOrderValue,
        deliverySuccessRate: totalBoutiqueOrders > 0 ? roundMoney((delivered * 100) / totalBoutiqueOrders) : 0,
        rejectionRate: totalBoutiqueOrders > 0 ? roundMoney((rejected * 100) / totalBoutiqueOrders) : 0,
        boutiquesTotal: boutiques.length,
        boutiquesActive: boutiques.filter((b) => b.status === 'ACTIVE').length,
        boutiquesSuspended: boutiques.filter((b) => b.status === 'SUSPENDED').length,
        occupiedBoxes,
        availableBoxes: Math.max(0, boxes.length - occupiedBoxes),
        totalOutstanding: roundMoney(totalOutstanding),
        commissionCollected: roundMoney(Number(commissionRows[0]?.total || 0)),
        upcomingActivities
      },
      charts: {
        dailyRevenue: [...dayMap.entries()].map(([date, values]) => ({
          date,
          revenue: values.revenue,
          orders: values.orders
        })),
        statusBreakdown: statusKeys.map((key) => ({
          status: key,
          count: statusGlobal.get(key) || 0
        })),
        monthlyCollections: collectionRows.map((row) => ({
          year: Number(row._id.year),
          month: Number(row._id.month),
          collected: roundMoney(Number(row.collected || 0))
        })),
        floorOccupancy: [...floors.values()].sort((a, b) => a.floor - b.floor)
      },
      rankings: {
        topRevenueBoutiques,
        topDebtBoutiques,
        lowStockByBoutique: lowStockByBoutique.slice(0, 5)
      },
      satisfaction: {
        averageRating: averageRatingGlobal,
        reviewsCount,
        lowRatedBoutiques,
        recentReviews: recentReviews.map((row) => ({
          id: String(row._id),
          boutiqueName: row.boutique?.name || 'Boutique',
          author: row.user?.pseudo || 'Utilisateur',
          rating: Number(row.rating || 0),
          comment: row.comment || '',
          createdAt: row.createdAt
        }))
      },
      alerts: {
        highRejectionBoutiques,
        lowStockBoutiques: lowStockByBoutique.filter((row) => row.lowStockCount > 0).slice(0, 5)
      }
    };
  }

  async listAdminTraces(query = {}) {
    const where = {};
    const hasMonthYearFilter = query.month !== undefined || query.year !== undefined;
    const hasDateFilter = !!query.fromDate || !!query.toDate;

    if (hasMonthYearFilter) {
      const parsed = parseMonthYear(query);
      where.month = parsed.month;
      where.year = parsed.year;
    }

    if (hasDateFilter) {
      where.createdAt = {};
      if (query.fromDate) {
        const from = this.parseDateBoundary(query.fromDate, false);
        if (from) where.createdAt.$gte = from;
      }
      if (query.toDate) {
        const to = this.parseDateBoundary(query.toDate, true);
        if (to) where.createdAt.$lte = to;
      }
      if (!where.createdAt.$gte && !where.createdAt.$lte) {
        delete where.createdAt;
      }
    }

    if (!hasMonthYearFilter && !hasDateFilter) {
      const parsed = parseMonthYear({});
      where.month = parsed.month;
      where.year = parsed.year;
    }

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
