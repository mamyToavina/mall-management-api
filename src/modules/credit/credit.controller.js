const creditService = require("./credit.service");
const { CreditServiceError } = require("./credit.service");

const sendError = (res, error) => {
  const isKnown = error instanceof CreditServiceError;
  const status = isKnown ? error.status : 500;
  const code = isKnown ? error.code : "INTERNAL_ERROR";

  return res.status(status).json({
    success: false,
    code,
    message: error.message || "Internal server error"
  });
};

class CreditController {
  async generate(req, res) {
    try {
      const { value, quantity } = req.body;
      const credits = await creditService.generateCredits({
        adminId: req.user.id,
        value,
        quantity,
        actorRole: req.user.role,
        ip: req.ip,
        userAgent: req.headers["user-agent"] || null
      });

      res.status(201).json({ success: true, data: credits });
    } catch (error) {
      sendError(res, error);
    }
  }

  async print(req, res) {
    try {
      const credit = await creditService.markAsPrinted({
        id: req.params.id,
        adminId: req.user.id,
        actorRole: req.user.role,
        ip: req.ip,
        userAgent: req.headers["user-agent"] || null
      });

      res.json({ success: true, data: credit });
    } catch (error) {
      sendError(res, error);
    }
  }

  async use(req, res) {
    try {
      const result = await creditService.useCredit({
        code: req.body.code,
        userId: req.user.id,
        idempotencyKey: req.headers["idempotency-key"],
        actorRole: req.user.role,
        ip: req.ip,
        userAgent: req.headers["user-agent"] || null
      });

      res.json({ success: true, data: result });
    } catch (error) {
      sendError(res, error);
    }
  }

  async list(req, res) {
    try {
      const result = await creditService.getAll({
        query: req.query,
        actorId: req.user.id,
        actorRole: req.user.role,
        ip: req.ip,
        userAgent: req.headers["user-agent"] || null
      });

      res.json({ success: true, ...result });
    } catch (error) {
      sendError(res, error);
    }
  }

  async stats(req, res) {
    try {
      const result = await creditService.getStats({
        query: req.query,
        actorId: req.user.id,
        actorRole: req.user.role,
        ip: req.ip,
        userAgent: req.headers["user-agent"] || null
      });

      res.json({ success: true, data: result });
    } catch (error) {
      sendError(res, error);
    }
  }

  async myHistory(req, res) {
    try {
      const result = await creditService.getMyHistory({
        userId: req.user.id,
        query: req.query,
        actorId: req.user.id,
        actorRole: req.user.role,
        ip: req.ip,
        userAgent: req.headers["user-agent"] || null
      });

      res.json({ success: true, ...result });
    } catch (error) {
      sendError(res, error);
    }
  }
}

module.exports = new CreditController();
