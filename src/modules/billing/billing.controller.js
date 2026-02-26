const billingService = require('./billing.service');

class BillingController {
  async uploadElectricityInvoices(req, res, next) {
    try {
      const result = await billingService.uploadElectricityInvoices(
        req.user.id,
        req.files,
        req.body.month,
        req.body.year
      );
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }

  async getMyBillingSummary(req, res, next) {
    try {
      const result = await billingService.getMyBillingSummary(req.user.id, req.query);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async listMyInvoices(req, res, next) {
    try {
      const result = await billingService.listMyInvoices(req.user.id, req.query);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async getMyInvoiceById(req, res, next) {
    try {
      const invoice = await billingService.getMyInvoiceById(req.user.id, req.params.id);
      if (!invoice) {
        return res.status(404).json({ message: 'Facture introuvable' });
      }
      res.json(invoice);
    } catch (error) {
      next(error);
    }
  }

  async payRentNow(req, res, next) {
    try {
      const result = await billingService.payLineNow({
        userId: req.user.id,
        query: req.query,
        category: 'RENT',
        amount: req.body?.amount
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async payElectricityNow(req, res, next) {
    try {
      const result = await billingService.payLineNow({
        userId: req.user.id,
        query: req.query,
        category: 'ELECTRICITY',
        amount: req.body?.amount
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async listMyTraces(req, res, next) {
    try {
      const traces = await billingService.listMyTraces(req.user.id, req.query);
      res.json(traces);
    } catch (error) {
      next(error);
    }
  }

  async listAdminTraces(req, res, next) {
    try {
      const traces = await billingService.listAdminTraces(req.query);
      res.json(traces);
    } catch (error) {
      next(error);
    }
  }

  async listAdminBoutiqueSummary(req, res, next) {
    try {
      const result = await billingService.listAdminBoutiqueMonthlySummary(req.query);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new BillingController();
