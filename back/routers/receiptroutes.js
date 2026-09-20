const router = require('express').Router();
const controller = require('../controllers/receiptcontroller');
const { protect } = require('../middleware/authmiddleware');

router.use(protect);

router.route('/').post(controller.createReceipt).get(controller.getReceipts);
router.route('/:id').get(controller.getReceiptById).put(controller.updateReceipt).delete(controller.deleteReceipt);

module.exports = router;
