const express = require('express');
const router = express.Router();
const creditNoteController = require('../controllers/creditnotecontroller');

// Look up an original GST bill by number, to pre-fill a new credit note — must come
// before /:id so "find-original-bill" isn't swallowed by the :id param route.
router.get('/find-original-bill', creditNoteController.findOriginalBill);

router.post('/', creditNoteController.createCreditNote);
router.get('/', creditNoteController.getCreditNotes);
router.get('/:id', creditNoteController.getCreditNoteById);
router.put('/:id', creditNoteController.updateCreditNote);
router.delete('/:id', creditNoteController.deleteCreditNote);

module.exports = router;
