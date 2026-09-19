const express = require('express');
const router = express.Router();
const debitNoteController = require('../controllers/debitnotecontroller');

// Look up an original purchase bill by number, to pre-fill a new debit note — must
// come before /:id so "find-original-bill" isn't swallowed by the :id param route.
router.get('/find-original-bill', debitNoteController.findOriginalBill);

router.post('/', debitNoteController.createDebitNote);
router.get('/', debitNoteController.getDebitNotes);
router.get('/:id', debitNoteController.getDebitNoteById);
router.put('/:id', debitNoteController.updateDebitNote);
router.delete('/:id', debitNoteController.deleteDebitNote);

module.exports = router;
