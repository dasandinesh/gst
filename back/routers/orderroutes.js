const router = require('express').Router();
const controller = require('../controllers/ordercontroller');

router.route('/').post(controller.createOrder).get(controller.getOrders);
// Must come before '/:id' so it isn't swallowed by the id route.
router.get('/product-names', controller.getOrderedProductNames);
router.route('/:id').get(controller.getOrderById).put(controller.updateOrder).delete(controller.deleteOrder);

module.exports = router;
