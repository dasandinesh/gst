const express = require('express');
const router = express.Router();
const buyerPoController = require('../controllers/buyerpocontroller');
const { protect } = require('../middleware/authmiddleware');

router.use(protect);

router.post('/', buyerPoController.createPo);
router.get('/', buyerPoController.getPos);
router.get('/:id', buyerPoController.getPoById);
router.put('/:id', buyerPoController.updatePo);
router.put('/:id/status', buyerPoController.updateStatus);
router.put('/:id/mark-billed', buyerPoController.markBilled);
router.delete('/:id', buyerPoController.deletePo);

module.exports = router;
