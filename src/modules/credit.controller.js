const creditService = require("./credit.service");

class CreditController {
  /*async generate(req, res, next) {
    try {
      const { value, quantity } = req.body;
      const adminId = req.user.id;

      const credits = await creditService.generateCredits(
        adminId,
        value,
        quantity
      );

      res.status(201).json({
        success: true,
        data: credits
      });
    } catch (error) {
      next(error);
    }
  }*/

 async generate(req, res, next) {
    try {
        const { value, quantity, adminId } = req.body;
    
        if (!adminId) {
        return res.status(400).json({
            success: false,
            message: "adminId is required"
        });
        }
    
        const credits = await creditService.generateCredits(
        adminId,
        value,
        quantity
        );
    
        res.status(201).json({
        success: true,
        data: credits
        });
    
    } catch (error) {
        next(error);
    }
 }
      

  async print(req, res, next) {
    try {
      const credit = await creditService.markAsPrinted(req.params.id);

      res.json({ success: true, data: credit });
    } catch (error) {
      next(error);
    }
  }

  async use(req, res, next) {
    try {
      const { code } = req.body;
      const userId = req.user.id;

      const credit = await creditService.useCredit(code, userId);

      res.json({ success: true, data: credit });
    } catch (error) {
      next(error);
    }
  }

  async list(req, res, next) {
    try {
      const credits = await creditService.getAll();
      res.json({ success: true, data: credits });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new CreditController();
