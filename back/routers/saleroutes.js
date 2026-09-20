const router = require('express').Router();
const controller = require('../controllers/salecontroller');
const { protect } = require('../middleware/authmiddleware');

router.use(protect);

router.route('/').post(controller.createSale).get(controller.getSales);
// Must come before '/:id' so it isn't swallowed by the id route.
router.get('/product-names', controller.getSoldProductNames);
router.route('/:id').get(controller.getSaleById).put(controller.updateSale).delete(controller.deleteSale);

module.exports = router;
