const saleService = require("./sale.service");
const { SaleServiceError } = require("./sale.service");

const sendError = (res, error) => {
  const isKnown = error instanceof SaleServiceError;
  const status = isKnown ? error.status : 500;
  const code = isKnown ? error.code : "INTERNAL_ERROR";

  return res.status(status).json({
    success: false,
    code,
    message: error.message || "Internal server error"
  });
};

class SaleController {
  async checkout(req, res) {
    try {
      const result = await saleService.checkout({
        userId: req.user.id,
        items: req.body.items,
        deliveryCapacityPolicy: req.body.deliveryCapacityPolicy,
        pickupLocation: req.body.pickupLocation,
        contactPhone: req.body.contactPhone,
        idempotencyKey: req.headers["idempotency-key"]
      });

      res.status(result.replayed ? 200 : 201).json({
        success: true,
        replayed: result.replayed,
        data: result.sale
      });
    } catch (error) {
      sendError(res, error);
    }
  }

  async listMine(req, res) {
    try {
      const result = await saleService.listMine({
        userId: req.user.id,
        page: req.query.page,
        limit: req.query.limit
      });

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      sendError(res, error);
    }
  }

  async getMineById(req, res) {
    try {
      const sale = await saleService.getMineById({
        userId: req.user.id,
        saleId: req.params.id
      });

      if (!sale) {
        return res.status(404).json({
          success: false,
          code: "SALE_NOT_FOUND",
          message: "Vente introuvable"
        });
      }

      res.json({
        success: true,
        data: sale
      });
    } catch (error) {
      sendError(res, error);
    }
  }

  async listForBoutique(req, res) {
    try {
      const result = await saleService.listForBoutique({
        userId: req.user.id,
        role: req.user.role,
        boutiqueId: req.query.boutiqueId,
        page: req.query.page,
        limit: req.query.limit,
        status: req.query.status
      });

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      sendError(res, error);
    }
  }

  async getForBoutiqueById(req, res) {
    try {
      const result = await saleService.getForBoutiqueById({
        userId: req.user.id,
        role: req.user.role,
        saleId: req.params.id,
        boutiqueId: req.query.boutiqueId
      });

      if (!result) {
        return res.status(404).json({
          success: false,
          code: "SALE_NOT_FOUND",
          message: "Commande introuvable"
        });
      }

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      sendError(res, error);
    }
  }

  async updateBoutiqueOrder(req, res) {
    try {
      const result = await saleService.updateBoutiqueOrderStatus({
        userId: req.user.id,
        role: req.user.role,
        saleId: req.params.id,
        fulfillmentStatus: req.body.fulfillmentStatus,
        fulfillmentNote: req.body.fulfillmentNote,
        deliveryDate: req.body.deliveryDate,
        boutiqueId: req.body.boutiqueId || req.query.boutiqueId
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      sendError(res, error);
    }
  }
}

module.exports = new SaleController();
