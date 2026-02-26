const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const controller = require('./billing.controller');
const { protect } = require('../../middlewares/auth.middleware');
const { authorize } = require('../../middlewares/role.middleware');

const router = express.Router();

const invoicesDir = path.join(process.cwd(), 'uploads', 'invoices');
if (!fs.existsSync(invoicesDir)) {
  fs.mkdirSync(invoicesDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, invoicesDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '.pdf').toLowerCase() || '.pdf';
    const id = crypto.randomBytes(12).toString('hex');
    cb(null, `${Date.now()}-${id}${ext}`);
  }
});

const uploadPdf = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const isPdfMime = file.mimetype === 'application/pdf';
    const isPdfExt = path.extname(file.originalname || '').toLowerCase() === '.pdf';
    if (!isPdfMime && !isPdfExt) {
      return cb(new Error('Seuls les fichiers PDF sont autorises'));
    }
    cb(null, true);
  }
});

router.post(
  '/admin/electricity-invoices/upload',
  protect,
  authorize('ADMIN'),
  uploadPdf.array('invoices', 50),
  controller.uploadElectricityInvoices
);

router.get(
  '/boutique/summary',
  protect,
  authorize('BOUTIQUE'),
  controller.getMyBillingSummary
);

router.post(
  '/boutique/pay/rent',
  protect,
  authorize('BOUTIQUE'),
  controller.payRentNow
);

router.post(
  '/boutique/pay/electricity',
  protect,
  authorize('BOUTIQUE'),
  controller.payElectricityNow
);

router.get(
  '/boutique/invoices',
  protect,
  authorize('BOUTIQUE'),
  controller.listMyInvoices
);

router.get(
  '/boutique/invoices/:id',
  protect,
  authorize('BOUTIQUE'),
  controller.getMyInvoiceById
);

router.get(
  '/boutique/traces',
  protect,
  authorize('BOUTIQUE'),
  controller.listMyTraces
);

router.get(
  '/admin/traces',
  protect,
  authorize('ADMIN'),
  controller.listAdminTraces
);

router.get(
  '/admin/dashboard',
  protect,
  authorize('ADMIN'),
  controller.getAdminDashboard
);

router.get(
  '/admin/boutiques-summary',
  protect,
  authorize('ADMIN'),
  controller.listAdminBoutiqueSummary
);

module.exports = router;
