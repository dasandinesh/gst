const router = require('express').Router();
const controller = require('../controllers/paymentcontroller');
const { protect } = require('../middleware/authmiddleware');

router.use(protect);

router.route('/').post(controller.createPayment).get(controller.getPayments);
router.route('/:id').get(controller.getPaymentById).put(controller.updatePayment).delete(controller.deletePayment);

module.exports = router;
