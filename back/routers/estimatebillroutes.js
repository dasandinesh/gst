const express = require('express');
const router = express.Router();
const estimateBillController = require('../controllers/estimatebillcontroller');
const { protect } = require('../middleware/authmiddleware');

router.use(protect);

router.post('/', estimateBillController.createEstimateBill);
router.get('/', estimateBillController.getEstimateBills);
router.get('/:id', estimateBillController.getEstimateBillById);
router.put('/:id', estimateBillController.updateEstimateBill);
router.delete('/:id', estimateBillController.deleteEstimateBill);

module.exports = router;
