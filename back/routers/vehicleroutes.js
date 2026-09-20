const express = require('express');
const router = express.Router();
const vehicleController = require('../controllers/vehiclecontroller');
const { protect } = require('../middleware/authmiddleware');

router.use(protect);

// Create a new vehicle
router.post('/', vehicleController.createVehicle);

// Get all vehicles
router.get('/', vehicleController.getVehicles);

// Get a vehicle by ID
router.get('/:id', vehicleController.getVehicleById);

// Update a vehicle by ID
router.put('/:id', vehicleController.updateVehicle);

// Delete a vehicle by ID
router.delete('/:id', vehicleController.deleteVehicle);

module.exports = router;
