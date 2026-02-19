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
}

module.exports = new BillingController();
